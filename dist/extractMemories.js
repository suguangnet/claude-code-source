"use strict";
/**
 * Extracts durable memories from the current session transcript
 * and writes them to the auto-memory directory (~/.claude/projects/<path>/memory/).
 *
 * It runs once at the end of each complete query loop (when the model produces
 * a final response with no tool calls) via handleStopHooks in stopHooks.ts.
 *
 * Uses the forked agent pattern (runForkedAgent) — a perfect fork of the main
 * conversation that shares the parent's prompt cache.
 *
 * State is closure-scoped inside initExtractMemories() rather than module-level,
 * following the same pattern as confidenceRating.ts. Tests call
 * initExtractMemories() in beforeEach to get a fresh closure.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAutoMemCanUseTool = createAutoMemCanUseTool;
exports.initExtractMemories = initExtractMemories;
exports.executeExtractMemories = executeExtractMemories;
exports.drainPendingExtraction = drainPendingExtraction;
const bun_bundle_1 = require("bun:bundle");
const path_1 = require("path");
const state_js_1 = require("../../bootstrap/state.js");
const memdir_js_1 = require("../../memdir/memdir.js");
const memoryScan_js_1 = require("../../memdir/memoryScan.js");
const paths_js_1 = require("../../memdir/paths.js");
const toolName_js_1 = require("../../tools/BashTool/toolName.js");
const constants_js_1 = require("../../tools/FileEditTool/constants.js");
const prompt_js_1 = require("../../tools/FileReadTool/prompt.js");
const prompt_js_2 = require("../../tools/FileWriteTool/prompt.js");
const prompt_js_3 = require("../../tools/GlobTool/prompt.js");
const prompt_js_4 = require("../../tools/GrepTool/prompt.js");
const constants_js_2 = require("../../tools/REPLTool/constants.js");
const abortController_js_1 = require("../../utils/abortController.js");
const array_js_1 = require("../../utils/array.js");
const debug_js_1 = require("../../utils/debug.js");
const forkedAgent_js_1 = require("../../utils/forkedAgent.js");
const messages_js_1 = require("../../utils/messages.js");
const growthbook_js_1 = require("../analytics/growthbook.js");
const index_js_1 = require("../analytics/index.js");
const metadata_js_1 = require("../analytics/metadata.js");
const prompts_js_1 = require("./prompts.js");
/* eslint-disable @typescript-eslint/no-require-imports */
const teamMemPaths = (0, bun_bundle_1.feature)('TEAMMEM')
    ? require('../../memdir/teamMemPaths.js')
    : null;
/* eslint-enable @typescript-eslint/no-require-imports */
// ============================================================================
// Helpers
// ============================================================================
/**
 * Returns true if a message is visible to the model (sent in API calls).
 * Excludes progress, system, and attachment messages.
 */
function isModelVisibleMessage(message) {
    return message.type === 'user' || message.type === 'assistant';
}
function countModelVisibleMessagesSince(messages, sinceUuid) {
    if (sinceUuid === null || sinceUuid === undefined) {
        return (0, array_js_1.count)(messages, isModelVisibleMessage);
    }
    let foundStart = false;
    let n = 0;
    for (const message of messages) {
        if (!foundStart) {
            if (message.uuid === sinceUuid) {
                foundStart = true;
            }
            continue;
        }
        if (isModelVisibleMessage(message)) {
            n++;
        }
    }
    // If sinceUuid was not found (e.g., removed by context compaction),
    // fall back to counting all model-visible messages rather than returning 0
    // which would permanently disable extraction for the rest of the session.
    if (!foundStart) {
        return (0, array_js_1.count)(messages, isModelVisibleMessage);
    }
    return n;
}
/**
 * Returns true if any assistant message after the cursor UUID contains a
 * Write/Edit tool_use block targeting an auto-memory path.
 *
 * The main agent's prompt has full save instructions — when it writes
 * memories, the forked extraction is redundant. runExtraction skips the
 * agent and advances the cursor past this range, making the main agent
 * and the background agent mutually exclusive per turn.
 */
