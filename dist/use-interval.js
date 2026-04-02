"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAnimationTimer = useAnimationTimer;
exports.useInterval = useInterval;
const react_1 = require("react");
const ClockContext_js_1 = require("../components/ClockContext.js");
/**
 * Returns the clock time, updating at the given interval.
 * Subscribes as non-keepAlive — won't keep the clock alive on its own,
 * but updates whenever a keepAlive subscriber (e.g. the spinner)
 * is driving the clock.
 *
 * Use this to drive pure time-based computations (shimmer position,
 * frame index) from the shared clock.
 */
function useAnimationTimer(intervalMs) {
    const clock = (0, react_1.useContext)(ClockContext_js_1.ClockContext);
    const [time, setTime] = (0, react_1.useState)(() => clock?.now() ?? 0);
    (0, react_1.useEffect)(() => {
        if (!clock)
            return;
        let lastUpdate = clock.now();
        const onChange = () => {
            const now = clock.now();
            if (now - lastUpdate >= intervalMs) {
                lastUpdate = now;
                setTime(now);
            }
        };
        return clock.subscribe(onChange, false);
    }, [clock, intervalMs]);
    return time;
}
/**
 * Interval hook backed by the shared Clock.
 *
 * Unlike `useInterval` from `usehooks-ts` (which creates its own setInterval),
 * this piggybacks on the single shared clock so all timers consolidate into
 * one wake-up. Pass `null` for intervalMs to pause.
 */
function useInterval(callback, intervalMs) {
    const callbackRef = (0, react_1.useRef)(callback);
    callbackRef.current = callback;
    const clock = (0, react_1.useContext)(ClockContext_js_1.ClockContext);
    (0, react_1.useEffect)(() => {
        if (!clock || intervalMs === null)
            return;
        let lastUpdate = clock.now();
        const onChange = () => {
            const now = clock.now();
            if (now - lastUpdate >= intervalMs) {
                lastUpdate = now;
                callbackRef.current();
            }
        };
        return clock.subscribe(onChange, false);
    }, [clock, intervalMs]);
}
