"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSettingsChange = useSettingsChange;
const react_1 = require("react");
const changeDetector_js_1 = require("../utils/settings/changeDetector.js");
const settings_js_1 = require("../utils/settings/settings.js");
function useSettingsChange(onChange) {
    const handleChange = (0, react_1.useCallback)((source) => {
        // Cache is already reset by the notifier (changeDetector.fanOut) —
        // resetting here caused N-way thrashing with N subscribers: each
        // cleared the cache, re-read from disk, then the next cleared again.
        const newSettings = (0, settings_js_1.getSettings_DEPRECATED)();
        onChange(source, newSettings);
    }, [onChange]);
    (0, react_1.useEffect)(() => changeDetector_js_1.settingsChangeDetector.subscribe(handleChange), [handleChange]);
}
