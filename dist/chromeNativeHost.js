"use strict";
// biome-ignore-all lint/suspicious/noConsole: file uses console intentionally
/**
 * Chrome Native Host - Pure TypeScript Implementation
 *
 * This module provides the Chrome native messaging host functionality,
 * previously implemented as a Rust NAPI binding but now in pure TypeScript.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendChromeMessage = sendChromeMessage;
exports.runChromeNativeHost = runChromeNativeHost;
const promises_1 = require("fs/promises");
const net_1 = require("net");
const os_1 = require("os");
const path_1 = require("path");
const zod_1 = require("zod");
const lazySchema_js_1 = require("../lazySchema.js");
const slowOperations_js_1 = require("../slowOperations.js");
const common_js_1 = require("./common.js");
const VERSION = '1.0.0';
const MAX_MESSAGE_SIZE = 1024 * 1024; // 1MB - Max message size that can be sent to Chrome
const LOG_FILE = process.env.USER_TYPE === 'ant'
    ? (0, path_1.join)((0, os_1.homedir)(), '.claude', 'debug', 'chrome-native-host.txt')
    : undefined;
function log(message, ...args) {
    if (LOG_FILE) {
        const timestamp = new Date().toISOString();
        const formattedArgs = args.length > 0 ? ' ' + (0, slowOperations_js_1.jsonStringify)(args) : '';
        const logLine = `[${timestamp}] [Claude Chrome Native Host] ${message}${formattedArgs}\n`;
        // Fire-and-forget: logging is best-effort and callers (including event
        // handlers) don't await
        void (0, promises_1.appendFile)(LOG_FILE, logLine).catch(() => {
            // Ignore file write errors
        });
    }
    console.error(`[Claude Chrome Native Host] ${message}`, ...args);
}
/**
 * Send a message to stdout (Chrome native messaging protocol)
 */
function sendChromeMessage(message) {
    const jsonBytes = Buffer.from(message, 'utf-8');
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32LE(jsonBytes.length, 0);
    process.stdout.write(lengthBuffer);
    process.stdout.write(jsonBytes);
}
async function runChromeNativeHost() {
    log('Initializing...');
    const host = new ChromeNativeHost();
    const messageReader = new ChromeMessageReader();
    // Start the native host server
    await host.start();
    // Process messages from Chrome until stdin closes
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
        const message = await messageReader.read();
        if (message === null) {
            // stdin closed, Chrome disconnected
            break;
        }
        await host.handleMessage(message);
    }
    // Stop the server
    await host.stop();
}
const messageSchema = (0, lazySchema_js_1.lazySchema)(() => zod_1.z
    .object({
    type: zod_1.z.string(),
})
    .passthrough());
