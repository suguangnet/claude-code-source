"use strict";
/**
 * Session Memory automatically maintains a markdown file with notes about the current conversation.
 * It runs periodically in the background using a forked subagent to extract key information
 * without interrupting the main conversation flow.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetLastMemoryMessageUuid = resetLastMemoryMessageUuid;
exports.shouldExtractMemory = shouldExtractMemory;
exports.initSessionMemory = initSessionMemory;
exports.manuallyExtractSessionMemory = manuallyExtractSessionMemory;
exports.createMemoryFileCanUseTool = createMemoryFileCanUseTool;
const promises_1 = require("fs/promises");
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const state_js_1 = require("../../bootstrap/state.js");
const prompts_js_1 = require("../../constants/prompts.js");
const context_js_1 = require("../../context.js");
const constants_js_1 = require("../../tools/FileEditTool/constants.js");
const FileReadTool_js_1 = require("../../tools/FileReadTool/FileReadTool.js");
const array_js_1 = require("../../utils/array.js");
const forkedAgent_js_1 = require("../../utils/forkedAgent.js");
const fsOperations_js_1 = require("../../utils/fsOperations.js");
const postSamplingHooks_js_1 = require("../../utils/hooks/postSamplingHooks.js");
const messages_js_1 = require("../../utils/messages.js");
const filesystem_js_1 = require("../../utils/permissions/filesystem.js");
const sequential_js_1 = require("../../utils/sequential.js");
const systemPromptType_js_1 = require("../../utils/systemPromptType.js");
const tokens_js_1 = require("../../utils/tokens.js");
const index_js_1 = require("../analytics/index.js");
const autoCompact_js_1 = require("../compact/autoCompact.js");
const prompts_js_2 = require("./prompts.js");
const sessionMemoryUtils_js_1 = require("./sessionMemoryUtils.js");
// ============================================================================
// Feature Gate and Config (Cached - Non-blocking)
// ============================================================================
// These functions return cached values from disk immediately without blocking
// on GrowthBook initialization. Values may be stale but are updated in background.
const errors_js_1 = require("../../utils/errors.js");
const growthbook_js_1 = require("../analytics/growthbook.js");
/**
 * Check if session memory feature is enabled.
 * Uses cached gate value - returns immediately without blocking.
 */
