"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasConsoleBillingAccess = hasConsoleBillingAccess;
exports.setMockBillingAccessOverride = setMockBillingAccessOverride;
exports.hasClaudeAiBillingAccess = hasClaudeAiBillingAccess;
const auth_js_1 = require("./auth.js");
const config_js_1 = require("./config.js");
const envUtils_js_1 = require("./envUtils.js");
function hasConsoleBillingAccess() {
    // Check if cost reporting is disabled via environment variable
    if ((0, envUtils_js_1.isEnvTruthy)(process.env.DISABLE_COST_WARNINGS)) {
        return false;
    }
    const isSubscriber = (0, auth_js_1.isClaudeAISubscriber)();
    // This might be wrong if user is signed into Max but also using an API key, but
    // we already show a warning on launch in that case
    if (isSubscriber)
        return false;
    // Check if user has any form of authentication
    const authSource = (0, auth_js_1.getAuthTokenSource)();
    const hasApiKey = (0, auth_js_1.getAnthropicApiKey)() !== null;
    // If user has no authentication at all (logged out), don't show costs
    if (!authSource.hasToken && !hasApiKey) {
        return false;
    }
    const config = (0, config_js_1.getGlobalConfig)();
    const orgRole = config.oauthAccount?.organizationRole;
    const workspaceRole = config.oauthAccount?.workspaceRole;
    if (!orgRole || !workspaceRole) {
        return false; // hide cost for grandfathered users who have not re-authed since we've added roles
    }
    // Users have billing access if they are admins or billing roles at either workspace or organization level
    return (['admin', 'billing'].includes(orgRole) ||
        ['workspace_admin', 'workspace_billing'].includes(workspaceRole));
}
// Mock billing access for /mock-limits testing (set by mockRateLimits.ts)
let mockBillingAccessOverride = null;
function setMockBillingAccessOverride(value) {
    mockBillingAccessOverride = value;
}
function hasClaudeAiBillingAccess() {
    // Check for mock billing access first (for /mock-limits testing)
    if (mockBillingAccessOverride !== null) {
        return mockBillingAccessOverride;
    }
    if (!(0, auth_js_1.isClaudeAISubscriber)()) {
        return false;
    }
    const subscriptionType = (0, auth_js_1.getSubscriptionType)();
    // Consumer plans (Max/Pro) - individual users always have billing access
    if (subscriptionType === 'max' || subscriptionType === 'pro') {
        return true;
    }
    // Team/Enterprise - check for admin or billing roles
    const config = (0, config_js_1.getGlobalConfig)();
    const orgRole = config.oauthAccount?.organizationRole;
    return (!!orgRole &&
        ['admin', 'billing', 'owner', 'primary_owner'].includes(orgRole));
}
