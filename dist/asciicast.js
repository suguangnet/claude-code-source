"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecordFilePath = getRecordFilePath;
exports._resetRecordingStateForTesting = _resetRecordingStateForTesting;
exports.getSessionRecordingPaths = getSessionRecordingPaths;
exports.renameRecordingForSession = renameRecordingForSession;
exports.flushAsciicastRecorder = flushAsciicastRecorder;
exports.installAsciicastRecorder = installAsciicastRecorder;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const state_js_1 = require("../bootstrap/state.js");
const bufferedWriter_js_1 = require("./bufferedWriter.js");
const cleanupRegistry_js_1 = require("./cleanupRegistry.js");
const debug_js_1 = require("./debug.js");
const envUtils_js_1 = require("./envUtils.js");
const fsOperations_js_1 = require("./fsOperations.js");
const path_js_1 = require("./path.js");
const slowOperations_js_1 = require("./slowOperations.js");
// Mutable recording state — filePath is updated when session ID changes (e.g., --resume)
const recordingState = {
    filePath: null,
    timestamp: 0,
};
/**
 * Get the asciicast recording file path.
 * For ants with CLAUDE_CODE_TERMINAL_RECORDING=1: returns a path.
 * Otherwise: returns null.
 * The path is computed once and cached in recordingState.
 */
function getRecordFilePath() {
    if (recordingState.filePath !== null) {
        return recordingState.filePath;
    }
    if (process.env.USER_TYPE !== 'ant') {
        return null;
    }
    if (!(0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_TERMINAL_RECORDING)) {
        return null;
    }
    // Record alongside the transcript.
    // Each launch gets its own file so --continue produces multiple recordings.
    const projectsDir = (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), 'projects');
    const projectDir = (0, path_1.join)(projectsDir, (0, path_js_1.sanitizePath)((0, state_js_1.getOriginalCwd)()));
    recordingState.timestamp = Date.now();
    recordingState.filePath = (0, path_1.join)(projectDir, `${(0, state_js_1.getSessionId)()}-${recordingState.timestamp}.cast`);
    return recordingState.filePath;
}
function _resetRecordingStateForTesting() {
    recordingState.filePath = null;
    recordingState.timestamp = 0;
}
/**
 * Find all .cast files for the current session.
 * Returns paths sorted by filename (chronological by timestamp suffix).
 */
function getSessionRecordingPaths() {
    const sessionId = (0, state_js_1.getSessionId)();
    const projectsDir = (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), 'projects');
    const projectDir = (0, path_1.join)(projectsDir, (0, path_js_1.sanitizePath)((0, state_js_1.getOriginalCwd)()));
    try {
        // eslint-disable-next-line custom-rules/no-sync-fs -- called during /share before upload, not in hot path
        const entries = (0, fsOperations_js_1.getFsImplementation)().readdirSync(projectDir);
        const names = (typeof entries[0] === 'string'
            ? entries
            : entries.map(e => e.name));
        const files = names
            .filter(f => f.startsWith(sessionId) && f.endsWith('.cast'))
            .sort();
        return files.map(f => (0, path_1.join)(projectDir, f));
    }
    catch {
        return [];
    }
}
/**
 * Rename the recording file to match the current session ID.
 * Called after --resume/--continue changes the session ID via switchSession().
 * The recorder was installed with the initial (random) session ID; this renames
 * the file so getSessionRecordingPaths() can find it by the resumed session ID.
 */
