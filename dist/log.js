"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLogDisplayTitle = getLogDisplayTitle;
exports.dateToFilename = dateToFilename;
exports.attachErrorLogSink = attachErrorLogSink;
exports.logError = logError;
exports.getInMemoryErrors = getInMemoryErrors;
exports.loadErrorLogs = loadErrorLogs;
exports.getErrorLogByIndex = getErrorLogByIndex;
exports.logMCPError = logMCPError;
exports.logMCPDebug = logMCPDebug;
exports.captureAPIRequest = captureAPIRequest;
exports._resetErrorLogForTesting = _resetErrorLogForTesting;
const bun_bundle_1 = require("bun:bundle");
const promises_1 = require("fs/promises");
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const path_1 = require("path");
const state_js_1 = require("../bootstrap/state.js");
const xml_js_1 = require("../constants/xml.js");
const logs_js_1 = require("../types/logs.js");
const cachePaths_js_1 = require("./cachePaths.js");
const displayTags_js_1 = require("./displayTags.js");
const envUtils_js_1 = require("./envUtils.js");
const errors_js_1 = require("./errors.js");
const privacyLevel_js_1 = require("./privacyLevel.js");
const slowOperations_js_1 = require("./slowOperations.js");
/**
 * Gets the display title for a log/session with fallback logic.
 * Skips firstPrompt if it starts with a tick/goal tag (autonomous mode auto-prompt).
 * Strips display-unfriendly tags (like <ide_opened_file>) from the result.
 * Falls back to a truncated session ID when no other title is available.
 */
function getLogDisplayTitle(log, defaultTitle) {
    // Skip firstPrompt if it's a tick/goal message (autonomous mode auto-prompt)
    const isAutonomousPrompt = log.firstPrompt?.startsWith(`<${xml_js_1.TICK_TAG}>`);
    // Strip display-unfriendly tags (command-name, ide_opened_file, etc.) early
    // so that command-only prompts (e.g. /clear) become empty and fall through
    // to the next fallback instead of showing raw XML tags.
    // Note: stripDisplayTags returns the original when stripping yields empty,
    // so we call stripDisplayTagsAllowEmpty to detect command-only prompts.
    const strippedFirstPrompt = log.firstPrompt
        ? (0, displayTags_js_1.stripDisplayTagsAllowEmpty)(log.firstPrompt)
        : '';
    const useFirstPrompt = strippedFirstPrompt && !isAutonomousPrompt;
    const title = log.agentName ||
        log.customTitle ||
        log.summary ||
        (useFirstPrompt ? strippedFirstPrompt : undefined) ||
        defaultTitle ||
        // For autonomous sessions without other context, show a meaningful label
        (isAutonomousPrompt ? 'Autonomous session' : undefined) ||
        // Fall back to truncated session ID for lite logs with no metadata
        (log.sessionId ? log.sessionId.slice(0, 8) : '') ||
        '';
    // Strip display-unfriendly tags (like <ide_opened_file>) for cleaner titles
    return (0, displayTags_js_1.stripDisplayTags)(title).trim();
}
function dateToFilename(date) {
    return date.toISOString().replace(/[:.]/g, '-');
}
// In-memory error log for recent errors
// Moved from bootstrap/state.ts to break import cycle
const MAX_IN_MEMORY_ERRORS = 100;
let inMemoryErrorLog = [];
function addToInMemoryErrorLog(errorInfo) {
    if (inMemoryErrorLog.length >= MAX_IN_MEMORY_ERRORS) {
        inMemoryErrorLog.shift(); // Remove oldest error
    }
    inMemoryErrorLog.push(errorInfo);
}
const errorQueue = [];
// Sink - initialized during app startup
let errorLogSink = null;
/**
 * Attach the error log sink that will receive all error events.
 * Queued events are drained immediately to ensure no errors are lost.
 *
 * Idempotent: if a sink is already attached, this is a no-op. This allows
 * calling from both the preAction hook (for subcommands) and setup() (for
 * the default command) without coordination.
 */
function attachErrorLogSink(newSink) {
    if (errorLogSink !== null) {
        return;
    }
    errorLogSink = newSink;
    // Drain the queue immediately - errors should not be delayed
    if (errorQueue.length > 0) {
        const queuedEvents = [...errorQueue];
        errorQueue.length = 0;
        for (const event of queuedEvents) {
            switch (event.type) {
                case 'error':
                    errorLogSink.logError(event.error);
                    break;
                case 'mcpError':
                    errorLogSink.logMCPError(event.serverName, event.error);
                    break;
                case 'mcpDebug':
                    errorLogSink.logMCPDebug(event.serverName, event.message);
                    break;
            }
        }
    }
}
/**
 * Logs an error to multiple destinations for debugging and monitoring.
 *
 * This function logs errors to:
 * - Debug logs (visible via `claude --debug` or `tail -f ~/.claude/debug/latest`)
 * - In-memory error log (accessible via `getInMemoryErrors()`, useful for including
 *   in bug reports or displaying recent errors to users)
 * - Persistent error log file (only for internal 'ant' users, stored in ~/.claude/errors/)
 *
 * Usage:
 * ```ts
 * logError(new Error('Failed to connect'))
 * ```
 *
 * To view errors:
 * - Debug: Run `claude --debug` or `tail -f ~/.claude/debug/latest`
 * - In-memory: Call `getInMemoryErrors()` to get recent errors for the current session
 */
