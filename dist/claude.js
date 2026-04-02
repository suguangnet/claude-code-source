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
exports.MAX_NON_STREAMING_TOKENS = void 0;
exports.getExtraBodyParams = getExtraBodyParams;
exports.getPromptCachingEnabled = getPromptCachingEnabled;
exports.getCacheControl = getCacheControl;
exports.configureTaskBudgetParams = configureTaskBudgetParams;
exports.getAPIMetadata = getAPIMetadata;
exports.verifyApiKey = verifyApiKey;
exports.userMessageToMessageParam = userMessageToMessageParam;
exports.assistantMessageToMessageParam = assistantMessageToMessageParam;
exports.queryModelWithoutStreaming = queryModelWithoutStreaming;
exports.queryModelWithStreaming = queryModelWithStreaming;
exports.executeNonStreamingRequest = executeNonStreamingRequest;
exports.stripExcessMediaItems = stripExcessMediaItems;
exports.cleanupStream = cleanupStream;
exports.updateUsage = updateUsage;
exports.accumulateUsage = accumulateUsage;
exports.addCacheBreakpoints = addCacheBreakpoints;
exports.buildSystemPromptBlocks = buildSystemPromptBlocks;
exports.queryHaiku = queryHaiku;
exports.queryWithModel = queryWithModel;
exports.adjustParamsForNonStreaming = adjustParamsForNonStreaming;
exports.getMaxOutputTokensForModel = getMaxOutputTokensForModel;
const crypto_1 = require("crypto");
const providers_js_1 = require("src/utils/model/providers.js");
const system_js_1 = require("../../constants/system.js");
const Tool_js_1 = require("../../Tool.js");
const connectorText_js_1 = require("../../types/connectorText.js");
const api_js_1 = require("../../utils/api.js");
const auth_js_1 = require("../../utils/auth.js");
const betas_js_1 = require("../../utils/betas.js");
const config_js_1 = require("../../utils/config.js");
const context_js_1 = require("../../utils/context.js");
const effort_js_1 = require("../../utils/effort.js");
const envUtils_js_1 = require("../../utils/envUtils.js");
const errors_js_1 = require("../../utils/errors.js");
const fingerprint_js_1 = require("../../utils/fingerprint.js");
const log_js_1 = require("../../utils/log.js");
const messages_js_1 = require("../../utils/messages.js");
const model_js_1 = require("../../utils/model/model.js");
const systemPromptType_js_1 = require("../../utils/systemPromptType.js");
const tokens_js_1 = require("../../utils/tokens.js");
const growthbook_js_1 = require("../analytics/growthbook.js");
const claudeAiLimits_js_1 = require("../claudeAiLimits.js");
const apiMicrocompact_js_1 = require("../compact/apiMicrocompact.js");
/* eslint-disable @typescript-eslint/no-require-imports */
const autoModeStateModule = (0, bun_bundle_1.feature)('TRANSCRIPT_CLASSIFIER')
    ? require('../../utils/permissions/autoModeState.js')
    : null;
const bun_bundle_1 = require("bun:bundle");
const error_1 = require("@anthropic-ai/sdk/error");
const state_js_1 = require("src/bootstrap/state.js");
const betas_js_2 = require("src/constants/betas.js");
const cost_tracker_js_1 = require("src/cost-tracker.js");
const growthbook_js_2 = require("src/services/analytics/growthbook.js");
const advisor_js_1 = require("src/utils/advisor.js");
const agentContext_js_1 = require("src/utils/agentContext.js");
const auth_js_2 = require("src/utils/auth.js");
const betas_js_3 = require("src/utils/betas.js");
const common_js_1 = require("src/utils/claudeInChrome/common.js");
const prompt_js_1 = require("src/utils/claudeInChrome/prompt.js");
const context_js_2 = require("src/utils/context.js");
const debug_js_1 = require("src/utils/debug.js");
const diagLogs_js_1 = require("src/utils/diagLogs.js");
const effort_js_2 = require("src/utils/effort.js");
const fastMode_js_1 = require("src/utils/fastMode.js");
const generators_js_1 = require("src/utils/generators.js");
const headlessProfiler_js_1 = require("src/utils/headlessProfiler.js");
const mcpInstructionsDelta_js_1 = require("src/utils/mcpInstructionsDelta.js");
const modelCost_js_1 = require("src/utils/modelCost.js");
const queryProfiler_js_1 = require("src/utils/queryProfiler.js");
const thinking_js_1 = require("src/utils/thinking.js");
const toolSearch_js_1 = require("src/utils/toolSearch.js");
const apiLimits_js_1 = require("../../constants/apiLimits.js");
const betas_js_4 = require("../../constants/betas.js");
const prompt_js_2 = require("../../tools/ToolSearchTool/prompt.js");
const array_js_1 = require("../../utils/array.js");
const contentArray_js_1 = require("../../utils/contentArray.js");
const envValidation_js_1 = require("../../utils/envValidation.js");
const json_js_1 = require("../../utils/json.js");
const bedrock_js_1 = require("../../utils/model/bedrock.js");
const model_js_2 = require("../../utils/model/model.js");
const sessionActivity_js_1 = require("../../utils/sessionActivity.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const sessionTracing_js_1 = require("../../utils/telemetry/sessionTracing.js");
/* eslint-enable @typescript-eslint/no-require-imports */
const index_js_1 = require("../analytics/index.js");
const microCompact_js_1 = require("../compact/microCompact.js");
const manager_js_1 = require("../lsp/manager.js");
const utils_js_1 = require("../mcp/utils.js");
const vcr_js_1 = require("../vcr.js");
const client_js_1 = require("./client.js");
const errors_js_2 = require("./errors.js");
const logging_js_1 = require("./logging.js");
const promptCacheBreakDetection_js_1 = require("./promptCacheBreakDetection.js");
const withRetry_js_1 = require("./withRetry.js");
/**
 * Assemble the extra body parameters for the API request, based on the
 * CLAUDE_CODE_EXTRA_BODY environment variable if present and on any beta
 * headers (primarily for Bedrock requests).
 *
 * @param betaHeaders - An array of beta headers to include in the request.
 * @returns A JSON object representing the extra body parameters.
 */
function getExtraBodyParams(betaHeaders) {
    // Parse user's extra body parameters first
    const extraBodyStr = process.env.CLAUDE_CODE_EXTRA_BODY;
    let result = {};
    if (extraBodyStr) {
        try {
            // Parse as JSON, which can be null, boolean, number, string, array or object
            const parsed = (0, json_js_1.safeParseJSON)(extraBodyStr);
            // We expect an object with key-value pairs to spread into API parameters
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                // Shallow clone — safeParseJSON is LRU-cached and returns the same
                // object reference for the same string. Mutating `result` below
                // would poison the cache, causing stale values to persist.
                result = { ...parsed };
            }
            else {
                (0, debug_js_1.logForDebugging)(`CLAUDE_CODE_EXTRA_BODY env var must be a JSON object, but was given ${extraBodyStr}`, { level: 'error' });
            }
        }
        catch (error) {
            (0, debug_js_1.logForDebugging)(`Error parsing CLAUDE_CODE_EXTRA_BODY: ${(0, errors_js_1.errorMessage)(error)}`, { level: 'error' });
        }
    }
    // Anti-distillation: send fake_tools opt-in for 1P CLI only
    if ((0, bun_bundle_1.feature)('ANTI_DISTILLATION_CC')
        ? process.env.CLAUDE_CODE_ENTRYPOINT === 'cli' &&
            (0, betas_js_3.shouldIncludeFirstPartyOnlyBetas)() &&
            (0, growthbook_js_2.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_anti_distill_fake_tool_injection', false)
        : false) {
        result.anti_distillation = ['fake_tools'];
    }
    // Handle beta headers if provided
    if (betaHeaders && betaHeaders.length > 0) {
        if (result.anthropic_beta && Array.isArray(result.anthropic_beta)) {
            // Add to existing array, avoiding duplicates
            const existingHeaders = result.anthropic_beta;
            const newHeaders = betaHeaders.filter(header => !existingHeaders.includes(header));
            result.anthropic_beta = [...existingHeaders, ...newHeaders];
        }
        else {
            // Create new array with the beta headers
            result.anthropic_beta = betaHeaders;
        }
    }
    return result;
}
function getPromptCachingEnabled(model) {
    // Global disable takes precedence
    if ((0, envUtils_js_1.isEnvTruthy)(process.env.DISABLE_PROMPT_CACHING))
        return false;
    // Check if we should disable for small/fast model
    if ((0, envUtils_js_1.isEnvTruthy)(process.env.DISABLE_PROMPT_CACHING_HAIKU)) {
        const smallFastModel = (0, model_js_1.getSmallFastModel)();
        if (model === smallFastModel)
            return false;
    }
    // Check if we should disable for default Sonnet
    if ((0, envUtils_js_1.isEnvTruthy)(process.env.DISABLE_PROMPT_CACHING_SONNET)) {
        const defaultSonnet = (0, model_js_1.getDefaultSonnetModel)();
        if (model === defaultSonnet)
            return false;
    }
    // Check if we should disable for default Opus
    if ((0, envUtils_js_1.isEnvTruthy)(process.env.DISABLE_PROMPT_CACHING_OPUS)) {
        const defaultOpus = (0, model_js_1.getDefaultOpusModel)();
        if (model === defaultOpus)
            return false;
    }
    return true;
}
function getCacheControl({ scope, querySource, } = {}) {
    return {
        type: 'ephemeral',
        ...(should1hCacheTTL(querySource) && { ttl: '1h' }),
        ...(scope === 'global' && { scope }),
    };
}
/**
 * Determines if 1h TTL should be used for prompt caching.
 *
 * Only applied when:
 * 1. User is eligible (ant or subscriber within rate limits)
 * 2. The query source matches a pattern in the GrowthBook allowlist
 *
 * GrowthBook config shape: { allowlist: string[] }
 * Patterns support trailing '*' for prefix matching.
 * Examples:
 * - { allowlist: ["repl_main_thread*", "sdk"] } — main thread + SDK only
 * - { allowlist: ["repl_main_thread*", "sdk", "agent:*"] } — also subagents
 * - { allowlist: ["*"] } — all sources
 *
 * The allowlist is cached in STATE for session stability — prevents mixed
 * TTLs when GrowthBook's disk cache updates mid-request.
 */
function should1hCacheTTL(querySource) {
    // 3P Bedrock users get 1h TTL when opted in via env var — they manage their own billing
    // No GrowthBook gating needed since 3P users don't have GrowthBook configured
    if ((0, providers_js_1.getAPIProvider)() === 'bedrock' &&
        (0, envUtils_js_1.isEnvTruthy)(process.env.ENABLE_PROMPT_CACHING_1H_BEDROCK)) {
        return true;
    }
    // Latch eligibility in bootstrap state for session stability — prevents
    // mid-session overage flips from changing the cache_control TTL, which
    // would bust the server-side prompt cache (~20K tokens per flip).
    let userEligible = (0, state_js_1.getPromptCache1hEligible)();
    if (userEligible === null) {
        userEligible =
            process.env.USER_TYPE === 'ant' ||
                ((0, auth_js_2.isClaudeAISubscriber)() && !claudeAiLimits_js_1.currentLimits.isUsingOverage);
        (0, state_js_1.setPromptCache1hEligible)(userEligible);
    }
    if (!userEligible)
        return false;
    // Cache allowlist in bootstrap state for session stability — prevents mixed
    // TTLs when GrowthBook's disk cache updates mid-request
    let allowlist = (0, state_js_1.getPromptCache1hAllowlist)();
    if (allowlist === null) {
        const config = (0, growthbook_js_2.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_prompt_cache_1h_config', {});
        allowlist = config.allowlist ?? [];
        (0, state_js_1.setPromptCache1hAllowlist)(allowlist);
    }
    return (querySource !== undefined &&
        allowlist.some(pattern => pattern.endsWith('*')
            ? querySource.startsWith(pattern.slice(0, -1))
            : querySource === pattern));
}
/**
 * Configure effort parameters for API request.
 *
 */
function configureEffortParams(effortValue, outputConfig, extraBodyParams, betas, model) {
    if (!(0, effort_js_2.modelSupportsEffort)(model) || 'effort' in outputConfig) {
        return;
    }
    if (effortValue === undefined) {
        betas.push(betas_js_2.EFFORT_BETA_HEADER);
    }
    else if (typeof effortValue === 'string') {
        // Send string effort level as is
        outputConfig.effort = effortValue;
        betas.push(betas_js_2.EFFORT_BETA_HEADER);
    }
    else if (process.env.USER_TYPE === 'ant') {
        // Numeric effort override - ant-only (uses anthropic_internal)
        const existingInternal = extraBodyParams.anthropic_internal || {};
        extraBodyParams.anthropic_internal = {
            ...existingInternal,
            effort_override: effortValue,
        };
    }
}
function configureTaskBudgetParams(taskBudget, outputConfig, betas) {
    if (!taskBudget ||
        'task_budget' in outputConfig ||
        !(0, betas_js_3.shouldIncludeFirstPartyOnlyBetas)()) {
        return;
    }
    outputConfig.task_budget = {
        type: 'tokens',
        total: taskBudget.total,
        ...(taskBudget.remaining !== undefined && {
            remaining: taskBudget.remaining,
        }),
    };
    if (!betas.includes(betas_js_2.TASK_BUDGETS_BETA_HEADER)) {
        betas.push(betas_js_2.TASK_BUDGETS_BETA_HEADER);
    }
}
function getAPIMetadata() {
    // https://docs.google.com/document/d/1dURO9ycXXQCBS0V4Vhl4poDBRgkelFc5t2BNPoEgH5Q/edit?tab=t.0#heading=h.5g7nec5b09w5
    let extra = {};
    const extraStr = process.env.CLAUDE_CODE_EXTRA_METADATA;
    if (extraStr) {
        const parsed = (0, json_js_1.safeParseJSON)(extraStr, false);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            extra = parsed;
        }
        else {
            (0, debug_js_1.logForDebugging)(`CLAUDE_CODE_EXTRA_METADATA env var must be a JSON object, but was given ${extraStr}`, { level: 'error' });
        }
    }
    return {
        user_id: (0, slowOperations_js_1.jsonStringify)({
            ...extra,
            device_id: (0, config_js_1.getOrCreateUserID)(),
            // Only include OAuth account UUID when actively using OAuth authentication
            account_uuid: (0, auth_js_1.getOauthAccountInfo)()?.accountUuid ?? '',
            session_id: (0, state_js_1.getSessionId)(),
        }),
    };
}
async function verifyApiKey(apiKey, isNonInteractiveSession) {
    // Skip API verification if running in print mode (isNonInteractiveSession)
    if (isNonInteractiveSession) {
        return true;
    }
    try {
        // WARNING: if you change this to use a non-Haiku model, this request will fail in 1P unless it uses getCLISyspromptPrefix.
        const model = (0, model_js_1.getSmallFastModel)();
        const betas = (0, betas_js_1.getModelBetas)(model);
        return await (0, generators_js_1.returnValue)((0, withRetry_js_1.withRetry)(() => (0, client_js_1.getAnthropicClient)({
            apiKey,
            maxRetries: 3,
            model,
            source: 'verify_api_key',
        }), async (anthropic) => {
            const messages = [{ role: 'user', content: 'test' }];
            // biome-ignore lint/plugin: API key verification is intentionally a minimal direct call
            await anthropic.beta.messages.create({
                model,
                max_tokens: 1,
                messages,
                temperature: 1,
                ...(betas.length > 0 && { betas }),
                metadata: getAPIMetadata(),
                ...getExtraBodyParams(),
            });
            return true;
        }, { maxRetries: 2, model, thinkingConfig: { type: 'disabled' } }));
    }
    catch (errorFromRetry) {
        let error = errorFromRetry;
        if (errorFromRetry instanceof withRetry_js_1.CannotRetryError) {
            error = errorFromRetry.originalError;
        }
        (0, log_js_1.logError)(error);
        // Check for authentication error
        if (error instanceof Error &&
            error.message.includes('{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}')) {
            return false;
        }
        throw error;
    }
}
function userMessageToMessageParam(message, addCache = false, enablePromptCaching, querySource) {
    if (addCache) {
        if (typeof message.message.content === 'string') {
            return {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: message.message.content,
                        ...(enablePromptCaching && {
                            cache_control: getCacheControl({ querySource }),
                        }),
                    },
                ],
            };
        }
        else {
            return {
                role: 'user',
                content: message.message.content.map((_, i) => ({
                    ..._,
                    ...(i === message.message.content.length - 1
                        ? enablePromptCaching
                            ? { cache_control: getCacheControl({ querySource }) }
                            : {}
                        : {}),
                })),
            };
        }
    }
    // Clone array content to prevent in-place mutations (e.g., insertCacheEditsBlock's
    // splice) from contaminating the original message. Without cloning, multiple calls
    // to addCacheBreakpoints share the same array and each splices in duplicate cache_edits.
    return {
        role: 'user',
        content: Array.isArray(message.message.content)
            ? [...message.message.content]
            : message.message.content,
    };
}
function assistantMessageToMessageParam(message, addCache = false, enablePromptCaching, querySource) {
    if (addCache) {
        if (typeof message.message.content === 'string') {
            return {
                role: 'assistant',
                content: [
                    {
                        type: 'text',
                        text: message.message.content,
                        ...(enablePromptCaching && {
                            cache_control: getCacheControl({ querySource }),
                        }),
                    },
                ],
            };
        }
        else {
            return {
                role: 'assistant',
                content: message.message.content.map((_, i) => ({
                    ..._,
                    ...(i === message.message.content.length - 1 &&
                        _.type !== 'thinking' &&
                        _.type !== 'redacted_thinking' &&
                        ((0, bun_bundle_1.feature)('CONNECTOR_TEXT') ? !(0, connectorText_js_1.isConnectorTextBlock)(_) : true)
                        ? enablePromptCaching
                            ? { cache_control: getCacheControl({ querySource }) }
                            : {}
                        : {}),
                })),
            };
        }
    }
    return {
        role: 'assistant',
        content: message.message.content,
    };
}
async function queryModelWithoutStreaming({ messages, systemPrompt, thinkingConfig, tools, signal, options, }) {
    // Store the assistant message but continue consuming the generator to ensure
    // logAPISuccessAndDuration gets called (which happens after all yields)
    let assistantMessage;
    for await (const message of (0, vcr_js_1.withStreamingVCR)(messages, async function* () {
        yield* queryModel(messages, systemPrompt, thinkingConfig, tools, signal, options);
    })) {
        if (message.type === 'assistant') {
            assistantMessage = message;
        }
    }
    if (!assistantMessage) {
        // If the signal was aborted, throw APIUserAbortError instead of a generic error
        // This allows callers to handle abort scenarios gracefully
        if (signal.aborted) {
            throw new error_1.APIUserAbortError();
        }
        throw new Error('No assistant message found');
    }
    return assistantMessage;
}
async function* queryModelWithStreaming({ messages, systemPrompt, thinkingConfig, tools, signal, options, }) {
    return yield* (0, vcr_js_1.withStreamingVCR)(messages, async function* () {
        yield* queryModel(messages, systemPrompt, thinkingConfig, tools, signal, options);
    });
}
/**
 * Determines if an LSP tool should be deferred (tool appears with defer_loading: true)
 * because LSP initialization is not yet complete.
 */
