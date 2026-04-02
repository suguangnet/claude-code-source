"use strict";
/**
 * Model deprecation utilities
 *
 * Contains information about deprecated models and their retirement dates.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getModelDeprecationWarning = getModelDeprecationWarning;
const providers_js_1 = require("./providers.js");
/**
 * Deprecated models and their retirement dates by provider.
 * Keys are substrings to match in model IDs (case-insensitive).
 * To add a new deprecated model, add an entry to this object.
 */
const DEPRECATED_MODELS = {
    'claude-3-opus': {
        modelName: 'Claude 3 Opus',
        retirementDates: {
            firstParty: 'January 5, 2026',
            bedrock: 'January 15, 2026',
            vertex: 'January 5, 2026',
            foundry: 'January 5, 2026',
        },
    },
    'claude-3-7-sonnet': {
        modelName: 'Claude 3.7 Sonnet',
        retirementDates: {
            firstParty: 'February 19, 2026',
            bedrock: 'April 28, 2026',
            vertex: 'May 11, 2026',
            foundry: 'February 19, 2026',
        },
    },
    'claude-3-5-haiku': {
        modelName: 'Claude 3.5 Haiku',
        retirementDates: {
            firstParty: 'February 19, 2026',
            bedrock: null,
            vertex: null,
            foundry: null,
        },
    },
};
/**
 * Check if a model is deprecated and get its deprecation info
 */
function getDeprecatedModelInfo(modelId) {
    const lowercaseModelId = modelId.toLowerCase();
    const provider = (0, providers_js_1.getAPIProvider)();
    for (const [key, value] of Object.entries(DEPRECATED_MODELS)) {
        const retirementDate = value.retirementDates[provider];
        if (!lowercaseModelId.includes(key) || !retirementDate) {
            continue;
        }
        return {
            isDeprecated: true,
            modelName: value.modelName,
            retirementDate,
        };
    }
    return { isDeprecated: false };
}
/**
 * Get a deprecation warning message for a model, or null if not deprecated
 */
function getModelDeprecationWarning(modelId) {
    if (!modelId) {
        return null;
    }
    const info = getDeprecatedModelInfo(modelId);
    if (!info.isDeprecated) {
        return null;
    }
    return `⚠ ${info.modelName} will be retired on ${info.retirementDate}. Consider switching to a newer model.`;
}
