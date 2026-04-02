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
exports.countTokensWithAPI = countTokensWithAPI;
exports.countMessagesTokensWithAPI = countMessagesTokensWithAPI;
exports.roughTokenCountEstimation = roughTokenCountEstimation;
exports.bytesPerTokenForFileType = bytesPerTokenForFileType;
exports.roughTokenCountEstimationForFileType = roughTokenCountEstimationForFileType;
exports.countTokensViaHaikuFallback = countTokensViaHaikuFallback;
exports.roughTokenCountEstimationForMessages = roughTokenCountEstimationForMessages;
exports.roughTokenCountEstimationForMessage = roughTokenCountEstimationForMessage;
const providers_js_1 = require("src/utils/model/providers.js");
const betas_js_1 = require("../constants/betas.js");
const betas_js_2 = require("../utils/betas.js");
const envUtils_js_1 = require("../utils/envUtils.js");
const log_js_1 = require("../utils/log.js");
const messages_js_1 = require("../utils/messages.js");
const bedrock_js_1 = require("../utils/model/bedrock.js");
const model_js_1 = require("../utils/model/model.js");
const slowOperations_js_1 = require("../utils/slowOperations.js");
const toolSearch_js_1 = require("../utils/toolSearch.js");
const claude_js_1 = require("./api/claude.js");
const client_js_1 = require("./api/client.js");
const vcr_js_1 = require("./vcr.js");
// Minimal values for token counting with thinking enabled
// API constraint: max_tokens must be greater than thinking.budget_tokens
const TOKEN_COUNT_THINKING_BUDGET = 1024;
const TOKEN_COUNT_MAX_TOKENS = 2048;
/**
 * Check if messages contain thinking blocks
 */
function hasThinkingBlocks(messages) {
    for (const message of messages) {
        if (message.role === 'assistant' && Array.isArray(message.content)) {
            for (const block of message.content) {
                if (typeof block === 'object' &&
                    block !== null &&
                    'type' in block &&
                    (block.type === 'thinking' || block.type === 'redacted_thinking')) {
                    return true;
                }
            }
        }
    }
    return false;
}
/**
 * Strip tool search-specific fields from messages before sending for token counting.
 * This removes 'caller' from tool_use blocks and 'tool_reference' from tool_result content.
 * These fields are only valid with the tool search beta and will cause errors otherwise.
 *
 * Note: We use 'as unknown as' casts because the SDK types don't include tool search beta fields,
 * but at runtime these fields may exist from API responses when tool search was enabled.
 */