class ChromeNativeHost {
    constructor() {
        this.mcpClients = new Map();
        this.nextClientId = 1;
        this.server = null;
        this.running = false;
        this.socketPath = null;
    }
    async start() {
        if (this.running) {
            return;
        }
        this.socketPath = (0, common_js_1.getSecureSocketPath)();
        if ((0, os_1.platform)() !== 'win32') {
            const socketDir = (0, common_js_1.getSocketDir)();
            // Migrate legacy socket: if socket dir path exists as a file/socket, remove it
            try {
                const dirStats = await (0, promises_1.stat)(socketDir);
                if (!dirStats.isDirectory()) {
                    await (0, promises_1.unlink)(socketDir);
                }
            }
            catch {
                // Doesn't exist, that's fine
            }
            // Create socket directory with secure permissions
            await (0, promises_1.mkdir)(socketDir, { recursive: true, mode: 0o700 });
            // Fix perms if directory already existed
            await (0, promises_1.chmod)(socketDir, 0o700).catch(() => {
                // Ignore
            });
            // Clean up stale sockets
            try {
                const files = await (0, promises_1.readdir)(socketDir);
                for (const file of files) {
                    if (!file.endsWith('.sock')) {
                        continue;
                    }
                    const pid = parseInt(file.replace('.sock', ''), 10);
                    if (isNaN(pid)) {
                        continue;
                    }
                    try {
                        process.kill(pid, 0);
                        // Process is alive, leave it
                    }
                    catch {
                        // Process is dead, remove stale socket
                        await (0, promises_1.unlink)((0, path_1.join)(socketDir, file)).catch(() => {
                            // Ignore
                        });
                        log(`Removed stale socket for PID ${pid}`);
                    }
                }
            }
            catch {
                // Ignore errors scanning directory
            }
        }
        log(`Creating socket listener: ${this.socketPath}`);
        this.server = (0, net_1.createServer)(socket => this.handleMcpClient(socket));
        await new Promise((resolve, reject) => {
            this.server.listen(this.socketPath, () => {
                log('Socket server listening for connections');
                this.running = true;
                resolve();
            });
            this.server.on('error', err => {
                log('Socket server error:', err);
                reject(err);
            });
        });
        // Set permissions on Unix (after listen resolves so socket file exists)
        if ((0, os_1.platform)() !== 'win32') {
            try {
                await (0, promises_1.chmod)(this.socketPath, 0o600);
                log('Socket permissions set to 0600');
            }
            catch (e) {
                log('Failed to set socket permissions:', e);
            }
        }
    }
    async stop() {
        if (!this.running) {
            return;
        }
        // Close all MCP clients
        for (const [, client] of this.mcpClients) {
            client.socket.destroy();
        }
        this.mcpClients.clear();
        // Close server
        if (this.server) {
            await new Promise(resolve => {
                this.server.close(() => resolve());
            });
            this.server = null;
        }
        // Cleanup socket file
        if ((0, os_1.platform)() !== 'win32' && this.socketPath) {
            try {
                await (0, promises_1.unlink)(this.socketPath);
                log('Cleaned up socket file');
            }
            catch {
                // ENOENT is fine, ignore
            }
            // Remove directory if empty
            try {
                const socketDir = (0, common_js_1.getSocketDir)();
                const remaining = await (0, promises_1.readdir)(socketDir);
                if (remaining.length === 0) {
                    await (0, promises_1.rmdir)(socketDir);
                    log('Removed empty socket directory');
                }
            }
            catch {
                // Ignore
            }
        }
        this.running = false;
    }
    async isRunning() {
        return this.running;
    }
    async getClientCount() {
        return this.mcpClients.size;
    }
    async handleMessage(messageJson) {
        let rawMessage;
        try {
            rawMessage = (0, slowOperations_js_1.jsonParse)(messageJson);
        }
        catch (e) {
            log('Invalid JSON from Chrome:', e.message);
            sendChromeMessage((0, slowOperations_js_1.jsonStringify)({
                type: 'error',
                error: 'Invalid message format',
            }));
            return;
        }
        const parsed = messageSchema().safeParse(rawMessage);
        if (!parsed.success) {
            log('Invalid message from Chrome:', parsed.error.message);
            sendChromeMessage((0, slowOperations_js_1.jsonStringify)({
                type: 'error',
                error: 'Invalid message format',
            }));
            return;
        }
        const message = parsed.data;
        log(`Handling Chrome message type: ${message.type}`);
        switch (message.type) {
            case 'ping':
                log('Responding to ping');
                sendChromeMessage((0, slowOperations_js_1.jsonStringify)({
                    type: 'pong',
                    timestamp: Date.now(),
                }));
                break;
            case 'get_status':
                sendChromeMessage((0, slowOperations_js_1.jsonStringify)({
                    type: 'status_response',
                    native_host_version: VERSION,
                }));
                break;
            case 'tool_response': {
                if (this.mcpClients.size > 0) {
                    log(`Forwarding tool response to ${this.mcpClients.size} MCP clients`);
                    // Extract the data portion (everything except 'type')
                    const { type: _, ...data } = message;
                    const responseData = Buffer.from((0, slowOperations_js_1.jsonStringify)(data), 'utf-8');
                    const lengthBuffer = Buffer.alloc(4);
                    lengthBuffer.writeUInt32LE(responseData.length, 0);
                    const responseMsg = Buffer.concat([lengthBuffer, responseData]);
                    for (const [id, client] of this.mcpClients) {
                        try {
                            client.socket.write(responseMsg);
                        }
                        catch (e) {
                            log(`Failed to send to MCP client ${id}:`, e);
                        }
                    }
                }
                break;
            }
            case 'notification': {
                if (this.mcpClients.size > 0) {
                    log(`Forwarding notification to ${this.mcpClients.size} MCP clients`);
                    // Extract the data portion (everything except 'type')
                    const { type: _, ...data } = message;
                    const notificationData = Buffer.from((0, slowOperations_js_1.jsonStringify)(data), 'utf-8');
                    const lengthBuffer = Buffer.alloc(4);
                    lengthBuffer.writeUInt32LE(notificationData.length, 0);
                    const notificationMsg = Buffer.concat([
                        lengthBuffer,
                        notificationData,
                    ]);
                    for (const [id, client] of this.mcpClients) {
                        try {
                            client.socket.write(notificationMsg);
                        }
                        catch (e) {
                            log(`Failed to send notification to MCP client ${id}:`, e);
                        }
                    }
                }
                break;
            }
            default:
                log(`Unknown message type: ${message.type}`);
                sendChromeMessage((0, slowOperations_js_1.jsonStringify)({
                    type: 'error',
                    error: `Unknown message type: ${message.type}`,
                }));
        }
    }
    handleMcpClient(socket) {
        const clientId = this.nextClientId++;
        const client = {
            id: clientId,
            socket,
            buffer: Buffer.alloc(0),
        };
        this.mcpClients.set(clientId, client);
        log(`MCP client ${clientId} connected. Total clients: ${this.mcpClients.size}`);
        // Notify Chrome of connection
        sendChromeMessage((0, slowOperations_js_1.jsonStringify)({
            type: 'mcp_connected',
        }));
        socket.on('data', (data) => {
            client.buffer = Buffer.concat([client.buffer, data]);
            // Process complete messages
            while (client.buffer.length >= 4) {
                const length = client.buffer.readUInt32LE(0);
                if (length === 0 || length > MAX_MESSAGE_SIZE) {
                    log(`Invalid message length from MCP client ${clientId}: ${length}`);
                    socket.destroy();
                    return;
                }
                if (client.buffer.length < 4 + length) {
                    break; // Wait for more data
                }
                const messageBytes = client.buffer.slice(4, 4 + length);
                client.buffer = client.buffer.slice(4 + length);
                try {
                    const request = (0, slowOperations_js_1.jsonParse)(messageBytes.toString('utf-8'));
                    log(`Forwarding tool request from MCP client ${clientId}: ${request.method}`);
                    // Forward to Chrome
                    sendChromeMessage((0, slowOperations_js_1.jsonStringify)({
                        type: 'tool_request',
                        method: request.method,
                        params: request.params,
                    }));
                }
                catch (e) {
                    log(`Failed to parse tool request from MCP client ${clientId}:`, e);
                }
            }
        });
        socket.on('error', err => {
            log(`MCP client ${clientId} error: ${err}`);
        });
        socket.on('close', () => {
            log(`MCP client ${clientId} disconnected. Remaining clients: ${this.mcpClients.size - 1}`);
            this.mcpClients.delete(clientId);
            // Notify Chrome of disconnection
            sendChromeMessage((0, slowOperations_js_1.jsonStringify)({
                type: 'mcp_disconnected',
            }));
        });
    }
}
/**
 * Chrome message reader using async stdin. Synchronous reads can crash Bun, so we use
 * async reads with a buffer.
 */
