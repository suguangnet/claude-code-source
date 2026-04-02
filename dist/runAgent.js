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
exports.runAgent = runAgent;
exports.filterIncompleteToolCalls = filterIncompleteToolCalls;
const bun_bundle_1 = require("bun:bundle");
const crypto_1 = require("crypto");
const uniqBy_js_1 = __importDefault(require("lodash-es/uniqBy.js"));
const debug_js_1 = require("src/utils/debug.js");
const state_js_1 = require("../../bootstrap/state.js");
const commands_js_1 = require("../../commands.js");
const prompts_js_1 = require("../../constants/prompts.js");
const context_js_1 = require("../../context.js");
const query_js_1 = require("../../query.js");
const growthbook_js_1 = require("../../services/analytics/growthbook.js");
const dumpPrompts_js_1 = require("../../services/api/dumpPrompts.js");
const promptCacheBreakDetection_js_1 = require("../../services/api/promptCacheBreakDetection.js");
const client_js_1 = require("../../services/mcp/client.js");
const config_js_1 = require("../../services/mcp/config.js");
const killShellTasks_js_1 = require("../../tasks/LocalShellTask/killShellTasks.js");
const attachments_js_1 = require("../../utils/attachments.js");
const errors_js_1 = require("../../utils/errors.js");
const file_js_1 = require("../../utils/file.js");
const fileStateCache_js_1 = require("../../utils/fileStateCache.js");
const forkedAgent_js_1 = require("../../utils/forkedAgent.js");
const registerFrontmatterHooks_js_1 = require("../../utils/hooks/registerFrontmatterHooks.js");
const sessionHooks_js_1 = require("../../utils/hooks/sessionHooks.js");
const hooks_js_1 = require("../../utils/hooks.js");
const messages_js_1 = require("../../utils/messages.js");
const agent_js_1 = require("../../utils/model/agent.js");
const sessionStorage_js_1 = require("../../utils/sessionStorage.js");
const pluginOnlyPolicy_js_1 = require("../../utils/settings/pluginOnlyPolicy.js");
const systemPromptType_js_1 = require("../../utils/systemPromptType.js");
const perfettoTracing_js_1 = require("../../utils/telemetry/perfettoTracing.js");
const uuid_js_1 = require("../../utils/uuid.js");
const agentToolUtils_js_1 = require("./agentToolUtils.js");
const loadAgentsDir_js_1 = require("./loadAgentsDir.js");
/**
 * Initialize agent-specific MCP servers
 * Agents can define their own MCP servers in their frontmatter that are additive
 * to the parent's MCP clients. These servers are connected when the agent starts
 * and cleaned up when the agent finishes.
 *
 * @param agentDefinition The agent definition with optional mcpServers
 * @param parentClients MCP clients inherited from parent context
 * @returns Merged clients (parent + agent-specific), agent MCP tools, and cleanup function
 */
