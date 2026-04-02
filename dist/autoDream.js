"use strict";
// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
// Background memory consolidation. Fires the /dream prompt as a forked
// subagent when time-gate passes AND enough sessions have accumulated.
//
// Gate order (cheapest first):
//   1. Time: hours since lastConsolidatedAt >= minHours (one stat)
//   2. Sessions: transcript count with mtime > lastConsolidatedAt >= minSessions
//   3. Lock: no other process mid-consolidation
//
// State is closure-scoped inside initAutoDream() rather than module-level
// (tests call initAutoDream() in beforeEach for a fresh closure).
Object.defineProperty(exports, "__esModule", { value: true });
exports.initAutoDream = initAutoDream;
exports.executeAutoDream = executeAutoDream;
const forkedAgent_js_1 = require("../../utils/forkedAgent.js");
const messages_js_1 = require("../../utils/messages.js");
const debug_js_1 = require("../../utils/debug.js");
const index_js_1 = require("../analytics/index.js");
const growthbook_js_1 = require("../analytics/growthbook.js");
const paths_js_1 = require("../../memdir/paths.js");
const config_js_1 = require("./config.js");
const sessionStorage_js_1 = require("../../utils/sessionStorage.js");
const state_js_1 = require("../../bootstrap/state.js");
const extractMemories_js_1 = require("../extractMemories/extractMemories.js");
const consolidationPrompt_js_1 = require("./consolidationPrompt.js");
const consolidationLock_js_1 = require("./consolidationLock.js");
const DreamTask_js_1 = require("../../tasks/DreamTask/DreamTask.js");
const constants_js_1 = require("../../tools/FileEditTool/constants.js");
const prompt_js_1 = require("../../tools/FileWriteTool/prompt.js");
// Scan throttle: when time-gate passes but session-gate doesn't, the lock
// mtime doesn't advance, so the time-gate keeps passing every turn.
const SESSION_SCAN_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULTS = {
    minHours: 24,
    minSessions: 5,
};
/**
 * Thresholds from tengu_onyx_plover. The enabled gate lives in config.ts
 * (isAutoDreamEnabled); this returns only the scheduling knobs. Defensive
 * per-field validation since GB cache can return stale wrong-type values.
 */