class ChromeMessageReader {
    constructor() {
        this.buffer = Buffer.alloc(0);
        this.pendingResolve = null;
        this.closed = false;
        process.stdin.on('data', (chunk) => {
            this.buffer = Buffer.concat([this.buffer, chunk]);
            this.tryProcessMessage();
        });
        process.stdin.on('end', () => {
            this.closed = true;
            if (this.pendingResolve) {
                this.pendingResolve(null);
                this.pendingResolve = null;
            }
        });
        process.stdin.on('error', () => {
            this.closed = true;
            if (this.pendingResolve) {
                this.pendingResolve(null);
                this.pendingResolve = null;
            }
        });
    }
    tryProcessMessage() {
        if (!this.pendingResolve) {
            return;
        }
        // Need at least 4 bytes for length prefix
        if (this.buffer.length < 4) {
            return;
        }
        const length = this.buffer.readUInt32LE(0);
        if (length === 0 || length > MAX_MESSAGE_SIZE) {
            log(`Invalid message length: ${length}`);
            this.pendingResolve(null);
            this.pendingResolve = null;
            return;
        }
        // Check if we have the full message
        if (this.buffer.length < 4 + length) {
            return; // Wait for more data
        }
        // Extract the message
        const messageBytes = this.buffer.subarray(4, 4 + length);
        this.buffer = this.buffer.subarray(4 + length);
        const message = messageBytes.toString('utf-8');
        this.pendingResolve(message);
        this.pendingResolve = null;
    }
    async read() {
        if (this.closed) {
            return null;
        }
        // Check if we already have a complete message buffered
        if (this.buffer.length >= 4) {
            const length = this.buffer.readUInt32LE(0);
            if (length > 0 &&
                length <= MAX_MESSAGE_SIZE &&
                this.buffer.length >= 4 + length) {
                const messageBytes = this.buffer.subarray(4, 4 + length);
                this.buffer = this.buffer.subarray(4 + length);
                return messageBytes.toString('utf-8');
            }
        }
        // Wait for more data
        return new Promise(resolve => {
            this.pendingResolve = resolve;
            // In case data arrived between check and setting pendingResolve
            this.tryProcessMessage();
        });
    }
}
