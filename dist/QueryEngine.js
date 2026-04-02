"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryEngine = void 0;
exports.ask = ask;
const bun_bundle_1 = require("bun:bundle");
const crypto_1 = require("crypto");
const last_js_1 = __importDefault(require("lodash-es/last.js"));
const state_js_1 = require("src/bootstrap/state.js");
const claude_js_1 = require("src/services/api/claude.js");
const logging_js_1 = require("src/services/api/logging.js");
const strip_ansi_1 = __importDefault(require("strip-ansi"));
const commands_js_1 = require("./commands.js");
const xml_js_1 = require("./constants/xml.js");
const cost_tracker_js_1 = require("./cost-tracker.js");
const memdir_js_1 = require("./memdir/memdir.js");
const paths_js_1 = require("./memdir/paths.js");
const query_js_1 = require("./query.js");
const errors_js_1 = require("./services/api/errors.js");
const Tool_js_1 = require("./Tool.js");
const SyntheticOutputTool_js_1 = require("./tools/SyntheticOutputTool/SyntheticOutputTool.js");
const abortController_js_1 = require("./utils/abortController.js");
const config_js_1 = require("./utils/config.js");
const cwd_js_1 = require("./utils/cwd.js");
const envUtils_js_1 = require("./utils/envUtils.js");
const fastMode_js_1 = require("./utils/fastMode.js");
const fileHistory_js_1 = require("./utils/fileHistory.js");
const fileStateCache_js_1 = require("./utils/fileStateCache.js");
const headlessProfiler_js_1 = require("./utils/headlessProfiler.js");
const hookHelpers_js_1 = require("./utils/hooks/hookHelpers.js");
const log_js_1 = require("./utils/log.js");
const messages_js_1 = require("./utils/messages.js");
const model_js_1 = require("./utils/model/model.js");
const pluginLoader_js_1 = require("./utils/plugins/pluginLoader.js");
const processUserInput_js_1 = require("./utils/processUserInput/processUserInput.js");
const queryContext_js_1 = require("./utils/queryContext.js");
const Shell_js_1 = require("./utils/Shell.js");
const sessionStorage_js_1 = require("./utils/sessionStorage.js");
const systemPromptType_js_1 = require("./utils/systemPromptType.js");
const systemTheme_js_1 = require("./utils/systemTheme.js");
const thinking_js_1 = require("./utils/thinking.js");
// Lazy: MessageSelector.tsx pulls React/ink; only needed for message filtering at query time
/* eslint-disable @typescript-eslint/no-require-imports */
const messageSelector = () => require('src/components/MessageSelector.js');
const mappers_js_1 = require("./utils/messages/mappers.js");
const systemInit_js_1 = require("./utils/messages/systemInit.js");
const filesystem_js_1 = require("./utils/permissions/filesystem.js");
/* eslint-enable @typescript-eslint/no-require-imports */
const queryHelpers_js_1 = require("./utils/queryHelpers.js");
// Dead code elimination: conditional import for coordinator mode
/* eslint-disable @typescript-eslint/no-require-imports */
const getCoordinatorUserContext = (0, bun_bundle_1.feature)('COORDINATOR_MODE')
    ? require('./coordinator/coordinatorMode.js').getCoordinatorUserContext
    : () => ({});
/* eslint-enable @typescript-eslint/no-require-imports */
// Dead code elimination: conditional import for snip compaction
/* eslint-disable @typescript-eslint/no-require-imports */
const snipModule = (0, bun_bundle_1.feature)('HISTORY_SNIP')
    ? require('./services/compact/snipCompact.js')
    : null;
const snipProjection = (0, bun_bundle_1.feature)('HISTORY_SNIP')
    ? require('./services/compact/snipProjection.js')
    : null;
/**
 * QueryEngine owns the query lifecycle and session state for a conversation.
 * It extracts the core logic from ask() into a standalone class that can be
 * used by both the headless/SDK path and (in a future phase) the REPL.
 *
 * One QueryEngine per conversation. Each submitMessage() call starts a new
 * turn within the same conversation. State (messages, file cache, usage, etc.)
 * persists across turns.
 */
