"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchClaudeAIMcpConfigsIfEligible = void 0;
exports.clearClaudeAIMcpConfigsCache = clearClaudeAIMcpConfigsCache;
exports.markClaudeAiMcpConnected = markClaudeAiMcpConnected;
exports.hasClaudeAiMcpEverConnected = hasClaudeAiMcpEverConnected;
const axios_1 = __importDefault(require("axios"));
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const oauth_js_1 = require("src/constants/oauth.js");
const index_js_1 = require("src/services/analytics/index.js");
const auth_js_1 = require("src/utils/auth.js");
const config_js_1 = require("src/utils/config.js");
const debug_js_1 = require("src/utils/debug.js");
const envUtils_js_1 = require("src/utils/envUtils.js");
const client_js_1 = require("./client.js");
const normalization_js_1 = require("./normalization.js");
const FETCH_TIMEOUT_MS = 5000;
const MCP_SERVERS_BETA_HEADER = 'mcp-servers-2025-12-04';
/**
 * Fetches MCP server configurations from Claude.ai org configs.
 * These servers are managed by the organization via Claude.ai.
 *
 * Results are memoized for the session lifetime (fetch once per CLI session).
 */
exports.fetchClaudeAIMcpConfigsIfEligible = (0, memoize_js_1.default)(async () => {
    try {
        if ((0, envUtils_js_1.isEnvDefinedFalsy)(process.env.ENABLE_CLAUDEAI_MCP_SERVERS)) {
            (0, debug_js_1.logForDebugging)('[claudeai-mcp] Disabled via env var');
            (0, index_js_1.logEvent)('tengu_claudeai_mcp_eligibility', {
                state: 'disabled_env_var',
            });
            return {};
        }
        const tokens = (0, auth_js_1.getClaudeAIOAuthTokens)();
        if (!tokens?.accessToken) {
            (0, debug_js_1.logForDebugging)('[claudeai-mcp] No access token');
            (0, index_js_1.logEvent)('tengu_claudeai_mcp_eligibility', {
                state: 'no_oauth_token',
            });
            return {};
        }
        // Check for user:mcp_servers scope directly instead of isClaudeAISubscriber().
        // In non-interactive mode, isClaudeAISubscriber() returns false when ANTHROPIC_API_KEY
        // is set (even with valid OAuth tokens) because preferThirdPartyAuthentication() causes
        // isAnthropicAuthEnabled() to return false. Checking the scope directly allows users
        // with both API keys and OAuth tokens to access claude.ai MCPs in print mode.
        if (!tokens.scopes?.includes('user:mcp_servers')) {
            (0, debug_js_1.logForDebugging)(`[claudeai-mcp] Missing user:mcp_servers scope (scopes=${tokens.scopes?.join(',') || 'none'})`);
            (0, index_js_1.logEvent)('tengu_claudeai_mcp_eligibility', {
                state: 'missing_scope',
            });
            return {};
        }
        const baseUrl = (0, oauth_js_1.getOauthConfig)().BASE_API_URL;
        const url = `${baseUrl}/v1/mcp_servers?limit=1000`;
        (0, debug_js_1.logForDebugging)(`[claudeai-mcp] Fetching from ${url}`);
        const response = await axios_1.default.get(url, {
            headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
                'Content-Type': 'application/json',
                'anthropic-beta': MCP_SERVERS_BETA_HEADER,
                'anthropic-version': '2023-06-01',
            },
            timeout: FETCH_TIMEOUT_MS,
        });
        const configs = {};
        // Track used normalized names to detect collisions and assign (2), (3), etc. suffixes.
        // We check the final normalized name (including suffix) to handle edge cases where
        // a suffixed name collides with another server's base name (e.g., "Example Server 2"
        // colliding with "Example Server! (2)" which both normalize to claude_ai_Example_Server_2).
        const usedNormalizedNames = new Set();
        for (const server of response.data.data) {
            const baseName = `claude.ai ${server.display_name}`;
            // Try without suffix first, then increment until we find an unused normalized name
            let finalName = baseName;
            let finalNormalized = (0, normalization_js_1.normalizeNameForMCP)(finalName);
            let count = 1;
            while (usedNormalizedNames.has(finalNormalized)) {
                count++;
                finalName = `${baseName} (${count})`;
                finalNormalized = (0, normalization_js_1.normalizeNameForMCP)(finalName);
            }
            usedNormalizedNames.add(finalNormalized);
            configs[finalName] = {
                type: 'claudeai-proxy',
                url: server.url,
                id: server.id,
                scope: 'claudeai',
            };
        }
        (0, debug_js_1.logForDebugging)(`[claudeai-mcp] Fetched ${Object.keys(configs).length} servers`);
        (0, index_js_1.logEvent)('tengu_claudeai_mcp_eligibility', {
            state: 'eligible',
        });
        return configs;
    }
    catch {
        (0, debug_js_1.logForDebugging)(`[claudeai-mcp] Fetch failed`);
        return {};
    }
});
/**
 * Clears the memoized cache for fetchClaudeAIMcpConfigsIfEligible.
 * Call this after login so the next fetch will use the new auth tokens.
 */
function clearClaudeAIMcpConfigsCache() {
    exports.fetchClaudeAIMcpConfigsIfEligible.cache.clear?.();
    // Also clear the auth cache so freshly-authorized servers get re-connected
    (0, client_js_1.clearMcpAuthCache)();
}
/**
 * Record that a claude.ai connector successfully connected. Idempotent.
 *
 * Gates the "N connectors unavailable/need auth" startup notifications: a
 * connector that was working yesterday and is now failed is a state change
 * worth surfacing; an org-configured connector that's been needs-auth since
 * it showed up is one the user has demonstrably ignored.
 */
function markClaudeAiMcpConnected(name) {
    (0, config_js_1.saveGlobalConfig)(current => {
        const seen = current.claudeAiMcpEverConnected ?? [];
        if (seen.includes(name))
            return current;
        return { ...current, claudeAiMcpEverConnected: [...seen, name] };
    });
}
function hasClaudeAiMcpEverConnected(name) {
    return ((0, config_js_1.getGlobalConfig)().claudeAiMcpEverConnected ?? []).includes(name);
}
