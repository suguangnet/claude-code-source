"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.joinPromptValues = joinPromptValues;
exports.canBatchWith = canBatchWith;
exports.runHeadless = runHeadless;
exports.createCanUseToolWithPermissionPrompt = createCanUseToolWithPermissionPrompt;
exports.getCanUseToolFn = getCanUseToolFn;
exports.removeInterruptedMessage = removeInterruptedMessage;
exports.handleOrphanedPermissionResponse = handleOrphanedPermissionResponse;
exports.handleMcpSetServers = handleMcpSetServers;
exports.reconcileMcpServers = reconcileMcpServers;
// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
const bun_bundle_1 = require("bun:bundle");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const index_js_1 = require("src/services/settingsSync/index.js");
const index_js_2 = require("src/services/remoteManagedSettings/index.js");
const structuredIO_js_1 = require("src/cli/structuredIO.js");
const remoteIO_js_1 = require("src/cli/remoteIO.js");
const commands_js_1 = require("src/commands.js");
const streamlinedTransform_js_1 = require("src/utils/streamlinedTransform.js");
const streamJsonStdoutGuard_js_1 = require("src/utils/streamJsonStdoutGuard.js");
const tools_js_1 = require("src/tools.js");
const uniqBy_js_1 = __importDefault(require("lodash-es/uniqBy.js"));
const array_js_1 = require("src/utils/array.js");
const toolPool_js_1 = require("src/utils/toolPool.js");
const index_js_3 = require("src/services/analytics/index.js");
const growthbook_js_1 = require("src/services/analytics/growthbook.js");
const debug_js_1 = require("src/utils/debug.js");
const diagLogs_js_1 = require("src/utils/diagLogs.js");
const Tool_js_1 = require("src/Tool.js");
const loadAgentsDir_js_1 = require("src/tools/AgentTool/loadAgentsDir.js");
const messageQueueManager_js_1 = require("src/utils/messageQueueManager.js");
const commandLifecycle_js_1 = require("src/utils/commandLifecycle.js");
const sessionState_js_1 = require("src/utils/sessionState.js");
const onChangeAppState_js_1 = require("src/state/onChangeAppState.js");
const log_js_1 = require("src/utils/log.js");
const process_js_1 = require("src/utils/process.js");
const logging_js_1 = require("src/services/api/logging.js");
const conversationRecovery_js_1 = require("src/utils/conversationRecovery.js");
const channelNotification_js_1 = require("src/services/mcp/channelNotification.js");
const channelAllowlist_js_1 = require("src/services/mcp/channelAllowlist.js");
const pluginIdentifier_js_1 = require("src/utils/plugins/pluginIdentifier.js");
const uuid_js_1 = require("src/utils/uuid.js");
const generators_js_1 = require("src/utils/generators.js");
const QueryEngine_js_1 = require("src/QueryEngine.js");
const fileStateCache_js_1 = require("src/utils/fileStateCache.js");
const path_js_1 = require("src/utils/path.js");
const queryHelpers_js_1 = require("src/utils/queryHelpers.js");
const hookEvents_js_1 = require("src/utils/hooks/hookEvents.js");
const filePersistence_js_1 = require("src/utils/filePersistence/filePersistence.js");
const AsyncHookRegistry_js_1 = require("src/utils/hooks/AsyncHookRegistry.js");
const gracefulShutdown_js_1 = require("src/utils/gracefulShutdown.js");
const cleanupRegistry_js_1 = require("src/utils/cleanupRegistry.js");
const idleTimeout_js_1 = require("src/utils/idleTimeout.js");
const process_1 = require("process");
const cwd_js_1 = require("src/utils/cwd.js");
const omit_js_1 = __importDefault(require("lodash-es/omit.js"));
const reject_js_1 = __importDefault(require("lodash-es/reject.js"));
const index_js_4 = require("src/services/policyLimits/index.js");
const product_js_1 = require("src/constants/product.js");
const bridgeStatusUtil_js_1 = require("src/bridge/bridgeStatusUtil.js");
const inboundMessages_js_1 = require("src/bridge/inboundMessages.js");
const inboundAttachments_js_1 = require("src/bridge/inboundAttachments.js");
const permissions_js_1 = require("src/utils/permissions/permissions.js");
const json_js_1 = require("src/utils/json.js");
const PermissionPromptToolResultSchema_js_1 = require("src/utils/permissions/PermissionPromptToolResultSchema.js");
const abortController_js_1 = require("src/utils/abortController.js");
const combinedAbortSignal_js_1 = require("src/utils/combinedAbortSignal.js");
const sessionTitle_js_1 = require("src/utils/sessionTitle.js");
const queryContext_js_1 = require("src/utils/queryContext.js");
const sideQuestion_js_1 = require("src/utils/sideQuestion.js");
const sessionStart_js_1 = require("src/utils/sessionStart.js");
const outputStyles_js_1 = require("src/constants/outputStyles.js");
const xml_js_1 = require("src/constants/xml.js");
const settings_js_1 = require("src/utils/settings/settings.js");
const changeDetector_js_1 = require("src/utils/settings/changeDetector.js");
const applySettingsChange_js_1 = require("src/utils/settings/applySettingsChange.js");
const fastMode_js_1 = require("src/utils/fastMode.js");
const permissionSetup_js_1 = require("src/utils/permissions/permissionSetup.js");
const promptSuggestion_js_1 = require("src/services/PromptSuggestion/promptSuggestion.js");
const forkedAgent_js_1 = require("src/utils/forkedAgent.js");
const auth_js_1 = require("src/utils/auth.js");
const index_js_5 = require("src/services/oauth/index.js");
const auth_js_2 = require("src/cli/handlers/auth.js");
const providers_js_1 = require("src/utils/model/providers.js");
const awsAuthStatusManager_js_1 = require("src/utils/awsAuthStatusManager.js");
const state_js_1 = require("src/bootstrap/state.js");
const SyntheticOutputTool_js_1 = require("src/tools/SyntheticOutputTool/SyntheticOutputTool.js");
const sessionUrl_js_1 = require("src/utils/sessionUrl.js");
const sessionStorage_js_1 = require("src/utils/sessionStorage.js");
const commitAttribution_js_1 = require("src/utils/commitAttribution.js");
const client_js_1 = require("src/services/mcp/client.js");
const config_js_1 = require("src/services/mcp/config.js");
const auth_js_3 = require("src/services/mcp/auth.js");
const elicitationHandler_js_1 = require("src/services/mcp/elicitationHandler.js");
const hooks_js_1 = require("src/utils/hooks.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const mcpStringUtils_js_1 = require("src/services/mcp/mcpStringUtils.js");
const utils_js_1 = require("src/services/mcp/utils.js");
const vscodeSdkMcp_js_1 = require("src/services/mcp/vscodeSdkMcp.js");
const config_js_2 = require("src/services/mcp/config.js");
const grove_js_1 = require("src/services/api/grove.js");
const mappers_js_1 = require("src/utils/messages/mappers.js");
const messages_js_1 = require("src/utils/messages.js");
const context_noninteractive_js_1 = require("src/commands/context/context-noninteractive.js");
const xml_js_2 = require("src/constants/xml.js");
const claudeAiLimits_js_1 = require("src/services/claudeAiLimits.js");
const model_js_1 = require("src/utils/model/model.js");
const modelOptions_js_1 = require("src/utils/model/modelOptions.js");
const effort_js_1 = require("src/utils/effort.js");
const thinking_js_1 = require("src/utils/thinking.js");
const betas_js_1 = require("src/utils/betas.js");
const modelStrings_js_1 = require("src/utils/model/modelStrings.js");
const state_js_2 = require("src/bootstrap/state.js");
const workloadContext_js_1 = require("src/utils/workloadContext.js");
const crypto_1 = require("crypto");
const fileHistory_js_1 = require("src/utils/fileHistory.js");
const sessionRestore_js_1 = require("src/utils/sessionRestore.js");
const sandbox_adapter_js_1 = require("src/utils/sandbox/sandbox-adapter.js");
const headlessProfiler_js_1 = require("src/utils/headlessProfiler.js");
const queryProfiler_js_1 = require("src/utils/queryProfiler.js");
const ids_js_1 = require("src/types/ids.js");
const slowOperations_js_1 = require("../utils/slowOperations.js");
const skillChangeDetector_js_1 = require("../utils/skills/skillChangeDetector.js");
const commands_js_2 = require("../commands.js");
const envUtils_js_1 = require("../utils/envUtils.js");
const headlessPluginInstall_js_1 = require("../utils/plugins/headlessPluginInstall.js");
const refresh_js_1 = require("../utils/plugins/refresh.js");
const pluginLoader_js_1 = require("../utils/plugins/pluginLoader.js");
const teammate_js_1 = require("../utils/teammate.js");
const teammateMailbox_js_1 = require("../utils/teammateMailbox.js");
const teamHelpers_js_1 = require("../utils/swarm/teamHelpers.js");
const tasks_js_1 = require("../utils/tasks.js");
const framework_js_1 = require("../utils/task/framework.js");
const types_js_2 = require("../tasks/types.js");
const stopTask_js_1 = require("../tasks/stopTask.js");
const sdkEventQueue_js_1 = require("../utils/sdkEventQueue.js");
const growthbook_js_2 = require("../services/analytics/growthbook.js");
const errors_js_1 = require("../utils/errors.js");
const sleep_js_1 = require("../utils/sleep.js");
const paths_js_1 = require("../memdir/paths.js");
// Dead code elimination: conditional imports
/* eslint-disable @typescript-eslint/no-require-imports */
const coordinatorModeModule = (0, bun_bundle_1.feature)('COORDINATOR_MODE')
    ? require('../coordinator/coordinatorMode.js')
    : null;
const proactiveModule = (0, bun_bundle_1.feature)('PROACTIVE') || (0, bun_bundle_1.feature)('KAIROS')
    ? require('../proactive/index.js')
    : null;
const cronSchedulerModule = (0, bun_bundle_1.feature)('AGENT_TRIGGERS')
    ? require('../utils/cronScheduler.js')
    : null;
const cronJitterConfigModule = (0, bun_bundle_1.feature)('AGENT_TRIGGERS')
    ? require('../utils/cronJitterConfig.js')
    : null;
const cronGate = (0, bun_bundle_1.feature)('AGENT_TRIGGERS')
    ? require('../tools/ScheduleCronTool/prompt.js')
    : null;
const extractMemoriesModule = (0, bun_bundle_1.feature)('EXTRACT_MEMORIES')
    ? require('../services/extractMemories/extractMemories.js')
    : null;
/* eslint-enable @typescript-eslint/no-require-imports */
const SHUTDOWN_TEAM_PROMPT = `<system-reminder>
You are running in non-interactive mode and cannot return a response to the user until your team is shut down.

You MUST shut down your team before preparing your final response:
1. Use requestShutdown to ask each team member to shut down gracefully
2. Wait for shutdown approvals
3. Use the cleanup operation to clean up the team
4. Only then provide your final response to the user

The user cannot receive your response until the team is completely shut down.
</system-reminder>

Shut down your team and prepare your final response for the user.`;
// Track message UUIDs received during the current session runtime
const MAX_RECEIVED_UUIDS = 10000;
const receivedMessageUuids = new Set();
const receivedMessageUuidsOrder = [];
function trackReceivedMessageUuid(uuid) {
    if (receivedMessageUuids.has(uuid)) {
        return false; // duplicate
    }
    receivedMessageUuids.add(uuid);
    receivedMessageUuidsOrder.push(uuid);
    // Evict oldest entries when at capacity
    if (receivedMessageUuidsOrder.length > MAX_RECEIVED_UUIDS) {
        const toEvict = receivedMessageUuidsOrder.splice(0, receivedMessageUuidsOrder.length - MAX_RECEIVED_UUIDS);
        for (const old of toEvict) {
            receivedMessageUuids.delete(old);
        }
    }
    return true; // new UUID
}
function toBlocks(v) {
    return typeof v === 'string' ? [{ type: 'text', text: v }] : v;
}
/**
 * Join prompt values from multiple queued commands into one. Strings are
 * newline-joined; if any value is a block array, all values are normalized
 * to blocks and concatenated.
 */
function joinPromptValues(values) {
    if (values.length === 1)
        return values[0];
    if (values.every(v => typeof v === 'string')) {
        return values.join('\n');
    }
    return values.flatMap(toBlocks);
}
/**
 * Whether `next` can be batched into the same ask() call as `head`. Only
 * prompt-mode commands batch, and only when the workload tag matches (so the
 * combined turn is attributed correctly) and the isMeta flag matches (so a
 * proactive tick can't merge into a user prompt and lose its hidden-in-
 * transcript marking when the head is spread over the merged command).
 */
function canBatchWith(head, next) {
    return (next !== undefined &&
        next.mode === 'prompt' &&
        next.workload === head.workload &&
        next.isMeta === head.isMeta);
}
async function runHeadless(inputPrompt, getAppState, setAppState, commands, tools, sdkMcpConfigs, agents, options) {
    if (process.env.USER_TYPE === 'ant' &&
        (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_EXIT_AFTER_FIRST_RENDER)) {
        process.stderr.write(`\nStartup time: ${Math.round(process.uptime() * 1000)}ms\n`);
        // eslint-disable-next-line custom-rules/no-process-exit
        process.exit(0);
    }
    // Fire user settings download now so it overlaps with the MCP/tool setup
    // below. Managed settings already started in main.tsx preAction; this gives
    // user settings a similar head start. The cached promise is joined in
    // installPluginsAndApplyMcpInBackground before plugin install reads
    // enabledPlugins.
    if ((0, bun_bundle_1.feature)('DOWNLOAD_USER_SETTINGS') &&
        ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_REMOTE) || (0, state_js_2.getIsRemoteMode)())) {
        void (0, index_js_1.downloadUserSettings)();
    }
    // In headless mode there is no React tree, so the useSettingsChange hook
    // never runs. Subscribe directly so that settings changes (including
    // managed-settings / policy updates) are fully applied.
    changeDetector_js_1.settingsChangeDetector.subscribe(source => {
        (0, applySettingsChange_js_1.applySettingsChange)(source, setAppState);
        // In headless mode, also sync the denormalized fastMode field from
        // settings. The TUI manages fastMode via the UI so it skips this.
        if ((0, fastMode_js_1.isFastModeEnabled)()) {
            setAppState(prev => {
                const s = prev.settings;
                const fastMode = s.fastMode === true && !s.fastModePerSessionOptIn;
                return { ...prev, fastMode };
            });
        }
    });
    // Proactive activation is now handled in main.tsx before getTools() so
    // SleepTool passes isEnabled() filtering. This fallback covers the case
    // where CLAUDE_CODE_PROACTIVE is set but main.tsx's check didn't fire
    // (e.g. env was injected by the SDK transport after argv parsing).
    if (((0, bun_bundle_1.feature)('PROACTIVE') || (0, bun_bundle_1.feature)('KAIROS')) &&
        proactiveModule &&
        !proactiveModule.isProactiveActive() &&
        (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_PROACTIVE)) {
        proactiveModule.activateProactive('command');
    }
    // Periodically force a full GC to keep memory usage in check
    if (typeof Bun !== 'undefined') {
        const gcTimer = setInterval(Bun.gc, 1000);
        gcTimer.unref();
    }
    // Start headless profiler for first turn
    (0, headlessProfiler_js_1.headlessProfilerStartTurn)();
    (0, headlessProfiler_js_1.headlessProfilerCheckpoint)('runHeadless_entry');
    // Check Grove requirements for non-interactive consumer subscribers
    if (await (0, grove_js_1.isQualifiedForGrove)()) {
        await (0, grove_js_1.checkGroveForNonInteractive)();
    }
    (0, headlessProfiler_js_1.headlessProfilerCheckpoint)('after_grove_check');
    // Initialize GrowthBook so feature flags take effect in headless mode.
    // Without this, the disk cache is empty and all flags fall back to defaults.
    void (0, growthbook_js_2.initializeGrowthBook)();
    if (options.resumeSessionAt && !options.resume) {
        process.stderr.write(`Error: --resume-session-at requires --resume\n`);
        (0, gracefulShutdown_js_1.gracefulShutdownSync)(1);
        return;
    }
    if (options.rewindFiles && !options.resume) {
        process.stderr.write(`Error: --rewind-files requires --resume\n`);
        (0, gracefulShutdown_js_1.gracefulShutdownSync)(1);
        return;
    }
    if (options.rewindFiles && inputPrompt) {
        process.stderr.write(`Error: --rewind-files is a standalone operation and cannot be used with a prompt\n`);
        (0, gracefulShutdown_js_1.gracefulShutdownSync)(1);
        return;
    }
    const structuredIO = getStructuredIO(inputPrompt, options);
    // When emitting NDJSON for SDK clients, any stray write to stdout (debug
    // prints, dependency console.log, library banners) breaks the client's
    // line-by-line JSON parser. Install a guard that diverts non-JSON lines to
    // stderr so the stream stays clean. Must run before the first
    // structuredIO.write below.
    if (options.outputFormat === 'stream-json') {
        (0, streamJsonStdoutGuard_js_1.installStreamJsonStdoutGuard)();
    }
    // #34044: if user explicitly set sandbox.enabled=true but deps are missing,
    // isSandboxingEnabled() returns false silently. Surface the reason so users
    // know their security config isn't being enforced.
    const sandboxUnavailableReason = sandbox_adapter_js_1.SandboxManager.getSandboxUnavailableReason();
    if (sandboxUnavailableReason) {
        if (sandbox_adapter_js_1.SandboxManager.isSandboxRequired()) {
            process.stderr.write(`\nError: sandbox required but unavailable: ${sandboxUnavailableReason}\n` +
                `  sandbox.failIfUnavailable is set — refusing to start without a working sandbox.\n\n`);
            (0, gracefulShutdown_js_1.gracefulShutdownSync)(1);
            return;
        }
        process.stderr.write(`\n⚠ Sandbox disabled: ${sandboxUnavailableReason}\n` +
            `  Commands will run WITHOUT sandboxing. Network and filesystem restrictions will NOT be enforced.\n\n`);
    }
    else if (sandbox_adapter_js_1.SandboxManager.isSandboxingEnabled()) {
        // Initialize sandbox with a callback that forwards network permission
        // requests to the SDK host via the can_use_tool control_request protocol.
        // This must happen after structuredIO is created so we can send requests.
        try {
            await sandbox_adapter_js_1.SandboxManager.initialize(structuredIO.createSandboxAskCallback());
        }
        catch (err) {
            process.stderr.write(`\n❌ Sandbox Error: ${(0, errors_js_1.errorMessage)(err)}\n`);
            (0, gracefulShutdown_js_1.gracefulShutdownSync)(1, 'other');
            return;
        }
    }
    if (options.outputFormat === 'stream-json' && options.verbose) {
        (0, hookEvents_js_1.registerHookEventHandler)(event => {
            const message = (() => {
                switch (event.type) {
                    case 'started':
                        return {
                            type: 'system',
                            subtype: 'hook_started',
                            hook_id: event.hookId,
                            hook_name: event.hookName,
                            hook_event: event.hookEvent,
                            uuid: (0, crypto_1.randomUUID)(),
                            session_id: (0, state_js_2.getSessionId)(),
                        };
                    case 'progress':
                        return {
                            type: 'system',
                            subtype: 'hook_progress',
                            hook_id: event.hookId,
                            hook_name: event.hookName,
                            hook_event: event.hookEvent,
                            stdout: event.stdout,
                            stderr: event.stderr,
                            output: event.output,
                            uuid: (0, crypto_1.randomUUID)(),
                            session_id: (0, state_js_2.getSessionId)(),
                        };
                    case 'response':
                        return {
                            type: 'system',
                            subtype: 'hook_response',
                            hook_id: event.hookId,
                            hook_name: event.hookName,
                            hook_event: event.hookEvent,
                            output: event.output,
                            stdout: event.stdout,
                            stderr: event.stderr,
                            exit_code: event.exitCode,
                            outcome: event.outcome,
                            uuid: (0, crypto_1.randomUUID)(),
                            session_id: (0, state_js_2.getSessionId)(),
                        };
                }
            })();
            void structuredIO.write(message);
        });
    }
    if (options.setupTrigger) {
        await (0, sessionStart_js_1.processSetupHooks)(options.setupTrigger);
    }
    (0, headlessProfiler_js_1.headlessProfilerCheckpoint)('before_loadInitialMessages');
    const appState = getAppState();
    const { messages: initialMessages, turnInterruptionState, agentSetting: resumedAgentSetting, } = await loadInitialMessages(setAppState, {
        continue: options.continue,
        teleport: options.teleport,
        resume: options.resume,
        resumeSessionAt: options.resumeSessionAt,
        forkSession: options.forkSession,
        outputFormat: options.outputFormat,
        sessionStartHooksPromise: options.sessionStartHooksPromise,
        restoredWorkerState: structuredIO.restoredWorkerState,
    });
    // SessionStart hooks can emit initialUserMessage — the first user turn for
    // headless orchestrator sessions where stdin is empty and additionalContext
    // alone (an attachment, not a turn) would leave the REPL with nothing to
    // respond to. The hook promise is awaited inside loadInitialMessages, so the
    // module-level pending value is set by the time we get here.
    const hookInitialUserMessage = (0, sessionStart_js_1.takeInitialUserMessage)();
    if (hookInitialUserMessage) {
        structuredIO.prependUserMessage(hookInitialUserMessage);
    }
    // Restore agent setting from the resumed session (if not overridden by current --agent flag
    // or settings-based agent, which would already have set mainThreadAgentType in main.tsx)
    if (!options.agent && !(0, state_js_2.getMainThreadAgentType)() && resumedAgentSetting) {
        const { agentDefinition: restoredAgent } = (0, sessionRestore_js_1.restoreAgentFromSession)(resumedAgentSetting, undefined, { activeAgents: agents, allAgents: agents });
        if (restoredAgent) {
            setAppState(prev => ({ ...prev, agent: restoredAgent.agentType }));
            // Apply the agent's system prompt for non-built-in agents (mirrors main.tsx initial --agent path)
            if (!options.systemPrompt && !(0, loadAgentsDir_js_1.isBuiltInAgent)(restoredAgent)) {
                const agentSystemPrompt = restoredAgent.getSystemPrompt();
                if (agentSystemPrompt) {
                    options.systemPrompt = agentSystemPrompt;
                }
            }
            // Re-persist agent setting so future resumes maintain the agent
            (0, sessionStorage_js_1.saveAgentSetting)(restoredAgent.agentType);
        }
    }
    // gracefulShutdownSync schedules an async shutdown and sets process.exitCode.
    // If a loadInitialMessages error path triggered it, bail early to avoid
    // unnecessary work while the process winds down.
    if (initialMessages.length === 0 && process.exitCode !== undefined) {
        return;
    }
    // Handle --rewind-files: restore filesystem and exit immediately
    if (options.rewindFiles) {
        // File history snapshots are only created for user messages,
        // so we require the target to be a user message
        const targetMessage = initialMessages.find(m => m.uuid === options.rewindFiles);
        if (!targetMessage || targetMessage.type !== 'user') {
            process.stderr.write(`Error: --rewind-files requires a user message UUID, but ${options.rewindFiles} is not a user message in this session\n`);
            (0, gracefulShutdown_js_1.gracefulShutdownSync)(1);
            return;
        }
        const currentAppState = getAppState();
        const result = await handleRewindFiles(options.rewindFiles, currentAppState, setAppState, false);
        if (!result.canRewind) {
            process.stderr.write(`Error: ${result.error || 'Unexpected error'}\n`);
            (0, gracefulShutdown_js_1.gracefulShutdownSync)(1);
            return;
        }
        // Rewind complete - exit successfully
        process.stdout.write(`Files rewound to state at message ${options.rewindFiles}\n`);
        (0, gracefulShutdown_js_1.gracefulShutdownSync)(0);
        return;
    }
    // Check if we need input prompt - skip if we're resuming with a valid session ID/JSONL file or using SDK URL
    const hasValidResumeSessionId = typeof options.resume === 'string' &&
        (Boolean((0, uuid_js_1.validateUuid)(options.resume)) || options.resume.endsWith('.jsonl'));
    const isUsingSdkUrl = Boolean(options.sdkUrl);
    if (!inputPrompt && !hasValidResumeSessionId && !isUsingSdkUrl) {
        process.stderr.write(`Error: Input must be provided either through stdin or as a prompt argument when using --print\n`);
        (0, gracefulShutdown_js_1.gracefulShutdownSync)(1);
        return;
    }
    if (options.outputFormat === 'stream-json' && !options.verbose) {
        process.stderr.write('Error: When using --print, --output-format=stream-json requires --verbose\n');
        (0, gracefulShutdown_js_1.gracefulShutdownSync)(1);
        return;
    }
    // Filter out MCP tools that are in the deny list
    const allowedMcpTools = (0, tools_js_1.filterToolsByDenyRules)(appState.mcp.tools, appState.toolPermissionContext);
    let filteredTools = [...tools, ...allowedMcpTools];
    // When using SDK URL, always use stdio permission prompting to delegate to the SDK
    const effectivePermissionPromptToolName = options.sdkUrl
        ? 'stdio'
        : options.permissionPromptToolName;
    // Callback for when a permission prompt is shown
    const onPermissionPrompt = (details) => {
        if ((0, bun_bundle_1.feature)('COMMIT_ATTRIBUTION')) {
            setAppState(prev => ({
                ...prev,
                attribution: {
                    ...prev.attribution,
                    permissionPromptCount: prev.attribution.permissionPromptCount + 1,
                },
            }));
        }
        (0, sessionState_js_1.notifySessionStateChanged)('requires_action', details);
    };
    const canUseTool = getCanUseToolFn(effectivePermissionPromptToolName, structuredIO, () => getAppState().mcp.tools, onPermissionPrompt);
    if (options.permissionPromptToolName) {
        // Remove the permission prompt tool from the list of available tools.
        filteredTools = filteredTools.filter(tool => !(0, Tool_js_1.toolMatchesName)(tool, options.permissionPromptToolName));
    }
    // Install errors handlers to gracefully handle broken pipes (e.g., when parent process dies)
    (0, process_js_1.registerProcessOutputErrorHandlers)();
    (0, headlessProfiler_js_1.headlessProfilerCheckpoint)('after_loadInitialMessages');
    // Ensure model strings are initialized before generating model options.
    // For Bedrock users, this waits for the profile fetch to get correct region strings.
    await (0, modelStrings_js_1.ensureModelStringsInitialized)();
    (0, headlessProfiler_js_1.headlessProfilerCheckpoint)('after_modelStrings');
    // UDS inbox store registration is deferred until after `run` is defined
    // so we can pass `run` as the onEnqueue callback (see below).
    // Only `json` + `verbose` needs the full array (jsonStringify(messages) below).
    // For stream-json (SDK/CCR) and default text output, only the last message is
    // read for the exit code / final result. Avoid accumulating every message in
    // memory for the entire session.
    const needsFullArray = options.outputFormat === 'json' && options.verbose;
    const messages = [];
    let lastMessage;
    // Streamlined mode transforms messages when CLAUDE_CODE_STREAMLINED_OUTPUT=true and using stream-json
    // Build flag gates this out of external builds; env var is the runtime opt-in for ant builds
    const transformToStreamlined = (0, bun_bundle_1.feature)('STREAMLINED_OUTPUT') &&
        (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_STREAMLINED_OUTPUT) &&
        options.outputFormat === 'stream-json'
        ? (0, streamlinedTransform_js_1.createStreamlinedTransformer)()
        : null;
    (0, headlessProfiler_js_1.headlessProfilerCheckpoint)('before_runHeadlessStreaming');
    for await (const message of runHeadlessStreaming(structuredIO, appState.mcp.clients, [...commands, ...appState.mcp.commands], filteredTools, initialMessages, canUseTool, sdkMcpConfigs, getAppState, setAppState, agents, options, turnInterruptionState)) {
        if (transformToStreamlined) {
            // Streamlined mode: transform messages and stream immediately
            const transformed = transformToStreamlined(message);
            if (transformed) {
                await structuredIO.write(transformed);
            }
        }
        else if (options.outputFormat === 'stream-json' && options.verbose) {
            await structuredIO.write(message);
        }
        // Should not be getting control messages or stream events in non-stream mode.
        // Also filter out streamlined types since they're only produced by the transformer.
        // SDK-only system events are excluded so lastMessage stays at the result
        // (session_state_changed(idle) and any late task_notification drain after
        // result in the finally block).
        if (message.type !== 'control_response' &&
            message.type !== 'control_request' &&
            message.type !== 'control_cancel_request' &&
            !(message.type === 'system' &&
                (message.subtype === 'session_state_changed' ||
                    message.subtype === 'task_notification' ||
                    message.subtype === 'task_started' ||
                    message.subtype === 'task_progress' ||
                    message.subtype === 'post_turn_summary')) &&
            message.type !== 'stream_event' &&
            message.type !== 'keep_alive' &&
            message.type !== 'streamlined_text' &&
            message.type !== 'streamlined_tool_use_summary' &&
            message.type !== 'prompt_suggestion') {
            if (needsFullArray) {
                messages.push(message);
            }
            lastMessage = message;
        }
    }
    switch (options.outputFormat) {
        case 'json':
            if (!lastMessage || lastMessage.type !== 'result') {
                throw new Error('No messages returned');
            }
            if (options.verbose) {
                (0, process_js_1.writeToStdout)((0, slowOperations_js_1.jsonStringify)(messages) + '\n');
                break;
            }
            (0, process_js_1.writeToStdout)((0, slowOperations_js_1.jsonStringify)(lastMessage) + '\n');
            break;
        case 'stream-json':
            // already logged above
            break;
        default:
            if (!lastMessage || lastMessage.type !== 'result') {
                throw new Error('No messages returned');
            }
            switch (lastMessage.subtype) {
                case 'success':
                    (0, process_js_1.writeToStdout)(lastMessage.result.endsWith('\n')
                        ? lastMessage.result
                        : lastMessage.result + '\n');
                    break;
                case 'error_during_execution':
                    (0, process_js_1.writeToStdout)(`Execution error`);
                    break;
                case 'error_max_turns':
                    (0, process_js_1.writeToStdout)(`Error: Reached max turns (${options.maxTurns})`);
                    break;
                case 'error_max_budget_usd':
                    (0, process_js_1.writeToStdout)(`Error: Exceeded USD budget (${options.maxBudgetUsd})`);
                    break;
                case 'error_max_structured_output_retries':
                    (0, process_js_1.writeToStdout)(`Error: Failed to provide valid structured output after maximum retries`);
            }
    }
    // Log headless latency metrics for the final turn
    (0, headlessProfiler_js_1.logHeadlessProfilerTurn)();
    // Drain any in-flight memory extraction before shutdown. The response is
    // already flushed above, so this adds no user-visible latency — it just
    // delays process exit so gracefulShutdownSync's 5s failsafe doesn't kill
    // the forked agent mid-flight. Gated by isExtractModeActive so the
    // tengu_slate_thimble flag controls non-interactive extraction end-to-end.
    if ((0, bun_bundle_1.feature)('EXTRACT_MEMORIES') && (0, paths_js_1.isExtractModeActive)()) {
        await extractMemoriesModule.drainPendingExtraction();
    }
    (0, gracefulShutdown_js_1.gracefulShutdownSync)(lastMessage?.type === 'result' && lastMessage?.is_error ? 1 : 0);
}
function runHeadlessStreaming(structuredIO, mcpClients, commands, tools, initialMessages, canUseTool, sdkMcpConfigs, getAppState, setAppState, agents, options, turnInterruptionState) {
    let running = false;
    let runPhase;
    let inputClosed = false;
    let shutdownPromptInjected = false;
    let heldBackResult = null;
    let abortController;
    // Same queue sendRequest() enqueues to — one FIFO for everything.
    const output = structuredIO.outbound;
    // Ctrl+C in -p mode: abort the in-flight query, then shut down gracefully.
    // gracefulShutdown persists session state and flushes analytics, with a
    // failsafe timer that force-exits if cleanup hangs.
    const sigintHandler = () => {
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'shutdown_signal', { signal: 'SIGINT' });
        if (abortController && !abortController.signal.aborted) {
            abortController.abort();
        }
        void (0, gracefulShutdown_js_1.gracefulShutdown)(0);
    };
    process.on('SIGINT', sigintHandler);
    // Dump run()'s state at SIGTERM so a stuck session's healthsweep can name
    // the do/while(waitingForAgents) poll without reading the transcript.
    (0, cleanupRegistry_js_1.registerCleanup)(async () => {
        const bg = {};
        for (const t of (0, framework_js_1.getRunningTasks)(getAppState())) {
            if ((0, types_js_2.isBackgroundTask)(t))
                bg[t.type] = (bg[t.type] ?? 0) + 1;
        }
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'run_state_at_shutdown', {
            run_active: running,
            run_phase: runPhase,
            worker_status: (0, sessionState_js_1.getSessionState)(),
            internal_events_pending: structuredIO.internalEventsPending,
            bg_tasks: bg,
        });
    });
    // Wire the central onChangeAppState mode-diff hook to the SDK output stream.
    // This fires whenever ANY code path mutates toolPermissionContext.mode —
    // Shift+Tab, ExitPlanMode dialog, /plan slash command, rewind, bridge
    // set_permission_mode, the query loop, stop_task — rather than the two
    // paths that previously went through a bespoke wrapper.
    // The wrapper's body was fully redundant (it enqueued here AND called
    // notifySessionMetadataChanged, both of which onChangeAppState now covers);
    // keeping it would double-emit status messages.
    (0, sessionState_js_1.setPermissionModeChangedListener)(newMode => {
        // Only emit for SDK-exposed modes.
        if (newMode === 'default' ||
            newMode === 'acceptEdits' ||
            newMode === 'bypassPermissions' ||
            newMode === 'plan' ||
            newMode === ((0, bun_bundle_1.feature)('TRANSCRIPT_CLASSIFIER') && 'auto') ||
            newMode === 'dontAsk') {
            output.enqueue({
                type: 'system',
                subtype: 'status',
                status: null,
                permissionMode: newMode,
                uuid: (0, crypto_1.randomUUID)(),
                session_id: (0, state_js_2.getSessionId)(),
            });
        }
    });
    // Prompt suggestion tracking (push model)
    const suggestionState = {
        abortController: null,
        inflightPromise: null,
        lastEmitted: null,
        pendingSuggestion: null,
        pendingLastEmittedEntry: null,
    };
    // Set up AWS auth status listener if enabled
    let unsubscribeAuthStatus;
    if (options.enableAuthStatus) {
        const authStatusManager = awsAuthStatusManager_js_1.AwsAuthStatusManager.getInstance();
        unsubscribeAuthStatus = authStatusManager.subscribe(status => {
            output.enqueue({
                type: 'auth_status',
                isAuthenticating: status.isAuthenticating,
                output: status.output,
                error: status.error,
                uuid: (0, crypto_1.randomUUID)(),
                session_id: (0, state_js_2.getSessionId)(),
            });
        });
    }
    // Set up rate limit status listener to emit SDKRateLimitEvent for all status changes.
    // Emitting for all statuses (including 'allowed') ensures consumers can clear warnings
    // when rate limits reset. The upstream emitStatusChange already deduplicates via isEqual.
    const rateLimitListener = (limits) => {
        const rateLimitInfo = (0, mappers_js_1.toSDKRateLimitInfo)(limits);
        if (rateLimitInfo) {
            output.enqueue({
                type: 'rate_limit_event',
                rate_limit_info: rateLimitInfo,
                uuid: (0, crypto_1.randomUUID)(),
                session_id: (0, state_js_2.getSessionId)(),
            });
        }
    };
    claudeAiLimits_js_1.statusListeners.add(rateLimitListener);
    // Messages for internal tracking, directly mutated by ask(). These messages
    // include Assistant, User, Attachment, and Progress messages.
    // TODO: Clean up this code to avoid passing around a mutable array.
    const mutableMessages = initialMessages;
    // Seed the readFileState cache from the transcript (content the model saw,
    // with message timestamps) so getChangedFiles can detect external edits.
    // This cache instance must persist across ask() calls, since the edit tool
    // relies on this as a global state.
    let readFileState = (0, queryHelpers_js_1.extractReadFilesFromMessages)(initialMessages, (0, process_1.cwd)(), fileStateCache_js_1.READ_FILE_STATE_CACHE_SIZE);
    // Client-supplied readFileState seeds (via seed_read_state control request).
    // The stdin IIFE runs concurrently with ask() — a seed arriving mid-turn
    // would be lost to ask()'s clone-then-replace (QueryEngine.ts finally block)
    // if written directly into readFileState. Instead, seeds land here, merge
    // into getReadFileCache's view (readFileState-wins-ties: seeds fill gaps),
    // and are re-applied then CLEARED in setReadFileCache. One-shot: each seed
    // survives exactly one clone-replace cycle, then becomes a regular
    // readFileState entry subject to compact's clear like everything else.
    const pendingSeeds = (0, fileStateCache_js_1.createFileStateCacheWithSizeLimit)(fileStateCache_js_1.READ_FILE_STATE_CACHE_SIZE);
    // Auto-resume interrupted turns on restart so CC continues from where it
    // left off without requiring the SDK to re-send the prompt.
    const resumeInterruptedTurnEnv = process.env.CLAUDE_CODE_RESUME_INTERRUPTED_TURN;
    if (turnInterruptionState &&
        turnInterruptionState.kind !== 'none' &&
        resumeInterruptedTurnEnv) {
        (0, debug_js_1.logForDebugging)(`[print.ts] Auto-resuming interrupted turn (kind: ${turnInterruptionState.kind})`);
        // Remove the interrupted message and its sentinel, then re-enqueue so
        // the model sees it exactly once. For mid-turn interruptions, the
        // deserialization layer transforms them into interrupted_prompt by
        // appending a synthetic "Continue from where you left off." message.
        removeInterruptedMessage(mutableMessages, turnInterruptionState.message);
        (0, messageQueueManager_js_1.enqueue)({
            mode: 'prompt',
            value: turnInterruptionState.message.message.content,
            uuid: (0, crypto_1.randomUUID)(),
        });
    }
    const modelOptions = (0, modelOptions_js_1.getModelOptions)();
    const modelInfos = modelOptions.map(option => {
        const modelId = option.value === null ? 'default' : option.value;
        const resolvedModel = modelId === 'default'
            ? (0, model_js_1.getDefaultMainLoopModel)()
            : (0, model_js_1.parseUserSpecifiedModel)(modelId);
        const hasEffort = (0, effort_js_1.modelSupportsEffort)(resolvedModel);
        const hasAdaptiveThinking = (0, thinking_js_1.modelSupportsAdaptiveThinking)(resolvedModel);
        const hasFastMode = (0, fastMode_js_1.isFastModeSupportedByModel)(option.value);
        const hasAutoMode = (0, betas_js_1.modelSupportsAutoMode)(resolvedModel);
        return {
            value: modelId,
            displayName: option.label,
            description: option.description,
            ...(hasEffort && {
                supportsEffort: true,
                supportedEffortLevels: (0, effort_js_1.modelSupportsMaxEffort)(resolvedModel)
                    ? [...effort_js_1.EFFORT_LEVELS]
                    : effort_js_1.EFFORT_LEVELS.filter(l => l !== 'max'),
            }),
            ...(hasAdaptiveThinking && { supportsAdaptiveThinking: true }),
            ...(hasFastMode && { supportsFastMode: true }),
            ...(hasAutoMode && { supportsAutoMode: true }),
        };
    });
    let activeUserSpecifiedModel = options.userSpecifiedModel;
    function injectModelSwitchBreadcrumbs(modelArg, resolvedModel) {
        const breadcrumbs = (0, messages_js_1.createModelSwitchBreadcrumbs)(modelArg, (0, model_js_1.modelDisplayString)(resolvedModel));
        mutableMessages.push(...breadcrumbs);
        for (const crumb of breadcrumbs) {
            if (typeof crumb.message.content === 'string' &&
                crumb.message.content.includes(`<${xml_js_2.LOCAL_COMMAND_STDOUT_TAG}>`)) {
                output.enqueue({
                    type: 'user',
                    message: crumb.message,
                    session_id: (0, state_js_2.getSessionId)(),
                    parent_tool_use_id: null,
                    uuid: crumb.uuid,
                    timestamp: crumb.timestamp,
                    isReplay: true,
                });
            }
        }
    }
    // Cache SDK MCP clients to avoid reconnecting on each run
    let sdkClients = [];
    let sdkTools = [];
    // Track which MCP clients have had elicitation handlers registered
    const elicitationRegistered = new Set();
    /**
     * Register elicitation request/completion handlers on connected MCP clients
     * that haven't been registered yet. SDK MCP servers are excluded because they
     * route through SdkControlClientTransport. Hooks run first (matching REPL
     * behavior); if no hook responds, the request is forwarded to the SDK
     * consumer via the control protocol.
     */
    function registerElicitationHandlers(clients) {
        for (const connection of clients) {
            if (connection.type !== 'connected' ||
                elicitationRegistered.has(connection.name)) {
                continue;
            }
            // Skip SDK MCP servers — elicitation flows through SdkControlClientTransport
            if (connection.config.type === 'sdk') {
                continue;
            }
            const serverName = connection.name;
            // Wrapped in try/catch because setRequestHandler throws if the client wasn't
            // created with elicitation capability declared (e.g., SDK-created clients).
            try {
                connection.client.setRequestHandler(types_js_1.ElicitRequestSchema, async (request, extra) => {
                    (0, log_js_1.logMCPDebug)(serverName, `Elicitation request received in print mode: ${(0, slowOperations_js_1.jsonStringify)(request)}`);
                    const mode = request.params.mode === 'url' ? 'url' : 'form';
                    (0, index_js_3.logEvent)('tengu_mcp_elicitation_shown', {
                        mode: mode,
                    });
                    // Run elicitation hooks first — they can provide a response programmatically
                    const hookResponse = await (0, elicitationHandler_js_1.runElicitationHooks)(serverName, request.params, extra.signal);
                    if (hookResponse) {
                        (0, log_js_1.logMCPDebug)(serverName, `Elicitation resolved by hook: ${(0, slowOperations_js_1.jsonStringify)(hookResponse)}`);
                        (0, index_js_3.logEvent)('tengu_mcp_elicitation_response', {
                            mode: mode,
                            action: hookResponse.action,
                        });
                        return hookResponse;
                    }
                    // Delegate to SDK consumer via control protocol
                    const url = 'url' in request.params
                        ? request.params.url
                        : undefined;
                    const requestedSchema = 'requestedSchema' in request.params
                        ? request.params.requestedSchema
                        : undefined;
                    const elicitationId = 'elicitationId' in request.params
                        ? request.params.elicitationId
                        : undefined;
                    const rawResult = await structuredIO.handleElicitation(serverName, request.params.message, requestedSchema, extra.signal, mode, url, elicitationId);
                    const result = await (0, elicitationHandler_js_1.runElicitationResultHooks)(serverName, rawResult, extra.signal, mode, elicitationId);
                    (0, index_js_3.logEvent)('tengu_mcp_elicitation_response', {
                        mode: mode,
                        action: result.action,
                    });
                    return result;
                });
                // Surface completion notifications to SDK consumers (URL mode)
                connection.client.setNotificationHandler(types_js_1.ElicitationCompleteNotificationSchema, notification => {
                    const { elicitationId } = notification.params;
                    (0, log_js_1.logMCPDebug)(serverName, `Elicitation completion notification: ${elicitationId}`);
                    void (0, hooks_js_1.executeNotificationHooks)({
                        message: `MCP server "${serverName}" confirmed elicitation ${elicitationId} complete`,
                        notificationType: 'elicitation_complete',
                    });
                    output.enqueue({
                        type: 'system',
                        subtype: 'elicitation_complete',
                        mcp_server_name: serverName,
                        elicitation_id: elicitationId,
                        uuid: (0, crypto_1.randomUUID)(),
                        session_id: (0, state_js_2.getSessionId)(),
                    });
                });
                elicitationRegistered.add(serverName);
            }
            catch {
                // setRequestHandler throws if the client wasn't created with
                // elicitation capability — skip silently
            }
        }
    }
    async function updateSdkMcp() {
        // Check if SDK MCP servers need to be updated (new servers added or removed)
        const currentServerNames = new Set(Object.keys(sdkMcpConfigs));
        const connectedServerNames = new Set(sdkClients.map(c => c.name));
        // Check if there are any differences (additions or removals)
        const hasNewServers = Array.from(currentServerNames).some(name => !connectedServerNames.has(name));
        const hasRemovedServers = Array.from(connectedServerNames).some(name => !currentServerNames.has(name));
        // Check if any SDK clients are pending and need to be upgraded
        const hasPendingSdkClients = sdkClients.some(c => c.type === 'pending');
        // Check if any SDK clients failed their handshake and need to be retried.
        // Without this, a client that lands in 'failed' (e.g. handshake timeout on
        // a WS reconnect race) stays failed forever — its name satisfies the
        // connectedServerNames diff but it contributes zero tools.
        const hasFailedSdkClients = sdkClients.some(c => c.type === 'failed');
        const haveServersChanged = hasNewServers ||
            hasRemovedServers ||
            hasPendingSdkClients ||
            hasFailedSdkClients;
        if (haveServersChanged) {
            // Clean up removed servers
            for (const client of sdkClients) {
                if (!currentServerNames.has(client.name)) {
                    if (client.type === 'connected') {
                        await client.cleanup();
                    }
                }
            }
            // Re-initialize all SDK MCP servers with current config
            const sdkSetup = await (0, client_js_1.setupSdkMcpClients)(sdkMcpConfigs, (serverName, message) => structuredIO.sendMcpMessage(serverName, message));
            sdkClients = sdkSetup.clients;
            sdkTools = sdkSetup.tools;
            // Store SDK MCP tools in appState so subagents can access them via
            // assembleToolPool. Only tools are stored here — SDK clients are already
            // merged separately in the query loop (allMcpClients) and mcp_status handler.
            // Use both old (connectedServerNames) and new (currentServerNames) to remove
            // stale SDK tools when servers are added or removed.
            const allSdkNames = (0, array_js_1.uniq)([...connectedServerNames, ...currentServerNames]);
            setAppState(prev => ({
                ...prev,
                mcp: {
                    ...prev.mcp,
                    tools: [
                        ...prev.mcp.tools.filter(t => !allSdkNames.some(name => t.name.startsWith((0, mcpStringUtils_js_1.getMcpPrefix)(name)))),
                        ...sdkTools,
                    ],
                },
            }));
            // Set up the special internal VSCode MCP server if necessary.
            (0, vscodeSdkMcp_js_1.setupVscodeSdkMcp)(sdkClients);
        }
    }
    void updateSdkMcp();
    // State for dynamically added MCP servers (via mcp_set_servers control message)
    // These are separate from SDK MCP servers and support all transport types
    let dynamicMcpState = {
        clients: [],
        tools: [],
        configs: {},
    };
    // Shared tool assembly for ask() and the get_context_usage control request.
    // Closes over the mutable sdkTools/dynamicMcpState bindings so both call
    // sites see late-connecting servers.
    const buildAllTools = (appState) => {
        const assembledTools = (0, tools_js_1.assembleToolPool)(appState.toolPermissionContext, appState.mcp.tools);
        let allTools = (0, uniqBy_js_1.default)((0, toolPool_js_1.mergeAndFilterTools)([...tools, ...sdkTools, ...dynamicMcpState.tools], assembledTools, appState.toolPermissionContext.mode), 'name');
        if (options.permissionPromptToolName) {
            allTools = allTools.filter(tool => !(0, Tool_js_1.toolMatchesName)(tool, options.permissionPromptToolName));
        }
        const initJsonSchema = (0, state_js_1.getInitJsonSchema)();
        if (initJsonSchema && !options.jsonSchema) {
            const syntheticOutputResult = (0, SyntheticOutputTool_js_1.createSyntheticOutputTool)(initJsonSchema);
            if ('tool' in syntheticOutputResult) {
                allTools = [...allTools, syntheticOutputResult.tool];
            }
        }
        return allTools;
    };
    // Bridge handle for remote-control (SDK control message).
    // Mirrors the REPL's useReplBridge hook: the handle is created when
    // `remote_control` is enabled and torn down when disabled.
    let bridgeHandle = null;
    // Cursor into mutableMessages — tracks how far we've forwarded.
    // Same index-based diff as useReplBridge's lastWrittenIndexRef.
    let bridgeLastForwardedIndex = 0;
    // Forward new messages from mutableMessages to the bridge.
    // Called incrementally during each turn (so claude.ai sees progress
    // and stays alive during permission waits) and again after the turn.
    //
    // writeMessages has its own UUID-based dedup (initialMessageUUIDs,
    // recentPostedUUIDs) — the index cursor here is a pre-filter to avoid
    // O(n) re-scanning of already-sent messages on every call.
    function forwardMessagesToBridge() {
        if (!bridgeHandle)
            return;
        // Guard against mutableMessages shrinking (compaction truncates it).
        const startIndex = Math.min(bridgeLastForwardedIndex, mutableMessages.length);
        const newMessages = mutableMessages
            .slice(startIndex)
            .filter(m => m.type === 'user' || m.type === 'assistant');
        bridgeLastForwardedIndex = mutableMessages.length;
        if (newMessages.length > 0) {
            bridgeHandle.writeMessages(newMessages);
        }
    }
    // Helper to apply MCP server changes - used by both mcp_set_servers control message
    // and background plugin installation.
    // NOTE: Nested function required - mutates closure state (sdkMcpConfigs, sdkClients, etc.)
    let mcpChangesPromise = Promise.resolve({
        response: {
            added: [],
            removed: [],
            errors: {},
        },
        sdkServersChanged: false,
    });
    function applyMcpServerChanges(servers) {
        // Serialize calls to prevent race conditions between concurrent callers
        // (background plugin install and mcp_set_servers control messages)
        const doWork = async () => {
            const oldSdkClientNames = new Set(sdkClients.map(c => c.name));
            const result = await handleMcpSetServers(servers, { configs: sdkMcpConfigs, clients: sdkClients, tools: sdkTools }, dynamicMcpState, setAppState);
            // Update SDK state (need to mutate sdkMcpConfigs since it's shared)
            for (const key of Object.keys(sdkMcpConfigs)) {
                delete sdkMcpConfigs[key];
            }
            Object.assign(sdkMcpConfigs, result.newSdkState.configs);
            sdkClients = result.newSdkState.clients;
            sdkTools = result.newSdkState.tools;
            dynamicMcpState = result.newDynamicState;
            // Keep appState.mcp.tools in sync so subagents can see SDK MCP tools.
            // Use both old and new SDK client names to remove stale tools.
            if (result.sdkServersChanged) {
                const newSdkClientNames = new Set(sdkClients.map(c => c.name));
                const allSdkNames = (0, array_js_1.uniq)([...oldSdkClientNames, ...newSdkClientNames]);
                setAppState(prev => ({
                    ...prev,
                    mcp: {
                        ...prev.mcp,
                        tools: [
                            ...prev.mcp.tools.filter(t => !allSdkNames.some(name => t.name.startsWith((0, mcpStringUtils_js_1.getMcpPrefix)(name)))),
                            ...sdkTools,
                        ],
                    },
                }));
            }
            return {
                response: result.response,
                sdkServersChanged: result.sdkServersChanged,
            };
        };
        mcpChangesPromise = mcpChangesPromise.then(doWork, doWork);
        return mcpChangesPromise;
    }
    // Build McpServerStatus[] for control responses. Shared by mcp_status and
    // reload_plugins handlers. Reads closure state: sdkClients, dynamicMcpState.
    function buildMcpServerStatuses() {
        const currentAppState = getAppState();
        const currentMcpClients = currentAppState.mcp.clients;
        const allMcpTools = (0, uniqBy_js_1.default)([...currentAppState.mcp.tools, ...dynamicMcpState.tools], 'name');
        const existingNames = new Set([
            ...currentMcpClients.map(c => c.name),
            ...sdkClients.map(c => c.name),
        ]);
        return [
            ...currentMcpClients,
            ...sdkClients,
            ...dynamicMcpState.clients.filter(c => !existingNames.has(c.name)),
        ].map(connection => {
            let config;
            if (connection.config.type === 'sse' ||
                connection.config.type === 'http') {
                config = {
                    type: connection.config.type,
                    url: connection.config.url,
                    headers: connection.config.headers,
                    oauth: connection.config.oauth,
                };
            }
            else if (connection.config.type === 'claudeai-proxy') {
                config = {
                    type: 'claudeai-proxy',
                    url: connection.config.url,
                    id: connection.config.id,
                };
            }
            else if (connection.config.type === 'stdio' ||
                connection.config.type === undefined) {
                config = {
                    type: 'stdio',
                    command: connection.config.command,
                    args: connection.config.args,
                };
            }
            const serverTools = connection.type === 'connected'
                ? (0, utils_js_1.filterToolsByServer)(allMcpTools, connection.name).map(tool => ({
                    name: tool.mcpInfo?.toolName ?? tool.name,
                    annotations: {
                        readOnly: tool.isReadOnly({}) || undefined,
                        destructive: tool.isDestructive?.({}) || undefined,
                        openWorld: tool.isOpenWorld?.({}) || undefined,
                    },
                }))
                : undefined;
            // Capabilities passthrough with allowlist pre-filter. The IDE reads
            // experimental['claude/channel'] to decide whether to show the
            // Enable-channel prompt — only echo it if channel_enable would
            // actually pass the allowlist. Not a security boundary (the
            // handler re-runs the full gate); just avoids dead buttons.
            let capabilities;
            if (((0, bun_bundle_1.feature)('KAIROS') || (0, bun_bundle_1.feature)('KAIROS_CHANNELS')) &&
                connection.type === 'connected' &&
                connection.capabilities.experimental) {
                const exp = { ...connection.capabilities.experimental };
                if (exp['claude/channel'] &&
                    (!(0, channelAllowlist_js_1.isChannelsEnabled)() ||
                        !(0, channelAllowlist_js_1.isChannelAllowlisted)(connection.config.pluginSource))) {
                    delete exp['claude/channel'];
                }
                if (Object.keys(exp).length > 0) {
                    capabilities = { experimental: exp };
                }
            }
            return {
                name: connection.name,
                status: connection.type,
                serverInfo: connection.type === 'connected' ? connection.serverInfo : undefined,
                error: connection.type === 'failed' ? connection.error : undefined,
                config,
                scope: connection.config.scope,
                tools: serverTools,
                capabilities,
            };
        });
    }
    // NOTE: Nested function required - needs closure access to applyMcpServerChanges and updateSdkMcp
    async function installPluginsAndApplyMcpInBackground() {
        try {
            // Join point for user settings (fired at runHeadless entry) and managed
            // settings (fired in main.tsx preAction). downloadUserSettings() caches
            // its promise so this awaits the same in-flight request.
            await Promise.all([
                (0, bun_bundle_1.feature)('DOWNLOAD_USER_SETTINGS') &&
                    ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_REMOTE) || (0, state_js_2.getIsRemoteMode)())
                    ? (0, diagLogs_js_1.withDiagnosticsTiming)('headless_user_settings_download', () => (0, index_js_1.downloadUserSettings)())
                    : Promise.resolve(),
                (0, diagLogs_js_1.withDiagnosticsTiming)('headless_managed_settings_wait', () => (0, index_js_2.waitForRemoteManagedSettingsToLoad)()),
            ]);
            const pluginsInstalled = await (0, headlessPluginInstall_js_1.installPluginsForHeadless)();
            if (pluginsInstalled) {
                await applyPluginMcpDiff();
            }
        }
        catch (error) {
            (0, log_js_1.logError)(error);
        }
    }
    // Background plugin installation for all headless users
    // Installs marketplaces from extraKnownMarketplaces and missing enabled plugins
    // CLAUDE_CODE_SYNC_PLUGIN_INSTALL=true: resolved in run() before the first
    // query so plugins are guaranteed available on the first ask().
    let pluginInstallPromise = null;
    // --bare / SIMPLE: skip plugin install. Scripted calls don't add plugins
    // mid-session; the next interactive run reconciles.
    if (!(0, envUtils_js_1.isBareMode)()) {
        if ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_SYNC_PLUGIN_INSTALL)) {
            pluginInstallPromise = installPluginsAndApplyMcpInBackground();
        }
        else {
            void installPluginsAndApplyMcpInBackground();
        }
    }
    // Idle timeout management
    const idleTimeout = (0, idleTimeout_js_1.createIdleTimeoutManager)(() => !running);
    // Mutable commands and agents for hot reloading
    let currentCommands = commands;
    let currentAgents = agents;
    // Clear all plugin-related caches, reload commands/agents/hooks.
    // Called after CLAUDE_CODE_SYNC_PLUGIN_INSTALL completes (before first query)
    // and after non-sync background install finishes.
    // refreshActivePlugins calls clearAllCaches() which is required because
    // loadAllPlugins() may have run during main.tsx startup BEFORE managed
    // settings were fetched. Without clearing, getCommands() would rebuild
    // from a stale plugin list.
    async function refreshPluginState() {
        // refreshActivePlugins handles the full cache sweep (clearAllCaches),
        // reloads all plugin component loaders, writes AppState.plugins +
        // AppState.agentDefinitions, registers hooks, and bumps mcp.pluginReconnectKey.
        const { agentDefinitions: freshAgentDefs } = await (0, refresh_js_1.refreshActivePlugins)(setAppState);
        // Headless-specific: currentCommands/currentAgents are local mutable refs
        // captured by the query loop (REPL uses AppState instead). getCommands is
        // fresh because refreshActivePlugins cleared its cache.
        currentCommands = await (0, commands_js_2.getCommands)((0, process_1.cwd)());
        // Preserve SDK-provided agents (--agents CLI flag or SDK initialize
        // control_request) — both inject via parseAgentsFromJson with
        // source='flagSettings'. loadMarkdownFilesForSubdir never assigns this
        // source, so it cleanly discriminates "injected, not disk-loadable".
        //
        // The previous filter used a negative set-diff (!freshAgentTypes.has(a))
        // which also matched plugin agents that were in the poisoned initial
        // currentAgents but correctly excluded from freshAgentDefs after managed
        // settings applied — leaking policy-blocked agents into the init message.
        // See gh-23085: isBridgeEnabled() at Commander-definition time poisoned
        // the settings cache before setEligibility(true) ran.
        const sdkAgents = currentAgents.filter(a => a.source === 'flagSettings');
        currentAgents = [...freshAgentDefs.allAgents, ...sdkAgents];
    }
    // Re-diff MCP configs after plugin state changes. Filters to
    // process-transport-supported types and carries SDK-mode servers through
    // so applyMcpServerChanges' diff doesn't close their transports.
    // Nested: needs closure access to sdkMcpConfigs, applyMcpServerChanges,
    // updateSdkMcp.
    async function applyPluginMcpDiff() {
        const { servers: newConfigs } = await (0, config_js_2.getAllMcpConfigs)();
        const supportedConfigs = {};
        for (const [name, config] of Object.entries(newConfigs)) {
            const type = config.type;
            if (type === undefined ||
                type === 'stdio' ||
                type === 'sse' ||
                type === 'http' ||
                type === 'sdk') {
                supportedConfigs[name] = config;
            }
        }
        for (const [name, config] of Object.entries(sdkMcpConfigs)) {
            if (config.type === 'sdk' && !(name in supportedConfigs)) {
                supportedConfigs[name] = config;
            }
        }
        const { response, sdkServersChanged } = await applyMcpServerChanges(supportedConfigs);
        if (sdkServersChanged) {
            void updateSdkMcp();
        }
        (0, debug_js_1.logForDebugging)(`Headless MCP refresh: added=${response.added.length}, removed=${response.removed.length}`);
    }
    // Subscribe to skill changes for hot reloading
    const unsubscribeSkillChanges = skillChangeDetector_js_1.skillChangeDetector.subscribe(() => {
        (0, commands_js_2.clearCommandsCache)();
        void (0, commands_js_2.getCommands)((0, process_1.cwd)()).then(newCommands => {
            currentCommands = newCommands;
        });
    });
    // Proactive mode: schedule a tick to keep the model looping autonomously.
    // setTimeout(0) yields to the event loop so pending stdin messages
    // (interrupts, user messages) are processed before the tick fires.
    const scheduleProactiveTick = (0, bun_bundle_1.feature)('PROACTIVE') || (0, bun_bundle_1.feature)('KAIROS')
        ? () => {
            setTimeout(() => {
                if (!proactiveModule?.isProactiveActive() ||
                    proactiveModule.isProactivePaused() ||
                    inputClosed) {
                    return;
                }
                const tickContent = `<${xml_js_1.TICK_TAG}>${new Date().toLocaleTimeString()}</${xml_js_1.TICK_TAG}>`;
                (0, messageQueueManager_js_1.enqueue)({
                    mode: 'prompt',
                    value: tickContent,
                    uuid: (0, crypto_1.randomUUID)(),
                    priority: 'later',
                    isMeta: true,
                });
                void run();
            }, 0);
        }
        : undefined;
    // Abort the current operation when a 'now' priority message arrives.
    (0, messageQueueManager_js_1.subscribeToCommandQueue)(() => {
        if (abortController && (0, messageQueueManager_js_1.getCommandsByMaxPriority)('now').length > 0) {
            abortController.abort('interrupt');
        }
    });
    const run = async () => {
        if (running) {
            return;
        }
        running = true;
        runPhase = undefined;
        (0, sessionState_js_1.notifySessionStateChanged)('running');
        idleTimeout.stop();
        (0, headlessProfiler_js_1.headlessProfilerCheckpoint)('run_entry');
        // TODO(custom-tool-refactor): Should move to the init message, like browser
        await updateSdkMcp();
        (0, headlessProfiler_js_1.headlessProfilerCheckpoint)('after_updateSdkMcp');
        // Resolve deferred plugin installation (CLAUDE_CODE_SYNC_PLUGIN_INSTALL).
        // The promise was started eagerly so installation overlaps with other init.
        // Awaiting here guarantees plugins are available before the first ask().
        // If CLAUDE_CODE_SYNC_PLUGIN_INSTALL_TIMEOUT_MS is set, races against that
        // deadline and proceeds without plugins on timeout (logging an error).
        if (pluginInstallPromise) {
            const timeoutMs = parseInt(process.env.CLAUDE_CODE_SYNC_PLUGIN_INSTALL_TIMEOUT_MS || '', 10);
            if (timeoutMs > 0) {
                const timeout = (0, sleep_js_1.sleep)(timeoutMs).then(() => 'timeout');
                const result = await Promise.race([pluginInstallPromise, timeout]);
                if (result === 'timeout') {
                    (0, log_js_1.logError)(new Error(`CLAUDE_CODE_SYNC_PLUGIN_INSTALL: plugin installation timed out after ${timeoutMs}ms`));
                    (0, index_js_3.logEvent)('tengu_sync_plugin_install_timeout', {
                        timeout_ms: timeoutMs,
                    });
                }
            }
            else {
                await pluginInstallPromise;
            }
            pluginInstallPromise = null;
            // Refresh commands, agents, and hooks now that plugins are installed
            await refreshPluginState();
            // Set up hot-reload for plugin hooks now that the initial install is done.
            // In sync-install mode, setup.ts skips this to avoid racing with the install.
            const { setupPluginHookHotReload } = await Promise.resolve().then(() => __importStar(require('../utils/plugins/loadPluginHooks.js')));
            setupPluginHookHotReload();
        }
        // Only main-thread commands (agentId===undefined) — subagent
        // notifications are drained by the subagent's mid-turn gate in query.ts.
        // Defined outside the try block so it's accessible in the post-finally
        // queue re-checks at the bottom of run().
        const isMainThread = (cmd) => cmd.agentId === undefined;
        try {
            let command;
            let waitingForAgents = false;
            // Extract command processing into a named function for the do-while pattern.
            // Drains the queue, batching consecutive prompt-mode commands into one
            // ask() call so messages that queued up during a long turn coalesce
            // into a single follow-up turn instead of N separate turns.
            const drainCommandQueue = async () => {
                while ((command = (0, messageQueueManager_js_1.dequeue)(isMainThread))) {
                    if (command.mode !== 'prompt' &&
                        command.mode !== 'orphaned-permission' &&
                        command.mode !== 'task-notification') {
                        throw new Error('only prompt commands are supported in streaming mode');
                    }
                    // Non-prompt commands (task-notification, orphaned-permission) carry
                    // side effects or orphanedPermission state, so they process singly.
                    // Prompt commands greedily collect followers with matching workload.
                    const batch = [command];
                    if (command.mode === 'prompt') {
                        while (canBatchWith(command, (0, messageQueueManager_js_1.peek)(isMainThread))) {
                            batch.push((0, messageQueueManager_js_1.dequeue)(isMainThread));
                        }
                        if (batch.length > 1) {
                            command = {
                                ...command,
                                value: joinPromptValues(batch.map(c => c.value)),
                                uuid: batch.findLast(c => c.uuid)?.uuid ?? command.uuid,
                            };
                        }
                    }
                    const batchUuids = batch.map(c => c.uuid).filter(u => u !== undefined);
                    // QueryEngine will emit a replay for command.uuid (the last uuid in
                    // the batch) via its messagesToAck path. Emit replays here for the
                    // rest so consumers that track per-uuid delivery (clank's
                    // asyncMessages footer, CCR) see an ack for every message they sent,
                    // not just the one that survived the merge.
                    if (options.replayUserMessages && batch.length > 1) {
                        for (const c of batch) {
                            if (c.uuid && c.uuid !== command.uuid) {
                                output.enqueue({
                                    type: 'user',
                                    message: { role: 'user', content: c.value },
                                    session_id: (0, state_js_2.getSessionId)(),
                                    parent_tool_use_id: null,
                                    uuid: c.uuid,
                                    isReplay: true,
                                });
                            }
                        }
                    }
                    // Combine all MCP clients. appState.mcp is populated incrementally
                    // per-server by main.tsx (mirrors useManageMCPConnections). Reading
                    // fresh per-command means late-connecting servers are visible on the
                    // next turn. registerElicitationHandlers is idempotent (tracking set).
                    const appState = getAppState();
                    const allMcpClients = [
                        ...appState.mcp.clients,
                        ...sdkClients,
                        ...dynamicMcpState.clients,
                    ];
                    registerElicitationHandlers(allMcpClients);
                    // Channel handlers for servers allowlisted via --channels at
                    // construction time (or enableChannel() mid-session). Runs every
                    // turn like registerElicitationHandlers — idempotent per-client
                    // (setNotificationHandler replaces, not stacks) and no-ops for
                    // non-allowlisted servers (one feature-flag check).
                    for (const client of allMcpClients) {
                        reregisterChannelHandlerAfterReconnect(client);
                    }
                    const allTools = buildAllTools(appState);
                    for (const uuid of batchUuids) {
                        (0, commandLifecycle_js_1.notifyCommandLifecycle)(uuid, 'started');
                    }
                    // Task notifications arrive when background agents complete.
                    // Emit an SDK system event for SDK consumers, then fall through
                    // to ask() so the model sees the agent result and can act on it.
                    // This matches TUI behavior where useQueueProcessor always feeds
                    // notifications to the model regardless of coordinator mode.
                    if (command.mode === 'task-notification') {
                        const notificationText = typeof command.value === 'string' ? command.value : '';
                        // Parse the XML-formatted notification
                        const taskIdMatch = notificationText.match(/<task-id>([^<]+)<\/task-id>/);
                        const toolUseIdMatch = notificationText.match(/<tool-use-id>([^<]+)<\/tool-use-id>/);
                        const outputFileMatch = notificationText.match(/<output-file>([^<]+)<\/output-file>/);
                        const statusMatch = notificationText.match(/<status>([^<]+)<\/status>/);
                        const summaryMatch = notificationText.match(/<summary>([^<]+)<\/summary>/);
                        const isValidStatus = (s) => s === 'completed' ||
                            s === 'failed' ||
                            s === 'stopped' ||
                            s === 'killed';
                        const rawStatus = statusMatch?.[1];
                        const status = isValidStatus(rawStatus)
                            ? rawStatus === 'killed'
                                ? 'stopped'
                                : rawStatus
                            : 'completed';
                        const usageMatch = notificationText.match(/<usage>([\s\S]*?)<\/usage>/);
                        const usageContent = usageMatch?.[1] ?? '';
                        const totalTokensMatch = usageContent.match(/<total_tokens>(\d+)<\/total_tokens>/);
                        const toolUsesMatch = usageContent.match(/<tool_uses>(\d+)<\/tool_uses>/);
                        const durationMsMatch = usageContent.match(/<duration_ms>(\d+)<\/duration_ms>/);
                        // Only emit a task_notification SDK event when a <status> tag is
                        // present — that means this is a terminal notification (completed/
                        // failed/stopped). Stream events from enqueueStreamEvent carry no
                        // <status> (they're progress pings); emitting them here would
                        // default to 'completed' and falsely close the task for SDK
                        // consumers. Terminal bookends are now emitted directly via
                        // emitTaskTerminatedSdk, so skipping statusless events is safe.
                        if (statusMatch) {
                            output.enqueue({
                                type: 'system',
                                subtype: 'task_notification',
                                task_id: taskIdMatch?.[1] ?? '',
                                tool_use_id: toolUseIdMatch?.[1],
                                status,
                                output_file: outputFileMatch?.[1] ?? '',
                                summary: summaryMatch?.[1] ?? '',
                                usage: totalTokensMatch && toolUsesMatch
                                    ? {
                                        total_tokens: parseInt(totalTokensMatch[1], 10),
                                        tool_uses: parseInt(toolUsesMatch[1], 10),
                                        duration_ms: durationMsMatch
                                            ? parseInt(durationMsMatch[1], 10)
                                            : 0,
                                    }
                                    : undefined,
                                session_id: (0, state_js_2.getSessionId)(),
                                uuid: (0, crypto_1.randomUUID)(),
                            });
                        }
                        // No continue -- fall through to ask() so the model processes the result
                    }
                    const input = command.value;
                    if (structuredIO instanceof remoteIO_js_1.RemoteIO && command.mode === 'prompt') {
                        (0, index_js_3.logEvent)('tengu_bridge_message_received', {
                            is_repl: false,
                        });
                    }
                    // Abort any in-flight suggestion generation and track acceptance
                    suggestionState.abortController?.abort();
                    suggestionState.abortController = null;
                    suggestionState.pendingSuggestion = null;
                    suggestionState.pendingLastEmittedEntry = null;
                    if (suggestionState.lastEmitted) {
                        if (command.mode === 'prompt') {
                            // SDK user messages enqueue ContentBlockParam[], not a plain string
                            const inputText = typeof input === 'string'
                                ? input
                                : input.find(b => b.type === 'text')?.text;
                            if (typeof inputText === 'string') {
                                (0, promptSuggestion_js_1.logSuggestionOutcome)(suggestionState.lastEmitted.text, inputText, suggestionState.lastEmitted.emittedAt, suggestionState.lastEmitted.promptId, suggestionState.lastEmitted.generationRequestId);
                            }
                            suggestionState.lastEmitted = null;
                        }
                    }
                    abortController = (0, abortController_js_1.createAbortController)();
                    const turnStartTime = (0, bun_bundle_1.feature)('FILE_PERSISTENCE')
                        ? Date.now()
                        : undefined;
                    (0, headlessProfiler_js_1.headlessProfilerCheckpoint)('before_ask');
                    (0, queryProfiler_js_1.startQueryProfile)();
                    // Per-iteration ALS context so bg agents spawned inside ask()
                    // inherit workload across their detached awaits. In-process cron
                    // stamps cmd.workload; the SDK --workload flag is options.workload.
                    // const-capture: TS loses `while ((command = dequeue()))` narrowing
                    // inside the closure.
                    const cmd = command;
                    await (0, workloadContext_js_1.runWithWorkload)(cmd.workload ?? options.workload, async () => {
                        for await (const message of (0, QueryEngine_js_1.ask)({
                            commands: (0, uniqBy_js_1.default)([...currentCommands, ...appState.mcp.commands], 'name'),
                            prompt: input,
                            promptUuid: cmd.uuid,
                            isMeta: cmd.isMeta,
                            cwd: (0, process_1.cwd)(),
                            tools: allTools,
                            verbose: options.verbose,
                            mcpClients: allMcpClients,
                            thinkingConfig: options.thinkingConfig,
                            maxTurns: options.maxTurns,
                            maxBudgetUsd: options.maxBudgetUsd,
                            taskBudget: options.taskBudget,
                            canUseTool,
                            userSpecifiedModel: activeUserSpecifiedModel,
                            fallbackModel: options.fallbackModel,
                            jsonSchema: (0, state_js_1.getInitJsonSchema)() ?? options.jsonSchema,
                            mutableMessages,
                            getReadFileCache: () => pendingSeeds.size === 0
                                ? readFileState
                                : (0, fileStateCache_js_1.mergeFileStateCaches)(readFileState, pendingSeeds),
                            setReadFileCache: cache => {
                                readFileState = cache;
                                for (const [path, seed] of pendingSeeds.entries()) {
                                    const existing = readFileState.get(path);
                                    if (!existing || seed.timestamp > existing.timestamp) {
                                        readFileState.set(path, seed);
                                    }
                                }
                                pendingSeeds.clear();
                            },
                            customSystemPrompt: options.systemPrompt,
                            appendSystemPrompt: options.appendSystemPrompt,
                            getAppState,
                            setAppState,
                            abortController,
                            replayUserMessages: options.replayUserMessages,
                            includePartialMessages: options.includePartialMessages,
                            handleElicitation: (serverName, params, elicitSignal) => structuredIO.handleElicitation(serverName, params.message, undefined, elicitSignal, params.mode, params.url, 'elicitationId' in params ? params.elicitationId : undefined),
                            agents: currentAgents,
                            orphanedPermission: cmd.orphanedPermission,
                            setSDKStatus: status => {
                                output.enqueue({
                                    type: 'system',
                                    subtype: 'status',
                                    status,
                                    session_id: (0, state_js_2.getSessionId)(),
                                    uuid: (0, crypto_1.randomUUID)(),
                                });
                            },
                        })) {
                            // Forward messages to bridge incrementally (mid-turn) so
                            // claude.ai sees progress and the connection stays alive
                            // while blocked on permission requests.
                            forwardMessagesToBridge();
                            if (message.type === 'result') {
                                // Flush pending SDK events so they appear before result on the stream.
                                for (const event of (0, sdkEventQueue_js_1.drainSdkEvents)()) {
                                    output.enqueue(event);
                                }
                                // Hold-back: don't emit result while background agents are running
                                const currentState = getAppState();
                                if ((0, framework_js_1.getRunningTasks)(currentState).some(t => (t.type === 'local_agent' ||
                                    t.type === 'local_workflow') &&
                                    (0, types_js_2.isBackgroundTask)(t))) {
                                    heldBackResult = message;
                                }
                                else {
                                    heldBackResult = null;
                                    output.enqueue(message);
                                }
                            }
                            else {
                                // Flush SDK events (task_started, task_progress) so background
                                // agent progress is streamed in real-time, not batched until result.
                                for (const event of (0, sdkEventQueue_js_1.drainSdkEvents)()) {
                                    output.enqueue(event);
                                }
                                output.enqueue(message);
                            }
                        }
                    }); // end runWithWorkload
                    for (const uuid of batchUuids) {
                        (0, commandLifecycle_js_1.notifyCommandLifecycle)(uuid, 'completed');
                    }
                    // Forward messages to bridge after each turn
                    forwardMessagesToBridge();
                    bridgeHandle?.sendResult();
                    if ((0, bun_bundle_1.feature)('FILE_PERSISTENCE') && turnStartTime !== undefined) {
                        void (0, filePersistence_js_1.executeFilePersistence)(turnStartTime, abortController.signal, result => {
                            output.enqueue({
                                type: 'system',
                                subtype: 'files_persisted',
                                files: result.files,
                                failed: result.failed,
                                processed_at: new Date().toISOString(),
                                uuid: (0, crypto_1.randomUUID)(),
                                session_id: (0, state_js_2.getSessionId)(),
                            });
                        });
                    }
                    // Generate and emit prompt suggestion for SDK consumers
                    if (options.promptSuggestions &&
                        !(0, envUtils_js_1.isEnvDefinedFalsy)(process.env.CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION)) {
                        // TS narrows suggestionState to never in the while loop body;
                        // cast via unknown to reset narrowing.
                        const state = suggestionState;
                        state.abortController?.abort();
                        const localAbort = new AbortController();
                        suggestionState.abortController = localAbort;
                        const cacheSafeParams = (0, forkedAgent_js_1.getLastCacheSafeParams)();
                        if (!cacheSafeParams) {
                            (0, promptSuggestion_js_1.logSuggestionSuppressed)('sdk_no_params', undefined, undefined, 'sdk');
                        }
                        else {
                            // Use a ref object so the IIFE's finally can compare against its own
                            // promise without a self-reference (which upsets TypeScript's flow analysis).
                            const ref = { promise: null };
                            ref.promise = (async () => {
                                try {
                                    const result = await (0, promptSuggestion_js_1.tryGenerateSuggestion)(localAbort, mutableMessages, getAppState, cacheSafeParams, 'sdk');
                                    if (!result || localAbort.signal.aborted)
                                        return;
                                    const suggestionMsg = {
                                        type: 'prompt_suggestion',
                                        suggestion: result.suggestion,
                                        uuid: (0, crypto_1.randomUUID)(),
                                        session_id: (0, state_js_2.getSessionId)(),
                                    };
                                    const lastEmittedEntry = {
                                        text: result.suggestion,
                                        emittedAt: Date.now(),
                                        promptId: result.promptId,
                                        generationRequestId: result.generationRequestId,
                                    };
                                    // Defer emission if the result is being held for background agents,
                                    // so that prompt_suggestion always arrives after result.
                                    // Only set lastEmitted when the suggestion is actually delivered
                                    // to the consumer; deferred suggestions may be discarded before
                                    // delivery if a new command arrives first.
                                    if (heldBackResult) {
                                        suggestionState.pendingSuggestion = suggestionMsg;
                                        suggestionState.pendingLastEmittedEntry = {
                                            text: lastEmittedEntry.text,
                                            promptId: lastEmittedEntry.promptId,
                                            generationRequestId: lastEmittedEntry.generationRequestId,
                                        };
                                    }
                                    else {
                                        suggestionState.lastEmitted = lastEmittedEntry;
                                        output.enqueue(suggestionMsg);
                                    }
                                }
                                catch (error) {
                                    if (error instanceof Error &&
                                        (error.name === 'AbortError' ||
                                            error.name === 'APIUserAbortError')) {
                                        (0, promptSuggestion_js_1.logSuggestionSuppressed)('aborted', undefined, undefined, 'sdk');
                                        return;
                                    }
                                    (0, log_js_1.logError)((0, errors_js_1.toError)(error));
                                }
                                finally {
                                    if (suggestionState.inflightPromise === ref.promise) {
                                        suggestionState.inflightPromise = null;
                                    }
                                }
                            })();
                            suggestionState.inflightPromise = ref.promise;
                        }
                    }
                    // Log headless profiler metrics for this turn and start next turn
                    (0, headlessProfiler_js_1.logHeadlessProfilerTurn)();
                    (0, queryProfiler_js_1.logQueryProfileReport)();
                    (0, headlessProfiler_js_1.headlessProfilerStartTurn)();
                }
            };
            // Use a do-while loop to drain commands and then wait for any
            // background agents that are still running. When agents complete,
            // their notifications are enqueued and the loop re-drains.
            do {
                // Drain SDK events (task_started, task_progress) before command queue
                // so progress events precede task_notification on the stream.
                for (const event of (0, sdkEventQueue_js_1.drainSdkEvents)()) {
                    output.enqueue(event);
                }
                runPhase = 'draining_commands';
                await drainCommandQueue();
                // Check for running background tasks before exiting.
                // Exclude in_process_teammate — teammates are long-lived by design
                // (status: 'running' for their whole lifetime, cleaned up by the
                // shutdown protocol, not by transitioning to 'completed'). Waiting
                // on them here loops forever (gh-30008). Same exclusion already
                // exists at useBackgroundTaskNavigation.ts:55 for the same reason;
                // L1839 above is already narrower (type === 'local_agent') so it
                // doesn't hit this.
                waitingForAgents = false;
                {
                    const state = getAppState();
                    const hasRunningBg = (0, framework_js_1.getRunningTasks)(state).some(t => (0, types_js_2.isBackgroundTask)(t) && t.type !== 'in_process_teammate');
                    const hasMainThreadQueued = (0, messageQueueManager_js_1.peek)(isMainThread) !== undefined;
                    if (hasRunningBg || hasMainThreadQueued) {
                        waitingForAgents = true;
                        if (!hasMainThreadQueued) {
                            runPhase = 'waiting_for_agents';
                            // No commands ready yet, wait for tasks to complete
                            await (0, sleep_js_1.sleep)(100);
                        }
                        // Loop back to drain any newly queued commands
                    }
                }
            } while (waitingForAgents);
            if (heldBackResult) {
                output.enqueue(heldBackResult);
                heldBackResult = null;
                if (suggestionState.pendingSuggestion) {
                    output.enqueue(suggestionState.pendingSuggestion);
                    // Now that the suggestion is actually delivered, record it for acceptance tracking
                    if (suggestionState.pendingLastEmittedEntry) {
                        suggestionState.lastEmitted = {
                            ...suggestionState.pendingLastEmittedEntry,
                            emittedAt: Date.now(),
                        };
                        suggestionState.pendingLastEmittedEntry = null;
                    }
                    suggestionState.pendingSuggestion = null;
                }
            }
        }
        catch (error) {
            // Emit error result message before shutting down
            // Write directly to structuredIO to ensure immediate delivery
            try {
                await structuredIO.write({
                    type: 'result',
                    subtype: 'error_during_execution',
                    duration_ms: 0,
                    duration_api_ms: 0,
                    is_error: true,
                    num_turns: 0,
                    stop_reason: null,
                    session_id: (0, state_js_2.getSessionId)(),
                    total_cost_usd: 0,
                    usage: logging_js_1.EMPTY_USAGE,
                    modelUsage: {},
                    permission_denials: [],
                    uuid: (0, crypto_1.randomUUID)(),
                    errors: [
                        (0, errors_js_1.errorMessage)(error),
                        ...(0, log_js_1.getInMemoryErrors)().map(_ => _.error),
                    ],
                });
            }
            catch {
                // If we can't emit the error result, continue with shutdown anyway
            }
            suggestionState.abortController?.abort();
            (0, gracefulShutdown_js_1.gracefulShutdownSync)(1);
            return;
        }
        finally {
            runPhase = 'finally_flush';
            // Flush pending internal events before going idle
            await structuredIO.flushInternalEvents();
            runPhase = 'finally_post_flush';
            if (!(0, gracefulShutdown_js_1.isShuttingDown)()) {
                (0, sessionState_js_1.notifySessionStateChanged)('idle');
                // Drain so the idle session_state_changed SDK event (plus any
                // terminal task_notification bookends emitted during bg-agent
                // teardown) reach the output stream before we block on the next
                // command. The do-while drain above only runs while
                // waitingForAgents; once we're here the next drain would be the
                // top of the next run(), which won't come if input is idle.
                for (const event of (0, sdkEventQueue_js_1.drainSdkEvents)()) {
                    output.enqueue(event);
                }
            }
            running = false;
            // Start idle timer when we finish processing and are waiting for input
            idleTimeout.start();
        }
        // Proactive tick: if proactive is active and queue is empty, inject a tick
        if (((0, bun_bundle_1.feature)('PROACTIVE') || (0, bun_bundle_1.feature)('KAIROS')) &&
            proactiveModule?.isProactiveActive() &&
            !proactiveModule.isProactivePaused()) {
            if ((0, messageQueueManager_js_1.peek)(isMainThread) === undefined && !inputClosed) {
                scheduleProactiveTick();
                return;
            }
        }
        // Re-check the queue after releasing the mutex. A message may have
        // arrived (and called run()) between the last dequeue() returning
        // undefined and `running = false` above. In that case the caller
        // saw `running === true` and returned immediately, leaving the
        // message stranded in the queue with no one to process it.
        if ((0, messageQueueManager_js_1.peek)(isMainThread) !== undefined) {
            void run();
            return;
        }
        // Check for unread teammate messages and process them
        // This mirrors what useInboxPoller does in interactive REPL mode
        // Poll until no more messages (teammates may still be working)
        {
            const currentAppState = getAppState();
            const teamContext = currentAppState.teamContext;
            if (teamContext && (0, teammate_js_1.isTeamLead)(teamContext)) {
                const agentName = 'team-lead';
                // Poll for messages while teammates are active
                // This is needed because teammates may send messages while we're waiting
                // Keep polling until the team is shut down
                const POLL_INTERVAL_MS = 500;
                while (true) {
                    // Check if teammates are still active
                    const refreshedState = getAppState();
                    const hasActiveTeammates = (0, teammate_js_1.hasActiveInProcessTeammates)(refreshedState) ||
                        (refreshedState.teamContext &&
                            Object.keys(refreshedState.teamContext.teammates).length > 0);
                    if (!hasActiveTeammates) {
                        (0, debug_js_1.logForDebugging)('[print.ts] No more active teammates, stopping poll');
                        break;
                    }
                    const unread = await (0, teammateMailbox_js_1.readUnreadMessages)(agentName, refreshedState.teamContext?.teamName);
                    if (unread.length > 0) {
                        (0, debug_js_1.logForDebugging)(`[print.ts] Team-lead found ${unread.length} unread messages`);
                        // Mark as read immediately to avoid duplicate processing
                        await (0, teammateMailbox_js_1.markMessagesAsRead)(agentName, refreshedState.teamContext?.teamName);
                        // Process shutdown_approved messages - remove teammates from team file
                        // This mirrors what useInboxPoller does in interactive mode (lines 546-606)
                        const teamName = refreshedState.teamContext?.teamName;
                        for (const m of unread) {
                            const shutdownApproval = (0, teammateMailbox_js_1.isShutdownApproved)(m.text);
                            if (shutdownApproval && teamName) {
                                const teammateToRemove = shutdownApproval.from;
                                (0, debug_js_1.logForDebugging)(`[print.ts] Processing shutdown_approved from ${teammateToRemove}`);
                                // Find the teammate ID by name
                                const teammateId = refreshedState.teamContext?.teammates
                                    ? Object.entries(refreshedState.teamContext.teammates).find(([, t]) => t.name === teammateToRemove)?.[0]
                                    : undefined;
                                if (teammateId) {
                                    // Remove from team file
                                    (0, teamHelpers_js_1.removeTeammateFromTeamFile)(teamName, {
                                        agentId: teammateId,
                                        name: teammateToRemove,
                                    });
                                    (0, debug_js_1.logForDebugging)(`[print.ts] Removed ${teammateToRemove} from team file`);
                                    // Unassign tasks owned by this teammate
                                    await (0, tasks_js_1.unassignTeammateTasks)(teamName, teammateId, teammateToRemove, 'shutdown');
                                    // Remove from teamContext in AppState
                                    setAppState(prev => {
                                        if (!prev.teamContext?.teammates)
                                            return prev;
                                        if (!(teammateId in prev.teamContext.teammates))
                                            return prev;
                                        const { [teammateId]: _, ...remainingTeammates } = prev.teamContext.teammates;
                                        return {
                                            ...prev,
                                            teamContext: {
                                                ...prev.teamContext,
                                                teammates: remainingTeammates,
                                            },
                                        };
                                    });
                                }
                            }
                        }
                        // Format messages same as useInboxPoller
                        const formatted = unread
                            .map((m) => `<${xml_js_1.TEAMMATE_MESSAGE_TAG} teammate_id="${m.from}"${m.color ? ` color="${m.color}"` : ''}>\n${m.text}\n</${xml_js_1.TEAMMATE_MESSAGE_TAG}>`)
                            .join('\n\n');
                        // Enqueue and process
                        (0, messageQueueManager_js_1.enqueue)({
                            mode: 'prompt',
                            value: formatted,
                            uuid: (0, crypto_1.randomUUID)(),
                        });
                        void run();
                        return; // run() will come back here after processing
                    }
                    // No messages - check if we need to prompt for shutdown
                    // If input is closed and teammates are active, inject shutdown prompt once
                    if (inputClosed && !shutdownPromptInjected) {
                        shutdownPromptInjected = true;
                        (0, debug_js_1.logForDebugging)('[print.ts] Input closed with active teammates, injecting shutdown prompt');
                        (0, messageQueueManager_js_1.enqueue)({
                            mode: 'prompt',
                            value: SHUTDOWN_TEAM_PROMPT,
                            uuid: (0, crypto_1.randomUUID)(),
                        });
                        void run();
                        return; // run() will come back here after processing
                    }
                    // Wait and check again
                    await (0, sleep_js_1.sleep)(POLL_INTERVAL_MS);
                }
            }
        }
        if (inputClosed) {
            // Check for active swarm that needs shutdown
            const hasActiveSwarm = await (async () => {
                // Wait for any working in-process team members to finish
                const currentAppState = getAppState();
                if ((0, teammate_js_1.hasWorkingInProcessTeammates)(currentAppState)) {
                    await (0, teammate_js_1.waitForTeammatesToBecomeIdle)(setAppState, currentAppState);
                }
                // Re-fetch state after potential wait
                const refreshedAppState = getAppState();
                const refreshedTeamContext = refreshedAppState.teamContext;
                const hasTeamMembersNotCleanedUp = refreshedTeamContext &&
                    Object.keys(refreshedTeamContext.teammates).length > 0;
                return (hasTeamMembersNotCleanedUp ||
                    (0, teammate_js_1.hasActiveInProcessTeammates)(refreshedAppState));
            })();
            if (hasActiveSwarm) {
                // Team members are idle or pane-based - inject prompt to shut down team
                (0, messageQueueManager_js_1.enqueue)({
                    mode: 'prompt',
                    value: SHUTDOWN_TEAM_PROMPT,
                    uuid: (0, crypto_1.randomUUID)(),
                });
                void run();
            }
            else {
                // Wait for any in-flight push suggestion before closing the output stream.
                if (suggestionState.inflightPromise) {
                    await Promise.race([suggestionState.inflightPromise, (0, sleep_js_1.sleep)(5000)]);
                }
                suggestionState.abortController?.abort();
                suggestionState.abortController = null;
                await (0, AsyncHookRegistry_js_1.finalizePendingAsyncHooks)();
                unsubscribeSkillChanges();
                unsubscribeAuthStatus?.();
                claudeAiLimits_js_1.statusListeners.delete(rateLimitListener);
                output.done();
            }
        }
    };
    // Set up UDS inbox callback so the query loop is kicked off
    // when a message arrives via the UDS socket in headless mode.
    if ((0, bun_bundle_1.feature)('UDS_INBOX')) {
        /* eslint-disable @typescript-eslint/no-require-imports */
        const { setOnEnqueue } = require('../utils/udsMessaging.js');
        /* eslint-enable @typescript-eslint/no-require-imports */
        setOnEnqueue(() => {
            if (!inputClosed) {
                void run();
            }
        });
    }
    // Cron scheduler: runs scheduled_tasks.json tasks in SDK/-p mode.
    // Mirrors REPL's useScheduledTasks hook. Fired prompts enqueue + kick
    // off run() directly — unlike REPL, there's no queue subscriber here
    // that drains on enqueue while idle. The run() mutex makes this safe
    // during an active turn: the call no-ops and the post-run recheck at
    // the end of run() picks up the queued command.
    let cronScheduler = null;
    if ((0, bun_bundle_1.feature)('AGENT_TRIGGERS') &&
        cronSchedulerModule &&
        cronGate?.isKairosCronEnabled()) {
        cronScheduler = cronSchedulerModule.createCronScheduler({
            onFire: prompt => {
                if (inputClosed)
                    return;
                (0, messageQueueManager_js_1.enqueue)({
                    mode: 'prompt',
                    value: prompt,
                    uuid: (0, crypto_1.randomUUID)(),
                    priority: 'later',
                    // System-generated — matches useScheduledTasks.ts REPL equivalent.
                    // Without this, messages.ts metaProp eval is {} → prompt leaks
                    // into visible transcript when cron fires mid-turn in -p mode.
                    isMeta: true,
                    // Threaded to cc_workload= in the billing-header attribution block
                    // so the API can serve cron requests at lower QoS. drainCommandQueue
                    // reads this per-iteration and hoists it into bootstrap state for
                    // the ask() call.
                    workload: workloadContext_js_1.WORKLOAD_CRON,
                });
                void run();
            },
            isLoading: () => running || inputClosed,
            getJitterConfig: cronJitterConfigModule?.getCronJitterConfig,
            isKilled: () => !cronGate?.isKairosCronEnabled(),
        });
        cronScheduler.start();
    }
    const sendControlResponseSuccess = function (message, response) {
        output.enqueue({
            type: 'control_response',
            response: {
                subtype: 'success',
                request_id: message.request_id,
                response: response,
            },
        });
    };
    const sendControlResponseError = function (message, errorMessage) {
        output.enqueue({
            type: 'control_response',
            response: {
                subtype: 'error',
                request_id: message.request_id,
                error: errorMessage,
            },
        });
    };
    // Handle unexpected permission responses by looking up the unresolved tool
    // call in the transcript and executing it
    const handledOrphanedToolUseIds = new Set();
    structuredIO.setUnexpectedResponseCallback(async (message) => {
        await handleOrphanedPermissionResponse({
            message,
            setAppState,
            handledToolUseIds: handledOrphanedToolUseIds,
            onEnqueued: () => {
                // The first message of a session might be the orphaned permission
                // check rather than a user prompt, so kick off the loop.
                void run();
            },
        });
    });
    // Track active OAuth flows per server so we can abort a previous flow
    // when a new mcp_authenticate request arrives for the same server.
    const activeOAuthFlows = new Map();
    // Track manual callback URL submit functions for active OAuth flows.
    // Used when localhost is not reachable (e.g., browser-based IDEs).
    const oauthCallbackSubmitters = new Map();
    // Track servers where the manual callback was actually invoked (so the
    // automatic reconnect path knows to skip — the extension will reconnect).
    const oauthManualCallbackUsed = new Set();
    // Track OAuth auth-only promises so mcp_oauth_callback_url can await
    // token exchange completion. Reconnect is handled separately by the
    // extension via handleAuthDone → mcp_reconnect.
    const oauthAuthPromises = new Map();
    // In-flight Anthropic OAuth flow (claude_authenticate). Single-slot: a
    // second authenticate request cleans up the first. The service holds the
    // PKCE verifier + localhost listener; the promise settles after
    // installOAuthTokens — after it resolves, the in-process memoized token
    // cache is already cleared and the next API call picks up the new creds.
    let claudeOAuth = null;
    // This is essentially spawning a parallel async task- we have two
    // running in parallel- one reading from stdin and adding to the
    // queue to be processed and another reading from the queue,
    // processing and returning the result of the generation.
    // The process is complete when the input stream completes and
    // the last generation of the queue has complete.
    void (async () => {
        let initialized = false;
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'cli_message_loop_started');
        for await (const message of structuredIO.structuredInput) {
            // Non-user events are handled inline (no queue). started→completed in
            // the same tick carries no information, so only fire completed.
            // control_response is reported by StructuredIO.processLine (which also
            // sees orphans that never yield here).
            const eventId = 'uuid' in message ? message.uuid : undefined;
            if (eventId &&
                message.type !== 'user' &&
                message.type !== 'control_response') {
                (0, commandLifecycle_js_1.notifyCommandLifecycle)(eventId, 'completed');
            }
            if (message.type === 'control_request') {
                if (message.request.subtype === 'interrupt') {
                    // Track escapes for attribution (ant-only feature)
                    if ((0, bun_bundle_1.feature)('COMMIT_ATTRIBUTION')) {
                        setAppState(prev => ({
                            ...prev,
                            attribution: {
                                ...prev.attribution,
                                escapeCount: prev.attribution.escapeCount + 1,
                            },
                        }));
                    }
                    if (abortController) {
                        abortController.abort();
                    }
                    suggestionState.abortController?.abort();
                    suggestionState.abortController = null;
                    suggestionState.lastEmitted = null;
                    suggestionState.pendingSuggestion = null;
                    sendControlResponseSuccess(message);
                }
                else if (message.request.subtype === 'end_session') {
                    (0, debug_js_1.logForDebugging)(`[print.ts] end_session received, reason=${message.request.reason ?? 'unspecified'}`);
                    if (abortController) {
                        abortController.abort();
                    }
                    suggestionState.abortController?.abort();
                    suggestionState.abortController = null;
                    suggestionState.lastEmitted = null;
                    suggestionState.pendingSuggestion = null;
                    sendControlResponseSuccess(message);
                    break; // exits for-await → falls through to inputClosed=true drain below
                }
                else if (message.request.subtype === 'initialize') {
                    // SDK MCP server names from the initialize message
                    // Populated by both browser and ProcessTransport sessions
                    if (message.request.sdkMcpServers &&
                        message.request.sdkMcpServers.length > 0) {
                        for (const serverName of message.request.sdkMcpServers) {
                            // Create placeholder config for SDK MCP servers
                            // The actual server connection is managed by the SDK Query class
                            sdkMcpConfigs[serverName] = {
                                type: 'sdk',
                                name: serverName,
                            };
                        }
                    }
                    await handleInitializeRequest(message.request, message.request_id, initialized, output, commands, modelInfos, structuredIO, !!options.enableAuthStatus, options, agents, getAppState);
                    // Enable prompt suggestions in AppState when SDK consumer opts in.
                    // shouldEnablePromptSuggestion() returns false for non-interactive
                    // sessions, but the SDK consumer explicitly requested suggestions.
                    if (message.request.promptSuggestions) {
                        setAppState(prev => {
                            if (prev.promptSuggestionEnabled)
                                return prev;
                            return { ...prev, promptSuggestionEnabled: true };
                        });
                    }
                    if (message.request.agentProgressSummaries &&
                        (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_slate_prism', true)) {
                        (0, state_js_1.setSdkAgentProgressSummariesEnabled)(true);
                    }
                    initialized = true;
                    // If the auto-resume logic pre-enqueued a command, drain it now
                    // that initialize has set up systemPrompt, agents, hooks, etc.
                    if ((0, messageQueueManager_js_1.hasCommandsInQueue)()) {
                        void run();
                    }
                }
                else if (message.request.subtype === 'set_permission_mode') {
                    const m = message.request; // for typescript (TODO: use readonly types to avoid this)
                    setAppState(prev => ({
                        ...prev,
                        toolPermissionContext: handleSetPermissionMode(m, message.request_id, prev.toolPermissionContext, output),
                        isUltraplanMode: m.ultraplan ?? prev.isUltraplanMode,
                    }));
                    // handleSetPermissionMode sends the control_response; the
                    // notifySessionMetadataChanged that used to follow here is
                    // now fired by onChangeAppState (with externalized mode name).
                }
                else if (message.request.subtype === 'set_model') {
                    const requestedModel = message.request.model ?? 'default';
                    const model = requestedModel === 'default'
                        ? (0, model_js_1.getDefaultMainLoopModel)()
                        : requestedModel;
                    activeUserSpecifiedModel = model;
                    (0, state_js_2.setMainLoopModelOverride)(model);
                    (0, sessionState_js_1.notifySessionMetadataChanged)({ model });
                    injectModelSwitchBreadcrumbs(requestedModel, model);
                    sendControlResponseSuccess(message);
                }
                else if (message.request.subtype === 'set_max_thinking_tokens') {
                    if (message.request.max_thinking_tokens === null) {
                        options.thinkingConfig = undefined;
                    }
                    else if (message.request.max_thinking_tokens === 0) {
                        options.thinkingConfig = { type: 'disabled' };
                    }
                    else {
                        options.thinkingConfig = {
                            type: 'enabled',
                            budgetTokens: message.request.max_thinking_tokens,
                        };
                    }
                    sendControlResponseSuccess(message);
                }
                else if (message.request.subtype === 'mcp_status') {
                    sendControlResponseSuccess(message, {
                        mcpServers: buildMcpServerStatuses(),
                    });
                }
                else if (message.request.subtype === 'get_context_usage') {
                    try {
                        const appState = getAppState();
                        const data = await (0, context_noninteractive_js_1.collectContextData)({
                            messages: mutableMessages,
                            getAppState,
                            options: {
                                mainLoopModel: (0, model_js_1.getMainLoopModel)(),
                                tools: buildAllTools(appState),
                                agentDefinitions: appState.agentDefinitions,
                                customSystemPrompt: options.systemPrompt,
                                appendSystemPrompt: options.appendSystemPrompt,
                            },
                        });
                        sendControlResponseSuccess(message, { ...data });
                    }
                    catch (error) {
                        sendControlResponseError(message, (0, errors_js_1.errorMessage)(error));
                    }
                }
                else if (message.request.subtype === 'mcp_message') {
                    // Handle MCP notifications from SDK servers
                    const mcpRequest = message.request;
                    const sdkClient = sdkClients.find(client => client.name === mcpRequest.server_name);
                    // Check client exists - dynamically added SDK servers may have
                    // placeholder clients with null client until updateSdkMcp() runs
                    if (sdkClient &&
                        sdkClient.type === 'connected' &&
                        sdkClient.client?.transport?.onmessage) {
                        sdkClient.client.transport.onmessage(mcpRequest.message);
                    }
                    sendControlResponseSuccess(message);
                }
                else if (message.request.subtype === 'rewind_files') {
                    const appState = getAppState();
                    const result = await handleRewindFiles(message.request.user_message_id, appState, setAppState, message.request.dry_run ?? false);
                    if (result.canRewind || message.request.dry_run) {
                        sendControlResponseSuccess(message, result);
                    }
                    else {
                        sendControlResponseError(message, result.error ?? 'Unexpected error');
                    }
                }
                else if (message.request.subtype === 'cancel_async_message') {
                    const targetUuid = message.request.message_uuid;
                    const removed = (0, messageQueueManager_js_1.dequeueAllMatching)(cmd => cmd.uuid === targetUuid);
                    sendControlResponseSuccess(message, {
                        cancelled: removed.length > 0,
                    });
                }
                else if (message.request.subtype === 'seed_read_state') {
                    // Client observed a Read that was later removed from context (e.g.
                    // by snip), so transcript-based seeding missed it. Queued into
                    // pendingSeeds; applied at the next clone-replace boundary.
                    try {
                        // expandPath: all other readFileState writers normalize (~, relative,
                        // session cwd vs process cwd). FileEditTool looks up by expandPath'd
                        // key — a verbatim client path would miss.
                        const normalizedPath = (0, path_js_1.expandPath)(message.request.path);
                        // Check disk mtime before reading content. If the file changed
                        // since the client's observation, readFile would return C_current
                        // but we'd store it with the client's M_observed — getChangedFiles
                        // then sees disk > cache.timestamp, re-reads, diffs C_current vs
                        // C_current = empty, emits no attachment, and the model is never
                        // told about the C_observed → C_current change. Skipping the seed
                        // makes Edit fail "file not read yet" → forces a fresh Read.
                        // Math.floor matches FileReadTool and getFileModificationTime.
                        const diskMtime = Math.floor((await (0, promises_1.stat)(normalizedPath)).mtimeMs);
                        if (diskMtime <= message.request.mtime) {
                            const raw = await (0, promises_1.readFile)(normalizedPath, 'utf-8');
                            // Strip BOM + normalize CRLF→LF to match readFileInRange and
                            // readFileSyncWithMetadata. FileEditTool's content-compare
                            // fallback (for Windows mtime bumps without content change)
                            // compares against LF-normalized disk reads.
                            const content = (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).replaceAll('\r\n', '\n');
                            pendingSeeds.set(normalizedPath, {
                                content,
                                timestamp: diskMtime,
                                offset: undefined,
                                limit: undefined,
                            });
                        }
                    }
                    catch {
                        // ENOENT etc — skip seeding but still succeed
                    }
                    sendControlResponseSuccess(message);
                }
                else if (message.request.subtype === 'mcp_set_servers') {
                    const { response, sdkServersChanged } = await applyMcpServerChanges(message.request.servers);
                    sendControlResponseSuccess(message, response);
                    // Connect SDK servers AFTER response to avoid deadlock
                    if (sdkServersChanged) {
                        void updateSdkMcp();
                    }
                }
                else if (message.request.subtype === 'reload_plugins') {
                    try {
                        if ((0, bun_bundle_1.feature)('DOWNLOAD_USER_SETTINGS') &&
                            ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_REMOTE) || (0, state_js_2.getIsRemoteMode)())) {
                            // Re-pull user settings so enabledPlugins pushed from the
                            // user's local CLI take effect before the cache sweep.
                            const applied = await (0, index_js_1.redownloadUserSettings)();
                            if (applied) {
                                changeDetector_js_1.settingsChangeDetector.notifyChange('userSettings');
                            }
                        }
                        const r = await (0, refresh_js_1.refreshActivePlugins)(setAppState);
                        const sdkAgents = currentAgents.filter(a => a.source === 'flagSettings');
                        currentAgents = [...r.agentDefinitions.allAgents, ...sdkAgents];
                        // Reload succeeded — gather response data best-effort so a
                        // read failure doesn't mask the successful state change.
                        // allSettled so one failure doesn't discard the others.
                        let plugins = [];
                        const [cmdsR, mcpR, pluginsR] = await Promise.allSettled([
                            (0, commands_js_2.getCommands)((0, process_1.cwd)()),
                            applyPluginMcpDiff(),
                            (0, pluginLoader_js_1.loadAllPluginsCacheOnly)(),
                        ]);
                        if (cmdsR.status === 'fulfilled') {
                            currentCommands = cmdsR.value;
                        }
                        else {
                            (0, log_js_1.logError)(cmdsR.reason);
                        }
                        if (mcpR.status === 'rejected') {
                            (0, log_js_1.logError)(mcpR.reason);
                        }
                        if (pluginsR.status === 'fulfilled') {
                            plugins = pluginsR.value.enabled.map(p => ({
                                name: p.name,
                                path: p.path,
                                source: p.source,
                            }));
                        }
                        else {
                            (0, log_js_1.logError)(pluginsR.reason);
                        }
                        sendControlResponseSuccess(message, {
                            commands: currentCommands
                                .filter(cmd => cmd.userInvocable !== false)
                                .map(cmd => ({
                                name: (0, commands_js_1.getCommandName)(cmd),
                                description: (0, commands_js_1.formatDescriptionWithSource)(cmd),
                                argumentHint: cmd.argumentHint || '',
                            })),
                            agents: currentAgents.map(a => ({
                                name: a.agentType,
                                description: a.whenToUse,
                                model: a.model === 'inherit' ? undefined : a.model,
                            })),
                            plugins,
                            mcpServers: buildMcpServerStatuses(),
                            error_count: r.error_count,
                        });
                    }
                    catch (error) {
                        sendControlResponseError(message, (0, errors_js_1.errorMessage)(error));
                    }
                }
                else if (message.request.subtype === 'mcp_reconnect') {
                    const currentAppState = getAppState();
                    const { serverName } = message.request;
                    elicitationRegistered.delete(serverName);
                    // Config-existence gate must cover the SAME sources as the
                    // operations below. SDK-injected servers (query({mcpServers:{...}}))
                    // and dynamically-added servers were missing here, so
                    // toggleMcpServer/reconnect returned "Server not found" even though
                    // the disconnect/reconnect would have worked (gh-31339 / CC-314).
                    const config = (0, config_js_1.getMcpConfigByName)(serverName) ??
                        mcpClients.find(c => c.name === serverName)?.config ??
                        sdkClients.find(c => c.name === serverName)?.config ??
                        dynamicMcpState.clients.find(c => c.name === serverName)?.config ??
                        currentAppState.mcp.clients.find(c => c.name === serverName)
                            ?.config ??
                        null;
                    if (!config) {
                        sendControlResponseError(message, `Server not found: ${serverName}`);
                    }
                    else {
                        const result = await (0, client_js_1.reconnectMcpServerImpl)(serverName, config);
                        // Update appState.mcp with the new client, tools, commands, and resources
                        const prefix = (0, mcpStringUtils_js_1.getMcpPrefix)(serverName);
                        setAppState(prev => ({
                            ...prev,
                            mcp: {
                                ...prev.mcp,
                                clients: prev.mcp.clients.map(c => c.name === serverName ? result.client : c),
                                tools: [
                                    ...(0, reject_js_1.default)(prev.mcp.tools, t => t.name?.startsWith(prefix)),
                                    ...result.tools,
                                ],
                                commands: [
                                    ...(0, reject_js_1.default)(prev.mcp.commands, c => (0, utils_js_1.commandBelongsToServer)(c, serverName)),
                                    ...result.commands,
                                ],
                                resources: result.resources && result.resources.length > 0
                                    ? { ...prev.mcp.resources, [serverName]: result.resources }
                                    : (0, omit_js_1.default)(prev.mcp.resources, serverName),
                            },
                        }));
                        // Also update dynamicMcpState so run() picks up the new tools
                        // on the next turn (run() reads dynamicMcpState, not appState)
                        dynamicMcpState = {
                            ...dynamicMcpState,
                            clients: [
                                ...dynamicMcpState.clients.filter(c => c.name !== serverName),
                                result.client,
                            ],
                            tools: [
                                ...dynamicMcpState.tools.filter(t => !t.name?.startsWith(prefix)),
                                ...result.tools,
                            ],
                        };
                        if (result.client.type === 'connected') {
                            registerElicitationHandlers([result.client]);
                            reregisterChannelHandlerAfterReconnect(result.client);
                            sendControlResponseSuccess(message);
                        }
                        else {
                            const errorMessage = result.client.type === 'failed'
                                ? (result.client.error ?? 'Connection failed')
                                : `Server status: ${result.client.type}`;
                            sendControlResponseError(message, errorMessage);
                        }
                    }
                }
                else if (message.request.subtype === 'mcp_toggle') {
                    const currentAppState = getAppState();
                    const { serverName, enabled } = message.request;
                    elicitationRegistered.delete(serverName);
                    // Gate must match the client-lookup spread below (which
                    // includes sdkClients and dynamicMcpState.clients). Same fix as
                    // mcp_reconnect above (gh-31339 / CC-314).
                    const config = (0, config_js_1.getMcpConfigByName)(serverName) ??
                        mcpClients.find(c => c.name === serverName)?.config ??
                        sdkClients.find(c => c.name === serverName)?.config ??
                        dynamicMcpState.clients.find(c => c.name === serverName)?.config ??
                        currentAppState.mcp.clients.find(c => c.name === serverName)
                            ?.config ??
                        null;
                    if (!config) {
                        sendControlResponseError(message, `Server not found: ${serverName}`);
                    }
                    else if (!enabled) {
                        // Disabling: persist + disconnect (matches TUI toggleMcpServer behavior)
                        (0, config_js_1.setMcpServerEnabled)(serverName, false);
                        const client = [
                            ...mcpClients,
                            ...sdkClients,
                            ...dynamicMcpState.clients,
                            ...currentAppState.mcp.clients,
                        ].find(c => c.name === serverName);
                        if (client && client.type === 'connected') {
                            await (0, client_js_1.clearServerCache)(serverName, config);
                        }
                        // Update appState.mcp to reflect disabled status and remove tools/commands/resources
                        const prefix = (0, mcpStringUtils_js_1.getMcpPrefix)(serverName);
                        setAppState(prev => ({
                            ...prev,
                            mcp: {
                                ...prev.mcp,
                                clients: prev.mcp.clients.map(c => c.name === serverName
                                    ? { name: serverName, type: 'disabled', config }
                                    : c),
                                tools: (0, reject_js_1.default)(prev.mcp.tools, t => t.name?.startsWith(prefix)),
                                commands: (0, reject_js_1.default)(prev.mcp.commands, c => (0, utils_js_1.commandBelongsToServer)(c, serverName)),
                                resources: (0, omit_js_1.default)(prev.mcp.resources, serverName),
                            },
                        }));
                        sendControlResponseSuccess(message);
                    }
                    else {
                        // Enabling: persist + reconnect
                        (0, config_js_1.setMcpServerEnabled)(serverName, true);
                        const result = await (0, client_js_1.reconnectMcpServerImpl)(serverName, config);
                        // Update appState.mcp with the new client, tools, commands, and resources
                        // This ensures the LLM sees updated tools after enabling the server
                        const prefix = (0, mcpStringUtils_js_1.getMcpPrefix)(serverName);
                        setAppState(prev => ({
                            ...prev,
                            mcp: {
                                ...prev.mcp,
                                clients: prev.mcp.clients.map(c => c.name === serverName ? result.client : c),
                                tools: [
                                    ...(0, reject_js_1.default)(prev.mcp.tools, t => t.name?.startsWith(prefix)),
                                    ...result.tools,
                                ],
                                commands: [
                                    ...(0, reject_js_1.default)(prev.mcp.commands, c => (0, utils_js_1.commandBelongsToServer)(c, serverName)),
                                    ...result.commands,
                                ],
                                resources: result.resources && result.resources.length > 0
                                    ? { ...prev.mcp.resources, [serverName]: result.resources }
                                    : (0, omit_js_1.default)(prev.mcp.resources, serverName),
                            },
                        }));
                        if (result.client.type === 'connected') {
                            registerElicitationHandlers([result.client]);
                            reregisterChannelHandlerAfterReconnect(result.client);
                            sendControlResponseSuccess(message);
                        }
                        else {
                            const errorMessage = result.client.type === 'failed'
                                ? (result.client.error ?? 'Connection failed')
                                : `Server status: ${result.client.type}`;
                            sendControlResponseError(message, errorMessage);
                        }
                    }
                }
                else if (message.request.subtype === 'channel_enable') {
                    const currentAppState = getAppState();
                    handleChannelEnable(message.request_id, message.request.serverName, 
                    // Pool spread matches mcp_status — all three client sources.
                    [
                        ...currentAppState.mcp.clients,
                        ...sdkClients,
                        ...dynamicMcpState.clients,
                    ], output);
                }
                else if (message.request.subtype === 'mcp_authenticate') {
                    const { serverName } = message.request;
                    const currentAppState = getAppState();
                    const config = (0, config_js_1.getMcpConfigByName)(serverName) ??
                        mcpClients.find(c => c.name === serverName)?.config ??
                        currentAppState.mcp.clients.find(c => c.name === serverName)
                            ?.config ??
                        null;
                    if (!config) {
                        sendControlResponseError(message, `Server not found: ${serverName}`);
                    }
                    else if (config.type !== 'sse' && config.type !== 'http') {
                        sendControlResponseError(message, `Server type "${config.type}" does not support OAuth authentication`);
                    }
                    else {
                        try {
                            // Abort any previous in-flight OAuth flow for this server
                            activeOAuthFlows.get(serverName)?.abort();
                            const controller = new AbortController();
                            activeOAuthFlows.set(serverName, controller);
                            // Capture the auth URL from the callback
                            let resolveAuthUrl;
                            const authUrlPromise = new Promise(resolve => {
                                resolveAuthUrl = resolve;
                            });
                            // Start the OAuth flow in the background
                            const oauthPromise = (0, auth_js_3.performMCPOAuthFlow)(serverName, config, url => resolveAuthUrl(url), controller.signal, {
                                skipBrowserOpen: true,
                                onWaitingForCallback: submit => {
                                    oauthCallbackSubmitters.set(serverName, submit);
                                },
                            });
                            // Wait for the auth URL (or the flow to complete without needing redirect)
                            const authUrl = await Promise.race([
                                authUrlPromise,
                                oauthPromise.then(() => null),
                            ]);
                            if (authUrl) {
                                sendControlResponseSuccess(message, {
                                    authUrl,
                                    requiresUserAction: true,
                                });
                            }
                            else {
                                sendControlResponseSuccess(message, {
                                    requiresUserAction: false,
                                });
                            }
                            // Store auth-only promise for mcp_oauth_callback_url handler.
                            // Don't swallow errors — the callback handler needs to detect
                            // auth failures and report them to the caller.
                            oauthAuthPromises.set(serverName, oauthPromise);
                            // Handle background completion — reconnect after auth.
                            // When manual callback is used, skip the reconnect here;
                            // the extension's handleAuthDone → mcp_reconnect handles it
                            // (which also updates dynamicMcpState for tool registration).
                            const fullFlowPromise = oauthPromise
                                .then(async () => {
                                // Don't reconnect if the server was disabled during the OAuth flow
                                if ((0, config_js_1.isMcpServerDisabled)(serverName)) {
                                    return;
                                }
                                // Skip reconnect if the manual callback path was used —
                                // handleAuthDone will do it via mcp_reconnect (which
                                // updates dynamicMcpState for tool registration).
                                if (oauthManualCallbackUsed.has(serverName)) {
                                    return;
                                }
                                // Reconnect the server after successful auth
                                const result = await (0, client_js_1.reconnectMcpServerImpl)(serverName, config);
                                const prefix = (0, mcpStringUtils_js_1.getMcpPrefix)(serverName);
                                setAppState(prev => ({
                                    ...prev,
                                    mcp: {
                                        ...prev.mcp,
                                        clients: prev.mcp.clients.map(c => c.name === serverName ? result.client : c),
                                        tools: [
                                            ...(0, reject_js_1.default)(prev.mcp.tools, t => t.name?.startsWith(prefix)),
                                            ...result.tools,
                                        ],
                                        commands: [
                                            ...(0, reject_js_1.default)(prev.mcp.commands, c => (0, utils_js_1.commandBelongsToServer)(c, serverName)),
                                            ...result.commands,
                                        ],
                                        resources: result.resources && result.resources.length > 0
                                            ? {
                                                ...prev.mcp.resources,
                                                [serverName]: result.resources,
                                            }
                                            : (0, omit_js_1.default)(prev.mcp.resources, serverName),
                                    },
                                }));
                                // Also update dynamicMcpState so run() picks up the new tools
                                // on the next turn (run() reads dynamicMcpState, not appState)
                                dynamicMcpState = {
                                    ...dynamicMcpState,
                                    clients: [
                                        ...dynamicMcpState.clients.filter(c => c.name !== serverName),
                                        result.client,
                                    ],
                                    tools: [
                                        ...dynamicMcpState.tools.filter(t => !t.name?.startsWith(prefix)),
                                        ...result.tools,
                                    ],
                                };
                            })
                                .catch(error => {
                                (0, debug_js_1.logForDebugging)(`MCP OAuth failed for ${serverName}: ${error}`, { level: 'error' });
                            })
                                .finally(() => {
                                // Clean up only if this is still the active flow
                                if (activeOAuthFlows.get(serverName) === controller) {
                                    activeOAuthFlows.delete(serverName);
                                    oauthCallbackSubmitters.delete(serverName);
                                    oauthManualCallbackUsed.delete(serverName);
                                    oauthAuthPromises.delete(serverName);
                                }
                            });
                            void fullFlowPromise;
                        }
                        catch (error) {
                            sendControlResponseError(message, (0, errors_js_1.errorMessage)(error));
                        }
                    }
                }
                else if (message.request.subtype === 'mcp_oauth_callback_url') {
                    const { serverName, callbackUrl } = message.request;
                    const submit = oauthCallbackSubmitters.get(serverName);
                    if (submit) {
                        // Validate the callback URL before submitting. The submit
                        // callback in auth.ts silently ignores URLs missing a code
                        // param, which would leave the auth promise unresolved and
                        // block the control message loop until timeout.
                        let hasCodeOrError = false;
                        try {
                            const parsed = new URL(callbackUrl);
                            hasCodeOrError =
                                parsed.searchParams.has('code') ||
                                    parsed.searchParams.has('error');
                        }
                        catch {
                            // Invalid URL
                        }
                        if (!hasCodeOrError) {
                            sendControlResponseError(message, 'Invalid callback URL: missing authorization code. Please paste the full redirect URL including the code parameter.');
                        }
                        else {
                            oauthManualCallbackUsed.add(serverName);
                            submit(callbackUrl);
                            // Wait for auth (token exchange) to complete before responding.
                            // Reconnect is handled by the extension via handleAuthDone →
                            // mcp_reconnect (which updates dynamicMcpState for tools).
                            const authPromise = oauthAuthPromises.get(serverName);
                            if (authPromise) {
                                try {
                                    await authPromise;
                                    sendControlResponseSuccess(message);
                                }
                                catch (error) {
                                    sendControlResponseError(message, error instanceof Error
                                        ? error.message
                                        : 'OAuth authentication failed');
                                }
                            }
                            else {
                                sendControlResponseSuccess(message);
                            }
                        }
                    }
                    else {
                        sendControlResponseError(message, `No active OAuth flow for server: ${serverName}`);
                    }
                }
                else if (message.request.subtype === 'claude_authenticate') {
                    // Anthropic OAuth over the control channel. The SDK client owns
                    // the user's browser (we're headless in -p mode); we hand back
                    // both URLs and wait. Automatic URL → localhost listener catches
                    // the redirect if the browser is on this host; manual URL → the
                    // success page shows "code#state" for claude_oauth_callback.
                    const { loginWithClaudeAi } = message.request;
                    // Clean up any prior flow. cleanup() closes the localhost listener
                    // and nulls the manual resolver. The prior `flow` promise is left
                    // pending (AuthCodeListener.close() does not reject) but its object
                    // graph becomes unreachable once the server handle is released and
                    // is GC'd — no fd or port is held.
                    claudeOAuth?.service.cleanup();
                    (0, index_js_3.logEvent)('tengu_oauth_flow_start', {
                        loginWithClaudeAi: loginWithClaudeAi ?? true,
                    });
                    const service = new index_js_5.OAuthService();
                    let urlResolver;
                    const urlPromise = new Promise(resolve => {
                        urlResolver = resolve;
                    });
                    const flow = service
                        .startOAuthFlow(async (manualUrl, automaticUrl) => {
                        // automaticUrl is always defined when skipBrowserOpen is set;
                        // the signature is optional only for the existing single-arg callers.
                        urlResolver({ manualUrl, automaticUrl: automaticUrl });
                    }, {
                        loginWithClaudeAi: loginWithClaudeAi ?? true,
                        skipBrowserOpen: true,
                    })
                        .then(async (tokens) => {
                        // installOAuthTokens: performLogout (clear stale state) →
                        // store profile → saveOAuthTokensIfNeeded → clearOAuthTokenCache
                        // → clearAuthRelatedCaches. After this resolves, the memoized
                        // getClaudeAIOAuthTokens in this process is invalidated; the
                        // next API call re-reads keychain/file and works. No respawn.
                        await (0, auth_js_2.installOAuthTokens)(tokens);
                        (0, index_js_3.logEvent)('tengu_oauth_success', {
                            loginWithClaudeAi: loginWithClaudeAi ?? true,
                        });
                    })
                        .finally(() => {
                        service.cleanup();
                        if (claudeOAuth?.service === service) {
                            claudeOAuth = null;
                        }
                    });
                    claudeOAuth = { service, flow };
                    // Attach the rejection handler before awaiting so a synchronous
                    // startOAuthFlow failure doesn't surface as an unhandled rejection.
                    // The claude_oauth_callback handler re-awaits flow for the manual
                    // path and surfaces the real error to the client.
                    void flow.catch(err => (0, debug_js_1.logForDebugging)(`claude_authenticate flow ended: ${err}`, {
                        level: 'info',
                    }));
                    try {
                        // Race against flow: if startOAuthFlow rejects before calling
                        // the authURLHandler (e.g. AuthCodeListener.start() fails with
                        // EACCES or fd exhaustion), urlPromise would pend forever and
                        // wedge the stdin loop. flow resolving first is unreachable in
                        // practice (it's suspended on the same urls we're waiting for).
                        const { manualUrl, automaticUrl } = await Promise.race([
                            urlPromise,
                            flow.then(() => {
                                throw new Error('OAuth flow completed without producing auth URLs');
                            }),
                        ]);
                        sendControlResponseSuccess(message, {
                            manualUrl,
                            automaticUrl,
                        });
                    }
                    catch (error) {
                        sendControlResponseError(message, (0, errors_js_1.errorMessage)(error));
                    }
                }
                else if (message.request.subtype === 'claude_oauth_callback' ||
                    message.request.subtype === 'claude_oauth_wait_for_completion') {
                    if (!claudeOAuth) {
                        sendControlResponseError(message, 'No active claude_authenticate flow');
                    }
                    else {
                        // Inject the manual code synchronously — must happen in stdin
                        // message order so a subsequent claude_authenticate doesn't
                        // replace the service before this code lands.
                        if (message.request.subtype === 'claude_oauth_callback') {
                            claudeOAuth.service.handleManualAuthCodeInput({
                                authorizationCode: message.request.authorizationCode,
                                state: message.request.state,
                            });
                        }
                        // Detach the await — the stdin reader is serial and blocking
                        // here deadlocks claude_oauth_wait_for_completion: flow may
                        // only resolve via a future claude_oauth_callback on stdin,
                        // which can't be read while we're parked. Capture the binding;
                        // claudeOAuth is nulled in flow's own .finally.
                        const { flow } = claudeOAuth;
                        void flow.then(() => {
                            const accountInfo = (0, auth_js_1.getAccountInformation)();
                            sendControlResponseSuccess(message, {
                                account: {
                                    email: accountInfo?.email,
                                    organization: accountInfo?.organization,
                                    subscriptionType: accountInfo?.subscription,
                                    tokenSource: accountInfo?.tokenSource,
                                    apiKeySource: accountInfo?.apiKeySource,
                                    apiProvider: (0, providers_js_1.getAPIProvider)(),
                                },
                            });
                        }, (error) => sendControlResponseError(message, (0, errors_js_1.errorMessage)(error)));
                    }
                }
                else if (message.request.subtype === 'mcp_clear_auth') {
                    const { serverName } = message.request;
                    const currentAppState = getAppState();
                    const config = (0, config_js_1.getMcpConfigByName)(serverName) ??
                        mcpClients.find(c => c.name === serverName)?.config ??
                        currentAppState.mcp.clients.find(c => c.name === serverName)
                            ?.config ??
                        null;
                    if (!config) {
                        sendControlResponseError(message, `Server not found: ${serverName}`);
                    }
                    else if (config.type !== 'sse' && config.type !== 'http') {
                        sendControlResponseError(message, `Cannot clear auth for server type "${config.type}"`);
                    }
                    else {
                        await (0, auth_js_3.revokeServerTokens)(serverName, config);
                        const result = await (0, client_js_1.reconnectMcpServerImpl)(serverName, config);
                        const prefix = (0, mcpStringUtils_js_1.getMcpPrefix)(serverName);
                        setAppState(prev => ({
                            ...prev,
                            mcp: {
                                ...prev.mcp,
                                clients: prev.mcp.clients.map(c => c.name === serverName ? result.client : c),
                                tools: [
                                    ...(0, reject_js_1.default)(prev.mcp.tools, t => t.name?.startsWith(prefix)),
                                    ...result.tools,
                                ],
                                commands: [
                                    ...(0, reject_js_1.default)(prev.mcp.commands, c => (0, utils_js_1.commandBelongsToServer)(c, serverName)),
                                    ...result.commands,
                                ],
                                resources: result.resources && result.resources.length > 0
                                    ? {
                                        ...prev.mcp.resources,
                                        [serverName]: result.resources,
                                    }
                                    : (0, omit_js_1.default)(prev.mcp.resources, serverName),
                            },
                        }));
                        sendControlResponseSuccess(message, {});
                    }
                }
                else if (message.request.subtype === 'apply_flag_settings') {
                    // Snapshot the current model before applying — we need to detect
                    // model switches so we can inject breadcrumbs and notify listeners.
                    const prevModel = (0, model_js_1.getMainLoopModel)();
                    // Merge the provided settings into the in-memory flag settings
                    const existing = (0, state_js_2.getFlagSettingsInline)() ?? {};
                    const incoming = message.request.settings;
                    // Shallow-merge top-level keys; getSettingsForSource handles
                    // the deep merge with file-based flag settings via mergeWith.
                    // JSON serialization drops `undefined`, so callers use `null`
                    // to signal "clear this key". Convert nulls to deletions so
                    // SettingsSchema().safeParse() doesn't reject the whole object
                    // (z.string().optional() accepts string | undefined, not null).
                    const merged = { ...existing, ...incoming };
                    for (const key of Object.keys(merged)) {
                        if (merged[key] === null) {
                            delete merged[key];
                        }
                    }
                    (0, state_js_2.setFlagSettingsInline)(merged);
                    // Route through notifyChange so fanOut() resets the settings cache
                    // before listeners run. The subscriber at :392 calls
                    // applySettingsChange for us. Pre-#20625 this was a direct
                    // applySettingsChange() call that relied on its own internal reset —
                    // now that the reset is centralized in fanOut, a direct call here
                    // would read stale cached settings and silently drop the update.
                    // Bonus: going through notifyChange also tells the other subscribers
                    // (loadPluginHooks, sandbox-adapter) about the change, which the
                    // previous direct call skipped.
                    changeDetector_js_1.settingsChangeDetector.notifyChange('flagSettings');
                    // If the incoming settings include a model change, update the
                    // override so getMainLoopModel() reflects it. The override has
                    // higher priority than the settings cascade in
                    // getUserSpecifiedModelSetting(), so without this update,
                    // getMainLoopModel() returns the stale override and the model
                    // change is silently ignored (matching set_model at :2811).
                    if ('model' in incoming) {
                        if (incoming.model != null) {
                            (0, state_js_2.setMainLoopModelOverride)(String(incoming.model));
                        }
                        else {
                            (0, state_js_2.setMainLoopModelOverride)(undefined);
                        }
                    }
                    // If the model changed, inject breadcrumbs so the model sees the
                    // mid-conversation switch, and notify metadata listeners (CCR).
                    const newModel = (0, model_js_1.getMainLoopModel)();
                    if (newModel !== prevModel) {
                        activeUserSpecifiedModel = newModel;
                        const modelArg = incoming.model ? String(incoming.model) : 'default';
                        (0, sessionState_js_1.notifySessionMetadataChanged)({ model: newModel });
                        injectModelSwitchBreadcrumbs(modelArg, newModel);
                    }
                    sendControlResponseSuccess(message);
                }
                else if (message.request.subtype === 'get_settings') {
                    const currentAppState = getAppState();
                    const model = (0, model_js_1.getMainLoopModel)();
                    // modelSupportsEffort gate matches claude.ts — applied.effort must
                    // mirror what actually goes to the API, not just what's configured.
                    const effort = (0, effort_js_1.modelSupportsEffort)(model)
                        ? (0, effort_js_1.resolveAppliedEffort)(model, currentAppState.effortValue)
                        : undefined;
                    sendControlResponseSuccess(message, {
                        ...(0, settings_js_1.getSettingsWithSources)(),
                        applied: {
                            model,
                            // Numeric effort (ant-only) → null; SDK schema is string-level only.
                            effort: typeof effort === 'string' ? effort : null,
                        },
                    });
                }
                else if (message.request.subtype === 'stop_task') {
                    const { task_id: taskId } = message.request;
                    try {
                        await (0, stopTask_js_1.stopTask)(taskId, {
                            getAppState,
                            setAppState,
                        });
                        sendControlResponseSuccess(message, {});
                    }
                    catch (error) {
                        sendControlResponseError(message, (0, errors_js_1.errorMessage)(error));
                    }
                }
                else if (message.request.subtype === 'generate_session_title') {
                    // Fire-and-forget so the Haiku call does not block the stdin loop
                    // (which would delay processing of subsequent user messages /
                    // interrupts for the duration of the API roundtrip).
                    const { description, persist } = message.request;
                    // Reuse the live controller only if it has not already been aborted
                    // (e.g. by interrupt()); an aborted signal would cause queryHaiku to
                    // immediately throw APIUserAbortError → {title: null}.
                    const titleSignal = (abortController && !abortController.signal.aborted
                        ? abortController
                        : (0, abortController_js_1.createAbortController)()).signal;
                    void (async () => {
                        try {
                            const title = await (0, sessionTitle_js_1.generateSessionTitle)(description, titleSignal);
                            if (title && persist) {
                                try {
                                    (0, sessionStorage_js_1.saveAiGeneratedTitle)((0, state_js_2.getSessionId)(), title);
                                }
                                catch (e) {
                                    (0, log_js_1.logError)(e);
                                }
                            }
                            sendControlResponseSuccess(message, { title });
                        }
                        catch (e) {
                            // Unreachable in practice — generateSessionTitle wraps its
                            // own body and returns null, saveAiGeneratedTitle is wrapped
                            // above. Propagate (not swallow) so unexpected failures are
                            // visible to the SDK caller (hostComms.ts catches and logs).
                            sendControlResponseError(message, (0, errors_js_1.errorMessage)(e));
                        }
                    })();
                }
                else if (message.request.subtype === 'side_question') {
                    // Same fire-and-forget pattern as generate_session_title above —
                    // the forked agent's API roundtrip must not block the stdin loop.
                    //
                    // The snapshot captured by stopHooks (for querySource === 'sdk')
                    // holds the exact systemPrompt/userContext/systemContext/messages
                    // sent on the last main-thread turn. Reusing them gives a byte-
                    // identical prefix → prompt cache hit.
                    //
                    // Fallback (resume before first turn completes — no snapshot yet):
                    // rebuild from scratch. buildSideQuestionFallbackParams mirrors
                    // QueryEngine.ts:ask()'s system prompt assembly (including
                    // --system-prompt / --append-system-prompt) so the rebuilt prefix
                    // matches in the common case. May still miss the cache for
                    // coordinator mode or memory-mechanics extras — acceptable, the
                    // alternative is the side question failing entirely.
                    const { question } = message.request;
                    void (async () => {
                        try {
                            const saved = (0, forkedAgent_js_1.getLastCacheSafeParams)();
                            const cacheSafeParams = saved
                                ? {
                                    ...saved,
                                    // If the last turn was interrupted, the snapshot holds an
                                    // already-aborted controller; createChildAbortController in
                                    // createSubagentContext would propagate it and the fork
                                    // would die before sending a request. The controller is
                                    // not part of the cache key — swapping in a fresh one is
                                    // safe. Same guard as generate_session_title above.
                                    toolUseContext: {
                                        ...saved.toolUseContext,
                                        abortController: (0, abortController_js_1.createAbortController)(),
                                    },
                                }
                                : await (0, queryContext_js_1.buildSideQuestionFallbackParams)({
                                    tools: buildAllTools(getAppState()),
                                    commands: currentCommands,
                                    mcpClients: [
                                        ...getAppState().mcp.clients,
                                        ...sdkClients,
                                        ...dynamicMcpState.clients,
                                    ],
                                    messages: mutableMessages,
                                    readFileState,
                                    getAppState,
                                    setAppState,
                                    customSystemPrompt: options.systemPrompt,
                                    appendSystemPrompt: options.appendSystemPrompt,
                                    thinkingConfig: options.thinkingConfig,
                                    agents: currentAgents,
                                });
                            const result = await (0, sideQuestion_js_1.runSideQuestion)({
                                question,
                                cacheSafeParams,
                            });
                            sendControlResponseSuccess(message, { response: result.response });
                        }
                        catch (e) {
                            sendControlResponseError(message, (0, errors_js_1.errorMessage)(e));
                        }
                    })();
                }
                else if (((0, bun_bundle_1.feature)('PROACTIVE') || (0, bun_bundle_1.feature)('KAIROS')) &&
                    message.request.subtype === 'set_proactive') {
                    const req = message.request;
                    if (req.enabled) {
                        if (!proactiveModule.isProactiveActive()) {
                            proactiveModule.activateProactive('command');
                            scheduleProactiveTick();
                        }
                    }
                    else {
                        proactiveModule.deactivateProactive();
                    }
                    sendControlResponseSuccess(message);
                }
                else if (message.request.subtype === 'remote_control') {
                    if (message.request.enabled) {
                        if (bridgeHandle) {
                            // Already connected
                            sendControlResponseSuccess(message, {
                                session_url: (0, product_js_1.getRemoteSessionUrl)(bridgeHandle.bridgeSessionId, bridgeHandle.sessionIngressUrl),
                                connect_url: (0, bridgeStatusUtil_js_1.buildBridgeConnectUrl)(bridgeHandle.environmentId, bridgeHandle.sessionIngressUrl),
                                environment_id: bridgeHandle.environmentId,
                            });
                        }
                        else {
                            // initReplBridge surfaces gate-failure reasons via
                            // onStateChange('failed', detail) before returning null.
                            // Capture so the control-response error is actionable
                            // ("/login", "disabled by your organization's policy", etc.)
                            // instead of a generic "initialization failed".
                            let bridgeFailureDetail;
                            try {
                                const { initReplBridge } = await Promise.resolve().then(() => __importStar(require('src/bridge/initReplBridge.js')));
                                const handle = await initReplBridge({
                                    onInboundMessage(msg) {
                                        const fields = (0, inboundMessages_js_1.extractInboundMessageFields)(msg);
                                        if (!fields)
                                            return;
                                        const { content, uuid } = fields;
                                        (0, messageQueueManager_js_1.enqueue)({
                                            value: content,
                                            mode: 'prompt',
                                            uuid,
                                            skipSlashCommands: true,
                                        });
                                        void run();
                                    },
                                    onPermissionResponse(response) {
                                        // Forward bridge permission responses into the
                                        // stdin processing loop so they resolve pending
                                        // permission requests from the SDK consumer.
                                        structuredIO.injectControlResponse(response);
                                    },
                                    onInterrupt() {
                                        abortController?.abort();
                                    },
                                    onSetModel(model) {
                                        const resolved = model === 'default' ? (0, model_js_1.getDefaultMainLoopModel)() : model;
                                        activeUserSpecifiedModel = resolved;
                                        (0, state_js_2.setMainLoopModelOverride)(resolved);
                                    },
                                    onSetMaxThinkingTokens(maxTokens) {
                                        if (maxTokens === null) {
                                            options.thinkingConfig = undefined;
                                        }
                                        else if (maxTokens === 0) {
                                            options.thinkingConfig = { type: 'disabled' };
                                        }
                                        else {
                                            options.thinkingConfig = {
                                                type: 'enabled',
                                                budgetTokens: maxTokens,
                                            };
                                        }
                                    },
                                    onStateChange(state, detail) {
                                        if (state === 'failed') {
                                            bridgeFailureDetail = detail;
                                        }
                                        (0, debug_js_1.logForDebugging)(`[bridge:sdk] State change: ${state}${detail ? ` — ${detail}` : ''}`);
                                        output.enqueue({
                                            type: 'system',
                                            subtype: 'bridge_state',
                                            state,
                                            detail,
                                            uuid: (0, crypto_1.randomUUID)(),
                                            session_id: (0, state_js_2.getSessionId)(),
                                        });
                                    },
                                    initialMessages: mutableMessages.length > 0 ? mutableMessages : undefined,
                                });
                                if (!handle) {
                                    sendControlResponseError(message, bridgeFailureDetail ??
                                        'Remote Control initialization failed');
                                }
                                else {
                                    bridgeHandle = handle;
                                    bridgeLastForwardedIndex = mutableMessages.length;
                                    // Forward permission requests to the bridge
                                    structuredIO.setOnControlRequestSent(request => {
                                        handle.sendControlRequest(request);
                                    });
                                    // Cancel stale bridge permission prompts when the SDK
                                    // consumer resolves a can_use_tool request first.
                                    structuredIO.setOnControlRequestResolved(requestId => {
                                        handle.sendControlCancelRequest(requestId);
                                    });
                                    sendControlResponseSuccess(message, {
                                        session_url: (0, product_js_1.getRemoteSessionUrl)(handle.bridgeSessionId, handle.sessionIngressUrl),
                                        connect_url: (0, bridgeStatusUtil_js_1.buildBridgeConnectUrl)(handle.environmentId, handle.sessionIngressUrl),
                                        environment_id: handle.environmentId,
                                    });
                                }
                            }
                            catch (err) {
                                sendControlResponseError(message, (0, errors_js_1.errorMessage)(err));
                            }
                        }
                    }
                    else {
                        // Disable
                        if (bridgeHandle) {
                            structuredIO.setOnControlRequestSent(undefined);
                            structuredIO.setOnControlRequestResolved(undefined);
                            await bridgeHandle.teardown();
                            bridgeHandle = null;
                        }
                        sendControlResponseSuccess(message);
                    }
                }
                else {
                    // Unknown control request subtype — send an error response so
                    // the caller doesn't hang waiting for a reply that never comes.
                    sendControlResponseError(message, `Unsupported control request subtype: ${message.request.subtype}`);
                }
                continue;
            }
            else if (message.type === 'control_response') {
                // Replay control_response messages when replay mode is enabled
                if (options.replayUserMessages) {
                    output.enqueue(message);
                }
                continue;
            }
            else if (message.type === 'keep_alive') {
                // Silently ignore keep-alive messages
                continue;
            }
            else if (message.type === 'update_environment_variables') {
                // Handled in structuredIO.ts, but TypeScript needs the type guard
                continue;
            }
            else if (message.type === 'assistant' || message.type === 'system') {
                // History replay from bridge: inject into mutableMessages as
                // conversation context so the model sees prior turns.
                const internalMsgs = (0, mappers_js_1.toInternalMessages)([message]);
                mutableMessages.push(...internalMsgs);
                // Echo assistant messages back so CCR displays them
                if (message.type === 'assistant' && options.replayUserMessages) {
                    output.enqueue(message);
                }
                continue;
            }
            // After handling control, keep-alive, env-var, assistant, and system
            // messages above, only user messages should remain.
            if (message.type !== 'user') {
                continue;
            }
            // First prompt message implicitly initializes if not already done.
            initialized = true;
            // Check for duplicate user message - skip if already processed
            if (message.uuid) {
                const sessionId = (0, state_js_2.getSessionId)();
                const existsInSession = await (0, sessionStorage_js_1.doesMessageExistInSession)(sessionId, message.uuid);
                // Check both historical duplicates (from file) and runtime duplicates (this session)
                if (existsInSession || receivedMessageUuids.has(message.uuid)) {
                    (0, debug_js_1.logForDebugging)(`Skipping duplicate user message: ${message.uuid}`);
                    // Send acknowledgment for duplicate message if replay mode is enabled
                    if (options.replayUserMessages) {
                        (0, debug_js_1.logForDebugging)(`Sending acknowledgment for duplicate user message: ${message.uuid}`);
                        output.enqueue({
                            type: 'user',
                            message: message.message,
                            session_id: sessionId,
                            parent_tool_use_id: null,
                            uuid: message.uuid,
                            timestamp: message.timestamp,
                            isReplay: true,
                        });
                    }
                    // Historical dup = transcript already has this turn's output, so it
                    // ran but its lifecycle was never closed (interrupted before ack).
                    // Runtime dups don't need this — the original enqueue path closes them.
                    if (existsInSession) {
                        (0, commandLifecycle_js_1.notifyCommandLifecycle)(message.uuid, 'completed');
                    }
                    // Don't enqueue duplicate messages for execution
                    continue;
                }
                // Track this UUID to prevent runtime duplicates
                trackReceivedMessageUuid(message.uuid);
            }
            (0, messageQueueManager_js_1.enqueue)({
                mode: 'prompt',
                // file_attachments rides the protobuf catchall from the web composer.
                // Same-ref no-op when absent (no 'file_attachments' key).
                value: await (0, inboundAttachments_js_1.resolveAndPrepend)(message, message.message.content),
                uuid: message.uuid,
                priority: message.priority,
            });
            // Increment prompt count for attribution tracking and save snapshot
            // The snapshot persists promptCount so it survives compaction
            if ((0, bun_bundle_1.feature)('COMMIT_ATTRIBUTION')) {
                setAppState(prev => ({
                    ...prev,
                    attribution: (0, commitAttribution_js_1.incrementPromptCount)(prev.attribution, snapshot => {
                        void (0, sessionStorage_js_1.recordAttributionSnapshot)(snapshot).catch(error => {
                            (0, debug_js_1.logForDebugging)(`Attribution: Failed to save snapshot: ${error}`);
                        });
                    }),
                }));
            }
            void run();
        }
        inputClosed = true;
        cronScheduler?.stop();
        if (!running) {
            // If a push-suggestion is in-flight, wait for it to emit before closing
            // the output stream (5 s safety timeout to prevent hanging).
            if (suggestionState.inflightPromise) {
                await Promise.race([suggestionState.inflightPromise, (0, sleep_js_1.sleep)(5000)]);
            }
            suggestionState.abortController?.abort();
            suggestionState.abortController = null;
            await (0, AsyncHookRegistry_js_1.finalizePendingAsyncHooks)();
            unsubscribeSkillChanges();
            unsubscribeAuthStatus?.();
            claudeAiLimits_js_1.statusListeners.delete(rateLimitListener);
            output.done();
        }
    })();
    return output;
}
/**
 * Creates a CanUseToolFn that incorporates a custom permission prompt tool.
 * This function converts the permissionPromptTool into a CanUseToolFn that can be used in ask.tsx
 */
