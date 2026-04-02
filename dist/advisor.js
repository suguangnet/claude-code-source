"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const advisor_js_1 = require("../utils/advisor.js");
const model_js_1 = require("../utils/model/model.js");
const validateModel_js_1 = require("../utils/model/validateModel.js");
const settings_js_1 = require("../utils/settings/settings.js");
const call = async (args, context) => {
    const arg = args.trim().toLowerCase();
    const baseModel = (0, model_js_1.parseUserSpecifiedModel)(context.getAppState().mainLoopModel ?? (0, model_js_1.getDefaultMainLoopModelSetting)());
    if (!arg) {
        const current = context.getAppState().advisorModel;
        if (!current) {
            return {
                type: 'text',
                value: 'Advisor: not set\nUse "/advisor <model>" to enable (e.g. "/advisor opus").',
            };
        }
        if (!(0, advisor_js_1.modelSupportsAdvisor)(baseModel)) {
            return {
                type: 'text',
                value: `Advisor: ${current} (inactive)\nThe current model (${baseModel}) does not support advisors.`,
            };
        }
        return {
            type: 'text',
            value: `Advisor: ${current}\nUse "/advisor unset" to disable or "/advisor <model>" to change.`,
        };
    }
    if (arg === 'unset' || arg === 'off') {
        const prev = context.getAppState().advisorModel;
        context.setAppState(s => {
            if (s.advisorModel === undefined)
                return s;
            return { ...s, advisorModel: undefined };
        });
        (0, settings_js_1.updateSettingsForSource)('userSettings', { advisorModel: undefined });
        return {
            type: 'text',
            value: prev
                ? `Advisor disabled (was ${prev}).`
                : 'Advisor already unset.',
        };
    }
    const normalizedModel = (0, model_js_1.normalizeModelStringForAPI)(arg);
    const resolvedModel = (0, model_js_1.parseUserSpecifiedModel)(arg);
    const { valid, error } = await (0, validateModel_js_1.validateModel)(resolvedModel);
    if (!valid) {
        return {
            type: 'text',
            value: error
                ? `Invalid advisor model: ${error}`
                : `Unknown model: ${arg} (${resolvedModel})`,
        };
    }
    if (!(0, advisor_js_1.isValidAdvisorModel)(resolvedModel)) {
        return {
            type: 'text',
            value: `The model ${arg} (${resolvedModel}) cannot be used as an advisor`,
        };
    }
    context.setAppState(s => {
        if (s.advisorModel === normalizedModel)
            return s;
        return { ...s, advisorModel: normalizedModel };
    });
    (0, settings_js_1.updateSettingsForSource)('userSettings', { advisorModel: normalizedModel });
    if (!(0, advisor_js_1.modelSupportsAdvisor)(baseModel)) {
        return {
            type: 'text',
            value: `Advisor set to ${normalizedModel}.\nNote: Your current model (${baseModel}) does not support advisors. Switch to a supported model to use the advisor.`,
        };
    }
    return {
        type: 'text',
        value: `Advisor set to ${normalizedModel}.`,
    };
};
const advisor = {
    type: 'local',
    name: 'advisor',
    description: 'Configure the advisor model',
    argumentHint: '[<model>|off]',
    isEnabled: () => (0, advisor_js_1.canUserConfigureAdvisor)(),
    get isHidden() {
        return !(0, advisor_js_1.canUserConfigureAdvisor)();
    },
    supportsNonInteractive: true,
    load: () => Promise.resolve({ call }),
};
exports.default = advisor;