const isHardFailMode = (0, memoize_js_1.default)(() => {
    return process.argv.includes('--hard-fail');
});
function logError(error) {
    const err = (0, errors_js_1.toError)(error);
    if ((0, bun_bundle_1.feature)('HARD_FAIL') && isHardFailMode()) {
        // biome-ignore lint/suspicious/noConsole:: intentional crash output
        console.error('[HARD FAIL] logError called with:', err.stack || err.message);
        // eslint-disable-next-line custom-rules/no-process-exit
        process.exit(1);
    }
    try {
        // Check if error reporting should be disabled
        if (
        // Cloud providers (Bedrock/Vertex/Foundry) always disable features
        (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_USE_BEDROCK) ||
            (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_USE_VERTEX) ||
            (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_USE_FOUNDRY) ||
            process.env.DISABLE_ERROR_REPORTING ||
            (0, privacyLevel_js_1.isEssentialTrafficOnly)()) {
            return;
        }
        const errorStr = err.stack || err.message;
        const errorInfo = {
            error: errorStr,
            timestamp: new Date().toISOString(),
        };
        // Always add to in-memory log (no dependencies needed)
        addToInMemoryErrorLog(errorInfo);
        // If sink not attached, queue the event
        if (errorLogSink === null) {
            errorQueue.push({ type: 'error', error: err });
            return;
        }
        errorLogSink.logError(err);
    }
    catch {
        // pass
    }
}
function getInMemoryErrors() {
    return [...inMemoryErrorLog];
}
/**
 * Loads the list of error logs
 * @returns List of error logs sorted by date
 */
function loadErrorLogs() {
    return loadLogList(cachePaths_js_1.CACHE_PATHS.errors());
}
/**
 * Gets an error log by its index
 * @param index Index in the sorted list of logs (0-based)
 * @returns Log data or null if not found
 */
async function getErrorLogByIndex(index) {
    const logs = await loadErrorLogs();
    return logs[index] || null;
}
/**
 * Internal function to load and process logs from a specified path
 * @param path Directory containing logs
 * @returns Array of logs sorted by date
 * @private
 */
async function loadLogList(path) {
    let files;
    try {
        files = await (0, promises_1.readdir)(path, { withFileTypes: true });
    }
    catch {
        logError(new Error(`No logs found at ${path}`));
        return [];
    }
    const logData = await Promise.all(files.map(async (file, i) => {
        const fullPath = (0, path_1.join)(path, file.name);
        const content = await (0, promises_1.readFile)(fullPath, { encoding: 'utf8' });
        const messages = (0, slowOperations_js_1.jsonParse)(content);
        const firstMessage = messages[0];
        const lastMessage = messages[messages.length - 1];
        const firstPrompt = firstMessage?.type === 'user' &&
            typeof firstMessage?.message?.content === 'string'
            ? firstMessage?.message?.content
            : 'No prompt';
        // For new random filenames, we'll get stats from the file itself
        const fileStats = await (0, promises_1.stat)(fullPath);
        // Check if it's a sidechain by looking at filename
        const isSidechain = fullPath.includes('sidechain');
        // For new files, use the file modified time as date
        const date = dateToFilename(fileStats.mtime);
        return {
            date,
            fullPath,
            messages,
            value: i, // hack: overwritten after sorting, right below this
            created: parseISOString(firstMessage?.timestamp || date),
            modified: lastMessage?.timestamp
                ? parseISOString(lastMessage.timestamp)
                : parseISOString(date),
            firstPrompt: firstPrompt.split('\n')[0]?.slice(0, 50) +
                (firstPrompt.length > 50 ? '…' : '') || 'No prompt',
            messageCount: messages.length,
            isSidechain,
        };
    }));
    return (0, logs_js_1.sortLogs)(logData.filter(_ => _ !== null)).map((_, i) => ({
        ..._,
        value: i,
    }));
}
function parseISOString(s) {
    const b = s.split(/\D+/);
    return new Date(Date.UTC(parseInt(b[0], 10), parseInt(b[1], 10) - 1, parseInt(b[2], 10), parseInt(b[3], 10), parseInt(b[4], 10), parseInt(b[5], 10), parseInt(b[6], 10)));
}
function logMCPError(serverName, error) {
    try {
        // If sink not attached, queue the event
        if (errorLogSink === null) {
            errorQueue.push({ type: 'mcpError', serverName, error });
            return;
        }
        errorLogSink.logMCPError(serverName, error);
    }
    catch {
        // Silently fail
    }
}
function logMCPDebug(serverName, message) {
    try {
        // If sink not attached, queue the event
        if (errorLogSink === null) {
            errorQueue.push({ type: 'mcpDebug', serverName, message });
            return;
        }
        errorLogSink.logMCPDebug(serverName, message);
    }
    catch {
        // Silently fail
    }
}
/**
 * Captures the last API request for inclusion in bug reports.
 */
function captureAPIRequest(params, querySource) {
    // startsWith, not exact match — users with non-default output styles get
    // variants like 'repl_main_thread:outputStyle:Explanatory' (querySource.ts).
    if (!querySource || !querySource.startsWith('repl_main_thread')) {
        return;
    }
    // Store params WITHOUT messages to avoid retaining the entire conversation
    // for all users. Messages are already persisted to the transcript file and
    // available via React state.
    const { messages, ...paramsWithoutMessages } = params;
    (0, state_js_1.setLastAPIRequest)(paramsWithoutMessages);
    // For ant users only: also keep a reference to the final messages array so
    // /share's serialized_conversation.json captures the exact post-compaction,
    // CLAUDE.md-injected payload the API received. Overwritten each turn;
    // dumpPrompts.ts already holds 5 full request bodies for ants, so this is
    // not a new retention class.
    (0, state_js_1.setLastAPIRequestMessages)(process.env.USER_TYPE === 'ant' ? messages : null);
}
/**
 * Reset error log state for testing purposes only.
 * @internal
 */
function _resetErrorLogForTesting() {
    errorLogSink = null;
    errorQueue.length = 0;
    inMemoryErrorLog = [];
}