function hasMemoryWritesSince(messages, sinceUuid) {
    let foundStart = sinceUuid === undefined;
    for (const message of messages) {
        if (!foundStart) {
            if (message.uuid === sinceUuid) {
                foundStart = true;
            }
            continue;
        }
        if (message.type !== 'assistant') {
            continue;
        }
        const content = message.message.content;
        if (!Array.isArray(content)) {
            continue;
        }
        for (const block of content) {
            const filePath = getWrittenFilePath(block);
            if (filePath !== undefined && (0, paths_js_1.isAutoMemPath)(filePath)) {
                return true;
            }
        }
    }
    return false;
}
// ============================================================================
// Tool Permissions
// ============================================================================
function denyAutoMemTool(tool, reason) {
    (0, debug_js_1.logForDebugging)(`[autoMem] denied ${tool.name}: ${reason}`);
    (0, index_js_1.logEvent)('tengu_auto_mem_tool_denied', {
        tool_name: (0, metadata_js_1.sanitizeToolNameForAnalytics)(tool.name),
    });
    return {
        behavior: 'deny',
        message: reason,
        decisionReason: { type: 'other', reason },
    };
}
/**
 * Creates a canUseTool function that allows Read/Grep/Glob (unrestricted),
 * read-only Bash commands, and Edit/Write only for paths within the
 * auto-memory directory. Shared by extractMemories and autoDream.
 */
function createAutoMemCanUseTool(memoryDir) {
    return async (tool, input) => {
        // Allow REPL — when REPL mode is enabled (ant-default), primitive tools
        // are hidden from the tool list so the forked agent calls REPL instead.
        // REPL's VM context re-invokes this canUseTool for each inner primitive
        // (toolWrappers.ts createToolWrapper), so the Read/Bash/Edit/Write checks
        // below still gate the actual file and shell operations. Giving the fork a
        // different tool list would break prompt cache sharing (tools are part of
        // the cache key — see CacheSafeParams in forkedAgent.ts).
        if (tool.name === constants_js_2.REPL_TOOL_NAME) {
            return { behavior: 'allow', updatedInput: input };
        }
        // Allow Read/Grep/Glob unrestricted — all inherently read-only
        if (tool.name === prompt_js_1.FILE_READ_TOOL_NAME ||
            tool.name === prompt_js_4.GREP_TOOL_NAME ||
            tool.name === prompt_js_3.GLOB_TOOL_NAME) {
            return { behavior: 'allow', updatedInput: input };
        }
        // Allow Bash only for commands that pass BashTool.isReadOnly.
        // `tool` IS BashTool here — no static import needed.
        if (tool.name === toolName_js_1.BASH_TOOL_NAME) {
            const parsed = tool.inputSchema.safeParse(input);
            if (parsed.success && tool.isReadOnly(parsed.data)) {
                return { behavior: 'allow', updatedInput: input };
            }
            return denyAutoMemTool(tool, 'Only read-only shell commands are permitted in this context (ls, find, grep, cat, stat, wc, head, tail, and similar)');
        }
        if ((tool.name === constants_js_1.FILE_EDIT_TOOL_NAME ||
            tool.name === prompt_js_2.FILE_WRITE_TOOL_NAME) &&
            'file_path' in input) {
            const filePath = input.file_path;
            if (typeof filePath === 'string' && (0, paths_js_1.isAutoMemPath)(filePath)) {
                return { behavior: 'allow', updatedInput: input };
            }
        }
        return denyAutoMemTool(tool, `only ${prompt_js_1.FILE_READ_TOOL_NAME}, ${prompt_js_4.GREP_TOOL_NAME}, ${prompt_js_3.GLOB_TOOL_NAME}, read-only ${toolName_js_1.BASH_TOOL_NAME}, and ${constants_js_1.FILE_EDIT_TOOL_NAME}/${prompt_js_2.FILE_WRITE_TOOL_NAME} within ${memoryDir} are allowed`);
    };
}
// ============================================================================
// Extract file paths from agent output
// ============================================================================
/**
 * Extract file_path from a tool_use block's input, if present.
 * Returns undefined when the block is not an Edit/Write tool use or has no file_path.
 */