function shouldDeferLspTool(tool) {
    if (!('isLsp' in tool) || !tool.isLsp) {
        return false;
    }
    const status = (0, manager_js_1.getInitializationStatus)();
    // Defer when pending or not started
    return status.status === 'pending' || status.status === 'not-started';
}
/**
 * Per-attempt timeout for non-streaming fallback requests, in milliseconds.
 * Reads API_TIMEOUT_MS when set so slow backends and the streaming path
 * share the same ceiling.
 *
 * Remote sessions default to 120s to stay under CCR's container idle-kill
 * (~5min) so a hung fallback to a wedged backend surfaces a clean
 * APIConnectionTimeoutError instead of stalling past SIGKILL.
 *
 * Otherwise defaults to 300s — long enough for slow backends without
 * approaching the API's 10-minute non-streaming boundary.
 */
function getNonstreamingFallbackTimeoutMs() {
    const override = parseInt(process.env.API_TIMEOUT_MS || '', 10);
    if (override)
        return override;
    return (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_REMOTE) ? 120000 : 300000;
}
/**
 * Helper generator for non-streaming API requests.
 * Encapsulates the common pattern of creating a withRetry generator,
 * iterating to yield system messages, and returning the final BetaMessage.
 */
async function* executeNonStreamingRequest(clientOptions, retryOptions, paramsFromContext, onAttempt, captureRequest, 
/**
 * Request ID of the failed streaming attempt this fallback is recovering
 * from. Emitted in tengu_nonstreaming_fallback_error for funnel correlation.
 */
originatingRequestId) {
    const fallbackTimeoutMs = getNonstreamingFallbackTimeoutMs();
    const generator = (0, withRetry_js_1.withRetry)(() => (0, client_js_1.getAnthropicClient)({
        maxRetries: 0,
        model: clientOptions.model,
        fetchOverride: clientOptions.fetchOverride,
        source: clientOptions.source,
    }), async (anthropic, attempt, context) => {
        const start = Date.now();
        const retryParams = paramsFromContext(context);
        captureRequest(retryParams);
        onAttempt(attempt, start, retryParams.max_tokens);
        const adjustedParams = adjustParamsForNonStreaming(retryParams, exports.MAX_NON_STREAMING_TOKENS);
        try {
            // biome-ignore lint/plugin: non-streaming API call
            return await anthropic.beta.messages.create({
                ...adjustedParams,
                model: (0, model_js_2.normalizeModelStringForAPI)(adjustedParams.model),
            }, {
                signal: retryOptions.signal,
                timeout: fallbackTimeoutMs,
            });
        }
        catch (err) {
            // User aborts are not errors — re-throw immediately without logging
            if (err instanceof error_1.APIUserAbortError)
                throw err;
            // Instrumentation: record when the non-streaming request errors (including
            // timeouts). Lets us distinguish "fallback hung past container kill"
            // (no event) from "fallback hit the bounded timeout" (this event).
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'cli_nonstreaming_fallback_error');
            (0, index_js_1.logEvent)('tengu_nonstreaming_fallback_error', {
                model: clientOptions.model,
                error: err instanceof Error
                    ? err.name
                    : 'unknown',
                attempt,
                timeout_ms: fallbackTimeoutMs,
                request_id: (originatingRequestId ??
                    'unknown'),
            });
            throw err;
        }
    }, {
        model: retryOptions.model,
        fallbackModel: retryOptions.fallbackModel,
        thinkingConfig: retryOptions.thinkingConfig,
        ...((0, fastMode_js_1.isFastModeEnabled)() && { fastMode: retryOptions.fastMode }),
        signal: retryOptions.signal,
        initialConsecutive529Errors: retryOptions.initialConsecutive529Errors,
        querySource: retryOptions.querySource,
    });
    let e;
    do {
        e = await generator.next();
        if (!e.done && e.value.type === 'system') {
            yield e.value;
        }
    } while (!e.done);
    return e.value;
}
/**
 * Extracts the request ID from the most recent assistant message in the
 * conversation. Used to link consecutive API requests in analytics so we can
 * join them for cache-hit-rate analysis and incremental token tracking.
 *
 * Deriving this from the message array (rather than global state) ensures each
 * query chain (main thread, subagent, teammate) tracks its own request chain
 * independently, and rollback/undo naturally updates the value.
 */
function getPreviousRequestIdFromMessages(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.type === 'assistant' && msg.requestId) {
            return msg.requestId;
        }
    }
    return undefined;
}
function isMedia(block) {
    return block.type === 'image' || block.type === 'document';
}
function isToolResult(block) {
    return block.type === 'tool_result';
}
/**
 * Ensures messages contain at most `limit` media items (images + documents).
 * Strips oldest media first to preserve the most recent.
 */