class QueryEngine {
    constructor(config) {
        this.hasHandledOrphanedPermission = false;
        // Turn-scoped skill discovery tracking (feeds was_discovered on
        // tengu_skill_tool_invocation). Must persist across the two
        // processUserInputContext rebuilds inside submitMessage, but is cleared
        // at the start of each submitMessage to avoid unbounded growth across
        // many turns in SDK mode.
        this.discoveredSkillNames = new Set();
        this.loadedNestedMemoryPaths = new Set();
        this.config = config;
        this.mutableMessages = config.initialMessages ?? [];
        this.abortController = config.abortController ?? (0, abortController_js_1.createAbortController)();
        this.permissionDenials = [];
        this.readFileState = config.readFileCache;
        this.totalUsage = logging_js_1.EMPTY_USAGE;
    }
    async *submitMessage(prompt, options) {
        const { cwd, commands, tools, mcpClients, verbose = false, thinkingConfig, maxTurns, maxBudgetUsd, taskBudget, canUseTool, customSystemPrompt, appendSystemPrompt, userSpecifiedModel, fallbackModel, jsonSchema, getAppState, setAppState, replayUserMessages = false, includePartialMessages = false, agents = [], setSDKStatus, orphanedPermission, } = this.config;
        this.discoveredSkillNames.clear();
        (0, Shell_js_1.setCwd)(cwd);
        const persistSession = !(0, state_js_1.isSessionPersistenceDisabled)();
        const startTime = Date.now();
        // Wrap canUseTool to track permission denials
        const wrappedCanUseTool = async (tool, input, toolUseContext, assistantMessage, toolUseID, forceDecision) => {
            const result = await canUseTool(tool, input, toolUseContext, assistantMessage, toolUseID, forceDecision);
            // Track denials for SDK reporting
            if (result.behavior !== 'allow') {
                this.permissionDenials.push({
                    tool_name: (0, systemInit_js_1.sdkCompatToolName)(tool.name),
                    tool_use_id: toolUseID,
                    tool_input: input,
                });
            }
            return result;
        };
        const initialAppState = getAppState();
        const initialMainLoopModel = userSpecifiedModel
            ? (0, model_js_1.parseUserSpecifiedModel)(userSpecifiedModel)
            : (0, model_js_1.getMainLoopModel)();
        const initialThinkingConfig = thinkingConfig
            ? thinkingConfig
            : (0, thinking_js_1.shouldEnableThinkingByDefault)() !== false
                ? { type: 'adaptive' }
                : { type: 'disabled' };
        (0, headlessProfiler_js_1.headlessProfilerCheckpoint)('before_getSystemPrompt');
        // Narrow once so TS tracks the type through the conditionals below.
        const customPrompt = typeof customSystemPrompt === 'string' ? customSystemPrompt : undefined;
        const { defaultSystemPrompt, userContext: baseUserContext, systemContext, } = await (0, queryContext_js_1.fetchSystemPromptParts)({
            tools,
            mainLoopModel: initialMainLoopModel,
            additionalWorkingDirectories: Array.from(initialAppState.toolPermissionContext.additionalWorkingDirectories.keys()),
            mcpClients,
            customSystemPrompt: customPrompt,
        });
        (0, headlessProfiler_js_1.headlessProfilerCheckpoint)('after_getSystemPrompt');
        const userContext = {
            ...baseUserContext,
            ...getCoordinatorUserContext(mcpClients, (0, filesystem_js_1.isScratchpadEnabled)() ? (0, filesystem_js_1.getScratchpadDir)() : undefined),
        };
        // When an SDK caller provides a custom system prompt AND has set
        // CLAUDE_COWORK_MEMORY_PATH_OVERRIDE, inject the memory-mechanics prompt.
        // The env var is an explicit opt-in signal — the caller has wired up
        // a memory directory and needs Claude to know how to use it (which
        // Write/Edit tools to call, MEMORY.md filename, loading semantics).
        // The caller can layer their own policy text via appendSystemPrompt.
        const memoryMechanicsPrompt = customPrompt !== undefined && (0, paths_js_1.hasAutoMemPathOverride)()
            ? await (0, memdir_js_1.loadMemoryPrompt)()
            : null;
        const systemPrompt = (0, systemPromptType_js_1.asSystemPrompt)([
            ...(customPrompt !== undefined ? [customPrompt] : defaultSystemPrompt),
            ...(memoryMechanicsPrompt ? [memoryMechanicsPrompt] : []),
            ...(appendSystemPrompt ? [appendSystemPrompt] : []),
        ]);
        // Register function hook for structured output enforcement
        const hasStructuredOutputTool = tools.some(t => (0, Tool_js_1.toolMatchesName)(t, SyntheticOutputTool_js_1.SYNTHETIC_OUTPUT_TOOL_NAME));
        if (jsonSchema && hasStructuredOutputTool) {
            (0, hookHelpers_js_1.registerStructuredOutputEnforcement)(setAppState, (0, state_js_1.getSessionId)());
        }
        let processUserInputContext = {
            messages: this.mutableMessages,
            // Slash commands that mutate the message array (e.g. /force-snip)
            // call setMessages(fn).  In interactive mode this writes back to
            // AppState; in print mode we write back to mutableMessages so the
            // rest of the query loop (push at :389, snapshot at :392) sees
            // the result.  The second processUserInputContext below (after
            // slash-command processing) keeps the no-op — nothing else calls
            // setMessages past that point.
            setMessages: fn => {
                this.mutableMessages = fn(this.mutableMessages);
            },
            onChangeAPIKey: () => { },
            handleElicitation: this.config.handleElicitation,
            options: {
                commands,
                debug: false, // we use stdout, so don't want to clobber it
                tools,
                verbose,
                mainLoopModel: initialMainLoopModel,
                thinkingConfig: initialThinkingConfig,
                mcpClients,
                mcpResources: {},
                ideInstallationStatus: null,
                isNonInteractiveSession: true,
                customSystemPrompt,
                appendSystemPrompt,
                agentDefinitions: { activeAgents: agents, allAgents: [] },
                theme: (0, systemTheme_js_1.resolveThemeSetting)((0, config_js_1.getGlobalConfig)().theme),
                maxBudgetUsd,
            },
            getAppState,
            setAppState,
            abortController: this.abortController,
            readFileState: this.readFileState,
            nestedMemoryAttachmentTriggers: new Set(),
            loadedNestedMemoryPaths: this.loadedNestedMemoryPaths,
            dynamicSkillDirTriggers: new Set(),
            discoveredSkillNames: this.discoveredSkillNames,
            setInProgressToolUseIDs: () => { },
            setResponseLength: () => { },
            updateFileHistoryState: (updater) => {
                setAppState(prev => {
                    const updated = updater(prev.fileHistory);
                    if (updated === prev.fileHistory)
                        return prev;
                    return { ...prev, fileHistory: updated };
                });
            },
            updateAttributionState: (updater) => {
                setAppState(prev => {
                    const updated = updater(prev.attribution);
                    if (updated === prev.attribution)
                        return prev;
                    return { ...prev, attribution: updated };
                });
            },
            setSDKStatus,
        };
        // Handle orphaned permission (only once per engine lifetime)
        if (orphanedPermission && !this.hasHandledOrphanedPermission) {
            this.hasHandledOrphanedPermission = true;
            for await (const message of (0, queryHelpers_js_1.handleOrphanedPermission)(orphanedPermission, tools, this.mutableMessages, processUserInputContext)) {
                yield message;
            }
        }
        const { messages: messagesFromUserInput, shouldQuery, allowedTools, model: modelFromUserInput, resultText, } = await (0, processUserInput_js_1.processUserInput)({
            input: prompt,
            mode: 'prompt',
            setToolJSX: () => { },
            context: {
                ...processUserInputContext,
                messages: this.mutableMessages,
            },
            messages: this.mutableMessages,
            uuid: options?.uuid,
            isMeta: options?.isMeta,
            querySource: 'sdk',
        });
        // Push new messages, including user input and any attachments
        this.mutableMessages.push(...messagesFromUserInput);
        // Update params to reflect updates from processing /slash commands
        const messages = [...this.mutableMessages];
        // Persist the user's message(s) to transcript BEFORE entering the query
        // loop. The for-await below only calls recordTranscript when ask() yields
        // an assistant/user/compact_boundary message — which doesn't happen until
        // the API responds. If the process is killed before that (e.g. user clicks
        // Stop in cowork seconds after send), the transcript is left with only
        // queue-operation entries; getLastSessionLog filters those out, returns
        // null, and --resume fails with "No conversation found". Writing now makes
        // the transcript resumable from the point the user message was accepted,
        // even if no API response ever arrives.
        //
        // --bare / SIMPLE: fire-and-forget. Scripted calls don't --resume after
        // kill-mid-request. The await is ~4ms on SSD, ~30ms under disk contention
        // — the single largest controllable critical-path cost after module eval.
        // Transcript is still written (for post-hoc debugging); just not blocking.
        if (persistSession && messagesFromUserInput.length > 0) {
            const transcriptPromise = (0, sessionStorage_js_1.recordTranscript)(messages);
            if ((0, envUtils_js_1.isBareMode)()) {
                void transcriptPromise;
            }
            else {
                await transcriptPromise;
                if ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_EAGER_FLUSH) ||
                    (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_IS_COWORK)) {
                    await (0, sessionStorage_js_1.flushSessionStorage)();
                }
            }
        }
        // Filter messages that should be acknowledged after transcript
        const replayableMessages = messagesFromUserInput.filter(msg => (msg.type === 'user' &&
            !msg.isMeta && // Skip synthetic caveat messages
            !msg.toolUseResult && // Skip tool results (they'll be acked from query)
            messageSelector().selectableUserMessagesFilter(msg)) || // Skip non-user-authored messages (task notifications, etc.)
            (msg.type === 'system' && msg.subtype === 'compact_boundary'));
        const messagesToAck = replayUserMessages ? replayableMessages : [];
        // Update the ToolPermissionContext based on user input processing (as necessary)
        setAppState(prev => ({
            ...prev,
            toolPermissionContext: {
                ...prev.toolPermissionContext,
                alwaysAllowRules: {
                    ...prev.toolPermissionContext.alwaysAllowRules,
                    command: allowedTools,
                },
            },
        }));
        const mainLoopModel = modelFromUserInput ?? initialMainLoopModel;
        // Recreate after processing the prompt to pick up updated messages and
        // model (from slash commands).
        processUserInputContext = {
            messages,
            setMessages: () => { },
            onChangeAPIKey: () => { },
            handleElicitation: this.config.handleElicitation,
            options: {
                commands,
                debug: false,
                tools,
                verbose,
                mainLoopModel,
                thinkingConfig: initialThinkingConfig,
                mcpClients,
                mcpResources: {},
                ideInstallationStatus: null,
                isNonInteractiveSession: true,
                customSystemPrompt,
                appendSystemPrompt,
                theme: (0, systemTheme_js_1.resolveThemeSetting)((0, config_js_1.getGlobalConfig)().theme),
                agentDefinitions: { activeAgents: agents, allAgents: [] },
                maxBudgetUsd,
            },
            getAppState,
            setAppState,
            abortController: this.abortController,
            readFileState: this.readFileState,
            nestedMemoryAttachmentTriggers: new Set(),
            loadedNestedMemoryPaths: this.loadedNestedMemoryPaths,
            dynamicSkillDirTriggers: new Set(),
            discoveredSkillNames: this.discoveredSkillNames,
            setInProgressToolUseIDs: () => { },
            setResponseLength: () => { },
            updateFileHistoryState: processUserInputContext.updateFileHistoryState,
            updateAttributionState: processUserInputContext.updateAttributionState,
            setSDKStatus,
        };
        (0, headlessProfiler_js_1.headlessProfilerCheckpoint)('before_skills_plugins');
        // Cache-only: headless/SDK/CCR startup must not block on network for
        // ref-tracked plugins. CCR populates the cache via CLAUDE_CODE_SYNC_PLUGIN_INSTALL
        // (headlessPluginInstall) or CLAUDE_CODE_PLUGIN_SEED_DIR before this runs;
        // SDK callers that need fresh source can call /reload-plugins.
        const [skills, { enabled: enabledPlugins }] = await Promise.all([
            (0, commands_js_1.getSlashCommandToolSkills)((0, cwd_js_1.getCwd)()),
            (0, pluginLoader_js_1.loadAllPluginsCacheOnly)(),
        ]);
        (0, headlessProfiler_js_1.headlessProfilerCheckpoint)('after_skills_plugins');
        yield (0, systemInit_js_1.buildSystemInitMessage)({
            tools,
            mcpClients,
            model: mainLoopModel,
            permissionMode: initialAppState.toolPermissionContext
                .mode, // TODO: avoid the cast
            commands,
            agents,
            skills,
            plugins: enabledPlugins,
            fastMode: initialAppState.fastMode,
        });
        // Record when system message is yielded for headless latency tracking
        (0, headlessProfiler_js_1.headlessProfilerCheckpoint)('system_message_yielded');
        if (!shouldQuery) {
            // Return the results of local slash commands.
            // Use messagesFromUserInput (not replayableMessages) for command output
            // because selectableUserMessagesFilter excludes local-command-stdout tags.
            for (const msg of messagesFromUserInput) {
                if (msg.type === 'user' &&
                    typeof msg.message.content === 'string' &&
                    (msg.message.content.includes(`<${xml_js_1.LOCAL_COMMAND_STDOUT_TAG}>`) ||
                        msg.message.content.includes(`<${xml_js_1.LOCAL_COMMAND_STDERR_TAG}>`) ||
                        msg.isCompactSummary)) {
                    yield {
                        type: 'user',
                        message: {
                            ...msg.message,
                            content: (0, strip_ansi_1.default)(msg.message.content),
                        },
                        session_id: (0, state_js_1.getSessionId)(),
                        parent_tool_use_id: null,
                        uuid: msg.uuid,
                        timestamp: msg.timestamp,
                        isReplay: !msg.isCompactSummary,
                        isSynthetic: msg.isMeta || msg.isVisibleInTranscriptOnly,
                    };
                }
                // Local command output — yield as a synthetic assistant message so
                // RC renders it as assistant-style text rather than a user bubble.
                // Emitted as assistant (not the dedicated SDKLocalCommandOutputMessage
                // system subtype) so mobile clients + session-ingress can parse it.
                if (msg.type === 'system' &&
                    msg.subtype === 'local_command' &&
                    typeof msg.content === 'string' &&
                    (msg.content.includes(`<${xml_js_1.LOCAL_COMMAND_STDOUT_TAG}>`) ||
                        msg.content.includes(`<${xml_js_1.LOCAL_COMMAND_STDERR_TAG}>`))) {
                    yield (0, mappers_js_1.localCommandOutputToSDKAssistantMessage)(msg.content, msg.uuid);
                }
                if (msg.type === 'system' && msg.subtype === 'compact_boundary') {
                    yield {
                        type: 'system',
                        subtype: 'compact_boundary',
                        session_id: (0, state_js_1.getSessionId)(),
                        uuid: msg.uuid,
                        compact_metadata: (0, mappers_js_1.toSDKCompactMetadata)(msg.compactMetadata),
                    };
                }
            }
            if (persistSession) {
                await (0, sessionStorage_js_1.recordTranscript)(messages);
                if ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_EAGER_FLUSH) ||
                    (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_IS_COWORK)) {
                    await (0, sessionStorage_js_1.flushSessionStorage)();
                }
            }
            yield {
                type: 'result',
                subtype: 'success',
                is_error: false,
                duration_ms: Date.now() - startTime,
                duration_api_ms: (0, cost_tracker_js_1.getTotalAPIDuration)(),
                num_turns: messages.length - 1,
                result: resultText ?? '',
                stop_reason: null,
                session_id: (0, state_js_1.getSessionId)(),
                total_cost_usd: (0, cost_tracker_js_1.getTotalCost)(),
                usage: this.totalUsage,
                modelUsage: (0, cost_tracker_js_1.getModelUsage)(),
                permission_denials: this.permissionDenials,
                fast_mode_state: (0, fastMode_js_1.getFastModeState)(mainLoopModel, initialAppState.fastMode),
                uuid: (0, crypto_1.randomUUID)(),
            };
            return;
        }
        if ((0, fileHistory_js_1.fileHistoryEnabled)() && persistSession) {
            messagesFromUserInput
                .filter(messageSelector().selectableUserMessagesFilter)
                .forEach(message => {
                void (0, fileHistory_js_1.fileHistoryMakeSnapshot)((updater) => {
                    setAppState(prev => ({
                        ...prev,
                        fileHistory: updater(prev.fileHistory),
                    }));
                }, message.uuid);
            });
        }
        // Track current message usage (reset on each message_start)
        let currentMessageUsage = logging_js_1.EMPTY_USAGE;
        let turnCount = 1;
        let hasAcknowledgedInitialMessages = false;
        // Track structured output from StructuredOutput tool calls
        let structuredOutputFromTool;
        // Track the last stop_reason from assistant messages
        let lastStopReason = null;
        // Reference-based watermark so error_during_execution's errors[] is
        // turn-scoped. A length-based index breaks when the 100-entry ring buffer
        // shift()s during the turn — the index slides. If this entry is rotated
        // out, lastIndexOf returns -1 and we include everything (safe fallback).
        const errorLogWatermark = (0, log_js_1.getInMemoryErrors)().at(-1);
        // Snapshot count before this query for delta-based retry limiting
        const initialStructuredOutputCalls = jsonSchema
            ? (0, messages_js_1.countToolCalls)(this.mutableMessages, SyntheticOutputTool_js_1.SYNTHETIC_OUTPUT_TOOL_NAME)
            : 0;
        for await (const message of (0, query_js_1.query)({
            messages,
            systemPrompt,
            userContext,
            systemContext,
            canUseTool: wrappedCanUseTool,
            toolUseContext: processUserInputContext,
            fallbackModel,
            querySource: 'sdk',
            maxTurns,
            taskBudget,
        })) {
            // Record assistant, user, and compact boundary messages
            if (message.type === 'assistant' ||
                message.type === 'user' ||
                (message.type === 'system' && message.subtype === 'compact_boundary')) {
                // Before writing a compact boundary, flush any in-memory-only
                // messages up through the preservedSegment tail. Attachments and
                // progress are now recorded inline (their switch cases below), but
                // this flush still matters for the preservedSegment tail walk.
                // If the SDK subprocess restarts before then (claude-desktop kills
                // between turns), tailUuid points to a never-written message →
                // applyPreservedSegmentRelinks fails its tail→head walk → returns
                // without pruning → resume loads full pre-compact history.
                if (persistSession &&
                    message.type === 'system' &&
                    message.subtype === 'compact_boundary') {
                    const tailUuid = message.compactMetadata?.preservedSegment?.tailUuid;
                    if (tailUuid) {
                        const tailIdx = this.mutableMessages.findLastIndex(m => m.uuid === tailUuid);
                        if (tailIdx !== -1) {
                            await (0, sessionStorage_js_1.recordTranscript)(this.mutableMessages.slice(0, tailIdx + 1));
                        }
                    }
                }
                messages.push(message);
                if (persistSession) {
                    // Fire-and-forget for assistant messages. claude.ts yields one
                    // assistant message per content block, then mutates the last
                    // one's message.usage/stop_reason on message_delta — relying on
                    // the write queue's 100ms lazy jsonStringify. Awaiting here
                    // blocks ask()'s generator, so message_delta can't run until
                    // every block is consumed; the drain timer (started at block 1)
                    // elapses first. Interactive CC doesn't hit this because
                    // useLogMessages.ts fire-and-forgets. enqueueWrite is
                    // order-preserving so fire-and-forget here is safe.
                    if (message.type === 'assistant') {
                        void (0, sessionStorage_js_1.recordTranscript)(messages);
                    }
                    else {
                        await (0, sessionStorage_js_1.recordTranscript)(messages);
                    }
                }
                // Acknowledge initial user messages after first transcript recording
                if (!hasAcknowledgedInitialMessages && messagesToAck.length > 0) {
                    hasAcknowledgedInitialMessages = true;
                    for (const msgToAck of messagesToAck) {
                        if (msgToAck.type === 'user') {
                            yield {
                                type: 'user',
                                message: msgToAck.message,
                                session_id: (0, state_js_1.getSessionId)(),
                                parent_tool_use_id: null,
                                uuid: msgToAck.uuid,
                                timestamp: msgToAck.timestamp,
                                isReplay: true,
                            };
                        }
                    }
                }
            }
            if (message.type === 'user') {
                turnCount++;
            }
            switch (message.type) {
                case 'tombstone':
                    // Tombstone messages are control signals for removing messages, skip them
                    break;
                case 'assistant':
                    // Capture stop_reason if already set (synthetic messages). For
                    // streamed responses, this is null at content_block_stop time;
                    // the real value arrives via message_delta (handled below).
                    if (message.message.stop_reason != null) {
                        lastStopReason = message.message.stop_reason;
                    }
                    this.mutableMessages.push(message);
                    yield* (0, queryHelpers_js_1.normalizeMessage)(message);
                    break;
                case 'progress':
                    this.mutableMessages.push(message);
                    // Record inline so the dedup loop in the next ask() call sees it
                    // as already-recorded. Without this, deferred progress interleaves
                    // with already-recorded tool_results in mutableMessages, and the
                    // dedup walk freezes startingParentUuid at the wrong message —
                    // forking the chain and orphaning the conversation on resume.
                    if (persistSession) {
                        messages.push(message);
                        void (0, sessionStorage_js_1.recordTranscript)(messages);
                    }
                    yield* (0, queryHelpers_js_1.normalizeMessage)(message);
                    break;
                case 'user':
                    this.mutableMessages.push(message);
                    yield* (0, queryHelpers_js_1.normalizeMessage)(message);
                    break;
                case 'stream_event':
                    if (message.event.type === 'message_start') {
                        // Reset current message usage for new message
                        currentMessageUsage = logging_js_1.EMPTY_USAGE;
                        currentMessageUsage = (0, claude_js_1.updateUsage)(currentMessageUsage, message.event.message.usage);
                    }
                    if (message.event.type === 'message_delta') {
                        currentMessageUsage = (0, claude_js_1.updateUsage)(currentMessageUsage, message.event.usage);
                        // Capture stop_reason from message_delta. The assistant message
                        // is yielded at content_block_stop with stop_reason=null; the
                        // real value only arrives here (see claude.ts message_delta
                        // handler). Without this, result.stop_reason is always null.
                        if (message.event.delta.stop_reason != null) {
                            lastStopReason = message.event.delta.stop_reason;
                        }
                    }
                    if (message.event.type === 'message_stop') {
                        // Accumulate current message usage into total
                        this.totalUsage = (0, claude_js_1.accumulateUsage)(this.totalUsage, currentMessageUsage);
                    }
                    if (includePartialMessages) {
                        yield {
                            type: 'stream_event',
                            event: message.event,
                            session_id: (0, state_js_1.getSessionId)(),
                            parent_tool_use_id: null,
                            uuid: (0, crypto_1.randomUUID)(),
                        };
                    }
                    break;
                case 'attachment':
                    this.mutableMessages.push(message);
                    // Record inline (same reason as progress above).
                    if (persistSession) {
                        messages.push(message);
                        void (0, sessionStorage_js_1.recordTranscript)(messages);
                    }
                    // Extract structured output from StructuredOutput tool calls
                    if (message.attachment.type === 'structured_output') {
                        structuredOutputFromTool = message.attachment.data;
                    }
                    // Handle max turns reached signal from query.ts
                    else if (message.attachment.type === 'max_turns_reached') {
                        if (persistSession) {
                            if ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_EAGER_FLUSH) ||
                                (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_IS_COWORK)) {
                                await (0, sessionStorage_js_1.flushSessionStorage)();
                            }
                        }
                        yield {
                            type: 'result',
                            subtype: 'error_max_turns',
                            duration_ms: Date.now() - startTime,
                            duration_api_ms: (0, cost_tracker_js_1.getTotalAPIDuration)(),
                            is_error: true,
                            num_turns: message.attachment.turnCount,
                            stop_reason: lastStopReason,
                            session_id: (0, state_js_1.getSessionId)(),
                            total_cost_usd: (0, cost_tracker_js_1.getTotalCost)(),
                            usage: this.totalUsage,
                            modelUsage: (0, cost_tracker_js_1.getModelUsage)(),
                            permission_denials: this.permissionDenials,
                            fast_mode_state: (0, fastMode_js_1.getFastModeState)(mainLoopModel, initialAppState.fastMode),
                            uuid: (0, crypto_1.randomUUID)(),
                            errors: [
                                `Reached maximum number of turns (${message.attachment.maxTurns})`,
                            ],
                        };
                        return;
                    }
                    // Yield queued_command attachments as SDK user message replays
                    else if (replayUserMessages &&
                        message.attachment.type === 'queued_command') {
                        yield {
                            type: 'user',
                            message: {
                                role: 'user',
                                content: message.attachment.prompt,
                            },
                            session_id: (0, state_js_1.getSessionId)(),
                            parent_tool_use_id: null,
                            uuid: message.attachment.source_uuid || message.uuid,
                            timestamp: message.timestamp,
                            isReplay: true,
                        };
                    }
                    break;
                case 'stream_request_start':
                    // Don't yield stream request start messages
                    break;
                case 'system': {
                    // Snip boundary: replay on our store to remove zombie messages and
                    // stale markers. The yielded boundary is a signal, not data to push —
                    // the replay produces its own equivalent boundary. Without this,
                    // markers persist and re-trigger on every turn, and mutableMessages
                    // never shrinks (memory leak in long SDK sessions). The subtype
                    // check lives inside the injected callback so feature-gated strings
                    // stay out of this file (excluded-strings check).
                    const snipResult = this.config.snipReplay?.(message, this.mutableMessages);
                    if (snipResult !== undefined) {
                        if (snipResult.executed) {
                            this.mutableMessages.length = 0;
                            this.mutableMessages.push(...snipResult.messages);
                        }
                        break;
                    }
                    this.mutableMessages.push(message);
                    // Yield compact boundary messages to SDK
                    if (message.subtype === 'compact_boundary' &&
                        message.compactMetadata) {
                        // Release pre-compaction messages for GC. The boundary was just
                        // pushed so it's the last element. query.ts already uses
                        // getMessagesAfterCompactBoundary() internally, so only
                        // post-boundary messages are needed going forward.
                        const mutableBoundaryIdx = this.mutableMessages.length - 1;
                        if (mutableBoundaryIdx > 0) {
                            this.mutableMessages.splice(0, mutableBoundaryIdx);
                        }
                        const localBoundaryIdx = messages.length - 1;
                        if (localBoundaryIdx > 0) {
                            messages.splice(0, localBoundaryIdx);
                        }
                        yield {
                            type: 'system',
                            subtype: 'compact_boundary',
                            session_id: (0, state_js_1.getSessionId)(),
                            uuid: message.uuid,
                            compact_metadata: (0, mappers_js_1.toSDKCompactMetadata)(message.compactMetadata),
                        };
                    }
                    if (message.subtype === 'api_error') {
                        yield {
                            type: 'system',
                            subtype: 'api_retry',
                            attempt: message.retryAttempt,
                            max_retries: message.maxRetries,
                            retry_delay_ms: message.retryInMs,
                            error_status: message.error.status ?? null,
                            error: (0, errors_js_1.categorizeRetryableAPIError)(message.error),
                            session_id: (0, state_js_1.getSessionId)(),
                            uuid: message.uuid,
                        };
                    }
                    // Don't yield other system messages in headless mode
                    break;
                }
                case 'tool_use_summary':
                    // Yield tool use summary messages to SDK
                    yield {
                        type: 'tool_use_summary',
                        summary: message.summary,
                        preceding_tool_use_ids: message.precedingToolUseIds,
                        session_id: (0, state_js_1.getSessionId)(),
                        uuid: message.uuid,
                    };
                    break;
            }
            // Check if USD budget has been exceeded
            if (maxBudgetUsd !== undefined && (0, cost_tracker_js_1.getTotalCost)() >= maxBudgetUsd) {
                if (persistSession) {
                    if ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_EAGER_FLUSH) ||
                        (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_IS_COWORK)) {
                        await (0, sessionStorage_js_1.flushSessionStorage)();
                    }
                }
                yield {
                    type: 'result',
                    subtype: 'error_max_budget_usd',
                    duration_ms: Date.now() - startTime,
                    duration_api_ms: (0, cost_tracker_js_1.getTotalAPIDuration)(),
                    is_error: true,
                    num_turns: turnCount,
                    stop_reason: lastStopReason,
                    session_id: (0, state_js_1.getSessionId)(),
                    total_cost_usd: (0, cost_tracker_js_1.getTotalCost)(),
                    usage: this.totalUsage,
                    modelUsage: (0, cost_tracker_js_1.getModelUsage)(),
                    permission_denials: this.permissionDenials,
                    fast_mode_state: (0, fastMode_js_1.getFastModeState)(mainLoopModel, initialAppState.fastMode),
                    uuid: (0, crypto_1.randomUUID)(),
                    errors: [`Reached maximum budget ($${maxBudgetUsd})`],
                };
                return;
            }
            // Check if structured output retry limit exceeded (only on user messages)
            if (message.type === 'user' && jsonSchema) {
                const currentCalls = (0, messages_js_1.countToolCalls)(this.mutableMessages, SyntheticOutputTool_js_1.SYNTHETIC_OUTPUT_TOOL_NAME);
                const callsThisQuery = currentCalls - initialStructuredOutputCalls;
                const maxRetries = parseInt(process.env.MAX_STRUCTURED_OUTPUT_RETRIES || '5', 10);
                if (callsThisQuery >= maxRetries) {
                    if (persistSession) {
                        if ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_EAGER_FLUSH) ||
                            (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_IS_COWORK)) {
                            await (0, sessionStorage_js_1.flushSessionStorage)();
                        }
                    }
                    yield {
                        type: 'result',
                        subtype: 'error_max_structured_output_retries',
                        duration_ms: Date.now() - startTime,
                        duration_api_ms: (0, cost_tracker_js_1.getTotalAPIDuration)(),
                        is_error: true,
                        num_turns: turnCount,
                        stop_reason: lastStopReason,
                        session_id: (0, state_js_1.getSessionId)(),
                        total_cost_usd: (0, cost_tracker_js_1.getTotalCost)(),
                        usage: this.totalUsage,
                        modelUsage: (0, cost_tracker_js_1.getModelUsage)(),
                        permission_denials: this.permissionDenials,
                        fast_mode_state: (0, fastMode_js_1.getFastModeState)(mainLoopModel, initialAppState.fastMode),
                        uuid: (0, crypto_1.randomUUID)(),
                        errors: [
                            `Failed to provide valid structured output after ${maxRetries} attempts`,
                        ],
                    };
                    return;
                }
            }
        }
        // Stop hooks yield progress/attachment messages AFTER the assistant
        // response (via yield* handleStopHooks in query.ts). Since #23537 pushes
        // those to `messages` inline, last(messages) can be a progress/attachment
        // instead of the assistant — which makes textResult extraction below
        // return '' and -p mode emit a blank line. Allowlist to assistant|user:
        // isResultSuccessful handles both (user with all tool_result blocks is a
        // valid successful terminal state).
        const result = messages.findLast(m => m.type === 'assistant' || m.type === 'user');
        // Capture for the error_during_execution diagnostic — isResultSuccessful
        // is a type predicate (message is Message), so inside the false branch
        // `result` narrows to never and these accesses don't typecheck.
        const edeResultType = result?.type ?? 'undefined';
        const edeLastContentType = result?.type === 'assistant'
            ? ((0, last_js_1.default)(result.message.content)?.type ?? 'none')
            : 'n/a';
        // Flush buffered transcript writes before yielding result.
        // The desktop app kills the CLI process immediately after receiving the
        // result message, so any unflushed writes would be lost.
        if (persistSession) {
            if ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_EAGER_FLUSH) ||
                (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_IS_COWORK)) {
                await (0, sessionStorage_js_1.flushSessionStorage)();
            }
        }
        if (!(0, queryHelpers_js_1.isResultSuccessful)(result, lastStopReason)) {
            yield {
                type: 'result',
                subtype: 'error_during_execution',
                duration_ms: Date.now() - startTime,
                duration_api_ms: (0, cost_tracker_js_1.getTotalAPIDuration)(),
                is_error: true,
                num_turns: turnCount,
                stop_reason: lastStopReason,
                session_id: (0, state_js_1.getSessionId)(),
                total_cost_usd: (0, cost_tracker_js_1.getTotalCost)(),
                usage: this.totalUsage,
                modelUsage: (0, cost_tracker_js_1.getModelUsage)(),
                permission_denials: this.permissionDenials,
                fast_mode_state: (0, fastMode_js_1.getFastModeState)(mainLoopModel, initialAppState.fastMode),
                uuid: (0, crypto_1.randomUUID)(),
                // Diagnostic prefix: these are what isResultSuccessful() checks — if
                // the result type isn't assistant-with-text/thinking or user-with-
                // tool_result, and stop_reason isn't end_turn, that's why this fired.
                // errors[] is turn-scoped via the watermark; previously it dumped the
                // entire process's logError buffer (ripgrep timeouts, ENOENT, etc).
                errors: (() => {
                    const all = (0, log_js_1.getInMemoryErrors)();
                    const start = errorLogWatermark
                        ? all.lastIndexOf(errorLogWatermark) + 1
                        : 0;
                    return [
                        `[ede_diagnostic] result_type=${edeResultType} last_content_type=${edeLastContentType} stop_reason=${lastStopReason}`,
                        ...all.slice(start).map(_ => _.error),
                    ];
                })(),
            };
            return;
        }
        // Extract the text result based on message type
        let textResult = '';
        let isApiError = false;
        if (result.type === 'assistant') {
            const lastContent = (0, last_js_1.default)(result.message.content);
            if (lastContent?.type === 'text' &&
                !messages_js_1.SYNTHETIC_MESSAGES.has(lastContent.text)) {
                textResult = lastContent.text;
            }
            isApiError = Boolean(result.isApiErrorMessage);
        }
        yield {
            type: 'result',
            subtype: 'success',
            is_error: isApiError,
            duration_ms: Date.now() - startTime,
            duration_api_ms: (0, cost_tracker_js_1.getTotalAPIDuration)(),
            num_turns: turnCount,
            result: textResult,
            stop_reason: lastStopReason,
            session_id: (0, state_js_1.getSessionId)(),
            total_cost_usd: (0, cost_tracker_js_1.getTotalCost)(),
            usage: this.totalUsage,
            modelUsage: (0, cost_tracker_js_1.getModelUsage)(),
            permission_denials: this.permissionDenials,
            structured_output: structuredOutputFromTool,
            fast_mode_state: (0, fastMode_js_1.getFastModeState)(mainLoopModel, initialAppState.fastMode),
            uuid: (0, crypto_1.randomUUID)(),
        };
    }
    interrupt() {
        this.abortController.abort();
    }
    getMessages() {
        return this.mutableMessages;
    }
    getReadFileState() {
        return this.readFileState;
    }
    getSessionId() {
        return (0, state_js_1.getSessionId)();
    }
    setModel(model) {
        this.config.userSpecifiedModel = model;
    }
}
exports.QueryEngine = QueryEngine;
/**
 * Sends a single prompt to the Claude API and returns the response.
 * Assumes that claude is being used non-interactively -- will not
 * ask the user for permissions or further input.
 *
 * Convenience wrapper around QueryEngine for one-shot usage.
 */