function stripToolSearchFieldsFromMessages(messages) {
    return messages.map(message => {
        if (!Array.isArray(message.content)) {
            return message;
        }
        const normalizedContent = message.content.map(block => {
            // Strip 'caller' from tool_use blocks (assistant messages)
            if (block.type === 'tool_use') {
                // Destructure to exclude any extra fields like 'caller'
                const toolUse = block;
                return {
                    type: 'tool_use',
                    id: toolUse.id,
                    name: toolUse.name,
                    input: toolUse.input,
                };
            }
            // Strip tool_reference blocks from tool_result content (user messages)
            if (block.type === 'tool_result') {
                const toolResult = block;
                if (Array.isArray(toolResult.content)) {
                    const filteredContent = toolResult.content.filter(c => !(0, toolSearch_js_1.isToolReferenceBlock)(c));
                    if (filteredContent.length === 0) {
                        return {
                            ...toolResult,
                            content: [{ type: 'text', text: '[tool references]' }],
                        };
                    }
                    if (filteredContent.length !== toolResult.content.length) {
                        return {
                            ...toolResult,
                            content: filteredContent,
                        };
                    }
                }
            }
            return block;
        });
        return {
            ...message,
            content: normalizedContent,
        };
    });
}
async function countTokensWithAPI(content) {
    // Special case for empty content - API doesn't accept empty messages
    if (!content) {
        return 0;
    }
    const message = {
        role: 'user',
        content: content,
    };
    return countMessagesTokensWithAPI([message], []);
}
async function countMessagesTokensWithAPI(messages, tools) {
    return (0, vcr_js_1.withTokenCountVCR)(messages, tools, async () => {
        try {
            const model = (0, model_js_1.getMainLoopModel)();
            const betas = (0, betas_js_2.getModelBetas)(model);
            const containsThinking = hasThinkingBlocks(messages);
            if ((0, providers_js_1.getAPIProvider)() === 'bedrock') {
                // @anthropic-sdk/bedrock-sdk doesn't support countTokens currently
                return countTokensWithBedrock({
                    model: (0, model_js_1.normalizeModelStringForAPI)(model),
                    messages,
                    tools,
                    betas,
                    containsThinking,
                });
            }
            const anthropic = await (0, client_js_1.getAnthropicClient)({
                maxRetries: 1,
                model,
                source: 'count_tokens',
            });
            const filteredBetas = (0, providers_js_1.getAPIProvider)() === 'vertex'
                ? betas.filter(b => betas_js_1.VERTEX_COUNT_TOKENS_ALLOWED_BETAS.has(b))
                : betas;
            const response = await anthropic.beta.messages.countTokens({
                model: (0, model_js_1.normalizeModelStringForAPI)(model),
                messages: 
                // When we pass tools and no messages, we need to pass a dummy message
                // to get an accurate tool token count.
                messages.length > 0 ? messages : [{ role: 'user', content: 'foo' }],
                tools,
                ...(filteredBetas.length > 0 && { betas: filteredBetas }),
                // Enable thinking if messages contain thinking blocks
                ...(containsThinking && {
                    thinking: {
                        type: 'enabled',
                        budget_tokens: TOKEN_COUNT_THINKING_BUDGET,
                    },
                }),
            });
            if (typeof response.input_tokens !== 'number') {
                // Vertex client throws
                // Bedrock client succeeds with { Output: { __type: 'com.amazon.coral.service#UnknownOperationException' }, Version: '1.0' }
                return null;
            }
            return response.input_tokens;
        }
        catch (error) {
            (0, log_js_1.logError)(error);
            return null;
        }
    });
}
function roughTokenCountEstimation(content, bytesPerToken = 4) {
    return Math.round(content.length / bytesPerToken);
}
/**
 * Returns an estimated bytes-per-token ratio for a given file extension.
 * Dense JSON has many single-character tokens (`{`, `}`, `:`, `,`, `"`)
 * which makes the real ratio closer to 2 rather than the default 4.
 */
function bytesPerTokenForFileType(fileExtension) {
    switch (fileExtension) {
        case 'json':
        case 'jsonl':
        case 'jsonc':
            return 2;
        default:
            return 4;
    }
}
/**
 * Like {@link roughTokenCountEstimation} but uses a more accurate
 * bytes-per-token ratio when the file type is known.
 *
 * This matters when the API-based token count is unavailable (e.g. on
 * Bedrock) and we fall back to the rough estimate — an underestimate can
 * let an oversized tool result slip into the conversation.
 */
function roughTokenCountEstimationForFileType(content, fileExtension) {
    return roughTokenCountEstimation(content, bytesPerTokenForFileType(fileExtension));
}
/**
 * Estimates token count for a Message object by extracting and analyzing its text content.
 * This provides a more reliable estimate than getTokenUsage for messages that may have been compacted.
 * Uses Haiku for token counting (Haiku 4.5 supports thinking blocks), except:
 * - Vertex global region: uses Sonnet (Haiku not available)
 * - Bedrock with thinking blocks: uses Sonnet (Haiku 3.5 doesn't support thinking)
 */
