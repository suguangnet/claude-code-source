"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.get3PModelCapabilityOverride = void 0;
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const providers_js_1 = require("./providers.js");
const TIERS = [
    {
        modelEnvVar: 'ANTHROPIC_DEFAULT_OPUS_MODEL',
        capabilitiesEnvVar: 'ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES',
    },
    {
        modelEnvVar: 'ANTHROPIC_DEFAULT_SONNET_MODEL',
        capabilitiesEnvVar: 'ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES',
    },
    {
        modelEnvVar: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
        capabilitiesEnvVar: 'ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES',
    },
];
/**
 * Check whether a 3p model capability override is set for a model that matches one of
 * the pinned ANTHROPIC_DEFAULT_*_MODEL env vars.
 */
exports.get3PModelCapabilityOverride = (0, memoize_js_1.default)((model, capability) => {
    if ((0, providers_js_1.getAPIProvider)() === 'firstParty') {
        return undefined;
    }
    const m = model.toLowerCase();
    for (const tier of TIERS) {
        const pinned = process.env[tier.modelEnvVar];
        const capabilities = process.env[tier.capabilitiesEnvVar];
        if (!pinned || capabilities === undefined)
            continue;
        if (m !== pinned.toLowerCase())
            continue;
        return capabilities
            .toLowerCase()
            .split(',')
            .map(s => s.trim())
            .includes(capability);
    }
    return undefined;
}, (model, capability) => `${model.toLowerCase()}:${capability}`);
