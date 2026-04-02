"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMPTY_USAGE = void 0;
exports.logAPIQuery = logAPIQuery;
exports.logAPIError = logAPIError;
exports.logAPISuccessAndDuration = logAPISuccessAndDuration;
const bun_bundle_1 = require("bun:bundle");
const sdk_1 = require("@anthropic-ai/sdk");
const state_js_1 = require("src/bootstrap/state.js");
const connectorText_js_1 = require("src/types/connectorText.js");
const debug_js_1 = require("src/utils/debug.js");
const log_js_1 = require("src/utils/log.js");
const providers_js_1 = require("src/utils/model/providers.js");
const slowOperations_js_1 = require("src/utils/slowOperations.js");
const events_js_1 = require("src/utils/telemetry/events.js");
const sessionTracing_js_1 = require("src/utils/telemetry/sessionTracing.js");
const agentContext_js_1 = require("../../utils/agentContext.js");
const index_js_1 = require("../analytics/index.js");
const metadata_js_1 = require("../analytics/metadata.js");
const emptyUsage_js_1 = require("./emptyUsage.js");
Object.defineProperty(exports, "EMPTY_USAGE", { enumerable: true, get: function () { return emptyUsage_js_1.EMPTY_USAGE; } });
const errors_js_1 = require("./errors.js");
const errorUtils_js_1 = require("./errorUtils.js");
function getErrorMessage(error) {
    if (error instanceof sdk_1.APIError) {
        const body = error.error;
        if (body?.error?.message)
            return body.error.message;
    }
    return error instanceof Error ? error.message : String(error);
}
// Gateway fingerprints for detecting AI gateways from response headers
const GATEWAY_FINGERPRINTS = {
    // https://docs.litellm.ai/docs/proxy/response_headers
    litellm: {
        prefixes: ['x-litellm-'],
    },
    // https://docs.helicone.ai/helicone-headers/header-directory
    helicone: {
        prefixes: ['helicone-'],
    },
    // https://portkey.ai/docs/api-reference/response-schema
    portkey: {
        prefixes: ['x-portkey-'],
    },
    // https://developers.cloudflare.com/ai-gateway/evaluations/add-human-feedback-api/
    'cloudflare-ai-gateway': {
        prefixes: ['cf-aig-'],
    },
    // https://developer.konghq.com/ai-gateway/ — X-Kong-Upstream-Latency, X-Kong-Proxy-Latency
    kong: {
        prefixes: ['x-kong-'],
    },
    // https://www.braintrust.dev/docs/guides/proxy — x-bt-used-endpoint, x-bt-cached
    braintrust: {
        prefixes: ['x-bt-'],
    },
};
// Gateways that use provider-owned domains (not self-hosted), so the
// ANTHROPIC_BASE_URL hostname is a reliable signal even without a
// distinctive response header.
const GATEWAY_HOST_SUFFIXES = {
    // https://docs.databricks.com/aws/en/ai-gateway/
    databricks: [
        '.cloud.databricks.com',
        '.azuredatabricks.net',
        '.gcp.databricks.com',
    ],
};
function detectGateway({ headers, baseUrl, }) {
    if (headers) {
        // Header names are already lowercase from the Headers API
        const headerNames = [];
        headers.forEach((_, key) => headerNames.push(key));
        for (const [gw, { prefixes }] of Object.entries(GATEWAY_FINGERPRINTS)) {
            if (prefixes.some(p => headerNames.some(h => h.startsWith(p)))) {
                return gw;
            }
        }
    }
    if (baseUrl) {
        try {
            const host = new URL(baseUrl).hostname.toLowerCase();
            for (const [gw, suffixes] of Object.entries(GATEWAY_HOST_SUFFIXES)) {
                if (suffixes.some(s => host.endsWith(s))) {
                    return gw;
                }
            }
        }
        catch {
            // malformed URL — ignore
        }
    }
    return undefined;
}
function getAnthropicEnvMetadata() {
    return {
        ...(process.env.ANTHROPIC_BASE_URL
            ? {
                baseUrl: process.env
                    .ANTHROPIC_BASE_URL,
            }
            : {}),
        ...(process.env.ANTHROPIC_MODEL
            ? {
                envModel: process.env
                    .ANTHROPIC_MODEL,
            }
            : {}),
        ...(process.env.ANTHROPIC_SMALL_FAST_MODEL
            ? {
                envSmallFastModel: process.env
                    .ANTHROPIC_SMALL_FAST_MODEL,
            }
            : {}),
    };
}
function getBuildAgeMinutes() {
    if (!MACRO.BUILD_TIME)
        return undefined;
    const buildTime = new Date(MACRO.BUILD_TIME).getTime();
    if (isNaN(buildTime))
        return undefined;
    return Math.floor((Date.now() - buildTime) / 60000);
}
function logAPIQuery({ model, messagesLength, temperature, betas, permissionMode, querySource, queryTracking, thinkingType, effortValue, fastMode, previousRequestId, }) {
    (0, index_js_1.logEvent)('tengu_api_query', {
        model: model,
        messagesLength,
        temperature: temperature,
        provider: (0, providers_js_1.getAPIProviderForStatsig)(),
        buildAgeMins: getBuildAgeMinutes(),
        ...(betas?.length
            ? {
                betas: betas.join(','),
            }
            : {}),
        permissionMode: permissionMode,
        querySource: querySource,
        ...(queryTracking
            ? {
                queryChainId: queryTracking.chainId,
                queryDepth: queryTracking.depth,
            }
            : {}),
        thinkingType: thinkingType,
        effortValue: effortValue,
        fastMode,
        ...(previousRequestId
            ? {
                previousRequestId: previousRequestId,
            }
            : {}),
        ...getAnthropicEnvMetadata(),
    });
}
function logAPIError({ error, model, messageCount, messageTokens, durationMs, durationMsIncludingRetries, attempt, requestId, clientRequestId, didFallBackToNonStreaming, promptCategory, headers, queryTracking, querySource, llmSpan, fastMode, previousRequestId, }) {
    const gateway = detectGateway({
        headers: error instanceof sdk_1.APIError && error.headers ? error.headers : headers,
        baseUrl: process.env.ANTHROPIC_BASE_URL,
    });
    const errStr = getErrorMessage(error);
    const status = error instanceof sdk_1.APIError ? String(error.status) : undefined;
    const errorType = (0, errors_js_1.classifyAPIError)(error);
    // Log detailed connection error info to debug logs (visible via --debug)
    const connectionDetails = (0, errorUtils_js_1.extractConnectionErrorDetails)(error);
    if (connectionDetails) {
        const sslLabel = connectionDetails.isSSLError ? ' (SSL error)' : '';
        (0, debug_js_1.logForDebugging)(`Connection error details: code=${connectionDetails.code}${sslLabel}, message=${connectionDetails.message}`, { level: 'error' });
    }
    const invocation = (0, agentContext_js_1.consumeInvokingRequestId)();
    if (clientRequestId) {
        (0, debug_js_1.logForDebugging)(`API error x-client-request-id=${clientRequestId} (give this to the API team for server-log lookup)`, { level: 'error' });
    }
    (0, log_js_1.logError)(error);
    (0, index_js_1.logEvent)('tengu_api_error', {
        model: model,
        error: errStr,
        status: status,
        errorType: errorType,
        messageCount,
        messageTokens,
        durationMs,
        durationMsIncludingRetries,
        attempt,
        provider: (0, providers_js_1.getAPIProviderForStatsig)(),
        requestId: requestId ||
            undefined,
        ...(invocation
            ? {
                invokingRequestId: invocation.invokingRequestId,
                invocationKind: invocation.invocationKind,
            }
            : {}),
        clientRequestId: clientRequestId ||
            undefined,
        didFallBackToNonStreaming,
        ...(promptCategory
            ? {
                promptCategory: promptCategory,
            }
            : {}),
        ...(gateway
            ? {
                gateway: gateway,
            }
            : {}),
        ...(queryTracking
            ? {
                queryChainId: queryTracking.chainId,
                queryDepth: queryTracking.depth,
            }
            : {}),
        ...(querySource
            ? {
                querySource: querySource,
            }
            : {}),
        fastMode,
        ...(previousRequestId
            ? {
                previousRequestId: previousRequestId,
            }
            : {}),
        ...getAnthropicEnvMetadata(),
    });
    // Log API error event for OTLP
    void (0, events_js_1.logOTelEvent)('api_error', {
        model: model,
        error: errStr,
        status_code: String(status),
        duration_ms: String(durationMs),
        attempt: String(attempt),
        speed: fastMode ? 'fast' : 'normal',
    });
    // Pass the span to correctly match responses to requests when beta tracing is enabled
    (0, sessionTracing_js_1.endLLMRequestSpan)(llmSpan, {
        success: false,
        statusCode: status ? parseInt(status) : undefined,
        error: errStr,
        attempt,
    });
    // Log first error for teleported sessions (reliability tracking)
    const teleportInfo = (0, state_js_1.getTeleportedSessionInfo)();
    if (teleportInfo?.isTeleported && !teleportInfo.hasLoggedFirstMessage) {
        (0, index_js_1.logEvent)('tengu_teleport_first_message_error', {
            session_id: teleportInfo.sessionId,
            error_type: errorType,
        });
        (0, state_js_1.markFirstTeleportMessageLogged)();
    }
}
function logAPISuccess({ model, preNormalizedModel, messageCount, messageTokens, usage, durationMs, durationMsIncludingRetries, attempt, ttftMs, requestId, stopReason, costUSD, didFallBackToNonStreaming, querySource, gateway, queryTracking, permissionMode, globalCacheStrategy, textContentLength, thinkingContentLength, toolUseContentLengths, connectorTextBlockCount, fastMode, previousRequestId, betas, }) {
    const isNonInteractiveSession = (0, state_js_1.getIsNonInteractiveSession)();
    const isPostCompaction = (0, state_js_1.consumePostCompaction)();
    const hasPrintFlag = process.argv.includes('-p') || process.argv.includes('--print');
    const now = Date.now();
    const lastCompletion = (0, state_js_1.getLastApiCompletionTimestamp)();
    const timeSinceLastApiCallMs = lastCompletion !== null ? now - lastCompletion : undefined;
    const invocation = (0, agentContext_js_1.consumeInvokingRequestId)();
    (0, index_js_1.logEvent)('tengu_api_success', {
        model: model,
        ...(preNormalizedModel !== model
            ? {
                preNormalizedModel: preNormalizedModel,
            }
            : {}),
        ...(betas?.length
            ? {
                betas: betas.join(','),
            }
            : {}),
        messageCount,
        messageTokens,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cachedInputTokens: usage.cache_read_input_tokens ?? 0,
        uncachedInputTokens: usage.cache_creation_input_tokens ?? 0,
        durationMs: durationMs,
        durationMsIncludingRetries: durationMsIncludingRetries,
        attempt: attempt,
        ttftMs: ttftMs ?? undefined,
        buildAgeMins: getBuildAgeMinutes(),
        provider: (0, providers_js_1.getAPIProviderForStatsig)(),
        requestId: requestId ??
            undefined,
        ...(invocation
            ? {
                invokingRequestId: invocation.invokingRequestId,
                invocationKind: invocation.invocationKind,
            }
            : {}),
        stop_reason: stopReason ??
            undefined,
        costUSD,
        didFallBackToNonStreaming,
        isNonInteractiveSession,
        print: hasPrintFlag,
        isTTY: process.stdout.isTTY ?? false,
        querySource: querySource,
        ...(gateway
            ? {
                gateway: gateway,
            }
            : {}),
        ...(queryTracking
            ? {
                queryChainId: queryTracking.chainId,
                queryDepth: queryTracking.depth,
            }
            : {}),
        permissionMode: permissionMode,
        ...(globalCacheStrategy
            ? {
                globalCacheStrategy: globalCacheStrategy,
            }
            : {}),
        ...(textContentLength !== undefined
            ? {
                textContentLength,
            }
            : {}),
        ...(thinkingContentLength !== undefined
            ? {
                thinkingContentLength,
            }
            : {}),
        ...(toolUseContentLengths !== undefined
            ? {
                toolUseContentLengths: (0, slowOperations_js_1.jsonStringify)(toolUseContentLengths),
            }
            : {}),
        ...(connectorTextBlockCount !== undefined
            ? {
                connectorTextBlockCount,
            }
            : {}),
        fastMode,
        // Log cache_deleted_input_tokens for cache editing analysis. Casts needed
        // because the field is intentionally not on NonNullableUsage (excluded from
        // external builds). Set by updateUsage() when cache editing is active.
        ...((0, bun_bundle_1.feature)('CACHED_MICROCOMPACT') &&
            (usage
                .cache_deleted_input_tokens ?? 0) > 0
            ? {
                cacheDeletedInputTokens: usage.cache_deleted_input_tokens,
            }
            : {}),
        ...(previousRequestId
            ? {
                previousRequestId: previousRequestId,
            }
            : {}),
        ...(isPostCompaction ? { isPostCompaction } : {}),
        ...getAnthropicEnvMetadata(),
        timeSinceLastApiCallMs,
    });
    (0, state_js_1.setLastApiCompletionTimestamp)(now);
}
function logAPISuccessAndDuration({ model, preNormalizedModel, start, startIncludingRetries, ttftMs, usage, attempt, messageCount, messageTokens, requestId, stopReason, didFallBackToNonStreaming, querySource, headers, costUSD, queryTracking, permissionMode, newMessages, llmSpan, globalCacheStrategy, requestSetupMs, attemptStartTimes, fastMode, previousRequestId, betas, }) {
    const gateway = detectGateway({
        headers,
        baseUrl: process.env.ANTHROPIC_BASE_URL,
    });
    let textContentLength;
    let thinkingContentLength;
    let toolUseContentLengths;
    let connectorTextBlockCount;
    if (newMessages) {
        let textLen = 0;
        let thinkingLen = 0;
        let hasToolUse = false;
        const toolLengths = {};
        let connectorCount = 0;
        for (const msg of newMessages) {
            for (const block of msg.message.content) {
                if (block.type === 'text') {
                    textLen += block.text.length;
                }
                else if ((0, bun_bundle_1.feature)('CONNECTOR_TEXT') && (0, connectorText_js_1.isConnectorTextBlock)(block)) {
                    connectorCount++;
                }
                else if (block.type === 'thinking') {
                    thinkingLen += block.thinking.length;
                }
                else if (block.type === 'tool_use' ||
                    block.type === 'server_tool_use' ||
                    block.type === 'mcp_tool_use') {
                    const inputLen = (0, slowOperations_js_1.jsonStringify)(block.input).length;
                    const sanitizedName = (0, metadata_js_1.sanitizeToolNameForAnalytics)(block.name);
                    toolLengths[sanitizedName] =
                        (toolLengths[sanitizedName] ?? 0) + inputLen;
                    hasToolUse = true;
                }
            }
        }
        textContentLength = textLen;
        thinkingContentLength = thinkingLen > 0 ? thinkingLen : undefined;
        toolUseContentLengths = hasToolUse ? toolLengths : undefined;
        connectorTextBlockCount = connectorCount > 0 ? connectorCount : undefined;
    }
    const durationMs = Date.now() - start;
    const durationMsIncludingRetries = Date.now() - startIncludingRetries;
    (0, state_js_1.addToTotalDurationState)(durationMsIncludingRetries, durationMs);
    logAPISuccess({
        model,
        preNormalizedModel,
        messageCount,
        messageTokens,
        usage,
        durationMs,
        durationMsIncludingRetries,
        attempt,
        ttftMs,
        requestId,
        stopReason,
        costUSD,
        didFallBackToNonStreaming,
        querySource,
        gateway,
        queryTracking,
        permissionMode,
        globalCacheStrategy,
        textContentLength,
        thinkingContentLength,
        toolUseContentLengths,
        connectorTextBlockCount,
        fastMode,
        previousRequestId,
        betas,
    });
    // Log API request event for OTLP
    void (0, events_js_1.logOTelEvent)('api_request', {
        model,
        input_tokens: String(usage.input_tokens),
        output_tokens: String(usage.output_tokens),
        cache_read_tokens: String(usage.cache_read_input_tokens),
        cache_creation_tokens: String(usage.cache_creation_input_tokens),
        cost_usd: String(costUSD),
        duration_ms: String(durationMs),
        speed: fastMode ? 'fast' : 'normal',
    });
    // Extract model output, thinking output, and tool call flag when beta tracing is enabled
    let modelOutput;
    let thinkingOutput;
    let hasToolCall;
    if ((0, sessionTracing_js_1.isBetaTracingEnabled)() && newMessages) {
        // Model output - visible to all users
        modelOutput =
            newMessages
                .flatMap(m => m.message.content
                .filter(c => c.type === 'text')
                .map(c => c.text))
                .join('\n') || undefined;
        // Thinking output - Ant-only (build-time gated)
        if (process.env.USER_TYPE === 'ant') {
            thinkingOutput =
                newMessages
                    .flatMap(m => m.message.content
                    .filter(c => c.type === 'thinking')
                    .map(c => c.thinking))
                    .join('\n') || undefined;
        }
        // Check if any tool_use blocks were in the output
        hasToolCall = newMessages.some(m => m.message.content.some(c => c.type === 'tool_use'));
    }
    // Pass the span to correctly match responses to requests when beta tracing is enabled
    (0, sessionTracing_js_1.endLLMRequestSpan)(llmSpan, {
        success: true,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cache_read_input_tokens,
        cacheCreationTokens: usage.cache_creation_input_tokens,
        attempt,
        modelOutput,
        thinkingOutput,
        hasToolCall,
        ttftMs: ttftMs ?? undefined,
        requestSetupMs,
        attemptStartTimes,
    });
    // Log first successful message for teleported sessions (reliability tracking)
    const teleportInfo = (0, state_js_1.getTeleportedSessionInfo)();
    if (teleportInfo?.isTeleported && !teleportInfo.hasLoggedFirstMessage) {
        (0, index_js_1.logEvent)('tengu_teleport_first_message_success', {
            session_id: teleportInfo.sessionId,
        });
        (0, state_js_1.markFirstTeleportMessageLogged)();
    }
}
