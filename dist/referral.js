"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchReferralEligibility = fetchReferralEligibility;
exports.fetchReferralRedemptions = fetchReferralRedemptions;
exports.checkCachedPassesEligibility = checkCachedPassesEligibility;
exports.formatCreditAmount = formatCreditAmount;
exports.getCachedReferrerReward = getCachedReferrerReward;
exports.getCachedRemainingPasses = getCachedRemainingPasses;
exports.fetchAndStorePassesEligibility = fetchAndStorePassesEligibility;
exports.getCachedOrFetchPassesEligibility = getCachedOrFetchPassesEligibility;
exports.prefetchPassesEligibility = prefetchPassesEligibility;
const axios_1 = __importDefault(require("axios"));
const oauth_js_1 = require("../../constants/oauth.js");
const auth_js_1 = require("../../utils/auth.js");
const config_js_1 = require("../../utils/config.js");
const debug_js_1 = require("../../utils/debug.js");
const log_js_1 = require("../../utils/log.js");
const privacyLevel_js_1 = require("../../utils/privacyLevel.js");
const api_js_1 = require("../../utils/teleport/api.js");
// Cache expiration time: 24 hours (eligibility changes only on subscription/experiment changes)
const CACHE_EXPIRATION_MS = 24 * 60 * 60 * 1000;
// Track in-flight fetch to prevent duplicate API calls
let fetchInProgress = null;
async function fetchReferralEligibility(campaign = 'claude_code_guest_pass') {
    const { accessToken, orgUUID } = await (0, api_js_1.prepareApiRequest)();
    const headers = {
        ...(0, api_js_1.getOAuthHeaders)(accessToken),
        'x-organization-uuid': orgUUID,
    };
    const url = `${(0, oauth_js_1.getOauthConfig)().BASE_API_URL}/api/oauth/organizations/${orgUUID}/referral/eligibility`;
    const response = await axios_1.default.get(url, {
        headers,
        params: { campaign },
        timeout: 5000, // 5 second timeout for background fetch
    });
    return response.data;
}
async function fetchReferralRedemptions(campaign = 'claude_code_guest_pass') {
    const { accessToken, orgUUID } = await (0, api_js_1.prepareApiRequest)();
    const headers = {
        ...(0, api_js_1.getOAuthHeaders)(accessToken),
        'x-organization-uuid': orgUUID,
    };
    const url = `${(0, oauth_js_1.getOauthConfig)().BASE_API_URL}/api/oauth/organizations/${orgUUID}/referral/redemptions`;
    const response = await axios_1.default.get(url, {
        headers,
        params: { campaign },
        timeout: 10000, // 10 second timeout
    });
    return response.data;
}
/**
 * Prechecks for if user can access guest passes feature
 */
function shouldCheckForPasses() {
    return !!((0, auth_js_1.getOauthAccountInfo)()?.organizationUuid &&
        (0, auth_js_1.isClaudeAISubscriber)() &&
        (0, auth_js_1.getSubscriptionType)() === 'max');
}
/**
 * Check cached passes eligibility from GlobalConfig
 * Returns current cached state and cache status
 */
function checkCachedPassesEligibility() {
    if (!shouldCheckForPasses()) {
        return {
            eligible: false,
            needsRefresh: false,
            hasCache: false,
        };
    }
    const orgId = (0, auth_js_1.getOauthAccountInfo)()?.organizationUuid;
    if (!orgId) {
        return {
            eligible: false,
            needsRefresh: false,
            hasCache: false,
        };
    }
    const config = (0, config_js_1.getGlobalConfig)();
    const cachedEntry = config.passesEligibilityCache?.[orgId];
    if (!cachedEntry) {
        // No cached entry, needs fetch
        return {
            eligible: false,
            needsRefresh: true,
            hasCache: false,
        };
    }
    const { eligible, timestamp } = cachedEntry;
    const now = Date.now();
    const needsRefresh = now - timestamp > CACHE_EXPIRATION_MS;
    return {
        eligible,
        needsRefresh,
        hasCache: true,
    };
}
const CURRENCY_SYMBOLS = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    BRL: 'R$',
    CAD: 'CA$',
    AUD: 'A$',
    NZD: 'NZ$',
    SGD: 'S$',
};
function formatCreditAmount(reward) {
    const symbol = CURRENCY_SYMBOLS[reward.currency] ?? `${reward.currency} `;
    const amount = reward.amount_minor_units / 100;
    const formatted = amount % 1 === 0 ? amount.toString() : amount.toFixed(2);
    return `${symbol}${formatted}`;
}
/**
 * Get cached referrer reward info from eligibility cache
 * Returns the reward info if the user is in a v1 campaign, null otherwise
 */