function createCanUseToolWithPermissionPrompt(permissionPromptTool) {
    const canUseTool = async (tool, input, toolUseContext, assistantMessage, toolUseId, forceDecision) => {
        const mainPermissionResult = forceDecision ??
            (await (0, permissions_js_1.hasPermissionsToUseTool)(tool, input, toolUseContext, assistantMessage, toolUseId));
        // If the tool is allowed or denied, return the result
        if (mainPermissionResult.behavior === 'allow' ||
            mainPermissionResult.behavior === 'deny') {
            return mainPermissionResult;
        }
        // Race the permission prompt tool against the abort signal.
        //
        // Why we need this: The permission prompt tool may block indefinitely waiting
        // for user input (e.g., via stdin or a UI dialog). If the user triggers an
        // interrupt (Ctrl+C), we need to detect it even while the tool is blocked.
        // Without this race, the abort check would only run AFTER the tool completes,
        // which may never happen if the tool is waiting for input that will never come.
        //
        // The second check (combinedSignal.aborted) handles a race condition where
        // abort fires after Promise.race resolves but before we reach this check.
        const { signal: combinedSignal, cleanup: cleanupAbortListener } = (0, combinedAbortSignal_js_1.createCombinedAbortSignal)(toolUseContext.abortController.signal);
        // Check if already aborted before starting the race
        if (combinedSignal.aborted) {
            cleanupAbortListener();
            return {
                behavior: 'deny',
                message: 'Permission prompt was aborted.',
                decisionReason: {
                    type: 'permissionPromptTool',
                    permissionPromptToolName: tool.name,
                    toolResult: undefined,
                },
            };
        }
        const abortPromise = new Promise(resolve => {
            combinedSignal.addEventListener('abort', () => resolve('aborted'), {
                once: true,
            });
        });
        const toolCallPromise = permissionPromptTool.call({
            tool_name: tool.name,
            input,
            tool_use_id: toolUseId,
        }, toolUseContext, canUseTool, assistantMessage);
        const raceResult = await Promise.race([toolCallPromise, abortPromise]);
        cleanupAbortListener();
        if (raceResult === 'aborted' || combinedSignal.aborted) {
            return {
                behavior: 'deny',
                message: 'Permission prompt was aborted.',
                decisionReason: {
                    type: 'permissionPromptTool',
                    permissionPromptToolName: tool.name,
                    toolResult: undefined,
                },
            };
        }
        // TypeScript narrowing: after the abort check, raceResult must be ToolResult
        const result = raceResult;
        const permissionToolResultBlockParam = permissionPromptTool.mapToolResultToToolResultBlockParam(result.data, '1');
        if (!permissionToolResultBlockParam.content ||
            !Array.isArray(permissionToolResultBlockParam.content) ||
            !permissionToolResultBlockParam.content[0] ||
            permissionToolResultBlockParam.content[0].type !== 'text' ||
            typeof permissionToolResultBlockParam.content[0].text !== 'string') {
            throw new Error('Permission prompt tool returned an invalid result. Expected a single text block param with type="text" and a string text value.');
        }
        return (0, PermissionPromptToolResultSchema_js_1.permissionPromptToolResultToPermissionDecision)((0, PermissionPromptToolResultSchema_js_1.outputSchema)().parse((0, json_js_1.safeParseJSON)(permissionToolResultBlockParam.content[0].text)), permissionPromptTool, input, toolUseContext);
    };
    return canUseTool;
}
// Exported for testing — regression: this used to crash at construction when
// getMcpTools() was empty (before per-server connects populated appState).
function getCanUseToolFn(permissionPromptToolName, structuredIO, getMcpTools, onPermissionPrompt) {
    if (permissionPromptToolName === 'stdio') {
        return structuredIO.createCanUseTool(onPermissionPrompt);
    }
    if (!permissionPromptToolName) {
        return async (tool, input, toolUseContext, assistantMessage, toolUseId, forceDecision) => forceDecision ??
            (await (0, permissions_js_1.hasPermissionsToUseTool)(tool, input, toolUseContext, assistantMessage, toolUseId));
    }
    // Lazy lookup: MCP connects are per-server incremental in print mode, so
    // the tool may not be in appState yet at init time. Resolve on first call
    // (first permission prompt), by which point connects have had time to finish.
    let resolved = null;
    return async (tool, input, toolUseContext, assistantMessage, toolUseId, forceDecision) => {
        if (!resolved) {
            const mcpTools = getMcpTools();
            const permissionPromptTool = mcpTools.find(t => (0, Tool_js_1.toolMatchesName)(t, permissionPromptToolName));
            if (!permissionPromptTool) {
                const error = `Error: MCP tool ${permissionPromptToolName} (passed via --permission-prompt-tool) not found. Available MCP tools: ${mcpTools.map(t => t.name).join(', ') || 'none'}`;
                process.stderr.write(`${error}\n`);
                (0, gracefulShutdown_js_1.gracefulShutdownSync)(1);
                throw new Error(error);
            }
            if (!permissionPromptTool.inputJSONSchema) {
                const error = `Error: tool ${permissionPromptToolName} (passed via --permission-prompt-tool) must be an MCP tool`;
                process.stderr.write(`${error}\n`);
                (0, gracefulShutdown_js_1.gracefulShutdownSync)(1);
                throw new Error(error);
            }
            resolved = createCanUseToolWithPermissionPrompt(permissionPromptTool);
        }
        return resolved(tool, input, toolUseContext, assistantMessage, toolUseId, forceDecision);
    };
}
async function handleInitializeRequest(request, requestId, initialized, output, commands, modelInfos, structuredIO, enableAuthStatus, options, agents, getAppState) {
    if (initialized) {
        output.enqueue({
            type: 'control_response',
            response: {
                subtype: 'error',
                error: 'Already initialized',
                request_id: requestId,
                pending_permission_requests: structuredIO.getPendingPermissionRequests(),
            },
        });
        return;
    }
    // Apply systemPrompt/appendSystemPrompt from stdin to avoid ARG_MAX limits
    if (request.systemPrompt !== undefined) {
        options.systemPrompt = request.systemPrompt;
    }
    if (request.appendSystemPrompt !== undefined) {
        options.appendSystemPrompt = request.appendSystemPrompt;
    }
    if (request.promptSuggestions !== undefined) {
        options.promptSuggestions = request.promptSuggestions;
    }
    // Merge agents from stdin to avoid ARG_MAX limits
    if (request.agents) {
        const stdinAgents = (0, loadAgentsDir_js_1.parseAgentsFromJson)(request.agents, 'flagSettings');
        agents.push(...stdinAgents);
    }
    // Re-evaluate main thread agent after SDK agents are merged
    // This allows --agent to reference agents defined via SDK
    if (options.agent) {
        // If main.tsx already found this agent (filesystem-defined), it already
        // applied systemPrompt/model/initialPrompt. Skip to avoid double-apply.
        const alreadyResolved = (0, state_js_2.getMainThreadAgentType)() === options.agent;
        const mainThreadAgent = agents.find(a => a.agentType === options.agent);
        if (mainThreadAgent && !alreadyResolved) {
            // Update the main thread agent type in bootstrap state
            (0, state_js_2.setMainThreadAgentType)(mainThreadAgent.agentType);
            // Apply the agent's system prompt if user hasn't specified a custom one
            // SDK agents are always custom agents (not built-in), so getSystemPrompt() takes no args
            if (!options.systemPrompt && !(0, loadAgentsDir_js_1.isBuiltInAgent)(mainThreadAgent)) {
                const agentSystemPrompt = mainThreadAgent.getSystemPrompt();
                if (agentSystemPrompt) {
                    options.systemPrompt = agentSystemPrompt;
                }
            }
            // Apply the agent's model if user didn't specify one and agent has a model
            if (!options.userSpecifiedModel &&
                mainThreadAgent.model &&
                mainThreadAgent.model !== 'inherit') {
                const agentModel = (0, model_js_1.parseUserSpecifiedModel)(mainThreadAgent.model);
                (0, state_js_2.setMainLoopModelOverride)(agentModel);
            }
            // SDK-defined agents arrive via init, so main.tsx's lookup missed them.
            if (mainThreadAgent.initialPrompt) {
                structuredIO.prependUserMessage(mainThreadAgent.initialPrompt);
            }
        }
        else if (mainThreadAgent?.initialPrompt) {
            // Filesystem-defined agent (alreadyResolved by main.tsx). main.tsx
            // handles initialPrompt for the string inputPrompt case, but when
            // inputPrompt is an AsyncIterable (SDK stream-json), it can't
            // concatenate — fall back to prependUserMessage here.
            structuredIO.prependUserMessage(mainThreadAgent.initialPrompt);
        }
    }
    const settings = (0, settings_js_1.getSettings_DEPRECATED)();
    const outputStyle = settings?.outputStyle || outputStyles_js_1.DEFAULT_OUTPUT_STYLE_NAME;
    const availableOutputStyles = await (0, outputStyles_js_1.getAllOutputStyles)((0, cwd_js_1.getCwd)());
    // Get account information
    const accountInfo = (0, auth_js_1.getAccountInformation)();
    if (request.hooks) {
        const hooks = {};
        for (const [event, matchers] of Object.entries(request.hooks)) {
            hooks[event] = matchers.map(matcher => {
                const callbacks = matcher.hookCallbackIds.map(callbackId => {
                    return structuredIO.createHookCallback(callbackId, matcher.timeout);
                });
                return {
                    matcher: matcher.matcher,
                    hooks: callbacks,
                };
            });
        }
        (0, state_js_1.registerHookCallbacks)(hooks);
    }
    if (request.jsonSchema) {
        (0, state_js_1.setInitJsonSchema)(request.jsonSchema);
    }
    const initResponse = {
        commands: commands
            .filter(cmd => cmd.userInvocable !== false)
            .map(cmd => ({
            name: (0, commands_js_1.getCommandName)(cmd),
            description: (0, commands_js_1.formatDescriptionWithSource)(cmd),
            argumentHint: cmd.argumentHint || '',
        })),
        agents: agents.map(agent => ({
            name: agent.agentType,
            description: agent.whenToUse,
            // 'inherit' is an internal sentinel; normalize to undefined for the public API
            model: agent.model === 'inherit' ? undefined : agent.model,
        })),
        output_style: outputStyle,
        available_output_styles: Object.keys(availableOutputStyles),
        models: modelInfos,
        account: {
            email: accountInfo?.email,
            organization: accountInfo?.organization,
            subscriptionType: accountInfo?.subscription,
            tokenSource: accountInfo?.tokenSource,
            apiKeySource: accountInfo?.apiKeySource,
            // getAccountInformation() returns undefined under 3P providers, so the
            // other fields are all absent. apiProvider disambiguates "not logged
            // in" (firstParty + tokenSource:none) from "3P, login not applicable".
            apiProvider: (0, providers_js_1.getAPIProvider)(),
        },
        pid: process.pid,
    };
    if ((0, fastMode_js_1.isFastModeEnabled)() && (0, fastMode_js_1.isFastModeAvailable)()) {
        const appState = getAppState();
        initResponse.fast_mode_state = (0, fastMode_js_1.getFastModeState)(options.userSpecifiedModel ?? null, appState.fastMode);
    }
    output.enqueue({
        type: 'control_response',
        response: {
            subtype: 'success',
            request_id: requestId,
            response: initResponse,
        },
    });
    // After the initialize message, check the auth status-
    // This will get notified of changes, but we also want to send the
    // initial state.
    if (enableAuthStatus) {
        const authStatusManager = awsAuthStatusManager_js_1.AwsAuthStatusManager.getInstance();
        const status = authStatusManager.getStatus();
        if (status) {
            output.enqueue({
                type: 'auth_status',
                isAuthenticating: status.isAuthenticating,
                output: status.output,
                error: status.error,
                uuid: (0, crypto_1.randomUUID)(),
                session_id: (0, state_js_2.getSessionId)(),
            });
        }
    }
}
async function handleRewindFiles(userMessageId, appState, setAppState, dryRun) {
    if (!(0, fileHistory_js_1.fileHistoryEnabled)()) {
        return { canRewind: false, error: 'File rewinding is not enabled.' };
    }
    if (!(0, fileHistory_js_1.fileHistoryCanRestore)(appState.fileHistory, userMessageId)) {
        return {
            canRewind: false,
            error: 'No file checkpoint found for this message.',
        };
    }
    if (dryRun) {
        const diffStats = await (0, fileHistory_js_1.fileHistoryGetDiffStats)(appState.fileHistory, userMessageId);
        return {
            canRewind: true,
            filesChanged: diffStats?.filesChanged,
            insertions: diffStats?.insertions,
            deletions: diffStats?.deletions,
        };
    }
    try {
        await (0, fileHistory_js_1.fileHistoryRewind)(updater => setAppState(prev => ({
            ...prev,
            fileHistory: updater(prev.fileHistory),
        })), userMessageId);
    }
    catch (error) {
        return {
            canRewind: false,
            error: `Failed to rewind: ${(0, errors_js_1.errorMessage)(error)}`,
        };
    }
    return { canRewind: true };
}
function handleSetPermissionMode(request, requestId, toolPermissionContext, output) {
    // Check if trying to switch to bypassPermissions mode
    if (request.mode === 'bypassPermissions') {
        if ((0, permissionSetup_js_1.isBypassPermissionsModeDisabled)()) {
            output.enqueue({
                type: 'control_response',
                response: {
                    subtype: 'error',
                    request_id: requestId,
                    error: 'Cannot set permission mode to bypassPermissions because it is disabled by settings or configuration',
                },
            });
            return toolPermissionContext;
        }
        if (!toolPermissionContext.isBypassPermissionsModeAvailable) {
            output.enqueue({
                type: 'control_response',
                response: {
                    subtype: 'error',
                    request_id: requestId,
                    error: 'Cannot set permission mode to bypassPermissions because the session was not launched with --dangerously-skip-permissions',
                },
            });
            return toolPermissionContext;
        }
    }
    // Check if trying to switch to auto mode without the classifier gate
    if ((0, bun_bundle_1.feature)('TRANSCRIPT_CLASSIFIER') &&
        request.mode === 'auto' &&
        !(0, permissionSetup_js_1.isAutoModeGateEnabled)()) {
        const reason = (0, permissionSetup_js_1.getAutoModeUnavailableReason)();
        output.enqueue({
            type: 'control_response',
            response: {
                subtype: 'error',
                request_id: requestId,
                error: reason
                    ? `Cannot set permission mode to auto: ${(0, permissionSetup_js_1.getAutoModeUnavailableNotification)(reason)}`
                    : 'Cannot set permission mode to auto',
            },
        });
        return toolPermissionContext;
    }
    // Allow the mode switch
    output.enqueue({
        type: 'control_response',
        response: {
            subtype: 'success',
            request_id: requestId,
            response: {
                mode: request.mode,
            },
        },
    });
    return {
        ...(0, permissionSetup_js_1.transitionPermissionMode)(toolPermissionContext.mode, request.mode, toolPermissionContext),
        mode: request.mode,
    };
}
/**
 * IDE-triggered channel enable. Derives the ChannelEntry from the connection's
 * pluginSource (IDE can't spoof kind/marketplace — we only take the server
 * name), appends it to session allowedChannels, and runs the full gate. On
 * gate failure, rolls back the append. On success, registers a notification
 * handler that enqueues channel messages at priority:'next' — drainCommandQueue
 * picks them up between turns.
 *
 * Intentionally does NOT register the claude/channel/permission handler that
 * useManageMCPConnections sets up for interactive mode. That handler resolves
 * a pending dialog inside handleInteractivePermission — but print.ts never
 * calls handleInteractivePermission. When SDK permission lands on 'ask', it
 * goes to the consumer's canUseTool callback over stdio; there is no CLI-side
 * dialog for a remote "yes tbxkq" to resolve. If an IDE wants channel-relayed
 * tool approval, that's IDE-side plumbing against its own pending-map. (Also
 * gated separately by tengu_harbor_permissions — not yet shipping on
 * interactive either.)
 */
