"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPastedTextRefNumLines = getPastedTextRefNumLines;
exports.formatPastedTextRef = formatPastedTextRef;
exports.formatImageRef = formatImageRef;
exports.parseReferences = parseReferences;
exports.expandPastedTextRefs = expandPastedTextRefs;
exports.makeHistoryReader = makeHistoryReader;
exports.getTimestampedHistory = getTimestampedHistory;
exports.getHistory = getHistory;
exports.addToHistory = addToHistory;
exports.clearPendingHistoryEntries = clearPendingHistoryEntries;
exports.removeLastFromHistory = removeLastFromHistory;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const state_js_1 = require("./bootstrap/state.js");
const cleanupRegistry_js_1 = require("./utils/cleanupRegistry.js");
const debug_js_1 = require("./utils/debug.js");
const envUtils_js_1 = require("./utils/envUtils.js");
const errors_js_1 = require("./utils/errors.js");
const fsOperations_js_1 = require("./utils/fsOperations.js");
const lockfile_js_1 = require("./utils/lockfile.js");
const pasteStore_js_1 = require("./utils/pasteStore.js");
const sleep_js_1 = require("./utils/sleep.js");
const slowOperations_js_1 = require("./utils/slowOperations.js");
const MAX_HISTORY_ITEMS = 100;
const MAX_PASTED_CONTENT_LENGTH = 1024;
/**
 * Claude Code parses history for pasted content references to match back to
 * pasted content. The references look like:
 *   Text: [Pasted text #1 +10 lines]
 *   Image: [Image #2]
 * The numbers are expected to be unique within a single prompt but not across
 * prompts. We choose numeric, auto-incrementing IDs as they are more
 * user-friendly than other ID options.
 */
// Note: The original text paste implementation would consider input like
// "line1\nline2\nline3" to have +2 lines, not 3 lines. We preserve that
// behavior here.
function getPastedTextRefNumLines(text) {
    return (text.match(/\r\n|\r|\n/g) || []).length;
}
function formatPastedTextRef(id, numLines) {
    if (numLines === 0) {
        return `[Pasted text #${id}]`;
    }
    return `[Pasted text #${id} +${numLines} lines]`;
}
function formatImageRef(id) {
    return `[Image #${id}]`;
}
function parseReferences(input) {
    const referencePattern = /\[(Pasted text|Image|\.\.\.Truncated text) #(\d+)(?: \+\d+ lines)?(\.)*\]/g;
    const matches = [...input.matchAll(referencePattern)];
    return matches
        .map(match => ({
        id: parseInt(match[2] || '0'),
        match: match[0],
        index: match.index,
    }))
        .filter(match => match.id > 0);
}
/**
 * Replace [Pasted text #N] placeholders in input with their actual content.
 * Image refs are left alone — they become content blocks, not inlined text.
 */
function expandPastedTextRefs(input, pastedContents) {
    const refs = parseReferences(input);
    let expanded = input;
    // Splice at the original match offsets so placeholder-like strings inside
    // pasted content are never confused for real refs. Reverse order keeps
    // earlier offsets valid after later replacements.
    for (let i = refs.length - 1; i >= 0; i--) {
        const ref = refs[i];
        const content = pastedContents[ref.id];
        if (content?.type !== 'text')
            continue;
        expanded =
            expanded.slice(0, ref.index) +
                content.content +
                expanded.slice(ref.index + ref.match.length);
    }
    return expanded;
}
function deserializeLogEntry(line) {
    return (0, slowOperations_js_1.jsonParse)(line);
}
async function* makeLogEntryReader() {
    const currentSession = (0, state_js_1.getSessionId)();
    // Start with entries that have yet to be flushed to disk
    for (let i = pendingEntries.length - 1; i >= 0; i--) {
        yield pendingEntries[i];
    }
    // Read from global history file (shared across all projects)
    const historyPath = (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), 'history.jsonl');
    try {
        for await (const line of (0, fsOperations_js_1.readLinesReverse)(historyPath)) {
            try {
                const entry = deserializeLogEntry(line);
                // removeLastFromHistory slow path: entry was flushed before removal,
                // so filter here so both getHistory (Up-arrow) and makeHistoryReader
                // (ctrl+r search) skip it consistently.
                if (entry.sessionId === currentSession &&
                    skippedTimestamps.has(entry.timestamp)) {
                    continue;
                }
                yield entry;
            }
            catch (error) {
                // Not a critical error - just skip malformed lines
                (0, debug_js_1.logForDebugging)(`Failed to parse history line: ${error}`);
            }
        }
    }
    catch (e) {
        const code = (0, errors_js_1.getErrnoCode)(e);
        if (code === 'ENOENT') {
            return;
        }
        throw e;
    }
}
async function* makeHistoryReader() {
    for await (const entry of makeLogEntryReader()) {
        yield await logEntryToHistoryEntry(entry);
    }
}
/**
 * Current-project history for the ctrl+r picker: deduped by display text,
 * newest first, with timestamps. Paste contents are resolved lazily via
 * `resolve()` — the picker only reads display+timestamp for the list.
 */
