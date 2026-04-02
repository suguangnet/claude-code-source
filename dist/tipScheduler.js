"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectTipWithLongestTimeSinceShown = selectTipWithLongestTimeSinceShown;
exports.getTipToShowOnSpinner = getTipToShowOnSpinner;
exports.recordShownTip = recordShownTip;
const settings_js_1 = require("../../utils/settings/settings.js");
const index_js_1 = require("../analytics/index.js");
const tipHistory_js_1 = require("./tipHistory.js");
const tipRegistry_js_1 = require("./tipRegistry.js");
function selectTipWithLongestTimeSinceShown(availableTips) {
    if (availableTips.length === 0) {
        return undefined;
    }
    if (availableTips.length === 1) {
        return availableTips[0];
    }
    // Sort tips by sessions since last shown (descending) and take the first one
    // This is the tip that hasn't been shown for the longest time
    const tipsWithSessions = availableTips.map(tip => ({
        tip,
        sessions: (0, tipHistory_js_1.getSessionsSinceLastShown)(tip.id),
    }));
    tipsWithSessions.sort((a, b) => b.sessions - a.sessions);
    return tipsWithSessions[0]?.tip;
}
async function getTipToShowOnSpinner(context) {
    // Check if tips are disabled (default to true if not set)
    if ((0, settings_js_1.getSettings_DEPRECATED)().spinnerTipsEnabled === false) {
        return undefined;
    }
    const tips = await (0, tipRegistry_js_1.getRelevantTips)(context);
    if (tips.length === 0) {
        return undefined;
    }
    return selectTipWithLongestTimeSinceShown(tips);
}
function recordShownTip(tip) {
    // Record in history
    (0, tipHistory_js_1.recordTipShown)(tip.id);
    // Log event for analytics
    (0, index_js_1.logEvent)('tengu_tip_shown', {
        tipIdLength: tip.id,
        cooldownSessions: tip.cooldownSessions,
    });
}
