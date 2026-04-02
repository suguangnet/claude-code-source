"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useShimmerAnimation = useShimmerAnimation;
const react_1 = require("react");
const stringWidth_js_1 = require("../../ink/stringWidth.js");
const ink_js_1 = require("../../ink.js");
function useShimmerAnimation(mode, message, isStalled) {
    const glimmerSpeed = mode === 'requesting' ? 50 : 200;
    // Pass null when stalled to unsubscribe from the clock — otherwise the
    // setInterval keeps firing at 20fps even when the shimmer isn't visible.
    // Notably, if the caller never attaches `ref` (e.g. conditional JSX),
    // useTerminalViewport stays at its initial isVisible:true and the
    // viewport-pause never kicks in, so this is the only stop mechanism.
    const [ref, time] = (0, ink_js_1.useAnimationFrame)(isStalled ? null : glimmerSpeed);
    const messageWidth = (0, react_1.useMemo)(() => (0, stringWidth_js_1.stringWidth)(message), [message]);
    if (isStalled) {
        return [ref, -100];
    }
    const cyclePosition = Math.floor(time / glimmerSpeed);
    const cycleLength = messageWidth + 20;
    if (mode === 'requesting') {
        return [ref, (cyclePosition % cycleLength) - 10];
    }
    return [ref, messageWidth + 10 - (cyclePosition % cycleLength)];
}
