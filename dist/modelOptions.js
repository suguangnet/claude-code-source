"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultOptionForUser = getDefaultOptionForUser;
exports.getSonnet46_1MOption = getSonnet46_1MOption;
exports.getOpus46_1MOption = getOpus46_1MOption;
exports.getMaxSonnet46_1MOption = getMaxSonnet46_1MOption;
exports.getMaxOpus46_1MOption = getMaxOpus46_1MOption;
exports.getModelOptions = getModelOptions;
// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
const state_js_1 = require("../../bootstrap/state.js");
const auth_js_1 = require("../auth.js");
const modelStrings_js_1 = require("./modelStrings.js");
const modelCost_js_1 = require("../modelCost.js");
const settings_js_1 = require("../settings/settings.js");
const check1mAccess_js_1 = require("./check1mAccess.js");
const providers_js_1 = require("./providers.js");
const modelAllowlist_js_1 = require("./modelAllowlist.js");
const model_js_1 = require("./model.js");
const context_js_1 = require("../context.js");
const config_js_1 = require("../config.js");
function getDefaultOptionForUser(fastMode = false) {
    if (process.env.USER_TYPE === 'ant') {
        const currentModel = (0, model_js_1.renderDefaultModelSetting)((0, model_js_1.getDefaultMainLoopModelSetting)());
        return {
            value: null,
            label: 'Default (recommended)',
            description: `Use the default model for Ants (currently ${currentModel})`,
            descriptionForModel: `Default model (currently ${currentModel})`,
        };
    }
    // Subscribers
    if ((0, auth_js_1.isClaudeAISubscriber)()) {
        return {
            value: null,
            label: 'Default (recommended)',
            description: (0, model_js_1.getClaudeAiUserDefaultModelDescription)(fastMode),
        };
    }
    // PAYG
    const is3P = (0, providers_js_1.getAPIProvider)() !== 'firstParty';
    return {
        value: null,
        label: 'Default (recommended)',
        description: `Use the default model (currently ${(0, model_js_1.renderDefaultModelSetting)((0, model_js_1.getDefaultMainLoopModelSetting)())})${is3P ? '' : ` · ${(0, modelCost_js_1.formatModelPricing)(modelCost_js_1.COST_TIER_3_15)}`}`,
    };
}
function getCustomSonnetOption() {
    const is3P = (0, providers_js_1.getAPIProvider)() !== 'firstParty';
    const customSonnetModel = process.env.ANTHROPIC_DEFAULT_SONNET_MODEL;
    // When a 3P user has a custom sonnet model string, show it directly
    if (is3P && customSonnetModel) {
        const is1m = (0, context_js_1.has1mContext)(customSonnetModel);
        return {
            value: 'sonnet',
            label: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL_NAME ?? customSonnetModel,
            description: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL_DESCRIPTION ??
                `Custom Sonnet model${is1m ? ' (1M context)' : ''}`,
            descriptionForModel: `${process.env.ANTHROPIC_DEFAULT_SONNET_MODEL_DESCRIPTION ?? `Custom Sonnet model${is1m ? ' with 1M context' : ''}`} (${customSonnetModel})`,
        };
    }
}
// @[MODEL LAUNCH]: Update or add model option functions (getSonnetXXOption, getOpusXXOption, etc.)
// with the new model's label and description. These appear in the /model picker.
function getSonnet46Option() {
    const is3P = (0, providers_js_1.getAPIProvider)() !== 'firstParty';
    return {
        value: is3P ? (0, modelStrings_js_1.getModelStrings)().sonnet46 : 'sonnet',
        label: 'Sonnet',
        description: `Sonnet 4.6 · Best for everyday tasks${is3P ? '' : ` · ${(0, modelCost_js_1.formatModelPricing)(modelCost_js_1.COST_TIER_3_15)}`}`,
        descriptionForModel: 'Sonnet 4.6 - best for everyday tasks. Generally recommended for most coding tasks',
    };
}
function getCustomOpusOption() {
    const is3P = (0, providers_js_1.getAPIProvider)() !== 'firstParty';
    const customOpusModel = process.env.ANTHROPIC_DEFAULT_OPUS_MODEL;
    // When a 3P user has a custom opus model string, show it directly
    if (is3P && customOpusModel) {
        const is1m = (0, context_js_1.has1mContext)(customOpusModel);
        return {
            value: 'opus',
            label: process.env.ANTHROPIC_DEFAULT_OPUS_MODEL_NAME ?? customOpusModel,
            description: process.env.ANTHROPIC_DEFAULT_OPUS_MODEL_DESCRIPTION ??
                `Custom Opus model${is1m ? ' (1M context)' : ''}`,
            descriptionForModel: `${process.env.ANTHROPIC_DEFAULT_OPUS_MODEL_DESCRIPTION ?? `Custom Opus model${is1m ? ' with 1M context' : ''}`} (${customOpusModel})`,
        };
    }
}
function getOpus41Option() {
    return {
        value: 'opus',
        label: 'Opus 4.1',
        description: `Opus 4.1 · Legacy`,
        descriptionForModel: 'Opus 4.1 - legacy version',
    };
}
function getOpus46Option(fastMode = false) {
    const is3P = (0, providers_js_1.getAPIProvider)() !== 'firstParty';
    return {
        value: is3P ? (0, modelStrings_js_1.getModelStrings)().opus46 : 'opus',
        label: 'Opus',
        description: `Opus 4.6 · Most capable for complex work${(0, model_js_1.getOpus46PricingSuffix)(fastMode)}`,
        descriptionForModel: 'Opus 4.6 - most capable for complex work',
    };
}
function getSonnet46_1MOption() {
    const is3P = (0, providers_js_1.getAPIProvider)() !== 'firstParty';
    return {
        value: is3P ? (0, modelStrings_js_1.getModelStrings)().sonnet46 + '[1m]' : 'sonnet[1m]',
        label: 'Sonnet (1M context)',
        description: `Sonnet 4.6 for long sessions${is3P ? '' : ` · ${(0, modelCost_js_1.formatModelPricing)(modelCost_js_1.COST_TIER_3_15)}`}`,
        descriptionForModel: 'Sonnet 4.6 with 1M context window - for long sessions with large codebases',
    };
}
function getOpus46_1MOption(fastMode = false) {
    const is3P = (0, providers_js_1.getAPIProvider)() !== 'firstParty';
    return {
        value: is3P ? (0, modelStrings_js_1.getModelStrings)().opus46 + '[1m]' : 'opus[1m]',
        label: 'Opus (1M context)',
        description: `Opus 4.6 for long sessions${(0, model_js_1.getOpus46PricingSuffix)(fastMode)}`,
        descriptionForModel: 'Opus 4.6 with 1M context window - for long sessions with large codebases',
    };
}
function getCustomHaikuOption() {
    const is3P = (0, providers_js_1.getAPIProvider)() !== 'firstParty';
    const customHaikuModel = process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL;
    // When a 3P user has a custom haiku model string, show it directly
    if (is3P && customHaikuModel) {
        return {
            value: 'haiku',
            label: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME ?? customHaikuModel,
            description: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL_DESCRIPTION ??
                'Custom Haiku model',
            descriptionForModel: `${process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL_DESCRIPTION ?? 'Custom Haiku model'} (${customHaikuModel})`,
        };
    }
}
function getHaiku45Option() {
    const is3P = (0, providers_js_1.getAPIProvider)() !== 'firstParty';
    return {
        value: 'haiku',
        label: 'Haiku',
        description: `Haiku 4.5 · Fastest for quick answers${is3P ? '' : ` · ${(0, modelCost_js_1.formatModelPricing)(modelCost_js_1.COST_HAIKU_45)}`}`,
        descriptionForModel: 'Haiku 4.5 - fastest for quick answers. Lower cost but less capable than Sonnet 4.6.',
    };
}
function getHaiku35Option() {
    const is3P = (0, providers_js_1.getAPIProvider)() !== 'firstParty';
    return {
        value: 'haiku',
        label: 'Haiku',
        description: `Haiku 3.5 for simple tasks${is3P ? '' : ` · ${(0, modelCost_js_1.formatModelPricing)(modelCost_js_1.COST_HAIKU_35)}`}`,
        descriptionForModel: 'Haiku 3.5 - faster and lower cost, but less capable than Sonnet. Use for simple tasks.',
    };
}
function getHaikuOption() {
    // Return correct Haiku option based on provider
    const haikuModel = (0, model_js_1.getDefaultHaikuModel)();
    return haikuModel === (0, modelStrings_js_1.getModelStrings)().haiku45
        ? getHaiku45Option()
        : getHaiku35Option();
}
function getMaxOpusOption(fastMode = false) {
    return {
        value: 'opus',
        label: 'Opus',
        description: `Opus 4.6 · Most capable for complex work${fastMode ? (0, model_js_1.getOpus46PricingSuffix)(true) : ''}`,
    };
}
function getMaxSonnet46_1MOption() {
    const is3P = (0, providers_js_1.getAPIProvider)() !== 'firstParty';
    const billingInfo = (0, auth_js_1.isClaudeAISubscriber)() ? ' · Billed as extra usage' : '';
    return {
        value: 'sonnet[1m]',
        label: 'Sonnet (1M context)',
        description: `Sonnet 4.6 with 1M context${billingInfo}${is3P ? '' : ` · ${(0, modelCost_js_1.formatModelPricing)(modelCost_js_1.COST_TIER_3_15)}`}`,
    };
}
function getMaxOpus46_1MOption(fastMode = false) {
    const billingInfo = (0, auth_js_1.isClaudeAISubscriber)() ? ' · Billed as extra usage' : '';
    return {
        value: 'opus[1m]',
        label: 'Opus (1M context)',
        description: `Opus 4.6 with 1M context${billingInfo}${(0, model_js_1.getOpus46PricingSuffix)(fastMode)}`,
    };
}
function getMergedOpus1MOption(fastMode = false) {
    const is3P = (0, providers_js_1.getAPIProvider)() !== 'firstParty';
    return {
        value: is3P ? (0, modelStrings_js_1.getModelStrings)().opus46 + '[1m]' : 'opus[1m]',
        label: 'Opus (1M context)',
        description: `Opus 4.6 with 1M context · Most capable for complex work${!is3P && fastMode ? (0, model_js_1.getOpus46PricingSuffix)(fastMode) : ''}`,
        descriptionForModel: 'Opus 4.6 with 1M context - most capable for complex work',
    };
}
const MaxSonnet46Option = {
    value: 'sonnet',
    label: 'Sonnet',
    description: 'Sonnet 4.6 · Best for everyday tasks',
};
const MaxHaiku45Option = {
    value: 'haiku',
    label: 'Haiku',
    description: 'Haiku 4.5 · Fastest for quick answers',
};
function getOpusPlanOption() {
    return {
        value: 'opusplan',
        label: 'Opus Plan Mode',
        description: 'Use Opus 4.6 in plan mode, Sonnet 4.6 otherwise',
    };
}
// @[MODEL LAUNCH]: Update the model picker lists below to include/reorder options for the new model.
// Each user tier (ant, Max/Team Premium, Pro/Team Standard/Enterprise, PAYG 1P, PAYG 3P) has its own list.
function getModelOptionsBase(fastMode = false) {
    if (process.env.USER_TYPE === 'ant') {
        // Build options from antModels config
        const antModelOptions = getAntModels().map(m => ({
            value: m.alias,
            label: m.label,
            description: m.description ?? `[ANT-ONLY] ${m.label} (${m.model})`,
        }));
        return [
            getDefaultOptionForUser(),
            ...antModelOptions,
            getMergedOpus1MOption(fastMode),
            getSonnet46Option(),
            getSonnet46_1MOption(),
            getHaiku45Option(),
        ];
    }
    if ((0, auth_js_1.isClaudeAISubscriber)()) {
        if ((0, auth_js_1.isMaxSubscriber)() || (0, auth_js_1.isTeamPremiumSubscriber)()) {
            // Max and Team Premium users: Opus is default, show Sonnet as alternative
            const premiumOptions = [getDefaultOptionForUser(fastMode)];
            if (!(0, model_js_1.isOpus1mMergeEnabled)() && (0, check1mAccess_js_1.checkOpus1mAccess)()) {
                premiumOptions.push(getMaxOpus46_1MOption(fastMode));
            }
            premiumOptions.push(MaxSonnet46Option);
            if ((0, check1mAccess_js_1.checkSonnet1mAccess)()) {
                premiumOptions.push(getMaxSonnet46_1MOption());
            }
            premiumOptions.push(MaxHaiku45Option);
            return premiumOptions;
        }
        // Pro/Team Standard/Enterprise users: Sonnet is default, show Opus as alternative
        const standardOptions = [getDefaultOptionForUser(fastMode)];
        if ((0, check1mAccess_js_1.checkSonnet1mAccess)()) {
            standardOptions.push(getMaxSonnet46_1MOption());
        }
        if ((0, model_js_1.isOpus1mMergeEnabled)()) {
            standardOptions.push(getMergedOpus1MOption(fastMode));
        }
        else {
            standardOptions.push(getMaxOpusOption(fastMode));
            if ((0, check1mAccess_js_1.checkOpus1mAccess)()) {
                standardOptions.push(getMaxOpus46_1MOption(fastMode));
            }
        }
        standardOptions.push(MaxHaiku45Option);
        return standardOptions;
    }
    // PAYG 1P API: Default (Sonnet) + Sonnet 1M + Opus 4.6 + Opus 1M + Haiku
    if ((0, providers_js_1.getAPIProvider)() === 'firstParty') {
        const payg1POptions = [getDefaultOptionForUser(fastMode)];
        if ((0, check1mAccess_js_1.checkSonnet1mAccess)()) {
            payg1POptions.push(getSonnet46_1MOption());
        }
        if ((0, model_js_1.isOpus1mMergeEnabled)()) {
            payg1POptions.push(getMergedOpus1MOption(fastMode));
        }
        else {
            payg1POptions.push(getOpus46Option(fastMode));
            if ((0, check1mAccess_js_1.checkOpus1mAccess)()) {
                payg1POptions.push(getOpus46_1MOption(fastMode));
            }
        }
        payg1POptions.push(getHaiku45Option());
        return payg1POptions;
    }
    // PAYG 3P: Default (Sonnet 4.5) + Sonnet (3P custom) or Sonnet 4.6/1M + Opus (3P custom) or Opus 4.1/Opus 4.6/Opus1M + Haiku + Opus 4.1
    const payg3pOptions = [getDefaultOptionForUser(fastMode)];
    const customSonnet = getCustomSonnetOption();
    if (customSonnet !== undefined) {
        payg3pOptions.push(customSonnet);
    }
    else {
        // Add Sonnet 4.6 since Sonnet 4.5 is the default
        payg3pOptions.push(getSonnet46Option());
        if ((0, check1mAccess_js_1.checkSonnet1mAccess)()) {
            payg3pOptions.push(getSonnet46_1MOption());
        }
    }
    const customOpus = getCustomOpusOption();
    if (customOpus !== undefined) {
        payg3pOptions.push(customOpus);
    }
    else {
        // Add Opus 4.1, Opus 4.6 and Opus 4.6 1M
        payg3pOptions.push(getOpus41Option()); // This is the default opus
        payg3pOptions.push(getOpus46Option(fastMode));
        if ((0, check1mAccess_js_1.checkOpus1mAccess)()) {
            payg3pOptions.push(getOpus46_1MOption(fastMode));
        }
    }
    const customHaiku = getCustomHaikuOption();
    if (customHaiku !== undefined) {
        payg3pOptions.push(customHaiku);
    }
    else {
        payg3pOptions.push(getHaikuOption());
    }
    return payg3pOptions;
}
// @[MODEL LAUNCH]: Add the new model ID to the appropriate family pattern below
// so the "newer version available" hint works correctly.
/**
 * Map a full model name to its family alias and the marketing name of the
 * version the alias currently resolves to. Used to detect when a user has
 * a specific older version pinned and a newer one is available.
 */
