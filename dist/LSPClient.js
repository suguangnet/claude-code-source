"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLSPClient = createLSPClient;
const child_process_1 = require("child_process");
const node_js_1 = require("vscode-jsonrpc/node.js");
const debug_js_1 = require("../../utils/debug.js");
const errors_js_1 = require("../../utils/errors.js");
const log_js_1 = require("../../utils/log.js");
const subprocessEnv_js_1 = require("../../utils/subprocessEnv.js");
/**
 * Create an LSP client wrapper using vscode-jsonrpc.
 * Manages communication with an LSP server process via stdio.
 *
 * @param onCrash - Called when the server process exits unexpectedly (non-zero
 *   exit code during operation, not during intentional stop). Allows the owner
 *   to propagate crash state so the server can be restarted on next use.
 */
function createLSPClient(serverName, onCrash) {
    // State variables in closure
    let process;
    let connection;
    let capabilities;
    let isInitialized = false;
    let startFailed = false;
    let startError;
    let isStopping = false; // Track intentional shutdown to avoid spurious error logging
    // Queue handlers registered before connection ready (lazy initialization support)
    const pendingHandlers = [];
    const pendingRequestHandlers = [];
    function checkStartFailed() {
        if (startFailed) {
            throw startError || new Error(`LSP server ${serverName} failed to start`);
        }
    }
    return {
        get capabilities() {
            return capabilities;
        },
        get isInitialized() {
            return isInitialized;
        },
        async start(command, args, options) {
            try {
                // 1. Spawn LSP server process
                process = (0, child_process_1.spawn)(command, args, {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    env: { ...(0, subprocessEnv_js_1.subprocessEnv)(), ...options?.env },
                    cwd: options?.cwd,
                    // Prevent visible console window on Windows (no-op on other platforms)
                    windowsHide: true,
                });
                if (!process.stdout || !process.stdin) {
                    throw new Error('LSP server process stdio not available');
                }
                // 1.5. Wait for process to successfully spawn before using streams
                // This is CRITICAL: spawn() returns immediately, but the 'error' event
                // (e.g., ENOENT for command not found) fires asynchronously.
                // If we use the streams before confirming spawn succeeded, we get
                // unhandled promise rejections when writes fail on invalid streams.
                const spawnedProcess = process; // Capture for closure
                await new Promise((resolve, reject) => {
                    const onSpawn = () => {
                        cleanup();
                        resolve();
                    };
                    const onError = (error) => {
                        cleanup();
                        reject(error);
                    };
                    const cleanup = () => {
                        spawnedProcess.removeListener('spawn', onSpawn);
                        spawnedProcess.removeListener('error', onError);
                    };
                    spawnedProcess.once('spawn', onSpawn);
                    spawnedProcess.once('error', onError);
                });
                // Capture stderr for server diagnostics and errors
                if (process.stderr) {
                    process.stderr.on('data', (data) => {
                        const output = data.toString().trim();
                        if (output) {
                            (0, debug_js_1.logForDebugging)(`[LSP SERVER ${serverName}] ${output}`);
                        }
                    });
                }
                // Handle process errors (after successful spawn, e.g., crash during operation)
                process.on('error', error => {
                    if (!isStopping) {
                        startFailed = true;
                        startError = error;
                        (0, log_js_1.logError)(new Error(`LSP server ${serverName} failed to start: ${error.message}`));
                    }
                });
                process.on('exit', (code, _signal) => {
                    if (code !== 0 && code !== null && !isStopping) {
                        isInitialized = false;
                        startFailed = false;
                        startError = undefined;
                        const crashError = new Error(`LSP server ${serverName} crashed with exit code ${code}`);
                        (0, log_js_1.logError)(crashError);
                        onCrash?.(crashError);
                    }
                });
                // Handle stdin stream errors to prevent unhandled promise rejections
                // when the LSP server process exits before we finish writing
                process.stdin.on('error', (error) => {
                    if (!isStopping) {
                        (0, debug_js_1.logForDebugging)(`LSP server ${serverName} stdin error: ${error.message}`);
                    }
                    // Error is logged but not thrown - the connection error handler will catch this
                });
                // 2. Create JSON-RPC connection
                const reader = new node_js_1.StreamMessageReader(process.stdout);
                const writer = new node_js_1.StreamMessageWriter(process.stdin);
                connection = (0, node_js_1.createMessageConnection)(reader, writer);
                // 2.5. Register error/close handlers BEFORE listen() to catch all errors
                // This prevents unhandled promise rejections when the server crashes or closes unexpectedly
                connection.onError(([error, _message, _code]) => {
                    // Only log if not intentionally stopping (avoid spurious errors during shutdown)
                    if (!isStopping) {
                        startFailed = true;
                        startError = error;
                        (0, log_js_1.logError)(new Error(`LSP server ${serverName} connection error: ${error.message}`));
                    }
                });
                connection.onClose(() => {
                    // Only treat as error if not intentionally stopping
                    if (!isStopping) {
                        isInitialized = false;
                        // Don't set startFailed here - the connection may close after graceful shutdown
                        (0, debug_js_1.logForDebugging)(`LSP server ${serverName} connection closed`);
                    }
                });
                // 3. Start listening for messages
                connection.listen();
                // 3.5. Enable protocol tracing for debugging
                // Note: trace() sends a $/setTrace notification which can fail if the server
                // process has already exited. We catch and log the error rather than letting
                // it become an unhandled promise rejection.
                connection
                    .trace(node_js_1.Trace.Verbose, {
                    log: (message) => {
                        (0, debug_js_1.logForDebugging)(`[LSP PROTOCOL ${serverName}] ${message}`);
                    },
                })
                    .catch((error) => {
                    (0, debug_js_1.logForDebugging)(`Failed to enable tracing for ${serverName}: ${error.message}`);
                });
                // 4. Apply any queued notification handlers
                for (const { method, handler } of pendingHandlers) {
                    connection.onNotification(method, handler);
                    (0, debug_js_1.logForDebugging)(`Applied queued notification handler for ${serverName}.${method}`);
                }
                pendingHandlers.length = 0; // Clear the queue
                // 5. Apply any queued request handlers
                for (const { method, handler } of pendingRequestHandlers) {
                    connection.onRequest(method, handler);
                    (0, debug_js_1.logForDebugging)(`Applied queued request handler for ${serverName}.${method}`);
                }
                pendingRequestHandlers.length = 0; // Clear the queue
                (0, debug_js_1.logForDebugging)(`LSP client started for ${serverName}`);
            }
            catch (error) {
                const err = error;
                (0, log_js_1.logError)(new Error(`LSP server ${serverName} failed to start: ${err.message}`));
                throw error;
            }
        },
        async initialize(params) {
            if (!connection) {
                throw new Error('LSP client not started');
            }
            checkStartFailed();
            try {
                const result = await connection.sendRequest('initialize', params);
                capabilities = result.capabilities;
                // Send initialized notification
                await connection.sendNotification('initialized', {});
                isInitialized = true;
                (0, debug_js_1.logForDebugging)(`LSP server ${serverName} initialized`);
                return result;
            }
            catch (error) {
                const err = error;
                (0, log_js_1.logError)(new Error(`LSP server ${serverName} initialize failed: ${err.message}`));
                throw error;
            }
        },
        async sendRequest(method, params) {
            if (!connection) {
                throw new Error('LSP client not started');
            }
            checkStartFailed();
            if (!isInitialized) {
                throw new Error('LSP server not initialized');
            }
            try {
                return await connection.sendRequest(method, params);
            }
            catch (error) {
                const err = error;
                (0, log_js_1.logError)(new Error(`LSP server ${serverName} request ${method} failed: ${err.message}`));
                throw error;
            }
        },
        async sendNotification(method, params) {
            if (!connection) {
                throw new Error('LSP client not started');
            }
            checkStartFailed();
            try {
                await connection.sendNotification(method, params);
            }
            catch (error) {
                const err = error;
                (0, log_js_1.logError)(new Error(`LSP server ${serverName} notification ${method} failed: ${err.message}`));
                // Don't re-throw for notifications - they're fire-and-forget
                (0, debug_js_1.logForDebugging)(`Notification ${method} failed but continuing`);
            }
        },
        onNotification(method, handler) {
            if (!connection) {
                // Queue handler for application when connection is ready (lazy initialization)
                pendingHandlers.push({ method, handler });
                (0, debug_js_1.logForDebugging)(`Queued notification handler for ${serverName}.${method} (connection not ready)`);
                return;
            }
            checkStartFailed();
            connection.onNotification(method, handler);
        },
        onRequest(method, handler) {
            if (!connection) {
                // Queue handler for application when connection is ready (lazy initialization)
                pendingRequestHandlers.push({
                    method,
                    handler: handler,
                });
                (0, debug_js_1.logForDebugging)(`Queued request handler for ${serverName}.${method} (connection not ready)`);
                return;
            }
            checkStartFailed();
            connection.onRequest(method, handler);
        },
        async stop() {
            let shutdownError;
            // Mark as stopping to prevent error handlers from logging spurious errors
            isStopping = true;
            try {
                if (connection) {
                    // Try to send shutdown request and exit notification
                    await connection.sendRequest('shutdown', {});
                    await connection.sendNotification('exit', {});
                }
            }
            catch (error) {
                const err = error;
                (0, log_js_1.logError)(new Error(`LSP server ${serverName} stop failed: ${err.message}`));
                shutdownError = err;
                // Continue to cleanup despite shutdown failure
            }
            finally {
                // Always cleanup resources, even if shutdown/exit failed
                if (connection) {
                    try {
                        connection.dispose();
                    }
                    catch (error) {
                        // Log but don't throw - disposal errors are less critical
                        (0, debug_js_1.logForDebugging)(`Connection disposal failed for ${serverName}: ${(0, errors_js_1.errorMessage)(error)}`);
                    }
                    connection = undefined;
                }
                if (process) {
                    // Remove event listeners to prevent memory leaks
                    process.removeAllListeners('error');
                    process.removeAllListeners('exit');
                    if (process.stdin) {
                        process.stdin.removeAllListeners('error');
                    }
                    if (process.stderr) {
                        process.stderr.removeAllListeners('data');
                    }
                    try {
                        process.kill();
                    }
                    catch (error) {
                        // Process might already be dead, which is fine
                        (0, debug_js_1.logForDebugging)(`Process kill failed for ${serverName} (may already be dead): ${(0, errors_js_1.errorMessage)(error)}`);
                    }
                    process = undefined;
                }
                isInitialized = false;
                capabilities = undefined;
                isStopping = false; // Reset for potential restart
                // Don't reset startFailed - preserve error state for diagnostics
                // startFailed and startError remain as-is
                if (shutdownError) {
                    startFailed = true;
                    startError = shutdownError;
                }
                (0, debug_js_1.logForDebugging)(`LSP client stopped for ${serverName}`);
            }
            // Re-throw shutdown error after cleanup is complete
            if (shutdownError) {
                throw shutdownError;
            }
        },
    };
}