function stripExcessMediaItems(messages, limit) {
    let toRemove = 0;
    for (const msg of messages) {
        if (!Array.isArray(msg.message.content))
            continue;
        for (const block of msg.message.content) {
            if (isMedia(block))
                toRemove++;
            if (isToolResult(block) && Array.isArray(block.content)) {
                for (const nested of block.content) {
                    if (isMedia(nested))
                        toRemove++;
                }
            }
        }
    }
    toRemove -= limit;
    if (toRemove <= 0)
        return messages;
    return messages.map(msg => {
        if (toRemove <= 0)
            return msg;
        const content = msg.message.content;
        if (!Array.isArray(content))
            return msg;
        const before = toRemove;
        const stripped = content
            .map(block => {
            if (toRemove <= 0 ||
                !isToolResult(block) ||
                !Array.isArray(block.content))
                return block;
            const filtered = block.content.filter(n => {
                if (toRemove > 0 && isMedia(n)) {
                    toRemove--;
                    return false;
                }
                return true;
            });
            return filtered.length === block.content.length
                ? block
                : { ...block, content: filtered };
        })
            .filter(block => {
            if (toRemove > 0 && isMedia(block)) {
                toRemove--;
                return false;
            }
            return true;
        });
        return before === toRemove
            ? msg
            : {
                ...msg,
                message: { ...msg.message, content: stripped },
            };
    });
}
async function* queryModel(messages, systemPrompt, thinkingConfig, tools, signal, options) {
    // Check cheap conditions first — the off-switch await blocks on GrowthBook
    // init (~10ms). For non-Opus models (haiku, sonnet) this skips the await
    // entirely. Subscribers don't hit this path at all.
    if (!(0, auth_js_2.isClaudeAISubscriber)() &&
        (0, model_js_1.isNonCustomOpusModel)(options.model) &&
        (await (0, growthbook_js_1.getDynamicConfig_BLOCKS_ON_INIT)('tengu-off-switch', {
            activated: false,
        })).activated) {
        (0, index_js_1.logEvent)('tengu_off_switch_query', {});
        yield (0, errors_js_2.getAssistantMessageFromError)(new Error(errors_js_2.CUSTOM_OFF_SWITCH_MESSAGE), options.model);
        return;
    }
    // Derive previous request ID from the last assistant message in this query chain.
    // This is scoped per message array (main thread, subagent, teammate each have their own),
    // so concurrent agents don't clobber each other's request chain tracking.
    // Also naturally handles rollback/undo since removed messages won't be in the array.
    const previousRequestId = getPreviousRequestIdFromMessages(messages);
    const resolvedModel = (0, providers_js_1.getAPIProvider)() === 'bedrock' &&
        options.model.includes('application-inference-profile')
        ? ((await (0, bedrock_js_1.getInferenceProfileBackingModel)(options.model)) ??
            options.model)
        : options.model;
    (0, queryProfiler_js_1.queryCheckpoint)('query_tool_schema_build_start');
    const isAgenticQuery = options.querySource.startsWith('repl_main_thread') ||
        options.querySource.startsWith('agent:') ||
        options.querySource === 'sdk' ||
        options.querySource === 'hook_agent' ||
        options.querySource === 'verification_agent';
    const betas = (0, betas_js_1.getMergedBetas)(options.model, { isAgenticQuery });
    // Always send the advisor beta header when advisor is enabled, so
    // non-agentic queries (compact, side_question, extract_memories, etc.)
    // can parse advisor server_tool_use blocks already in the conversation history.
    if ((0, advisor_js_1.isAdvisorEnabled)()) {
        betas.push(betas_js_4.ADVISOR_BETA_HEADER);
    }
    let advisorModel;
    if (isAgenticQuery && (0, advisor_js_1.isAdvisorEnabled)()) {
        let advisorOption = options.advisorModel;
        const advisorExperiment = (0, advisor_js_1.getExperimentAdvisorModels)();
        if (advisorExperiment !== undefined) {
            if ((0, model_js_2.normalizeModelStringForAPI)(advisorExperiment.baseModel) ===
                (0, model_js_2.normalizeModelStringForAPI)(options.model)) {
                // Override the advisor model if the base model matches. We
                // should only have experiment models if the user cannot
                // configure it themselves.
                advisorOption = advisorExperiment.advisorModel;
            }
        }
        if (advisorOption) {
            const normalizedAdvisorModel = (0, model_js_2.normalizeModelStringForAPI)((0, model_js_2.parseUserSpecifiedModel)(advisorOption));
            if (!(0, advisor_js_1.modelSupportsAdvisor)(options.model)) {
                (0, debug_js_1.logForDebugging)(`[AdvisorTool] Skipping advisor - base model ${options.model} does not support advisor`);
            }
            else if (!(0, advisor_js_1.isValidAdvisorModel)(normalizedAdvisorModel)) {
                (0, debug_js_1.logForDebugging)(`[AdvisorTool] Skipping advisor - ${normalizedAdvisorModel} is not a valid advisor model`);
            }
            else {
                advisorModel = normalizedAdvisorModel;
                (0, debug_js_1.logForDebugging)(`[AdvisorTool] Server-side tool enabled with ${advisorModel} as the advisor model`);
            }
        }
    }
    // Check if tool search is enabled (checks mode, model support, and threshold for auto mode)
    // This is async because it may need to calculate MCP tool description sizes for TstAuto mode
    let useToolSearch = await (0, toolSearch_js_1.isToolSearchEnabled)(options.model, tools, options.getToolPermissionContext, options.agents, 'query');
    // Precompute once — isDeferredTool does 2 GrowthBook lookups per call
    const deferredToolNames = new Set();
    if (useToolSearch) {
        for (const t of tools) {
            if ((0, prompt_js_2.isDeferredTool)(t))
                deferredToolNames.add(t.name);
        }
    }
    // Even if tool search mode is enabled, skip if there are no deferred tools
    // AND no MCP servers are still connecting. When servers are pending, keep
    // ToolSearch available so the model can discover tools after they connect.
    if (useToolSearch &&
        deferredToolNames.size === 0 &&
        !options.hasPendingMcpServers) {
        (0, debug_js_1.logForDebugging)('Tool search disabled: no deferred tools available to search');
        useToolSearch = false;
    }
    // Filter out ToolSearchTool if tool search is not enabled for this model
    // ToolSearchTool returns tool_reference blocks which unsupported models can't handle
    let filteredTools;
    if (useToolSearch) {
        // Dynamic tool loading: Only include deferred tools that have been discovered
        // via tool_reference blocks in the message history. This eliminates the need
        // to predeclare all deferred tools upfront and removes limits on tool quantity.
        const discoveredToolNames = (0, toolSearch_js_1.extractDiscoveredToolNames)(messages);
        filteredTools = tools.filter(tool => {
            // Always include non-deferred tools
            if (!deferredToolNames.has(tool.name))
                return true;
            // Always include ToolSearchTool (so it can discover more tools)
            if ((0, Tool_js_1.toolMatchesName)(tool, prompt_js_2.TOOL_SEARCH_TOOL_NAME))
                return true;
            // Only include deferred tools that have been discovered
            return discoveredToolNames.has(tool.name);
        });
    }
    else {
        filteredTools = tools.filter(t => !(0, Tool_js_1.toolMatchesName)(t, prompt_js_2.TOOL_SEARCH_TOOL_NAME));
    }
    // Add tool search beta header if enabled - required for defer_loading to be accepted
    // Header differs by provider: 1P/Foundry use advanced-tool-use, Vertex/Bedrock use tool-search-tool
    // For Bedrock, this header must go in extraBodyParams, not the betas array
    const toolSearchHeader = useToolSearch ? (0, betas_js_3.getToolSearchBetaHeader)() : null;
    if (toolSearchHeader && (0, providers_js_1.getAPIProvider)() !== 'bedrock') {
        if (!betas.includes(toolSearchHeader)) {
            betas.push(toolSearchHeader);
        }
    }
    // Determine if cached microcompact is enabled for this model.
    // Computed once here (in async context) and captured by paramsFromContext.
    // The beta header is also captured here to avoid a top-level import of the
    // ant-only CACHE_EDITING_BETA_HEADER constant.
    let cachedMCEnabled = false;
    let cacheEditingBetaHeader = '';
    if ((0, bun_bundle_1.feature)('CACHED_MICROCOMPACT')) {
        const { isCachedMicrocompactEnabled, isModelSupportedForCacheEditing, getCachedMCConfig, } = await Promise.resolve().then(() => __importStar(require('../compact/cachedMicrocompact.js')));
        const betas = await Promise.resolve().then(() => __importStar(require('src/constants/betas.js')));
        cacheEditingBetaHeader = betas.CACHE_EDITING_BETA_HEADER;
        const featureEnabled = isCachedMicrocompactEnabled();
        const modelSupported = isModelSupportedForCacheEditing(options.model);
        cachedMCEnabled = featureEnabled && modelSupported;
        const config = getCachedMCConfig();
        (0, debug_js_1.logForDebugging)(`Cached MC gate: enabled=${featureEnabled} modelSupported=${modelSupported} model=${options.model} supportedModels=${(0, slowOperations_js_1.jsonStringify)(config.supportedModels)}`);
    }
    const useGlobalCacheFeature = (0, betas_js_3.shouldUseGlobalCacheScope)();
    const willDefer = (t) => useToolSearch && (deferredToolNames.has(t.name) || shouldDeferLspTool(t));
    // MCP tools are per-user → dynamic tool section → can't globally cache.
    // Only gate when an MCP tool will actually render (not defer_loading).
    const needsToolBasedCacheMarker = useGlobalCacheFeature &&
        filteredTools.some(t => t.isMcp === true && !willDefer(t));
    // Ensure prompt_caching_scope beta header is present when global cache is enabled.
    if (useGlobalCacheFeature &&
        !betas.includes(betas_js_2.PROMPT_CACHING_SCOPE_BETA_HEADER)) {
        betas.push(betas_js_2.PROMPT_CACHING_SCOPE_BETA_HEADER);
    }
    // Determine global cache strategy for logging
    const globalCacheStrategy = useGlobalCacheFeature
        ? needsToolBasedCacheMarker
            ? 'none'
            : 'system_prompt'
        : 'none';
    // Build tool schemas, adding defer_loading for MCP tools when tool search is enabled
    // Note: We pass the full `tools` list (not filteredTools) to toolToAPISchema so that
    // ToolSearchTool's prompt can list ALL available MCP tools. The filtering only affects
    // which tools are actually sent to the API, not what the model sees in tool descriptions.
    const toolSchemas = await Promise.all(filteredTools.map(tool => (0, api_js_1.toolToAPISchema)(tool, {
        getToolPermissionContext: options.getToolPermissionContext,
        tools,
        agents: options.agents,
        allowedAgentTypes: options.allowedAgentTypes,
        model: options.model,
        deferLoading: willDefer(tool),
    })));
    if (useToolSearch) {
        const includedDeferredTools = (0, array_js_1.count)(filteredTools, t => deferredToolNames.has(t.name));
        (0, debug_js_1.logForDebugging)(`Dynamic tool loading: ${includedDeferredTools}/${deferredToolNames.size} deferred tools included`);
    }
    (0, queryProfiler_js_1.queryCheckpoint)('query_tool_schema_build_end');
    // Normalize messages before building system prompt (needed for fingerprinting)
    // Instrumentation: Track message count before normalization
    (0, index_js_1.logEvent)('tengu_api_before_normalize', {
        preNormalizedMessageCount: messages.length,
    });
    (0, queryProfiler_js_1.queryCheckpoint)('query_message_normalization_start');
    let messagesForAPI = (0, messages_js_1.normalizeMessagesForAPI)(messages, filteredTools);
    (0, queryProfiler_js_1.queryCheckpoint)('query_message_normalization_end');
    // Model-specific post-processing: strip tool-search-specific fields if the
    // selected model doesn't support tool search.
    //
    // Why is this needed in addition to normalizeMessagesForAPI?
    // - normalizeMessagesForAPI uses isToolSearchEnabledNoModelCheck() because it's
    //   called from ~20 places (analytics, feedback, sharing, etc.), many of which
    //   don't have model context. Adding model to its signature would be a large refactor.
    // - This post-processing uses the model-aware isToolSearchEnabled() check
    // - This handles mid-conversation model switching (e.g., Sonnet → Haiku) where
    //   stale tool-search fields from the previous model would cause 400 errors
    //
    // Note: For assistant messages, normalizeMessagesForAPI already normalized the
    // tool inputs, so stripCallerFieldFromAssistantMessage only needs to remove the
    // 'caller' field (not re-normalize inputs).
    if (!useToolSearch) {
        messagesForAPI = messagesForAPI.map(msg => {
            switch (msg.type) {
                case 'user':
                    // Strip tool_reference blocks from tool_result content
                    return (0, messages_js_1.stripToolReferenceBlocksFromUserMessage)(msg);
                case 'assistant':
                    // Strip 'caller' field from tool_use blocks
                    return (0, messages_js_1.stripCallerFieldFromAssistantMessage)(msg);
                default:
                    return msg;
            }
        });
    }
    // Repair tool_use/tool_result pairing mismatches that can occur when resuming
    // remote/teleport sessions. Inserts synthetic error tool_results for orphaned
    // tool_uses and strips orphaned tool_results referencing non-existent tool_uses.
    messagesForAPI = (0, messages_js_1.ensureToolResultPairing)(messagesForAPI);
    // Strip advisor blocks — the API rejects them without the beta header.
    if (!betas.includes(betas_js_4.ADVISOR_BETA_HEADER)) {
        messagesForAPI = (0, messages_js_1.stripAdvisorBlocks)(messagesForAPI);
    }
    // Strip excess media items before making the API call.
    // The API rejects requests with >100 media items but returns a confusing error.
    // Rather than erroring (which is hard to recover from in Cowork/CCD), we
    // silently drop the oldest media items to stay within the limit.
    messagesForAPI = stripExcessMediaItems(messagesForAPI, apiLimits_js_1.API_MAX_MEDIA_PER_REQUEST);
    // Instrumentation: Track message count after normalization
    (0, index_js_1.logEvent)('tengu_api_after_normalize', {
        postNormalizedMessageCount: messagesForAPI.length,
    });
    // Compute fingerprint from first user message for attribution.
    // Must run BEFORE injecting synthetic messages (e.g. deferred tool names)
    // so the fingerprint reflects the actual user input.
    const fingerprint = (0, fingerprint_js_1.computeFingerprintFromMessages)(messagesForAPI);
    // When the delta attachment is enabled, deferred tools are announced
    // via persisted deferred_tools_delta attachments instead of this
    // ephemeral prepend (which busts cache whenever the pool changes).
    if (useToolSearch && !(0, toolSearch_js_1.isDeferredToolsDeltaEnabled)()) {
        const deferredToolList = tools
            .filter(t => deferredToolNames.has(t.name))
            .map(prompt_js_2.formatDeferredToolLine)
            .sort()
            .join('\n');
        if (deferredToolList) {
            messagesForAPI = [
                (0, messages_js_1.createUserMessage)({
                    content: `<available-deferred-tools>\n${deferredToolList}\n</available-deferred-tools>`,
                    isMeta: true,
                }),
                ...messagesForAPI,
            ];
        }
    }
    // Chrome tool-search instructions: when the delta attachment is enabled,
    // these are carried as a client-side block in mcp_instructions_delta
    // (attachments.ts) instead of here. This per-request sys-prompt append
    // busts the prompt cache when chrome connects late.
    const hasChromeTools = filteredTools.some(t => (0, utils_js_1.isToolFromMcpServer)(t.name, common_js_1.CLAUDE_IN_CHROME_MCP_SERVER_NAME));
    const injectChromeHere = useToolSearch && hasChromeTools && !(0, mcpInstructionsDelta_js_1.isMcpInstructionsDeltaEnabled)();
    // filter(Boolean) works by converting each element to a boolean - empty strings become false and are filtered out.
    systemPrompt = (0, systemPromptType_js_1.asSystemPrompt)([
        (0, system_js_1.getAttributionHeader)(fingerprint),
        (0, system_js_1.getCLISyspromptPrefix)({
            isNonInteractive: options.isNonInteractiveSession,
            hasAppendSystemPrompt: options.hasAppendSystemPrompt,
        }),
        ...systemPrompt,
        ...(advisorModel ? [advisor_js_1.ADVISOR_TOOL_INSTRUCTIONS] : []),
        ...(injectChromeHere ? [prompt_js_1.CHROME_TOOL_SEARCH_INSTRUCTIONS] : []),
    ].filter(Boolean));
    // Prepend system prompt block for easy API identification
    (0, api_js_1.logAPIPrefix)(systemPrompt);
    const enablePromptCaching = options.enablePromptCaching ?? getPromptCachingEnabled(options.model);
    const system = buildSystemPromptBlocks(systemPrompt, enablePromptCaching, {
        skipGlobalCacheForSystemPrompt: needsToolBasedCacheMarker,
        querySource: options.querySource,
    });
    const useBetas = betas.length > 0;
    // Build minimal context for detailed tracing (when beta tracing is enabled)
    // Note: The actual new_context message extraction is done in sessionTracing.ts using
    // hash-based tracking per querySource (agent) from the messagesForAPI array
    const extraToolSchemas = [...(options.extraToolSchemas ?? [])];
    if (advisorModel) {
        // Server tools must be in the tools array by API contract. Appended after
        // toolSchemas (which carries the cache_control marker) so toggling /advisor
        // only churns the small suffix, not the cached prefix.
        extraToolSchemas.push({
            type: 'advisor_20260301',
            name: 'advisor',
            model: advisorModel,
        });
    }
    const allTools = [...toolSchemas, ...extraToolSchemas];
    const isFastMode = (0, fastMode_js_1.isFastModeEnabled)() &&
        (0, fastMode_js_1.isFastModeAvailable)() &&
        !(0, fastMode_js_1.isFastModeCooldown)() &&
        (0, fastMode_js_1.isFastModeSupportedByModel)(options.model) &&
        !!options.fastMode;
    // Sticky-on latches for dynamic beta headers. Each header, once first
    // sent, keeps being sent for the rest of the session so mid-session
    // toggles don't change the server-side cache key and bust ~50-70K tokens.
    // Latches are cleared on /clear and /compact via clearBetaHeaderLatches().
    // Per-call gates (isAgenticQuery, querySource===repl_main_thread) stay
    // per-call so non-agentic queries keep their own stable header set.
    let afkHeaderLatched = (0, state_js_1.getAfkModeHeaderLatched)() === true;
    if ((0, bun_bundle_1.feature)('TRANSCRIPT_CLASSIFIER')) {
        if (!afkHeaderLatched &&
            isAgenticQuery &&
            (0, betas_js_3.shouldIncludeFirstPartyOnlyBetas)() &&
            (autoModeStateModule?.isAutoModeActive() ?? false)) {
            afkHeaderLatched = true;
            (0, state_js_1.setAfkModeHeaderLatched)(true);
        }
    }
    let fastModeHeaderLatched = (0, state_js_1.getFastModeHeaderLatched)() === true;
    if (!fastModeHeaderLatched && isFastMode) {
        fastModeHeaderLatched = true;
        (0, state_js_1.setFastModeHeaderLatched)(true);
    }
    let cacheEditingHeaderLatched = (0, state_js_1.getCacheEditingHeaderLatched)() === true;
    if ((0, bun_bundle_1.feature)('CACHED_MICROCOMPACT')) {
        if (!cacheEditingHeaderLatched &&
            cachedMCEnabled &&
            (0, providers_js_1.getAPIProvider)() === 'firstParty' &&
            options.querySource === 'repl_main_thread') {
            cacheEditingHeaderLatched = true;
            (0, state_js_1.setCacheEditingHeaderLatched)(true);
        }
    }
    // Only latch from agentic queries so a classifier call doesn't flip the
    // main thread's context_management mid-turn.
    let thinkingClearLatched = (0, state_js_1.getThinkingClearLatched)() === true;
    if (!thinkingClearLatched && isAgenticQuery) {
        const lastCompletion = (0, state_js_1.getLastApiCompletionTimestamp)();
        if (lastCompletion !== null &&
            Date.now() - lastCompletion > promptCacheBreakDetection_js_1.CACHE_TTL_1HOUR_MS) {
            thinkingClearLatched = true;
            (0, state_js_1.setThinkingClearLatched)(true);
        }
    }
    const effort = (0, effort_js_1.resolveAppliedEffort)(options.model, options.effortValue);
    if ((0, bun_bundle_1.feature)('PROMPT_CACHE_BREAK_DETECTION')) {
        // Exclude defer_loading tools from the hash -- the API strips them from the
        // prompt, so they never affect the actual cache key. Including them creates
        // false-positive "tool schemas changed" breaks when tools are discovered or
        // MCP servers reconnect.
        const toolsForCacheDetection = allTools.filter(t => !('defer_loading' in t && t.defer_loading));
        // Capture everything that could affect the server-side cache key.
        // Pass latched header values (not live state) so break detection
        // reflects what we actually send, not what the user toggled.
        (0, promptCacheBreakDetection_js_1.recordPromptState)({
            system,
            toolSchemas: toolsForCacheDetection,
            querySource: options.querySource,
            model: options.model,
            agentId: options.agentId,
            fastMode: fastModeHeaderLatched,
            globalCacheStrategy,
            betas,
            autoModeActive: afkHeaderLatched,
            isUsingOverage: claudeAiLimits_js_1.currentLimits.isUsingOverage ?? false,
            cachedMCEnabled: cacheEditingHeaderLatched,
            effortValue: effort,
            extraBodyParams: getExtraBodyParams(),
        });
    }
    const newContext = (0, sessionTracing_js_1.isBetaTracingEnabled)()
        ? {
            systemPrompt: systemPrompt.join('\n\n'),
            querySource: options.querySource,
            tools: (0, slowOperations_js_1.jsonStringify)(allTools),
        }
        : undefined;
    // Capture the span so we can pass it to endLLMRequestSpan later
    // This ensures responses are matched to the correct request when multiple requests run in parallel
    const llmSpan = (0, sessionTracing_js_1.startLLMRequestSpan)(options.model, newContext, messagesForAPI, isFastMode);
    const startIncludingRetries = Date.now();
    let start = Date.now();
    let attemptNumber = 0;
    const attemptStartTimes = [];
    let stream = undefined;
    let streamRequestId = undefined;
    let clientRequestId = undefined;
    // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins -- Response is available in Node 18+ and is used by the SDK
    let streamResponse = undefined;
    // Release all stream resources to prevent native memory leaks.
    // The Response object holds native TLS/socket buffers that live outside the
    // V8 heap (observed on the Node.js/npm path; see GH #32920), so we must
    // explicitly cancel and release it regardless of how the generator exits.
    function releaseStreamResources() {
        cleanupStream(stream);
        stream = undefined;
        if (streamResponse) {
            streamResponse.body?.cancel().catch(() => { });
            streamResponse = undefined;
        }
    }
    // Consume pending cache edits ONCE before paramsFromContext is defined.
    // paramsFromContext is called multiple times (logging, retries), so consuming
    // inside it would cause the first call to steal edits from subsequent calls.
    const consumedCacheEdits = cachedMCEnabled ? (0, microCompact_js_1.consumePendingCacheEdits)() : null;
    const consumedPinnedEdits = cachedMCEnabled ? (0, microCompact_js_1.getPinnedCacheEdits)() : [];
    // Capture the betas sent in the last API request, including the ones that
    // were dynamically added, so we can log and send it to telemetry.
    let lastRequestBetas;
    const paramsFromContext = (retryContext) => {
        const betasParams = [...betas];
        // Append 1M beta dynamically for the Sonnet 1M experiment.
        if (!betasParams.includes(betas_js_2.CONTEXT_1M_BETA_HEADER) &&
            (0, context_js_1.getSonnet1mExpTreatmentEnabled)(retryContext.model)) {
            betasParams.push(betas_js_2.CONTEXT_1M_BETA_HEADER);
        }
        // For Bedrock, include both model-based betas and dynamically-added tool search header
        const bedrockBetas = (0, providers_js_1.getAPIProvider)() === 'bedrock'
            ? [
                ...(0, betas_js_1.getBedrockExtraBodyParamsBetas)(retryContext.model),
                ...(toolSearchHeader ? [toolSearchHeader] : []),
            ]
            : [];
        const extraBodyParams = getExtraBodyParams(bedrockBetas);
        const outputConfig = {
            ...(extraBodyParams.output_config ?? {}),
        };
        configureEffortParams(effort, outputConfig, extraBodyParams, betasParams, options.model);
        configureTaskBudgetParams(options.taskBudget, outputConfig, betasParams);
        // Merge outputFormat into extraBodyParams.output_config alongside effort
        // Requires structured-outputs beta header per SDK (see parse() in messages.mjs)
        if (options.outputFormat && !('format' in outputConfig)) {
            outputConfig.format = options.outputFormat;
            // Add beta header if not already present and provider supports it
            if ((0, betas_js_3.modelSupportsStructuredOutputs)(options.model) &&
                !betasParams.includes(betas_js_2.STRUCTURED_OUTPUTS_BETA_HEADER)) {
                betasParams.push(betas_js_2.STRUCTURED_OUTPUTS_BETA_HEADER);
            }
        }
        // Retry context gets preference because it tries to course correct if we exceed the context window limit
        const maxOutputTokens = retryContext?.maxTokensOverride ||
            options.maxOutputTokensOverride ||
            getMaxOutputTokensForModel(options.model);
        const hasThinking = thinkingConfig.type !== 'disabled' &&
            !(0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_DISABLE_THINKING);
        let thinking = undefined;
        // IMPORTANT: Do not change the adaptive-vs-budget thinking selection below
        // without notifying the model launch DRI and research. This is a sensitive
        // setting that can greatly affect model quality and bashing.
        if (hasThinking && (0, thinking_js_1.modelSupportsThinking)(options.model)) {
            if (!(0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING) &&
                (0, thinking_js_1.modelSupportsAdaptiveThinking)(options.model)) {
                // For models that support adaptive thinking, always use adaptive
                // thinking without a budget.
                thinking = {
                    type: 'adaptive',
                };
            }
            else {
                // For models that do not support adaptive thinking, use the default
                // thinking budget unless explicitly specified.
                let thinkingBudget = (0, context_js_2.getMaxThinkingTokensForModel)(options.model);
                if (thinkingConfig.type === 'enabled' &&
                    thinkingConfig.budgetTokens !== undefined) {
                    thinkingBudget = thinkingConfig.budgetTokens;
                }
                thinkingBudget = Math.min(maxOutputTokens - 1, thinkingBudget);
                thinking = {
                    budget_tokens: thinkingBudget,
                    type: 'enabled',
                };
            }
        }
        // Get API context management strategies if enabled
        const contextManagement = (0, apiMicrocompact_js_1.getAPIContextManagement)({
            hasThinking,
            isRedactThinkingActive: betasParams.includes(betas_js_2.REDACT_THINKING_BETA_HEADER),
            clearAllThinking: thinkingClearLatched,
        });
        const enablePromptCaching = options.enablePromptCaching ?? getPromptCachingEnabled(retryContext.model);
        // Fast mode: header is latched session-stable (cache-safe), but
        // `speed='fast'` stays dynamic so cooldown still suppresses the actual
        // fast-mode request without changing the cache key.
        let speed;
        const isFastModeForRetry = (0, fastMode_js_1.isFastModeEnabled)() &&
            (0, fastMode_js_1.isFastModeAvailable)() &&
            !(0, fastMode_js_1.isFastModeCooldown)() &&
            (0, fastMode_js_1.isFastModeSupportedByModel)(options.model) &&
            !!retryContext.fastMode;
        if (isFastModeForRetry) {
            speed = 'fast';
        }
        if (fastModeHeaderLatched && !betasParams.includes(betas_js_2.FAST_MODE_BETA_HEADER)) {
            betasParams.push(betas_js_2.FAST_MODE_BETA_HEADER);
        }
        // AFK mode beta: latched once auto mode is first activated. Still gated
        // by isAgenticQuery per-call so classifiers/compaction don't get it.
        if ((0, bun_bundle_1.feature)('TRANSCRIPT_CLASSIFIER')) {
            if (afkHeaderLatched &&
                (0, betas_js_3.shouldIncludeFirstPartyOnlyBetas)() &&
                isAgenticQuery &&
                !betasParams.includes(betas_js_2.AFK_MODE_BETA_HEADER)) {
                betasParams.push(betas_js_2.AFK_MODE_BETA_HEADER);
            }
        }
        // Cache editing beta: header is latched session-stable; useCachedMC
        // (controls cache_edits body behavior) stays live so edits stop when
        // the feature disables but the header doesn't flip.
        const useCachedMC = cachedMCEnabled &&
            (0, providers_js_1.getAPIProvider)() === 'firstParty' &&
            options.querySource === 'repl_main_thread';
        if (cacheEditingHeaderLatched &&
            (0, providers_js_1.getAPIProvider)() === 'firstParty' &&
            options.querySource === 'repl_main_thread' &&
            !betasParams.includes(cacheEditingBetaHeader)) {
            betasParams.push(cacheEditingBetaHeader);
            (0, debug_js_1.logForDebugging)('Cache editing beta header enabled for cached microcompact');
        }
        // Only send temperature when thinking is disabled — the API requires
        // temperature: 1 when thinking is enabled, which is already the default.
        const temperature = !hasThinking
            ? (options.temperatureOverride ?? 1)
            : undefined;
        lastRequestBetas = betasParams;
        return {
            model: (0, model_js_2.normalizeModelStringForAPI)(options.model),
            messages: addCacheBreakpoints(messagesForAPI, enablePromptCaching, options.querySource, useCachedMC, consumedCacheEdits, consumedPinnedEdits, options.skipCacheWrite),
            system,
            tools: allTools,
            tool_choice: options.toolChoice,
            ...(useBetas && { betas: betasParams }),
            metadata: getAPIMetadata(),
            max_tokens: maxOutputTokens,
            thinking,
            ...(temperature !== undefined && { temperature }),
            ...(contextManagement &&
                useBetas &&
                betasParams.includes(betas_js_2.CONTEXT_MANAGEMENT_BETA_HEADER) && {
                context_management: contextManagement,
            }),
            ...extraBodyParams,
            ...(Object.keys(outputConfig).length > 0 && {
                output_config: outputConfig,
            }),
            ...(speed !== undefined && { speed }),
        };
    };
    // Compute log scalars synchronously so the fire-and-forget .then() closure
    // captures only primitives instead of paramsFromContext's full closure scope
    // (messagesForAPI, system, allTools, betas — the entire request-building
    // context), which would otherwise be pinned until the promise resolves.
    {
        const queryParams = paramsFromContext({
            model: options.model,
            thinkingConfig,
        });
        const logMessagesLength = queryParams.messages.length;
        const logBetas = useBetas ? (queryParams.betas ?? []) : [];
        const logThinkingType = queryParams.thinking?.type ?? 'disabled';
        const logEffortValue = queryParams.output_config?.effort;
        void options.getToolPermissionContext().then(permissionContext => {
            (0, logging_js_1.logAPIQuery)({
                model: options.model,
                messagesLength: logMessagesLength,
                temperature: options.temperatureOverride ?? 1,
                betas: logBetas,
                permissionMode: permissionContext.mode,
                querySource: options.querySource,
                queryTracking: options.queryTracking,
                thinkingType: logThinkingType,
                effortValue: logEffortValue,
                fastMode: isFastMode,
                previousRequestId,
            });
        });
    }
    const newMessages = [];
    let ttftMs = 0;
    let partialMessage = undefined;
    const contentBlocks = [];
    let usage = logging_js_1.EMPTY_USAGE;
    let costUSD = 0;
    let stopReason = null;
    let didFallBackToNonStreaming = false;
    let fallbackMessage;
    let maxOutputTokens = 0;
    let responseHeaders = undefined;
    let research = undefined;
    let isFastModeRequest = isFastMode; // Keep separate state as it may change if falling back
    let isAdvisorInProgress = false;
    try {
        (0, queryProfiler_js_1.queryCheckpoint)('query_client_creation_start');
        const generator = (0, withRetry_js_1.withRetry)(() => (0, client_js_1.getAnthropicClient)({
            maxRetries: 0, // Disabled auto-retry in favor of manual implementation
            model: options.model,
            fetchOverride: options.fetchOverride,
            source: options.querySource,
        }), async (anthropic, attempt, context) => {
            attemptNumber = attempt;
            isFastModeRequest = context.fastMode ?? false;
            start = Date.now();
            attemptStartTimes.push(start);
            // Client has been created by withRetry's getClient() call. This fires
            // once per attempt; on retries the client is usually cached (withRetry
            // only calls getClient() again after auth errors), so the delta from
            // client_creation_start is meaningful on attempt 1.
            (0, queryProfiler_js_1.queryCheckpoint)('query_client_creation_end');
            const params = paramsFromContext(context);
            (0, log_js_1.captureAPIRequest)(params, options.querySource); // Capture for bug reports
            maxOutputTokens = params.max_tokens;
            // Fire immediately before the fetch is dispatched. .withResponse() below
            // awaits until response headers arrive, so this MUST be before the await
            // or the "Network TTFB" phase measurement is wrong.
            (0, queryProfiler_js_1.queryCheckpoint)('query_api_request_sent');
            if (!options.agentId) {
                (0, headlessProfiler_js_1.headlessProfilerCheckpoint)('api_request_sent');
            }
            // Generate and track client request ID so timeouts (which return no
            // server request ID) can still be correlated with server logs.
            // First-party only — 3P providers don't log it (inc-4029 class).
            clientRequestId =
                (0, providers_js_1.getAPIProvider)() === 'firstParty' && (0, providers_js_1.isFirstPartyAnthropicBaseUrl)()
                    ? (0, crypto_1.randomUUID)()
                    : undefined;
            // Use raw stream instead of BetaMessageStream to avoid O(n²) partial JSON parsing
            // BetaMessageStream calls partialParse() on every input_json_delta, which we don't need
            // since we handle tool input accumulation ourselves
            // biome-ignore lint/plugin: main conversation loop handles attribution separately
            const result = await anthropic.beta.messages
                .create({ ...params, stream: true }, {
                signal,
                ...(clientRequestId && {
                    headers: { [client_js_1.CLIENT_REQUEST_ID_HEADER]: clientRequestId },
                }),
            })
                .withResponse();
            (0, queryProfiler_js_1.queryCheckpoint)('query_response_headers_received');
            streamRequestId = result.request_id;
            streamResponse = result.response;
            return result.data;
        }, {
            model: options.model,
            fallbackModel: options.fallbackModel,
            thinkingConfig,
            ...((0, fastMode_js_1.isFastModeEnabled)() ? { fastMode: isFastMode } : false),
            signal,
            querySource: options.querySource,
        });
        let e;
        do {
            e = await generator.next();
            // yield API error messages (the stream has a 'controller' property, error messages don't)
            if (!('controller' in e.value)) {
                yield e.value;
            }
        } while (!e.done);
        stream = e.value;
        // reset state
        newMessages.length = 0;
        ttftMs = 0;
        partialMessage = undefined;
        contentBlocks.length = 0;
        usage = logging_js_1.EMPTY_USAGE;
        stopReason = null;
        isAdvisorInProgress = false;
        // Streaming idle timeout watchdog: abort the stream if no chunks arrive
        // for STREAM_IDLE_TIMEOUT_MS. Unlike the stall detection below (which only
        // fires when the *next* chunk arrives), this uses setTimeout to actively
        // kill hung streams. Without this, a silently dropped connection can hang
        // the session indefinitely since the SDK's request timeout only covers the
        // initial fetch(), not the streaming body.
        const streamWatchdogEnabled = (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_ENABLE_STREAM_WATCHDOG);
        const STREAM_IDLE_TIMEOUT_MS = parseInt(process.env.CLAUDE_STREAM_IDLE_TIMEOUT_MS || '', 10) || 90000;
        const STREAM_IDLE_WARNING_MS = STREAM_IDLE_TIMEOUT_MS / 2;
        let streamIdleAborted = false;
        // performance.now() snapshot when watchdog fires, for measuring abort propagation delay
        let streamWatchdogFiredAt = null;
        let streamIdleWarningTimer = null;
        let streamIdleTimer = null;
        function clearStreamIdleTimers() {
            if (streamIdleWarningTimer !== null) {
                clearTimeout(streamIdleWarningTimer);
                streamIdleWarningTimer = null;
            }
            if (streamIdleTimer !== null) {
                clearTimeout(streamIdleTimer);
                streamIdleTimer = null;
            }
        }
        function resetStreamIdleTimer() {
            clearStreamIdleTimers();
            if (!streamWatchdogEnabled) {
                return;
            }
            streamIdleWarningTimer = setTimeout(warnMs => {
                (0, debug_js_1.logForDebugging)(`Streaming idle warning: no chunks received for ${warnMs / 1000}s`, { level: 'warn' });
                (0, diagLogs_js_1.logForDiagnosticsNoPII)('warn', 'cli_streaming_idle_warning');
            }, STREAM_IDLE_WARNING_MS, STREAM_IDLE_WARNING_MS);
            streamIdleTimer = setTimeout(() => {
                streamIdleAborted = true;
                streamWatchdogFiredAt = performance.now();
                (0, debug_js_1.logForDebugging)(`Streaming idle timeout: no chunks received for ${STREAM_IDLE_TIMEOUT_MS / 1000}s, aborting stream`, { level: 'error' });
                (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'cli_streaming_idle_timeout');
                (0, index_js_1.logEvent)('tengu_streaming_idle_timeout', {
                    model: options.model,
                    request_id: (streamRequestId ??
                        'unknown'),
                    timeout_ms: STREAM_IDLE_TIMEOUT_MS,
                });
                releaseStreamResources();
            }, STREAM_IDLE_TIMEOUT_MS);
        }
        resetStreamIdleTimer();
        (0, sessionActivity_js_1.startSessionActivity)('api_call');
        try {
            // stream in and accumulate state
            let isFirstChunk = true;
            let lastEventTime = null; // Set after first chunk to avoid measuring TTFB as a stall
            const STALL_THRESHOLD_MS = 30000; // 30 seconds
            let totalStallTime = 0;
            let stallCount = 0;
            for await (const part of stream) {
                resetStreamIdleTimer();
                const now = Date.now();
                // Detect and log streaming stalls (only after first event to avoid counting TTFB)
                if (lastEventTime !== null) {
                    const timeSinceLastEvent = now - lastEventTime;
                    if (timeSinceLastEvent > STALL_THRESHOLD_MS) {
                        stallCount++;
                        totalStallTime += timeSinceLastEvent;
                        (0, debug_js_1.logForDebugging)(`Streaming stall detected: ${(timeSinceLastEvent / 1000).toFixed(1)}s gap between events (stall #${stallCount})`, { level: 'warn' });
                        (0, index_js_1.logEvent)('tengu_streaming_stall', {
                            stall_duration_ms: timeSinceLastEvent,
                            stall_count: stallCount,
                            total_stall_time_ms: totalStallTime,
                            event_type: part.type,
                            model: options.model,
                            request_id: (streamRequestId ??
                                'unknown'),
                        });
                    }
                }
                lastEventTime = now;
                if (isFirstChunk) {
                    (0, debug_js_1.logForDebugging)('Stream started - received first chunk');
                    (0, queryProfiler_js_1.queryCheckpoint)('query_first_chunk_received');
                    if (!options.agentId) {
                        (0, headlessProfiler_js_1.headlessProfilerCheckpoint)('first_chunk');
                    }
                    (0, queryProfiler_js_1.endQueryProfile)();
                    isFirstChunk = false;
                }
                switch (part.type) {
                    case 'message_start': {
                        partialMessage = part.message;
                        ttftMs = Date.now() - start;
                        usage = updateUsage(usage, part.message?.usage);
                        // Capture research from message_start if available (internal only).
                        // Always overwrite with the latest value.
                        if (process.env.USER_TYPE === 'ant' &&
                            'research' in part.message) {
                            research = part.message
                                .research;
                        }
                        break;
                    }
                    case 'content_block_start':
                        switch (part.content_block.type) {
                            case 'tool_use':
                                contentBlocks[part.index] = {
                                    ...part.content_block,
                                    input: '',
                                };
                                break;
                            case 'server_tool_use':
                                contentBlocks[part.index] = {
                                    ...part.content_block,
                                    input: '',
                                };
                                if (part.content_block.name === 'advisor') {
                                    isAdvisorInProgress = true;
                                    (0, debug_js_1.logForDebugging)(`[AdvisorTool] Advisor tool called`);
                                    (0, index_js_1.logEvent)('tengu_advisor_tool_call', {
                                        model: options.model,
                                        advisor_model: (advisorModel ??
                                            'unknown'),
                                    });
                                }
                                break;
                            case 'text':
                                contentBlocks[part.index] = {
                                    ...part.content_block,
                                    // awkwardly, the sdk sometimes returns text as part of a
                                    // content_block_start message, then returns the same text
                                    // again in a content_block_delta message. we ignore it here
                                    // since there doesn't seem to be a way to detect when a
                                    // content_block_delta message duplicates the text.
                                    text: '',
                                };
                                break;
                            case 'thinking':
                                contentBlocks[part.index] = {
                                    ...part.content_block,
                                    // also awkward
                                    thinking: '',
                                    // initialize signature to ensure field exists even if signature_delta never arrives
                                    signature: '',
                                };
                                break;
                            default:
                                // even more awkwardly, the sdk mutates the contents of text blocks
                                // as it works. we want the blocks to be immutable, so that we can
                                // accumulate state ourselves.
                                contentBlocks[part.index] = { ...part.content_block };
                                if (part.content_block.type === 'advisor_tool_result') {
                                    isAdvisorInProgress = false;
                                    (0, debug_js_1.logForDebugging)(`[AdvisorTool] Advisor tool result received`);
                                }
                                break;
                        }
                        break;
                    case 'content_block_delta': {
                        const contentBlock = contentBlocks[part.index];
                        const delta = part.delta;
                        if (!contentBlock) {
                            (0, index_js_1.logEvent)('tengu_streaming_error', {
                                error_type: 'content_block_not_found_delta',
                                part_type: part.type,
                                part_index: part.index,
                            });
                            throw new RangeError('Content block not found');
                        }
                        if ((0, bun_bundle_1.feature)('CONNECTOR_TEXT') &&
                            delta.type === 'connector_text_delta') {
                            if (contentBlock.type !== 'connector_text') {
                                (0, index_js_1.logEvent)('tengu_streaming_error', {
                                    error_type: 'content_block_type_mismatch_connector_text',
                                    expected_type: 'connector_text',
                                    actual_type: contentBlock.type,
                                });
                                throw new Error('Content block is not a connector_text block');
                            }
                            contentBlock.connector_text += delta.connector_text;
                        }
                        else {
                            switch (delta.type) {
                                case 'citations_delta':
                                    // TODO: handle citations
                                    break;
                                case 'input_json_delta':
                                    if (contentBlock.type !== 'tool_use' &&
                                        contentBlock.type !== 'server_tool_use') {
                                        (0, index_js_1.logEvent)('tengu_streaming_error', {
                                            error_type: 'content_block_type_mismatch_input_json',
                                            expected_type: 'tool_use',
                                            actual_type: contentBlock.type,
                                        });
                                        throw new Error('Content block is not a input_json block');
                                    }
                                    if (typeof contentBlock.input !== 'string') {
                                        (0, index_js_1.logEvent)('tengu_streaming_error', {
                                            error_type: 'content_block_input_not_string',
                                            input_type: typeof contentBlock.input,
                                        });
                                        throw new Error('Content block input is not a string');
                                    }
                                    contentBlock.input += delta.partial_json;
                                    break;
                                case 'text_delta':
                                    if (contentBlock.type !== 'text') {
                                        (0, index_js_1.logEvent)('tengu_streaming_error', {
                                            error_type: 'content_block_type_mismatch_text',
                                            expected_type: 'text',
                                            actual_type: contentBlock.type,
                                        });
                                        throw new Error('Content block is not a text block');
                                    }
                                    contentBlock.text += delta.text;
                                    break;
                                case 'signature_delta':
                                    if ((0, bun_bundle_1.feature)('CONNECTOR_TEXT') &&
                                        contentBlock.type === 'connector_text') {
                                        contentBlock.signature = delta.signature;
                                        break;
                                    }
                                    if (contentBlock.type !== 'thinking') {
                                        (0, index_js_1.logEvent)('tengu_streaming_error', {
                                            error_type: 'content_block_type_mismatch_thinking_signature',
                                            expected_type: 'thinking',
                                            actual_type: contentBlock.type,
                                        });
                                        throw new Error('Content block is not a thinking block');
                                    }
                                    contentBlock.signature = delta.signature;
                                    break;
                                case 'thinking_delta':
                                    if (contentBlock.type !== 'thinking') {
                                        (0, index_js_1.logEvent)('tengu_streaming_error', {
                                            error_type: 'content_block_type_mismatch_thinking_delta',
                                            expected_type: 'thinking',
                                            actual_type: contentBlock.type,
                                        });
                                        throw new Error('Content block is not a thinking block');
                                    }
                                    contentBlock.thinking += delta.thinking;
                                    break;
                            }
                        }
                        // Capture research from content_block_delta if available (internal only).
                        // Always overwrite with the latest value.
                        if (process.env.USER_TYPE === 'ant' && 'research' in part) {
                            research = part.research;
                        }
                        break;
                    }
                    case 'content_block_stop': {
                        const contentBlock = contentBlocks[part.index];
                        if (!contentBlock) {
                            (0, index_js_1.logEvent)('tengu_streaming_error', {
                                error_type: 'content_block_not_found_stop',
                                part_type: part.type,
                                part_index: part.index,
                            });
                            throw new RangeError('Content block not found');
                        }
                        if (!partialMessage) {
                            (0, index_js_1.logEvent)('tengu_streaming_error', {
                                error_type: 'partial_message_not_found',
                                part_type: part.type,
                            });
                            throw new Error('Message not found');
                        }
                        const m = {
                            message: {
                                ...partialMessage,
                                content: (0, messages_js_1.normalizeContentFromAPI)([contentBlock], tools, options.agentId),
                            },
                            requestId: streamRequestId ?? undefined,
                            type: 'assistant',
                            uuid: (0, crypto_1.randomUUID)(),
                            timestamp: new Date().toISOString(),
                            ...(process.env.USER_TYPE === 'ant' &&
                                research !== undefined && { research }),
                            ...(advisorModel && { advisorModel }),
                        };
                        newMessages.push(m);
                        yield m;
                        break;
                    }
                    case 'message_delta': {
                        usage = updateUsage(usage, part.usage);
                        // Capture research from message_delta if available (internal only).
                        // Always overwrite with the latest value. Also write back to
                        // already-yielded messages since message_delta arrives after
                        // content_block_stop.
                        if (process.env.USER_TYPE === 'ant' &&
                            'research' in part) {
                            research = part.research;
                            for (const msg of newMessages) {
                                msg.research = research;
                            }
                        }
                        // Write final usage and stop_reason back to the last yielded
                        // message. Messages are created at content_block_stop from
                        // partialMessage, which was set at message_start before any tokens
                        // were generated (output_tokens: 0, stop_reason: null).
                        // message_delta arrives after content_block_stop with the real
                        // values.
                        //
                        // IMPORTANT: Use direct property mutation, not object replacement.
                        // The transcript write queue holds a reference to message.message
                        // and serializes it lazily (100ms flush interval). Object
                        // replacement ({ ...lastMsg.message, usage }) would disconnect
                        // the queued reference; direct mutation ensures the transcript
                        // captures the final values.
                        stopReason = part.delta.stop_reason;
                        const lastMsg = newMessages.at(-1);
                        if (lastMsg) {
                            lastMsg.message.usage = usage;
                            lastMsg.message.stop_reason = stopReason;
                        }
                        // Update cost
                        const costUSDForPart = (0, modelCost_js_1.calculateUSDCost)(resolvedModel, usage);
                        costUSD += (0, cost_tracker_js_1.addToTotalSessionCost)(costUSDForPart, usage, options.model);
                        const refusalMessage = (0, errors_js_2.getErrorMessageIfRefusal)(part.delta.stop_reason, options.model);
                        if (refusalMessage) {
                            yield refusalMessage;
                        }
                        if (stopReason === 'max_tokens') {
                            (0, index_js_1.logEvent)('tengu_max_tokens_reached', {
                                max_tokens: maxOutputTokens,
                            });
                            yield (0, messages_js_1.createAssistantAPIErrorMessage)({
                                content: `${errors_js_2.API_ERROR_MESSAGE_PREFIX}: Claude's response exceeded the ${maxOutputTokens} output token maximum. To configure this behavior, set the CLAUDE_CODE_MAX_OUTPUT_TOKENS environment variable.`,
                                apiError: 'max_output_tokens',
                                error: 'max_output_tokens',
                            });
                        }
                        if (stopReason === 'model_context_window_exceeded') {
                            (0, index_js_1.logEvent)('tengu_context_window_exceeded', {
                                max_tokens: maxOutputTokens,
                                output_tokens: usage.output_tokens,
                            });
                            // Reuse the max_output_tokens recovery path — from the model's
                            // perspective, both mean "response was cut off, continue from
                            // where you left off."
                            yield (0, messages_js_1.createAssistantAPIErrorMessage)({
                                content: `${errors_js_2.API_ERROR_MESSAGE_PREFIX}: The model has reached its context window limit.`,
                                apiError: 'max_output_tokens',
                                error: 'max_output_tokens',
                            });
                        }
                        break;
                    }
                    case 'message_stop':
                        break;
                }
                yield {
                    type: 'stream_event',
                    event: part,
                    ...(part.type === 'message_start' ? { ttftMs } : undefined),
                };
            }
            // Clear the idle timeout watchdog now that the stream loop has exited
            clearStreamIdleTimers();
            // If the stream was aborted by our idle timeout watchdog, fall back to
            // non-streaming retry rather than treating it as a completed stream.
            if (streamIdleAborted) {
                // Instrumentation: proves the for-await exited after the watchdog fired
                // (vs. hung forever). exit_delay_ms measures abort propagation latency:
                // 0-10ms = abort worked; >>1000ms = something else woke the loop.
                const exitDelayMs = streamWatchdogFiredAt !== null
                    ? Math.round(performance.now() - streamWatchdogFiredAt)
                    : -1;
                (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'cli_stream_loop_exited_after_watchdog_clean');
                (0, index_js_1.logEvent)('tengu_stream_loop_exited_after_watchdog', {
                    request_id: (streamRequestId ??
                        'unknown'),
                    exit_delay_ms: exitDelayMs,
                    exit_path: 'clean',
                    model: options.model,
                });
                // Prevent double-emit: this throw lands in the catch block below,
                // whose exit_path='error' probe guards on streamWatchdogFiredAt.
                streamWatchdogFiredAt = null;
                throw new Error('Stream idle timeout - no chunks received');
            }
            // Detect when the stream completed without producing any assistant messages.
            // This covers two proxy failure modes:
            // 1. No events at all (!partialMessage): proxy returned 200 with non-SSE body
            // 2. Partial events (partialMessage set but no content blocks completed AND
            //    no stop_reason received): proxy returned message_start but stream ended
            //    before content_block_stop and before message_delta with stop_reason
            // BetaMessageStream had the first check in _endRequest() but the raw Stream
            // does not - without it the generator silently returns no assistant messages,
            // causing "Execution error" in -p mode.
            // Note: We must check stopReason to avoid false positives. For example, with
            // structured output (--json-schema), the model calls a StructuredOutput tool
            // on turn 1, then on turn 2 responds with end_turn and no content blocks.
            // That's a legitimate empty response, not an incomplete stream.
            if (!partialMessage || (newMessages.length === 0 && !stopReason)) {
                (0, debug_js_1.logForDebugging)(!partialMessage
                    ? 'Stream completed without receiving message_start event - triggering non-streaming fallback'
                    : 'Stream completed with message_start but no content blocks completed - triggering non-streaming fallback', { level: 'error' });
                (0, index_js_1.logEvent)('tengu_stream_no_events', {
                    model: options.model,
                    request_id: (streamRequestId ??
                        'unknown'),
                });
                throw new Error('Stream ended without receiving any events');
            }
            // Log summary if any stalls occurred during streaming
            if (stallCount > 0) {
                (0, debug_js_1.logForDebugging)(`Streaming completed with ${stallCount} stall(s), total stall time: ${(totalStallTime / 1000).toFixed(1)}s`, { level: 'warn' });
                (0, index_js_1.logEvent)('tengu_streaming_stall_summary', {
                    stall_count: stallCount,
                    total_stall_time_ms: totalStallTime,
                    model: options.model,
                    request_id: (streamRequestId ??
                        'unknown'),
                });
            }
            // Check if the cache actually broke based on response tokens
            if ((0, bun_bundle_1.feature)('PROMPT_CACHE_BREAK_DETECTION')) {
                void (0, promptCacheBreakDetection_js_1.checkResponseForCacheBreak)(options.querySource, usage.cache_read_input_tokens, usage.cache_creation_input_tokens, messages, options.agentId, streamRequestId);
            }
            // Process fallback percentage header and quota status if available
            // streamResponse is set when the stream is created in the withRetry callback above
            // TypeScript's control flow analysis can't track that streamResponse is set in the callback
            // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
            const resp = streamResponse;
            if (resp) {
                (0, claudeAiLimits_js_1.extractQuotaStatusFromHeaders)(resp.headers);
                // Store headers for gateway detection
                responseHeaders = resp.headers;
            }
        }
        catch (streamingError) {
            // Clear the idle timeout watchdog on error path too
            clearStreamIdleTimers();
            // Instrumentation: if the watchdog had already fired and the for-await
            // threw (rather than exiting cleanly), record that the loop DID exit and
            // how long after the watchdog. Distinguishes true hangs from error exits.
            if (streamIdleAborted && streamWatchdogFiredAt !== null) {
                const exitDelayMs = Math.round(performance.now() - streamWatchdogFiredAt);
                (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'cli_stream_loop_exited_after_watchdog_error');
                (0, index_js_1.logEvent)('tengu_stream_loop_exited_after_watchdog', {
                    request_id: (streamRequestId ??
                        'unknown'),
                    exit_delay_ms: exitDelayMs,
                    exit_path: 'error',
                    error_name: streamingError instanceof Error
                        ? streamingError.name
                        : 'unknown',
                    model: options.model,
                });
            }
            if (streamingError instanceof error_1.APIUserAbortError) {
                // Check if the abort signal was triggered by the user (ESC key)
                // If the signal is aborted, it's a user-initiated abort
                // If not, it's likely a timeout from the SDK
                if (signal.aborted) {
                    // This is a real user abort (ESC key was pressed)
                    (0, debug_js_1.logForDebugging)(`Streaming aborted by user: ${(0, errors_js_1.errorMessage)(streamingError)}`);
                    if (isAdvisorInProgress) {
                        (0, index_js_1.logEvent)('tengu_advisor_tool_interrupted', {
                            model: options.model,
                            advisor_model: (advisorModel ??
                                'unknown'),
                        });
                    }
                    throw streamingError;
                }
                else {
                    // The SDK threw APIUserAbortError but our signal wasn't aborted
                    // This means it's a timeout from the SDK's internal timeout
                    (0, debug_js_1.logForDebugging)(`Streaming timeout (SDK abort): ${streamingError.message}`, { level: 'error' });
                    // Throw a more specific error for timeout
                    throw new error_1.APIConnectionTimeoutError({ message: 'Request timed out' });
                }
            }
            // When the flag is enabled, skip the non-streaming fallback and let the
            // error propagate to withRetry. The mid-stream fallback causes double tool
            // execution when streaming tool execution is active: the partial stream
            // starts a tool, then the non-streaming retry produces the same tool_use
            // and runs it again. See inc-4258.
            const disableFallback = (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK) ||
                (0, growthbook_js_2.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_disable_streaming_to_non_streaming_fallback', false);
            if (disableFallback) {
                (0, debug_js_1.logForDebugging)(`Error streaming (non-streaming fallback disabled): ${(0, errors_js_1.errorMessage)(streamingError)}`, { level: 'error' });
                (0, index_js_1.logEvent)('tengu_streaming_fallback_to_non_streaming', {
                    model: options.model,
                    error: streamingError instanceof Error
                        ? streamingError.name
                        : String(streamingError),
                    attemptNumber,
                    maxOutputTokens,
                    thinkingType: thinkingConfig.type,
                    fallback_disabled: true,
                    request_id: (streamRequestId ??
                        'unknown'),
                    fallback_cause: (streamIdleAborted
                        ? 'watchdog'
                        : 'other'),
                });
                throw streamingError;
            }
            (0, debug_js_1.logForDebugging)(`Error streaming, falling back to non-streaming mode: ${(0, errors_js_1.errorMessage)(streamingError)}`, { level: 'error' });
            didFallBackToNonStreaming = true;
            if (options.onStreamingFallback) {
                options.onStreamingFallback();
            }
            (0, index_js_1.logEvent)('tengu_streaming_fallback_to_non_streaming', {
                model: options.model,
                error: streamingError instanceof Error
                    ? streamingError.name
                    : String(streamingError),
                attemptNumber,
                maxOutputTokens,
                thinkingType: thinkingConfig.type,
                fallback_disabled: false,
                request_id: (streamRequestId ??
                    'unknown'),
                fallback_cause: (streamIdleAborted
                    ? 'watchdog'
                    : 'other'),
            });
            // Fall back to non-streaming mode with retries.
            // If the streaming failure was itself a 529, count it toward the
            // consecutive-529 budget so total 529s-before-model-fallback is the
            // same whether the overload was hit in streaming or non-streaming mode.
            // This is a speculative fix for https://github.com/anthropics/claude-code/issues/1513
            // Instrumentation: proves executeNonStreamingRequest was entered (vs. the
            // fallback event firing but the call itself hanging at dispatch).
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'cli_nonstreaming_fallback_started');
            (0, index_js_1.logEvent)('tengu_nonstreaming_fallback_started', {
                request_id: (streamRequestId ??
                    'unknown'),
                model: options.model,
                fallback_cause: (streamIdleAborted
                    ? 'watchdog'
                    : 'other'),
            });
            const result = yield* executeNonStreamingRequest({ model: options.model, source: options.querySource }, {
                model: options.model,
                fallbackModel: options.fallbackModel,
                thinkingConfig,
                ...((0, fastMode_js_1.isFastModeEnabled)() && { fastMode: isFastMode }),
                signal,
                initialConsecutive529Errors: (0, withRetry_js_1.is529Error)(streamingError) ? 1 : 0,
                querySource: options.querySource,
            }, paramsFromContext, (attempt, _startTime, tokens) => {
                attemptNumber = attempt;
                maxOutputTokens = tokens;
            }, params => (0, log_js_1.captureAPIRequest)(params, options.querySource), streamRequestId);
            const m = {
                message: {
                    ...result,
                    content: (0, messages_js_1.normalizeContentFromAPI)(result.content, tools, options.agentId),
                },
                requestId: streamRequestId ?? undefined,
                type: 'assistant',
                uuid: (0, crypto_1.randomUUID)(),
                timestamp: new Date().toISOString(),
                ...(process.env.USER_TYPE === 'ant' &&
                    research !== undefined && {
                    research,
                }),
                ...(advisorModel && {
                    advisorModel,
                }),
            };
            newMessages.push(m);
            fallbackMessage = m;
            yield m;
        }
        finally {
            clearStreamIdleTimers();
        }
    }
    catch (errorFromRetry) {
        // FallbackTriggeredError must propagate to query.ts, which performs the
        // actual model switch. Swallowing it here would turn the fallback into a
        // no-op — the user would just see "Model fallback triggered: X -> Y" as
        // an error message with no actual retry on the fallback model.
        if (errorFromRetry instanceof withRetry_js_1.FallbackTriggeredError) {
            throw errorFromRetry;
        }
        // Check if this is a 404 error during stream creation that should trigger
        // non-streaming fallback. This handles gateways that return 404 for streaming
        // endpoints but work fine with non-streaming. Before v2.1.8, BetaMessageStream
        // threw 404s during iteration (caught by inner catch with fallback), but now
        // with raw streams, 404s are thrown during creation (caught here).
        const is404StreamCreationError = !didFallBackToNonStreaming &&
            errorFromRetry instanceof withRetry_js_1.CannotRetryError &&
            errorFromRetry.originalError instanceof error_1.APIError &&
            errorFromRetry.originalError.status === 404;
        if (is404StreamCreationError) {
            // 404 is thrown at .withResponse() before streamRequestId is assigned,
            // and CannotRetryError means every retry failed — so grab the failed
            // request's ID from the error header instead.
            const failedRequestId = errorFromRetry.originalError.requestID ?? 'unknown';
            (0, debug_js_1.logForDebugging)('Streaming endpoint returned 404, falling back to non-streaming mode', { level: 'warn' });
            didFallBackToNonStreaming = true;
            if (options.onStreamingFallback) {
                options.onStreamingFallback();
            }
            (0, index_js_1.logEvent)('tengu_streaming_fallback_to_non_streaming', {
                model: options.model,
                error: '404_stream_creation',
                attemptNumber,
                maxOutputTokens,
                thinkingType: thinkingConfig.type,
                request_id: failedRequestId,
                fallback_cause: '404_stream_creation',
            });
            try {
                // Fall back to non-streaming mode
                const result = yield* executeNonStreamingRequest({ model: options.model, source: options.querySource }, {
                    model: options.model,
                    fallbackModel: options.fallbackModel,
                    thinkingConfig,
                    ...((0, fastMode_js_1.isFastModeEnabled)() && { fastMode: isFastMode }),
                    signal,
                }, paramsFromContext, (attempt, _startTime, tokens) => {
                    attemptNumber = attempt;
                    maxOutputTokens = tokens;
                }, params => (0, log_js_1.captureAPIRequest)(params, options.querySource), failedRequestId);
                const m = {
                    message: {
                        ...result,
                        content: (0, messages_js_1.normalizeContentFromAPI)(result.content, tools, options.agentId),
                    },
                    requestId: streamRequestId ?? undefined,
                    type: 'assistant',
                    uuid: (0, crypto_1.randomUUID)(),
                    timestamp: new Date().toISOString(),
                    ...(process.env.USER_TYPE === 'ant' &&
                        research !== undefined && { research }),
                    ...(advisorModel && { advisorModel }),
                };
                newMessages.push(m);
                fallbackMessage = m;
                yield m;
                // Continue to success logging below
            }
            catch (fallbackError) {
                // Propagate model-fallback signal to query.ts (see comment above).
                if (fallbackError instanceof withRetry_js_1.FallbackTriggeredError) {
                    throw fallbackError;
                }
                // Fallback also failed, handle as normal error
                (0, debug_js_1.logForDebugging)(`Non-streaming fallback also failed: ${(0, errors_js_1.errorMessage)(fallbackError)}`, { level: 'error' });
                let error = fallbackError;
                let errorModel = options.model;
                if (fallbackError instanceof withRetry_js_1.CannotRetryError) {
                    error = fallbackError.originalError;
                    errorModel = fallbackError.retryContext.model;
                }
                if (error instanceof error_1.APIError) {
                    (0, claudeAiLimits_js_1.extractQuotaStatusFromError)(error);
                }
                const requestId = streamRequestId ||
                    (error instanceof error_1.APIError ? error.requestID : undefined) ||
                    (error instanceof error_1.APIError
                        ? error.error?.request_id
                        : undefined);
                (0, logging_js_1.logAPIError)({
                    error,
                    model: errorModel,
                    messageCount: messagesForAPI.length,
                    messageTokens: (0, tokens_js_1.tokenCountFromLastAPIResponse)(messagesForAPI),
                    durationMs: Date.now() - start,
                    durationMsIncludingRetries: Date.now() - startIncludingRetries,
                    attempt: attemptNumber,
                    requestId,
                    clientRequestId,
                    didFallBackToNonStreaming,
                    queryTracking: options.queryTracking,
                    querySource: options.querySource,
                    llmSpan,
                    fastMode: isFastModeRequest,
                    previousRequestId,
                });
                if (error instanceof error_1.APIUserAbortError) {
                    releaseStreamResources();
                    return;
                }
                yield (0, errors_js_2.getAssistantMessageFromError)(error, errorModel, {
                    messages,
                    messagesForAPI,
                });
                releaseStreamResources();
                return;
            }
        }
        else {
            // Original error handling for non-404 errors
            (0, debug_js_1.logForDebugging)(`Error in API request: ${(0, errors_js_1.errorMessage)(errorFromRetry)}`, {
                level: 'error',
            });
            let error = errorFromRetry;
            let errorModel = options.model;
            if (errorFromRetry instanceof withRetry_js_1.CannotRetryError) {
                error = errorFromRetry.originalError;
                errorModel = errorFromRetry.retryContext.model;
            }
            // Extract quota status from error headers if it's a rate limit error
            if (error instanceof error_1.APIError) {
                (0, claudeAiLimits_js_1.extractQuotaStatusFromError)(error);
            }
            // Extract requestId from stream, error header, or error body
            const requestId = streamRequestId ||
                (error instanceof error_1.APIError ? error.requestID : undefined) ||
                (error instanceof error_1.APIError
                    ? error.error?.request_id
                    : undefined);
            (0, logging_js_1.logAPIError)({
                error,
                model: errorModel,
                messageCount: messagesForAPI.length,
                messageTokens: (0, tokens_js_1.tokenCountFromLastAPIResponse)(messagesForAPI),
                durationMs: Date.now() - start,
                durationMsIncludingRetries: Date.now() - startIncludingRetries,
                attempt: attemptNumber,
                requestId,
                clientRequestId,
                didFallBackToNonStreaming,
                queryTracking: options.queryTracking,
                querySource: options.querySource,
                llmSpan,
                fastMode: isFastModeRequest,
                previousRequestId,
            });
            // Don't yield an assistant error message for user aborts
            // The interruption message is handled in query.ts
            if (error instanceof error_1.APIUserAbortError) {
                releaseStreamResources();
                return;
            }
            yield (0, errors_js_2.getAssistantMessageFromError)(error, errorModel, {
                messages,
                messagesForAPI,
            });
            releaseStreamResources();
            return;
        }
    }
    finally {
        (0, sessionActivity_js_1.stopSessionActivity)('api_call');
        // Must be in the finally block: if the generator is terminated early
        // via .return() (e.g. consumer breaks out of for-await-of, or query.ts
        // encounters an abort), code after the try/finally never executes.
        // Without this, the Response object's native TLS/socket buffers leak
        // until the generator itself is GC'd (see GH #32920).
        releaseStreamResources();
        // Non-streaming fallback cost: the streaming path tracks cost in the
        // message_delta handler before any yield. Fallback pushes to newMessages
        // then yields, so tracking must be here to survive .return() at the yield.
        if (fallbackMessage) {
            const fallbackUsage = fallbackMessage.message.usage;
            usage = updateUsage(logging_js_1.EMPTY_USAGE, fallbackUsage);
            stopReason = fallbackMessage.message.stop_reason;
            const fallbackCost = (0, modelCost_js_1.calculateUSDCost)(resolvedModel, fallbackUsage);
            costUSD += (0, cost_tracker_js_1.addToTotalSessionCost)(fallbackCost, fallbackUsage, options.model);
        }
    }
    // Mark all registered tools as sent to API so they become eligible for deletion
    if ((0, bun_bundle_1.feature)('CACHED_MICROCOMPACT') && cachedMCEnabled) {
        (0, microCompact_js_1.markToolsSentToAPIState)();
    }
    // Track the last requestId for the main conversation chain so shutdown
    // can send a cache eviction hint to inference. Exclude backgrounded
    // sessions (Ctrl+B) which share the repl_main_thread querySource but
    // run inside an agent context — they are independent conversation chains
    // whose cache should not be evicted when the foreground session clears.
    if (streamRequestId &&
        !(0, agentContext_js_1.getAgentContext)() &&
        (options.querySource.startsWith('repl_main_thread') ||
            options.querySource === 'sdk')) {
        (0, state_js_1.setLastMainRequestId)(streamRequestId);
    }
    // Precompute scalars so the fire-and-forget .then() closure doesn't pin the
    // full messagesForAPI array (the entire conversation up to the context window
    // limit) until getToolPermissionContext() resolves.
    const logMessageCount = messagesForAPI.length;
    const logMessageTokens = (0, tokens_js_1.tokenCountFromLastAPIResponse)(messagesForAPI);
    void options.getToolPermissionContext().then(permissionContext => {
        (0, logging_js_1.logAPISuccessAndDuration)({
            model: newMessages[0]?.message.model ?? partialMessage?.model ?? options.model,
            preNormalizedModel: options.model,
            usage,
            start,
            startIncludingRetries,
            attempt: attemptNumber,
            messageCount: logMessageCount,
            messageTokens: logMessageTokens,
            requestId: streamRequestId ?? null,
            stopReason,
            ttftMs,
            didFallBackToNonStreaming,
            querySource: options.querySource,
            headers: responseHeaders,
            costUSD,
            queryTracking: options.queryTracking,
            permissionMode: permissionContext.mode,
            // Pass newMessages for beta tracing - extraction happens in logging.ts
            // only when beta tracing is enabled
            newMessages,
            llmSpan,
            globalCacheStrategy,
            requestSetupMs: start - startIncludingRetries,
            attemptStartTimes,
            fastMode: isFastModeRequest,
            previousRequestId,
            betas: lastRequestBetas,
        });
    });
    // Defensive: also release on normal completion (no-op if finally already ran).
    releaseStreamResources();
}
/**
 * Cleans up stream resources to prevent memory leaks.
 * @internal Exported for testing
 */