function handleChannelEnable(requestId, serverName, connectionPool, output) {
    const respondError = (error) => output.enqueue({
        type: 'control_response',
        response: { subtype: 'error', request_id: requestId, error },
    });
    if (!((0, bun_bundle_1.feature)('KAIROS') || (0, bun_bundle_1.feature)('KAIROS_CHANNELS'))) {
        return respondError('channels feature not available in this build');
    }
    // Only a 'connected' client has .capabilities and .client to register the
    // handler on. The pool spread at the call site matches mcp_status.
    const connection = connectionPool.find(c => c.name === serverName && c.type === 'connected');
    if (!connection || connection.type !== 'connected') {
        return respondError(`server ${serverName} is not connected`);
    }
    const pluginSource = connection.config.pluginSource;
    const parsed = pluginSource ? (0, pluginIdentifier_js_1.parsePluginIdentifier)(pluginSource) : undefined;
    if (!parsed?.marketplace) {
        // No pluginSource or @-less source — can never pass the {plugin,
        // marketplace}-keyed allowlist. Short-circuit with the same reason the
        // gate would produce.
        return respondError(`server ${serverName} is not plugin-sourced; channel_enable requires a marketplace plugin`);
    }
    const entry = {
        kind: 'plugin',
        name: parsed.name,
        marketplace: parsed.marketplace,
    };
    // Idempotency: don't double-append on repeat enable.
    const prior = (0, state_js_2.getAllowedChannels)();
    const already = prior.some(e => e.kind === 'plugin' &&
        e.name === entry.name &&
        e.marketplace === entry.marketplace);
    if (!already)
        (0, state_js_2.setAllowedChannels)([...prior, entry]);
    const gate = (0, channelNotification_js_1.gateChannelServer)(serverName, connection.capabilities, pluginSource);
    if (gate.action === 'skip') {
        // Rollback — only remove the entry we appended.
        if (!already)
            (0, state_js_2.setAllowedChannels)(prior);
        return respondError(gate.reason);
    }
    const pluginId = `${entry.name}@${entry.marketplace}`;
    (0, log_js_1.logMCPDebug)(serverName, 'Channel notifications registered');
    (0, index_js_3.logEvent)('tengu_mcp_channel_enable', { plugin: pluginId });
    // Identical enqueue shape to the interactive register block in
    // useManageMCPConnections. drainCommandQueue processes it between turns —
    // channel messages queue at priority 'next' and are seen by the model on
    // the turn after they arrive.
    connection.client.setNotificationHandler((0, channelNotification_js_1.ChannelMessageNotificationSchema)(), async (notification) => {
        const { content, meta } = notification.params;
        (0, log_js_1.logMCPDebug)(serverName, `notifications/claude/channel: ${content.slice(0, 80)}`);
        (0, index_js_3.logEvent)('tengu_mcp_channel_message', {
            content_length: content.length,
            meta_key_count: Object.keys(meta ?? {}).length,
            entry_kind: 'plugin',
            is_dev: false,
            plugin: pluginId,
        });
        (0, messageQueueManager_js_1.enqueue)({
            mode: 'prompt',
            value: (0, channelNotification_js_1.wrapChannelMessage)(serverName, content, meta),
            priority: 'next',
            isMeta: true,
            origin: { kind: 'channel', server: serverName },
            skipSlashCommands: true,
        });
    });
    output.enqueue({
        type: 'control_response',
        response: {
            subtype: 'success',
            request_id: requestId,
            response: undefined,
        },
    });
}
/**
 * Re-register the channel notification handler after mcp_reconnect /
 * mcp_toggle creates a new client. handleChannelEnable bound the handler to
 * the OLD client object; allowedChannels survives the reconnect but the
 * handler binding does not. Without this, channel messages silently drop
 * after a reconnect while the IDE still believes the channel is live.
 *
 * Mirrors the interactive CLI's onConnectionAttempt in
 * useManageMCPConnections, which re-gates on every new connection. Paired
 * with registerElicitationHandlers at the same call sites.
 *
 * No-op if the server was never channel-enabled: gateChannelServer calls
 * findChannelEntry internally and returns skip/session for an unlisted
 * server, so reconnecting a non-channel MCP server costs one feature-flag
 * check.
 */
