"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSelectState = useSelectState;
const react_1 = require("react");
const use_select_navigation_js_1 = require("./use-select-navigation.js");
function useSelectState({ visibleOptionCount = 5, options, defaultValue, onChange, onCancel, onFocus, focusValue, }) {
    const [value, setValue] = (0, react_1.useState)(defaultValue);
    const navigation = (0, use_select_navigation_js_1.useSelectNavigation)({
        visibleOptionCount,
        options,
        initialFocusValue: undefined,
        onFocus,
        focusValue,
    });
    const selectFocusedOption = (0, react_1.useCallback)(() => {
        setValue(navigation.focusedValue);
    }, [navigation.focusedValue]);
    return {
        ...navigation,
        value,
        selectFocusedOption,
        onChange,
        onCancel,
    };
}
