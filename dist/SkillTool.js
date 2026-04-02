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
exports.SkillTool = exports.outputSchema = exports.inputSchema = void 0;
const bun_bundle_1 = require("bun:bundle");
const uniqBy_js_1 = __importDefault(require("lodash-es/uniqBy.js"));
const path_1 = require("path");
const state_js_1 = require("src/bootstrap/state.js");
const commands_js_1 = require("src/commands.js");
const Tool_js_1 = require("src/Tool.js");
const debug_js_1 = require("src/utils/debug.js");
const permissions_js_1 = require("src/utils/permissions/permissions.js");
const pluginIdentifier_js_1 = require("src/utils/plugins/pluginIdentifier.js");
const pluginTelemetry_js_1 = require("src/utils/telemetry/pluginTelemetry.js");
const v4_1 = require("zod/v4");
const state_js_2 = require("../../bootstrap/state.js");
const xml_js_1 = require("../../constants/xml.js");
const index_js_1 = require("../../services/analytics/index.js");
const agentContext_js_1 = require("../../utils/agentContext.js");
const errors_js_1 = require("../../utils/errors.js");
const forkedAgent_js_1 = require("../../utils/forkedAgent.js");
const frontmatterParser_js_1 = require("../../utils/frontmatterParser.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const messages_js_1 = require("../../utils/messages.js");
const model_js_1 = require("../../utils/model/model.js");
const skillUsageTracking_js_1 = require("../../utils/suggestions/skillUsageTracking.js");
const uuid_js_1 = require("../../utils/uuid.js");
const runAgent_js_1 = require("../AgentTool/runAgent.js");
const utils_js_1 = require("../utils.js");
const constants_js_1 = require("./constants.js");
const prompt_js_1 = require("./prompt.js");
const UI_js_1 = require("./UI.js");
/**
 * Gets all commands including MCP skills/prompts from AppState.
 * SkillTool needs this because getCommands() only returns local/bundled skills.
 */
async function getAllCommands(context) {
    // Only include MCP skills (loadedFrom === 'mcp'), not plain MCP prompts.
    // Before this filter, the model could invoke MCP prompts via SkillTool
    // if it guessed the mcp__server__prompt name — they weren't discoverable
    // but were technically reachable.
    const mcpSkills = context
        .getAppState()
        .mcp.commands.filter(cmd => cmd.type === 'prompt' && cmd.loadedFrom === 'mcp');
    if (mcpSkills.length === 0)
        return (0, commands_js_1.getCommands)((0, state_js_1.getProjectRoot)());
    const localCommands = await (0, commands_js_1.getCommands)((0, state_js_1.getProjectRoot)());
    return (0, uniqBy_js_1.default)([...localCommands, ...mcpSkills], 'name');
}
// Conditional require for remote skill modules — static imports here would
// pull in akiBackend.ts (via remoteSkillLoader → akiBackend), which has
// module-level memoize()/lazySchema() consts that survive tree-shaking as
// side-effecting initializers. All usages are inside
// feature('EXPERIMENTAL_SKILL_SEARCH') guards, so remoteSkillModules is
// non-null at every call site.
/* eslint-disable @typescript-eslint/no-require-imports */
const remoteSkillModules = (0, bun_bundle_1.feature)('EXPERIMENTAL_SKILL_SEARCH')
    ? {
        ...require('../../services/skillSearch/remoteSkillState.js'),
        ...require('../../services/skillSearch/remoteSkillLoader.js'),
        ...require('../../services/skillSearch/telemetry.js'),
        ...require('../../services/skillSearch/featureCheck.js'),
    }
    : null;
/* eslint-enable @typescript-eslint/no-require-imports */
/**
 * Executes a skill in a forked sub-agent context.
 * This runs the skill prompt in an isolated agent with its own token budget.
 */
async function executeForkedSkill(command, commandName, args, context, canUseTool, parentMessage, onProgress) {
    const startTime = Date.now();
    const agentId = (0, uuid_js_1.createAgentId)();
    const isBuiltIn = (0, commands_js_1.builtInCommandNames)().has(commandName);
    const isOfficialSkill = isOfficialMarketplaceSkill(command);
    const isBundled = command.source === 'bundled';
    const forkedSanitizedName = isBuiltIn || isBundled || isOfficialSkill ? commandName : 'custom';
    const wasDiscoveredField = (0, bun_bundle_1.feature)('EXPERIMENTAL_SKILL_SEARCH') &&
        remoteSkillModules.isSkillSearchEnabled()
        ? {
            was_discovered: context.discoveredSkillNames?.has(commandName) ?? false,
        }
        : {};
    const pluginMarketplace = command.pluginInfo
        ? (0, pluginIdentifier_js_1.parsePluginIdentifier)(command.pluginInfo.repository).marketplace
        : undefined;
    const queryDepth = context.queryTracking?.depth ?? 0;
    const parentAgentId = (0, agentContext_js_1.getAgentContext)()?.agentId;
    (0, index_js_1.logEvent)('tengu_skill_tool_invocation', {
        command_name: forkedSanitizedName,
        // _PROTO_skill_name routes to the privileged skill_name BQ column
        // (unredacted, all users); command_name stays in additional_metadata as
        // the redacted variant for general-access dashboards.
        _PROTO_skill_name: commandName,
        execution_context: 'fork',
        invocation_trigger: (queryDepth > 0
            ? 'nested-skill'
            : 'claude-proactive'),
        query_depth: queryDepth,
        ...(parentAgentId && {
            parent_agent_id: parentAgentId,
        }),
        ...wasDiscoveredField,
        ...(process.env.USER_TYPE === 'ant' && {
            skill_name: commandName,
            skill_source: command.source,
            ...(command.loadedFrom && {
                skill_loaded_from: command.loadedFrom,
            }),
            ...(command.kind && {
                skill_kind: command.kind,
            }),
        }),
        ...(command.pluginInfo && {
            // _PROTO_* routes to PII-tagged plugin_name/marketplace_name BQ columns
            // (unredacted, all users); plugin_name/plugin_repository stay in
            // additional_metadata as redacted variants.
            _PROTO_plugin_name: command.pluginInfo.pluginManifest
                .name,
            ...(pluginMarketplace && {
                _PROTO_marketplace_name: pluginMarketplace,
            }),
            plugin_name: (isOfficialSkill
                ? command.pluginInfo.pluginManifest.name
                : 'third-party'),
            plugin_repository: (isOfficialSkill
                ? command.pluginInfo.repository
                : 'third-party'),
            ...(0, pluginTelemetry_js_1.buildPluginCommandTelemetryFields)(command.pluginInfo),
        }),
    });
    const { modifiedGetAppState, baseAgent, promptMessages, skillContent } = await (0, forkedAgent_js_1.prepareForkedCommandContext)(command, args || '', context);
    // Merge skill's effort into the agent definition so runAgent applies it
    const agentDefinition = command.effort !== undefined
        ? { ...baseAgent, effort: command.effort }
        : baseAgent;
    // Collect messages from the forked agent
    const agentMessages = [];
    (0, debug_js_1.logForDebugging)(`SkillTool executing forked skill ${commandName} with agent ${agentDefinition.agentType}`);
    try {
        // Run the sub-agent
        for await (const message of (0, runAgent_js_1.runAgent)({
            agentDefinition,
            promptMessages,
            toolUseContext: {
                ...context,
                getAppState: modifiedGetAppState,
            },
            canUseTool,
            isAsync: false,
            querySource: 'agent:custom',
            model: command.model,
            availableTools: context.options.tools,
            override: { agentId },
        })) {
            agentMessages.push(message);
            // Report progress for tool uses (like AgentTool does)
            if ((message.type === 'assistant' || message.type === 'user') &&
                onProgress) {
                const normalizedNew = (0, messages_js_1.normalizeMessages)([message]);
                for (const m of normalizedNew) {
                    const hasToolContent = m.message.content.some(c => c.type === 'tool_use' || c.type === 'tool_result');
                    if (hasToolContent) {
                        onProgress({
                            toolUseID: `skill_${parentMessage.message.id}`,
                            data: {
                                message: m,
                                type: 'skill_progress',
                                prompt: skillContent,
                                agentId,
                            },
                        });
                    }
                }
            }
        }
        const resultText = (0, forkedAgent_js_1.extractResultText)(agentMessages, 'Skill execution completed');
        // Release message memory after extracting result
        agentMessages.length = 0;
        const durationMs = Date.now() - startTime;
        (0, debug_js_1.logForDebugging)(`SkillTool forked skill ${commandName} completed in ${durationMs}ms`);
        return {
            data: {
                success: true,
                commandName,
                status: 'forked',
                agentId,
                result: resultText,
            },
        };
    }
    finally {
        // Release skill content from invokedSkills state
        (0, state_js_2.clearInvokedSkillsForAgent)(agentId);
    }
}
exports.inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    skill: v4_1.z
        .string()
        .describe('The skill name. E.g., "commit", "review-pr", or "pdf"'),
    args: v4_1.z.string().optional().describe('Optional arguments for the skill'),
}));
exports.outputSchema = (0, lazySchema_js_1.lazySchema)(() => {
    // Output schema for inline skills (default)
    const inlineOutputSchema = v4_1.z.object({
        success: v4_1.z.boolean().describe('Whether the skill is valid'),
        commandName: v4_1.z.string().describe('The name of the skill'),
        allowedTools: v4_1.z
            .array(v4_1.z.string())
            .optional()
            .describe('Tools allowed by this skill'),
        model: v4_1.z.string().optional().describe('Model override if specified'),
        status: v4_1.z.literal('inline').optional().describe('Execution status'),
    });
    // Output schema for forked skills
    const forkedOutputSchema = v4_1.z.object({
        success: v4_1.z.boolean().describe('Whether the skill completed successfully'),
        commandName: v4_1.z.string().describe('The name of the skill'),
        status: v4_1.z.literal('forked').describe('Execution status'),
        agentId: v4_1.z
            .string()
            .describe('The ID of the sub-agent that executed the skill'),
        result: v4_1.z.string().describe('The result from the forked skill execution'),
    });
    return v4_1.z.union([inlineOutputSchema, forkedOutputSchema]);
});
exports.SkillTool = (0, Tool_js_1.buildTool)({
    name: constants_js_1.SKILL_TOOL_NAME,
    searchHint: 'invoke a slash-command skill',
    maxResultSizeChars: 100000,
    get inputSchema() {
        return (0, exports.inputSchema)();
    },
    get outputSchema() {
        return (0, exports.outputSchema)();
    },
    description: async ({ skill }) => `Execute skill: ${skill}`,
    prompt: async () => (0, prompt_js_1.getPrompt)((0, state_js_1.getProjectRoot)()),
    // Only one skill/command should run at a time, since the tool expands the
    // command into a full prompt that Claude must process before continuing.
    // Skill-coach needs the skill name to avoid false-positive "you could have
    // used skill X" suggestions when X was actually invoked. Backseat classifies
    // downstream tool calls from the expanded prompt, not this wrapper, so the
    // name alone is sufficient — it just records that the skill fired.
    toAutoClassifierInput: ({ skill }) => skill ?? '',
    async validateInput({ skill }, context) {
        // Skills are just skill names, no arguments
        const trimmed = skill.trim();
        if (!trimmed) {
            return {
                result: false,
                message: `Invalid skill format: ${skill}`,
                errorCode: 1,
            };
        }
        // Remove leading slash if present (for compatibility)
        const hasLeadingSlash = trimmed.startsWith('/');
        if (hasLeadingSlash) {
            (0, index_js_1.logEvent)('tengu_skill_tool_slash_prefix', {});
        }
        const normalizedCommandName = hasLeadingSlash
            ? trimmed.substring(1)
            : trimmed;
        // Remote canonical skill handling (ant-only experimental). Intercept
        // `_canonical_<slug>` names before local command lookup since remote
        // skills are not in the local command registry.
        if ((0, bun_bundle_1.feature)('EXPERIMENTAL_SKILL_SEARCH') &&
            process.env.USER_TYPE === 'ant') {
            const slug = remoteSkillModules.stripCanonicalPrefix(normalizedCommandName);
            if (slug !== null) {
                const meta = remoteSkillModules.getDiscoveredRemoteSkill(slug);
                if (!meta) {
                    return {
                        result: false,
                        message: `Remote skill ${slug} was not discovered in this session. Use DiscoverSkills to find remote skills first.`,
                        errorCode: 6,
                    };
                }
                // Discovered remote skill — valid. Loading happens in call().
                return { result: true };
            }
        }
        // Get available commands (including MCP skills)
        const commands = await getAllCommands(context);
        // Check if command exists
        const foundCommand = (0, commands_js_1.findCommand)(normalizedCommandName, commands);
        if (!foundCommand) {
            return {
                result: false,
                message: `Unknown skill: ${normalizedCommandName}`,
                errorCode: 2,
            };
        }
        // Check if command has model invocation disabled
        if (foundCommand.disableModelInvocation) {
            return {
                result: false,
                message: `Skill ${normalizedCommandName} cannot be used with ${constants_js_1.SKILL_TOOL_NAME} tool due to disable-model-invocation`,
                errorCode: 4,
            };
        }
        // Check if command is a prompt-based command
        if (foundCommand.type !== 'prompt') {
            return {
                result: false,
                message: `Skill ${normalizedCommandName} is not a prompt-based skill`,
                errorCode: 5,
            };
        }
        return { result: true };
    },
    async checkPermissions({ skill, args }, context) {
        // Skills are just skill names, no arguments
        const trimmed = skill.trim();
        // Remove leading slash if present (for compatibility)
        const commandName = trimmed.startsWith('/') ? trimmed.substring(1) : trimmed;
        const appState = context.getAppState();
        const permissionContext = appState.toolPermissionContext;
        // Look up the command object to pass as metadata
        const commands = await getAllCommands(context);
        const commandObj = (0, commands_js_1.findCommand)(commandName, commands);
        // Helper function to check if a rule matches the skill
        // Normalizes both inputs by stripping leading slashes for consistent matching
        const ruleMatches = (ruleContent) => {
            // Normalize rule content by stripping leading slash
            const normalizedRule = ruleContent.startsWith('/')
                ? ruleContent.substring(1)
                : ruleContent;
            // Check exact match (using normalized commandName)
            if (normalizedRule === commandName) {
                return true;
            }
            // Check prefix match (e.g., "review:*" matches "review-pr 123")
            if (normalizedRule.endsWith(':*')) {
                const prefix = normalizedRule.slice(0, -2); // Remove ':*'
                return commandName.startsWith(prefix);
            }
            return false;
        };
        // Check for deny rules
        const denyRules = (0, permissions_js_1.getRuleByContentsForTool)(permissionContext, exports.SkillTool, 'deny');
        for (const [ruleContent, rule] of denyRules.entries()) {
            if (ruleMatches(ruleContent)) {
                return {
                    behavior: 'deny',
                    message: `Skill execution blocked by permission rules`,
                    decisionReason: {
                        type: 'rule',
                        rule,
                    },
                };
            }
        }
        // Remote canonical skills are ant-only experimental — auto-grant.
        // Placed AFTER the deny loop so a user-configured Skill(_canonical_:*)
        // deny rule is honored (same pattern as safe-properties auto-allow below).
        // The skill content itself is canonical/curated, not user-authored.
        if ((0, bun_bundle_1.feature)('EXPERIMENTAL_SKILL_SEARCH') &&
            process.env.USER_TYPE === 'ant') {
            const slug = remoteSkillModules.stripCanonicalPrefix(commandName);
            if (slug !== null) {
                return {
                    behavior: 'allow',
                    updatedInput: { skill, args },
                    decisionReason: undefined,
                };
            }
        }
        // Check for allow rules
        const allowRules = (0, permissions_js_1.getRuleByContentsForTool)(permissionContext, exports.SkillTool, 'allow');
        for (const [ruleContent, rule] of allowRules.entries()) {
            if (ruleMatches(ruleContent)) {
                return {
                    behavior: 'allow',
                    updatedInput: { skill, args },
                    decisionReason: {
                        type: 'rule',
                        rule,
                    },
                };
            }
        }
        // Auto-allow skills that only use safe properties.
        // This is an allowlist: if a skill has any property NOT in this set with a
        // meaningful value, it requires permission. This ensures new properties added
        // in the future default to requiring permission.
        if (commandObj?.type === 'prompt' &&
            skillHasOnlySafeProperties(commandObj)) {
            return {
                behavior: 'allow',
                updatedInput: { skill, args },
                decisionReason: undefined,
            };
        }
        // Prepare suggestions for exact skill and prefix
        // Use normalized commandName (without leading slash) for consistent rules
        const suggestions = [
            // Exact skill suggestion
            {
                type: 'addRules',
                rules: [
                    {
                        toolName: constants_js_1.SKILL_TOOL_NAME,
                        ruleContent: commandName,
                    },
                ],
                behavior: 'allow',
                destination: 'localSettings',
            },
            // Prefix suggestion to allow any args
            {
                type: 'addRules',
                rules: [
                    {
                        toolName: constants_js_1.SKILL_TOOL_NAME,
                        ruleContent: `${commandName}:*`,
                    },
                ],
                behavior: 'allow',
                destination: 'localSettings',
            },
        ];
        // Default behavior: ask user for permission
        return {
            behavior: 'ask',
            message: `Execute skill: ${commandName}`,
            decisionReason: undefined,
            suggestions,
            updatedInput: { skill, args },
            metadata: commandObj ? { command: commandObj } : undefined,
        };
    },
    async call({ skill, args }, context, canUseTool, parentMessage, onProgress) {
        // At this point, validateInput has already confirmed:
        // - Skill format is valid
        // - Skill exists
        // - Skill can be loaded
        // - Skill doesn't have disableModelInvocation
        // - Skill is a prompt-based skill
        // Skills are just names, with optional arguments
        const trimmed = skill.trim();
        // Remove leading slash if present (for compatibility)
        const commandName = trimmed.startsWith('/') ? trimmed.substring(1) : trimmed;
        // Remote canonical skill execution (ant-only experimental). Intercepts
        // `_canonical_<slug>` before local command lookup — loads SKILL.md from
        // AKI/GCS (with local cache), injects content directly as a user message.
        // Remote skills are declarative markdown so no slash-command expansion
        // (no !command substitution, no $ARGUMENTS interpolation) is needed.
        if ((0, bun_bundle_1.feature)('EXPERIMENTAL_SKILL_SEARCH') &&
            process.env.USER_TYPE === 'ant') {
            const slug = remoteSkillModules.stripCanonicalPrefix(commandName);
            if (slug !== null) {
                return executeRemoteSkill(slug, commandName, parentMessage, context);
            }
        }
        const commands = await getAllCommands(context);
        const command = (0, commands_js_1.findCommand)(commandName, commands);
        // Track skill usage for ranking
        (0, skillUsageTracking_js_1.recordSkillUsage)(commandName);
        // Check if skill should run as a forked sub-agent
        if (command?.type === 'prompt' && command.context === 'fork') {
            return executeForkedSkill(command, commandName, args, context, canUseTool, parentMessage, onProgress);
        }
        // Process the skill with optional args
        const { processPromptSlashCommand } = await Promise.resolve().then(() => __importStar(require('src/utils/processUserInput/processSlashCommand.js')));
        const processedCommand = await processPromptSlashCommand(commandName, args || '', // Pass args if provided
        commands, context);
        if (!processedCommand.shouldQuery) {
            throw new Error('Command processing failed');
        }
        // Extract metadata from the command
        const allowedTools = processedCommand.allowedTools || [];
        const model = processedCommand.model;
        const effort = command?.type === 'prompt' ? command.effort : undefined;
        const isBuiltIn = (0, commands_js_1.builtInCommandNames)().has(commandName);
        const isBundled = command?.type === 'prompt' && command.source === 'bundled';
        const isOfficialSkill = command?.type === 'prompt' && isOfficialMarketplaceSkill(command);
        const sanitizedCommandName = isBuiltIn || isBundled || isOfficialSkill ? commandName : 'custom';
        const wasDiscoveredField = (0, bun_bundle_1.feature)('EXPERIMENTAL_SKILL_SEARCH') &&
            remoteSkillModules.isSkillSearchEnabled()
            ? {
                was_discovered: context.discoveredSkillNames?.has(commandName) ?? false,
            }
            : {};
        const pluginMarketplace = command?.type === 'prompt' && command.pluginInfo
            ? (0, pluginIdentifier_js_1.parsePluginIdentifier)(command.pluginInfo.repository).marketplace
            : undefined;
        const queryDepth = context.queryTracking?.depth ?? 0;
        const parentAgentId = (0, agentContext_js_1.getAgentContext)()?.agentId;
        (0, index_js_1.logEvent)('tengu_skill_tool_invocation', {
            command_name: sanitizedCommandName,
            // _PROTO_skill_name routes to the privileged skill_name BQ column
            // (unredacted, all users); command_name stays in additional_metadata as
            // the redacted variant for general-access dashboards.
            _PROTO_skill_name: commandName,
            execution_context: 'inline',
            invocation_trigger: (queryDepth > 0
                ? 'nested-skill'
                : 'claude-proactive'),
            query_depth: queryDepth,
            ...(parentAgentId && {
                parent_agent_id: parentAgentId,
            }),
            ...wasDiscoveredField,
            ...(process.env.USER_TYPE === 'ant' && {
                skill_name: commandName,
                ...(command?.type === 'prompt' && {
                    skill_source: command.source,
                }),
                ...(command?.loadedFrom && {
                    skill_loaded_from: command.loadedFrom,
                }),
                ...(command?.kind && {
                    skill_kind: command.kind,
                }),
            }),
            ...(command?.type === 'prompt' &&
                command.pluginInfo && {
                _PROTO_plugin_name: command.pluginInfo.pluginManifest
                    .name,
                ...(pluginMarketplace && {
                    _PROTO_marketplace_name: pluginMarketplace,
                }),
                plugin_name: (isOfficialSkill
                    ? command.pluginInfo.pluginManifest.name
                    : 'third-party'),
                plugin_repository: (isOfficialSkill
                    ? command.pluginInfo.repository
                    : 'third-party'),
                ...(0, pluginTelemetry_js_1.buildPluginCommandTelemetryFields)(command.pluginInfo),
            }),
        });
        // Get the tool use ID from the parent message for linking newMessages
        const toolUseID = (0, utils_js_1.getToolUseIDFromParentMessage)(parentMessage, constants_js_1.SKILL_TOOL_NAME);
        // Tag user messages with sourceToolUseID so they stay transient until this tool resolves
        const newMessages = (0, utils_js_1.tagMessagesWithToolUseID)(processedCommand.messages.filter((m) => {
            if (m.type === 'progress') {
                return false;
            }
            // Filter out command-message since SkillTool handles display
            if (m.type === 'user' && 'message' in m) {
                const content = m.message.content;
                if (typeof content === 'string' &&
                    content.includes(`<${xml_js_1.COMMAND_MESSAGE_TAG}>`)) {
                    return false;
                }
            }
            return true;
        }), toolUseID);
        (0, debug_js_1.logForDebugging)(`SkillTool returning ${newMessages.length} newMessages for skill ${commandName}`);
        // Note: addInvokedSkill and registerSkillHooks are called inside
        // processPromptSlashCommand (via getMessagesForPromptSlashCommand), so
        // calling them again here would double-register hooks and rebuild
        // skillContent redundantly.
        // Return success with newMessages and contextModifier
        return {
            data: {
                success: true,
                commandName,
                allowedTools: allowedTools.length > 0 ? allowedTools : undefined,
                model,
            },
            newMessages,
            contextModifier(ctx) {
                let modifiedContext = ctx;
                // Update allowed tools if specified
                if (allowedTools.length > 0) {
                    // Capture the current getAppState to chain modifications properly
                    const previousGetAppState = modifiedContext.getAppState;
                    modifiedContext = {
                        ...modifiedContext,
                        getAppState() {
                            // Use the previous getAppState, not the closure's context.getAppState,
                            // to properly chain context modifications
                            const appState = previousGetAppState();
                            return {
                                ...appState,
                                toolPermissionContext: {
                                    ...appState.toolPermissionContext,
                                    alwaysAllowRules: {
                                        ...appState.toolPermissionContext.alwaysAllowRules,
                                        command: [
                                            ...new Set([
                                                ...(appState.toolPermissionContext.alwaysAllowRules
                                                    .command || []),
                                                ...allowedTools,
                                            ]),
                                        ],
                                    },
                                },
                            };
                        },
                    };
                }
                // Carry [1m] suffix over — otherwise a skill with `model: opus` on an
                // opus[1m] session drops the effective window to 200K and trips autocompact.
                if (model) {
                    modifiedContext = {
                        ...modifiedContext,
                        options: {
                            ...modifiedContext.options,
                            mainLoopModel: (0, model_js_1.resolveSkillModelOverride)(model, ctx.options.mainLoopModel),
                        },
                    };
                }
                // Override effort level if skill specifies one
                if (effort !== undefined) {
                    const previousGetAppState = modifiedContext.getAppState;
                    modifiedContext = {
                        ...modifiedContext,
                        getAppState() {
                            const appState = previousGetAppState();
                            return {
                                ...appState,
                                effortValue: effort,
                            };
                        },
                    };
                }
                return modifiedContext;
            },
        };
    },
    mapToolResultToToolResultBlockParam(result, toolUseID) {
        // Handle forked skill result
        if ('status' in result && result.status === 'forked') {
            return {
                type: 'tool_result',
                tool_use_id: toolUseID,
                content: `Skill "${result.commandName}" completed (forked execution).\n\nResult:\n${result.result}`,
            };
        }
        // Inline skill result (default)
        return {
            type: 'tool_result',
            tool_use_id: toolUseID,
            content: `Launching skill: ${result.commandName}`,
        };
    },
    renderToolResultMessage: UI_js_1.renderToolResultMessage,
    renderToolUseMessage: UI_js_1.renderToolUseMessage,
    renderToolUseProgressMessage: UI_js_1.renderToolUseProgressMessage,
    renderToolUseRejectedMessage: UI_js_1.renderToolUseRejectedMessage,
    renderToolUseErrorMessage: UI_js_1.renderToolUseErrorMessage,
});
// Allowlist of PromptCommand property keys that are safe and don't require permission.
// If a skill has any property NOT in this set with a meaningful value, it requires
// permission. This ensures new properties added to PromptCommand in the future
// default to requiring permission until explicitly reviewed and added here.
const SAFE_SKILL_PROPERTIES = new Set([
    // PromptCommand properties
    'type',
    'progressMessage',
    'contentLength',
    'argNames',
    'model',
    'effort',
    'source',
    'pluginInfo',
    'disableNonInteractive',
    'skillRoot',
    'context',
    'agent',
    'getPromptForCommand',
    'frontmatterKeys',
    // CommandBase properties
    'name',
    'description',
    'hasUserSpecifiedDescription',
    'isEnabled',
    'isHidden',
    'aliases',
    'isMcp',
    'argumentHint',
    'whenToUse',
    'paths',
    'version',
    'disableModelInvocation',
    'userInvocable',
    'loadedFrom',
    'immediate',
    'userFacingName',
]);
function skillHasOnlySafeProperties(command) {
    for (const key of Object.keys(command)) {
        if (SAFE_SKILL_PROPERTIES.has(key)) {
            continue;
        }
        // Property not in safe allowlist - check if it has a meaningful value
        const value = command[key];
        if (value === undefined || value === null) {
            continue;
        }
        if (Array.isArray(value) && value.length === 0) {
            continue;
        }
        if (typeof value === 'object' &&
            !Array.isArray(value) &&
            Object.keys(value).length === 0) {
            continue;
        }
        return false;
    }
    return true;
}
function isOfficialMarketplaceSkill(command) {
    if (command.source !== 'plugin' || !command.pluginInfo?.repository) {
        return false;
    }
    return (0, pluginIdentifier_js_1.isOfficialMarketplaceName)((0, pluginIdentifier_js_1.parsePluginIdentifier)(command.pluginInfo.repository).marketplace);
}
/**
 * Extract URL scheme for telemetry. Defaults to 'gs' for unrecognized schemes
 * since the AKI backend is the only production path and the loader throws on
 * unknown schemes before we reach telemetry anyway.
 */
