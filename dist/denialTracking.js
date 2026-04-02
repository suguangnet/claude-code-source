"use strict";
/**
 * Denial tracking infrastructure for permission classifiers.
 * Tracks consecutive denials and total denials to determine
 * when to fall back to prompting.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DENIAL_LIMITS = void 0;
exports.createDenialTrackingState = createDenialTrackingState;
exports.recordDenial = recordDenial;
exports.recordSuccess = recordSuccess;
exports.shouldFallbackToPrompting = shouldFallbackToPrompting;
exports.DENIAL_LIMITS = {
    maxConsecutive: 3,
    maxTotal: 20,
};
function createDenialTrackingState() {
    return {
        consecutiveDenials: 0,
        totalDenials: 0,
    };
}
function recordDenial(state) {
    return {
        ...state,
        consecutiveDenials: state.consecutiveDenials + 1,
        totalDenials: state.totalDenials + 1,
    };
}
function recordSuccess(state) {
    if (state.consecutiveDenials === 0)
        return state; // No change needed
    return {
        ...state,
        consecutiveDenials: 0,
    };
}
function shouldFallbackToPrompting(state) {
    return (state.consecutiveDenials >= exports.DENIAL_LIMITS.maxConsecutive ||
        state.totalDenials >= exports.DENIAL_LIMITS.maxTotal);
}
