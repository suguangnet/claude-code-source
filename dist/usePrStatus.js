"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePrStatus = usePrStatus;
const react_1 = require("react");
const state_js_1 = require("../bootstrap/state.js");
const ghPrStatus_js_1 = require("../utils/ghPrStatus.js");
const POLL_INTERVAL_MS = 60000;
const SLOW_GH_THRESHOLD_MS = 4000;
const IDLE_STOP_MS = 60 * 60000; // stop polling after 60 min idle
const INITIAL_STATE = {
    number: null,
    url: null,
    reviewState: null,
    lastUpdated: 0,
};
/**
 * Polls PR review status every 60s while the session is active.
 * When no interaction is detected for 60 minutes, the loop stops — no
 * timers remain. React re-runs the effect when isLoading changes
 * (turn starts/ends), restarting the loop. Effect setup schedules
 * the next poll relative to the last fetch time so turn boundaries
 * don't spawn `gh` more than once per interval. Disables permanently
 * if a fetch exceeds 4s.
 *
 * Pass `enabled: false` to skip polling entirely (hook still must be
 * called unconditionally to satisfy the rules of hooks).
 */
function usePrStatus(isLoading, enabled = true) {
    const [prStatus, setPrStatus] = (0, react_1.useState)(INITIAL_STATE);
    const timeoutRef = (0, react_1.useRef)(null);
    const disabledRef = (0, react_1.useRef)(false);
    const lastFetchRef = (0, react_1.useRef)(0);
    (0, react_1.useEffect)(() => {
        if (!enabled)
            return;
        if (disabledRef.current)
            return;
        let cancelled = false;
        let lastSeenInteractionTime = -1;
        let lastActivityTimestamp = Date.now();
        async function poll() {
            if (cancelled)
                return;
            const currentInteractionTime = (0, state_js_1.getLastInteractionTime)();
            if (lastSeenInteractionTime !== currentInteractionTime) {
                lastSeenInteractionTime = currentInteractionTime;
                lastActivityTimestamp = Date.now();
            }
            else if (Date.now() - lastActivityTimestamp >= IDLE_STOP_MS) {
                return;
            }
            const start = Date.now();
            const result = await (0, ghPrStatus_js_1.fetchPrStatus)();
            if (cancelled)
                return;
            lastFetchRef.current = start;
            setPrStatus(prev => {
                const newNumber = result?.number ?? null;
                const newReviewState = result?.reviewState ?? null;
                if (prev.number === newNumber && prev.reviewState === newReviewState) {
                    return prev;
                }
                return {
                    number: newNumber,
                    url: result?.url ?? null,
                    reviewState: newReviewState,
                    lastUpdated: Date.now(),
                };
            });
            if (Date.now() - start > SLOW_GH_THRESHOLD_MS) {
                disabledRef.current = true;
                return;
            }
            if (!cancelled) {
                timeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS);
            }
        }
        const elapsed = Date.now() - lastFetchRef.current;
        if (elapsed >= POLL_INTERVAL_MS) {
            void poll();
        }
        else {
            timeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS - elapsed);
        }
        return () => {
            cancelled = true;
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };
    }, [isLoading, enabled]);
    return prStatus;
}
