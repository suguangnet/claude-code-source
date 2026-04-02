"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runExtraUsage = runExtraUsage;
const adminRequests_js_1 = require("../../services/api/adminRequests.js");
const overageCreditGrant_js_1 = require("../../services/api/overageCreditGrant.js");
const usage_js_1 = require("../../services/api/usage.js");
const auth_js_1 = require("../../utils/auth.js");
const billing_js_1 = require("../../utils/billing.js");
const browser_js_1 = require("../../utils/browser.js");
const config_js_1 = require("../../utils/config.js");
const log_js_1 = require("../../utils/log.js");
async function runExtraUsage() {
    if (!(0, config_js_1.getGlobalConfig)().hasVisitedExtraUsage) {
        (0, config_js_1.saveGlobalConfig)(prev => ({ ...prev, hasVisitedExtraUsage: true }));
    }
    // Invalidate only the current org's entry so a follow-up read refetches
    // the granted state. Separate from the visited flag since users may run
    // /extra-usage more than once while iterating on the claim flow.
    (0, overageCreditGrant_js_1.invalidateOverageCreditGrantCache)();
    const subscriptionType = (0, auth_js_1.getSubscriptionType)();
    const isTeamOrEnterprise = subscriptionType === 'team' || subscriptionType === 'enterprise';
    const hasBillingAccess = (0, billing_js_1.hasClaudeAiBillingAccess)();
    if (!hasBillingAccess && isTeamOrEnterprise) {
        // Mirror apps/claude-ai useHasUnlimitedOverage(): if overage is enabled
        // with no monthly cap, there is nothing to request. On fetch error, fall
        // through and let the user ask (matching web's "err toward show" behavior).
        let extraUsage;
        try {
            const utilization = await (0, usage_js_1.fetchUtilization)();
            extraUsage = utilization?.extra_usage;
        }
        catch (error) {
            (0, log_js_1.logError)(error);
        }
        if (extraUsage?.is_enabled && extraUsage.monthly_limit === null) {
            return {
                type: 'message',
                value: 'Your organization already has unlimited extra usage. No request needed.',
            };
        }
        try {
            const eligibility = await (0, adminRequests_js_1.checkAdminRequestEligibility)('limit_increase');
            if (eligibility?.is_allowed === false) {
                return {
                    type: 'message',
                    value: 'Please contact your admin to manage extra usage settings.',
                };
            }
        }
        catch (error) {
            (0, log_js_1.logError)(error);
            // If eligibility check fails, continue — the create endpoint will enforce if necessary
        }
        try {
            const pendingOrDismissedRequests = await (0, adminRequests_js_1.getMyAdminRequests)('limit_increase', ['pending', 'dismissed']);
            if (pendingOrDismissedRequests && pendingOrDismissedRequests.length > 0) {
                return {
                    type: 'message',
                    value: 'You have already submitted a request for extra usage to your admin.',
                };
            }
        }
        catch (error) {
            (0, log_js_1.logError)(error);
            // Fall through to creating a new request below
        }
        try {
            await (0, adminRequests_js_1.createAdminRequest)({
                request_type: 'limit_increase',
                details: null,
            });
            return {
                type: 'message',
                value: extraUsage?.is_enabled
                    ? 'Request sent to your admin to increase extra usage.'
                    : 'Request sent to your admin to enable extra usage.',
            };
        }
        catch (error) {
            (0, log_js_1.logError)(error);
            // Fall through to generic message below
        }
        return {
            type: 'message',
            value: 'Please contact your admin to manage extra usage settings.',
        };
    }
    const url = isTeamOrEnterprise
        ? 'https://claude.ai/admin-settings/usage'
        : 'https://claude.ai/settings/usage';
    try {
        const opened = await (0, browser_js_1.openBrowser)(url);
        return { type: 'browser-opened', url, opened };
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return {
            type: 'message',
            value: `Failed to open browser. Please visit ${url} to manage extra usage.`,
        };
    }
}
