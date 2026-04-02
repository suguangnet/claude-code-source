"use strict";
/**
 * Tracks commands recently denied by the auto mode classifier.
 * Populated from useCanUseTool.ts, read from RecentDenialsTab.tsx in /permissions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordAutoModeDenial = recordAutoModeDenial;
exports.getAutoModeDenials = getAutoModeDenials;
const bun_bundle_1 = require("bun:bundle");
let DENIALS = [];
const MAX_DENIALS = 20;
function recordAutoModeDenial(denial) {
    if (!(0, bun_bundle_1.feature)('TRANSCRIPT_CLASSIFIER'))
        return;
    DENIALS = [denial, ...DENIALS.slice(0, MAX_DENIALS - 1)];
}
function getAutoModeDenials() {
    return DENIALS;
}