async function renameRecordingForSession() {
    const oldPath = recordingState.filePath;
    if (!oldPath || recordingState.timestamp === 0) {
        return;
    }
    const projectsDir = (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), 'projects');
    const projectDir = (0, path_1.join)(projectsDir, (0, path_js_1.sanitizePath)((0, state_js_1.getOriginalCwd)()));
    const newPath = (0, path_1.join)(projectDir, `${(0, state_js_1.getSessionId)()}-${recordingState.timestamp}.cast`);
    if (oldPath === newPath) {
        return;
    }
    // Flush pending writes before renaming
    await recorder?.flush();
    const oldName = (0, path_1.basename)(oldPath);
    const newName = (0, path_1.basename)(newPath);
    try {
        await (0, promises_1.rename)(oldPath, newPath);
        recordingState.filePath = newPath;
        (0, debug_js_1.logForDebugging)(`[asciicast] Renamed recording: ${oldName} → ${newName}`);
    }
    catch {
        (0, debug_js_1.logForDebugging)(`[asciicast] Failed to rename recording from ${oldName} to ${newName}`);
    }
}
let recorder = null;
function getTerminalSize() {
    // Direct access to stdout dimensions — not in a React component
    // eslint-disable-next-line custom-rules/prefer-use-terminal-size
    const cols = process.stdout.columns || 80;
    // eslint-disable-next-line custom-rules/prefer-use-terminal-size
    const rows = process.stdout.rows || 24;
    return { cols, rows };
}
/**
 * Flush pending recording data to disk.
 * Call before reading the .cast file (e.g., during /share).
 */
async function flushAsciicastRecorder() {
    await recorder?.flush();
}
/**
 * Install the asciicast recorder.
 * Wraps process.stdout.write to capture all terminal output with timestamps.
 * Must be called before Ink mounts.
 */
function installAsciicastRecorder() {
    const filePath = getRecordFilePath();
    if (!filePath) {
        return;
    }
    const { cols, rows } = getTerminalSize();
    const startTime = performance.now();
    // Write the asciicast v2 header
    const header = (0, slowOperations_js_1.jsonStringify)({
        version: 2,
        width: cols,
        height: rows,
        timestamp: Math.floor(Date.now() / 1000),
        env: {
            SHELL: process.env.SHELL || '',
            TERM: process.env.TERM || '',
        },
    });
    try {
        // eslint-disable-next-line custom-rules/no-sync-fs -- one-time init before Ink mounts
        (0, fsOperations_js_1.getFsImplementation)().mkdirSync((0, path_1.dirname)(filePath));
    }
    catch {
        // Directory may already exist
    }
    // eslint-disable-next-line custom-rules/no-sync-fs -- one-time init before Ink mounts
    (0, fsOperations_js_1.getFsImplementation)().appendFileSync(filePath, header + '\n', { mode: 0o600 });
    let pendingWrite = Promise.resolve();
    const writer = (0, bufferedWriter_js_1.createBufferedWriter)({
        writeFn(content) {
            // Use recordingState.filePath (mutable) so writes follow renames from --resume
            const currentPath = recordingState.filePath;
            if (!currentPath) {
                return;
            }
            pendingWrite = pendingWrite
                .then(() => (0, promises_1.appendFile)(currentPath, content))
                .catch(() => {
                // Silently ignore write errors — don't break the session
            });
        },
        flushIntervalMs: 500,
        maxBufferSize: 50,
        maxBufferBytes: 10 * 1024 * 1024, // 10MB
    });
    // Wrap process.stdout.write to capture output
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = function (chunk, encodingOrCb, cb) {
        // Record the output event
        const elapsed = (performance.now() - startTime) / 1000;
        const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
        writer.write((0, slowOperations_js_1.jsonStringify)([elapsed, 'o', text]) + '\n');
        // Pass through to the real stdout
        if (typeof encodingOrCb === 'function') {
            return originalWrite(chunk, encodingOrCb);
        }
        return originalWrite(chunk, encodingOrCb, cb);
    };
    // Handle terminal resize events
    function onResize() {
        const elapsed = (performance.now() - startTime) / 1000;
        const { cols: newCols, rows: newRows } = getTerminalSize();
        writer.write((0, slowOperations_js_1.jsonStringify)([elapsed, 'r', `${newCols}x${newRows}`]) + '\n');
    }
    process.stdout.on('resize', onResize);
    recorder = {
        async flush() {
            writer.flush();
            await pendingWrite;
        },
        async dispose() {
            writer.dispose();
            await pendingWrite;
            process.stdout.removeListener('resize', onResize);
            process.stdout.write = originalWrite;
        },
    };
    (0, cleanupRegistry_js_1.registerCleanup)(async () => {
        await recorder?.dispose();
        recorder = null;
    });
    (0, debug_js_1.logForDebugging)(`[asciicast] Recording to ${filePath}`);
}
