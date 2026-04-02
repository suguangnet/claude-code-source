"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTimeout = useTimeout;
const react_1 = require("react");
function useTimeout(delay, resetTrigger) {
    const [isElapsed, setIsElapsed] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        setIsElapsed(false);
        const timer = setTimeout(setIsElapsed, delay, true);
        return () => clearTimeout(timer);
    }, [delay, resetTrigger]);
    return isElapsed;
}
