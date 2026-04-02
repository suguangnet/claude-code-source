"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sideQuery = sideQuery;
const state_js_1 = require("../bootstrap/state.js");
const betas_js_1 = require("../constants/betas.js");
const system_js_1 = require("../constants/system.js");
const index_js_1 = require("../services/analytics/index.js");
const claude_js_1 = require("../services/api/claude.js");
const client_js_1 = require("../services/api/client.js");
const betas_js_2 = require("./betas.js");
const fingerprint_js_1 = require("./fingerprint.js");
const model_js_1 = require("./model/model.js");
/**
 * Extract text from first user message for fingerprint computation.
 */
function extractFirstUserMessageText(messages) {
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (!firstUserMessage)
        return '';
    const content = firstUserMessage.content;
    if (typeof content === 'string')
        return content;
    // Array of content blocks - find first text block
    const textBlock = content.find(block => block.type === 'text');
    return textBlock?.type === 'text' ? textBlock.text : '';
}
/**
 * Lightweight API wrapper for "side queries" outside the main conversation loop.
 *
 * Use this instead of direct client.beta.messages.create() calls to ensure
 * proper OAuth token validation with fingerprint attribution headers.
 *
 * This handles:
 * - Fingerprint computation for OAuth validation
 * - Attribution header injection
 * - CLI system prompt prefix
 * - Proper betas for the model
 * - API metadata
 * - Model string normalization (strips [1m] suffix for API)
 *
 * @example
 * // Permission explainer
 * await sideQuery({ querySource: 'permission_explainer', model, system: SYSTEM_PROMPT, messages, tools, tool_choice })
 *
 * @example
 * // Session search
 * await sideQuery({ querySource: 'session_search', model, system: SEARCH_PROMPT, messages })
 *
 * @example
 * // Model validation
 * await sideQuery({ querySource: 'model_validation', model, max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] })
 */
async function sideQuery(opts) {
    const { model, system, messages, tools, tool_choice, output_format, max_tokens = 1024, maxRetries = 2, signal, skipSystemPromptPrefix, temperature, thinking, stop_sequences, } = opts;
    const client = await (0, client_js_1.getAnthropicClient)({
        maxRetries,
        model,
        source: 'side_query',
    });
    const betas = [...(0, betas_js_2.getModelBetas)(model)];
    // Add structured-outputs beta if using output_format and provider supports it
    if (output_format &&
        (0, betas_js_2.modelSupportsStructuredOutputs)(model) &&
        !betas.includes(betas_js_1.STRUCTURED_OUTPUTS_BETA_HEADER)) {
        betas.push(betas_js_1.STRUCTURED_OUTPUTS_BETA_HEADER);
    }
    // Extract first user message text for fingerprint
    const messageText = extractFirstUserMessageText(messages);
    // Compute fingerprint for OAuth attribution
    const fingerprint = (0, fingerprint_js_1.computeFingerprint)(messageText, MACRO.VERSION);
    const attributionHeader = (0, system_js_1.getAttributionHeader)(fingerprint);
    // Build system as array to keep attribution header in its own block
    // (prevents server-side parsing from including system content in cc_entrypoint)
    const systemBlocks = [
        attributionHeader ? { type: 'text', text: attributionHeader } : null,
        // Skip CLI system prompt prefix for internal classifiers that provide their own prompt
        ...(skipSystemPromptPrefix
            ? []
            : [
                {
                    type: 'text',
                    text: (0, system_js_1.getCLISyspromptPrefix)({
                        isNonInteractive: false,
                        hasAppendSystemPrompt: false,
                    }),
                },
            ]),
        ...(Array.isArray(system)
            ? system
            : system
                ? [{ type: 'text', text: system }]
                : []),
    ].filter((block) => block !== null);
    let thinkingConfig;
    if (thinking === false) {
        thinkingConfig = { type: 'disabled' };
    }
    else if (thinking !== undefined) {
        thinkingConfig = {
            type: 'enabled',
            budget_tokens: Math.min(thinking, max_tokens - 1),
        };
    }
    const normalizedModel = (0, model_js_1.normalizeModelStringForAPI)(model);
    const start = Date.now();
    // biome-ignore lint/plugin: this IS the wrapper that handles OAuth attribution
    const response = await client.beta.messages.create({
        model: normalizedModel,
        max_tokens,
        system: systemBlocks,
        messages,
        ...(tools && { tools }),
        ...(tool_choice && { tool_choice }),
        ...(output_format && { output_config: { format: output_format } }),
        ...(temperature !== undefined && { temperature }),
        ...(stop_sequences && { stop_sequences }),
        ...(thinkingConfig && { thinking: thinkingConfig }),
        ...(betas.length > 0 && { betas }),
        metadata: (0, claude_js_1.getAPIMetadata)(),
    }, { signal });
    const requestId = response._request_id ?? undefined;
    const now = Date.now();
    const lastCompletion = (0, state_js_1.getLastApiCompletionTimestamp)();
    (0, index_js_1.logEvent)('tengu_api_success', {
        requestId: requestId,
        querySource: opts.querySource,
        model: normalizedModel,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cachedInputTokens: response.usage.cache_read_input_tokens ?? 0,
        uncachedInputTokens: response.usage.cache_creation_input_tokens ?? 0,
        durationMsIncludingRetries: now - start,
        timeSinceLastApiCallMs: lastCompletion !== null ? now - lastCompletion : undefined,
    });
    (0, state_js_1.setLastApiCompletionTimestamp)(now);
    return response;
}
