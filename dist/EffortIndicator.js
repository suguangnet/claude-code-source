"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEffortNotificationText = getEffortNotificationText;
exports.effortLevelToSymbol = effortLevelToSymbol;
const figures_js_1 = require("../constants/figures.js");
const effort_js_1 = require("../utils/effort.js");
/**
 * Build the text for the effort-changed notification, e.g. "◐ medium · /effort".
 * Returns undefined if the model doesn't support effort.
 */
function getEffortNotificationText(effortValue, model) {
    if (!(0, effort_js_1.modelSupportsEffort)(model))
        return undefined;
    const level = (0, effort_js_1.getDisplayedEffortLevel)(model, effortValue);
    return `${effortLevelToSymbol(level)} ${level} · /effort`;
}
function effortLevelToSymbol(level) {
    switch (level) {
        case 'low':
            return figures_js_1.EFFORT_LOW;
        case 'medium':
            return figures_js_1.EFFORT_MEDIUM;
        case 'high':
            return figures_js_1.EFFORT_HIGH;
        case 'max':
            return figures_js_1.EFFORT_MAX;
        default:
            // Defensive: level can originate from remote config. If an unknown
            // value slips through, render the high symbol rather than undefined.
            return figures_js_1.EFFORT_HIGH;
    }
}