function getCachedReferrerReward() {
    const orgId = (0, auth_js_1.getOauthAccountInfo)()?.organizationUuid;
    if (!orgId)
        return null;
    const config = (0, config_js_1.getGlobalConfig)();
    const cachedEntry = config.passesEligibilityCache?.[orgId];
    return cachedEntry?.referrer_reward ?? null;
}
/**
 * Get the cached remaining passes count from eligibility cache
 * Returns the number of remaining passes, or null if not available
 */
function getCachedRemainingPasses() {
    const orgId = (0, auth_js_1.getOauthAccountInfo)()?.organizationUuid;
    if (!orgId)
        return null;
    const config = (0, config_js_1.getGlobalConfig)();
    const cachedEntry = config.passesEligibilityCache?.[orgId];
    return cachedEntry?.remaining_passes ?? null;
}
/**
 * Fetch passes eligibility and store in GlobalConfig
 * Returns the fetched response or null on error
 */
async function fetchAndStorePassesEligibility() {
    // Return existing promise if fetch is already in progress
    if (fetchInProgress) {
        (0, debug_js_1.logForDebugging)('Passes: Reusing in-flight eligibility fetch');
        return fetchInProgress;
    }
    const orgId = (0, auth_js_1.getOauthAccountInfo)()?.organizationUuid;
    if (!orgId) {
        return null;
    }
    // Store the promise to share with concurrent calls
    fetchInProgress = (async () => {
        try {
            const response = await fetchReferralEligibility();
            const cacheEntry = {
                ...response,
                timestamp: Date.now(),
            };
            (0, config_js_1.saveGlobalConfig)(current => ({
                ...current,
                passesEligibilityCache: {
                    ...current.passesEligibilityCache,
                    [orgId]: cacheEntry,
                },
            }));
            (0, debug_js_1.logForDebugging)(`Passes eligibility cached for org ${orgId}: ${response.eligible}`);
            return response;
        }
        catch (error) {
            (0, debug_js_1.logForDebugging)('Failed to fetch and cache passes eligibility');
            (0, log_js_1.logError)(error);
            return null;
        }
        finally {
            // Clear the promise when done
            fetchInProgress = null;
        }
    })();
    return fetchInProgress;
}
/**
 * Get cached passes eligibility data or fetch if needed
 * Main entry point for all eligibility checks
 *
 * This function never blocks on network - it returns cached data immediately
 * and fetches in the background if needed. On cold start (no cache), it returns
 * null and the passes command won't be available until the next session.
 */
async function getCachedOrFetchPassesEligibility() {
    if (!shouldCheckForPasses()) {
        return null;
    }
    const orgId = (0, auth_js_1.getOauthAccountInfo)()?.organizationUuid;
    if (!orgId) {
        return null;
    }
    const config = (0, config_js_1.getGlobalConfig)();
    const cachedEntry = config.passesEligibilityCache?.[orgId];
    const now = Date.now();
    // No cache - trigger background fetch and return null (non-blocking)
    // The passes command won't be available this session, but will be next time
    if (!cachedEntry) {
        (0, debug_js_1.logForDebugging)('Passes: No cache, fetching eligibility in background (command unavailable this session)');
        void fetchAndStorePassesEligibility();
        return null;
    }
    // Cache exists but is stale - return stale cache and trigger background refresh
    if (now - cachedEntry.timestamp > CACHE_EXPIRATION_MS) {
        (0, debug_js_1.logForDebugging)('Passes: Cache stale, returning cached data and refreshing in background');
        void fetchAndStorePassesEligibility(); // Background refresh
        const { timestamp, ...response } = cachedEntry;
        return response;
    }
    // Cache is fresh - return it immediately
    (0, debug_js_1.logForDebugging)('Passes: Using fresh cached eligibility data');
    const { timestamp, ...response } = cachedEntry;
    return response;
}
/**
 * Prefetch passes eligibility on startup
 */
async function prefetchPassesEligibility() {
    // Skip network requests if nonessential traffic is disabled
    if ((0, privacyLevel_js_1.isEssentialTrafficOnly)()) {
        return;
    }
    void getCachedOrFetchPassesEligibility();
}
