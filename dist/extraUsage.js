"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBilledAsExtraUsage = isBilledAsExtraUsage;
const auth_js_1 = require("./auth.js");
const context_js_1 = require("./context.js");
function isBilledAsExtraUsage(model, isFastMode, isOpus1mMerged) {
    if (!(0, auth_js_1.isClaudeAISubscriber)())
        return false;
    if (isFastMode)
        return true;
    if (model === null || !(0, context_js_1.has1mContext)(model))
        return false;
    const m = model
        .toLowerCase()
        .replace(/\[1m\]$/, '')
        .trim();
    const isOpus46 = m === 'opus' || m.includes('opus-4-6');
    const isSonnet46 = m === 'sonnet' || m.includes('sonnet-4-6');
    if (isOpus46 && isOpus1mMerged)
        return false;
    return isOpus46 || isSonnet46;
}
