"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useShowFastIconHint = useShowFastIconHint;
const react_1 = require("react");
const HINT_DISPLAY_DURATION_MS = 5000;
let hasShownThisSession = false;
/**
 * Hook to manage the /fast hint display next to the fast icon.
 * Shows the hint for 5 seconds once per session.
 */
function useShowFastIconHint(showFastIcon) {
    const [showHint, setShowHint] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        if (hasShownThisSession || !showFastIcon) {
            return;
        }
        hasShownThisSession = true;
        setShowHint(true);
        const timer = setTimeout(setShowHint, HINT_DISPLAY_DURATION_MS, false);
        return () => {
            clearTimeout(timer);
            setShowHint(false);
        };
    }, [showFastIcon]);
    return showHint;
}
