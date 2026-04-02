"use strict";
// Creates a function that calls one function on the first call and another
// function on the second call within a certain timeout
Object.defineProperty(exports, "__esModule", { value: true });
exports.DOUBLE_PRESS_TIMEOUT_MS = void 0;
exports.useDoublePress = useDoublePress;
const react_1 = require("react");
exports.DOUBLE_PRESS_TIMEOUT_MS = 800;
function useDoublePress(setPending, onDoublePress, onFirstPress) {
    const lastPressRef = (0, react_1.useRef)(0);
    const timeoutRef = (0, react_1.useRef)(undefined);
    const clearTimeoutSafe = (0, react_1.useCallback)(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = undefined;
        }
    }, []);
    // Cleanup timeout on unmount
    (0, react_1.useEffect)(() => {
        return () => {
            clearTimeoutSafe();
        };
    }, [clearTimeoutSafe]);
    return (0, react_1.useCallback)(() => {
        const now = Date.now();
        const timeSinceLastPress = now - lastPressRef.current;
        const isDoublePress = timeSinceLastPress <= exports.DOUBLE_PRESS_TIMEOUT_MS &&
            timeoutRef.current !== undefined;
        if (isDoublePress) {
            // Double press detected
            clearTimeoutSafe();
            setPending(false);
            onDoublePress();
        }
        else {
            // First press
            onFirstPress?.();
            setPending(true);
            // Clear any existing timeout and set new one
            clearTimeoutSafe();
            timeoutRef.current = setTimeout((setPending, timeoutRef) => {
                setPending(false);
                timeoutRef.current = undefined;
            }, exports.DOUBLE_PRESS_TIMEOUT_MS, setPending, timeoutRef);
        }
        lastPressRef.current = now;
    }, [setPending, onDoublePress, onFirstPress, clearTimeoutSafe]);
}
