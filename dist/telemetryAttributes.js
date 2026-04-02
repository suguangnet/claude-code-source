"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTelemetryAttributes = getTelemetryAttributes;
const state_js_1 = require("src/bootstrap/state.js");
const auth_js_1 = require("./auth.js");
const config_js_1 = require("./config.js");
const envDynamic_js_1 = require("./envDynamic.js");
const envUtils_js_1 = require("./envUtils.js");
const taggedId_js_1 = require("./taggedId.js");
// Default configuration for metrics cardinality
const METRICS_CARDINALITY_DEFAULTS = {
    OTEL_METRICS_INCLUDE_SESSION_ID: true,
    OTEL_METRICS_INCLUDE_VERSION: false,
    OTEL_METRICS_INCLUDE_ACCOUNT_UUID: true,
};
function shouldIncludeAttribute(envVar) {
    const defaultValue = METRICS_CARDINALITY_DEFAULTS[envVar];
    const envValue = process.env[envVar];
    if (envValue === undefined) {
        return defaultValue;
    }
    return (0, envUtils_js_1.isEnvTruthy)(envValue);
}
function getTelemetryAttributes() {
    const userId = (0, config_js_1.getOrCreateUserID)();
    const sessionId = (0, state_js_1.getSessionId)();
    const attributes = {
        'user.id': userId,
    };
    if (shouldIncludeAttribute('OTEL_METRICS_INCLUDE_SESSION_ID')) {
        attributes['session.id'] = sessionId;
    }
    if (shouldIncludeAttribute('OTEL_METRICS_INCLUDE_VERSION')) {
        attributes['app.version'] = MACRO.VERSION;
    }
    // Only include OAuth account data when actively using OAuth authentication
    const oauthAccount = (0, auth_js_1.getOauthAccountInfo)();
    if (oauthAccount) {
        const orgId = oauthAccount.organizationUuid;
        const email = oauthAccount.emailAddress;
        const accountUuid = oauthAccount.accountUuid;
        if (orgId)
            attributes['organization.id'] = orgId;
        if (email)
            attributes['user.email'] = email;
        if (accountUuid &&
            shouldIncludeAttribute('OTEL_METRICS_INCLUDE_ACCOUNT_UUID')) {
            attributes['user.account_uuid'] = accountUuid;
            attributes['user.account_id'] =
                process.env.CLAUDE_CODE_ACCOUNT_TAGGED_ID ||
                    (0, taggedId_js_1.toTaggedId)('user', accountUuid);
        }
    }
    // Add terminal type if available
    if (envDynamic_js_1.envDynamic.terminal) {
        attributes['terminal.type'] = envDynamic_js_1.envDynamic.terminal;
    }
    return attributes;
}