function getWrittenFilePath(block) {
    if (block.type !== 'tool_use' ||
        (block.name !== constants_js_1.FILE_EDIT_TOOL_NAME && block.name !== prompt_js_2.FILE_WRITE_TOOL_NAME)) {
        return undefined;
    }
    const input = block.input;
    if (typeof input === 'object' && input !== null && 'file_path' in input) {
        const fp = input.file_path;
        return typeof fp === 'string' ? fp : undefined;
    }
    return undefined;
}
function extractWrittenPaths(agentMessages) {
    const paths = [];
    for (const message of agentMessages) {
        if (message.type !== 'assistant') {
            continue;
        }
        const content = message.message.content;
        if (!Array.isArray(content)) {
            continue;
        }
        for (const block of content) {
            const filePath = getWrittenFilePath(block);
            if (filePath !== undefined) {
                paths.push(filePath);
            }
        }
    }
    return (0, array_js_1.uniq)(paths);
}
/** The active extractor function, set by initExtractMemories(). */
let extractor = null;
/** The active drain function, set by initExtractMemories(). No-op until init. */
let drainer = async () => { };
/**
 * Initialize the memory extraction system.
 * Creates a fresh closure that captures all mutable state (cursor position,
 * overlap guard, pending context). Call once at startup alongside
 * initConfidenceRating/initPromptCoaching, or per-test in beforeEach.
 */
