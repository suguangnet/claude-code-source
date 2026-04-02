"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectContextData = collectContextData;
exports.call = call;
const bun_bundle_1 = require("bun:bundle");
const microCompact_js_1 = require("../../services/compact/microCompact.js");
const analyzeContext_js_1 = require("../../utils/analyzeContext.js");
const format_js_1 = require("../../utils/format.js");
const messages_js_1 = require("../../utils/messages.js");
const constants_js_1 = require("../../utils/settings/constants.js");
const stringUtils_js_1 = require("../../utils/stringUtils.js");
async function collectContextData(context) {
    const { messages, getAppState, options: { mainLoopModel, tools, agentDefinitions, customSystemPrompt, appendSystemPrompt, }, } = context;
    let apiView = (0, messages_js_1.getMessagesAfterCompactBoundary)(messages);
    if ((0, bun_bundle_1.feature)('CONTEXT_COLLAPSE')) {
        /* eslint-disable @typescript-eslint/no-require-imports */
        const { projectView } = require('../../services/contextCollapse/operations.js');
        /* eslint-enable @typescript-eslint/no-require-imports */
        apiView = projectView(apiView);
    }
    const { messages: compactedMessages } = await (0, microCompact_js_1.microcompactMessages)(apiView);
    const appState = getAppState();
    return (0, analyzeContext_js_1.analyzeContextUsage)(compactedMessages, mainLoopModel, async () => appState.toolPermissionContext, tools, agentDefinitions, undefined, // terminalWidth
    // analyzeContextUsage only reads options.{customSystemPrompt,appendSystemPrompt}
    // but its signature declares the full Pick<ToolUseContext, 'options'>.
    { options: { customSystemPrompt, appendSystemPrompt } }, undefined, // mainThreadAgentDefinition
    apiView);
}
async function call(_args, context) {
    const data = await collectContextData(context);
    return {
        type: 'text',
        value: formatContextAsMarkdownTable(data),
    };
}
function formatContextAsMarkdownTable(data) {
    const { categories, totalTokens, rawMaxTokens, percentage, model, memoryFiles, mcpTools, agents, skills, messageBreakdown, systemTools, systemPromptSections, } = data;
    let output = `## Context Usage\n\n`;
    output += `**Model:** ${model}  \n`;
    output += `**Tokens:** ${(0, format_js_1.formatTokens)(totalTokens)} / ${(0, format_js_1.formatTokens)(rawMaxTokens)} (${percentage}%)\n`;
    // Context-collapse status. Always show when the runtime gate is on —
    // the user needs to know which strategy is managing their context
    // even before anything has fired.
    if ((0, bun_bundle_1.feature)('CONTEXT_COLLAPSE')) {
        /* eslint-disable @typescript-eslint/no-require-imports */
        const { getStats, isContextCollapseEnabled } = require('../../services/contextCollapse/index.js');
        /* eslint-enable @typescript-eslint/no-require-imports */
        if (isContextCollapseEnabled()) {
            const s = getStats();
            const { health: h } = s;
            const parts = [];
            if (s.collapsedSpans > 0) {
                parts.push(`${s.collapsedSpans} ${(0, stringUtils_js_1.plural)(s.collapsedSpans, 'span')} summarized (${s.collapsedMessages} messages)`);
            }
            if (s.stagedSpans > 0)
                parts.push(`${s.stagedSpans} staged`);
            const summary = parts.length > 0
                ? parts.join(', ')
                : h.totalSpawns > 0
                    ? `${h.totalSpawns} ${(0, stringUtils_js_1.plural)(h.totalSpawns, 'spawn')}, nothing staged yet`
                    : 'waiting for first trigger';
            output += `**Context strategy:** collapse (${summary})\n`;
            if (h.totalErrors > 0) {
                output += `**Collapse errors:** ${h.totalErrors}/${h.totalSpawns} spawns failed`;
                if (h.lastError) {
                    output += ` (last: ${h.lastError.slice(0, 80)})`;
                }
                output += '\n';
            }
            else if (h.emptySpawnWarningEmitted) {
                output += `**Collapse idle:** ${h.totalEmptySpawns} consecutive empty runs\n`;
            }
        }
    }
    output += '\n';
    // Main categories table
    const visibleCategories = categories.filter(cat => cat.tokens > 0 &&
        cat.name !== 'Free space' &&
        cat.name !== 'Autocompact buffer');
    if (visibleCategories.length > 0) {
        output += `### Estimated usage by category\n\n`;
        output += `| Category | Tokens | Percentage |\n`;
        output += `|----------|--------|------------|\n`;
        for (const cat of visibleCategories) {
            const percentDisplay = ((cat.tokens / rawMaxTokens) * 100).toFixed(1);
            output += `| ${cat.name} | ${(0, format_js_1.formatTokens)(cat.tokens)} | ${percentDisplay}% |\n`;
        }
        const freeSpaceCategory = categories.find(c => c.name === 'Free space');
        if (freeSpaceCategory && freeSpaceCategory.tokens > 0) {
            const percentDisplay = ((freeSpaceCategory.tokens / rawMaxTokens) *
                100).toFixed(1);
            output += `| Free space | ${(0, format_js_1.formatTokens)(freeSpaceCategory.tokens)} | ${percentDisplay}% |\n`;
        }
        const autocompactCategory = categories.find(c => c.name === 'Autocompact buffer');
        if (autocompactCategory && autocompactCategory.tokens > 0) {
            const percentDisplay = ((autocompactCategory.tokens / rawMaxTokens) *
                100).toFixed(1);
            output += `| Autocompact buffer | ${(0, format_js_1.formatTokens)(autocompactCategory.tokens)} | ${percentDisplay}% |\n`;
        }
        output += `\n`;
    }
    // MCP tools
    if (mcpTools.length > 0) {
        output += `### MCP Tools\n\n`;
        output += `| Tool | Server | Tokens |\n`;
        output += `|------|--------|--------|\n`;
        for (const tool of mcpTools) {
            output += `| ${tool.name} | ${tool.serverName} | ${(0, format_js_1.formatTokens)(tool.tokens)} |\n`;
        }
        output += `\n`;
    }
    // System tools (ant-only)
    if (systemTools &&
        systemTools.length > 0 &&
        process.env.USER_TYPE === 'ant') {
        output += `### [ANT-ONLY] System Tools\n\n`;
        output += `| Tool | Tokens |\n`;
        output += `|------|--------|\n`;
        for (const tool of systemTools) {
            output += `| ${tool.name} | ${(0, format_js_1.formatTokens)(tool.tokens)} |\n`;
        }
        output += `\n`;
    }
    // System prompt sections (ant-only)
    if (systemPromptSections &&
        systemPromptSections.length > 0 &&
        process.env.USER_TYPE === 'ant') {
        output += `### [ANT-ONLY] System Prompt Sections\n\n`;
        output += `| Section | Tokens |\n`;
        output += `|---------|--------|\n`;
        for (const section of systemPromptSections) {
            output += `| ${section.name} | ${(0, format_js_1.formatTokens)(section.tokens)} |\n`;
        }
        output += `\n`;
    }
    // Custom agents
    if (agents.length > 0) {
        output += `### Custom Agents\n\n`;
        output += `| Agent Type | Source | Tokens |\n`;
        output += `|------------|--------|--------|\n`;
        for (const agent of agents) {
            let sourceDisplay;
            switch (agent.source) {
                case 'projectSettings':
                    sourceDisplay = 'Project';
                    break;
                case 'userSettings':
                    sourceDisplay = 'User';
                    break;
                case 'localSettings':
                    sourceDisplay = 'Local';
                    break;
                case 'flagSettings':
                    sourceDisplay = 'Flag';
                    break;
                case 'policySettings':
                    sourceDisplay = 'Policy';
                    break;
                case 'plugin':
                    sourceDisplay = 'Plugin';
                    break;
                case 'built-in':
                    sourceDisplay = 'Built-in';
                    break;
                default:
                    sourceDisplay = String(agent.source);
            }
            output += `| ${agent.agentType} | ${sourceDisplay} | ${(0, format_js_1.formatTokens)(agent.tokens)} |\n`;
        }
        output += `\n`;
    }
    // Memory files
    if (memoryFiles.length > 0) {
        output += `### Memory Files\n\n`;
        output += `| Type | Path | Tokens |\n`;
        output += `|------|------|--------|\n`;
        for (const file of memoryFiles) {
            output += `| ${file.type} | ${file.path} | ${(0, format_js_1.formatTokens)(file.tokens)} |\n`;
        }
        output += `\n`;
    }
    // Skills
    if (skills && skills.tokens > 0 && skills.skillFrontmatter.length > 0) {
        output += `### Skills\n\n`;
        output += `| Skill | Source | Tokens |\n`;
        output += `|-------|--------|--------|\n`;
        for (const skill of skills.skillFrontmatter) {
            output += `| ${skill.name} | ${(0, constants_js_1.getSourceDisplayName)(skill.source)} | ${(0, format_js_1.formatTokens)(skill.tokens)} |\n`;
        }
        output += `\n`;
    }
    // Message breakdown (ant-only)
    if (messageBreakdown && process.env.USER_TYPE === 'ant') {
        output += `### [ANT-ONLY] Message Breakdown\n\n`;
        output += `| Category | Tokens |\n`;
        output += `|----------|--------|\n`;
        output += `| Tool calls | ${(0, format_js_1.formatTokens)(messageBreakdown.toolCallTokens)} |\n`;
        output += `| Tool results | ${(0, format_js_1.formatTokens)(messageBreakdown.toolResultTokens)} |\n`;
        output += `| Attachments | ${(0, format_js_1.formatTokens)(messageBreakdown.attachmentTokens)} |\n`;
        output += `| Assistant messages (non-tool) | ${(0, format_js_1.formatTokens)(messageBreakdown.assistantMessageTokens)} |\n`;
        output += `| User messages (non-tool-result) | ${(0, format_js_1.formatTokens)(messageBreakdown.userMessageTokens)} |\n`;
        output += `\n`;
        if (messageBreakdown.toolCallsByType.length > 0) {
            output += `#### Top Tools\n\n`;
            output += `| Tool | Call Tokens | Result Tokens |\n`;
            output += `|------|-------------|---------------|\n`;
            for (const tool of messageBreakdown.toolCallsByType) {
                output += `| ${tool.name} | ${(0, format_js_1.formatTokens)(tool.callTokens)} | ${(0, format_js_1.formatTokens)(tool.resultTokens)} |\n`;
            }
            output += `\n`;
        }
        if (messageBreakdown.attachmentsByType.length > 0) {
            output += `#### Top Attachments\n\n`;
            output += `| Attachment | Tokens |\n`;
            output += `|------------|--------|\n`;
            for (const attachment of messageBreakdown.attachmentsByType) {
                output += `| ${attachment.name} | ${(0, format_js_1.formatTokens)(attachment.tokens)} |\n`;
            }
            output += `\n`;
        }
    }
    return output;
}