async function* getTimestampedHistory() {
    const currentProject = (0, state_js_1.getProjectRoot)();
    const seen = new Set();
    for await (const entry of makeLogEntryReader()) {
        if (!entry || typeof entry.project !== 'string')
            continue;
        if (entry.project !== currentProject)
            continue;
        if (seen.has(entry.display))
            continue;
        seen.add(entry.display);
        yield {
            display: entry.display,
            timestamp: entry.timestamp,
            resolve: () => logEntryToHistoryEntry(entry),
        };
        if (seen.size >= MAX_HISTORY_ITEMS)
            return;
    }
}
/**
 * Get history entries for the current project, with current session's entries first.
 *
 * Entries from the current session are yielded before entries from other sessions,
 * so concurrent sessions don't interleave their up-arrow history. Within each group,
 * order is newest-first. Scans the same MAX_HISTORY_ITEMS window as before —
 * entries are reordered within that window, not beyond it.
 */
async function* getHistory() {
    const currentProject = (0, state_js_1.getProjectRoot)();
    const currentSession = (0, state_js_1.getSessionId)();
    const otherSessionEntries = [];
    let yielded = 0;
    for await (const entry of makeLogEntryReader()) {
        // Skip malformed entries (corrupted file, old format, or invalid JSON structure)
        if (!entry || typeof entry.project !== 'string')
            continue;
        if (entry.project !== currentProject)
            continue;
        if (entry.sessionId === currentSession) {
            yield await logEntryToHistoryEntry(entry);
            yielded++;
        }
        else {
            otherSessionEntries.push(entry);
        }
        // Same MAX_HISTORY_ITEMS window as before — just reordered within it.
        if (yielded + otherSessionEntries.length >= MAX_HISTORY_ITEMS)
            break;
    }
    for (const entry of otherSessionEntries) {
        if (yielded >= MAX_HISTORY_ITEMS)
            return;
        yield await logEntryToHistoryEntry(entry);
        yielded++;
    }
}
/**
 * Resolve stored paste content to full PastedContent by fetching from paste store if needed.
 */
async function resolveStoredPastedContent(stored) {
    // If we have inline content, use it directly
    if (stored.content) {
        return {
            id: stored.id,
            type: stored.type,
            content: stored.content,
            mediaType: stored.mediaType,
            filename: stored.filename,
        };
    }
    // If we have a hash reference, fetch from paste store
    if (stored.contentHash) {
        const content = await (0, pasteStore_js_1.retrievePastedText)(stored.contentHash);
        if (content) {
            return {
                id: stored.id,
                type: stored.type,
                content,
                mediaType: stored.mediaType,
                filename: stored.filename,
            };
        }
    }
    // Content not available
    return null;
}
/**
 * Convert LogEntry to HistoryEntry by resolving paste store references.
 */