function initExtractMemories() {
    // --- Closure-scoped mutable state ---
    /** Every promise handed out by the extractor that hasn't settled yet.
     *  Coalesced calls that stash-and-return add fast-resolving promises
     *  (harmless); the call that starts real work adds a promise covering the
     *  full trailing-run chain via runExtraction's recursive finally. */
    const inFlightExtractions = new Set();
    /** UUID of the last message processed — cursor so each run only
     *  considers messages added since the previous extraction. */
    let lastMemoryMessageUuid;
    /** One-shot flag: once we log that the gate is disabled, don't repeat. */
    let hasLoggedGateFailure = false;
    /** True while runExtraction is executing — prevents overlapping runs. */
    let inProgress = false;
    /** Counts eligible turns since the last extraction run. Resets to 0 after each run. */
    let turnsSinceLastExtraction = 0;
    /** When a call arrives during an in-progress run, we stash the context here
     *  and run one trailing extraction after the current one finishes. */
    let pendingContext;
    // --- Inner extraction logic ---
    async function runExtraction({ context, appendSystemMessage, isTrailingRun, }) {
        const { messages } = context;
        const memoryDir = (0, paths_js_1.getAutoMemPath)();
        const newMessageCount = countModelVisibleMessagesSince(messages, lastMemoryMessageUuid);
        // Mutual exclusion: when the main agent wrote memories, skip the
        // forked agent and advance the cursor past this range so the next
        // extraction only considers messages after the main agent's write.
        if (hasMemoryWritesSince(messages, lastMemoryMessageUuid)) {
            (0, debug_js_1.logForDebugging)('[extractMemories] skipping — conversation already wrote to memory files');
            const lastMessage = messages.at(-1);
            if (lastMessage?.uuid) {
                lastMemoryMessageUuid = lastMessage.uuid;
            }
            (0, index_js_1.logEvent)('tengu_extract_memories_skipped_direct_write', {
                message_count: newMessageCount,
            });
            return;
        }
        const teamMemoryEnabled = (0, bun_bundle_1.feature)('TEAMMEM')
            ? teamMemPaths.isTeamMemoryEnabled()
            : false;
        const skipIndex = (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_moth_copse', false);
        const canUseTool = createAutoMemCanUseTool(memoryDir);
        const cacheSafeParams = (0, forkedAgent_js_1.createCacheSafeParams)(context);
        // Only run extraction every N eligible turns (tengu_bramble_lintel, default 1).
        // Trailing extractions (from stashed contexts) skip this check since they
        // process already-committed work that should not be throttled.
        if (!isTrailingRun) {
            turnsSinceLastExtraction++;
            if (turnsSinceLastExtraction <
                ((0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_bramble_lintel', null) ?? 1)) {
                return;
            }
        }
        turnsSinceLastExtraction = 0;
        inProgress = true;
        const startTime = Date.now();
        try {
            (0, debug_js_1.logForDebugging)(`[extractMemories] starting — ${newMessageCount} new messages, memoryDir=${memoryDir}`);
            // Pre-inject the memory directory manifest so the agent doesn't spend
            // a turn on `ls`. Reuses findRelevantMemories' frontmatter scan.
            // Placed after the throttle gate so skipped turns don't pay the scan cost.
            const existingMemories = (0, memoryScan_js_1.formatMemoryManifest)(await (0, memoryScan_js_1.scanMemoryFiles)(memoryDir, (0, abortController_js_1.createAbortController)().signal));
            const userPrompt = (0, bun_bundle_1.feature)('TEAMMEM') && teamMemoryEnabled
                ? (0, prompts_js_1.buildExtractCombinedPrompt)(newMessageCount, existingMemories, skipIndex)
                : (0, prompts_js_1.buildExtractAutoOnlyPrompt)(newMessageCount, existingMemories, skipIndex);
            const result = await (0, forkedAgent_js_1.runForkedAgent)({
                promptMessages: [(0, messages_js_1.createUserMessage)({ content: userPrompt })],
                cacheSafeParams,
                canUseTool,
                querySource: 'extract_memories',
                forkLabel: 'extract_memories',
                // The extractMemories subagent does not need to record to transcript.
                // Doing so can create race conditions with the main thread.
                skipTranscript: true,
                // Well-behaved extractions complete in 2-4 turns (read → write).
                // A hard cap prevents verification rabbit-holes from burning turns.
                maxTurns: 5,
            });
            // Advance the cursor only after a successful run. If the agent errors
            // out (caught below), the cursor stays put so those messages are
            // reconsidered on the next extraction.
            const lastMessage = messages.at(-1);
            if (lastMessage?.uuid) {
                lastMemoryMessageUuid = lastMessage.uuid;
            }
            const writtenPaths = extractWrittenPaths(result.messages);
            const turnCount = (0, array_js_1.count)(result.messages, m => m.type === 'assistant');
            const totalInput = result.totalUsage.input_tokens +
                result.totalUsage.cache_creation_input_tokens +
                result.totalUsage.cache_read_input_tokens;
            const hitPct = totalInput > 0
                ? ((result.totalUsage.cache_read_input_tokens / totalInput) *
                    100).toFixed(1)
                : '0.0';
            (0, debug_js_1.logForDebugging)(`[extractMemories] finished — ${writtenPaths.length} files written, cache: read=${result.totalUsage.cache_read_input_tokens} create=${result.totalUsage.cache_creation_input_tokens} input=${result.totalUsage.input_tokens} (${hitPct}% hit)`);
            if (writtenPaths.length > 0) {
                (0, debug_js_1.logForDebugging)(`[extractMemories] memories saved: ${writtenPaths.join(', ')}`);
            }
            else {
                (0, debug_js_1.logForDebugging)('[extractMemories] no memories saved this run');
            }
            // Index file updates are mechanical — the agent touches MEMORY.md to add
            // a topic link, but the user-visible "memory" is the topic file itself.
            const memoryPaths = writtenPaths.filter(p => (0, path_1.basename)(p) !== memdir_js_1.ENTRYPOINT_NAME);
            const teamCount = (0, bun_bundle_1.feature)('TEAMMEM')
                ? (0, array_js_1.count)(memoryPaths, teamMemPaths.isTeamMemPath)
                : 0;
            // Log extraction event with usage from the forked agent
            (0, index_js_1.logEvent)('tengu_extract_memories_extraction', {
                input_tokens: result.totalUsage.input_tokens,
                output_tokens: result.totalUsage.output_tokens,
                cache_read_input_tokens: result.totalUsage.cache_read_input_tokens,
                cache_creation_input_tokens: result.totalUsage.cache_creation_input_tokens,
                message_count: newMessageCount,
                turn_count: turnCount,
                files_written: writtenPaths.length,
                memories_saved: memoryPaths.length,
                team_memories_saved: teamCount,
                duration_ms: Date.now() - startTime,
            });
            (0, debug_js_1.logForDebugging)(`[extractMemories] writtenPaths=${writtenPaths.length} memoryPaths=${memoryPaths.length} appendSystemMessage defined=${appendSystemMessage != null}`);
            if (memoryPaths.length > 0) {
                const msg = (0, messages_js_1.createMemorySavedMessage)(memoryPaths);
                if ((0, bun_bundle_1.feature)('TEAMMEM')) {
                    msg.teamCount = teamCount;
                }
                appendSystemMessage?.(msg);
            }
        }
        catch (error) {
            // Extraction is best-effort — log but don't notify on error
            (0, debug_js_1.logForDebugging)(`[extractMemories] error: ${error}`);
            (0, index_js_1.logEvent)('tengu_extract_memories_error', {
                duration_ms: Date.now() - startTime,
            });
        }
        finally {
            inProgress = false;
            // If a call arrived while we were running, run a trailing extraction
            // with the latest stashed context. The trailing run will compute its
            // newMessageCount relative to the cursor we just advanced — so it only
            // picks up messages added between the two calls, not the full history.
            const trailing = pendingContext;
            pendingContext = undefined;
            if (trailing) {
                (0, debug_js_1.logForDebugging)('[extractMemories] running trailing extraction for stashed context');
                await runExtraction({
                    context: trailing.context,
                    appendSystemMessage: trailing.appendSystemMessage,
                    isTrailingRun: true,
                });
            }
        }
    }
    // --- Public entry point (captured by extractor) ---
    async function executeExtractMemoriesImpl(context, appendSystemMessage) {
        // Only run for the main agent, not subagents
        if (context.toolUseContext.agentId) {
            return;
        }
        if (!(0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_passport_quail', false)) {
            if (process.env.USER_TYPE === 'ant' && !hasLoggedGateFailure) {
                hasLoggedGateFailure = true;
                (0, index_js_1.logEvent)('tengu_extract_memories_gate_disabled', {});
            }
            return;
        }
        // Check auto-memory is enabled
        if (!(0, paths_js_1.isAutoMemoryEnabled)()) {
            return;
        }
        // Skip in remote mode
        if ((0, state_js_1.getIsRemoteMode)()) {
            return;
        }
        // If an extraction is already in progress, stash this context for a
        // trailing run (overwrites any previously stashed context — only the
        // latest matters since it has the most messages).
        if (inProgress) {
            (0, debug_js_1.logForDebugging)('[extractMemories] extraction in progress — stashing for trailing run');
            (0, index_js_1.logEvent)('tengu_extract_memories_coalesced', {});
            pendingContext = { context, appendSystemMessage };
            return;
        }
        await runExtraction({ context, appendSystemMessage });
    }
    extractor = async (context, appendSystemMessage) => {
        const p = executeExtractMemoriesImpl(context, appendSystemMessage);
        inFlightExtractions.add(p);
        try {
            await p;
        }
        finally {
            inFlightExtractions.delete(p);
        }
    };
    drainer = async (timeoutMs = 60000) => {
        if (inFlightExtractions.size === 0)
            return;
        await Promise.race([
            Promise.all(inFlightExtractions).catch(() => { }),
            // eslint-disable-next-line no-restricted-syntax -- sleep() has no .unref(); timer must not block exit
            new Promise(r => setTimeout(r, timeoutMs).unref()),
        ]);
    };
}
// ============================================================================
// Public API
// ============================================================================
/**
 * Run memory extraction at the end of a query loop.
 * Called fire-and-forget from handleStopHooks, alongside prompt suggestion/coaching.
 * No-ops until initExtractMemories() has been called.
 */
async function executeExtractMemories(context, appendSystemMessage) {
    await extractor?.(context, appendSystemMessage);
}
/**
 * Awaits all in-flight extractions (including trailing stashed runs) with a
 * soft timeout. Called by print.ts after the response is flushed but before
 * gracefulShutdownSync, so the forked agent completes before the 5s shutdown
 * failsafe kills it. No-op until initExtractMemories() has been called.
 */
async function drainPendingExtraction(timeoutMs) {
    await drainer(timeoutMs);
}