function isSessionMemoryGateEnabled() {
    return (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_session_memory', false);
}
/**
 * Get session memory config from cache.
 * Returns immediately without blocking - value may be stale.
 */
function getSessionMemoryRemoteConfig() {
    return (0, growthbook_js_1.getDynamicConfig_CACHED_MAY_BE_STALE)('tengu_sm_config', {});
}
// ============================================================================
// Module State
// ============================================================================
let lastMemoryMessageUuid;
/**
 * Reset the last memory message UUID (for testing)
 */
function resetLastMemoryMessageUuid() {
    lastMemoryMessageUuid = undefined;
}
function countToolCallsSince(messages, sinceUuid) {
    let toolCallCount = 0;
    let foundStart = sinceUuid === null || sinceUuid === undefined;
    for (const message of messages) {
        if (!foundStart) {
            if (message.uuid === sinceUuid) {
                foundStart = true;
            }
            continue;
        }
        if (message.type === 'assistant') {
            const content = message.message.content;
            if (Array.isArray(content)) {
                toolCallCount += (0, array_js_1.count)(content, block => block.type === 'tool_use');
            }
        }
    }
    return toolCallCount;
}
function shouldExtractMemory(messages) {
    // Check if we've met the initialization threshold
    // Uses total context window tokens (same as autocompact) for consistent behavior
    const currentTokenCount = (0, tokens_js_1.tokenCountWithEstimation)(messages);
    if (!(0, sessionMemoryUtils_js_1.isSessionMemoryInitialized)()) {
        if (!(0, sessionMemoryUtils_js_1.hasMetInitializationThreshold)(currentTokenCount)) {
            return false;
        }
        (0, sessionMemoryUtils_js_1.markSessionMemoryInitialized)();
    }
    // Check if we've met the minimum tokens between updates threshold
    // Uses context window growth since last extraction (same metric as init threshold)
    const hasMetTokenThreshold = (0, sessionMemoryUtils_js_1.hasMetUpdateThreshold)(currentTokenCount);
    // Check if we've met the tool calls threshold
    const toolCallsSinceLastUpdate = countToolCallsSince(messages, lastMemoryMessageUuid);
    const hasMetToolCallThreshold = toolCallsSinceLastUpdate >= (0, sessionMemoryUtils_js_1.getToolCallsBetweenUpdates)();
    // Check if the last assistant turn has no tool calls (safe to extract)
    const hasToolCallsInLastTurn = (0, messages_js_1.hasToolCallsInLastAssistantTurn)(messages);
    // Trigger extraction when:
    // 1. Both thresholds are met (tokens AND tool calls), OR
    // 2. No tool calls in last turn AND token threshold is met
    //    (to ensure we extract at natural conversation breaks)
    //
    // IMPORTANT: The token threshold (minimumTokensBetweenUpdate) is ALWAYS required.
    // Even if the tool call threshold is met, extraction won't happen until the
    // token threshold is also satisfied. This prevents excessive extractions.
    const shouldExtract = (hasMetTokenThreshold && hasMetToolCallThreshold) ||
        (hasMetTokenThreshold && !hasToolCallsInLastTurn);
    if (shouldExtract) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage?.uuid) {
            lastMemoryMessageUuid = lastMessage.uuid;
        }
        return true;
    }
    return false;
}
async function setupSessionMemoryFile(toolUseContext) {
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    // Set up directory and file
    const sessionMemoryDir = (0, filesystem_js_1.getSessionMemoryDir)();
    await fs.mkdir(sessionMemoryDir, { mode: 0o700 });
    const memoryPath = (0, filesystem_js_1.getSessionMemoryPath)();
    // Create the memory file if it doesn't exist (wx = O_CREAT|O_EXCL)
    try {
        await (0, promises_1.writeFile)(memoryPath, '', {
            encoding: 'utf-8',
            mode: 0o600,
            flag: 'wx',
        });
        // Only load template if file was just created
        const template = await (0, prompts_js_2.loadSessionMemoryTemplate)();
        await (0, promises_1.writeFile)(memoryPath, template, {
            encoding: 'utf-8',
            mode: 0o600,
        });
    }
    catch (e) {
        const code = (0, errors_js_1.getErrnoCode)(e);
        if (code !== 'EEXIST') {
            throw e;
        }
    }
    // Drop any cached entry so FileReadTool's dedup doesn't return a
    // file_unchanged stub — we need the actual content. The Read repopulates it.
    toolUseContext.readFileState.delete(memoryPath);
    const result = await FileReadTool_js_1.FileReadTool.call({ file_path: memoryPath }, toolUseContext);
    let currentMemory = '';
    const output = result.data;
    if (output.type === 'text') {
        currentMemory = output.file.content;
    }
    (0, index_js_1.logEvent)('tengu_session_memory_file_read', {
        content_length: currentMemory.length,
    });
    return { memoryPath, currentMemory };
}
/**
 * Initialize session memory config from remote config (lazy initialization).
 * Memoized - only runs once per session, subsequent calls return immediately.
 * Uses cached config values - non-blocking.
 */
const initSessionMemoryConfigIfNeeded = (0, memoize_js_1.default)(() => {
    // Load config from cache (non-blocking, may be stale)
    const remoteConfig = getSessionMemoryRemoteConfig();
    // Only use remote values if they are explicitly set (non-zero positive numbers)
    // This ensures sensible defaults aren't overridden by zero values
    const config = {
        minimumMessageTokensToInit: remoteConfig.minimumMessageTokensToInit &&
            remoteConfig.minimumMessageTokensToInit > 0
            ? remoteConfig.minimumMessageTokensToInit
            : sessionMemoryUtils_js_1.DEFAULT_SESSION_MEMORY_CONFIG.minimumMessageTokensToInit,
        minimumTokensBetweenUpdate: remoteConfig.minimumTokensBetweenUpdate &&
            remoteConfig.minimumTokensBetweenUpdate > 0
            ? remoteConfig.minimumTokensBetweenUpdate
            : sessionMemoryUtils_js_1.DEFAULT_SESSION_MEMORY_CONFIG.minimumTokensBetweenUpdate,
        toolCallsBetweenUpdates: remoteConfig.toolCallsBetweenUpdates &&
            remoteConfig.toolCallsBetweenUpdates > 0
            ? remoteConfig.toolCallsBetweenUpdates
            : sessionMemoryUtils_js_1.DEFAULT_SESSION_MEMORY_CONFIG.toolCallsBetweenUpdates,
    };
    (0, sessionMemoryUtils_js_1.setSessionMemoryConfig)(config);
});
/**
 * Session memory post-sampling hook that extracts and updates session notes
 */
