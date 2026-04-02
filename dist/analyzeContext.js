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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOL_TOKEN_COUNT_OVERHEAD = void 0;
exports.countToolDefinitionTokens = countToolDefinitionTokens;
exports.countMcpToolTokens = countMcpToolTokens;
exports.analyzeContextUsage = analyzeContextUsage;
const bun_bundle_1 = require("bun:bundle");
const prompts_js_1 = require("src/constants/prompts.js");
const microCompact_js_1 = require("src/services/compact/microCompact.js");
const state_js_1 = require("../bootstrap/state.js");
const commands_js_1 = require("../commands.js");
const context_js_1 = require("../context.js");
const growthbook_js_1 = require("../services/analytics/growthbook.js");
const autoCompact_js_1 = require("../services/compact/autoCompact.js");
const tokenEstimation_js_1 = require("../services/tokenEstimation.js");
const loadSkillsDir_js_1 = require("../skills/loadSkillsDir.js");
const Tool_js_1 = require("../Tool.js");
const constants_js_1 = require("../tools/SkillTool/constants.js");
const prompt_js_1 = require("../tools/SkillTool/prompt.js");
const api_js_1 = require("./api.js");
const claudemd_js_1 = require("./claudemd.js");
const context_js_2 = require("./context.js");
const cwd_js_1 = require("./cwd.js");
const debug_js_1 = require("./debug.js");
const envUtils_js_1 = require("./envUtils.js");
const errors_js_1 = require("./errors.js");
const log_js_1 = require("./log.js");
const messages_js_1 = require("./messages.js");
const model_js_1 = require("./model/model.js");
const slowOperations_js_1 = require("./slowOperations.js");
const systemPrompt_js_1 = require("./systemPrompt.js");
const tokens_js_1 = require("./tokens.js");
const RESERVED_CATEGORY_NAME = 'Autocompact buffer';
const MANUAL_COMPACT_BUFFER_NAME = 'Compact buffer';
/**
 * Fixed token overhead added by the API when tools are present.
 * The API adds a tool prompt preamble (~500 tokens) once per API call when tools are present.
 * When we count tools individually via the token counting API, each call includes this overhead,
 * leading to N × overhead instead of 1 × overhead for N tools.
 * We subtract this overhead from per-tool counts to show accurate tool content sizes.
 */
