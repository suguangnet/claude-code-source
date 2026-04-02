"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useBlink = useBlink;
const ink_js_1 = require("../ink.js");
const BLINK_INTERVAL_MS = 600;
/**
 * Hook for synchronized blinking animations that pause when offscreen.
 *
 * Returns a ref to attach to the animated element and the current blink state.
 * All instances blink together because they derive state from the same
 * animation clock. The clock only runs when at least one subscriber is visible.
 * Pauses when the terminal is blurred.
 *
 * @param enabled - Whether blinking is active
 * @returns [ref, isVisible] - Ref to attach to element, true when visible in blink cycle
 *
 * @example
 * function BlinkingDot({ shouldAnimate }) {
 *   const [ref, isVisible] = useBlink(shouldAnimate)
 *   return <Box ref={ref}>{isVisible ? '●' : ' '}</Box>
 * }
 */
function useBlink(enabled, intervalMs = BLINK_INTERVAL_MS) {
    const focused = (0, ink_js_1.useTerminalFocus)();
    const [ref, time] = (0, ink_js_1.useAnimationFrame)(enabled && focused ? intervalMs : null);
    if (!enabled || !focused)
        return [ref, true];
    // Derive blink state from time - all instances see the same time so they sync
    const isVisible = Math.floor(time / intervalMs) % 2 === 0;
    return [ref, isVisible];
}
