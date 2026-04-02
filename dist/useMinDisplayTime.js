"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useMinDisplayTime = useMinDisplayTime;
const react_1 = require("react");
/**
 * Throttles a value so each distinct value stays visible for at least `minMs`.
 * Prevents fast-cycling progress text from flickering past before it's readable.
 *
 * Unlike debounce (wait for quiet) or throttle (limit rate), this guarantees
 * each value gets its minimum screen time before being replaced.
 */
function useMinDisplayTime(value, minMs) {
    const [displayed, setDisplayed] = (0, react_1.useState)(value);
    const lastShownAtRef = (0, react_1.useRef)(0);
    (0, react_1.useEffect)(() => {
        const elapsed = Date.now() - lastShownAtRef.current;
        if (elapsed >= minMs) {
            lastShownAtRef.current = Date.now();
            setDisplayed(value);
            return;
        }
        const timer = setTimeout((shownAtRef, setFn, v) => {
            shownAtRef.current = Date.now();
            setFn(v);
        }, minMs - elapsed, lastShownAtRef, setDisplayed, value);
        return () => clearTimeout(timer);
    }, [value, minMs]);
    return displayed;
}
