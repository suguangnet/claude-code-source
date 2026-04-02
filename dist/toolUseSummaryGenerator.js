"use strict";
/**
 * Tool Use Summary Generator
 *
 * Generates human-readable summaries of completed tool batches using Haiku.
 * Used by the SDK to provide high-level progress updates to clients.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToolUseSummary = generateToolUseSummary;
const errorIds_js_1 = require("../../constants/errorIds.js");
const errors_js_1 = require("../../utils/errors.js");
const log_js_1 = require("../../utils/log.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const systemPromptType_js_1 = require("../../utils/systemPromptType.js");
const claude_js_1 = require("../api/claude.js");
const TOOL_USE_SUMMARY_SYSTEM_PROMPT = `Write a short summary label describing what these tool calls accomplished. It appears as a single-line row in a mobile app and truncates around 30 characters, so think git-commit-subject, not sentence.

Keep the verb in past tense and the most distinctive noun. Drop articles, connectors, and long location context first.

Examples:
- Searched in auth/
- Fixed NPE in UserService
- Created signup endpoint
- Read config.json
- Ran failing tests`;
/**
 * Generates a human-readable summary of completed tools.
 *
 * @param params - Parameters including tools executed and their results
 * @returns A brief summary string, or null if generation fails
 */
async function generateToolUseSummary({ tools, signal, isNonInteractiveSession, lastAssistantText, }) {
    if (tools.length === 0) {
        return null;
    }
    try {
        // Build a concise representation of what tools did
        const toolSummaries = tools
            .map(tool => {
            const inputStr = truncateJson(tool.input, 300);
            const outputStr = truncateJson(tool.output, 300);
            return `Tool: ${tool.name}\nInput: ${inputStr}\nOutput: ${outputStr}`;
        })
            .join('\n\n');
        const contextPrefix = lastAssistantText
            ? `User's intent (from assistant's last message): ${lastAssistantText.slice(0, 200)}\n\n`
            : '';
        const response = await (0, claude_js_1.queryHaiku)({
            systemPrompt: (0, systemPromptType_js_1.asSystemPrompt)([TOOL_USE_SUMMARY_SYSTEM_PROMPT]),
            userPrompt: `${contextPrefix}Tools completed:\n\n${toolSummaries}\n\nLabel:`,
            signal,
            options: {
                querySource: 'tool_use_summary_generation',
                enablePromptCaching: true,
                agents: [],
                isNonInteractiveSession,
                hasAppendSystemPrompt: false,
                mcpTools: [],
            },
        });
        const summary = response.message.content
            .filter(block => block.type === 'text')
            .map(block => (block.type === 'text' ? block.text : ''))
            .join('')
            .trim();
        return summary || null;
    }
    catch (error) {
        // Log but don't fail - summaries are non-critical
        const err = (0, errors_js_1.toError)(error);
        err.cause = { errorId: errorIds_js_1.E_TOOL_USE_SUMMARY_GENERATION_FAILED };
        (0, log_js_1.logError)(err);
        return null;
    }
}
/**
 * Truncates a JSON value to a maximum length for the prompt.
 */
function truncateJson(value, maxLength) {
    try {
        const str = (0, slowOperations_js_1.jsonStringify)(value);
        if (str.length <= maxLength) {
            return str;
        }
        return str.slice(0, maxLength - 3) + '...';
    }
    catch {
        return '[unable to serialize]';
    }
}
