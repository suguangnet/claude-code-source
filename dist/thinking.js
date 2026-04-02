"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUltrathinkEnabled = isUltrathinkEnabled;
exports.hasUltrathinkKeyword = hasUltrathinkKeyword;
exports.findThinkingTriggerPositions = findThinkingTriggerPositions;
exports.getRainbowColor = getRainbowColor;
exports.modelSupportsThinking = modelSupportsThinking;
exports.modelSupportsAdaptiveThinking = modelSupportsAdaptiveThinking;
exports.shouldEnableThinkingByDefault = shouldEnableThinkingByDefault;
const bun_bundle_1 = require("bun:bundle");
const growthbook_js_1 = require("../services/analytics/growthbook.js");
const model_js_1 = require("./model/model.js");
const modelSupportOverrides_js_1 = require("./model/modelSupportOverrides.js");
const providers_js_1 = require("./model/providers.js");
const settings_js_1 = require("./settings/settings.js");
/**
 * Build-time gate (feature) + runtime gate (GrowthBook). The build flag
 * controls code inclusion in external builds; the GB flag controls rollout.
 */
function isUltrathinkEnabled() {
    if (!(0, bun_bundle_1.feature)('ULTRATHINK')) {
        return false;
    }
    return (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_turtle_carbon', true);
}
/**
 * Check if text contains the "ultrathink" keyword.
 */
function hasUltrathinkKeyword(text) {
    return /\bultrathink\b/i.test(text);
}
/**
 * Find positions of "ultrathink" keyword in text (for UI highlighting/notification)
 */
function findThinkingTriggerPositions(text) {
    const positions = [];
    // Fresh /g literal each call — String.prototype.matchAll copies lastIndex
    // from the source regex, so a shared instance would leak state from
    // hasUltrathinkKeyword's .test() into this call on the next render.
    const matches = text.matchAll(/\bultrathink\b/gi);
    for (const match of matches) {
        if (match.index !== undefined) {
            positions.push({
                word: match[0],
                start: match.index,
                end: match.index + match[0].length,
            });
        }
    }
    return positions;
}
const RAINBOW_COLORS = [
    'rainbow_red',
    'rainbow_orange',
    'rainbow_yellow',
    'rainbow_green',
    'rainbow_blue',
    'rainbow_indigo',
    'rainbow_violet',
];
const RAINBOW_SHIMMER_COLORS = [
    'rainbow_red_shimmer',
    'rainbow_orange_shimmer',
    'rainbow_yellow_shimmer',
    'rainbow_green_shimmer',
    'rainbow_blue_shimmer',
    'rainbow_indigo_shimmer',
    'rainbow_violet_shimmer',
];
function getRainbowColor(charIndex, shimmer = false) {
    const colors = shimmer ? RAINBOW_SHIMMER_COLORS : RAINBOW_COLORS;
    return colors[charIndex % colors.length];
}
// TODO(inigo): add support for probing unknown models via API error detection
// Provider-aware thinking support detection (aligns with modelSupportsISP in betas.ts)
function modelSupportsThinking(model) {
    const supported3P = (0, modelSupportOverrides_js_1.get3PModelCapabilityOverride)(model, 'thinking');
    if (supported3P !== undefined) {
        return supported3P;
    }
    if (process.env.USER_TYPE === 'ant') {
        if (resolveAntModel(model.toLowerCase())) {
            return true;
        }
    }
    // IMPORTANT: Do not change thinking support without notifying the model
    // launch DRI and research. This can greatly affect model quality and bashing.
    const canonical = (0, model_js_1.getCanonicalName)(model);
    const provider = (0, providers_js_1.getAPIProvider)();
    // 1P and Foundry: all Claude 4+ models (including Haiku 4.5)
    if (provider === 'foundry' || provider === 'firstParty') {
        return !canonical.includes('claude-3-');
    }
    // 3P (Bedrock/Vertex): only Opus 4+ and Sonnet 4+
    return canonical.includes('sonnet-4') || canonical.includes('opus-4');
}
// @[MODEL LAUNCH]: Add the new model to the allowlist if it supports adaptive thinking.
function modelSupportsAdaptiveThinking(model) {
    const supported3P = (0, modelSupportOverrides_js_1.get3PModelCapabilityOverride)(model, 'adaptive_thinking');
    if (supported3P !== undefined) {
        return supported3P;
    }
    const canonical = (0, model_js_1.getCanonicalName)(model);
    // Supported by a subset of Claude 4 models
    if (canonical.includes('opus-4-6') || canonical.includes('sonnet-4-6')) {
        return true;
    }
    // Exclude any other known legacy models (allowlist above catches 4-6 variants first)
    if (canonical.includes('opus') ||
        canonical.includes('sonnet') ||
        canonical.includes('haiku')) {
        return false;
    }
    // IMPORTANT: Do not change adaptive thinking support without notifying the
    // model launch DRI and research. This can greatly affect model quality and
    // bashing.
    // Newer models (4.6+) are all trained on adaptive thinking and MUST have it
    // enabled for model testing. DO NOT default to false for first party, otherwise
    // we may silently degrade model quality.
    // Default to true for unknown model strings on 1P and Foundry (because Foundry
    // is a proxy). Do not default to true for other 3P as they have different formats
    // for their model strings.
    const provider = (0, providers_js_1.getAPIProvider)();
    return provider === 'firstParty' || provider === 'foundry';
}
function shouldEnableThinkingByDefault() {
    if (process.env.MAX_THINKING_TOKENS) {
        return parseInt(process.env.MAX_THINKING_TOKENS, 10) > 0;
    }
    const { settings } = (0, settings_js_1.getSettingsWithErrors)();
    if (settings.alwaysThinkingEnabled === false) {
        return false;
    }
    // IMPORTANT: Do not change default thinking enabled value without notifying
    // the model launch DRI and research. This can greatly affect model quality and
    // bashing.
    // Enable thinking by default unless explicitly disabled.
    return true;
}