async function logEntryToHistoryEntry(entry) {
    const pastedContents = {};
    for (const [id, stored] of Object.entries(entry.pastedContents || {})) {
        const resolved = await resolveStoredPastedContent(stored);
        if (resolved) {
            pastedContents[Number(id)] = resolved;
        }
    }
    return {
        display: entry.display,
        pastedContents,
    };
}
let pendingEntries = [];
let isWriting = false;
let currentFlushPromise = null;
let cleanupRegistered = false;
let lastAddedEntry = null;
// Timestamps of entries already flushed to disk that should be skipped when
// reading. Used by removeLastFromHistory when the entry has raced past the
// pending buffer. Session-scoped (module state resets on process restart).
const skippedTimestamps = new Set();
// Core flush logic - writes pending entries to disk
async function immediateFlushHistory() {
    if (pendingEntries.length === 0) {
        return;
    }
    let release;
    try {
        const historyPath = (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), 'history.jsonl');
        // Ensure the file exists before acquiring lock (append mode creates if missing)
        await (0, promises_1.writeFile)(historyPath, '', {
            encoding: 'utf8',
            mode: 0o600,
            flag: 'a',
        });
        release = await (0, lockfile_js_1.lock)(historyPath, {
            stale: 10000,
            retries: {
                retries: 3,
                minTimeout: 50,
            },
        });
        const jsonLines = pendingEntries.map(entry => (0, slowOperations_js_1.jsonStringify)(entry) + '\n');
        pendingEntries = [];
        await (0, promises_1.appendFile)(historyPath, jsonLines.join(''), { mode: 0o600 });
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`Failed to write prompt history: ${error}`);
    }
    finally {
        if (release) {
            await release();
        }
    }
}
async function flushPromptHistory(retries) {
    if (isWriting || pendingEntries.length === 0) {
        return;
    }
    // Stop trying to flush history until the next user prompt
    if (retries > 5) {
        return;
    }
    isWriting = true;
    try {
        await immediateFlushHistory();
    }
    finally {
        isWriting = false;
        if (pendingEntries.length > 0) {
            // Avoid trying again in a hot loop
            await (0, sleep_js_1.sleep)(500);
            void flushPromptHistory(retries + 1);
        }
    }
}
async function addToPromptHistory(command) {
    const entry = typeof command === 'string'
        ? { display: command, pastedContents: {} }
        : command;
    const storedPastedContents = {};
    if (entry.pastedContents) {
        for (const [id, content] of Object.entries(entry.pastedContents)) {
            // Filter out images (they're stored separately in image-cache)
            if (content.type === 'image') {
                continue;
            }
            // For small text content, store inline
            if (content.content.length <= MAX_PASTED_CONTENT_LENGTH) {
                storedPastedContents[Number(id)] = {
                    id: content.id,
                    type: content.type,
                    content: content.content,
                    mediaType: content.mediaType,
                    filename: content.filename,
                };
            }
            else {
                // For large text content, compute hash synchronously and store reference
                // The actual disk write happens async (fire-and-forget)
                const hash = (0, pasteStore_js_1.hashPastedText)(content.content);
                storedPastedContents[Number(id)] = {
                    id: content.id,
                    type: content.type,
                    contentHash: hash,
                    mediaType: content.mediaType,
                    filename: content.filename,
                };
                // Fire-and-forget disk write - don't block history entry creation
                void (0, pasteStore_js_1.storePastedText)(hash, content.content);
            }
        }
    }
    const logEntry = {
        ...entry,
        pastedContents: storedPastedContents,
        timestamp: Date.now(),
        project: (0, state_js_1.getProjectRoot)(),
        sessionId: (0, state_js_1.getSessionId)(),
    };
    pendingEntries.push(logEntry);
    lastAddedEntry = logEntry;
    currentFlushPromise = flushPromptHistory(0);
    void currentFlushPromise;
}
function addToHistory(command) {
    // Skip history when running in a tmux session spawned by Claude Code's Tungsten tool.
    // This prevents verification/test sessions from polluting the user's real command history.
    if ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_SKIP_PROMPT_HISTORY)) {
        return;
    }
    // Register cleanup on first use
    if (!cleanupRegistered) {
        cleanupRegistered = true;
        (0, cleanupRegistry_js_1.registerCleanup)(async () => {
            // If there's an in-progress flush, wait for it
            if (currentFlushPromise) {
                await currentFlushPromise;
            }
            // If there are still pending entries after the flush completed, do one final flush
            if (pendingEntries.length > 0) {
                await immediateFlushHistory();
            }
        });
    }
    void addToPromptHistory(command);
}
function clearPendingHistoryEntries() {
    pendingEntries = [];
    lastAddedEntry = null;
    skippedTimestamps.clear();
}
/**
 * Undo the most recent addToHistory call. Used by auto-restore-on-interrupt:
 * when Esc rewinds the conversation before any response arrives, the submit is
 * semantically undone — the history entry should be too, otherwise Up-arrow
 * shows the restored text twice (once from the input box, once from disk).
 *
 * Fast path pops from the pending buffer. If the async flush already won the
 * race (TTFT is typically >> disk write latency), the entry's timestamp is
 * added to a skip-set consulted by getHistory. One-shot: clears the tracked
 * entry so a second call is a no-op.
 */
function removeLastFromHistory() {
    if (!lastAddedEntry)
        return;
    const entry = lastAddedEntry;
    lastAddedEntry = null;
    const idx = pendingEntries.lastIndexOf(entry);
    if (idx !== -1) {
        pendingEntries.splice(idx, 1);
    }
    else {
        skippedTimestamps.add(entry.timestamp);
    }
}
