"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionsWebSocket = void 0;
const crypto_1 = require("crypto");
const oauth_js_1 = require("../constants/oauth.js");
const debug_js_1 = require("../utils/debug.js");
const errors_js_1 = require("../utils/errors.js");
const log_js_1 = require("../utils/log.js");
const mtls_js_1 = require("../utils/mtls.js");
const proxy_js_1 = require("../utils/proxy.js");
const slowOperations_js_1 = require("../utils/slowOperations.js");
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 5;
const PING_INTERVAL_MS = 30000;
/**
 * Maximum retries for 4001 (session not found). During compaction the
 * server may briefly consider the session stale; a short retry window
 * lets the client recover without giving up permanently.
 */
const MAX_SESSION_NOT_FOUND_RETRIES = 3;
/**
 * WebSocket close codes that indicate a permanent server-side rejection.
 * The client stops reconnecting immediately.
 * Note: 4001 (session not found) is handled separately with limited
 * retries since it can be transient during compaction.
 */
const PERMANENT_CLOSE_CODES = new Set([
    4003, // unauthorized
]);
function isSessionsMessage(value) {
    if (typeof value !== 'object' || value === null || !('type' in value)) {
        return false;
    }
    // Accept any message with a string `type` field. Downstream handlers
    // (sdkMessageAdapter, RemoteSessionManager) decide what to do with
    // unknown types. A hardcoded allowlist here would silently drop new
    // message types the backend starts sending before the client is updated.
    return typeof value.type === 'string';
}
/**
 * WebSocket client for connecting to CCR sessions via /v1/sessions/ws/{id}/subscribe
 *
 * Protocol:
 * 1. Connect to wss://api.anthropic.com/v1/sessions/ws/{sessionId}/subscribe?organization_uuid=...
 * 2. Send auth message: { type: 'auth', credential: { type: 'oauth', token: '...' } }
 * 3. Receive SDKMessage stream from the session
 */