function getModelFamilyInfo(model) {
    const canonical = (0, model_js_1.getCanonicalName)(model);
    // Sonnet family
    if (canonical.includes('claude-sonnet-4-6') ||
        canonical.includes('claude-sonnet-4-5') ||
        canonical.includes('claude-sonnet-4-') ||
        canonical.includes('claude-3-7-sonnet') ||
        canonical.includes('claude-3-5-sonnet')) {
        const currentName = (0, model_js_1.getMarketingNameForModel)((0, model_js_1.getDefaultSonnetModel)());
        if (currentName) {
            return { alias: 'Sonnet', currentVersionName: currentName };
        }
    }
    // Opus family
    if (canonical.includes('claude-opus-4')) {
        const currentName = (0, model_js_1.getMarketingNameForModel)((0, model_js_1.getDefaultOpusModel)());
        if (currentName) {
            return { alias: 'Opus', currentVersionName: currentName };
        }
    }
    // Haiku family
    if (canonical.includes('claude-haiku') ||
        canonical.includes('claude-3-5-haiku')) {
        const currentName = (0, model_js_1.getMarketingNameForModel)((0, model_js_1.getDefaultHaikuModel)());
        if (currentName) {
            return { alias: 'Haiku', currentVersionName: currentName };
        }
    }
    return null;
}
/**
 * Returns a ModelOption for a known Anthropic model with a human-readable
 * label, and an upgrade hint if a newer version is available via the alias.
 * Returns null if the model is not recognized.
 */
