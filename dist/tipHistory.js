"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordTipShown = recordTipShown;
exports.getSessionsSinceLastShown = getSessionsSinceLastShown;
const config_js_1 = require("../../utils/config.js");
function recordTipShown(tipId) {
    const numStartups = (0, config_js_1.getGlobalConfig)().numStartups;
    (0, config_js_1.saveGlobalConfig)(c => {
        const history = c.tipsHistory ?? {};
        if (history[tipId] === numStartups)
            return c;
        return { ...c, tipsHistory: { ...history, [tipId]: numStartups } };
    });
}
function getSessionsSinceLastShown(tipId) {
    const config = (0, config_js_1.getGlobalConfig)();
    const lastShown = config.tipsHistory?.[tipId];
    if (!lastShown)
        return Infinity;
    return config.numStartups - lastShown;
}