function cleanupStream(stream) {
    if (!stream) {
        return;
    }
    try {
        // Abort the stream via its controller if not already aborted
        if (!stream.controller.signal.aborted) {
            stream.controller.abort();
        }
    }
    catch {
        // Ignore - stream may already be closed
    }
}
/**
 * Updates usage statistics with new values from streaming API events.
 * Note: Anthropic's streaming API provides cumulative usage totals, not incremental deltas.
 * Each event contains the complete usage up to that point in the stream.
 *
 * Input-related tokens (input_tokens, cache_creation_input_tokens, cache_read_input_tokens)
 * are typically set in message_start and remain constant. message_delta events may send
 * explicit 0 values for these fields, which should not overwrite the values from message_start.
 * We only update these fields if they have a non-null, non-zero value.
 */
function updateUsage(usage, partUsage) {
    if (!partUsage) {
        return { ...usage };
    }
    return {
        input_tokens: partUsage.input_tokens !== null && partUsage.input_tokens > 0
            ? partUsage.input_tokens
            : usage.input_tokens,
        cache_creation_input_tokens: partUsage.cache_creation_input_tokens !== null &&
            partUsage.cache_creation_input_tokens > 0
            ? partUsage.cache_creation_input_tokens
            : usage.cache_creation_input_tokens,
        cache_read_input_tokens: partUsage.cache_read_input_tokens !== null &&
            partUsage.cache_read_input_tokens > 0
            ? partUsage.cache_read_input_tokens
            : usage.cache_read_input_tokens,
        output_tokens: partUsage.output_tokens ?? usage.output_tokens,
        server_tool_use: {
            web_search_requests: partUsage.server_tool_use?.web_search_requests ??
                usage.server_tool_use.web_search_requests,
            web_fetch_requests: partUsage.server_tool_use?.web_fetch_requests ??
                usage.server_tool_use.web_fetch_requests,
        },
        service_tier: usage.service_tier,
        cache_creation: {
            // SDK type BetaMessageDeltaUsage is missing cache_creation, but it's real!
            ephemeral_1h_input_tokens: partUsage.cache_creation?.ephemeral_1h_input_tokens ??
                usage.cache_creation.ephemeral_1h_input_tokens,
            ephemeral_5m_input_tokens: partUsage.cache_creation?.ephemeral_5m_input_tokens ??
                usage.cache_creation.ephemeral_5m_input_tokens,
        },
        // cache_deleted_input_tokens: returned by the API when cache editing
        // deletes KV cache content, but not in SDK types. Kept off NonNullableUsage
        // so the string is eliminated from external builds by dead code elimination.
        // Uses the same > 0 guard as other token fields to prevent message_delta
        // from overwriting the real value with 0.
        ...((0, bun_bundle_1.feature)('CACHED_MICROCOMPACT')
            ? {
                cache_deleted_input_tokens: partUsage
                    .cache_deleted_input_tokens != null &&
                    partUsage
                        .cache_deleted_input_tokens > 0
                    ? partUsage
                        .cache_deleted_input_tokens
                    : (usage
                        .cache_deleted_input_tokens ?? 0),
            }
            : {}),
        inference_geo: usage.inference_geo,
        iterations: partUsage.iterations ?? usage.iterations,
        speed: partUsage.speed ?? usage.speed,
    };
}
/**
 * Accumulates usage from one message into a total usage object.
 * Used to track cumulative usage across multiple assistant turns.
 */