// Track if we've logged the gate check failure this session (to avoid spam)
let hasLoggedGateFailure = false;
const extractSessionMemory = (0, sequential_js_1.sequential)(async function (context) {
    const { messages, toolUseContext, querySource } = context;
    // Only run session memory on main REPL thread
    if (querySource !== 'repl_main_thread') {
        // Don't log this - it's expected for subagents, teammates, etc.
        return;
    }
    // Check gate lazily when hook runs (cached, non-blocking)
    if (!isSessionMemoryGateEnabled()) {
        // Log gate failure once per session (ant-only)
        if (process.env.USER_TYPE === 'ant' && !hasLoggedGateFailure) {
            hasLoggedGateFailure = true;
            (0, index_js_1.logEvent)('tengu_session_memory_gate_disabled', {});
        }
        return;
    }
    // Initialize config from remote (lazy, only once)
    initSessionMemoryConfigIfNeeded();
    if (!shouldExtractMemory(messages)) {
        return;
    }
    (0, sessionMemoryUtils_js_1.markExtractionStarted)();
    // Create isolated context for setup to avoid polluting parent's cache
    const setupContext = (0, forkedAgent_js_1.createSubagentContext)(toolUseContext);
    // Set up file system and read current state with isolated context
    const { memoryPath, currentMemory } = await setupSessionMemoryFile(setupContext);
    // Create extraction message
    const userPrompt = await (0, prompts_js_2.buildSessionMemoryUpdatePrompt)(currentMemory, memoryPath);
    // Run session memory extraction using runForkedAgent for prompt caching
    // runForkedAgent creates an isolated context to prevent mutation of parent state
    // Pass setupContext.readFileState so the forked agent can edit the memory file
    await (0, forkedAgent_js_1.runForkedAgent)({
        promptMessages: [(0, messages_js_1.createUserMessage)({ content: userPrompt })],
        cacheSafeParams: (0, forkedAgent_js_1.createCacheSafeParams)(context),
        canUseTool: createMemoryFileCanUseTool(memoryPath),
        querySource: 'session_memory',
        forkLabel: 'session_memory',
        overrides: { readFileState: setupContext.readFileState },
    });
    // Log extraction event for tracking frequency
    // Use the token usage from the last message in the conversation
    const lastMessage = messages[messages.length - 1];
    const usage = lastMessage ? (0, tokens_js_1.getTokenUsage)(lastMessage) : undefined;
    const config = (0, sessionMemoryUtils_js_1.getSessionMemoryConfig)();
    (0, index_js_1.logEvent)('tengu_session_memory_extraction', {
        input_tokens: usage?.input_tokens,
        output_tokens: usage?.output_tokens,
        cache_read_input_tokens: usage?.cache_read_input_tokens ?? undefined,
        cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? undefined,
        config_min_message_tokens_to_init: config.minimumMessageTokensToInit,
        config_min_tokens_between_update: config.minimumTokensBetweenUpdate,
        config_tool_calls_between_updates: config.toolCallsBetweenUpdates,
    });
    // Record the context size at extraction for tracking minimumTokensBetweenUpdate
    (0, sessionMemoryUtils_js_1.recordExtractionTokenCount)((0, tokens_js_1.tokenCountWithEstimation)(messages));
    // Update lastSummarizedMessageId after successful completion
    updateLastSummarizedMessageIdIfSafe(messages);
    (0, sessionMemoryUtils_js_1.markExtractionCompleted)();
});
/**
 * Initialize session memory by registering the post-sampling hook.
 * This is synchronous to avoid race conditions during startup.
 * The gate check and config loading happen lazily when the hook runs.
 */
