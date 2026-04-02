"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCachedOverageCreditGrant = getCachedOverageCreditGrant;
exports.invalidateOverageCreditGrantCache = invalidateOverageCreditGrantCache;
exports.refreshOverageCreditGrantCache = refreshOverageCreditGrantCache;
exports.formatGrantAmount = formatGrantAmount;
const axios_1 = __importDefault(require("axios"));
const oauth_js_1 = require("../../constants/oauth.js");
const auth_js_1 = require("../../utils/auth.js");
const config_js_1 = require("../../utils/config.js");
const log_js_1 = require("../../utils/log.js");
const privacyLevel_js_1 = require("../../utils/privacyLevel.js");
const api_js_1 = require("../../utils/teleport/api.js");
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
/**
 * Fetch the current user's overage credit grant eligibility from the backend.
 * The backend resolves tier-specific amounts and role-based claim permission,
 * so the CLI just reads the response without replicating that logic.
 */
async function fetchOverageCreditGrant() {
    try {
        const { accessToken, orgUUID } = await (0, api_js_1.prepareApiRequest)();
        const url = `${(0, oauth_js_1.getOauthConfig)().BASE_API_URL}/api/oauth/organizations/${orgUUID}/overage_credit_grant`;
        const response = await axios_1.default.get(url, {
            headers: (0, api_js_1.getOAuthHeaders)(accessToken),
        });
        return response.data;
    }
    catch (err) {
        (0, log_js_1.logError)(err);
        return null;
    }
}
/**
 * Get cached grant info. Returns null if no cache or cache is stale.
 * Callers should render nothing (not block) when this returns null —
 * refreshOverageCreditGrantCache fires lazily to populate it.
 */
function getCachedOverageCreditGrant() {
    const orgId = (0, auth_js_1.getOauthAccountInfo)()?.organizationUuid;
    if (!orgId)
        return null;
    const cached = (0, config_js_1.getGlobalConfig)().overageCreditGrantCache?.[orgId];
    if (!cached)
        return null;
    if (Date.now() - cached.timestamp > CACHE_TTL_MS)
        return null;
    return cached.info;
}
/**
 * Drop the current org's cached entry so the next read refetches.
 * Leaves other orgs' entries intact.
 */
function invalidateOverageCreditGrantCache() {
    const orgId = (0, auth_js_1.getOauthAccountInfo)()?.organizationUuid;
    if (!orgId)
        return;
    const cache = (0, config_js_1.getGlobalConfig)().overageCreditGrantCache;
    if (!cache || !(orgId in cache))
        return;
    (0, config_js_1.saveGlobalConfig)(prev => {
        const next = { ...prev.overageCreditGrantCache };
        delete next[orgId];
        return { ...prev, overageCreditGrantCache: next };
    });
}
/**
 * Fetch and cache grant info. Fire-and-forget; call when an upsell surface
 * is about to render and the cache is empty.
 */
async function refreshOverageCreditGrantCache() {
    if ((0, privacyLevel_js_1.isEssentialTrafficOnly)())
        return;
    const orgId = (0, auth_js_1.getOauthAccountInfo)()?.organizationUuid;
    if (!orgId)
        return;
    const info = await fetchOverageCreditGrant();
    if (!info)
        return;
    // Skip rewriting info if grant data is unchanged — avoids config write
    // amplification (inc-4552 pattern). Still refresh the timestamp so the
    // TTL-based staleness check in getCachedOverageCreditGrant doesn't keep
    // re-triggering API calls on every component mount.
    (0, config_js_1.saveGlobalConfig)(prev => {
        // Derive from prev (lock-fresh) rather than a pre-lock getGlobalConfig()
        // read — saveConfigWithLock re-reads config from disk under the file lock,
        // so another CLI instance may have written between any outer read and lock
        // acquire.
        const prevCached = prev.overageCreditGrantCache?.[orgId];
        const existing = prevCached?.info;
        const dataUnchanged = existing &&
            existing.available === info.available &&
            existing.eligible === info.eligible &&
            existing.granted === info.granted &&
            existing.amount_minor_units === info.amount_minor_units &&
            existing.currency === info.currency;
        // When data is unchanged and timestamp is still fresh, skip the write entirely
        if (dataUnchanged &&
            prevCached &&
            Date.now() - prevCached.timestamp <= CACHE_TTL_MS) {
            return prev;
        }
        const entry = {
            info: dataUnchanged ? existing : info,
            timestamp: Date.now(),
        };
        return {
            ...prev,
            overageCreditGrantCache: {
                ...prev.overageCreditGrantCache,
                [orgId]: entry,
            },
        };
    });
}
/**
 * Format the grant amount for display. Returns null if amount isn't available
 * (not eligible, or currency we don't know how to format).
 */
function formatGrantAmount(info) {
    if (info.amount_minor_units == null || !info.currency)
        return null;
    // For now only USD; backend may expand later
    if (info.currency.toUpperCase() === 'USD') {
        const dollars = info.amount_minor_units / 100;
        return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
    }
    return null;
}