function accumulateUsage(totalUsage, messageUsage) {
    return {
        input_tokens: totalUsage.input_tokens + messageUsage.input_tokens,
        cache_creation_input_tokens: totalUsage.cache_creation_input_tokens +
            messageUsage.cache_creation_input_tokens,
        cache_read_input_tokens: totalUsage.cache_read_input_tokens + messageUsage.cache_read_input_tokens,
        output_tokens: totalUsage.output_tokens + messageUsage.output_tokens,
        server_tool_use: {
            web_search_requests: totalUsage.server_tool_use.web_search_requests +
                messageUsage.server_tool_use.web_search_requests,
            web_fetch_requests: totalUsage.server_tool_use.web_fetch_requests +
                messageUsage.server_tool_use.web_fetch_requests,
        },
        service_tier: messageUsage.service_tier, // Use the most recent service tier
        cache_creation: {
            ephemeral_1h_input_tokens: totalUsage.cache_creation.ephemeral_1h_input_tokens +
                messageUsage.cache_creation.ephemeral_1h_input_tokens,
            ephemeral_5m_input_tokens: totalUsage.cache_creation.ephemeral_5m_input_tokens +
                messageUsage.cache_creation.ephemeral_5m_input_tokens,
        },
        // See comment in updateUsage — field is not on NonNullableUsage to keep
        // the string out of external builds.
        ...((0, bun_bundle_1.feature)('CACHED_MICROCOMPACT')
            ? {
                cache_deleted_input_tokens: (totalUsage
                    .cache_deleted_input_tokens ?? 0) +
                    (messageUsage.cache_deleted_input_tokens ?? 0),
            }
            : {}),
        inference_geo: messageUsage.inference_geo, // Use the most recent
        iterations: messageUsage.iterations, // Use the most recent
        speed: messageUsage.speed, // Use the most recent
    };
}
function isToolResultBlock(block) {
    return (block !== null &&
        typeof block === 'object' &&
        'type' in block &&
        block.type === 'tool_result' &&
        'tool_use_id' in block);
}
// Exported for testing cache_reference placement constraints
function addCacheBreakpoints(messages, enablePromptCaching, querySource, useCachedMC = false, newCacheEdits, pinnedEdits, skipCacheWrite = false) {
    (0, index_js_1.logEvent)('tengu_api_cache_breakpoints', {
        totalMessageCount: messages.length,
        cachingEnabled: enablePromptCaching,
        skipCacheWrite,
    });
    // Exactly one message-level cache_control marker per request. Mycro's
    // turn-to-turn eviction (page_manager/index.rs: Index::insert) frees
    // local-attention KV pages at any cached prefix position NOT in
    // cache_store_int_token_boundaries. With two markers the second-to-last
    // position is protected and its locals survive an extra turn even though
    // nothing will ever resume from there — with one marker they're freed
    // immediately. For fire-and-forget forks (skipCacheWrite) we shift the
    // marker to the second-to-last message: that's the last shared-prefix
    // point, so the write is a no-op merge on mycro (entry already exists)
    // and the fork doesn't leave its own tail in the KVCC. Dense pages are
    // refcounted and survive via the new hash either way.
    const markerIndex = skipCacheWrite ? messages.length - 2 : messages.length - 1;
    const result = messages.map((msg, index) => {
        const addCache = index === markerIndex;
        if (msg.type === 'user') {
            return userMessageToMessageParam(msg, addCache, enablePromptCaching, querySource);
        }
        return assistantMessageToMessageParam(msg, addCache, enablePromptCaching, querySource);
    });
    if (!useCachedMC) {
        return result;
    }
    // Track all cache_references being deleted to prevent duplicates across blocks.
    const seenDeleteRefs = new Set();
    // Helper to deduplicate a cache_edits block against already-seen deletions
    const deduplicateEdits = (block) => {
        const uniqueEdits = block.edits.filter(edit => {
            if (seenDeleteRefs.has(edit.cache_reference)) {
                return false;
            }
            seenDeleteRefs.add(edit.cache_reference);
            return true;
        });
        return { ...block, edits: uniqueEdits };
    };
    // Re-insert all previously-pinned cache_edits at their original positions
    for (const pinned of pinnedEdits ?? []) {
        const msg = result[pinned.userMessageIndex];
        if (msg && msg.role === 'user') {
            if (!Array.isArray(msg.content)) {
                msg.content = [{ type: 'text', text: msg.content }];
            }
            const dedupedBlock = deduplicateEdits(pinned.block);
            if (dedupedBlock.edits.length > 0) {
                (0, contentArray_js_1.insertBlockAfterToolResults)(msg.content, dedupedBlock);
            }
        }
    }
    // Insert new cache_edits into the last user message and pin them
    if (newCacheEdits && result.length > 0) {
        const dedupedNewEdits = deduplicateEdits(newCacheEdits);
        if (dedupedNewEdits.edits.length > 0) {
            for (let i = result.length - 1; i >= 0; i--) {
                const msg = result[i];
                if (msg && msg.role === 'user') {
                    if (!Array.isArray(msg.content)) {
                        msg.content = [{ type: 'text', text: msg.content }];
                    }
                    (0, contentArray_js_1.insertBlockAfterToolResults)(msg.content, dedupedNewEdits);
                    // Pin so this block is re-sent at the same position in future calls
                    (0, microCompact_js_1.pinCacheEdits)(i, newCacheEdits);
                    (0, debug_js_1.logForDebugging)(`Added cache_edits block with ${dedupedNewEdits.edits.length} deletion(s) to message[${i}]: ${dedupedNewEdits.edits.map(e => e.cache_reference).join(', ')}`);
                    break;
                }
            }
        }
    }
    // Add cache_reference to tool_result blocks that are within the cached prefix.
    // Must be done AFTER cache_edits insertion since that modifies content arrays.
    if (enablePromptCaching) {
        // Find the last message containing a cache_control marker
        let lastCCMsg = -1;
        for (let i = 0; i < result.length; i++) {
            const msg = result[i];
            if (Array.isArray(msg.content)) {
                for (const block of msg.content) {
                    if (block && typeof block === 'object' && 'cache_control' in block) {
                        lastCCMsg = i;
                    }
                }
            }
        }
        // Add cache_reference to tool_result blocks that are strictly before
        // the last cache_control marker. The API requires cache_reference to
        // appear "before or on" the last cache_control — we use strict "before"
        // to avoid edge cases where cache_edits splicing shifts block indices.
        //
        // Create new objects instead of mutating in-place to avoid contaminating
        // blocks reused by secondary queries that use models without cache_editing support.
        if (lastCCMsg >= 0) {
            for (let i = 0; i < lastCCMsg; i++) {
                const msg = result[i];
                if (msg.role !== 'user' || !Array.isArray(msg.content)) {
                    continue;
                }
                let cloned = false;
                for (let j = 0; j < msg.content.length; j++) {
                    const block = msg.content[j];
                    if (block && isToolResultBlock(block)) {
                        if (!cloned) {
                            msg.content = [...msg.content];
                            cloned = true;
                        }
                        msg.content[j] = Object.assign({}, block, {
                            cache_reference: block.tool_use_id,
                        });
                    }
                }
            }
        }
    }
    return result;
}
function buildSystemPromptBlocks(systemPrompt, enablePromptCaching, options) {
    // IMPORTANT: Do not add any more blocks for caching or you will get a 400
    return (0, api_js_1.splitSysPromptPrefix)(systemPrompt, {
        skipGlobalCacheForSystemPrompt: options?.skipGlobalCacheForSystemPrompt,
    }).map(block => {
        return {
            type: 'text',
            text: block.text,
            ...(enablePromptCaching &&
                block.cacheScope !== null && {
                cache_control: getCacheControl({
                    scope: block.cacheScope,
                    querySource: options?.querySource,
                }),
            }),
        };
    });
}
async function queryHaiku({ systemPrompt = (0, systemPromptType_js_1.asSystemPrompt)([]), userPrompt, outputFormat, signal, options, }) {
    const result = await (0, vcr_js_1.withVCR)([
        (0, messages_js_1.createUserMessage)({
            content: systemPrompt.map(text => ({ type: 'text', text })),
        }),
        (0, messages_js_1.createUserMessage)({
            content: userPrompt,
        }),
    ], async () => {
        const messages = [
            (0, messages_js_1.createUserMessage)({
                content: userPrompt,
            }),
        ];
        const result = await queryModelWithoutStreaming({
            messages,
            systemPrompt,
            thinkingConfig: { type: 'disabled' },
            tools: [],
            signal,
            options: {
                ...options,
                model: (0, model_js_1.getSmallFastModel)(),
                enablePromptCaching: options.enablePromptCaching ?? false,
                outputFormat,
                async getToolPermissionContext() {
                    return (0, Tool_js_1.getEmptyToolPermissionContext)();
                },
            },
        });
        return [result];
    });
    // We don't use streaming for Haiku so this is safe
    return result[0];
}
/**
 * Query a specific model through the Claude Code infrastructure.
 * This goes through the full query pipeline including proper authentication,
 * betas, and headers - unlike direct API calls.
 */
