"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports._clearMetricsEnabledCacheForTesting = void 0;
exports.checkMetricsEnabled = checkMetricsEnabled;
const axios_1 = __importDefault(require("axios"));
const auth_js_1 = require("../../utils/auth.js");
const config_js_1 = require("../../utils/config.js");
const debug_js_1 = require("../../utils/debug.js");
const errors_js_1 = require("../../utils/errors.js");
const http_js_1 = require("../../utils/http.js");
const log_js_1 = require("../../utils/log.js");
const memoize_js_1 = require("../../utils/memoize.js");
const privacyLevel_js_1 = require("../../utils/privacyLevel.js");
const userAgent_js_1 = require("../../utils/userAgent.js");
// In-memory TTL — dedupes calls within a single process
const CACHE_TTL_MS = 60 * 60 * 1000;
// Disk TTL — org settings rarely change. When disk cache is fresher than this,
// we skip the network entirely (no background refresh). This is what collapses
// N `claude -p` invocations into ~1 API call/day.
const DISK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * Internal function to call the API and check if metrics are enabled
 * This is wrapped by memoizeWithTTLAsync to add caching behavior
 */
async function _fetchMetricsEnabled() {
    const authResult = (0, http_js_1.getAuthHeaders)();
    if (authResult.error) {
        throw new Error(`Auth error: ${authResult.error}`);
    }
    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': (0, userAgent_js_1.getClaudeCodeUserAgent)(),
        ...authResult.headers,
    };
    const endpoint = `https://api.anthropic.com/api/claude_code/organizations/metrics_enabled`;
    const response = await axios_1.default.get(endpoint, {
        headers,
        timeout: 5000,
    });
    return response.data;
}
async function _checkMetricsEnabledAPI() {
    // Incident kill switch: skip the network call when nonessential traffic is disabled.
    // Returning enabled:false sheds load at the consumer (bigqueryExporter skips
    // export). Matches the non-subscriber early-return shape below.
    if ((0, privacyLevel_js_1.isEssentialTrafficOnly)()) {
        return { enabled: false, hasError: false };
    }
    try {
        const data = await (0, http_js_1.withOAuth401Retry)(_fetchMetricsEnabled, {
            also403Revoked: true,
        });
        (0, debug_js_1.logForDebugging)(`Metrics opt-out API response: enabled=${data.metrics_logging_enabled}`);
        return {
            enabled: data.metrics_logging_enabled,
            hasError: false,
        };
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`Failed to check metrics opt-out status: ${(0, errors_js_1.errorMessage)(error)}`);
        (0, log_js_1.logError)(error);
        return { enabled: false, hasError: true };
    }
}
// Create memoized version with custom error handling
const memoizedCheckMetrics = (0, memoize_js_1.memoizeWithTTLAsync)(_checkMetricsEnabledAPI, CACHE_TTL_MS);
/**
 * Fetch (in-memory memoized) and persist to disk on change.
 * Errors are not persisted — a transient failure should not overwrite a
 * known-good disk value.
 */
async function refreshMetricsStatus() {
    const result = await memoizedCheckMetrics();
    if (result.hasError) {
        return result;
    }
    const cached = (0, config_js_1.getGlobalConfig)().metricsStatusCache;
    const unchanged = cached !== undefined && cached.enabled === result.enabled;
    // Skip write when unchanged AND timestamp still fresh — avoids config churn
    // when concurrent callers race past a stale disk entry and all try to write.
    if (unchanged && Date.now() - cached.timestamp < DISK_CACHE_TTL_MS) {
        return result;
    }
    (0, config_js_1.saveGlobalConfig)(current => ({
        ...current,
        metricsStatusCache: {
            enabled: result.enabled,
            timestamp: Date.now(),
        },
    }));
    return result;
}
/**
 * Check if metrics are enabled for the current organization.
 *
 * Two-tier cache:
 * - Disk (24h TTL): survives process restarts. Fresh disk cache → zero network.
 * - In-memory (1h TTL): dedupes the background refresh within a process.
 *
 * The caller (bigqueryExporter) tolerates stale reads — a missed export or
 * an extra one during the 24h window is acceptable.
 */
async function checkMetricsEnabled() {
    // Service key OAuth sessions lack user:profile scope → would 403.
    // API key users (non-subscribers) fall through and use x-api-key auth.
    // This check runs before the disk read so we never persist auth-state-derived
    // answers — only real API responses go to disk. Otherwise a service-key
    // session would poison the cache for a later full-OAuth session.
    if ((0, auth_js_1.isClaudeAISubscriber)() && !(0, auth_js_1.hasProfileScope)()) {
        return { enabled: false, hasError: false };
    }
    const cached = (0, config_js_1.getGlobalConfig)().metricsStatusCache;
    if (cached) {
        if (Date.now() - cached.timestamp > DISK_CACHE_TTL_MS) {
            // saveGlobalConfig's fallback path (config.ts:731) can throw if both
            // locked and fallback writes fail — catch here so fire-and-forget
            // doesn't become an unhandled rejection.
            void refreshMetricsStatus().catch(log_js_1.logError);
        }
        return {
            enabled: cached.enabled,
            hasError: false,
        };
    }
    // First-ever run on this machine: block on the network to populate disk.
    return refreshMetricsStatus();
}
// Export for testing purposes only
const _clearMetricsEnabledCacheForTesting = () => {
    memoizedCheckMetrics.cache.clear();
};
exports._clearMetricsEnabledCacheForTesting = _clearMetricsEnabledCacheForTesting;
