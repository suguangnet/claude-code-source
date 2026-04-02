"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveOverriddenModel = resolveOverriddenModel;
exports.getModelStrings = getModelStrings;
exports.ensureModelStringsInitialized = ensureModelStringsInitialized;
const state_js_1 = require("src/bootstrap/state.js");
const log_js_1 = require("../log.js");
const sequential_js_1 = require("../sequential.js");
const settings_js_1 = require("../settings/settings.js");
const bedrock_js_1 = require("./bedrock.js");
const configs_js_1 = require("./configs.js");
const providers_js_1 = require("./providers.js");
const MODEL_KEYS = Object.keys(configs_js_1.ALL_MODEL_CONFIGS);
function getBuiltinModelStrings(provider) {
    const out = {};
    for (const key of MODEL_KEYS) {
        out[key] = configs_js_1.ALL_MODEL_CONFIGS[key][provider];
    }
    return out;
}
async function getBedrockModelStrings() {
    const fallback = getBuiltinModelStrings('bedrock');
    let profiles;
    try {
        profiles = await (0, bedrock_js_1.getBedrockInferenceProfiles)();
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return fallback;
    }
    if (!profiles?.length) {
        return fallback;
    }
    // Each config's firstParty ID is the canonical substring we search for in the
    // user's inference profile list (e.g. "claude-opus-4-6" matches
    // "eu.anthropic.claude-opus-4-6-v1"). Fall back to the hardcoded bedrock ID
    // when no matching profile is found.
    const out = {};
    for (const key of MODEL_KEYS) {
        const needle = configs_js_1.ALL_MODEL_CONFIGS[key].firstParty;
        out[key] = (0, bedrock_js_1.findFirstMatch)(profiles, needle) || fallback[key];
    }
    return out;
}
/**
 * Layer user-configured modelOverrides (from settings.json) on top of the
 * provider-derived model strings. Overrides are keyed by canonical first-party
 * model ID (e.g. "claude-opus-4-6") and map to arbitrary provider-specific
 * strings — typically Bedrock inference profile ARNs.
 */
function applyModelOverrides(ms) {
    const overrides = (0, settings_js_1.getInitialSettings)().modelOverrides;
    if (!overrides) {
        return ms;
    }
    const out = { ...ms };
    for (const [canonicalId, override] of Object.entries(overrides)) {
        const key = configs_js_1.CANONICAL_ID_TO_KEY[canonicalId];
        if (key && override) {
            out[key] = override;
        }
    }
    return out;
}
/**
 * Resolve an overridden model ID (e.g. a Bedrock ARN) back to its canonical
 * first-party model ID. If the input doesn't match any current override value,
 * it is returned unchanged. Safe to call during module init (no-ops if settings
 * aren't loaded yet).
 */
function resolveOverriddenModel(modelId) {
    let overrides;
    try {
        overrides = (0, settings_js_1.getInitialSettings)().modelOverrides;
    }
    catch {
        return modelId;
    }
    if (!overrides) {
        return modelId;
    }
    for (const [canonicalId, override] of Object.entries(overrides)) {
        if (override === modelId) {
            return canonicalId;
        }
    }
    return modelId;
}
const updateBedrockModelStrings = (0, sequential_js_1.sequential)(async () => {
    if ((0, state_js_1.getModelStrings)() !== null) {
        // Already initialized. Doing the check here, combined with
        // `sequential`, allows the test suite to reset the state
        // between tests while still preventing multiple API calls
        // in production.
        return;
    }
    try {
        const ms = await getBedrockModelStrings();
        (0, state_js_1.setModelStrings)(ms);
    }
    catch (error) {
        (0, log_js_1.logError)(error);
    }
});
function initModelStrings() {
    const ms = (0, state_js_1.getModelStrings)();
    if (ms !== null) {
        // Already initialized
        return;
    }
    // Initial with default values for non-Bedrock providers
    if ((0, providers_js_1.getAPIProvider)() !== 'bedrock') {
        (0, state_js_1.setModelStrings)(getBuiltinModelStrings((0, providers_js_1.getAPIProvider)()));
        return;
    }
    // On Bedrock, update model strings in the background without blocking.
    // Don't set the state in this case so that we can use `sequential` on
    // `updateBedrockModelStrings` and check for existing state on multiple
    // calls.
    void updateBedrockModelStrings();
}
function getModelStrings() {
    const ms = (0, state_js_1.getModelStrings)();
    if (ms === null) {
        initModelStrings();
        // Bedrock path falls through here while the profile fetch runs in the
        // background — still honor overrides on the interim defaults.
        return applyModelOverrides(getBuiltinModelStrings((0, providers_js_1.getAPIProvider)()));
    }
    return applyModelOverrides(ms);
}
/**
 * Ensure model strings are fully initialized.
 * For Bedrock users, this waits for the profile fetch to complete.
 * Call this before generating model options to ensure correct region strings.
 */
async function ensureModelStringsInitialized() {
    const ms = (0, state_js_1.getModelStrings)();
    if (ms !== null) {
        return;
    }
    // For non-Bedrock, initialize synchronously
    if ((0, providers_js_1.getAPIProvider)() !== 'bedrock') {
        (0, state_js_1.setModelStrings)(getBuiltinModelStrings((0, providers_js_1.getAPIProvider)()));
        return;
    }
    // For Bedrock, wait for the profile fetch
    await updateBedrockModelStrings();
}