async function queryWithModel({ systemPrompt = (0, systemPromptType_js_1.asSystemPrompt)([]), userPrompt, outputFormat, signal, options, }) {
    const result = await (0, vcr_js_1.withVCR)([
        (0, messages_js_1.createUserMessage)({
            content: systemPrompt.map(text => ({ type: 'text', text })),
        }),
        (0, messages_js_1.createUserMessage)({
            content: userPrompt,
        }),
    ], async () => {
        const messages = [
            (0, messages_js_1.createUserMessage)({
                content: userPrompt,
            }),
        ];
        const result = await queryModelWithoutStreaming({
            messages,
            systemPrompt,
            thinkingConfig: { type: 'disabled' },
            tools: [],
            signal,
            options: {
                ...options,
                enablePromptCaching: options.enablePromptCaching ?? false,
                outputFormat,
                async getToolPermissionContext() {
                    return (0, Tool_js_1.getEmptyToolPermissionContext)();
                },
            },
        });
        return [result];
    });
    return result[0];
}
// Non-streaming requests have a 10min max per the docs:
// https://platform.claude.com/docs/en/api/errors#long-requests
// The SDK's 21333-token cap is derived from 10min × 128k tokens/hour, but we
// bypass it by setting a client-level timeout, so we can cap higher.
exports.MAX_NON_STREAMING_TOKENS = 64000;
/**
 * Adjusts thinking budget when max_tokens is capped for non-streaming fallback.
 * Ensures the API constraint: max_tokens > thinking.budget_tokens
 *
 * @param params - The parameters that will be sent to the API
 * @param maxTokensCap - The maximum allowed tokens (MAX_NON_STREAMING_TOKENS)
 * @returns Adjusted parameters with thinking budget capped if needed
 */