function reregisterChannelHandlerAfterReconnect(connection) {
    if (!((0, bun_bundle_1.feature)('KAIROS') || (0, bun_bundle_1.feature)('KAIROS_CHANNELS')))
        return;
    if (connection.type !== 'connected')
        return;
    const gate = (0, channelNotification_js_1.gateChannelServer)(connection.name, connection.capabilities, connection.config.pluginSource);
    if (gate.action !== 'register')
        return;
    const entry = (0, channelNotification_js_1.findChannelEntry)(connection.name, (0, state_js_2.getAllowedChannels)());
    const pluginId = entry?.kind === 'plugin'
        ? `${entry.name}@${entry.marketplace}`
        : undefined;
    (0, log_js_1.logMCPDebug)(connection.name, 'Channel notifications re-registered after reconnect');
    connection.client.setNotificationHandler((0, channelNotification_js_1.ChannelMessageNotificationSchema)(), async (notification) => {
        const { content, meta } = notification.params;
        (0, log_js_1.logMCPDebug)(connection.name, `notifications/claude/channel: ${content.slice(0, 80)}`);
        (0, index_js_3.logEvent)('tengu_mcp_channel_message', {
            content_length: content.length,
            meta_key_count: Object.keys(meta ?? {}).length,
            entry_kind: entry?.kind,
            is_dev: entry?.dev ?? false,
            plugin: pluginId,
        });
        (0, messageQueueManager_js_1.enqueue)({
            mode: 'prompt',
            value: (0, channelNotification_js_1.wrapChannelMessage)(connection.name, content, meta),
            priority: 'next',
            isMeta: true,
            origin: { kind: 'channel', server: connection.name },
            skipSlashCommands: true,
        });
    });
}
/**
 * Emits an error message in the correct format based on outputFormat.
 * When using stream-json, writes JSON to stdout; otherwise writes plain text to stderr.
 */