async function* ask({ commands, prompt, promptUuid, isMeta, cwd, tools, mcpClients, verbose = false, thinkingConfig, maxTurns, maxBudgetUsd, taskBudget, canUseTool, mutableMessages = [], getReadFileCache, setReadFileCache, customSystemPrompt, appendSystemPrompt, userSpecifiedModel, fallbackModel, jsonSchema, getAppState, setAppState, abortController, replayUserMessages = false, includePartialMessages = false, handleElicitation, agents = [], setSDKStatus, orphanedPermission, }) {
    const engine = new QueryEngine({
        cwd,
        tools,
        commands,
        mcpClients,
        agents,
        canUseTool,
        getAppState,
        setAppState,
        initialMessages: mutableMessages,
        readFileCache: (0, fileStateCache_js_1.cloneFileStateCache)(getReadFileCache()),
        customSystemPrompt,
        appendSystemPrompt,
        userSpecifiedModel,
        fallbackModel,
        thinkingConfig,
        maxTurns,
        maxBudgetUsd,
        taskBudget,
        jsonSchema,
        verbose,
        handleElicitation,
        replayUserMessages,
        includePartialMessages,
        setSDKStatus,
        abortController,
        orphanedPermission,
        ...((0, bun_bundle_1.feature)('HISTORY_SNIP')
            ? {
                snipReplay: (yielded, store) => {
                    if (!snipProjection.isSnipBoundaryMessage(yielded))
                        return undefined;
                    return snipModule.snipCompactIfNeeded(store, { force: true });
                },
            }
            : {}),
    });
    try {
        yield* engine.submitMessage(prompt, {
            uuid: promptUuid,
            isMeta,
        });
    }
    finally {
        setReadFileCache(engine.getReadFileState());
    }
}