function adjustParamsForNonStreaming(params, maxTokensCap) {
    const cappedMaxTokens = Math.min(params.max_tokens, maxTokensCap);
    // Adjust thinking budget if it would exceed capped max_tokens
    // to maintain the constraint: max_tokens > thinking.budget_tokens
    const adjustedParams = { ...params };
    if (adjustedParams.thinking?.type === 'enabled' &&
        adjustedParams.thinking.budget_tokens) {
        adjustedParams.thinking = {
            ...adjustedParams.thinking,
            budget_tokens: Math.min(adjustedParams.thinking.budget_tokens, cappedMaxTokens - 1),
        };
    }
    return {
        ...adjustedParams,
        max_tokens: cappedMaxTokens,
    };
}
function isMaxTokensCapEnabled() {
    // 3P default: false (not validated on Bedrock/Vertex)
    return (0, growthbook_js_2.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_otk_slot_v1', false);
}
function getMaxOutputTokensForModel(model) {
    const maxOutputTokens = (0, context_js_1.getModelMaxOutputTokens)(model);
    // Slot-reservation cap: drop default to 8k for all models. BQ p99 output
    // = 4,911 tokens; 32k/64k defaults over-reserve 8-16× slot capacity.
    // Requests hitting the cap get one clean retry at 64k (query.ts
    // max_output_tokens_escalate). Math.min keeps models with lower native
    // defaults (e.g. claude-3-opus at 4k) at their native value. Applied
    // before the env-var override so CLAUDE_CODE_MAX_OUTPUT_TOKENS still wins.
    const defaultTokens = isMaxTokensCapEnabled()
        ? Math.min(maxOutputTokens.default, context_js_1.CAPPED_DEFAULT_MAX_TOKENS)
        : maxOutputTokens.default;
    const result = (0, envValidation_js_1.validateBoundedIntEnvVar)('CLAUDE_CODE_MAX_OUTPUT_TOKENS', process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, defaultTokens, maxOutputTokens.upperLimit);
    return result.effective;
}