function extractUrlScheme(url) {
    if (url.startsWith('gs://'))
        return 'gs';
    if (url.startsWith('https://'))
        return 'https';
    if (url.startsWith('http://'))
        return 'http';
    if (url.startsWith('s3://'))
        return 's3';
    return 'gs';
}
/**
 * Load a remote canonical skill and inject its SKILL.md content into the
 * conversation. Unlike local skills (which go through processPromptSlashCommand
 * for !command / $ARGUMENTS expansion), remote skills are declarative markdown
 * — we wrap the content directly in a user message.
 *
 * The skill is also registered with addInvokedSkill so it survives compaction
 * (same as local skills).
 *
 * Only called from within a feature('EXPERIMENTAL_SKILL_SEARCH') guard in
 * call() — remoteSkillModules is non-null here.
 */
async function executeRemoteSkill(slug, commandName, parentMessage, context) {
    const { getDiscoveredRemoteSkill, loadRemoteSkill, logRemoteSkillLoaded } = remoteSkillModules;
    // validateInput already confirmed this slug is in session state, but we
    // re-fetch here to get the URL. If it's somehow gone (e.g., state cleared
    // mid-session), fail with a clear error rather than crashing.
    const meta = getDiscoveredRemoteSkill(slug);
    if (!meta) {
        throw new Error(`Remote skill ${slug} was not discovered in this session. Use DiscoverSkills to find remote skills first.`);
    }
    const urlScheme = extractUrlScheme(meta.url);
    let loadResult;
    try {
        loadResult = await loadRemoteSkill(slug, meta.url);
    }
    catch (e) {
        const msg = (0, errors_js_1.errorMessage)(e);
        logRemoteSkillLoaded({
            slug,
            cacheHit: false,
            latencyMs: 0,
            urlScheme,
            error: msg,
        });
        throw new Error(`Failed to load remote skill ${slug}: ${msg}`);
    }
    const { cacheHit, latencyMs, skillPath, content, fileCount, totalBytes, fetchMethod, } = loadResult;
    logRemoteSkillLoaded({
        slug,
        cacheHit,
        latencyMs,
        urlScheme,
        fileCount,
        totalBytes,
        fetchMethod,
    });
    // Remote skills are always model-discovered (never in static skill_listing),
    // so was_discovered is always true. is_remote lets BQ queries separate
    // remote from local invocations without joining on skill name prefixes.
    const queryDepth = context.queryTracking?.depth ?? 0;
    const parentAgentId = (0, agentContext_js_1.getAgentContext)()?.agentId;
    (0, index_js_1.logEvent)('tengu_skill_tool_invocation', {
        command_name: 'remote_skill',
        // _PROTO_skill_name routes to the privileged skill_name BQ column
        // (unredacted, all users); command_name stays in additional_metadata as
        // the redacted variant.
        _PROTO_skill_name: commandName,
        execution_context: 'remote',
        invocation_trigger: (queryDepth > 0
            ? 'nested-skill'
            : 'claude-proactive'),
        query_depth: queryDepth,
        ...(parentAgentId && {
            parent_agent_id: parentAgentId,
        }),
        was_discovered: true,
        is_remote: true,
        remote_cache_hit: cacheHit,
        remote_load_latency_ms: latencyMs,
        ...(process.env.USER_TYPE === 'ant' && {
            skill_name: commandName,
            remote_slug: slug,
        }),
    });
    (0, skillUsageTracking_js_1.recordSkillUsage)(commandName);
    (0, debug_js_1.logForDebugging)(`SkillTool loaded remote skill ${slug} (cacheHit=${cacheHit}, ${latencyMs}ms, ${content.length} chars)`);
    // Strip YAML frontmatter (---\nname: x\n---) before prepending the header
    // (matches loadSkillsDir.ts:333). parseFrontmatter returns the original
    // content unchanged if no frontmatter is present.
    const { content: bodyContent } = (0, frontmatterParser_js_1.parseFrontmatter)(content, skillPath);
    // Inject base directory header + ${CLAUDE_SKILL_DIR}/${CLAUDE_SESSION_ID}
    // substitution (matches loadSkillsDir.ts) so the model can resolve relative
    // refs like ./schemas/foo.json against the cache dir.
    const skillDir = (0, path_1.dirname)(skillPath);
    const normalizedDir = process.platform === 'win32' ? skillDir.replace(/\\/g, '/') : skillDir;
    let finalContent = `Base directory for this skill: ${normalizedDir}\n\n${bodyContent}`;
    finalContent = finalContent.replace(/\$\{CLAUDE_SKILL_DIR\}/g, normalizedDir);
    finalContent = finalContent.replace(/\$\{CLAUDE_SESSION_ID\}/g, (0, state_js_2.getSessionId)());
    // Register with compaction-preservation state. Use the cached file path so
    // post-compact restoration knows where the content came from. Must use
    // finalContent (not raw content) so the base directory header and
    // ${CLAUDE_SKILL_DIR} substitutions survive compaction — matches how local
    // skills store their already-transformed content via processSlashCommand.
    (0, state_js_2.addInvokedSkill)(commandName, skillPath, finalContent, (0, agentContext_js_1.getAgentContext)()?.agentId ?? null);
    // Direct injection — wrap SKILL.md content in a meta user message. Matches
    // the shape of what processPromptSlashCommand produces for simple skills.
    const toolUseID = (0, utils_js_1.getToolUseIDFromParentMessage)(parentMessage, constants_js_1.SKILL_TOOL_NAME);
    return {
        data: { success: true, commandName, status: 'inline' },
        newMessages: (0, utils_js_1.tagMessagesWithToolUseID)([(0, messages_js_1.createUserMessage)({ content: finalContent, isMeta: true })], toolUseID),
    };
}