function emitLoadError(message, outputFormat) {
    if (outputFormat === 'stream-json') {
        const errorResult = {
            type: 'result',
            subtype: 'error_during_execution',
            duration_ms: 0,
            duration_api_ms: 0,
            is_error: true,
            num_turns: 0,
            stop_reason: null,
            session_id: (0, state_js_2.getSessionId)(),
            total_cost_usd: 0,
            usage: logging_js_1.EMPTY_USAGE,
            modelUsage: {},
            permission_denials: [],
            uuid: (0, crypto_1.randomUUID)(),
            errors: [message],
        };
        process.stdout.write((0, slowOperations_js_1.jsonStringify)(errorResult) + '\n');
    }
    else {
        process.stderr.write(message + '\n');
    }
}
/**
 * Removes an interrupted user message and its synthetic assistant sentinel
 * from the message array. Used during gateway-triggered restarts to clean up
 * the message history before re-enqueuing the interrupted prompt.
 *
 * @internal Exported for testing
 */
function removeInterruptedMessage(messages, interruptedUserMessage) {
    const idx = messages.findIndex(m => m.uuid === interruptedUserMessage.uuid);
    if (idx !== -1) {
        // Remove the user message and the sentinel that immediately follows it.
        // splice safely handles the case where idx is the last element.
        messages.splice(idx, 2);
    }
}
async function loadInitialMessages(setAppState, options) {
    const persistSession = !(0, state_js_2.isSessionPersistenceDisabled)();
    // Handle continue in print mode
    if (options.continue) {
        try {
            (0, index_js_3.logEvent)('tengu_continue_print', {});
            const result = await (0, conversationRecovery_js_1.loadConversationForResume)(undefined /* sessionId */, undefined /* file path */);
            if (result) {
                // Match coordinator mode to the resumed session's mode
                if ((0, bun_bundle_1.feature)('COORDINATOR_MODE') && coordinatorModeModule) {
                    const warning = coordinatorModeModule.matchSessionMode(result.mode);
                    if (warning) {
                        process.stderr.write(warning + '\n');
                        // Refresh agent definitions to reflect the mode switch
                        const { getAgentDefinitionsWithOverrides, getActiveAgentsFromList, } = 
                        // eslint-disable-next-line @typescript-eslint/no-require-imports
                        require('../tools/AgentTool/loadAgentsDir.js');
                        getAgentDefinitionsWithOverrides.cache.clear?.();
                        const freshAgentDefs = await getAgentDefinitionsWithOverrides((0, cwd_js_1.getCwd)());
                        setAppState(prev => ({
                            ...prev,
                            agentDefinitions: {
                                ...freshAgentDefs,
                                allAgents: freshAgentDefs.allAgents,
                                activeAgents: getActiveAgentsFromList(freshAgentDefs.allAgents),
                            },
                        }));
                    }
                }
                // Reuse the resumed session's ID
                if (!options.forkSession) {
                    if (result.sessionId) {
                        (0, state_js_2.switchSession)((0, ids_js_1.asSessionId)(result.sessionId), result.fullPath ? (0, path_1.dirname)(result.fullPath) : null);
                        if (persistSession) {
                            await (0, sessionStorage_js_1.resetSessionFilePointer)();
                        }
                    }
                }
                (0, sessionRestore_js_1.restoreSessionStateFromLog)(result, setAppState);
                // Restore session metadata so it's re-appended on exit via reAppendSessionMetadata
                (0, sessionStorage_js_1.restoreSessionMetadata)(options.forkSession
                    ? { ...result, worktreeSession: undefined }
                    : result);
                // Write mode entry for the resumed session
                if ((0, bun_bundle_1.feature)('COORDINATOR_MODE') && coordinatorModeModule) {
                    (0, sessionStorage_js_1.saveMode)(coordinatorModeModule.isCoordinatorMode()
                        ? 'coordinator'
                        : 'normal');
                }
                return {
                    messages: result.messages,
                    turnInterruptionState: result.turnInterruptionState,
                    agentSetting: result.agentSetting,
                };
            }
        }
        catch (error) {
            (0, log_js_1.logError)(error);
            (0, gracefulShutdown_js_1.gracefulShutdownSync)(1);
            return { messages: [] };
        }
    }
    // Handle teleport in print mode
    if (options.teleport) {
        try {
            if (!(0, index_js_4.isPolicyAllowed)('allow_remote_sessions')) {
                throw new Error("Remote sessions are disabled by your organization's policy.");
            }
            (0, index_js_3.logEvent)('tengu_teleport_print', {});
            if (typeof options.teleport !== 'string') {
                throw new Error('No session ID provided for teleport');
            }
            const { checkOutTeleportedSessionBranch, processMessagesForTeleportResume, teleportResumeCodeSession, validateGitState, } = await Promise.resolve().then(() => __importStar(require('src/utils/teleport.js')));
            await validateGitState();
            const teleportResult = await teleportResumeCodeSession(options.teleport);
            const { branchError } = await checkOutTeleportedSessionBranch(teleportResult.branch);
            return {
                messages: processMessagesForTeleportResume(teleportResult.log, branchError),
            };
        }
        catch (error) {
            (0, log_js_1.logError)(error);
            (0, gracefulShutdown_js_1.gracefulShutdownSync)(1);
            return { messages: [] };
        }
    }
    // Handle resume in print mode (accepts session ID or URL)
    // URLs are [ANT-ONLY]
    if (options.resume) {
        try {
            (0, index_js_3.logEvent)('tengu_resume_print', {});
            // In print mode - we require a valid session ID, JSONL file or URL
            const parsedSessionId = (0, sessionUrl_js_1.parseSessionIdentifier)(typeof options.resume === 'string' ? options.resume : '');
            if (!parsedSessionId) {
                let errorMessage = 'Error: --resume requires a valid session ID when used with --print. Usage: claude -p --resume <session-id>';
                if (typeof options.resume === 'string') {
                    errorMessage += `. Session IDs must be in UUID format (e.g., 550e8400-e29b-41d4-a716-446655440000). Provided value "${options.resume}" is not a valid UUID`;
                }
                emitLoadError(errorMessage, options.outputFormat);
                (0, gracefulShutdown_js_1.gracefulShutdownSync)(1);
                return { messages: [] };
            }
            // Hydrate local transcript from remote before loading
            if ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_USE_CCR_V2)) {
                // Await restore alongside hydration so SSE catchup lands on
                // restored state, not a fresh default.
                const [, metadata] = await Promise.all([
                    (0, sessionStorage_js_1.hydrateFromCCRv2InternalEvents)(parsedSessionId.sessionId),
                    options.restoredWorkerState,
                ]);
                if (metadata) {
                    setAppState((0, onChangeAppState_js_1.externalMetadataToAppState)(metadata));
                    if (typeof metadata.model === 'string') {
                        (0, state_js_2.setMainLoopModelOverride)(metadata.model);
                    }
                }
            }
            else if (parsedSessionId.isUrl &&
                parsedSessionId.ingressUrl &&
                (0, envUtils_js_1.isEnvTruthy)(process.env.ENABLE_SESSION_PERSISTENCE)) {
                // v1: fetch session logs from Session Ingress
                await (0, sessionStorage_js_1.hydrateRemoteSession)(parsedSessionId.sessionId, parsedSessionId.ingressUrl);
            }
            // Load the conversation with the specified session ID
            const result = await (0, conversationRecovery_js_1.loadConversationForResume)(parsedSessionId.sessionId, parsedSessionId.jsonlFile || undefined);
            // hydrateFromCCRv2InternalEvents writes an empty transcript file for
            // fresh sessions (writeFile(sessionFile, '') with zero events), so
            // loadConversationForResume returns {messages: []} not null. Treat
            // empty the same as null so SessionStart still fires.
            if (!result || result.messages.length === 0) {
                // For URL-based or CCR v2 resume, start with empty session (it was hydrated but empty)
                if (parsedSessionId.isUrl ||
                    (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_USE_CCR_V2)) {
                    // Execute SessionStart hooks for startup since we're starting a new session
                    return {
                        messages: await (options.sessionStartHooksPromise ??
                            (0, sessionStart_js_1.processSessionStartHooks)('startup')),
                    };
                }
                else {
                    emitLoadError(`No conversation found with session ID: ${parsedSessionId.sessionId}`, options.outputFormat);
                    (0, gracefulShutdown_js_1.gracefulShutdownSync)(1);
                    return { messages: [] };
                }
            }
            // Handle resumeSessionAt feature
            if (options.resumeSessionAt) {
                const index = result.messages.findIndex(m => m.uuid === options.resumeSessionAt);
                if (index < 0) {
                    emitLoadError(`No message found with message.uuid of: ${options.resumeSessionAt}`, options.outputFormat);
                    (0, gracefulShutdown_js_1.gracefulShutdownSync)(1);
                    return { messages: [] };
                }
                result.messages = index >= 0 ? result.messages.slice(0, index + 1) : [];
            }
            // Match coordinator mode to the resumed session's mode
            if ((0, bun_bundle_1.feature)('COORDINATOR_MODE') && coordinatorModeModule) {
                const warning = coordinatorModeModule.matchSessionMode(result.mode);
                if (warning) {
                    process.stderr.write(warning + '\n');
                    // Refresh agent definitions to reflect the mode switch
                    const { getAgentDefinitionsWithOverrides, getActiveAgentsFromList } = 
                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                    require('../tools/AgentTool/loadAgentsDir.js');
                    getAgentDefinitionsWithOverrides.cache.clear?.();
                    const freshAgentDefs = await getAgentDefinitionsWithOverrides((0, cwd_js_1.getCwd)());
                    setAppState(prev => ({
                        ...prev,
                        agentDefinitions: {
                            ...freshAgentDefs,
                            allAgents: freshAgentDefs.allAgents,
                            activeAgents: getActiveAgentsFromList(freshAgentDefs.allAgents),
                        },
                    }));
                }
            }
            // Reuse the resumed session's ID
            if (!options.forkSession && result.sessionId) {
                (0, state_js_2.switchSession)((0, ids_js_1.asSessionId)(result.sessionId), result.fullPath ? (0, path_1.dirname)(result.fullPath) : null);
                if (persistSession) {
                    await (0, sessionStorage_js_1.resetSessionFilePointer)();
                }
            }
            (0, sessionRestore_js_1.restoreSessionStateFromLog)(result, setAppState);
            // Restore session metadata so it's re-appended on exit via reAppendSessionMetadata
            (0, sessionStorage_js_1.restoreSessionMetadata)(options.forkSession
                ? { ...result, worktreeSession: undefined }
                : result);
            // Write mode entry for the resumed session
            if ((0, bun_bundle_1.feature)('COORDINATOR_MODE') && coordinatorModeModule) {
                (0, sessionStorage_js_1.saveMode)(coordinatorModeModule.isCoordinatorMode() ? 'coordinator' : 'normal');
            }
            return {
                messages: result.messages,
                turnInterruptionState: result.turnInterruptionState,
                agentSetting: result.agentSetting,
            };
        }
        catch (error) {
            (0, log_js_1.logError)(error);
            const errorMessage = error instanceof Error
                ? `Failed to resume session: ${error.message}`
                : 'Failed to resume session with --print mode';
            emitLoadError(errorMessage, options.outputFormat);
            (0, gracefulShutdown_js_1.gracefulShutdownSync)(1);
            return { messages: [] };
        }
    }
    // Join the SessionStart hooks promise kicked in main.tsx (or run fresh if
    // it wasn't kicked — e.g. --continue with no prior session falls through
    // here with sessionStartHooksPromise undefined because main.tsx guards on continue)
    return {
        messages: await (options.sessionStartHooksPromise ??
            (0, sessionStart_js_1.processSessionStartHooks)('startup')),
    };
}
function getStructuredIO(inputPrompt, options) {
    let inputStream;
    if (typeof inputPrompt === 'string') {
        if (inputPrompt.trim() !== '') {
            // Normalize to a streaming input.
            inputStream = (0, generators_js_1.fromArray)([
                (0, slowOperations_js_1.jsonStringify)({
                    type: 'user',
                    session_id: '',
                    message: {
                        role: 'user',
                        content: inputPrompt,
                    },
                    parent_tool_use_id: null,
                }),
            ]);
        }
        else {
            // Empty string - create empty stream
            inputStream = (0, generators_js_1.fromArray)([]);
        }
    }
    else {
        inputStream = inputPrompt;
    }
    // Use RemoteIO if sdkUrl is provided, otherwise use regular StructuredIO
    return options.sdkUrl
        ? new remoteIO_js_1.RemoteIO(options.sdkUrl, inputStream, options.replayUserMessages)
        : new structuredIO_js_1.StructuredIO(inputStream, options.replayUserMessages);
}
/**
 * Handles unexpected permission responses by looking up the unresolved tool
 * call in the transcript and enqueuing it for execution.
 *
 * Returns true if a permission was enqueued, false otherwise.
 */
