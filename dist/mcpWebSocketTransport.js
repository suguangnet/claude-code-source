"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketTransport = void 0;
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const diagLogs_js_1 = require("./diagLogs.js");
const errors_js_1 = require("./errors.js");
const slowOperations_js_1 = require("./slowOperations.js");
// WebSocket readyState constants (same for both native and ws)
const WS_CONNECTING = 0;
const WS_OPEN = 1;
class WebSocketTransport {
    constructor(ws) {
        this.ws = ws;
        this.started = false;
        this.isBun = typeof Bun !== 'undefined';
        // Bun (native WebSocket) event handlers
        this.onBunMessage = (event) => {
            try {
                const data = typeof event.data === 'string' ? event.data : String(event.data);
                const messageObj = (0, slowOperations_js_1.jsonParse)(data);
                const message = types_js_1.JSONRPCMessageSchema.parse(messageObj);
                this.onmessage?.(message);
            }
            catch (error) {
                this.handleError(error);
            }
        };
        this.onBunError = () => {
            this.handleError(new Error('WebSocket error'));
        };
        this.onBunClose = () => {
            this.handleCloseCleanup();
        };
        // Node (ws package) event handlers
        this.onNodeMessage = (data) => {
            try {
                const messageObj = (0, slowOperations_js_1.jsonParse)(data.toString('utf-8'));
                const message = types_js_1.JSONRPCMessageSchema.parse(messageObj);
                this.onmessage?.(message);
            }
            catch (error) {
                this.handleError(error);
            }
        };
        this.onNodeError = (error) => {
            this.handleError(error);
        };
        this.onNodeClose = () => {
            this.handleCloseCleanup();
        };
        this.opened = new Promise((resolve, reject) => {
            if (this.ws.readyState === WS_OPEN) {
                resolve();
            }
            else if (this.isBun) {
                const nws = this.ws;
                const onOpen = () => {
                    nws.removeEventListener('open', onOpen);
                    nws.removeEventListener('error', onError);
                    resolve();
                };
                const onError = (event) => {
                    nws.removeEventListener('open', onOpen);
                    nws.removeEventListener('error', onError);
                    (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'mcp_websocket_connect_fail');
                    reject(event);
                };
                nws.addEventListener('open', onOpen);
                nws.addEventListener('error', onError);
            }
            else {
                const nws = this.ws;
                nws.on('open', () => {
                    resolve();
                });
                nws.on('error', error => {
                    (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'mcp_websocket_connect_fail');
                    reject(error);
                });
            }
        });
        // Attach persistent event handlers
        if (this.isBun) {
            const nws = this.ws;
            nws.addEventListener('message', this.onBunMessage);
            nws.addEventListener('error', this.onBunError);
            nws.addEventListener('close', this.onBunClose);
        }
        else {
            const nws = this.ws;
            nws.on('message', this.onNodeMessage);
            nws.on('error', this.onNodeError);
            nws.on('close', this.onNodeClose);
        }
    }
    // Shared error handler
    handleError(error) {
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'mcp_websocket_message_fail');
        this.onerror?.((0, errors_js_1.toError)(error));
    }
    // Shared close handler with listener cleanup
    handleCloseCleanup() {
        this.onclose?.();
        // Clean up listeners after close
        if (this.isBun) {
            const nws = this.ws;
            nws.removeEventListener('message', this.onBunMessage);
            nws.removeEventListener('error', this.onBunError);
            nws.removeEventListener('close', this.onBunClose);
        }
        else {
            const nws = this.ws;
            nws.off('message', this.onNodeMessage);
            nws.off('error', this.onNodeError);
            nws.off('close', this.onNodeClose);
        }
    }
    /**
     * Starts listening for messages on the WebSocket.
     */
    async start() {
        if (this.started) {
            throw new Error('Start can only be called once per transport.');
        }
        await this.opened;
        if (this.ws.readyState !== WS_OPEN) {
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'mcp_websocket_start_not_opened');
            throw new Error('WebSocket is not open. Cannot start transport.');
        }
        this.started = true;
        // Unlike stdio, WebSocket connections are typically already established when the transport is created.
        // No explicit connection action needed here, just attaching listeners.
    }
    /**
     * Closes the WebSocket connection.
     */
    async close() {
        if (this.ws.readyState === WS_OPEN ||
            this.ws.readyState === WS_CONNECTING) {
            this.ws.close();
        }
        // Ensure listeners are removed even if close was called externally or connection was already closed
        this.handleCloseCleanup();
    }
    /**
     * Sends a JSON-RPC message over the WebSocket connection.
     */
    async send(message) {
        if (this.ws.readyState !== WS_OPEN) {
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'mcp_websocket_send_not_opened');
            throw new Error('WebSocket is not open. Cannot send message.');
        }
        const json = (0, slowOperations_js_1.jsonStringify)(message);
        try {
            if (this.isBun) {
                // Native WebSocket.send() is synchronous (no callback)
                this.ws.send(json);
            }
            else {
                await new Promise((resolve, reject) => {
                    ;
                    this.ws.send(json, error => {
                        if (error) {
                            reject(error);
                        }
                        else {
                            resolve();
                        }
                    });
                });
            }
        }
        catch (error) {
            this.handleError(error);
            throw error;
        }
    }
}
exports.WebSocketTransport = WebSocketTransport;
