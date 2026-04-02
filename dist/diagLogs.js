"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logForDiagnosticsNoPII = logForDiagnosticsNoPII;
exports.withDiagnosticsTiming = withDiagnosticsTiming;
const path_1 = require("path");
const fsOperations_js_1 = require("./fsOperations.js");
const slowOperations_js_1 = require("./slowOperations.js");
/**
 * Logs diagnostic information to a logfile. This information is sent
 * via the environment manager to session-ingress to monitor issues from
 * within the container.
 *
 * *Important* - this function MUST NOT be called with any PII, including
 * file paths, project names, repo names, prompts, etc.
 *
 * @param level    Log level. Only used for information, not filtering
 * @param event    A specific event: "started", "mcp_connected", etc.
 * @param data     Optional additional data to log
 */
// sync IO: called from sync context
function logForDiagnosticsNoPII(level, event, data) {
    const logFile = getDiagnosticLogFile();
    if (!logFile) {
        return;
    }
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        event,
        data: data ?? {},
    };
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    const line = (0, slowOperations_js_1.jsonStringify)(entry) + '\n';
    try {
        fs.appendFileSync(logFile, line);
    }
    catch {
        // If append fails, try creating the directory first
        try {
            fs.mkdirSync((0, path_1.dirname)(logFile));
            fs.appendFileSync(logFile, line);
        }
        catch {
            // Silently fail if logging is not possible
        }
    }
}
function getDiagnosticLogFile() {
    return process.env.CLAUDE_CODE_DIAGNOSTICS_FILE;
}
/**
 * Wraps an async function with diagnostic timing logs.
 * Logs `{event}_started` before execution and `{event}_completed` after with duration_ms.
 *
 * @param event   Event name prefix (e.g., "git_status" -> logs "git_status_started" and "git_status_completed")
 * @param fn      Async function to execute and time
 * @param getData Optional function to extract additional data from the result for the completion log
 * @returns       The result of the wrapped function
 */
async function withDiagnosticsTiming(event, fn, getData) {
    const startTime = Date.now();
    logForDiagnosticsNoPII('info', `${event}_started`);
    try {
        const result = await fn();
        const additionalData = getData ? getData(result) : {};
        logForDiagnosticsNoPII('info', `${event}_completed`, {
            duration_ms: Date.now() - startTime,
            ...additionalData,
        });
        return result;
    }
    catch (error) {
        logForDiagnosticsNoPII('error', `${event}_failed`, {
            duration_ms: Date.now() - startTime,
        });
        throw error;
    }
}
