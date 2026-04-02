"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.call = void 0;
const cost_tracker_js_1 = require("../../cost-tracker.js");
const claudeAiLimits_js_1 = require("../../services/claudeAiLimits.js");
const auth_js_1 = require("../../utils/auth.js");
const call = async () => {
    if ((0, auth_js_1.isClaudeAISubscriber)()) {
        let value;
        if (claudeAiLimits_js_1.currentLimits.isUsingOverage) {
            value =
                'You are currently using your overages to power your Claude Code usage. We will automatically switch you back to your subscription rate limits when they reset';
        }
        else {
            value =
                'You are currently using your subscription to power your Claude Code usage';
        }
        if (process.env.USER_TYPE === 'ant') {
            value += `\n\n[ANT-ONLY] Showing cost anyway:\n ${(0, cost_tracker_js_1.formatTotalCost)()}`;
        }
        return { type: 'text', value };
    }
    return { type: 'text', value: (0, cost_tracker_js_1.formatTotalCost)() };
};
exports.call = call;