async function handleOrphanedPermissionResponse({ message, setAppState, onEnqueued, handledToolUseIds, }) {
    if (message.response.subtype === 'success' &&
        message.response.response?.toolUseID &&
        typeof message.response.response.toolUseID === 'string') {
        const permissionResult = message.response.response;
        const { toolUseID } = permissionResult;
        if (!toolUseID) {
            return false;
        }
        (0, debug_js_1.logForDebugging)(`handleOrphanedPermissionResponse: received orphaned control_response for toolUseID=${toolUseID} request_id=${message.response.request_id}`);
        // Prevent re-processing the same orphaned tool_use. Without this guard,
        // duplicate control_response deliveries (e.g. from WebSocket reconnect)
        // cause the same tool to be executed multiple times, producing duplicate
        // tool_use IDs in the messages array and a 400 error from the API.
        // Once corrupted, every retry accumulates more duplicates.
        if (handledToolUseIds.has(toolUseID)) {
            (0, debug_js_1.logForDebugging)(`handleOrphanedPermissionResponse: skipping duplicate orphaned permission for toolUseID=${toolUseID} (already handled)`);
            return false;
        }
        const assistantMessage = await (0, sessionStorage_js_1.findUnresolvedToolUse)(toolUseID);
        if (!assistantMessage) {
            (0, debug_js_1.logForDebugging)(`handleOrphanedPermissionResponse: no unresolved tool_use found for toolUseID=${toolUseID} (already resolved in transcript)`);
            return false;
        }
        handledToolUseIds.add(toolUseID);
        (0, debug_js_1.logForDebugging)(`handleOrphanedPermissionResponse: enqueuing orphaned permission for toolUseID=${toolUseID} messageID=${assistantMessage.message.id}`);
        (0, messageQueueManager_js_1.enqueue)({
            mode: 'orphaned-permission',
            value: [],
            orphanedPermission: {
                permissionResult,
                assistantMessage,
            },
        });
        onEnqueued?.();
        return true;
    }
    return false;
}
/**
 * Converts a process transport config to a scoped config.
 * The types are structurally compatible, so we just add the scope.
 */
