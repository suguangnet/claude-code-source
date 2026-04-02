"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onOrgFastModeChanged = exports.onFastModeOverageRejection = exports.onCooldownExpired = exports.onCooldownTriggered = exports.FAST_MODE_MODEL_DISPLAY = void 0;
exports.isFastModeEnabled = isFastModeEnabled;
exports.isFastModeAvailable = isFastModeAvailable;
exports.getFastModeUnavailableReason = getFastModeUnavailableReason;
exports.getFastModeModel = getFastModeModel;
exports.getInitialFastModeSetting = getInitialFastModeSetting;
exports.isFastModeSupportedByModel = isFastModeSupportedByModel;
exports.getFastModeRuntimeState = getFastModeRuntimeState;
exports.triggerFastModeCooldown = triggerFastModeCooldown;
exports.clearFastModeCooldown = clearFastModeCooldown;
exports.handleFastModeRejectedByAPI = handleFastModeRejectedByAPI;
exports.handleFastModeOverageRejection = handleFastModeOverageRejection;
exports.isFastModeCooldown = isFastModeCooldown;
exports.getFastModeState = getFastModeState;
exports.resolveFastModeStatusFromCache = resolveFastModeStatusFromCache;
exports.prefetchFastModeStatus = prefetchFastModeStatus;
const axios_1 = __importDefault(require("axios"));
const oauth_js_1 = require("src/constants/oauth.js");
const growthbook_js_1 = require("src/services/analytics/growthbook.js");
const state_js_1 = require("../bootstrap/state.js");
const index_js_1 = require("../services/analytics/index.js");
const auth_js_1 = require("./auth.js");
const bundledMode_js_1 = require("./bundledMode.js");
const config_js_1 = require("./config.js");
const debug_js_1 = require("./debug.js");
const envUtils_js_1 = require("./envUtils.js");
const model_js_1 = require("./model/model.js");
const providers_js_1 = require("./model/providers.js");
const privacyLevel_js_1 = require("./privacyLevel.js");
const settings_js_1 = require("./settings/settings.js");
const signal_js_1 = require("./signal.js");
function isFastModeEnabled() {
    return !(0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_DISABLE_FAST_MODE);
}
function isFastModeAvailable() {
    if (!isFastModeEnabled()) {
        return false;
    }
    return getFastModeUnavailableReason() === null;
}
function getDisabledReasonMessage(disabledReason, authType) {
    switch (disabledReason) {
        case 'free':
            return authType === 'oauth'
                ? 'Fast mode requires a paid subscription'
                : 'Fast mode unavailable during evaluation. Please purchase credits.';
        case 'preference':
            return 'Fast mode has been disabled by your organization';
        case 'extra_usage_disabled':
            // Only OAuth users can have extra_usage_disabled; console users don't have this concept
            return 'Fast mode requires extra usage billing · /extra-usage to enable';
        case 'network_error':
            return 'Fast mode unavailable due to network connectivity issues';
        case 'unknown':
            return 'Fast mode is currently unavailable';
    }
}
function getFastModeUnavailableReason() {
    if (!isFastModeEnabled()) {
        return 'Fast mode is not available';
    }
    const statigReason = (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_penguins_off', null);
    // Statsig reason has priority over other reasons.
    if (statigReason !== null) {
        (0, debug_js_1.logForDebugging)(`Fast mode unavailable: ${statigReason}`);
        return statigReason;
    }
    // Previously, fast mode required the native binary (bun build). This is no
    // longer necessary, but we keep this option behind a flag just in case.
    if (!(0, bundledMode_js_1.isInBundledMode)() &&
        (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_marble_sandcastle', false)) {
        return 'Fast mode requires the native binary · Install from: https://claude.com/product/claude-code';
    }
    // Not available in the SDK unless explicitly opted in via --settings.
    // Assistant daemon mode is exempt — it's first-party orchestration, and
    // kairosActive is set before this check runs (main.tsx:~1626 vs ~3249).
    if ((0, state_js_1.getIsNonInteractiveSession)() &&
        (0, state_js_1.preferThirdPartyAuthentication)() &&
        !(0, state_js_1.getKairosActive)()) {
        const flagFastMode = (0, settings_js_1.getSettingsForSource)('flagSettings')?.fastMode;
        if (!flagFastMode) {
            const reason = 'Fast mode is not available in the Agent SDK';
            (0, debug_js_1.logForDebugging)(`Fast mode unavailable: ${reason}`);
            return reason;
        }
    }
    // Only available for 1P (not Bedrock/Vertex/Foundry)
    if ((0, providers_js_1.getAPIProvider)() !== 'firstParty') {
        const reason = 'Fast mode is not available on Bedrock, Vertex, or Foundry';
        (0, debug_js_1.logForDebugging)(`Fast mode unavailable: ${reason}`);
        return reason;
    }
    if (orgStatus.status === 'disabled') {
        if (orgStatus.reason === 'network_error' ||
            orgStatus.reason === 'unknown') {
            // The org check can fail behind corporate proxies that block the
            // endpoint. We add CLAUDE_CODE_SKIP_FAST_MODE_NETWORK_ERRORS=1 to
            // bypass this check in the CC binary. This is OK since we have
            // another check in the API to error out when disabled by org.
            if ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_SKIP_FAST_MODE_NETWORK_ERRORS)) {
                return null;
            }
        }
        const authType = (0, auth_js_1.getClaudeAIOAuthTokens)() !== null ? 'oauth' : 'api-key';
        const reason = getDisabledReasonMessage(orgStatus.reason, authType);
        (0, debug_js_1.logForDebugging)(`Fast mode unavailable: ${reason}`);
        return reason;
    }
    return null;
}
// @[MODEL LAUNCH]: Update supported Fast Mode models.
exports.FAST_MODE_MODEL_DISPLAY = 'Opus 4.6';
function getFastModeModel() {
    return 'opus' + ((0, model_js_1.isOpus1mMergeEnabled)() ? '[1m]' : '');
}
function getInitialFastModeSetting(model) {
    if (!isFastModeEnabled()) {
        return false;
    }
    if (!isFastModeAvailable()) {
        return false;
    }
    if (!isFastModeSupportedByModel(model)) {
        return false;
    }
    const settings = (0, settings_js_1.getInitialSettings)();
    // If per-session opt-in is required, fast mode starts off each session
    if (settings.fastModePerSessionOptIn) {
        return false;
    }
    return settings.fastMode === true;
}
function isFastModeSupportedByModel(modelSetting) {
    if (!isFastModeEnabled()) {
        return false;
    }
    const model = modelSetting ?? (0, model_js_1.getDefaultMainLoopModelSetting)();
    const parsedModel = (0, model_js_1.parseUserSpecifiedModel)(model);
    return parsedModel.toLowerCase().includes('opus-4-6');
}
let runtimeState = { status: 'active' };
let hasLoggedCooldownExpiry = false;
const cooldownTriggered = (0, signal_js_1.createSignal)();
const cooldownExpired = (0, signal_js_1.createSignal)();
exports.onCooldownTriggered = cooldownTriggered.subscribe;
exports.onCooldownExpired = cooldownExpired.subscribe;
function getFastModeRuntimeState() {
    if (runtimeState.status === 'cooldown' &&
        Date.now() >= runtimeState.resetAt) {
        if (isFastModeEnabled() && !hasLoggedCooldownExpiry) {
            (0, debug_js_1.logForDebugging)('Fast mode cooldown expired, re-enabling fast mode');
            hasLoggedCooldownExpiry = true;
            cooldownExpired.emit();
        }
        runtimeState = { status: 'active' };
    }
    return runtimeState;
}
function triggerFastModeCooldown(resetTimestamp, reason) {
    if (!isFastModeEnabled()) {
        return;
    }
    runtimeState = { status: 'cooldown', resetAt: resetTimestamp, reason };
    hasLoggedCooldownExpiry = false;
    const cooldownDurationMs = resetTimestamp - Date.now();
    (0, debug_js_1.logForDebugging)(`Fast mode cooldown triggered (${reason}), duration ${Math.round(cooldownDurationMs / 1000)}s`);
    (0, index_js_1.logEvent)('tengu_fast_mode_fallback_triggered', {
        cooldown_duration_ms: cooldownDurationMs,
        cooldown_reason: reason,
    });
    cooldownTriggered.emit(resetTimestamp, reason);
}
function clearFastModeCooldown() {
    runtimeState = { status: 'active' };
}
/**
 * Called when the API rejects a fast mode request (e.g., 400 "Fast mode is
 * not enabled for your organization"). Permanently disables fast mode using
 * the same flow as when the prefetch discovers the org has it disabled.
 */