function getKnownModelOption(model) {
    const marketingName = (0, model_js_1.getMarketingNameForModel)(model);
    if (!marketingName)
        return null;
    const familyInfo = getModelFamilyInfo(model);
    if (!familyInfo) {
        return {
            value: model,
            label: marketingName,
            description: model,
        };
    }
    // Check if the alias currently resolves to a different (newer) version
    if (marketingName !== familyInfo.currentVersionName) {
        return {
            value: model,
            label: marketingName,
            description: `Newer version available · select ${familyInfo.alias} for ${familyInfo.currentVersionName}`,
        };
    }
    // Same version as the alias — just show the friendly name
    return {
        value: model,
        label: marketingName,
        description: model,
    };
}
function getModelOptions(fastMode = false) {
    const options = getModelOptionsBase(fastMode);
    // Add the custom model from the ANTHROPIC_CUSTOM_MODEL_OPTION env var
    const envCustomModel = process.env.ANTHROPIC_CUSTOM_MODEL_OPTION;
    if (envCustomModel &&
        !options.some(existing => existing.value === envCustomModel)) {
        options.push({
            value: envCustomModel,
            label: process.env.ANTHROPIC_CUSTOM_MODEL_OPTION_NAME ?? envCustomModel,
            description: process.env.ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION ??
                `Custom model (${envCustomModel})`,
        });
    }
    // Append additional model options fetched during bootstrap
    for (const opt of (0, config_js_1.getGlobalConfig)().additionalModelOptionsCache ?? []) {
        if (!options.some(existing => existing.value === opt.value)) {
            options.push(opt);
        }
    }
    // Add custom model from either the current model value or the initial one
    // if it is not already in the options.
    let customModel = null;
    const currentMainLoopModel = (0, model_js_1.getUserSpecifiedModelSetting)();
    const initialMainLoopModel = (0, state_js_1.getInitialMainLoopModel)();
    if (currentMainLoopModel !== undefined && currentMainLoopModel !== null) {
        customModel = currentMainLoopModel;
    }
    else if (initialMainLoopModel !== null) {
        customModel = initialMainLoopModel;
    }
    if (customModel === null || options.some(opt => opt.value === customModel)) {
        return filterModelOptionsByAllowlist(options);
    }
    else if (customModel === 'opusplan') {
        return filterModelOptionsByAllowlist([...options, getOpusPlanOption()]);
    }
    else if (customModel === 'opus' && (0, providers_js_1.getAPIProvider)() === 'firstParty') {
        return filterModelOptionsByAllowlist([
            ...options,
            getMaxOpusOption(fastMode),
        ]);
    }
    else if (customModel === 'opus[1m]' && (0, providers_js_1.getAPIProvider)() === 'firstParty') {
        return filterModelOptionsByAllowlist([
            ...options,
            getMergedOpus1MOption(fastMode),
        ]);
    }
    else {
        // Try to show a human-readable label for known Anthropic models, with an
        // upgrade hint if the alias now resolves to a newer version.
        const knownOption = getKnownModelOption(customModel);
        if (knownOption) {
            options.push(knownOption);
        }
        else {
            options.push({
                value: customModel,
                label: customModel,
                description: 'Custom model',
            });
        }
        return filterModelOptionsByAllowlist(options);
    }
}
/**
 * Filter model options by the availableModels allowlist.
 * Always preserves the "Default" option (value: null).
 */
function filterModelOptionsByAllowlist(options) {
    const settings = (0, settings_js_1.getSettings_DEPRECATED)() || {};
    if (!settings.availableModels) {
        return options; // No restrictions
    }
    return options.filter(opt => opt.value === null || (opt.value !== null && (0, modelAllowlist_js_1.isModelAllowed)(opt.value)));
}