function toScopedConfig(config) {
    // McpServerConfigForProcessTransport is a subset of McpServerConfig
    // (it excludes IDE-specific types like sse-ide and ws-ide)
    // Adding scope makes it a valid ScopedMcpServerConfig
    return { ...config, scope: 'dynamic' };
}
/**
 * Handles mcp_set_servers requests by processing both SDK and process-based servers.
 * SDK servers run in the SDK process; process-based servers are spawned by the CLI.
 *
 * Applies enterprise allowedMcpServers/deniedMcpServers policy — same filter as
 * --mcp-config (see filterMcpServersByPolicy call in main.tsx). Without this,
 * SDK V2 Query.setMcpServers() was a second policy bypass vector. Blocked servers
 * are reported in response.errors so the SDK consumer knows why they weren't added.
 */
async function handleMcpSetServers(servers, sdkState, dynamicState, setAppState) {
    // Enforce enterprise MCP policy on process-based servers (stdio/http/sse).
    // Mirrors the --mcp-config filter in main.tsx — both user-controlled injection
    // paths must have the same gate. type:'sdk' servers are exempt (SDK-managed,
    // CLI never spawns/connects for them — see filterMcpServersByPolicy jsdoc).
    // Blocked servers go into response.errors so the SDK caller sees why.
    const { allowed: allowedServers, blocked } = (0, config_js_1.filterMcpServersByPolicy)(servers);
    const policyErrors = {};
    for (const name of blocked) {
        policyErrors[name] =
            'Blocked by enterprise policy (allowedMcpServers/deniedMcpServers)';
    }
    // Separate SDK servers from process-based servers
    const sdkServers = {};
    const processServers = {};
    for (const [name, config] of Object.entries(allowedServers)) {
        if (config.type === 'sdk') {
            sdkServers[name] = config;
        }
        else {
            processServers[name] = config;
        }
    }
    // Handle SDK servers
    const currentSdkNames = new Set(Object.keys(sdkState.configs));
    const newSdkNames = new Set(Object.keys(sdkServers));
    const sdkAdded = [];
    const sdkRemoved = [];
    const newSdkConfigs = { ...sdkState.configs };
    let newSdkClients = [...sdkState.clients];
    let newSdkTools = [...sdkState.tools];
    // Remove SDK servers no longer in desired state
    for (const name of currentSdkNames) {
        if (!newSdkNames.has(name)) {
            const client = newSdkClients.find(c => c.name === name);
            if (client && client.type === 'connected') {
                await client.cleanup();
            }
            newSdkClients = newSdkClients.filter(c => c.name !== name);
            const prefix = `mcp__${name}__`;
            newSdkTools = newSdkTools.filter(t => !t.name.startsWith(prefix));
            delete newSdkConfigs[name];
            sdkRemoved.push(name);
        }
    }
    // Add new SDK servers as pending - they'll be upgraded to connected
    // when updateSdkMcp() runs on the next query
    for (const [name, config] of Object.entries(sdkServers)) {
        if (!currentSdkNames.has(name)) {
            newSdkConfigs[name] = config;
            const pendingClient = {
                type: 'pending',
                name,
                config: { ...config, scope: 'dynamic' },
            };
            newSdkClients = [...newSdkClients, pendingClient];
            sdkAdded.push(name);
        }
    }
    // Handle process-based servers
    const processResult = await reconcileMcpServers(processServers, dynamicState, setAppState);
    return {
        response: {
            added: [...sdkAdded, ...processResult.response.added],
            removed: [...sdkRemoved, ...processResult.response.removed],
            errors: { ...policyErrors, ...processResult.response.errors },
        },
        newSdkState: {
            configs: newSdkConfigs,
            clients: newSdkClients,
            tools: newSdkTools,
        },
        newDynamicState: processResult.newState,
        sdkServersChanged: sdkAdded.length > 0 || sdkRemoved.length > 0,
    };
}
/**
 * Reconciles the current set of dynamic MCP servers with a new desired state.
 * Handles additions, removals, and config changes.
 */