async function initializeAgentMcpServers(agentDefinition, parentClients) {
    // If no agent-specific servers defined, return parent clients as-is
    if (!agentDefinition.mcpServers?.length) {
        return {
            clients: parentClients,
            tools: [],
            cleanup: async () => { },
        };
    }
    // When MCP is locked to plugin-only, skip frontmatter MCP servers for
    // USER-CONTROLLED agents only. Plugin, built-in, and policySettings agents
    // are admin-trusted — their frontmatter MCP is part of the admin-approved
    // surface. Blocking them (as the first cut did) breaks plugin agents that
    // legitimately need MCP, contradicting "plugin-provided always loads."
    const agentIsAdminTrusted = (0, pluginOnlyPolicy_js_1.isSourceAdminTrusted)(agentDefinition.source);
    if ((0, pluginOnlyPolicy_js_1.isRestrictedToPluginOnly)('mcp') && !agentIsAdminTrusted) {
        (0, debug_js_1.logForDebugging)(`[Agent: ${agentDefinition.agentType}] Skipping MCP servers: strictPluginOnlyCustomization locks MCP to plugin-only (agent source: ${agentDefinition.source})`);
        return {
            clients: parentClients,
            tools: [],
            cleanup: async () => { },
        };
    }
    const agentClients = [];
    // Track which clients were newly created (inline definitions) vs. shared from parent
    // Only newly created clients should be cleaned up when the agent finishes
    const newlyCreatedClients = [];
    const agentTools = [];
    for (const spec of agentDefinition.mcpServers) {
        let config = null;
        let name;
        let isNewlyCreated = false;
        if (typeof spec === 'string') {
            // Reference by name - look up in existing MCP configs
            // This uses the memoized connectToServer, so we may get a shared client
            name = spec;
            config = (0, config_js_1.getMcpConfigByName)(spec);
            if (!config) {
                (0, debug_js_1.logForDebugging)(`[Agent: ${agentDefinition.agentType}] MCP server not found: ${spec}`, { level: 'warn' });
                continue;
            }
        }
        else {
            // Inline definition as { [name]: config }
            // These are agent-specific servers that should be cleaned up
            const entries = Object.entries(spec);
            if (entries.length !== 1) {
                (0, debug_js_1.logForDebugging)(`[Agent: ${agentDefinition.agentType}] Invalid MCP server spec: expected exactly one key`, { level: 'warn' });
                continue;
            }
            const [serverName, serverConfig] = entries[0];
            name = serverName;
            config = {
                ...serverConfig,
                scope: 'dynamic',
            };
            isNewlyCreated = true;
        }
        // Connect to the server
        const client = await (0, client_js_1.connectToServer)(name, config);
        agentClients.push(client);
        if (isNewlyCreated) {
            newlyCreatedClients.push(client);
        }
        // Fetch tools if connected
        if (client.type === 'connected') {
            const tools = await (0, client_js_1.fetchToolsForClient)(client);
            agentTools.push(...tools);
            (0, debug_js_1.logForDebugging)(`[Agent: ${agentDefinition.agentType}] Connected to MCP server '${name}' with ${tools.length} tools`);
        }
        else {
            (0, debug_js_1.logForDebugging)(`[Agent: ${agentDefinition.agentType}] Failed to connect to MCP server '${name}': ${client.type}`, { level: 'warn' });
        }
    }
    // Create cleanup function for agent-specific servers
    // Only clean up newly created clients (inline definitions), not shared/referenced ones
    // Shared clients (referenced by string name) are memoized and used by the parent context
    const cleanup = async () => {
        for (const client of newlyCreatedClients) {
            if (client.type === 'connected') {
                try {
                    await client.cleanup();
                }
                catch (error) {
                    (0, debug_js_1.logForDebugging)(`[Agent: ${agentDefinition.agentType}] Error cleaning up MCP server '${client.name}': ${error}`, { level: 'warn' });
                }
            }
        }
    };
    // Return merged clients (parent + agent-specific) and agent tools
    return {
        clients: [...parentClients, ...agentClients],
        tools: agentTools,
        cleanup,
    };
}
/**
 * Type guard to check if a message from query() is a recordable Message type.
 * Matches the types we want to record: assistant, user, progress, or system compact_boundary.
 */