function handleFastModeRejectedByAPI() {
    if (orgStatus.status === 'disabled') {
        return;
    }
    orgStatus = { status: 'disabled', reason: 'preference' };
    (0, settings_js_1.updateSettingsForSource)('userSettings', { fastMode: undefined });
    (0, config_js_1.saveGlobalConfig)(current => ({
        ...current,
        penguinModeOrgEnabled: false,
    }));
    orgFastModeChange.emit(false);
}
// --- Overage rejection listeners ---
// Fired when a 429 indicates fast mode was rejected because extra usage
// (overage billing) is not available. Distinct from org-level disabling.
const overageRejection = (0, signal_js_1.createSignal)();
exports.onFastModeOverageRejection = overageRejection.subscribe;
function getOverageDisabledMessage(reason) {
    switch (reason) {
        case 'out_of_credits':
            return 'Fast mode disabled · extra usage credits exhausted';
        case 'org_level_disabled':
        case 'org_service_level_disabled':
            return 'Fast mode disabled · extra usage disabled by your organization';
        case 'org_level_disabled_until':
            return 'Fast mode disabled · extra usage spending cap reached';
        case 'member_level_disabled':
            return 'Fast mode disabled · extra usage disabled for your account';
        case 'seat_tier_level_disabled':
        case 'seat_tier_zero_credit_limit':
        case 'member_zero_credit_limit':
            return 'Fast mode disabled · extra usage not available for your plan';
        case 'overage_not_provisioned':
        case 'no_limits_configured':
            return 'Fast mode requires extra usage billing · /extra-usage to enable';
        default:
            return 'Fast mode disabled · extra usage not available';
    }
}
function isOutOfCreditsReason(reason) {
    return reason === 'org_level_disabled_until' || reason === 'out_of_credits';
}
/**
 * Called when a 429 indicates fast mode was rejected because extra usage
 * is not available. Permanently disables fast mode (unless the user has
 * ran out of credits) and notifies with a reason-specific message.
 */
