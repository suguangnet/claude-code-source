"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBudgetTracker = createBudgetTracker;
exports.checkTokenBudget = checkTokenBudget;
const tokenBudget_js_1 = require("../utils/tokenBudget.js");
const COMPLETION_THRESHOLD = 0.9;
const DIMINISHING_THRESHOLD = 500;
function createBudgetTracker() {
    return {
        continuationCount: 0,
        lastDeltaTokens: 0,
        lastGlobalTurnTokens: 0,
        startedAt: Date.now(),
    };
}
function checkTokenBudget(tracker, agentId, budget, globalTurnTokens) {
    if (agentId || budget === null || budget <= 0) {
        return { action: 'stop', completionEvent: null };
    }
    const turnTokens = globalTurnTokens;
    const pct = Math.round((turnTokens / budget) * 100);
    const deltaSinceLastCheck = globalTurnTokens - tracker.lastGlobalTurnTokens;
    const isDiminishing = tracker.continuationCount >= 3 &&
        deltaSinceLastCheck < DIMINISHING_THRESHOLD &&
        tracker.lastDeltaTokens < DIMINISHING_THRESHOLD;
    if (!isDiminishing && turnTokens < budget * COMPLETION_THRESHOLD) {
        tracker.continuationCount++;
        tracker.lastDeltaTokens = deltaSinceLastCheck;
        tracker.lastGlobalTurnTokens = globalTurnTokens;
        return {
            action: 'continue',
            nudgeMessage: (0, tokenBudget_js_1.getBudgetContinuationMessage)(pct, turnTokens, budget),
            continuationCount: tracker.continuationCount,
            pct,
            turnTokens,
            budget,
        };
    }
    if (isDiminishing || tracker.continuationCount > 0) {
        return {
            action: 'stop',
            completionEvent: {
                continuationCount: tracker.continuationCount,
                pct,
                turnTokens,
                budget,
                diminishingReturns: isDiminishing,
                durationMs: Date.now() - tracker.startedAt,
            },
        };
    }
    return { action: 'stop', completionEvent: null };
}
