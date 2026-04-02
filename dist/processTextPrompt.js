"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processTextPrompt = processTextPrompt;
const crypto_1 = require("crypto");
const state_js_1 = require("src/bootstrap/state.js");
const index_js_1 = require("../../services/analytics/index.js");
const messages_js_1 = require("../messages.js");
const events_js_1 = require("../telemetry/events.js");
const sessionTracing_js_1 = require("../telemetry/sessionTracing.js");
const userPromptKeywords_js_1 = require("../userPromptKeywords.js");
function processTextPrompt(input, imageContentBlocks, imagePasteIds, attachmentMessages, uuid, permissionMode, isMeta) {
    const promptId = (0, crypto_1.randomUUID)();
    (0, state_js_1.setPromptId)(promptId);
    const userPromptText = typeof input === 'string'
        ? input
        : input.find(block => block.type === 'text')?.text || '';
    (0, sessionTracing_js_1.startInteractionSpan)(userPromptText);
    // Emit user_prompt OTEL event for both string (CLI) and array (SDK/VS Code)
    // input shapes. Previously gated on `typeof input === 'string'`, so VS Code
    // sessions never emitted user_prompt (anthropics/claude-code#33301).
    // For array input, use the LAST text block: createUserContent pushes the
    // user's message last (after any <ide_selection>/attachment context blocks),
    // so .findLast gets the actual prompt. userPromptText (first block) is kept
    // unchanged for startInteractionSpan to preserve existing span attributes.
    const otelPromptText = typeof input === 'string'
        ? input
        : input.findLast(block => block.type === 'text')?.text || '';
    if (otelPromptText) {
        void (0, events_js_1.logOTelEvent)('user_prompt', {
            prompt_length: String(otelPromptText.length),
            prompt: (0, events_js_1.redactIfDisabled)(otelPromptText),
            'prompt.id': promptId,
        });
    }
    const isNegative = (0, userPromptKeywords_js_1.matchesNegativeKeyword)(userPromptText);
    const isKeepGoing = (0, userPromptKeywords_js_1.matchesKeepGoingKeyword)(userPromptText);
    (0, index_js_1.logEvent)('tengu_input_prompt', {
        is_negative: isNegative,
        is_keep_going: isKeepGoing,
    });
    // If we have pasted images, create a message with image content
    if (imageContentBlocks.length > 0) {
        // Build content: text first, then images below
        const textContent = typeof input === 'string'
            ? input.trim()
                ? [{ type: 'text', text: input }]
                : []
            : input;
        const userMessage = (0, messages_js_1.createUserMessage)({
            content: [...textContent, ...imageContentBlocks],
            uuid: uuid,
            imagePasteIds: imagePasteIds.length > 0 ? imagePasteIds : undefined,
            permissionMode,
            isMeta: isMeta || undefined,
        });
        return {
            messages: [userMessage, ...attachmentMessages],
            shouldQuery: true,
        };
    }
    const userMessage = (0, messages_js_1.createUserMessage)({
        content: input,
        uuid,
        permissionMode,
        isMeta: isMeta || undefined,
    });
    return {
        messages: [userMessage, ...attachmentMessages],
        shouldQuery: true,
    };
}