function handleFastModeOverageRejection(reason) {
    const message = getOverageDisabledMessage(reason);
    (0, debug_js_1.logForDebugging)(`Fast mode overage rejection: ${reason ?? 'unknown'} — ${message}`);
    (0, index_js_1.logEvent)('tengu_fast_mode_overage_rejected', {
        overage_disabled_reason: (reason ??
            'unknown'),
    });
    // Disable fast mode permanently unless the user has ran out of credits
    if (!isOutOfCreditsReason(reason)) {
        (0, settings_js_1.updateSettingsForSource)('userSettings', { fastMode: undefined });
        (0, config_js_1.saveGlobalConfig)(current => ({
            ...current,
            penguinModeOrgEnabled: false,
        }));
    }
    overageRejection.emit(message);
}
function isFastModeCooldown() {
    return getFastModeRuntimeState().status === 'cooldown';
}
function getFastModeState(model, fastModeUserEnabled) {
    const enabled = isFastModeEnabled() &&
        isFastModeAvailable() &&
        !!fastModeUserEnabled &&
        isFastModeSupportedByModel(model);
    if (enabled && isFastModeCooldown()) {
        return 'cooldown';
    }
    if (enabled) {
        return 'on';
    }
    return 'off';
}
let orgStatus = { status: 'pending' };
// Listeners notified when org-level fast mode status changes
const orgFastModeChange = (0, signal_js_1.createSignal)();
exports.onOrgFastModeChanged = orgFastModeChange.subscribe;
async function fetchFastModeStatus(auth) {
    const endpoint = `${(0, oauth_js_1.getOauthConfig)().BASE_API_URL}/api/claude_code_penguin_mode`;
    const headers = 'accessToken' in auth
        ? {
            Authorization: `Bearer ${auth.accessToken}`,
            'anthropic-beta': oauth_js_1.OAUTH_BETA_HEADER,
        }
        : { 'x-api-key': auth.apiKey };
    const response = await axios_1.default.get(endpoint, { headers });
    return response.data;
}
const PREFETCH_MIN_INTERVAL_MS = 30000;
let lastPrefetchAt = 0;
let inflightPrefetch = null;
/**
 * Resolve orgStatus from the persisted cache without making any API calls.
 * Used when startup prefetches are throttled to avoid hitting the network
 * while still making fast mode availability checks work.
 */