function isRecordableMessage(msg) {
    return (msg.type === 'assistant' ||
        msg.type === 'user' ||
        msg.type === 'progress' ||
        (msg.type === 'system' &&
            'subtype' in msg &&
            msg.subtype === 'compact_boundary'));
}
async function* runAgent({ agentDefinition, promptMessages, toolUseContext, canUseTool, isAsync, canShowPermissionPrompts, forkContextMessages, querySource, override, model, maxTurns, preserveToolUseResults, availableTools, allowedTools, onCacheSafeParams, contentReplacementState, useExactTools, worktreePath, description, transcriptSubdir, onQueryProgress, }) {
    // Track subagent usage for feature discovery
    const appState = toolUseContext.getAppState();
    const permissionMode = appState.toolPermissionContext.mode;
    // Always-shared channel to the root AppState store. toolUseContext.setAppState
    // is a no-op when the *parent* is itself an async agent (nested async→async),
    // so session-scoped writes (hooks, bash tasks) must go through this instead.
    const rootSetAppState = toolUseContext.setAppStateForTasks ?? toolUseContext.setAppState;
    const resolvedAgentModel = (0, agent_js_1.getAgentModel)(agentDefinition.model, toolUseContext.options.mainLoopModel, model, permissionMode);
    const agentId = override?.agentId ? override.agentId : (0, uuid_js_1.createAgentId)();
    // Route this agent's transcript into a grouping subdirectory if requested
    // (e.g. workflow subagents write to subagents/workflows/<runId>/).
    if (transcriptSubdir) {
        (0, sessionStorage_js_1.setAgentTranscriptSubdir)(agentId, transcriptSubdir);
    }
    // Register agent in Perfetto trace for hierarchy visualization
    if ((0, perfettoTracing_js_1.isPerfettoTracingEnabled)()) {
        const parentId = toolUseContext.agentId ?? (0, state_js_1.getSessionId)();
        (0, perfettoTracing_js_1.registerAgent)(agentId, agentDefinition.agentType, parentId);
    }
    // Log API calls path for subagents (ant-only)
    if (process.env.USER_TYPE === 'ant') {
        (0, debug_js_1.logForDebugging)(`[Subagent ${agentDefinition.agentType}] API calls: ${(0, file_js_1.getDisplayPath)((0, dumpPrompts_js_1.getDumpPromptsPath)(agentId))}`);
    }
    // Handle message forking for context sharing
    // Filter out incomplete tool calls from parent messages to avoid API errors
    const contextMessages = forkContextMessages
        ? filterIncompleteToolCalls(forkContextMessages)
        : [];
    const initialMessages = [...contextMessages, ...promptMessages];
    const agentReadFileState = forkContextMessages !== undefined
        ? (0, fileStateCache_js_1.cloneFileStateCache)(toolUseContext.readFileState)
        : (0, fileStateCache_js_1.createFileStateCacheWithSizeLimit)(fileStateCache_js_1.READ_FILE_STATE_CACHE_SIZE);
    const [baseUserContext, baseSystemContext] = await Promise.all([
        override?.userContext ?? (0, context_js_1.getUserContext)(),
        override?.systemContext ?? (0, context_js_1.getSystemContext)(),
    ]);
    // Read-only agents (Explore, Plan) don't act on commit/PR/lint rules from
    // CLAUDE.md — the main agent has full context and interprets their output.
    // Dropping claudeMd here saves ~5-15 Gtok/week across 34M+ Explore spawns.
    // Explicit override.userContext from callers is preserved untouched.
    // Kill-switch defaults true; flip tengu_slim_subagent_claudemd=false to revert.
    const shouldOmitClaudeMd = agentDefinition.omitClaudeMd &&
        !override?.userContext &&
        (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_slim_subagent_claudemd', true);
    const { claudeMd: _omittedClaudeMd, ...userContextNoClaudeMd } = baseUserContext;
    const resolvedUserContext = shouldOmitClaudeMd
        ? userContextNoClaudeMd
        : baseUserContext;
    // Explore/Plan are read-only search agents — the parent-session-start
    // gitStatus (up to 40KB, explicitly labeled stale) is dead weight. If they
    // need git info they run `git status` themselves and get fresh data.
    // Saves ~1-3 Gtok/week fleet-wide.
    const { gitStatus: _omittedGitStatus, ...systemContextNoGit } = baseSystemContext;
    const resolvedSystemContext = agentDefinition.agentType === 'Explore' ||
        agentDefinition.agentType === 'Plan'
        ? systemContextNoGit
        : baseSystemContext;
    // Override permission mode if agent defines one
    // However, don't override if parent is in bypassPermissions or acceptEdits mode - those should always take precedence
    // For async agents, also set shouldAvoidPermissionPrompts since they can't show UI
    const agentPermissionMode = agentDefinition.permissionMode;
    const agentGetAppState = () => {
        const state = toolUseContext.getAppState();
        let toolPermissionContext = state.toolPermissionContext;
        // Override permission mode if agent defines one (unless parent is bypassPermissions, acceptEdits, or auto)
        if (agentPermissionMode &&
            state.toolPermissionContext.mode !== 'bypassPermissions' &&
            state.toolPermissionContext.mode !== 'acceptEdits' &&
            !((0, bun_bundle_1.feature)('TRANSCRIPT_CLASSIFIER') &&
                state.toolPermissionContext.mode === 'auto')) {
            toolPermissionContext = {
                ...toolPermissionContext,
                mode: agentPermissionMode,
            };
        }
        // Set flag to auto-deny prompts for agents that can't show UI
        // Use explicit canShowPermissionPrompts if provided, otherwise:
        //   - bubble mode: always show prompts (bubbles to parent terminal)
        //   - default: !isAsync (sync agents show prompts, async agents don't)
        const shouldAvoidPrompts = canShowPermissionPrompts !== undefined
            ? !canShowPermissionPrompts
            : agentPermissionMode === 'bubble'
                ? false
                : isAsync;
        if (shouldAvoidPrompts) {
            toolPermissionContext = {
                ...toolPermissionContext,
                shouldAvoidPermissionPrompts: true,
            };
        }
        // For background agents that can show prompts, await automated checks
        // (classifier, permission hooks) before showing the permission dialog.
        // Since these are background agents, waiting is fine — the user should
        // only be interrupted when automated checks can't resolve the permission.
        // This applies to bubble mode (always) and explicit canShowPermissionPrompts.
        if (isAsync && !shouldAvoidPrompts) {
            toolPermissionContext = {
                ...toolPermissionContext,
                awaitAutomatedChecksBeforeDialog: true,
            };
        }
        // Scope tool permissions: when allowedTools is provided, use them as session rules.
        // IMPORTANT: Preserve cliArg rules (from SDK's --allowedTools) since those are
        // explicit permissions from the SDK consumer that should apply to all agents.
        // Only clear session-level rules from the parent to prevent unintended leakage.
        if (allowedTools !== undefined) {
            toolPermissionContext = {
                ...toolPermissionContext,
                alwaysAllowRules: {
                    // Preserve SDK-level permissions from --allowedTools
                    cliArg: state.toolPermissionContext.alwaysAllowRules.cliArg,
                    // Use the provided allowedTools as session-level permissions
                    session: [...allowedTools],
                },
            };
        }
        // Override effort level if agent defines one
        const effortValue = agentDefinition.effort !== undefined
            ? agentDefinition.effort
            : state.effortValue;
        if (toolPermissionContext === state.toolPermissionContext &&
            effortValue === state.effortValue) {
            return state;
        }
        return {
            ...state,
            toolPermissionContext,
            effortValue,
        };
    };
    const resolvedTools = useExactTools
        ? availableTools
        : (0, agentToolUtils_js_1.resolveAgentTools)(agentDefinition, availableTools, isAsync).resolvedTools;
    const additionalWorkingDirectories = Array.from(appState.toolPermissionContext.additionalWorkingDirectories.keys());
    const agentSystemPrompt = override?.systemPrompt
        ? override.systemPrompt
        : (0, systemPromptType_js_1.asSystemPrompt)(await getAgentSystemPrompt(agentDefinition, toolUseContext, resolvedAgentModel, additionalWorkingDirectories, resolvedTools));
    // Determine abortController:
    // - Override takes precedence
    // - Async agents get a new unlinked controller (runs independently)
    // - Sync agents share parent's controller
    const agentAbortController = override?.abortController
        ? override.abortController
        : isAsync
            ? new AbortController()
            : toolUseContext.abortController;
    // Execute SubagentStart hooks and collect additional context
    const additionalContexts = [];
    for await (const hookResult of (0, hooks_js_1.executeSubagentStartHooks)(agentId, agentDefinition.agentType, agentAbortController.signal)) {
        if (hookResult.additionalContexts &&
            hookResult.additionalContexts.length > 0) {
            additionalContexts.push(...hookResult.additionalContexts);
        }
    }
    // Add SubagentStart hook context as a user message (consistent with SessionStart/UserPromptSubmit)
    if (additionalContexts.length > 0) {
        const contextMessage = (0, attachments_js_1.createAttachmentMessage)({
            type: 'hook_additional_context',
            content: additionalContexts,
            hookName: 'SubagentStart',
            toolUseID: (0, crypto_1.randomUUID)(),
            hookEvent: 'SubagentStart',
        });
        initialMessages.push(contextMessage);
    }
    // Register agent's frontmatter hooks (scoped to agent lifecycle)
    // Pass isAgent=true to convert Stop hooks to SubagentStop (since subagents trigger SubagentStop)
    // Same admin-trusted gate for frontmatter hooks: under ["hooks"] alone
    // (skills/agents not locked), user agents still load — block their
    // frontmatter-hook REGISTRATION here where source is known, rather than
    // blanket-blocking all session hooks at execution time (which would
    // also kill plugin agents' hooks).
    const hooksAllowedForThisAgent = !(0, pluginOnlyPolicy_js_1.isRestrictedToPluginOnly)('hooks') ||
        (0, pluginOnlyPolicy_js_1.isSourceAdminTrusted)(agentDefinition.source);
    if (agentDefinition.hooks && hooksAllowedForThisAgent) {
        (0, registerFrontmatterHooks_js_1.registerFrontmatterHooks)(rootSetAppState, agentId, agentDefinition.hooks, `agent '${agentDefinition.agentType}'`, true);
    }
    // Preload skills from agent frontmatter
    const skillsToPreload = agentDefinition.skills ?? [];
    if (skillsToPreload.length > 0) {
        const allSkills = await (0, commands_js_1.getSkillToolCommands)((0, state_js_1.getProjectRoot)());
        // Filter valid skills and warn about missing ones
        const validSkills = [];
        for (const skillName of skillsToPreload) {
            // Resolve the skill name, trying multiple strategies:
            // 1. Exact match (hasCommand checks name, userFacingName, aliases)
            // 2. Fully-qualified with agent's plugin prefix (e.g., "my-skill" → "plugin:my-skill")
            // 3. Suffix match on ":skillName" for plugin-namespaced skills
            const resolvedName = resolveSkillName(skillName, allSkills, agentDefinition);
            if (!resolvedName) {
                (0, debug_js_1.logForDebugging)(`[Agent: ${agentDefinition.agentType}] Warning: Skill '${skillName}' specified in frontmatter was not found`, { level: 'warn' });
                continue;
            }
            const skill = (0, commands_js_1.getCommand)(resolvedName, allSkills);
            if (skill.type !== 'prompt') {
                (0, debug_js_1.logForDebugging)(`[Agent: ${agentDefinition.agentType}] Warning: Skill '${skillName}' is not a prompt-based skill`, { level: 'warn' });
                continue;
            }
            validSkills.push({ skillName, skill });
        }
        // Load all skill contents concurrently and add to initial messages
        const { formatSkillLoadingMetadata } = await Promise.resolve().then(() => __importStar(require('../../utils/processUserInput/processSlashCommand.js')));
        const loaded = await Promise.all(validSkills.map(async ({ skillName, skill }) => ({
            skillName,
            skill,
            content: await skill.getPromptForCommand('', toolUseContext),
        })));
        for (const { skillName, skill, content } of loaded) {
            (0, debug_js_1.logForDebugging)(`[Agent: ${agentDefinition.agentType}] Preloaded skill '${skillName}'`);
            // Add command-message metadata so the UI shows which skill is loading
            const metadata = formatSkillLoadingMetadata(skillName, skill.progressMessage);
            initialMessages.push((0, messages_js_1.createUserMessage)({
                content: [{ type: 'text', text: metadata }, ...content],
                isMeta: true,
            }));
        }
    }
    // Initialize agent-specific MCP servers (additive to parent's servers)
    const { clients: mergedMcpClients, tools: agentMcpTools, cleanup: mcpCleanup, } = await initializeAgentMcpServers(agentDefinition, toolUseContext.options.mcpClients);
    // Merge agent MCP tools with resolved agent tools, deduplicating by name.
    // resolvedTools is already deduplicated (see resolveAgentTools), so skip
    // the spread + uniqBy overhead when there are no agent-specific MCP tools.
    const allTools = agentMcpTools.length > 0
        ? (0, uniqBy_js_1.default)([...resolvedTools, ...agentMcpTools], 'name')
        : resolvedTools;
    // Build agent-specific options
    const agentOptions = {
        isNonInteractiveSession: useExactTools
            ? toolUseContext.options.isNonInteractiveSession
            : isAsync
                ? true
                : (toolUseContext.options.isNonInteractiveSession ?? false),
        appendSystemPrompt: toolUseContext.options.appendSystemPrompt,
        tools: allTools,
        commands: [],
        debug: toolUseContext.options.debug,
        verbose: toolUseContext.options.verbose,
        mainLoopModel: resolvedAgentModel,
        // For fork children (useExactTools), inherit thinking config to match the
        // parent's API request prefix for prompt cache hits. For regular
        // sub-agents, disable thinking to control output token costs.
        thinkingConfig: useExactTools
            ? toolUseContext.options.thinkingConfig
            : { type: 'disabled' },
        mcpClients: mergedMcpClients,
        mcpResources: toolUseContext.options.mcpResources,
        agentDefinitions: toolUseContext.options.agentDefinitions,
        // Fork children (useExactTools path) need querySource on context.options
        // for the recursive-fork guard at AgentTool.tsx call() — it checks
        // options.querySource === 'agent:builtin:fork'. This survives autocompact
        // (which rewrites messages, not context.options). Without this, the guard
        // reads undefined and only the message-scan fallback fires — which
        // autocompact defeats by replacing the fork-boilerplate message.
        ...(useExactTools && { querySource }),
    };
    // Create subagent context using shared helper
    // - Sync agents share setAppState, setResponseLength, abortController with parent
    // - Async agents are fully isolated (but with explicit unlinked abortController)
    const agentToolUseContext = (0, forkedAgent_js_1.createSubagentContext)(toolUseContext, {
        options: agentOptions,
        agentId,
        agentType: agentDefinition.agentType,
        messages: initialMessages,
        readFileState: agentReadFileState,
        abortController: agentAbortController,
        getAppState: agentGetAppState,
        // Sync agents share these callbacks with parent
        shareSetAppState: !isAsync,
        shareSetResponseLength: true, // Both sync and async contribute to response metrics
        criticalSystemReminder_EXPERIMENTAL: agentDefinition.criticalSystemReminder_EXPERIMENTAL,
        contentReplacementState,
    });
    // Preserve tool use results for subagents with viewable transcripts (in-process teammates)
    if (preserveToolUseResults) {
        agentToolUseContext.preserveToolUseResults = true;
    }
    // Expose cache-safe params for background summarization (prompt cache sharing)
    if (onCacheSafeParams) {
        onCacheSafeParams({
            systemPrompt: agentSystemPrompt,
            userContext: resolvedUserContext,
            systemContext: resolvedSystemContext,
            toolUseContext: agentToolUseContext,
            forkContextMessages: initialMessages,
        });
    }
    // Record initial messages before the query loop starts, plus the agentType
    // so resume can route correctly when subagent_type is omitted. Both writes
    // are fire-and-forget — persistence failure shouldn't block the agent.
    void (0, sessionStorage_js_1.recordSidechainTranscript)(initialMessages, agentId).catch(_err => (0, debug_js_1.logForDebugging)(`Failed to record sidechain transcript: ${_err}`));
    void (0, sessionStorage_js_1.writeAgentMetadata)(agentId, {
        agentType: agentDefinition.agentType,
        ...(worktreePath && { worktreePath }),
        ...(description && { description }),
    }).catch(_err => (0, debug_js_1.logForDebugging)(`Failed to write agent metadata: ${_err}`));
    // Track the last recorded message UUID for parent chain continuity
    let lastRecordedUuid = initialMessages.at(-1)?.uuid ?? null;
    try {
        for await (const message of (0, query_js_1.query)({
            messages: initialMessages,
            systemPrompt: agentSystemPrompt,
            userContext: resolvedUserContext,
            systemContext: resolvedSystemContext,
            canUseTool,
            toolUseContext: agentToolUseContext,
            querySource,
            maxTurns: maxTurns ?? agentDefinition.maxTurns,
        })) {
            onQueryProgress?.();
            // Forward subagent API request starts to parent's metrics display
            // so TTFT/OTPS update during subagent execution.
            if (message.type === 'stream_event' &&
                message.event.type === 'message_start' &&
                message.ttftMs != null) {
                toolUseContext.pushApiMetricsEntry?.(message.ttftMs);
                continue;
            }
            // Yield attachment messages (e.g., structured_output) without recording them
            if (message.type === 'attachment') {
                // Handle max turns reached signal from query.ts
                if (message.attachment.type === 'max_turns_reached') {
                    (0, debug_js_1.logForDebugging)(`[Agent
: $
{
  agentDefinition.agentType
}
] Reached max turns limit ($
{
  message.attachment.maxTurns
}
)`);
                    break;
                }
                yield message;
                continue;
            }
            if (isRecordableMessage(message)) {
                // Record only the new message with correct parent (O(1) per message)
                await (0, sessionStorage_js_1.recordSidechainTranscript)([message], agentId, lastRecordedUuid).catch(err => (0, debug_js_1.logForDebugging)(`Failed to record sidechain transcript: ${err}`));
                if (message.type !== 'progress') {
                    lastRecordedUuid = message.uuid;
                }
                yield message;
            }
        }
        if (agentAbortController.signal.aborted) {
            throw new errors_js_1.AbortError();
        }
        // Run callback if provided (only built-in agents have callbacks)
        if ((0, loadAgentsDir_js_1.isBuiltInAgent)(agentDefinition) && agentDefinition.callback) {
            agentDefinition.callback();
        }
    }
    finally {
        // Clean up agent-specific MCP servers (runs on normal completion, abort, or error)
        await mcpCleanup();
        // Clean up agent's session hooks
        if (agentDefinition.hooks) {
            (0, sessionHooks_js_1.clearSessionHooks)(rootSetAppState, agentId);
        }
        // Clean up prompt cache tracking state for this agent
        if ((0, bun_bundle_1.feature)('PROMPT_CACHE_BREAK_DETECTION')) {
            (0, promptCacheBreakDetection_js_1.cleanupAgentTracking)(agentId);
        }
        // Release cloned file state cache memory
        agentToolUseContext.readFileState.clear();
        // Release the cloned fork context messages
        initialMessages.length = 0;
        // Release perfetto agent registry entry
        (0, perfettoTracing_js_1.unregisterAgent)(agentId);
        // Release transcript subdir mapping
        (0, sessionStorage_js_1.clearAgentTranscriptSubdir)(agentId);
        // Release this agent's todos entry. Without this, every subagent that
        // called TodoWrite leaves a key in AppState.todos forever (even after all
        // items complete, the value is [] but the key stays). Whale sessions
        // spawn hundreds of agents; each orphaned key is a small leak that adds up.
        rootSetAppState(prev => {
            if (!(agentId in prev.todos))
                return prev;
            const { [agentId]: _removed, ...todos } = prev.todos;
            return { ...prev, todos };
        });
        // Kill any background bash tasks this agent spawned. Without this, a
        // `run_in_background` shell loop (e.g. test fixture fake-logs.sh) outlives
        // the agent as a PPID=1 zombie once the main session eventually exits.
        (0, killShellTasks_js_1.killShellTasksForAgent)(agentId, toolUseContext.getAppState, rootSetAppState);
        /* eslint-disable @typescript-eslint/no-require-imports */
        if ((0, bun_bundle_1.feature)('MONITOR_TOOL')) {
            const mcpMod = require('../../tasks/MonitorMcpTask/MonitorMcpTask.js');
            mcpMod.killMonitorMcpTasksForAgent(agentId, toolUseContext.getAppState, rootSetAppState);
        }
        /* eslint-enable @typescript-eslint/no-require-imports */
    }
}
/**
 * Filters out assistant messages with incomplete tool calls (tool uses without results).
 * This prevents API errors when sending messages with orphaned tool calls.
 */
function filterIncompleteToolCalls(messages) {
    // Build a set of tool use IDs that have results
    const toolUseIdsWithResults = new Set();
    for (const message of messages) {
        if (message?.type === 'user') {
            const userMessage = message;
            const content = userMessage.message.content;
            if (Array.isArray(content)) {
                for (const block of content) {
                    if (block.type === 'tool_result' && block.tool_use_id) {
                        toolUseIdsWithResults.add(block.tool_use_id);
                    }
                }
            }
        }
    }
    // Filter out assistant messages that contain tool calls without results
    return messages.filter(message => {
        if (message?.type === 'assistant') {
            const assistantMessage = message;
            const content = assistantMessage.message.content;
            if (Array.isArray(content)) {
                // Check if this assistant message has any tool uses without results
                const hasIncompleteToolCall = content.some(block => block.type === 'tool_use' &&
                    block.id &&
                    !toolUseIdsWithResults.has(block.id));
                // Exclude messages with incomplete tool calls
                return !hasIncompleteToolCall;
            }
        }
        // Keep all non-assistant messages and assistant messages without tool calls
        return true;
    });
}
async function getAgentSystemPrompt(agentDefinition, toolUseContext, resolvedAgentModel, additionalWorkingDirectories, resolvedTools) {
    const enabledToolNames = new Set(resolvedTools.map(t => t.name));
    try {
        const agentPrompt = agentDefinition.getSystemPrompt({ toolUseContext });
        const prompts = [agentPrompt];
        return await (0, prompts_js_1.enhanceSystemPromptWithEnvDetails)(prompts, resolvedAgentModel, additionalWorkingDirectories, enabledToolNames);
    }
    catch (_error) {
        return (0, prompts_js_1.enhanceSystemPromptWithEnvDetails)([prompts_js_1.DEFAULT_AGENT_PROMPT], resolvedAgentModel, additionalWorkingDirectories, enabledToolNames);
    }
}
/**
 * Resolve a skill name from agent frontmatter to a registered command name.
 *
 * Plugin skills are registered with namespaced names (e.g., "my-plugin:my-skill")
 * but agents reference them with bare names (e.g., "my-skill"). This function
 * tries multiple resolution strategies:
 *
 * 1. Exact match via hasCommand (name, userFacingName, aliases)
 * 2. Prefix with agent's plugin name (e.g., "my-skill" → "my-plugin:my-skill")
 * 3. Suffix match — find any command whose name ends with ":skillName"
 */
function resolveSkillName(skillName, allSkills, agentDefinition) {
    // 1. Direct match
    if ((0, commands_js_1.hasCommand)(skillName, allSkills)) {
        return skillName;
    }
    // 2. Try prefixing with the agent's plugin name
    // Plugin agents have agentType like "pluginName:agentName"
    const pluginPrefix = agentDefinition.agentType.split(':')[0];
    if (pluginPrefix) {
        const qualifiedName = `${pluginPrefix}:${skillName}`;
        if ((0, commands_js_1.hasCommand)(qualifiedName, allSkills)) {
            return qualifiedName;
        }
    }
    // 3. Suffix match — find a skill whose name ends with ":skillName"
    const suffix = `:${skillName}`;
    const match = allSkills.find(cmd => cmd.name.endsWith(suffix));
    if (match) {
        return match.name;
    }
    return null;
}
