"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeGrowthBook = void 0;
exports.onGrowthBookRefresh = onGrowthBookRefresh;
exports.hasGrowthBookEnvOverride = hasGrowthBookEnvOverride;
exports.getAllGrowthBookFeatures = getAllGrowthBookFeatures;
exports.getGrowthBookConfigOverrides = getGrowthBookConfigOverrides;
exports.setGrowthBookConfigOverride = setGrowthBookConfigOverride;
exports.clearGrowthBookConfigOverrides = clearGrowthBookConfigOverrides;
exports.getApiBaseUrlHost = getApiBaseUrlHost;
exports.getFeatureValue_DEPRECATED = getFeatureValue_DEPRECATED;
exports.getFeatureValue_CACHED_MAY_BE_STALE = getFeatureValue_CACHED_MAY_BE_STALE;
exports.getFeatureValue_CACHED_WITH_REFRESH = getFeatureValue_CACHED_WITH_REFRESH;
exports.checkStatsigFeatureGate_CACHED_MAY_BE_STALE = checkStatsigFeatureGate_CACHED_MAY_BE_STALE;
exports.checkSecurityRestrictionGate = checkSecurityRestrictionGate;
exports.checkGate_CACHED_OR_BLOCKING = checkGate_CACHED_OR_BLOCKING;
exports.refreshGrowthBookAfterAuthChange = refreshGrowthBookAfterAuthChange;
exports.resetGrowthBook = resetGrowthBook;
exports.refreshGrowthBookFeatures = refreshGrowthBookFeatures;
exports.setupPeriodicGrowthBookRefresh = setupPeriodicGrowthBookRefresh;
exports.stopPeriodicGrowthBookRefresh = stopPeriodicGrowthBookRefresh;
exports.getDynamicConfig_BLOCKS_ON_INIT = getDynamicConfig_BLOCKS_ON_INIT;
exports.getDynamicConfig_CACHED_MAY_BE_STALE = getDynamicConfig_CACHED_MAY_BE_STALE;
const growthbook_1 = require("@growthbook/growthbook");
const lodash_es_1 = require("lodash-es");
const state_js_1 = require("../../bootstrap/state.js");
const keys_js_1 = require("../../constants/keys.js");
const config_js_1 = require("../../utils/config.js");
const debug_js_1 = require("../../utils/debug.js");
const errors_js_1 = require("../../utils/errors.js");
const http_js_1 = require("../../utils/http.js");
const log_js_1 = require("../../utils/log.js");
const signal_js_1 = require("../../utils/signal.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const user_js_1 = require("../../utils/user.js");
const firstPartyEventLogger_js_1 = require("./firstPartyEventLogger.js");
let client = null;
// Named handler refs so resetGrowthBook can remove them to prevent accumulation
let currentBeforeExitHandler = null;
let currentExitHandler = null;
// Track whether auth was available when the client was created
// This allows us to detect when we need to recreate with fresh auth headers
let clientCreatedWithAuth = false;
const experimentDataByFeature = new Map();
// Cache for remote eval feature values - workaround for SDK not respecting remoteEval response
// The SDK's setForcedFeatures also doesn't work reliably with remoteEval
const remoteEvalFeatureValues = new Map();
// Track features accessed before init that need exposure logging
const pendingExposures = new Set();
// Track features that have already had their exposure logged this session (dedup)
// This prevents firing duplicate exposure events when getFeatureValue_CACHED_MAY_BE_STALE
// is called repeatedly in hot paths (e.g., isAutoMemoryEnabled in render loops)
const loggedExposures = new Set();
// Track re-initialization promise for security gate checks
// When GrowthBook is re-initializing (e.g., after auth change), security gate checks
// should wait for init to complete to avoid returning stale values
let reinitializingPromise = null;
const refreshed = (0, signal_js_1.createSignal)();
/** Call a listener with sync-throw and async-rejection both routed to logError. */
function callSafe(listener) {
    try {
        // Promise.resolve() normalizes sync returns and Promises so both
        // sync throws (caught by outer try) and async rejections (caught
        // by .catch) hit logError. Without the .catch, an async listener
        // that rejects becomes an unhandled rejection — the try/catch
        // only sees the Promise, not its eventual rejection.
        void Promise.resolve(listener()).catch(e => {
            (0, log_js_1.logError)(e);
        });
    }
    catch (e) {
        (0, log_js_1.logError)(e);
    }
}
/**
 * Register a callback to fire when GrowthBook feature values refresh.
 * Returns an unsubscribe function.
 *
 * If init has already completed with features by the time this is called
 * (remoteEvalFeatureValues is populated), the listener fires once on the
 * next microtask. This catch-up handles the race where GB's network response
 * lands before the REPL's useEffect commits — on external builds with fast
 * networks and MCP-heavy configs, init can finish in ~100ms while REPL mount
 * takes ~600ms (see #20951 external-build trace at 30.540 vs 31.046).
 *
 * Change detection is on the subscriber: the callback fires on every refresh;
 * use isEqual against your last-seen config to decide whether to act.
 */
function onGrowthBookRefresh(listener) {
    let subscribed = true;
    const unsubscribe = refreshed.subscribe(() => callSafe(listener));
    if (remoteEvalFeatureValues.size > 0) {
        queueMicrotask(() => {
            // Re-check: listener may have been removed, or resetGrowthBook may have
            // cleared the Map, between registration and this microtask running.
            if (subscribed && remoteEvalFeatureValues.size > 0) {
                callSafe(listener);
            }
        });
    }
    return () => {
        subscribed = false;
        unsubscribe();
    };
}
/**
 * Parse env var overrides for GrowthBook features.
 * Set CLAUDE_INTERNAL_FC_OVERRIDES to a JSON object mapping feature keys to values
 * to bypass remote eval and disk cache. Useful for eval harnesses that need to
 * test specific feature flag configurations. Only active when USER_TYPE is 'ant'.
 *
 * Example: CLAUDE_INTERNAL_FC_OVERRIDES='{"my_feature": true, "my_config": {"key": "val"}}'
 */
let envOverrides = null;
let envOverridesParsed = false;
function getEnvOverrides() {
    if (!envOverridesParsed) {
        envOverridesParsed = true;
        if (process.env.USER_TYPE === 'ant') {
            const raw = process.env.CLAUDE_INTERNAL_FC_OVERRIDES;
            if (raw) {
                try {
                    envOverrides = JSON.parse(raw);
                    (0, debug_js_1.logForDebugging)(`GrowthBook: Using env var overrides for ${Object.keys(envOverrides).length} features: ${Object.keys(envOverrides).join(', ')}`);
                }
                catch {
                    (0, log_js_1.logError)(new Error(`GrowthBook: Failed to parse CLAUDE_INTERNAL_FC_OVERRIDES: ${raw}`));
                }
            }
        }
    }
    return envOverrides;
}
/**
 * Check if a feature has an env-var override (CLAUDE_INTERNAL_FC_OVERRIDES).
 * When true, _CACHED_MAY_BE_STALE will return the override without touching
 * disk or network — callers can skip awaiting init for that feature.
 */
function hasGrowthBookEnvOverride(feature) {
    const overrides = getEnvOverrides();
    return overrides !== null && feature in overrides;
}
/**
 * Local config overrides set via /config Gates tab (ant-only). Checked after
 * env-var overrides — env wins so eval harnesses remain deterministic. Unlike
 * getEnvOverrides this is not memoized: the user can change overrides at
 * runtime, and getGlobalConfig() is already memory-cached (pointer-chase)
 * until the next saveGlobalConfig() invalidates it.
 */
function getConfigOverrides() {
    if (process.env.USER_TYPE !== 'ant')
        return undefined;
    try {
        return (0, config_js_1.getGlobalConfig)().growthBookOverrides;
    }
    catch {
        // getGlobalConfig() throws before configReadingAllowed is set (early
        // main.tsx startup path). Same degrade as the disk-cache fallback below.
        return undefined;
    }
}
/**
 * Enumerate all known GrowthBook features and their current resolved values
 * (not including overrides). In-memory payload first, disk cache fallback —
 * same priority as the getters. Used by the /config Gates tab.
 */
function getAllGrowthBookFeatures() {
    if (remoteEvalFeatureValues.size > 0) {
        return Object.fromEntries(remoteEvalFeatureValues);
    }
    return (0, config_js_1.getGlobalConfig)().cachedGrowthBookFeatures ?? {};
}
function getGrowthBookConfigOverrides() {
    return getConfigOverrides() ?? {};
}
/**
 * Set or clear a single config override. Pass undefined to clear.
 * Fires onGrowthBookRefresh listeners so systems that bake gate values into
 * long-lived objects (useMainLoopModel, useSkillsChange, etc.) rebuild —
 * otherwise overriding e.g. tengu_ant_model_override wouldn't actually
 * change the model until the next periodic refresh.
 */
function setGrowthBookConfigOverride(feature, value) {
    if (process.env.USER_TYPE !== 'ant')
        return;
    try {
        (0, config_js_1.saveGlobalConfig)(c => {
            const current = c.growthBookOverrides ?? {};
            if (value === undefined) {
                if (!(feature in current))
                    return c;
                const { [feature]: _, ...rest } = current;
                if (Object.keys(rest).length === 0) {
                    const { growthBookOverrides: __, ...configWithout } = c;
                    return configWithout;
                }
                return { ...c, growthBookOverrides: rest };
            }
            if ((0, lodash_es_1.isEqual)(current[feature], value))
                return c;
            return { ...c, growthBookOverrides: { ...current, [feature]: value } };
        });
        // Subscribers do their own change detection (see onGrowthBookRefresh docs),
        // so firing on a no-op write is fine.
        refreshed.emit();
    }
    catch (e) {
        (0, log_js_1.logError)(e);
    }
}
function clearGrowthBookConfigOverrides() {
    if (process.env.USER_TYPE !== 'ant')
        return;
    try {
        (0, config_js_1.saveGlobalConfig)(c => {
            if (!c.growthBookOverrides ||
                Object.keys(c.growthBookOverrides).length === 0) {
                return c;
            }
            const { growthBookOverrides: _, ...rest } = c;
            return rest;
        });
        refreshed.emit();
    }
    catch (e) {
        (0, log_js_1.logError)(e);
    }
}
/**
 * Log experiment exposure for a feature if it has experiment data.
 * Deduplicates within a session - each feature is logged at most once.
 */
function logExposureForFeature(feature) {
    // Skip if already logged this session (dedup)
    if (loggedExposures.has(feature)) {
        return;
    }
    const expData = experimentDataByFeature.get(feature);
    if (expData) {
        loggedExposures.add(feature);
        (0, firstPartyEventLogger_js_1.logGrowthBookExperimentTo1P)({
            experimentId: expData.experimentId,
            variationId: expData.variationId,
            userAttributes: getUserAttributes(),
            experimentMetadata: {
                feature_id: feature,
            },
        });
    }
}
/**
 * Process a remote eval payload from the GrowthBook server and populate
 * local caches. Called after both initial client.init() and after
 * client.refreshFeatures() so that _BLOCKS_ON_INIT callers see fresh values
 * across the process lifetime, not just init-time snapshots.
 *
 * Without this running on refresh, remoteEvalFeatureValues freezes at its
 * init-time snapshot and getDynamicConfig_BLOCKS_ON_INIT returns stale values
 * for the entire process lifetime — which broke the tengu_max_version_config
 * kill switch for long-running sessions.
 */
async function processRemoteEvalPayload(gbClient) {
    // WORKAROUND: Transform remote eval response format
    // The API returns { "value": ... } but SDK expects { "defaultValue": ... }
    // TODO: Remove this once the API is fixed to return correct format
    const payload = gbClient.getPayload();
    // Empty object is truthy — without the length check, `{features: {}}`
    // (transient server bug, truncated response) would pass, clear the maps
    // below, return true, and syncRemoteEvalToDisk would wholesale-write `{}`
    // to disk: total flag blackout for every process sharing ~/.claude.json.
    if (!payload?.features || Object.keys(payload.features).length === 0) {
        return false;
    }
    // Clear before rebuild so features removed between refreshes don't
    // leave stale ghost entries that short-circuit getFeatureValueInternal.
    experimentDataByFeature.clear();
    const transformedFeatures = {};
    for (const [key, feature] of Object.entries(payload.features)) {
        const f = feature;
        if ('value' in f && !('defaultValue' in f)) {
            transformedFeatures[key] = {
                ...f,
                defaultValue: f.value,
            };
        }
        else {
            transformedFeatures[key] = f;
        }
        // Store experiment data for later logging when feature is accessed
        if (f.source === 'experiment' && f.experimentResult) {
            const expResult = f.experimentResult;
            const exp = f.experiment;
            if (exp?.key && expResult.variationId !== undefined) {
                experimentDataByFeature.set(key, {
                    experimentId: exp.key,
                    variationId: expResult.variationId,
                });
            }
        }
    }
    // Re-set the payload with transformed features
    await gbClient.setPayload({
        ...payload,
        features: transformedFeatures,
    });
    // WORKAROUND: Cache the evaluated values directly from remote eval response.
    // The SDK's evalFeature() tries to re-evaluate rules locally, ignoring the
    // pre-evaluated 'value' from remoteEval. setForcedFeatures also doesn't work
    // reliably. So we cache values ourselves and use them in getFeatureValueInternal.
    remoteEvalFeatureValues.clear();
    for (const [key, feature] of Object.entries(transformedFeatures)) {
        // Under remoteEval:true the server pre-evaluates. Whether the answer
        // lands in `value` (current API) or `defaultValue` (post-TODO API shape),
        // it's the authoritative value for this user. Guarding on both keeps
        // syncRemoteEvalToDisk correct across a partial or full API migration.
        const v = 'value' in feature ? feature.value : feature.defaultValue;
        if (v !== undefined) {
            remoteEvalFeatureValues.set(key, v);
        }
    }
    return true;
}
/**
 * Write the complete remoteEvalFeatureValues map to disk. Called exactly
 * once per successful processRemoteEvalPayload — never from a failure path,
 * so init-timeout poisoning is structurally impossible (the .catch() at init
 * never reaches here).
 *
 * Wholesale replace (not merge): features deleted server-side are dropped
 * from disk on the next successful payload. Ant builds ⊇ external, so
 * switching builds is safe — the write is always a complete answer for this
 * process's SDK key.
 */
function syncRemoteEvalToDisk() {
    const fresh = Object.fromEntries(remoteEvalFeatureValues);
    const config = (0, config_js_1.getGlobalConfig)();
    if ((0, lodash_es_1.isEqual)(config.cachedGrowthBookFeatures, fresh)) {
        return;
    }
    (0, config_js_1.saveGlobalConfig)(current => ({
        ...current,
        cachedGrowthBookFeatures: fresh,
    }));
}
/**
 * Check if GrowthBook operations should be enabled
 */
function isGrowthBookEnabled() {
    // GrowthBook depends on 1P event logging.
    return (0, firstPartyEventLogger_js_1.is1PEventLoggingEnabled)();
}
/**
 * Hostname of ANTHROPIC_BASE_URL when it points at a non-Anthropic proxy.
 *
 * Enterprise-proxy deployments (Epic, Marble, etc.) typically use
 * apiKeyHelper auth, which means isAnthropicAuthEnabled() returns false and
 * organizationUUID/accountUUID/email are all absent from GrowthBook
 * attributes. Without this, there's no stable attribute to target them on
 * — only per-device IDs. See src/utils/auth.ts isAnthropicAuthEnabled().
 *
 * Returns undefined for unset/default (api.anthropic.com) so the attribute
 * is absent for direct-API users. Hostname only — no path/query/creds.
 */
function getApiBaseUrlHost() {
    const baseUrl = process.env.ANTHROPIC_BASE_URL;
    if (!baseUrl)
        return undefined;
    try {
        const host = new URL(baseUrl).host;
        if (host === 'api.anthropic.com')
            return undefined;
        return host;
    }
    catch {
        return undefined;
    }
}
/**
 * Get user attributes for GrowthBook from CoreUserData
 */
function getUserAttributes() {
    const user = (0, user_js_1.getUserForGrowthBook)();
    // For ants, always try to include email from OAuth config even if ANTHROPIC_API_KEY is set.
    // This ensures GrowthBook targeting by email works regardless of auth method.
    let email = user.email;
    if (!email && process.env.USER_TYPE === 'ant') {
        email = (0, config_js_1.getGlobalConfig)().oauthAccount?.emailAddress;
    }
    const apiBaseUrlHost = getApiBaseUrlHost();
    const attributes = {
        id: user.deviceId,
        sessionId: user.sessionId,
        deviceID: user.deviceId,
        platform: user.platform,
        ...(apiBaseUrlHost && { apiBaseUrlHost }),
        ...(user.organizationUuid && { organizationUUID: user.organizationUuid }),
        ...(user.accountUuid && { accountUUID: user.accountUuid }),
        ...(user.userType && { userType: user.userType }),
        ...(user.subscriptionType && { subscriptionType: user.subscriptionType }),
        ...(user.rateLimitTier && { rateLimitTier: user.rateLimitTier }),
        ...(user.firstTokenTime && { firstTokenTime: user.firstTokenTime }),
        ...(email && { email }),
        ...(user.appVersion && { appVersion: user.appVersion }),
        ...(user.githubActionsMetadata && {
            githubActionsMetadata: user.githubActionsMetadata,
        }),
    };
    return attributes;
}
/**
 * Get or create the GrowthBook client instance
 */
const getGrowthBookClient = (0, lodash_es_1.memoize)(() => {
    if (!isGrowthBookEnabled()) {
        return null;
    }
    const attributes = getUserAttributes();
    const clientKey = (0, keys_js_1.getGrowthBookClientKey)();
    if (process.env.USER_TYPE === 'ant') {
        (0, debug_js_1.logForDebugging)(`GrowthBook: Creating client with clientKey=${clientKey}, attributes: ${(0, slowOperations_js_1.jsonStringify)(attributes)}`);
    }
    const baseUrl = process.env.USER_TYPE === 'ant'
        ? process.env.CLAUDE_CODE_GB_BASE_URL || 'https://api.anthropic.com/'
        : 'https://api.anthropic.com/';
    // Skip auth if trust hasn't been established yet
    // This prevents executing apiKeyHelper commands before the trust dialog
    // Non-interactive sessions implicitly have workspace trust
    // getSessionTrustAccepted() covers the case where the TrustDialog auto-resolved
    // without persisting trust for the specific CWD (e.g., home directory) —
    // showSetupScreens() sets this after the trust dialog flow completes.
    const hasTrust = (0, config_js_1.checkHasTrustDialogAccepted)() ||
        (0, state_js_1.getSessionTrustAccepted)() ||
        (0, state_js_1.getIsNonInteractiveSession)();
    const authHeaders = hasTrust
        ? (0, http_js_1.getAuthHeaders)()
        : { headers: {}, error: 'trust not established' };
    const hasAuth = !authHeaders.error;
    clientCreatedWithAuth = hasAuth;
    // Capture in local variable so the init callback operates on THIS client,
    // not a later client if reinitialization happens before init completes
    const thisClient = new growthbook_1.GrowthBook({
        apiHost: baseUrl,
        clientKey,
        attributes,
        remoteEval: true,
        // Re-fetch when user ID or org changes (org change = login to different org)
        cacheKeyAttributes: ['id', 'organizationUUID'],
        // Add auth headers if available
        ...(authHeaders.error
            ? {}
            : { apiHostRequestHeaders: authHeaders.headers }),
        // Debug logging for Ants
        ...(process.env.USER_TYPE === 'ant'
            ? {
                log: (msg, ctx) => {
                    (0, debug_js_1.logForDebugging)(`GrowthBook: ${msg} ${(0, slowOperations_js_1.jsonStringify)(ctx)}`);
                },
            }
            : {}),
    });
    client = thisClient;
    if (!hasAuth) {
        // No auth available yet — skip HTTP init, rely on disk-cached values.
        // initializeGrowthBook() will reset and re-create with auth when available.
        return { client: thisClient, initialized: Promise.resolve() };
    }
    const initialized = thisClient
        .init({ timeout: 5000 })
        .then(async (result) => {
        // Guard: if this client was replaced by a newer one, skip processing
        if (client !== thisClient) {
            if (process.env.USER_TYPE === 'ant') {
                (0, debug_js_1.logForDebugging)('GrowthBook: Skipping init callback for replaced client');
            }
            return;
        }
        if (process.env.USER_TYPE === 'ant') {
            (0, debug_js_1.logForDebugging)(`GrowthBook initialized successfully, source: ${result.source}, success: ${result.success}`);
        }
        const hadFeatures = await processRemoteEvalPayload(thisClient);
        // Re-check: processRemoteEvalPayload yields at `await setPayload`.
        // Microtask-only today (no encryption, no sticky-bucket service), but
        // the guard at the top of this callback runs before that await;
        // this runs after.
        if (client !== thisClient)
            return;
        if (hadFeatures) {
            for (const feature of pendingExposures) {
                logExposureForFeature(feature);
            }
            pendingExposures.clear();
            syncRemoteEvalToDisk();
            // Notify subscribers: remoteEvalFeatureValues is populated and
            // disk is freshly synced. _CACHED_MAY_BE_STALE reads memory first
            // (#22295), so subscribers see fresh values immediately.
            refreshed.emit();
        }
        // Log what features were loaded
        if (process.env.USER_TYPE === 'ant') {
            const features = thisClient.getFeatures();
            if (features) {
                const featureKeys = Object.keys(features);
                (0, debug_js_1.logForDebugging)(`GrowthBook loaded ${featureKeys.length} features: ${featureKeys.slice(0, 10).join(', ')}${featureKeys.length > 10 ? '...' : ''}`);
            }
        }
    })
        .catch(error => {
        if (process.env.USER_TYPE === 'ant') {
            (0, log_js_1.logError)((0, errors_js_1.toError)(error));
        }
    });
    // Register cleanup handlers for graceful shutdown (named refs so resetGrowthBook can remove them)
    currentBeforeExitHandler = () => client?.destroy();
    currentExitHandler = () => client?.destroy();
    process.on('beforeExit', currentBeforeExitHandler);
    process.on('exit', currentExitHandler);
    return { client: thisClient, initialized };
});
/**
 * Initialize GrowthBook client (blocks until ready)
 */
exports.initializeGrowthBook = (0, lodash_es_1.memoize)(async () => {
    let clientWrapper = getGrowthBookClient();
    if (!clientWrapper) {
        return null;
    }
    // Check if auth has become available since the client was created
    // If so, we need to recreate the client with fresh auth headers
    // Only check if trust is established to avoid triggering apiKeyHelper before trust dialog
    if (!clientCreatedWithAuth) {
        const hasTrust = (0, config_js_1.checkHasTrustDialogAccepted)() ||
            (0, state_js_1.getSessionTrustAccepted)() ||
            (0, state_js_1.getIsNonInteractiveSession)();
        if (hasTrust) {
            const currentAuth = (0, http_js_1.getAuthHeaders)();
            if (!currentAuth.error) {
                if (process.env.USER_TYPE === 'ant') {
                    (0, debug_js_1.logForDebugging)('GrowthBook: Auth became available after client creation, reinitializing');
                }
                // Use resetGrowthBook to properly destroy old client and stop periodic refresh
                // This prevents double-init where old client's init promise continues running
                resetGrowthBook();
                clientWrapper = getGrowthBookClient();
                if (!clientWrapper) {
                    return null;
                }
            }
        }
    }
    await clientWrapper.initialized;
    // Set up periodic refresh after successful initialization
    // This is called here (not separately) so it's always re-established after any reinit
    setupPeriodicGrowthBookRefresh();
    return clientWrapper.client;
});
/**
 * Get a feature value with a default fallback - blocks until initialized.
 * @internal Used by both deprecated and cached functions.
 */
async function getFeatureValueInternal(feature, defaultValue, logExposure) {
    // Check env var overrides first (for eval harnesses)
    const overrides = getEnvOverrides();
    if (overrides && feature in overrides) {
        return overrides[feature];
    }
    const configOverrides = getConfigOverrides();
    if (configOverrides && feature in configOverrides) {
        return configOverrides[feature];
    }
    if (!isGrowthBookEnabled()) {
        return defaultValue;
    }
    const growthBookClient = await (0, exports.initializeGrowthBook)();
    if (!growthBookClient) {
        return defaultValue;
    }
    // Use cached remote eval values if available (workaround for SDK bug)
    let result;
    if (remoteEvalFeatureValues.has(feature)) {
        result = remoteEvalFeatureValues.get(feature);
    }
    else {
        result = growthBookClient.getFeatureValue(feature, defaultValue);
    }
    // Log experiment exposure using stored experiment data
    if (logExposure) {
        logExposureForFeature(feature);
    }
    if (process.env.USER_TYPE === 'ant') {
        (0, debug_js_1.logForDebugging)(`GrowthBook: getFeatureValue("${feature}") = ${(0, slowOperations_js_1.jsonStringify)(result)}`);
    }
    return result;
}
/**
 * @deprecated Use getFeatureValue_CACHED_MAY_BE_STALE instead, which is non-blocking.
 * This function blocks on GrowthBook initialization which can slow down startup.
 */
async function getFeatureValue_DEPRECATED(feature, defaultValue) {
    return getFeatureValueInternal(feature, defaultValue, true);
}
/**
 * Get a feature value from disk cache immediately. Pure read — disk is
 * populated by syncRemoteEvalToDisk on every successful payload (init +
 * periodic refresh), not by this function.
 *
 * This is the preferred method for startup-critical paths and sync contexts.
 * The value may be stale if the cache was written by a previous process.
 */
function getFeatureValue_CACHED_MAY_BE_STALE(feature, defaultValue) {
    // Check env var overrides first (for eval harnesses)
    const overrides = getEnvOverrides();
    if (overrides && feature in overrides) {
        return overrides[feature];
    }
    const configOverrides = getConfigOverrides();
    if (configOverrides && feature in configOverrides) {
        return configOverrides[feature];
    }
    if (!isGrowthBookEnabled()) {
        return defaultValue;
    }
    // Log experiment exposure if data is available, otherwise defer until after init
    if (experimentDataByFeature.has(feature)) {
        logExposureForFeature(feature);
    }
    else {
        pendingExposures.add(feature);
    }
    // In-memory payload is authoritative once processRemoteEvalPayload has run.
    // Disk is also fresh by then (syncRemoteEvalToDisk runs synchronously inside
    // init), so this is correctness-equivalent to the disk read below — but it
    // skips the config JSON parse and is what onGrowthBookRefresh subscribers
    // depend on to read fresh values the instant they're notified.
    if (remoteEvalFeatureValues.has(feature)) {
        return remoteEvalFeatureValues.get(feature);
    }
    // Fall back to disk cache (survives across process restarts)
    try {
        const cached = (0, config_js_1.getGlobalConfig)().cachedGrowthBookFeatures?.[feature];
        return cached !== undefined ? cached : defaultValue;
    }
    catch {
        return defaultValue;
    }
}
/**
 * @deprecated Disk cache is now synced on every successful payload load
 * (init + 20min/6h periodic refresh). The per-feature TTL never fetched
 * fresh data from the server — it only re-wrote in-memory state to disk,
 * which is now redundant. Use getFeatureValue_CACHED_MAY_BE_STALE directly.
 */
function getFeatureValue_CACHED_WITH_REFRESH(feature, defaultValue, _refreshIntervalMs) {
    return getFeatureValue_CACHED_MAY_BE_STALE(feature, defaultValue);
}
/**
 * Check a Statsig feature gate value via GrowthBook, with fallback to Statsig cache.
 *
 * **MIGRATION ONLY**: This function is for migrating existing Statsig gates to GrowthBook.
 * For new features, use `getFeatureValue_CACHED_MAY_BE_STALE()` instead.
 *
 * - Checks GrowthBook disk cache first
 * - Falls back to Statsig's cachedStatsigGates during migration
 * - The value may be stale if the cache hasn't been updated recently
 *
 * @deprecated Use getFeatureValue_CACHED_MAY_BE_STALE() for new code. This function
 * exists only to support migration of existing Statsig gates.
 */
function checkStatsigFeatureGate_CACHED_MAY_BE_STALE(gate) {
    // Check env var overrides first (for eval harnesses)
    const overrides = getEnvOverrides();
    if (overrides && gate in overrides) {
        return Boolean(overrides[gate]);
    }
    const configOverrides = getConfigOverrides();
    if (configOverrides && gate in configOverrides) {
        return Boolean(configOverrides[gate]);
    }
    if (!isGrowthBookEnabled()) {
        return false;
    }
    // Log experiment exposure if data is available, otherwise defer until after init
    if (experimentDataByFeature.has(gate)) {
        logExposureForFeature(gate);
    }
    else {
        pendingExposures.add(gate);
    }
    // Return cached value immediately from disk
    // First check GrowthBook cache, then fall back to Statsig cache for migration
    const config = (0, config_js_1.getGlobalConfig)();
    const gbCached = config.cachedGrowthBookFeatures?.[gate];
    if (gbCached !== undefined) {
        return Boolean(gbCached);
    }
    // Fallback to Statsig cache for migration period
    return config.cachedStatsigGates?.[gate] ?? false;
}
/**
 * Check a security restriction gate, waiting for re-init if in progress.
 *
 * Use this for security-critical gates where we need fresh values after auth changes.
 *
 * Behavior:
 * - If GrowthBook is re-initializing (e.g., after login), waits for it to complete
 * - Otherwise, returns cached value immediately (Statsig cache first, then GrowthBook)
 *
 * Statsig cache is checked first as a safety measure for security-related checks:
 * if the Statsig cache indicates the gate is enabled, we honor it.
 */
async function checkSecurityRestrictionGate(gate) {
    // Check env var overrides first (for eval harnesses)
    const overrides = getEnvOverrides();
    if (overrides && gate in overrides) {
        return Boolean(overrides[gate]);
    }
    const configOverrides = getConfigOverrides();
    if (configOverrides && gate in configOverrides) {
        return Boolean(configOverrides[gate]);
    }
    if (!isGrowthBookEnabled()) {
        return false;
    }
    // If re-initialization is in progress, wait for it to complete
    // This ensures we get fresh values after auth changes
    if (reinitializingPromise) {
        await reinitializingPromise;
    }
    // Check Statsig cache first - it may have correct value from previous logged-in session
    const config = (0, config_js_1.getGlobalConfig)();
    const statsigCached = config.cachedStatsigGates?.[gate];
    if (statsigCached !== undefined) {
        return Boolean(statsigCached);
    }
    // Then check GrowthBook cache
    const gbCached = config.cachedGrowthBookFeatures?.[gate];
    if (gbCached !== undefined) {
        return Boolean(gbCached);
    }
    // No cache - return false (don't block on init for uncached gates)
    return false;
}
/**
 * Check a boolean entitlement gate with fallback-to-blocking semantics.
 *
 * Fast path: if the disk cache already says `true`, return it immediately.
 * Slow path: if disk says `false`/missing, await GrowthBook init and fetch the
 * fresh server value (max ~5s). Disk is populated by syncRemoteEvalToDisk
 * inside init, so by the time the slow path returns, disk already has the
 * fresh value — no write needed here.
 *
 * Use for user-invoked features (e.g. /remote-control) that are gated on
 * subscription/org, where a stale `false` would unfairly block access but a
 * stale `true` is acceptable (the server is the real gatekeeper).
 */
async function checkGate_CACHED_OR_BLOCKING(gate) {
    // Check env var overrides first (for eval harnesses)
    const overrides = getEnvOverrides();
    if (overrides && gate in overrides) {
        return Boolean(overrides[gate]);
    }
    const configOverrides = getConfigOverrides();
    if (configOverrides && gate in configOverrides) {
        return Boolean(configOverrides[gate]);
    }
    if (!isGrowthBookEnabled()) {
        return false;
    }
    // Fast path: disk cache already says true — trust it
    const cached = (0, config_js_1.getGlobalConfig)().cachedGrowthBookFeatures?.[gate];
    if (cached === true) {
        // Log experiment exposure if data is available, otherwise defer
        if (experimentDataByFeature.has(gate)) {
            logExposureForFeature(gate);
        }
        else {
            pendingExposures.add(gate);
        }
        return true;
    }
    // Slow path: disk says false/missing — may be stale, fetch fresh
    return getFeatureValueInternal(gate, false, true);
}
/**
 * Refresh GrowthBook after auth changes (login/logout).
 *
 * NOTE: This must destroy and recreate the client because GrowthBook's
 * apiHostRequestHeaders cannot be updated after client creation.
 */
function refreshGrowthBookAfterAuthChange() {
    if (!isGrowthBookEnabled()) {
        return;
    }
    try {
        // Reset the client completely to get fresh auth headers
        // This is necessary because apiHostRequestHeaders can't be updated after creation
        resetGrowthBook();
        // resetGrowthBook cleared remoteEvalFeatureValues. If re-init below
        // times out (hadFeatures=false) or short-circuits on !hasAuth (logout),
        // the init-callback notify never fires — subscribers stay synced to the
        // previous account's memoized state. Notify here so they re-read now
        // (falls to disk cache). If re-init succeeds, they'll notify again with
        // fresh values; if not, at least they're synced to the post-reset state.
        refreshed.emit();
        // Reinitialize with fresh auth headers and attributes
        // Track this promise so security gate checks can wait for it.
        // .catch before .finally: initializeGrowthBook can reject if its sync
        // helpers throw (getGrowthBookClient, getAuthHeaders, resetGrowthBook —
        // clientWrapper.initialized itself has its own .catch so never rejects),
        // and .finally re-settles with the original rejection — the sync
        // try/catch below cannot catch async rejections.
        reinitializingPromise = (0, exports.initializeGrowthBook)()
            .catch(error => {
            (0, log_js_1.logError)((0, errors_js_1.toError)(error));
            return null;
        })
            .finally(() => {
            reinitializingPromise = null;
        });
    }
    catch (error) {
        if (process.env.NODE_ENV === 'development') {
            throw error;
        }
        (0, log_js_1.logError)((0, errors_js_1.toError)(error));
    }
}
/**
 * Reset GrowthBook client state (primarily for testing)
 */
function resetGrowthBook() {
    stopPeriodicGrowthBookRefresh();
    // Remove process handlers before destroying client to prevent accumulation
    if (currentBeforeExitHandler) {
        process.off('beforeExit', currentBeforeExitHandler);
        currentBeforeExitHandler = null;
    }
    if (currentExitHandler) {
        process.off('exit', currentExitHandler);
        currentExitHandler = null;
    }
    client?.destroy();
    client = null;
    clientCreatedWithAuth = false;
    reinitializingPromise = null;
    experimentDataByFeature.clear();
    pendingExposures.clear();
    loggedExposures.clear();
    remoteEvalFeatureValues.clear();
    getGrowthBookClient.cache?.clear?.();
    exports.initializeGrowthBook.cache?.clear?.();
    envOverrides = null;
    envOverridesParsed = false;
}
// Periodic refresh interval (matches Statsig's 6-hour interval)
const GROWTHBOOK_REFRESH_INTERVAL_MS = process.env.USER_TYPE !== 'ant'
    ? 6 * 60 * 60 * 1000 // 6 hours
    : 20 * 60 * 1000; // 20 min (for ants)
let refreshInterval = null;
let beforeExitListener = null;
/**
 * Light refresh - re-fetch features from server without recreating client.
 * Use this for periodic refresh when auth headers haven't changed.
 *
 * Unlike refreshGrowthBookAfterAuthChange() which destroys and recreates the client,
 * this preserves client state and just fetches fresh feature values.
 */
async function refreshGrowthBookFeatures() {
    if (!isGrowthBookEnabled()) {
        return;
    }
    try {
        const growthBookClient = await (0, exports.initializeGrowthBook)();
        if (!growthBookClient) {
            return;
        }
        await growthBookClient.refreshFeatures();
        // Guard: if this client was replaced during the in-flight refresh
        // (e.g. refreshGrowthBookAfterAuthChange ran), skip processing the
        // stale payload. Mirrors the init-callback guard above.
        if (growthBookClient !== client) {
            if (process.env.USER_TYPE === 'ant') {
                (0, debug_js_1.logForDebugging)('GrowthBook: Skipping refresh processing for replaced client');
            }
            return;
        }
        // Rebuild remoteEvalFeatureValues from the refreshed payload so that
        // _BLOCKS_ON_INIT callers (e.g. getMaxVersion for the auto-update kill
        // switch) see fresh values, not the stale init-time snapshot.
        const hadFeatures = await processRemoteEvalPayload(growthBookClient);
        // Same re-check as init path: covers the setPayload yield inside
        // processRemoteEvalPayload (the guard above only covers refreshFeatures).
        if (growthBookClient !== client)
            return;
        if (process.env.USER_TYPE === 'ant') {
            (0, debug_js_1.logForDebugging)('GrowthBook: Light refresh completed');
        }
        // Gate on hadFeatures: if the payload was empty/malformed,
        // remoteEvalFeatureValues wasn't rebuilt — skip both the no-op disk
        // write and the spurious subscriber churn (clearCommandMemoizationCaches
        // + getCommands + 4× model re-renders).
        if (hadFeatures) {
            syncRemoteEvalToDisk();
            refreshed.emit();
        }
    }
    catch (error) {
        if (process.env.NODE_ENV === 'development') {
            throw error;
        }
        (0, log_js_1.logError)((0, errors_js_1.toError)(error));
    }
}
/**
 * Set up periodic refresh of GrowthBook features.
 * Uses light refresh (refreshGrowthBookFeatures) to re-fetch without recreating client.
 *
 * Call this after initialization for long-running sessions to ensure
 * feature values stay fresh. Matches Statsig's 6-hour refresh interval.
 */
function setupPeriodicGrowthBookRefresh() {
    if (!isGrowthBookEnabled()) {
        return;
    }
    // Clear any existing interval to avoid duplicates
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    refreshInterval = setInterval(() => {
        void refreshGrowthBookFeatures();
    }, GROWTHBOOK_REFRESH_INTERVAL_MS);
    // Allow process to exit naturally - this timer shouldn't keep the process alive
    refreshInterval.unref?.();
    // Register cleanup listener only once
    if (!beforeExitListener) {
        beforeExitListener = () => {
            stopPeriodicGrowthBookRefresh();
        };
        process.once('beforeExit', beforeExitListener);
    }
}
/**
 * Stop periodic refresh (for testing or cleanup)
 */
function stopPeriodicGrowthBookRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
    if (beforeExitListener) {
        process.removeListener('beforeExit', beforeExitListener);
        beforeExitListener = null;
    }
}
// ============================================================================
// Dynamic Config Functions
// These are semantic wrappers around feature functions for Statsig API parity.
// In GrowthBook, dynamic configs are just features with object values.
// ============================================================================
/**
 * Get a dynamic config value - blocks until GrowthBook is initialized.
 * Prefer getFeatureValue_CACHED_MAY_BE_STALE for startup-critical paths.
 */
async function getDynamicConfig_BLOCKS_ON_INIT(configName, defaultValue) {
    return getFeatureValue_DEPRECATED(configName, defaultValue);
}
/**
 * Get a dynamic config value from disk cache immediately. Pure read — see
 * getFeatureValue_CACHED_MAY_BE_STALE.
 * This is the preferred method for startup-critical paths and sync contexts.
 *
 * In GrowthBook, dynamic configs are just features with object values.
 */
function getDynamicConfig_CACHED_MAY_BE_STALE(configName, defaultValue) {
    return getFeatureValue_CACHED_MAY_BE_STALE(configName, defaultValue);
}