function getConfig() {
    const raw = (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_onyx_plover', null);
    return {
        minHours: typeof raw?.minHours === 'number' &&
            Number.isFinite(raw.minHours) &&
            raw.minHours > 0
            ? raw.minHours
            : DEFAULTS.minHours,
        minSessions: typeof raw?.minSessions === 'number' &&
            Number.isFinite(raw.minSessions) &&
            raw.minSessions > 0
            ? raw.minSessions
            : DEFAULTS.minSessions,
    };
}
function isGateOpen() {
    if ((0, state_js_1.getKairosActive)())
        return false; // KAIROS mode uses disk-skill dream
    if ((0, state_js_1.getIsRemoteMode)())
        return false;
    if (!(0, paths_js_1.isAutoMemoryEnabled)())
        return false;
    return (0, config_js_1.isAutoDreamEnabled)();
}
// Ant-build-only test override. Bypasses enabled/time/session gates but NOT
// the lock (so repeated turns don't pile up dreams) or the memory-dir
// precondition. Still scans sessions so the prompt's session-hint is populated.
function isForced() {
    return false;
}
let runner = null;
/**
 * Call once at startup (from backgroundHousekeeping alongside
 * initExtractMemories), or per-test in beforeEach for a fresh closure.
 */
function initAutoDream() {
    let lastSessionScanAt = 0;
    runner = async function runAutoDream(context, appendSystemMessage) {
        const cfg = getConfig();
        const force = isForced();
        if (!force && !isGateOpen())
            return;
        // --- Time gate ---
        let lastAt;
        try {
            lastAt = await (0, consolidationLock_js_1.readLastConsolidatedAt)();
        }
        catch (e) {
            (0, debug_js_1.logForDebugging)(`[autoDream] readLastConsolidatedAt failed: ${e.message}`);
            return;
        }
        const hoursSince = (Date.now() - lastAt) / 3600000;
        if (!force && hoursSince < cfg.minHours)
            return;
        // --- Scan throttle ---
        const sinceScanMs = Date.now() - lastSessionScanAt;
        if (!force && sinceScanMs < SESSION_SCAN_INTERVAL_MS) {
            (0, debug_js_1.logForDebugging)(`[autoDream] scan throttle — time-gate passed but last scan was ${Math.round(sinceScanMs / 1000)}s ago`);
            return;
        }
        lastSessionScanAt = Date.now();
        // --- Session gate ---
        let sessionIds;
        try {
            sessionIds = await (0, consolidationLock_js_1.listSessionsTouchedSince)(lastAt);
        }
        catch (e) {
            (0, debug_js_1.logForDebugging)(`[autoDream] listSessionsTouchedSince failed: ${e.message}`);
            return;
        }
        // Exclude the current session (its mtime is always recent).
        const currentSession = (0, state_js_1.getSessionId)();
        sessionIds = sessionIds.filter(id => id !== currentSession);
        if (!force && sessionIds.length < cfg.minSessions) {
            (0, debug_js_1.logForDebugging)(`[autoDream] skip — ${sessionIds.length} sessions since last consolidation, need ${cfg.minSessions}`);
            return;
        }
        // --- Lock ---
        // Under force, skip acquire entirely — use the existing mtime so
        // kill's rollback is a no-op (rewinds to where it already is).
        // The lock file stays untouched; next non-force turn sees it as-is.
        let priorMtime;
        if (force) {
            priorMtime = lastAt;
        }
        else {
            try {
                priorMtime = await (0, consolidationLock_js_1.tryAcquireConsolidationLock)();
            }
            catch (e) {
                (0, debug_js_1.logForDebugging)(`[autoDream] lock acquire failed: ${e.message}`);
                return;
            }
            if (priorMtime === null)
                return;
        }
        (0, debug_js_1.logForDebugging)(`[autoDream] firing — ${hoursSince.toFixed(1)}h since last, ${sessionIds.length} sessions to review`);
        (0, index_js_1.logEvent)('tengu_auto_dream_fired', {
            hours_since: Math.round(hoursSince),
            sessions_since: sessionIds.length,
        });
        const setAppState = context.toolUseContext.setAppStateForTasks ??
            context.toolUseContext.setAppState;
        const abortController = new AbortController();
        const taskId = (0, DreamTask_js_1.registerDreamTask)(setAppState, {
            sessionsReviewing: sessionIds.length,
            priorMtime,
            abortController,
        });
        try {
            const memoryRoot = (0, paths_js_1.getAutoMemPath)();
            const transcriptDir = (0, sessionStorage_js_1.getProjectDir)((0, state_js_1.getOriginalCwd)());
            // Tool constraints note goes in `extra`, not the shared prompt body —
            // manual /dream runs in the main loop with normal permissions and this
            // would be misleading there.
            const extra = `

**Tool constraints for this run:** Bash is restricted to read-only commands (\`ls\`, \`find\`, \`grep\`, \`cat\`, \`stat\`, \`wc\`, \`head\`, \`tail\`, and similar). Anything that writes, redirects to a file, or modifies state will be denied. Plan your exploration with this in mind — no need to probe.

Sessions since last consolidation (${sessionIds.length}):
${sessionIds.map(id => `- ${id}`).join('\n')}`;
            const prompt = (0, consolidationPrompt_js_1.buildConsolidationPrompt)(memoryRoot, transcriptDir, extra);
            const result = await (0, forkedAgent_js_1.runForkedAgent)({
                promptMessages: [(0, messages_js_1.createUserMessage)({ content: prompt })],
                cacheSafeParams: (0, forkedAgent_js_1.createCacheSafeParams)(context),
                canUseTool: (0, extractMemories_js_1.createAutoMemCanUseTool)(memoryRoot),
                querySource: 'auto_dream',
                forkLabel: 'auto_dream',
                skipTranscript: true,
                overrides: { abortController },
                onMessage: makeDreamProgressWatcher(taskId, setAppState),
            });
            (0, DreamTask_js_1.completeDreamTask)(taskId, setAppState);
            // Inline completion summary in the main transcript (same surface as
            // extractMemories's "Saved N memories" message).
            const dreamState = context.toolUseContext.getAppState().tasks?.[taskId];
            if (appendSystemMessage &&
                (0, DreamTask_js_1.isDreamTask)(dreamState) &&
                dreamState.filesTouched.length > 0) {
                appendSystemMessage({
                    ...(0, messages_js_1.createMemorySavedMessage)(dreamState.filesTouched),
                    verb: 'Improved',
                });
            }
            (0, debug_js_1.logForDebugging)(`[autoDream] completed — cache: read=${result.totalUsage.cache_read_input_tokens} created=${result.totalUsage.cache_creation_input_tokens}`);
            (0, index_js_1.logEvent)('tengu_auto_dream_completed', {
                cache_read: result.totalUsage.cache_read_input_tokens,
                cache_created: result.totalUsage.cache_creation_input_tokens,
                output: result.totalUsage.output_tokens,
                sessions_reviewed: sessionIds.length,
            });
        }
        catch (e) {
            // If the user killed from the bg-tasks dialog, DreamTask.kill already
            // aborted, rolled back the lock, and set status=killed. Don't overwrite
            // or double-rollback.
            if (abortController.signal.aborted) {
                (0, debug_js_1.logForDebugging)('[autoDream] aborted by user');
                return;
            }
            (0, debug_js_1.logForDebugging)(`[autoDream] fork failed: ${e.message}`);
            (0, index_js_1.logEvent)('tengu_auto_dream_failed', {});
            (0, DreamTask_js_1.failDreamTask)(taskId, setAppState);
            // Rewind mtime so time-gate passes again. Scan throttle is the backoff.
            await (0, consolidationLock_js_1.rollbackConsolidationLock)(priorMtime);
        }
    };
}
/**
 * Watch the forked agent's messages. For each assistant turn, extracts any
 * text blocks (the agent's reasoning/summary — what the user wants to see)
 * and collapses tool_use blocks to a count. Edit/Write file_paths are
 * collected for phase-flip + the inline completion message.
 */
function makeDreamProgressWatcher(taskId, setAppState) {
    return msg => {
        if (msg.type !== 'assistant')
            return;
        let text = '';
        let toolUseCount = 0;
        const touchedPaths = [];
        for (const block of msg.message.content) {
            if (block.type === 'text') {
                text += block.text;
            }
            else if (block.type === 'tool_use') {
                toolUseCount++;
                if (block.name === constants_js_1.FILE_EDIT_TOOL_NAME ||
                    block.name === prompt_js_1.FILE_WRITE_TOOL_NAME) {
                    const input = block.input;
                    if (typeof input.file_path === 'string') {
                        touchedPaths.push(input.file_path);
                    }
                }
            }
        }
        (0, DreamTask_js_1.addDreamTurn)(taskId, { text: text.trim(), toolUseCount }, touchedPaths, setAppState);
    };
}
/**
 * Entry point from stopHooks. No-op until initAutoDream() has been called.
 * Per-turn cost when enabled: one GB cache read + one stat.
 */
async function executeAutoDream(context, appendSystemMessage) {
    await runner?.(context, appendSystemMessage);
}
