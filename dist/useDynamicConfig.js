"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useDynamicConfig = useDynamicConfig;
const react_1 = __importDefault(require("react"));
const growthbook_js_1 = require("../services/analytics/growthbook.js");
/**
 * React hook for dynamic config values.
 * Returns the default value initially, then updates when the config is fetched.
 */
function useDynamicConfig(configName, defaultValue) {
    const [configValue, setConfigValue] = react_1.default.useState(defaultValue);
    react_1.default.useEffect(() => {
        if (process.env.NODE_ENV === 'test') {
            // Prevents a test hang when using this hook in tests
            return;
        }
        void (0, growthbook_js_1.getDynamicConfig_BLOCKS_ON_INIT)(configName, defaultValue).then(setConfigValue);
    }, [configName, defaultValue]);
    return configValue;
}