function initSessionMemory() {
    if ((0, state_js_1.getIsRemoteMode)())
        return;
    // Session memory is used for compaction, so respect auto-compact settings
    const autoCompactEnabled = (0, autoCompact_js_1.isAutoCompactEnabled)();
    // Log initialization state (ant-only to avoid noise in external logs)
    if (process.env.USER_TYPE === 'ant') {
        (0, index_js_1.logEvent)('tengu_session_memory_init', {
            auto_compact_enabled: autoCompactEnabled,
        });
    }
    if (!autoCompactEnabled) {
        return;
    }
    // Register hook unconditionally - gate check happens lazily when hook runs
    (0, postSamplingHooks_js_1.registerPostSamplingHook)(extractSessionMemory);
}
/**
 * Manually trigger session memory extraction, bypassing threshold checks.
 * Used by the /summary command.
 */
async function manuallyExtractSessionMemory(messages, toolUseContext) {
    if (messages.length === 0) {
        return { success: false, error: 'No messages to summarize' };
    }
    (0, sessionMemoryUtils_js_1.markExtractionStarted)();
    try {
        // Create isolated context for setup to avoid polluting parent's cache
        const setupContext = (0, forkedAgent_js_1.createSubagentContext)(toolUseContext);
        // Set up file system and read current state with isolated context
        const { memoryPath, currentMemory } = await setupSessionMemoryFile(setupContext);
        // Create extraction message
        const userPrompt = await (0, prompts_js_2.buildSessionMemoryUpdatePrompt)(currentMemory, memoryPath);
        // Get system prompt for cache-safe params
        const { tools, mainLoopModel } = toolUseContext.options;
        const [rawSystemPrompt, userContext, systemContext] = await Promise.all([
            (0, prompts_js_1.getSystemPrompt)(tools, mainLoopModel),
            (0, context_js_1.getUserContext)(),
            (0, context_js_1.getSystemContext)(),
        ]);
        const systemPrompt = (0, systemPromptType_js_1.asSystemPrompt)(rawSystemPrompt);
        // Run session memory extraction using runForkedAgent
        await (0, forkedAgent_js_1.runForkedAgent)({
            promptMessages: [(0, messages_js_1.createUserMessage)({ content: userPrompt })],
            cacheSafeParams: {
                systemPrompt,
                userContext,
                systemContext,
                toolUseContext: setupContext,
                forkContextMessages: messages,
            },
            canUseTool: createMemoryFileCanUseTool(memoryPath),
            querySource: 'session_memory',
            forkLabel: 'session_memory_manual',
            overrides: { readFileState: setupContext.readFileState },
        });
        // Log manual extraction event
        (0, index_js_1.logEvent)('tengu_session_memory_manual_extraction', {});
        // Record the context size at extraction for tracking minimumTokensBetweenUpdate
        (0, sessionMemoryUtils_js_1.recordExtractionTokenCount)((0, tokens_js_1.tokenCountWithEstimation)(messages));
        // Update lastSummarizedMessageId after successful completion
        updateLastSummarizedMessageIdIfSafe(messages);
        return { success: true, memoryPath };
    }
    catch (error) {
        return {
            success: false,
            error: (0, errors_js_1.errorMessage)(error),
        };
    }
    finally {
        (0, sessionMemoryUtils_js_1.markExtractionCompleted)();
    }
}
// Helper functions
/**
 * Creates a canUseTool function that only allows Edit for the exact memory file.
 */
function createMemoryFileCanUseTool(memoryPath) {
    return async (tool, input) => {
        if (tool.name === constants_js_1.FILE_EDIT_TOOL_NAME &&
            typeof input === 'object' &&
            input !== null &&
            'file_path' in input) {
            const filePath = input.file_path;
            if (typeof filePath === 'string' && filePath === memoryPath) {
                return { behavior: 'allow', updatedInput: input };
            }
        }
        return {
            behavior: 'deny',
            message: `only ${constants_js_1.FILE_EDIT_TOOL_NAME} on ${memoryPath} is allowed`,
            decisionReason: {
                type: 'other',
                reason: `only ${constants_js_1.FILE_EDIT_TOOL_NAME} on ${memoryPath} is allowed`,
            },
        };
    };
}
/**
 * Updates lastSummarizedMessageId after successful extraction.
 * Only sets it if the last message doesn't have tool calls (to avoid orphaned tool_results).
 */
function updateLastSummarizedMessageIdIfSafe(messages) {
    if (!(0, messages_js_1.hasToolCallsInLastAssistantTurn)(messages)) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage?.uuid) {
            (0, sessionMemoryUtils_js_1.setLastSummarizedMessageId)(lastMessage.uuid);
        }
    }
}
