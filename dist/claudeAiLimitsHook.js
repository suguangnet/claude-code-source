"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useClaudeAiLimits = useClaudeAiLimits;
const react_1 = require("react");
const claudeAiLimits_js_1 = require("./claudeAiLimits.js");
function useClaudeAiLimits() {
    const [limits, setLimits] = (0, react_1.useState)({ ...claudeAiLimits_js_1.currentLimits });
    (0, react_1.useEffect)(() => {
        const listener = (newLimits) => {
            setLimits({ ...newLimits });
        };
        claudeAiLimits_js_1.statusListeners.add(listener);
        return () => {
            claudeAiLimits_js_1.statusListeners.delete(listener);
        };
    }, []);
    return limits;
}
