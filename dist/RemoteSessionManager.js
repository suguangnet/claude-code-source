"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemoteSessionManager = void 0;
exports.createRemoteSessionConfig = createRemoteSessionConfig;
const debug_js_1 = require("../utils/debug.js");
const log_js_1 = require("../utils/log.js");
const api_js_1 = require("../utils/teleport/api.js");
const SessionsWebSocket_js_1 = require("./SessionsWebSocket.js");
/**
 * Type guard to check if a message is an SDKMessage (not a control message)
 */
function isSDKMessage(message) {
    return (message.type !== 'control_request' &&
        message.type !== 'control_response' &&
        message.type !== 'control_cancel_request');
}
/**
 * Manages a remote CCR session.
 *
 * Coordinates:
 * - WebSocket subscription for receiving messages from CCR
 * - HTTP POST for sending user messages to CCR
 * - Permission request/response flow
 */
class RemoteSessionManager {
    constructor(config, callbacks) {
        this.config = config;
        this.callbacks = callbacks;
        this.websocket = null;
        this.pendingPermissionRequests = new Map();
    }
    /**
     * Connect to the remote session via WebSocket
     */
    connect() {
        (0, debug_js_1.logForDebugging)(`[RemoteSessionManager] Connecting to session ${this.config.sessionId}`);
        const wsCallbacks = {
            onMessage: message => this.handleMessage(message),
            onConnected: () => {
                (0, debug_js_1.logForDebugging)('[RemoteSessionManager] Connected');
                this.callbacks.onConnected?.();
            },
            onClose: () => {
                (0, debug_js_1.logForDebugging)('[RemoteSessionManager] Disconnected');
                this.callbacks.onDisconnected?.();
            },
            onReconnecting: () => {
                (0, debug_js_1.logForDebugging)('[RemoteSessionManager] Reconnecting');
                this.callbacks.onReconnecting?.();
            },
            onError: error => {
                (0, log_js_1.logError)(error);
                this.callbacks.onError?.(error);
            },
        };
        this.websocket = new SessionsWebSocket_js_1.SessionsWebSocket(this.config.sessionId, this.config.orgUuid, this.config.getAccessToken, wsCallbacks);
        void this.websocket.connect();
    }
    /**
     * Handle messages from WebSocket
     */
    handleMessage(message) {
        // Handle control requests (permission prompts from CCR)
        if (message.type === 'control_request') {
            this.handleControlRequest(message);
            return;
        }
        // Handle control cancel requests (server cancelling a pending permission prompt)
        if (message.type === 'control_cancel_request') {
            const { request_id } = message;
            const pendingRequest = this.pendingPermissionRequests.get(request_id);
            (0, debug_js_1.logForDebugging)(`[RemoteSessionManager] Permission request cancelled: ${request_id}`);
            this.pendingPermissionRequests.delete(request_id);
            this.callbacks.onPermissionCancelled?.(request_id, pendingRequest?.tool_use_id);
            return;
        }
        // Handle control responses (acknowledgments)
        if (message.type === 'control_response') {
            (0, debug_js_1.logForDebugging)('[RemoteSessionManager] Received control response');
            return;
        }
        // Forward SDK messages to callback (type guard ensures proper narrowing)
        if (isSDKMessage(message)) {
            this.callbacks.onMessage(message);
        }
    }
    /**
     * Handle control requests from CCR (e.g., permission requests)
     */
    handleControlRequest(request) {
        const { request_id, request: inner } = request;
        if (inner.subtype === 'can_use_tool') {
            (0, debug_js_1.logForDebugging)(`[RemoteSessionManager] Permission request for tool: ${inner.tool_name}`);
            this.pendingPermissionRequests.set(request_id, inner);
            this.callbacks.onPermissionRequest(inner, request_id);
        }
        else {
            // Send an error response for unrecognized subtypes so the server
            // doesn't hang waiting for a reply that never comes.
            (0, debug_js_1.logForDebugging)(`[RemoteSessionManager] Unsupported control request subtype: ${inner.subtype}`);
            const response = {
                type: 'control_response',
                response: {
                    subtype: 'error',
                    request_id,
                    error: `Unsupported control request subtype: ${inner.subtype}`,
                },
            };
            this.websocket?.sendControlResponse(response);
        }
    }
    /**
     * Send a user message to the remote session via HTTP POST
     */
    async sendMessage(content, opts) {
        (0, debug_js_1.logForDebugging)(`[RemoteSessionManager] Sending message to session ${this.config.sessionId}`);
        const success = await (0, api_js_1.sendEventToRemoteSession)(this.config.sessionId, content, opts);
        if (!success) {
            (0, log_js_1.logError)(new Error(`[RemoteSessionManager] Failed to send message to session ${this.config.sessionId}`));
        }
        return success;
    }
    /**
     * Respond to a permission request from CCR
     */
    respondToPermissionRequest(requestId, result) {
        const pendingRequest = this.pendingPermissionRequests.get(requestId);
        if (!pendingRequest) {
            (0, log_js_1.logError)(new Error(`[RemoteSessionManager] No pending permission request with ID: ${requestId}`));
            return;
        }
        this.pendingPermissionRequests.delete(requestId);
        const response = {
            type: 'control_response',
            response: {
                subtype: 'success',
                request_id: requestId,
                response: {
                    behavior: result.behavior,
                    ...(result.behavior === 'allow'
                        ? { updatedInput: result.updatedInput }
                        : { message: result.message }),
                },
            },
        };
        (0, debug_js_1.logForDebugging)(`[RemoteSessionManager] Sending permission response: ${result.behavior}`);
        this.websocket?.sendControlResponse(response);
    }
    /**
     * Check if connected to the remote session
     */
    isConnected() {
        return this.websocket?.isConnected() ?? false;
    }
    /**
     * Send an interrupt signal to cancel the current request on the remote session
     */
    cancelSession() {
        (0, debug_js_1.logForDebugging)('[RemoteSessionManager] Sending interrupt signal');
        this.websocket?.sendControlRequest({ subtype: 'interrupt' });
    }
    /**
     * Get the session ID
     */
    getSessionId() {
        return this.config.sessionId;
    }
    /**
     * Disconnect from the remote session
     */
    disconnect() {
        (0, debug_js_1.logForDebugging)('[RemoteSessionManager] Disconnecting');
        this.websocket?.close();
        this.websocket = null;
        this.pendingPermissionRequests.clear();
    }
    /**
     * Force reconnect the WebSocket.
     * Useful when the subscription becomes stale after container shutdown.
     */
    reconnect() {
        (0, debug_js_1.logForDebugging)('[RemoteSessionManager] Reconnecting WebSocket');
        this.websocket?.reconnect();
    }
}
exports.RemoteSessionManager = RemoteSessionManager;
/**
 * Create a remote session config from OAuth tokens
 */
function createRemoteSessionConfig(sessionId, getAccessToken, orgUuid, hasInitialPrompt = false, viewerOnly = false) {
    return {
        sessionId,
        getAccessToken,
        orgUuid,
        hasInitialPrompt,
        viewerOnly,
    };
}