class SessionsWebSocket {
    constructor(sessionId, orgUuid, getAccessToken, callbacks) {
        this.sessionId = sessionId;
        this.orgUuid = orgUuid;
        this.getAccessToken = getAccessToken;
        this.callbacks = callbacks;
        this.ws = null;
        this.state = 'closed';
        this.reconnectAttempts = 0;
        this.sessionNotFoundRetries = 0;
        this.pingInterval = null;
        this.reconnectTimer = null;
    }
    /**
     * Connect to the sessions WebSocket endpoint
     */
    async connect() {
        if (this.state === 'connecting') {
            (0, debug_js_1.logForDebugging)('[SessionsWebSocket] Already connecting');
            return;
        }
        this.state = 'connecting';
        const baseUrl = (0, oauth_js_1.getOauthConfig)().BASE_API_URL.replace('https://', 'wss://');
        const url = `${baseUrl}/v1/sessions/ws/${this.sessionId}/subscribe?organization_uuid=${this.orgUuid}`;
        (0, debug_js_1.logForDebugging)(`[SessionsWebSocket] Connecting to ${url}`);
        // Get fresh token for each connection attempt
        const accessToken = this.getAccessToken();
        const headers = {
            Authorization: `Bearer ${accessToken}`,
            'anthropic-version': '2023-06-01',
        };
        if (typeof Bun !== 'undefined') {
            // Bun's WebSocket supports headers/proxy options but the DOM typings don't
            // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
            const ws = new globalThis.WebSocket(url, {
                headers,
                proxy: (0, proxy_js_1.getWebSocketProxyUrl)(url),
                tls: (0, mtls_js_1.getWebSocketTLSOptions)() || undefined,
            });
            this.ws = ws;
            ws.addEventListener('open', () => {
                (0, debug_js_1.logForDebugging)('[SessionsWebSocket] Connection opened, authenticated via headers');
                this.state = 'connected';
                this.reconnectAttempts = 0;
                this.sessionNotFoundRetries = 0;
                this.startPingInterval();
                this.callbacks.onConnected?.();
            });
            ws.addEventListener('message', (event) => {
                const data = typeof event.data === 'string' ? event.data : String(event.data);
                this.handleMessage(data);
            });
            ws.addEventListener('error', () => {
                const err = new Error('[SessionsWebSocket] WebSocket error');
                (0, log_js_1.logError)(err);
                this.callbacks.onError?.(err);
            });
            // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
            ws.addEventListener('close', (event) => {
                (0, debug_js_1.logForDebugging)(`[SessionsWebSocket] Closed: code=${event.code} reason=${event.reason}`);
                this.handleClose(event.code);
            });
            ws.addEventListener('pong', () => {
                (0, debug_js_1.logForDebugging)('[SessionsWebSocket] Pong received');
            });
        }
        else {
            const { default: WS } = await Promise.resolve().then(() => __importStar(require('ws')));
            const ws = new WS(url, {
                headers,
                agent: (0, proxy_js_1.getWebSocketProxyAgent)(url),
                ...(0, mtls_js_1.getWebSocketTLSOptions)(),
            });
            this.ws = ws;
            ws.on('open', () => {
                (0, debug_js_1.logForDebugging)('[SessionsWebSocket] Connection opened, authenticated via headers');
                // Auth is handled via headers, so we're immediately connected
                this.state = 'connected';
                this.reconnectAttempts = 0;
                this.sessionNotFoundRetries = 0;
                this.startPingInterval();
                this.callbacks.onConnected?.();
            });
            ws.on('message', (data) => {
                this.handleMessage(data.toString());
            });
            ws.on('error', (err) => {
                (0, log_js_1.logError)(new Error(`[SessionsWebSocket] Error: ${err.message}`));
                this.callbacks.onError?.(err);
            });
            ws.on('close', (code, reason) => {
                (0, debug_js_1.logForDebugging)(`[SessionsWebSocket] Closed: code=${code} reason=${reason.toString()}`);
                this.handleClose(code);
            });
            ws.on('pong', () => {
                (0, debug_js_1.logForDebugging)('[SessionsWebSocket] Pong received');
            });
        }
    }
    /**
     * Handle incoming WebSocket message
     */
    handleMessage(data) {
        try {
            const message = (0, slowOperations_js_1.jsonParse)(data);
            // Forward SDK messages to callback
            if (isSessionsMessage(message)) {
                this.callbacks.onMessage(message);
            }
            else {
                (0, debug_js_1.logForDebugging)(`[SessionsWebSocket] Ignoring message type: ${typeof message === 'object' && message !== null && 'type' in message ? String(message.type) : 'unknown'}`);
            }
        }
        catch (error) {
            (0, log_js_1.logError)(new Error(`[SessionsWebSocket] Failed to parse message: ${(0, errors_js_1.errorMessage)(error)}`));
        }
    }
    /**
     * Handle WebSocket close
     */
    handleClose(closeCode) {
        this.stopPingInterval();
        if (this.state === 'closed') {
            return;
        }
        this.ws = null;
        const previousState = this.state;
        this.state = 'closed';
        // Permanent codes: stop reconnecting — server has definitively ended the session
        if (PERMANENT_CLOSE_CODES.has(closeCode)) {
            (0, debug_js_1.logForDebugging)(`[SessionsWebSocket] Permanent close code ${closeCode}, not reconnecting`);
            this.callbacks.onClose?.();
            return;
        }
        // 4001 (session not found) can be transient during compaction: the
        // server may briefly consider the session stale while the CLI worker
        // is busy with the compaction API call and not emitting events.
        if (closeCode === 4001) {
            this.sessionNotFoundRetries++;
            if (this.sessionNotFoundRetries > MAX_SESSION_NOT_FOUND_RETRIES) {
                (0, debug_js_1.logForDebugging)(`[SessionsWebSocket] 4001 retry budget exhausted (${MAX_SESSION_NOT_FOUND_RETRIES}), not reconnecting`);
                this.callbacks.onClose?.();
                return;
            }
            this.scheduleReconnect(RECONNECT_DELAY_MS * this.sessionNotFoundRetries, `4001 attempt ${this.sessionNotFoundRetries}/${MAX_SESSION_NOT_FOUND_RETRIES}`);
            return;
        }
        // Attempt reconnection if we were connected
        if (previousState === 'connected' &&
            this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            this.reconnectAttempts++;
            this.scheduleReconnect(RECONNECT_DELAY_MS, `attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
        }
        else {
            (0, debug_js_1.logForDebugging)('[SessionsWebSocket] Not reconnecting');
            this.callbacks.onClose?.();
        }
    }
    scheduleReconnect(delay, label) {
        this.callbacks.onReconnecting?.();
        (0, debug_js_1.logForDebugging)(`[SessionsWebSocket] Scheduling reconnect (${label}) in ${delay}ms`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            void this.connect();
        }, delay);
    }
    startPingInterval() {
        this.stopPingInterval();
        this.pingInterval = setInterval(() => {
            if (this.ws && this.state === 'connected') {
                try {
                    this.ws.ping?.();
                }
                catch {
                    // Ignore ping errors, close handler will deal with connection issues
                }
            }
        }, PING_INTERVAL_MS);
    }
    /**
     * Stop ping interval
     */
    stopPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }
    /**
     * Send a control response back to the session
     */
    sendControlResponse(response) {
        if (!this.ws || this.state !== 'connected') {
            (0, log_js_1.logError)(new Error('[SessionsWebSocket] Cannot send: not connected'));
            return;
        }
        (0, debug_js_1.logForDebugging)('[SessionsWebSocket] Sending control response');
        this.ws.send((0, slowOperations_js_1.jsonStringify)(response));
    }
    /**
     * Send a control request to the session (e.g., interrupt)
     */
    sendControlRequest(request) {
        if (!this.ws || this.state !== 'connected') {
            (0, log_js_1.logError)(new Error('[SessionsWebSocket] Cannot send: not connected'));
            return;
        }
        const controlRequest = {
            type: 'control_request',
            request_id: (0, crypto_1.randomUUID)(),
            request,
        };
        (0, debug_js_1.logForDebugging)(`[SessionsWebSocket] Sending control request: ${request.subtype}`);
        this.ws.send((0, slowOperations_js_1.jsonStringify)(controlRequest));
    }
    /**
     * Check if connected
     */
    isConnected() {
        return this.state === 'connected';
    }
    /**
     * Close the WebSocket connection
     */
    close() {
        (0, debug_js_1.logForDebugging)('[SessionsWebSocket] Closing connection');
        this.state = 'closed';
        this.stopPingInterval();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            // Null out event handlers to prevent race conditions during reconnect.
            // Under Bun (native WebSocket), onX handlers are the clean way to detach.
            // Under Node (ws package), the listeners were attached with .on() in connect(),
            // but since we're about to close and null out this.ws, no cleanup is needed.
            this.ws.close();
            this.ws = null;
        }
    }
    /**
     * Force reconnect - closes existing connection and establishes a new one.
     * Useful when the subscription becomes stale (e.g., after container shutdown).
     */
    reconnect() {
        (0, debug_js_1.logForDebugging)('[SessionsWebSocket] Force reconnecting');
        this.reconnectAttempts = 0;
        this.sessionNotFoundRetries = 0;
        this.close();
        // Small delay before reconnecting (stored in reconnectTimer so it can be cancelled)
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            void this.connect();
        }, 500);
    }
}
exports.SessionsWebSocket = SessionsWebSocket;
