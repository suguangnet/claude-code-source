"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchBootstrapData = fetchBootstrapData;
const axios_1 = __importDefault(require("axios"));
const isEqual_js_1 = __importDefault(require("lodash-es/isEqual.js"));
const auth_js_1 = require("src/utils/auth.js");
const zod_1 = require("zod");
const oauth_js_1 = require("../../constants/oauth.js");
const config_js_1 = require("../../utils/config.js");
const debug_js_1 = require("../../utils/debug.js");
const http_js_1 = require("../../utils/http.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const log_js_1 = require("../../utils/log.js");
const providers_js_1 = require("../../utils/model/providers.js");
const privacyLevel_js_1 = require("../../utils/privacyLevel.js");
const userAgent_js_1 = require("../../utils/userAgent.js");
const bootstrapResponseSchema = (0, lazySchema_js_1.lazySchema)(() => zod_1.z.object({
    client_data: zod_1.z.record(zod_1.z.unknown()).nullish(),
    additional_model_options: zod_1.z
        .array(zod_1.z
        .object({
        model: zod_1.z.string(),
        name: zod_1.z.string(),
        description: zod_1.z.string(),
    })
        .transform(({ model, name, description }) => ({
        value: model,
        label: name,
        description,
    })))
        .nullish(),
}));
async function fetchBootstrapAPI() {
    if ((0, privacyLevel_js_1.isEssentialTrafficOnly)()) {
        (0, debug_js_1.logForDebugging)('[Bootstrap] Skipped: Nonessential traffic disabled');
        return null;
    }
    if ((0, providers_js_1.getAPIProvider)() !== 'firstParty') {
        (0, debug_js_1.logForDebugging)('[Bootstrap] Skipped: 3P provider');
        return null;
    }
    // OAuth preferred (requires user:profile scope — service-key OAuth tokens
    // lack it and would 403). Fall back to API key auth for console users.
    const apiKey = (0, auth_js_1.getAnthropicApiKey)();
    const hasUsableOAuth = (0, auth_js_1.getClaudeAIOAuthTokens)()?.accessToken && (0, auth_js_1.hasProfileScope)();
    if (!hasUsableOAuth && !apiKey) {
        (0, debug_js_1.logForDebugging)('[Bootstrap] Skipped: no usable OAuth or API key');
        return null;
    }
    const endpoint = `${(0, oauth_js_1.getOauthConfig)().BASE_API_URL}/api/claude_cli/bootstrap`;
    // withOAuth401Retry handles the refresh-and-retry. API key users fail
    // through on 401 (no refresh mechanism — no OAuth token to pass).
    try {
        return await (0, http_js_1.withOAuth401Retry)(async () => {
            // Re-read OAuth each call so the retry picks up the refreshed token.
            const token = (0, auth_js_1.getClaudeAIOAuthTokens)()?.accessToken;
            let authHeaders;
            if (token && (0, auth_js_1.hasProfileScope)()) {
                authHeaders = {
                    Authorization: `Bearer ${token}`,
                    'anthropic-beta': oauth_js_1.OAUTH_BETA_HEADER,
                };
            }
            else if (apiKey) {
                authHeaders = { 'x-api-key': apiKey };
            }
            else {
                (0, debug_js_1.logForDebugging)('[Bootstrap] No auth available on retry, aborting');
                return null;
            }
            (0, debug_js_1.logForDebugging)('[Bootstrap] Fetching');
            const response = await axios_1.default.get(endpoint, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': (0, userAgent_js_1.getClaudeCodeUserAgent)(),
                    ...authHeaders,
                },
                timeout: 5000,
            });
            const parsed = bootstrapResponseSchema().safeParse(response.data);
            if (!parsed.success) {
                (0, debug_js_1.logForDebugging)(`[Bootstrap] Response failed validation: ${parsed.error.message}`);
                return null;
            }
            (0, debug_js_1.logForDebugging)('[Bootstrap] Fetch ok');
            return parsed.data;
        });
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`[Bootstrap] Fetch failed: ${axios_1.default.isAxiosError(error) ? (error.response?.status ?? error.code) : 'unknown'}`);
        throw error;
    }
}
/**
 * Fetch bootstrap data from the API and persist to disk cache.
 */
async function fetchBootstrapData() {
    try {
        const response = await fetchBootstrapAPI();
        if (!response)
            return;
        const clientData = response.client_data ?? null;
        const additionalModelOptions = response.additional_model_options ?? [];
        // Only persist if data actually changed — avoids a config write on every startup.
        const config = (0, config_js_1.getGlobalConfig)();
        if ((0, isEqual_js_1.default)(config.clientDataCache, clientData) &&
            (0, isEqual_js_1.default)(config.additionalModelOptionsCache, additionalModelOptions)) {
            (0, debug_js_1.logForDebugging)('[Bootstrap] Cache unchanged, skipping write');
            return;
        }
        (0, debug_js_1.logForDebugging)('[Bootstrap] Cache updated, persisting to disk');
        (0, config_js_1.saveGlobalConfig)(current => ({
            ...current,
            clientDataCache: clientData,
            additionalModelOptionsCache: additionalModelOptions,
        }));
    }
    catch (error) {
        (0, log_js_1.logError)(error);
    }
}
