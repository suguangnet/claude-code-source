"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUltrareviewEnabled = isUltrareviewEnabled;
const growthbook_js_1 = require("../../services/analytics/growthbook.js");
/**
 * Runtime gate for /ultrareview. GB config's `enabled` field controls
 * visibility — isEnabled() on the command filters it from getCommands()
 * when false, so ungated users don't see the command at all.
 */
function isUltrareviewEnabled() {
    const cfg = (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_review_bughunter_config', null);
    return cfg?.enabled === true;
}