function resolveFastModeStatusFromCache() {
    if (!isFastModeEnabled()) {
        return;
    }
    if (orgStatus.status !== 'pending') {
        return;
    }
    const isAnt = process.env.USER_TYPE === 'ant';
    const cachedEnabled = (0, config_js_1.getGlobalConfig)().penguinModeOrgEnabled === true;
    orgStatus =
        isAnt || cachedEnabled
            ? { status: 'enabled' }
            : { status: 'disabled', reason: 'unknown' };
}
async function prefetchFastModeStatus() {
    // Skip network requests if nonessential traffic is disabled
    if ((0, privacyLevel_js_1.isEssentialTrafficOnly)()) {
        return;
    }
    if (!isFastModeEnabled()) {
        return;
    }
    if (inflightPrefetch) {
        (0, debug_js_1.logForDebugging)('Fast mode prefetch in progress, returning in-flight promise');
        return inflightPrefetch;
    }
    // Service key OAuth sessions lack user:profile scope → endpoint 403s.
    // Resolve orgStatus from cache and bail before burning the throttle window.
    // API key auth is unaffected.
    const apiKey = (0, auth_js_1.getAnthropicApiKey)();
    const hasUsableOAuth = (0, auth_js_1.getClaudeAIOAuthTokens)()?.accessToken && (0, auth_js_1.hasProfileScope)();
    if (!hasUsableOAuth && !apiKey) {
        const isAnt = process.env.USER_TYPE === 'ant';
        const cachedEnabled = (0, config_js_1.getGlobalConfig)().penguinModeOrgEnabled === true;
        orgStatus =
            isAnt || cachedEnabled
                ? { status: 'enabled' }
                : { status: 'disabled', reason: 'preference' };
        return;
    }
    const now = Date.now();
    if (now - lastPrefetchAt < PREFETCH_MIN_INTERVAL_MS) {
        (0, debug_js_1.logForDebugging)('Skipping fast mode prefetch, fetched recently');
        return;
    }
    lastPrefetchAt = now;
    const fetchWithCurrentAuth = async () => {
        const currentTokens = (0, auth_js_1.getClaudeAIOAuthTokens)();
        const auth = currentTokens?.accessToken && (0, auth_js_1.hasProfileScope)()
            ? { accessToken: currentTokens.accessToken }
            : apiKey
                ? { apiKey }
                : null;
        if (!auth) {
            throw new Error('No auth available');
        }
        return fetchFastModeStatus(auth);
    };
    async function doFetch() {
        try {
            let status;
            try {
                status = await fetchWithCurrentAuth();
            }
            catch (err) {
                const isAuthError = axios_1.default.isAxiosError(err) &&
                    (err.response?.status === 401 ||
                        (err.response?.status === 403 &&
                            typeof err.response?.data === 'string' &&
                            err.response.data.includes('OAuth token has been revoked')));
                if (isAuthError) {
                    const failedAccessToken = (0, auth_js_1.getClaudeAIOAuthTokens)()?.accessToken;
                    if (failedAccessToken) {
                        await (0, auth_js_1.handleOAuth401Error)(failedAccessToken);
                        status = await fetchWithCurrentAuth();
                    }
                    else {
                        throw err;
                    }
                }
                else {
                    throw err;
                }
            }
            const previousEnabled = orgStatus.status !== 'pending'
                ? orgStatus.status === 'enabled'
                : (0, config_js_1.getGlobalConfig)().penguinModeOrgEnabled;
            orgStatus = status.enabled
                ? { status: 'enabled' }
                : {
                    status: 'disabled',
                    reason: status.disabled_reason ?? 'preference',
                };
            if (previousEnabled !== status.enabled) {
                // When org disables fast mode, permanently turn off the user's fast mode setting
                if (!status.enabled) {
                    (0, settings_js_1.updateSettingsForSource)('userSettings', { fastMode: undefined });
                }
                (0, config_js_1.saveGlobalConfig)(current => ({
                    ...current,
                    penguinModeOrgEnabled: status.enabled,
                }));
                orgFastModeChange.emit(status.enabled);
            }
            (0, debug_js_1.logForDebugging)(`Org fast mode: ${status.enabled ? 'enabled' : `disabled (${status.disabled_reason ?? 'preference'})`}`);
        }
        catch (err) {
            // On failure: ants default to enabled (don't block internal users).
            // External users: fall back to the cached penguinModeOrgEnabled value;
            // if no positive cache, disable with network_error reason.
            const isAnt = process.env.USER_TYPE === 'ant';
            const cachedEnabled = (0, config_js_1.getGlobalConfig)().penguinModeOrgEnabled === true;
            orgStatus =
                isAnt || cachedEnabled
                    ? { status: 'enabled' }
                    : { status: 'disabled', reason: 'network_error' };
            (0, debug_js_1.logForDebugging)(`Failed to fetch org fast mode status, defaulting to ${orgStatus.status === 'enabled' ? 'enabled (cached)' : 'disabled (network_error)'}: ${err}`, { level: 'error' });
            (0, index_js_1.logEvent)('tengu_org_penguin_mode_fetch_failed', {});
        }
        finally {
            inflightPrefetch = null;
        }
    }
    inflightPrefetch = doFetch();
    return inflightPrefetch;
}