async function countTokensViaHaikuFallback(messages, tools) {
    // Check if messages contain thinking blocks
    const containsThinking = hasThinkingBlocks(messages);
    // If we're on Vertex and using global region, always use Sonnet since Haiku is not available there.
    const isVertexGlobalEndpoint = (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_USE_VERTEX) &&
        (0, envUtils_js_1.getVertexRegionForModel)((0, model_js_1.getSmallFastModel)()) === 'global';
    // If we're on Bedrock with thinking blocks, use Sonnet since Haiku 3.5 doesn't support thinking
    const isBedrockWithThinking = (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_USE_BEDROCK) && containsThinking;
    // If we're on Vertex with thinking blocks, use Sonnet since Haiku 3.5 doesn't support thinking
    const isVertexWithThinking = (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_USE_VERTEX) && containsThinking;
    // Otherwise always use Haiku - Haiku 4.5 supports thinking blocks.
    // WARNING: if you change this to use a non-Haiku model, this request will fail in 1P unless it uses getCLISyspromptPrefix.
    // Note: We don't need Sonnet for tool_reference blocks because we strip them via
    // stripToolSearchFieldsFromMessages() before sending.
    // Use getSmallFastModel() to respect ANTHROPIC_SMALL_FAST_MODEL env var for Bedrock users
    // with global inference profiles (see issue #10883).
    const model = isVertexGlobalEndpoint || isBedrockWithThinking || isVertexWithThinking
        ? (0, model_js_1.getDefaultSonnetModel)()
        : (0, model_js_1.getSmallFastModel)();
    const anthropic = await (0, client_js_1.getAnthropicClient)({
        maxRetries: 1,
        model,
        source: 'count_tokens',
    });
    // Strip tool search-specific fields (caller, tool_reference) before sending
    // These fields are only valid with the tool search beta header
    const normalizedMessages = stripToolSearchFieldsFromMessages(messages);
    const messagesToSend = normalizedMessages.length > 0
        ? normalizedMessages
        : [{ role: 'user', content: 'count' }];
    const betas = (0, betas_js_2.getModelBetas)(model);
    // Filter betas for Vertex - some betas (like web-search) cause 400 errors
    // on certain Vertex endpoints. See issue #10789.
    const filteredBetas = (0, providers_js_1.getAPIProvider)() === 'vertex'
        ? betas.filter(b => betas_js_1.VERTEX_COUNT_TOKENS_ALLOWED_BETAS.has(b))
        : betas;
    // biome-ignore lint/plugin: token counting needs specialized parameters (thinking, betas) that sideQuery doesn't support
    const response = await anthropic.beta.messages.create({
        model: (0, model_js_1.normalizeModelStringForAPI)(model),
        max_tokens: containsThinking ? TOKEN_COUNT_MAX_TOKENS : 1,
        messages: messagesToSend,
        tools: tools.length > 0 ? tools : undefined,
        ...(filteredBetas.length > 0 && { betas: filteredBetas }),
        metadata: (0, claude_js_1.getAPIMetadata)(),
        ...(0, claude_js_1.getExtraBodyParams)(),
        // Enable thinking if messages contain thinking blocks
        ...(containsThinking && {
            thinking: {
                type: 'enabled',
                budget_tokens: TOKEN_COUNT_THINKING_BUDGET,
            },
        }),
    });
    const usage = response.usage;
    const inputTokens = usage.input_tokens;
    const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
    const cacheReadTokens = usage.cache_read_input_tokens || 0;
    return inputTokens + cacheCreationTokens + cacheReadTokens;
}
function roughTokenCountEstimationForMessages(messages) {
    let totalTokens = 0;
    for (const message of messages) {
        totalTokens += roughTokenCountEstimationForMessage(message);
    }
    return totalTokens;
}
function roughTokenCountEstimationForMessage(message) {
    if ((message.type === 'assistant' || message.type === 'user') &&
        message.message?.content) {
        return roughTokenCountEstimationForContent(message.message?.content);
    }
    if (message.type === 'attachment' && message.attachment) {
        const userMessages = (0, messages_js_1.normalizeAttachmentForAPI)(message.attachment);
        let total = 0;
        for (const userMsg of userMessages) {
            total += roughTokenCountEstimationForContent(userMsg.message.content);
        }
        return total;
    }
    return 0;
}
function roughTokenCountEstimationForContent(content) {
    if (!content) {
        return 0;
    }
    if (typeof content === 'string') {
        return roughTokenCountEstimation(content);
    }
    let totalTokens = 0;
    for (const block of content) {
        totalTokens += roughTokenCountEstimationForBlock(block);
    }
    return totalTokens;
}
function roughTokenCountEstimationForBlock(block) {
    if (typeof block === 'string') {
        return roughTokenCountEstimation(block);
    }
    if (block.type === 'text') {
        return roughTokenCountEstimation(block.text);
    }
    if (block.type === 'image' || block.type === 'document') {
        // https://platform.claude.com/docs/en/build-with-claude/vision#calculate-image-costs
        // tokens = (width px * height px)/750
        // Images are resized to max 2000x2000 (5333 tokens). Use a conservative
        // estimate that matches microCompact's IMAGE_MAX_TOKEN_SIZE to avoid
        // underestimating and triggering auto-compact too late.
        //
        // document: base64 PDF in source.data.  Must NOT reach the
        // jsonStringify catch-all — a 1MB PDF is ~1.33M base64 chars →
        // ~325k estimated tokens, vs the ~2000 the API actually charges.
        // Same constant as microCompact's calculateToolResultTokens.
        return 2000;
    }
    if (block.type === 'tool_result') {
        return roughTokenCountEstimationForContent(block.content);
    }
    if (block.type === 'tool_use') {
        // input is the JSON the model generated — arbitrarily large (bash
        // commands, Edit diffs, file contents).  Stringify once for the
        // char count; the API re-serializes anyway so this is what it sees.
        return roughTokenCountEstimation(block.name + (0, slowOperations_js_1.jsonStringify)(block.input ?? {}));
    }
    if (block.type === 'thinking') {
        return roughTokenCountEstimation(block.thinking);
    }
    if (block.type === 'redacted_thinking') {
        return roughTokenCountEstimation(block.data);
    }
    // server_tool_use, web_search_tool_result, mcp_tool_use, etc. —
    // text-like payloads (tool inputs, search results, no base64).
    // Stringify-length tracks the serialized form the API sees; the
    // key/bracket overhead is single-digit percent on real blocks.
    return roughTokenCountEstimation((0, slowOperations_js_1.jsonStringify)(block));
}
async function countTokensWithBedrock({ model, messages, tools, betas, containsThinking, }) {
    try {
        const client = await (0, bedrock_js_1.createBedrockRuntimeClient)();
        // Bedrock CountTokens requires a model ID, not an inference profile / ARN
        const modelId = (0, bedrock_js_1.isFoundationModel)(model)
            ? model
            : await (0, bedrock_js_1.getInferenceProfileBackingModel)(model);
        if (!modelId) {
            return null;
        }
        const requestBody = {
            anthropic_version: 'bedrock-2023-05-31',
            // When we pass tools and no messages, we need to pass a dummy message
            // to get an accurate tool token count.
            messages: messages.length > 0 ? messages : [{ role: 'user', content: 'foo' }],
            max_tokens: containsThinking ? TOKEN_COUNT_MAX_TOKENS : 1,
            ...(tools.length > 0 && { tools }),
            ...(betas.length > 0 && { anthropic_beta: betas }),
            ...(containsThinking && {
                thinking: {
                    type: 'enabled',
                    budget_tokens: TOKEN_COUNT_THINKING_BUDGET,
                },
            }),
        };
        const { CountTokensCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-bedrock-runtime')));
        const input = {
            modelId,
            input: {
                invokeModel: {
                    body: new TextEncoder().encode((0, slowOperations_js_1.jsonStringify)(requestBody)),
                },
            },
        };
        const response = await client.send(new CountTokensCommand(input));
        const tokenCount = response.inputTokens ?? null;
        return tokenCount;
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return null;
    }
}
