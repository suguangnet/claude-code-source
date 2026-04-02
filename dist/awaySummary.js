"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAwaySummary = generateAwaySummary;
const sdk_1 = require("@anthropic-ai/sdk");
const Tool_js_1 = require("../Tool.js");
const debug_js_1 = require("../utils/debug.js");
const messages_js_1 = require("../utils/messages.js");
const model_js_1 = require("../utils/model/model.js");
const systemPromptType_js_1 = require("../utils/systemPromptType.js");
const claude_js_1 = require("./api/claude.js");
const sessionMemoryUtils_js_1 = require("./SessionMemory/sessionMemoryUtils.js");
// Recap only needs recent context — truncate to avoid "prompt too long" on
// large sessions. 30 messages ≈ ~15 exchanges, plenty for "where we left off."
const RECENT_MESSAGE_WINDOW = 30;
function buildAwaySummaryPrompt(memory) {
    const memoryBlock = memory
        ? `Session memory (broader context):\n${memory}\n\n`
        : '';
    return `${memoryBlock}The user stepped away and is coming back. Write exactly 1-3 short sentences. Start by stating the high-level task — what they are building or debugging, not implementation details. Next: the concrete next step. Skip status reports and commit recaps.`;
}
/**
 * Generates a short session recap for the "while you were away" card.
 * Returns null on abort, empty transcript, or error.
 */
async function generateAwaySummary(messages, signal) {
    if (messages.length === 0) {
        return null;
    }
    try {
        const memory = await (0, sessionMemoryUtils_js_1.getSessionMemoryContent)();
        const recent = messages.slice(-RECENT_MESSAGE_WINDOW);
        recent.push((0, messages_js_1.createUserMessage)({ content: buildAwaySummaryPrompt(memory) }));
        const response = await (0, claude_js_1.queryModelWithoutStreaming)({
            messages: recent,
            systemPrompt: (0, systemPromptType_js_1.asSystemPrompt)([]),
            thinkingConfig: { type: 'disabled' },
            tools: [],
            signal,
            options: {
                getToolPermissionContext: async () => (0, Tool_js_1.getEmptyToolPermissionContext)(),
                model: (0, model_js_1.getSmallFastModel)(),
                toolChoice: undefined,
                isNonInteractiveSession: false,
                hasAppendSystemPrompt: false,
                agents: [],
                querySource: 'away_summary',
                mcpTools: [],
                skipCacheWrite: true,
            },
        });
        if (response.isApiErrorMessage) {
            (0, debug_js_1.logForDebugging)(`[awaySummary] API error: ${(0, messages_js_1.getAssistantMessageText)(response)}`);
            return null;
        }
        return (0, messages_js_1.getAssistantMessageText)(response);
    }
    catch (err) {
        if (err instanceof sdk_1.APIUserAbortError || signal.aborted) {
            return null;
        }
        (0, debug_js_1.logForDebugging)(`[awaySummary] generation failed: ${err}`);
        return null;
    }
}
