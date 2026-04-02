"use strict";
/**
 * Error log sink implementation
 *
 * This module contains the heavy implementation for error logging and should be
 * initialized during app startup. It handles file-based error logging to disk.
 *
 * Usage: Call initializeErrorLogSink() during app startup to attach the sink.
 *
 * DESIGN: This module is separate from log.ts to avoid import cycles.
 * log.ts has NO heavy dependencies - events are queued until this sink is attached.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getErrorsPath = getErrorsPath;
exports.getMCPLogsPath = getMCPLogsPath;
exports._flushLogWritersForTesting = _flushLogWritersForTesting;
exports._clearLogWritersForTesting = _clearLogWritersForTesting;
exports.initializeErrorLogSink = initializeErrorLogSink;
const axios_1 = __importDefault(require("axios"));
const path_1 = require("path");
const state_js_1 = require("../bootstrap/state.js");
const bufferedWriter_js_1 = require("./bufferedWriter.js");
const cachePaths_js_1 = require("./cachePaths.js");
const cleanupRegistry_js_1 = require("./cleanupRegistry.js");
const debug_js_1 = require("./debug.js");
const fsOperations_js_1 = require("./fsOperations.js");
const log_js_1 = require("./log.js");
const slowOperations_js_1 = require("./slowOperations.js");
const DATE = (0, log_js_1.dateToFilename)(new Date());
/**
 * Gets the path to the errors log file.
 */
function getErrorsPath() {
    return (0, path_1.join)(cachePaths_js_1.CACHE_PATHS.errors(), DATE + '.jsonl');
}
/**
 * Gets the path to MCP logs for a server.
 */
function getMCPLogsPath(serverName) {
    return (0, path_1.join)(cachePaths_js_1.CACHE_PATHS.mcpLogs(serverName), DATE + '.jsonl');
}
function createJsonlWriter(options) {
    const writer = (0, bufferedWriter_js_1.createBufferedWriter)(options);
    return {
        write(obj) {
            writer.write((0, slowOperations_js_1.jsonStringify)(obj) + '\n');
        },
        flush: writer.flush,
        dispose: writer.dispose,
    };
}
// Buffered writers for JSONL log files, keyed by path
const logWriters = new Map();
/**
 * Flush all buffered log writers. Used for testing.
 * @internal
 */
function _flushLogWritersForTesting() {
    for (const writer of logWriters.values()) {
        writer.flush();
    }
}
/**
 * Clear all buffered log writers. Used for testing.
 * @internal
 */
function _clearLogWritersForTesting() {
    for (const writer of logWriters.values()) {
        writer.dispose();
    }
    logWriters.clear();
}
function getLogWriter(path) {
    let writer = logWriters.get(path);
    if (!writer) {
        const dir = (0, path_1.dirname)(path);
        writer = createJsonlWriter({
            // sync IO: called from sync context
            writeFn: (content) => {
                try {
                    // Happy-path: directory already exists
                    (0, fsOperations_js_1.getFsImplementation)().appendFileSync(path, content);
                }
                catch {
                    // If any error occurs, assume it was due to missing directory
                    (0, fsOperations_js_1.getFsImplementation)().mkdirSync(dir);
                    // Retry appending
                    (0, fsOperations_js_1.getFsImplementation)().appendFileSync(path, content);
                }
            },
            flushIntervalMs: 1000,
            maxBufferSize: 50,
        });
        logWriters.set(path, writer);
        (0, cleanupRegistry_js_1.registerCleanup)(async () => writer?.dispose());
    }
    return writer;
}
function appendToLog(path, message) {
    if (process.env.USER_TYPE !== 'ant') {
        return;
    }
    const messageWithTimestamp = {
        timestamp: new Date().toISOString(),
        ...message,
        cwd: (0, fsOperations_js_1.getFsImplementation)().cwd(),
        userType: process.env.USER_TYPE,
        sessionId: (0, state_js_1.getSessionId)(),
        version: MACRO.VERSION,
    };
    getLogWriter(path).write(messageWithTimestamp);
}
function extractServerMessage(data) {
    if (typeof data === 'string') {
        return data;
    }
    if (data && typeof data === 'object') {
        const obj = data;
        if (typeof obj.message === 'string') {
            return obj.message;
        }
        if (typeof obj.error === 'object' &&
            obj.error &&
            'message' in obj.error &&
            typeof obj.error.message === 'string') {
            return obj.error.message;
        }
    }
    return undefined;
}
/**
 * Implementation for logError - writes error to debug log and file.
 */
function logErrorImpl(error) {
    const errorStr = error.stack || error.message;
    // Enrich axios errors with request URL, status, and server message for debugging
    let context = '';
    if (axios_1.default.isAxiosError(error) && error.config?.url) {
        const parts = [`url=${error.config.url}`];
        if (error.response?.status !== undefined) {
            parts.push(`status=${error.response.status}`);
        }
        const serverMessage = extractServerMessage(error.response?.data);
        if (serverMessage) {
            parts.push(`body=${serverMessage}`);
        }
        context = `[${parts.join(',')}] `;
    }
    (0, debug_js_1.logForDebugging)(`${error.name}: ${context}${errorStr}`, { level: 'error' });
    appendToLog(getErrorsPath(), {
        error: `${context}${errorStr}`,
    });
}
/**
 * Implementation for logMCPError - writes MCP error to debug log and file.
 */
function logMCPErrorImpl(serverName, error) {
    // Not themed, to avoid having to pipe theme all the way down
    (0, debug_js_1.logForDebugging)(`MCP server "${serverName}" ${error}`, { level: 'error' });
    const logFile = getMCPLogsPath(serverName);
    const errorStr = error instanceof Error ? error.stack || error.message : String(error);
    const errorInfo = {
        error: errorStr,
        timestamp: new Date().toISOString(),
        sessionId: (0, state_js_1.getSessionId)(),
        cwd: (0, fsOperations_js_1.getFsImplementation)().cwd(),
    };
    getLogWriter(logFile).write(errorInfo);
}
/**
 * Implementation for logMCPDebug - writes MCP debug message to log file.
 */
function logMCPDebugImpl(serverName, message) {
    (0, debug_js_1.logForDebugging)(`MCP server "${serverName}": ${message}`);
    const logFile = getMCPLogsPath(serverName);
    const debugInfo = {
        debug: message,
        timestamp: new Date().toISOString(),
        sessionId: (0, state_js_1.getSessionId)(),
        cwd: (0, fsOperations_js_1.getFsImplementation)().cwd(),
    };
    getLogWriter(logFile).write(debugInfo);
}
/**
 * Initialize the error log sink.
 *
 * Call this during app startup to attach the error logging backend.
 * Any errors logged before this is called will be queued and drained.
 *
 * Should be called BEFORE initializeAnalyticsSink() in the startup sequence.
 *
 * Idempotent: safe to call multiple times (subsequent calls are no-ops).
 */
function initializeErrorLogSink() {
    (0, log_js_1.attachErrorLogSink)({
        logError: logErrorImpl,
        logMCPError: logMCPErrorImpl,
        logMCPDebug: logMCPDebugImpl,
        getErrorsPath,
        getMCPLogsPath,
    });
    (0, debug_js_1.logForDebugging)('Error log sink initialized');
}