async function reconcileMcpServers(desiredConfigs, currentState, setAppState) {
    const currentNames = new Set(Object.keys(currentState.configs));
    const desiredNames = new Set(Object.keys(desiredConfigs));
    const toRemove = [...currentNames].filter(n => !desiredNames.has(n));
    const toAdd = [...desiredNames].filter(n => !currentNames.has(n));
    // Check for config changes (same name, different config)
    const toCheck = [...currentNames].filter(n => desiredNames.has(n));
    const toReplace = toCheck.filter(name => {
        const currentConfig = currentState.configs[name];
        const desiredConfigRaw = desiredConfigs[name];
        if (!currentConfig || !desiredConfigRaw)
            return true;
        const desiredConfig = toScopedConfig(desiredConfigRaw);
        return !(0, client_js_1.areMcpConfigsEqual)(currentConfig, desiredConfig);
    });
    const removed = [];
    const added = [];
    const errors = {};
    let newClients = [...currentState.clients];
    let newTools = [...currentState.tools];
    // Remove old servers (including ones being replaced)
    for (const name of [...toRemove, ...toReplace]) {
        const client = newClients.find(c => c.name === name);
        const config = currentState.configs[name];
        if (client && config) {
            if (client.type === 'connected') {
                try {
                    await client.cleanup();
                }
                catch (e) {
                    (0, log_js_1.logError)(e);
                }
            }
            // Clear the memoization cache
            await (0, client_js_1.clearServerCache)(name, config);
        }
        // Remove tools from this server
        const prefix = `mcp__${name}__`;
        newTools = newTools.filter(t => !t.name.startsWith(prefix));
        // Remove from clients list
        newClients = newClients.filter(c => c.name !== name);
        // Track removal (only for actually removed, not replaced)
        if (toRemove.includes(name)) {
            removed.push(name);
        }
    }
    // Add new servers (including replacements)
    for (const name of [...toAdd, ...toReplace]) {
        const config = desiredConfigs[name];
        if (!config)
            continue;
        const scopedConfig = toScopedConfig(config);
        // SDK servers are managed by the SDK process, not the CLI.
        // Just track them without trying to connect.
        if (config.type === 'sdk') {
            added.push(name);
            continue;
        }
        try {
            const client = await (0, client_js_1.connectToServer)(name, scopedConfig);
            newClients.push(client);
            if (client.type === 'connected') {
                const serverTools = await (0, client_js_1.fetchToolsForClient)(client);
                newTools.push(...serverTools);
            }
            else if (client.type === 'failed') {
                errors[name] = client.error || 'Connection failed';
            }
            added.push(name);
        }
        catch (e) {
            const err = (0, errors_js_1.toError)(e);
            errors[name] = err.message;
            (0, log_js_1.logError)(err);
        }
    }
    // Build new configs
    const newConfigs = {};
    for (const name of desiredNames) {
        const config = desiredConfigs[name];
        if (config) {
            newConfigs[name] = toScopedConfig(config);
        }
    }
    const newState = {
        clients: newClients,
        tools: newTools,
        configs: newConfigs,
    };
    // Update AppState with the new tools
    setAppState(prev => {
        // Get all dynamic server names (current + new)
        const allDynamicServerNames = new Set([
            ...Object.keys(currentState.configs),
            ...Object.keys(newConfigs),
        ]);
        // Remove old dynamic tools
        const nonDynamicTools = prev.mcp.tools.filter(t => {
            for (const serverName of allDynamicServerNames) {
                if (t.name.startsWith(`mcp__${serverName}__`)) {
                    return false;
                }
            }
            return true;
        });
        // Remove old dynamic clients
        const nonDynamicClients = prev.mcp.clients.filter(c => {
            return !allDynamicServerNames.has(c.name);
        });
        return {
            ...prev,
            mcp: {
                ...prev.mcp,
                tools: [...nonDynamicTools, ...newTools],
                clients: [...nonDynamicClients, ...newClients],
            },
        };
    });
    return {
        response: { added, removed, errors },
        newState,
    };
}