exports.TOOL_TOKEN_COUNT_OVERHEAD = 500;
async function countTokensWithFallback(messages, tools) {
    try {
        const result = await (0, tokenEstimation_js_1.countMessagesTokensWithAPI)(messages, tools);
        if (result !== null) {
            return result;
        }
        (0, debug_js_1.logForDebugging)(`countTokensWithFallback: API returned null, trying haiku fallback (${tools.length} tools)`);
    }
    catch (err) {
        (0, debug_js_1.logForDebugging)(`countTokensWithFallback: API failed: ${(0, errors_js_1.errorMessage)(err)}`);
        (0, log_js_1.logError)(err);
    }
    try {
        const fallbackResult = await (0, tokenEstimation_js_1.countTokensViaHaikuFallback)(messages, tools);
        if (fallbackResult === null) {
            (0, debug_js_1.logForDebugging)(`countTokensWithFallback: haiku fallback also returned null (${tools.length} tools)`);
        }
        return fallbackResult;
    }
    catch (err) {
        (0, debug_js_1.logForDebugging)(`countTokensWithFallback: haiku fallback failed: ${(0, errors_js_1.errorMessage)(err)}`);
        (0, log_js_1.logError)(err);
        return null;
    }
}
async function countToolDefinitionTokens(tools, getToolPermissionContext, agentInfo, model) {
    const toolSchemas = await Promise.all(tools.map(tool => (0, api_js_1.toolToAPISchema)(tool, {
        getToolPermissionContext,
        tools,
        agents: agentInfo?.activeAgents ?? [],
        model,
    })));
    const result = await countTokensWithFallback([], toolSchemas);
    if (result === null || result === 0) {
        const toolNames = tools.map(t => t.name).join(', ');
        (0, debug_js_1.logForDebugging)(`countToolDefinitionTokens returned ${result} for ${tools.length} tools: ${toolNames.slice(0, 100)}${toolNames.length > 100 ? '...' : ''}`);
    }
    return result ?? 0;
}
/** Extract a human-readable name from a system prompt section's content */
function extractSectionName(content) {
    // Try to find first markdown heading
    const headingMatch = content.match(/^#+\s+(.+)$/m);
    if (headingMatch) {
        return headingMatch[1].trim();
    }
    // Fall back to a truncated preview of the first non-empty line
    const firstLine = content.split('\n').find(l => l.trim().length > 0) ?? '';
    return firstLine.length > 40 ? firstLine.slice(0, 40) + '…' : firstLine;
}
async function countSystemTokens(effectiveSystemPrompt) {
    // Get system context (gitStatus, etc.) which is always included
    const systemContext = await (0, context_js_1.getSystemContext)();
    // Build named entries: system prompt parts + system context values
    // Skip empty strings and the global-cache boundary marker
    const namedEntries = [
        ...effectiveSystemPrompt
            .filter(content => content.length > 0 && content !== prompts_js_1.SYSTEM_PROMPT_DYNAMIC_BOUNDARY)
            .map(content => ({ name: extractSectionName(content), content })),
        ...Object.entries(systemContext)
            .filter(([, content]) => content.length > 0)
            .map(([name, content]) => ({ name, content })),
    ];
    if (namedEntries.length < 1) {
        return { systemPromptTokens: 0, systemPromptSections: [] };
    }
    const systemTokenCounts = await Promise.all(namedEntries.map(({ content }) => countTokensWithFallback([{ role: 'user', content }], [])));
    const systemPromptSections = namedEntries.map((entry, i) => ({
        name: entry.name,
        tokens: systemTokenCounts[i] || 0,
    }));
    const systemPromptTokens = systemTokenCounts.reduce((sum, tokens) => sum + (tokens || 0), 0);
    return { systemPromptTokens, systemPromptSections };
}
async function countMemoryFileTokens() {
    // Simple mode disables CLAUDE.md loading, so don't report tokens for them
    if ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_SIMPLE)) {
        return { memoryFileDetails: [], claudeMdTokens: 0 };
    }
    const memoryFilesData = (0, claudemd_js_1.filterInjectedMemoryFiles)(await (0, claudemd_js_1.getMemoryFiles)());
    const memoryFileDetails = [];
    let claudeMdTokens = 0;
    if (memoryFilesData.length < 1) {
        return {
            memoryFileDetails: [],
            claudeMdTokens: 0,
        };
    }
    const claudeMdTokenCounts = await Promise.all(memoryFilesData.map(async (file) => {
        const tokens = await countTokensWithFallback([{ role: 'user', content: file.content }], []);
        return { file, tokens: tokens || 0 };
    }));
    for (const { file, tokens } of claudeMdTokenCounts) {
        claudeMdTokens += tokens;
        memoryFileDetails.push({
            path: file.path,
            type: file.type,
            tokens,
        });
    }
    return { claudeMdTokens, memoryFileDetails };
}
async function countBuiltInToolTokens(tools, getToolPermissionContext, agentInfo, model, messages) {
    const builtInTools = tools.filter(tool => !tool.isMcp);
    if (builtInTools.length < 1) {
        return {
            builtInToolTokens: 0,
            deferredBuiltinDetails: [],
            deferredBuiltinTokens: 0,
            systemToolDetails: [],
        };
    }
    // Check if tool search is enabled
    const { isToolSearchEnabled } = await Promise.resolve().then(() => __importStar(require('./toolSearch.js')));
    const { isDeferredTool } = await Promise.resolve().then(() => __importStar(require('../tools/ToolSearchTool/prompt.js')));
    const isDeferred = await isToolSearchEnabled(model ?? '', tools, getToolPermissionContext, agentInfo?.activeAgents ?? [], 'analyzeBuiltIn');
    // Separate always-loaded and deferred builtin tools using dynamic isDeferredTool check
    const alwaysLoadedTools = builtInTools.filter(t => !isDeferredTool(t));
    const deferredBuiltinTools = builtInTools.filter(t => isDeferredTool(t));
    // Count always-loaded tools
    const alwaysLoadedTokens = alwaysLoadedTools.length > 0
        ? await countToolDefinitionTokens(alwaysLoadedTools, getToolPermissionContext, agentInfo, model)
        : 0;
    // Build per-tool breakdown for always-loaded tools (ant-only, proportional
    // split of the bulk count based on rough schema size estimation). Excludes
    // SkillTool since its tokens are shown in the separate Skills category.
    let systemToolDetails = [];
    if (process.env.USER_TYPE === 'ant') {
        const toolsForBreakdown = alwaysLoadedTools.filter(t => !(0, Tool_js_1.toolMatchesName)(t, constants_js_1.SKILL_TOOL_NAME));
        if (toolsForBreakdown.length > 0) {
            const estimates = toolsForBreakdown.map(t => (0, tokenEstimation_js_1.roughTokenCountEstimation)((0, slowOperations_js_1.jsonStringify)(t.inputSchema ?? {})));
            const estimateTotal = estimates.reduce((s, e) => s + e, 0) || 1;
            const distributable = Math.max(0, alwaysLoadedTokens - exports.TOOL_TOKEN_COUNT_OVERHEAD);
            systemToolDetails = toolsForBreakdown
                .map((t, i) => ({
                name: t.name,
                tokens: Math.round((estimates[i] / estimateTotal) * distributable),
            }))
                .sort((a, b) => b.tokens - a.tokens);
        }
    }
    // Count deferred builtin tools individually for details
    const deferredBuiltinDetails = [];
    let loadedDeferredTokens = 0;
    let totalDeferredTokens = 0;
    if (deferredBuiltinTools.length > 0 && isDeferred) {
        // Find which deferred tools have been used in messages
        const loadedToolNames = new Set();
        if (messages) {
            const deferredToolNameSet = new Set(deferredBuiltinTools.map(t => t.name));
            for (const msg of messages) {
                if (msg.type === 'assistant') {
                    for (const block of msg.message.content) {
                        if ('type' in block &&
                            block.type === 'tool_use' &&
                            'name' in block &&
                            typeof block.name === 'string' &&
                            deferredToolNameSet.has(block.name)) {
                            loadedToolNames.add(block.name);
                        }
                    }
                }
            }
        }
        // Count each deferred tool
        const tokensByTool = await Promise.all(deferredBuiltinTools.map(t => countToolDefinitionTokens([t], getToolPermissionContext, agentInfo, model)));
        for (const [i, tool] of deferredBuiltinTools.entries()) {
            const tokens = Math.max(0, (tokensByTool[i] || 0) - exports.TOOL_TOKEN_COUNT_OVERHEAD);
            const isLoaded = loadedToolNames.has(tool.name);
            deferredBuiltinDetails.push({
                name: tool.name,
                tokens,
                isLoaded,
            });
            totalDeferredTokens += tokens;
            if (isLoaded) {
                loadedDeferredTokens += tokens;
            }
        }
    }
    else if (deferredBuiltinTools.length > 0) {
        // Tool search not enabled - count deferred tools as regular
        const deferredTokens = await countToolDefinitionTokens(deferredBuiltinTools, getToolPermissionContext, agentInfo, model);
        return {
            builtInToolTokens: alwaysLoadedTokens + deferredTokens,
            deferredBuiltinDetails: [],
            deferredBuiltinTokens: 0,
            systemToolDetails,
        };
    }
    return {
        // When deferred, only count always-loaded tools + any loaded deferred tools
        builtInToolTokens: alwaysLoadedTokens + loadedDeferredTokens,
        deferredBuiltinDetails,
        deferredBuiltinTokens: totalDeferredTokens - loadedDeferredTokens,
        systemToolDetails,
    };
}
function findSkillTool(tools) {
    return (0, Tool_js_1.findToolByName)(tools, constants_js_1.SKILL_TOOL_NAME);
}
async function countSlashCommandTokens(tools, getToolPermissionContext, agentInfo) {
    const info = await (0, prompt_js_1.getSkillToolInfo)((0, cwd_js_1.getCwd)());
    const slashCommandTool = findSkillTool(tools);
    if (!slashCommandTool) {
        return {
            slashCommandTokens: 0,
            commandInfo: { totalCommands: 0, includedCommands: 0 },
        };
    }
    const slashCommandTokens = await countToolDefinitionTokens([slashCommandTool], getToolPermissionContext, agentInfo);
    return {
        slashCommandTokens,
        commandInfo: {
            totalCommands: info.totalCommands,
            includedCommands: info.includedCommands,
        },
    };
}
async function countSkillTokens(tools, getToolPermissionContext, agentInfo) {
    try {
        const skills = await (0, prompt_js_1.getLimitedSkillToolCommands)((0, cwd_js_1.getCwd)());
        const slashCommandTool = findSkillTool(tools);
        if (!slashCommandTool) {
            return {
                skillTokens: 0,
                skillInfo: { totalSkills: 0, includedSkills: 0, skillFrontmatter: [] },
            };
        }
        // NOTE: This counts the entire SlashCommandTool (which includes both commands AND skills).
        // This is the same tool counted by countSlashCommandTokens(), but we track it separately
        // here for display purposes. These tokens should NOT be added to context categories
        // to avoid double-counting.
        const skillTokens = await countToolDefinitionTokens([slashCommandTool], getToolPermissionContext, agentInfo);
        // Calculate per-skill token estimates based on frontmatter only
        // (name, description, whenToUse) since full content is only loaded on invocation
        const skillFrontmatter = skills.map(skill => ({
            name: (0, commands_js_1.getCommandName)(skill),
            source: (skill.type === 'prompt' ? skill.source : 'plugin'),
            tokens: (0, loadSkillsDir_js_1.estimateSkillFrontmatterTokens)(skill),
        }));
        return {
            skillTokens,
            skillInfo: {
                totalSkills: skills.length,
                includedSkills: skills.length,
                skillFrontmatter,
            },
        };
    }
    catch (error) {
        (0, log_js_1.logError)((0, errors_js_1.toError)(error));
        // Return zero values rather than failing the entire context analysis
        return {
            skillTokens: 0,
            skillInfo: { totalSkills: 0, includedSkills: 0, skillFrontmatter: [] },
        };
    }
}
async function countMcpToolTokens(tools, getToolPermissionContext, agentInfo, model, messages) {
    const mcpTools = tools.filter(tool => tool.isMcp);
    const mcpToolDetails = [];
    // Single bulk API call for all MCP tools (instead of N individual calls)
    const totalTokensRaw = await countToolDefinitionTokens(mcpTools, getToolPermissionContext, agentInfo, model);
    // Subtract the single overhead since we made one bulk call
    const totalTokens = Math.max(0, (totalTokensRaw || 0) - exports.TOOL_TOKEN_COUNT_OVERHEAD);
    // Estimate per-tool proportions for display using local estimation.
    // Include name + description + input schema to match what toolToAPISchema
    // sends — otherwise tools with similar schemas but different descriptions
    // get identical counts (MCP tools share the same base Zod inputSchema).
    const estimates = await Promise.all(mcpTools.map(async (t) => (0, tokenEstimation_js_1.roughTokenCountEstimation)((0, slowOperations_js_1.jsonStringify)({
        name: t.name,
        description: await t.prompt({
            getToolPermissionContext,
            tools,
            agents: agentInfo?.activeAgents ?? [],
        }),
        input_schema: t.inputJSONSchema ?? {},
    }))));
    const estimateTotal = estimates.reduce((s, e) => s + e, 0) || 1;
    const mcpToolTokensByTool = estimates.map(e => Math.round((e / estimateTotal) * totalTokens));
    // Check if tool search is enabled - if so, MCP tools are deferred
    // isToolSearchEnabled handles threshold calculation internally for TstAuto mode
    const { isToolSearchEnabled } = await Promise.resolve().then(() => __importStar(require('./toolSearch.js')));
    const { isDeferredTool } = await Promise.resolve().then(() => __importStar(require('../tools/ToolSearchTool/prompt.js')));
    const isDeferred = await isToolSearchEnabled(model, tools, getToolPermissionContext, agentInfo?.activeAgents ?? [], 'analyzeMcp');
    // Find MCP tools that have been used in messages (loaded via ToolSearchTool)
    const loadedMcpToolNames = new Set();
    if (isDeferred && messages) {
        const mcpToolNameSet = new Set(mcpTools.map(t => t.name));
        for (const msg of messages) {
            if (msg.type === 'assistant') {
                for (const block of msg.message.content) {
                    if ('type' in block &&
                        block.type === 'tool_use' &&
                        'name' in block &&
                        typeof block.name === 'string' &&
                        mcpToolNameSet.has(block.name)) {
                        loadedMcpToolNames.add(block.name);
                    }
                }
            }
        }
    }
    // Build tool details with isLoaded flag
    for (const [i, tool] of mcpTools.entries()) {
        mcpToolDetails.push({
            name: tool.name,
            serverName: tool.name.split('__')[1] || 'unknown',
            tokens: mcpToolTokensByTool[i],
            isLoaded: loadedMcpToolNames.has(tool.name) || !isDeferredTool(tool),
        });
    }
    // Calculate loaded vs deferred tokens
    let loadedTokens = 0;
    let deferredTokens = 0;
    for (const detail of mcpToolDetails) {
        if (detail.isLoaded) {
            loadedTokens += detail.tokens;
        }
        else if (isDeferred) {
            deferredTokens += detail.tokens;
        }
    }
    return {
        // When deferred but some tools are loaded, count loaded tokens
        mcpToolTokens: isDeferred ? loadedTokens : totalTokens,
        mcpToolDetails,
        // Track deferred tokens separately for display
        deferredToolTokens: deferredTokens,
        loadedMcpToolNames,
    };
}
async function countCustomAgentTokens(agentDefinitions) {
    const customAgents = agentDefinitions.activeAgents.filter(a => a.source !== 'built-in');
    const agentDetails = [];
    let agentTokens = 0;
    const tokenCounts = await Promise.all(customAgents.map(agent => countTokensWithFallback([
        {
            role: 'user',
            content: [agent.agentType, agent.whenToUse].join(' '),
        },
    ], [])));
    for (const [i, agent] of customAgents.entries()) {
        const tokens = tokenCounts[i] || 0;
        agentTokens += tokens || 0;
        agentDetails.push({
            agentType: agent.agentType,
            source: agent.source,
            tokens: tokens || 0,
        });
    }
    return { agentTokens, agentDetails };
}
function processAssistantMessage(msg, breakdown) {
    // Process each content block individually
    for (const block of msg.message.content) {
        const blockStr = (0, slowOperations_js_1.jsonStringify)(block);
        const blockTokens = (0, tokenEstimation_js_1.roughTokenCountEstimation)(blockStr);
        if ('type' in block && block.type === 'tool_use') {
            breakdown.toolCallTokens += blockTokens;
            const toolName = ('name' in block ? block.name : undefined) || 'unknown';
            breakdown.toolCallsByType.set(toolName, (breakdown.toolCallsByType.get(toolName) || 0) + blockTokens);
        }
        else {
            // Text blocks or other non-tool content
            breakdown.assistantMessageTokens += blockTokens;
        }
    }
}
function processUserMessage(msg, breakdown, toolUseIdToName) {
    // Handle both string and array content
    if (typeof msg.message.content === 'string') {
        // Simple string content
        const tokens = (0, tokenEstimation_js_1.roughTokenCountEstimation)(msg.message.content);
        breakdown.userMessageTokens += tokens;
        return;
    }
    // Process each content block individually
    for (const block of msg.message.content) {
        const blockStr = (0, slowOperations_js_1.jsonStringify)(block);
        const blockTokens = (0, tokenEstimation_js_1.roughTokenCountEstimation)(blockStr);
        if ('type' in block && block.type === 'tool_result') {
            breakdown.toolResultTokens += blockTokens;
            const toolUseId = 'tool_use_id' in block ? block.tool_use_id : undefined;
            const toolName = (toolUseId ? toolUseIdToName.get(toolUseId) : undefined) || 'unknown';
            breakdown.toolResultsByType.set(toolName, (breakdown.toolResultsByType.get(toolName) || 0) + blockTokens);
        }
        else {
            // Text blocks or other non-tool content
            breakdown.userMessageTokens += blockTokens;
        }
    }
}
function processAttachment(msg, breakdown) {
    const contentStr = (0, slowOperations_js_1.jsonStringify)(msg.attachment);
    const tokens = (0, tokenEstimation_js_1.roughTokenCountEstimation)(contentStr);
    breakdown.attachmentTokens += tokens;
    const attachType = msg.attachment.type || 'unknown';
    breakdown.attachmentsByType.set(attachType, (breakdown.attachmentsByType.get(attachType) || 0) + tokens);
}
async function approximateMessageTokens(messages) {
    const microcompactResult = await (0, microCompact_js_1.microcompactMessages)(messages);
    // Initialize tracking
    const breakdown = {
        totalTokens: 0,
        toolCallTokens: 0,
        toolResultTokens: 0,
        attachmentTokens: 0,
        assistantMessageTokens: 0,
        userMessageTokens: 0,
        toolCallsByType: new Map(),
        toolResultsByType: new Map(),
        attachmentsByType: new Map(),
    };
    // Build a map of tool_use_id to tool_name for easier lookup
    const toolUseIdToName = new Map();
    for (const msg of microcompactResult.messages) {
        if (msg.type === 'assistant') {
            for (const block of msg.message.content) {
                if ('type' in block && block.type === 'tool_use') {
                    const toolUseId = 'id' in block ? block.id : undefined;
                    const toolName = ('name' in block ? block.name : undefined) || 'unknown';
                    if (toolUseId) {
                        toolUseIdToName.set(toolUseId, toolName);
                    }
                }
            }
        }
    }
    // Process each message for detailed breakdown
    for (const msg of microcompactResult.messages) {
        if (msg.type === 'assistant') {
            processAssistantMessage(msg, breakdown);
        }
        else if (msg.type === 'user') {
            processUserMessage(msg, breakdown, toolUseIdToName);
        }
        else if (msg.type === 'attachment') {
            processAttachment(msg, breakdown);
        }
    }
    // Calculate total tokens using the API for accuracy
    const approximateMessageTokens = await countTokensWithFallback((0, messages_js_1.normalizeMessagesForAPI)(microcompactResult.messages).map(_ => {
        if (_.type === 'assistant') {
            return {
                // Important: strip out fields like id, etc. -- the counting API errors if they're present
                role: 'assistant',
                content: _.message.content,
            };
        }
        return _.message;
    }), []);
    breakdown.totalTokens = approximateMessageTokens ?? 0;
    return breakdown;
}
async function analyzeContextUsage(messages, model, getToolPermissionContext, tools, agentDefinitions, terminalWidth, toolUseContext, mainThreadAgentDefinition, 
/** Original messages before microcompact, used to extract API usage */
originalMessages) {
    const runtimeModel = (0, model_js_1.getRuntimeMainLoopModel)({
        permissionMode: (await getToolPermissionContext()).mode,
        mainLoopModel: model,
    });
    // Get context window size
    const contextWindow = (0, context_js_2.getContextWindowForModel)(runtimeModel, (0, state_js_1.getSdkBetas)());
    // Build the effective system prompt using the shared utility
    const defaultSystemPrompt = await (0, prompts_js_1.getSystemPrompt)(tools, runtimeModel);
    const effectiveSystemPrompt = (0, systemPrompt_js_1.buildEffectiveSystemPrompt)({
        mainThreadAgentDefinition,
        toolUseContext: toolUseContext ?? {
            options: {},
        },
        customSystemPrompt: toolUseContext?.options.customSystemPrompt,
        defaultSystemPrompt,
        appendSystemPrompt: toolUseContext?.options.appendSystemPrompt,
    });
    // Critical operations that should not fail due to skills
    const [{ systemPromptTokens, systemPromptSections }, { claudeMdTokens, memoryFileDetails }, { builtInToolTokens, deferredBuiltinDetails, deferredBuiltinTokens, systemToolDetails, }, { mcpToolTokens, mcpToolDetails, deferredToolTokens }, { agentTokens, agentDetails }, { slashCommandTokens, commandInfo }, messageBreakdown,] = await Promise.all([
        countSystemTokens(effectiveSystemPrompt),
        countMemoryFileTokens(),
        countBuiltInToolTokens(tools, getToolPermissionContext, agentDefinitions, runtimeModel, messages),
        countMcpToolTokens(tools, getToolPermissionContext, agentDefinitions, runtimeModel, messages),
        countCustomAgentTokens(agentDefinitions),
        countSlashCommandTokens(tools, getToolPermissionContext, agentDefinitions),
        approximateMessageTokens(messages),
    ]);
    // Count skills separately with error isolation
    const skillResult = await countSkillTokens(tools, getToolPermissionContext, agentDefinitions);
    const skillInfo = skillResult.skillInfo;
    // Use sum of individual skill token estimates (matches what's shown in details)
    // rather than skillResult.skillTokens which includes tool schema overhead
    const skillFrontmatterTokens = skillInfo.skillFrontmatter.reduce((sum, skill) => sum + skill.tokens, 0);
    const messageTokens = messageBreakdown.totalTokens;
    // Check if autocompact is enabled and calculate threshold
    const isAutoCompact = (0, autoCompact_js_1.isAutoCompactEnabled)();
    const autoCompactThreshold = isAutoCompact
        ? (0, autoCompact_js_1.getEffectiveContextWindowSize)(model) - autoCompact_js_1.AUTOCOMPACT_BUFFER_TOKENS
        : undefined;
    // Create categories
    const cats = [];
    // System prompt is always shown first (fixed overhead)
    if (systemPromptTokens > 0) {
        cats.push({
            name: 'System prompt',
            tokens: systemPromptTokens,
            color: 'promptBorder',
        });
    }
    // Built-in tools right after system prompt (skills shown separately below)
    // Ant users get a per-tool breakdown via systemToolDetails
    const systemToolsTokens = builtInToolTokens - skillFrontmatterTokens;
    if (systemToolsTokens > 0) {
        cats.push({
            name: process.env.USER_TYPE === 'ant'
                ? '[ANT-ONLY] System tools'
                : 'System tools',
            tokens: systemToolsTokens,
            color: 'inactive',
        });
    }
    // MCP tools after system tools
    if (mcpToolTokens > 0) {
        cats.push({
            name: 'MCP tools',
            tokens: mcpToolTokens,
            color: 'cyan_FOR_SUBAGENTS_ONLY',
        });
    }
    // Show deferred MCP tools (when tool search is enabled)
    // These don't count toward context usage but we show them for visibility
    if (deferredToolTokens > 0) {
        cats.push({
            name: 'MCP tools (deferred)',
            tokens: deferredToolTokens,
            color: 'inactive',
            isDeferred: true,
        });
    }
    // Show deferred builtin tools (when tool search is enabled)
    if (deferredBuiltinTokens > 0) {
        cats.push({
            name: 'System tools (deferred)',
            tokens: deferredBuiltinTokens,
            color: 'inactive',
            isDeferred: true,
        });
    }
    // Custom agents after MCP tools
    if (agentTokens > 0) {
        cats.push({
            name: 'Custom agents',
            tokens: agentTokens,
            color: 'permission',
        });
    }
    // Memory files after custom agents
    if (claudeMdTokens > 0) {
        cats.push({
            name: 'Memory files',
            tokens: claudeMdTokens,
            color: 'claude',
        });
    }
    // Skills after memory files
    if (skillFrontmatterTokens > 0) {
        cats.push({
            name: 'Skills',
            tokens: skillFrontmatterTokens,
            color: 'warning',
        });
    }
    if (messageTokens !== null && messageTokens > 0) {
        cats.push({
            name: 'Messages',
            tokens: messageTokens,
            color: 'purple_FOR_SUBAGENTS_ONLY',
        });
    }
    // Calculate actual content usage (before adding reserved buffers)
    // Exclude deferred categories from the usage calculation
    const actualUsage = cats.reduce((sum, cat) => sum + (cat.isDeferred ? 0 : cat.tokens), 0);
    // Reserved space after messages (not counted in actualUsage shown to user).
    // Under reactive-only mode (cobalt_raccoon), proactive autocompact never
    // fires and the reserved buffer is a lie — skip it entirely and let Free
    // space fill the grid. feature() guard keeps the flag string out of
    // external builds. Same for context-collapse (marble_origami) — collapse
    // owns the threshold ladder and autocompact is suppressed in
    // shouldAutoCompact, so the 33k buffer shown here would be a lie too.
    let reservedTokens = 0;
    let skipReservedBuffer = false;
    if ((0, bun_bundle_1.feature)('REACTIVE_COMPACT')) {
        if ((0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_cobalt_raccoon', false)) {
            skipReservedBuffer = true;
        }
    }
    if ((0, bun_bundle_1.feature)('CONTEXT_COLLAPSE')) {
        /* eslint-disable @typescript-eslint/no-require-imports */
        const { isContextCollapseEnabled } = require('../services/contextCollapse/index.js');
        /* eslint-enable @typescript-eslint/no-require-imports */
        if (isContextCollapseEnabled()) {
            skipReservedBuffer = true;
        }
    }
    if (skipReservedBuffer) {
        // No buffer category pushed — reactive compaction is transparent and
        // doesn't need a visible reservation in the grid.
    }
    else if (isAutoCompact && autoCompactThreshold !== undefined) {
        // Autocompact buffer (from effective context)
        reservedTokens = contextWindow - autoCompactThreshold;
        cats.push({
            name: RESERVED_CATEGORY_NAME,
            tokens: reservedTokens,
            color: 'inactive',
        });
    }
    else if (!isAutoCompact) {
        // Compact buffer reserve (3k from actual context limit)
        reservedTokens = autoCompact_js_1.MANUAL_COMPACT_BUFFER_TOKENS;
        cats.push({
            name: MANUAL_COMPACT_BUFFER_NAME,
            tokens: reservedTokens,
            color: 'inactive',
        });
    }
    // Calculate free space (subtract both actual usage and reserved buffer)
    const freeTokens = Math.max(0, contextWindow - actualUsage - reservedTokens);
    cats.push({
        name: 'Free space',
        tokens: freeTokens,
        color: 'promptBorder',
    });
    // Total for display (everything except free space)
    const totalIncludingReserved = actualUsage;
    // Extract API usage from original messages (if provided) to match status line
    // This uses the same source of truth as the status line for consistency
    const apiUsage = (0, tokens_js_1.getCurrentUsage)(originalMessages ?? messages);
    // When API usage is available, use it for total to match status line calculation
    // Status line uses: input_tokens + cache_creation_input_tokens + cache_read_input_tokens
    const totalFromAPI = apiUsage
        ? apiUsage.input_tokens +
            apiUsage.cache_creation_input_tokens +
            apiUsage.cache_read_input_tokens
        : null;
    // Use API total if available, otherwise fall back to estimated total
    const finalTotalTokens = totalFromAPI ?? totalIncludingReserved;
    // Pre-calculate grid based on model context window and terminal width
    // For narrow screens (< 80 cols), use 5x5 for 200k models, 5x10 for 1M+ models
    // For normal screens, use 10x10 for 200k models, 20x10 for 1M+ models
    const isNarrowScreen = terminalWidth && terminalWidth < 80;
    const GRID_WIDTH = contextWindow >= 1000000
        ? isNarrowScreen
            ? 5
            : 20
        : isNarrowScreen
            ? 5
            : 10;
    const GRID_HEIGHT = contextWindow >= 1000000 ? 10 : isNarrowScreen ? 5 : 10;
    const TOTAL_SQUARES = GRID_WIDTH * GRID_HEIGHT;
    // Filter out deferred categories - they don't take up actual context space
    // (e.g., MCP tools when tool search is enabled)
    const nonDeferredCats = cats.filter(cat => !cat.isDeferred);
    // Calculate squares per category (use rawEffectiveMax for visualization to show full context)
    const categorySquares = nonDeferredCats.map(cat => ({
        ...cat,
        squares: cat.name === 'Free space'
            ? Math.round((cat.tokens / contextWindow) * TOTAL_SQUARES)
            : Math.max(1, Math.round((cat.tokens / contextWindow) * TOTAL_SQUARES)),
        percentageOfTotal: Math.round((cat.tokens / contextWindow) * 100),
    }));
    // Helper function to create grid squares for a category
    function createCategorySquares(category) {
        const squares = [];
        const exactSquares = (category.tokens / contextWindow) * TOTAL_SQUARES;
        const wholeSquares = Math.floor(exactSquares);
        const fractionalPart = exactSquares - wholeSquares;
        for (let i = 0; i < category.squares; i++) {
            // Determine fullness: full squares get 1.0, partial square gets fractional amount
            let squareFullness = 1.0;
            if (i === wholeSquares && fractionalPart > 0) {
                // This is the partial square
                squareFullness = fractionalPart;
            }
            squares.push({
                color: category.color,
                isFilled: true,
                categoryName: category.name,
                tokens: category.tokens,
                percentage: category.percentageOfTotal,
                squareFullness,
            });
        }
        return squares;
    }
    // Build the grid as an array of squares with full metadata
    const gridSquares = [];
    // Separate reserved category for end placement (either autocompact or manual compact buffer)
    const reservedCategory = categorySquares.find(cat => cat.name === RESERVED_CATEGORY_NAME ||
        cat.name === MANUAL_COMPACT_BUFFER_NAME);
    const nonReservedCategories = categorySquares.filter(cat => cat.name !== RESERVED_CATEGORY_NAME &&
        cat.name !== MANUAL_COMPACT_BUFFER_NAME &&
        cat.name !== 'Free space');
    // Add all non-reserved, non-free-space squares first
    for (const cat of nonReservedCategories) {
        const squares = createCategorySquares(cat);
        for (const square of squares) {
            if (gridSquares.length < TOTAL_SQUARES) {
                gridSquares.push(square);
            }
        }
    }
    // Calculate how many squares are needed for reserved
    const reservedSquareCount = reservedCategory ? reservedCategory.squares : 0;
    // Fill with free space, leaving room for reserved at the end
    const freeSpaceCat = cats.find(c => c.name === 'Free space');
    const freeSpaceTarget = TOTAL_SQUARES - reservedSquareCount;
    while (gridSquares.length < freeSpaceTarget) {
        gridSquares.push({
            color: 'promptBorder',
            isFilled: true,
            categoryName: 'Free space',
            tokens: freeSpaceCat?.tokens || 0,
            percentage: freeSpaceCat
                ? Math.round((freeSpaceCat.tokens / contextWindow) * 100)
                : 0,
            squareFullness: 1.0, // Free space is always "full"
        });
    }
    // Add reserved squares at the end
    if (reservedCategory) {
        const squares = createCategorySquares(reservedCategory);
        for (const square of squares) {
            if (gridSquares.length < TOTAL_SQUARES) {
                gridSquares.push(square);
            }
        }
    }
    // Convert to rows for rendering
    const gridRows = [];
    for (let i = 0; i < GRID_HEIGHT; i++) {
        gridRows.push(gridSquares.slice(i * GRID_WIDTH, (i + 1) * GRID_WIDTH));
    }
    // Format message breakdown (used by context suggestions for all users)
    // Combine tool calls and results, then get top 5
    const toolsMap = new Map();
    // Add call tokens
    for (const [name, tokens] of messageBreakdown.toolCallsByType.entries()) {
        const existing = toolsMap.get(name) || { callTokens: 0, resultTokens: 0 };
        toolsMap.set(name, { ...existing, callTokens: tokens });
    }
    // Add result tokens
    for (const [name, tokens] of messageBreakdown.toolResultsByType.entries()) {
        const existing = toolsMap.get(name) || { callTokens: 0, resultTokens: 0 };
        toolsMap.set(name, { ...existing, resultTokens: tokens });
    }
    // Convert to array and sort by total tokens (calls + results)
    const toolsByTypeArray = Array.from(toolsMap.entries())
        .map(([name, { callTokens, resultTokens }]) => ({
        name,
        callTokens,
        resultTokens,
    }))
        .sort((a, b) => b.callTokens + b.resultTokens - (a.callTokens + a.resultTokens));
    const attachmentsByTypeArray = Array.from(messageBreakdown.attachmentsByType.entries())
        .map(([name, tokens]) => ({ name, tokens }))
        .sort((a, b) => b.tokens - a.tokens);
    const formattedMessageBreakdown = {
        toolCallTokens: messageBreakdown.toolCallTokens,
        toolResultTokens: messageBreakdown.toolResultTokens,
        attachmentTokens: messageBreakdown.attachmentTokens,
        assistantMessageTokens: messageBreakdown.assistantMessageTokens,
        userMessageTokens: messageBreakdown.userMessageTokens,
        toolCallsByType: toolsByTypeArray,
        attachmentsByType: attachmentsByTypeArray,
    };
    return {
        categories: cats,
        totalTokens: finalTotalTokens,
        maxTokens: contextWindow,
        rawMaxTokens: contextWindow,
        percentage: Math.round((finalTotalTokens / contextWindow) * 100),
        gridRows,
        model: runtimeModel,
        memoryFiles: memoryFileDetails,
        mcpTools: mcpToolDetails,
        deferredBuiltinTools: process.env.USER_TYPE === 'ant' ? deferredBuiltinDetails : undefined,
        systemTools: process.env.USER_TYPE === 'ant' ? systemToolDetails : undefined,
        systemPromptSections: process.env.USER_TYPE === 'ant' ? systemPromptSections : undefined,
        agents: agentDetails,
        slashCommands: slashCommandTokens > 0
            ? {
                totalCommands: commandInfo.totalCommands,
                includedCommands: commandInfo.includedCommands,
                tokens: slashCommandTokens,
            }
            : undefined,
        skills: skillFrontmatterTokens > 0
            ? {
                totalSkills: skillInfo.totalSkills,
                includedSkills: skillInfo.includedSkills,
                tokens: skillFrontmatterTokens,
                skillFrontmatter: skillInfo.skillFrontmatter,
            }
            : undefined,
        autoCompactThreshold,
        isAutoCompactEnabled: isAutoCompact,
        messageBreakdown: formattedMessageBreakdown,
        apiUsage,
    };
}
