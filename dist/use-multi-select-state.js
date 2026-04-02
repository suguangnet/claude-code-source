"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useMultiSelectState = useMultiSelectState;
const react_1 = require("react");
const util_1 = require("util");
const overlayContext_js_1 = require("../../context/overlayContext.js");
// eslint-disable-next-line custom-rules/prefer-use-keybindings -- raw space/arrow multiselect input
const ink_js_1 = require("../../ink.js");
const stringUtils_js_1 = require("../../utils/stringUtils.js");
const use_select_navigation_js_1 = require("./use-select-navigation.js");
function useMultiSelectState({ isDisabled = false, visibleOptionCount = 5, options, defaultValue = [], onChange, onCancel, onFocus, focusValue, submitButtonText, onSubmit, onDownFromLastItem, onUpFromFirstItem, initialFocusLast, hideIndexes = false, }) {
    const [selectedValues, setSelectedValues] = (0, react_1.useState)(defaultValue);
    const [isSubmitFocused, setIsSubmitFocused] = (0, react_1.useState)(false);
    // Reset selectedValues when options change (e.g. async-loaded data changes
    // defaultValue after mount). Mirrors the reset pattern in use-select-navigation.ts
    // and the deleted ui/useMultiSelectState.ts — without this, MCPServerDesktopImportDialog
    // keeps colliding servers checked after getAllMcpConfigs() resolves.
    const [lastOptions, setLastOptions] = (0, react_1.useState)(options);
    if (options !== lastOptions && !(0, util_1.isDeepStrictEqual)(options, lastOptions)) {
        setSelectedValues(defaultValue);
        setLastOptions(options);
    }
    // State for input type options
    const [inputValues, setInputValues] = (0, react_1.useState)(() => {
        const initialMap = new Map();
        options.forEach(option => {
            if (option.type === 'input' && option.initialValue) {
                initialMap.set(option.value, option.initialValue);
            }
        });
        return initialMap;
    });
    const updateSelectedValues = (0, react_1.useCallback)((values) => {
        const newValues = typeof values === 'function' ? values(selectedValues) : values;
        setSelectedValues(newValues);
        onChange?.(newValues);
    }, [selectedValues, onChange]);
    const navigation = (0, use_select_navigation_js_1.useSelectNavigation)({
        visibleOptionCount,
        options,
        initialFocusValue: initialFocusLast
            ? options[options.length - 1]?.value
            : undefined,
        onFocus,
        focusValue,
    });
    // Automatically register as an overlay.
    // This ensures CancelRequestHandler won't intercept Escape when the multi-select is active.
    (0, overlayContext_js_1.useRegisterOverlay)('multi-select');
    const updateInputValue = (0, react_1.useCallback)((value, inputValue) => {
        setInputValues(prev => {
            const next = new Map(prev);
            next.set(value, inputValue);
            return next;
        });
        // Find the option and call its onChange
        const option = options.find(opt => opt.value === value);
        if (option && option.type === 'input') {
            option.onChange(inputValue);
        }
        // Update selected values to include/exclude based on input
        updateSelectedValues(prev => {
            if (inputValue) {
                if (!prev.includes(value)) {
                    return [...prev, value];
                }
                return prev;
            }
            else {
                return prev.filter(v => v !== value);
            }
        });
    }, [options, updateSelectedValues]);
    // Handle all keyboard input
    (0, ink_js_1.useInput)((input, key, event) => {
        const normalizedInput = (0, stringUtils_js_1.normalizeFullWidthDigits)(input);
        const focusedOption = options.find(opt => opt.value === navigation.focusedValue);
        const isInInput = focusedOption?.type === 'input';
        // When in input field, only allow navigation keys
        if (isInInput) {
            const isAllowedKey = key.upArrow ||
                key.downArrow ||
                key.escape ||
                key.tab ||
                key.return ||
                (key.ctrl && (input === 'n' || input === 'p' || key.return));
            if (!isAllowedKey)
                return;
        }
        const lastOptionValue = options[options.length - 1]?.value;
        // Handle Tab to move forward
        if (key.tab && !key.shift) {
            if (submitButtonText &&
                onSubmit &&
                navigation.focusedValue === lastOptionValue &&
                !isSubmitFocused) {
                setIsSubmitFocused(true);
            }
            else if (!isSubmitFocused) {
                navigation.focusNextOption();
            }
            return;
        }
        // Handle Shift+Tab to move backward
        if (key.tab && key.shift) {
            if (submitButtonText && onSubmit && isSubmitFocused) {
                setIsSubmitFocused(false);
                navigation.focusOption(lastOptionValue);
            }
            else {
                navigation.focusPreviousOption();
            }
            return;
        }
        // Handle arrow down / Ctrl+N / j
        if (key.downArrow ||
            (key.ctrl && input === 'n') ||
            (!key.ctrl && !key.shift && input === 'j')) {
            if (isSubmitFocused && onDownFromLastItem) {
                onDownFromLastItem();
            }
            else if (submitButtonText &&
                onSubmit &&
                navigation.focusedValue === lastOptionValue &&
                !isSubmitFocused) {
                setIsSubmitFocused(true);
            }
            else if (!submitButtonText &&
                onDownFromLastItem &&
                navigation.focusedValue === lastOptionValue) {
                // No submit button — exit from the last option
                onDownFromLastItem();
            }
            else if (!isSubmitFocused) {
                navigation.focusNextOption();
            }
            return;
        }
        // Handle arrow up / Ctrl+P / k
        if (key.upArrow ||
            (key.ctrl && input === 'p') ||
            (!key.ctrl && !key.shift && input === 'k')) {
            if (submitButtonText && onSubmit && isSubmitFocused) {
                setIsSubmitFocused(false);
                navigation.focusOption(lastOptionValue);
            }
            else if (onUpFromFirstItem &&
                navigation.focusedValue === options[0]?.value) {
                onUpFromFirstItem();
            }
            else {
                navigation.focusPreviousOption();
            }
            return;
        }
        // Handle page navigation
        if (key.pageDown) {
            navigation.focusNextPage();
            return;
        }
        if (key.pageUp) {
            navigation.focusPreviousPage();
            return;
        }
        // Handle Enter or Space for selection/submit
        if (key.return || (0, stringUtils_js_1.normalizeFullWidthSpace)(input) === ' ') {
            // Ctrl+Enter from input field submits
            if (key.ctrl && key.return && isInInput && onSubmit) {
                onSubmit(selectedValues);
                return;
            }
            // Enter on submit button submits
            if (isSubmitFocused && onSubmit) {
                onSubmit(selectedValues);
                return;
            }
            // No submit button: Enter submits directly, Space still toggles
            if (key.return && !submitButtonText && onSubmit) {
                onSubmit(selectedValues);
                return;
            }
            // Enter or Space toggles selection (including for input fields)
            if (navigation.focusedValue !== undefined) {
                const newValues = selectedValues.includes(navigation.focusedValue)
                    ? selectedValues.filter(v => v !== navigation.focusedValue)
                    : [...selectedValues, navigation.focusedValue];
                updateSelectedValues(newValues);
            }
            return;
        }
        // Handle numeric keys (1-9) for direct selection
        if (!hideIndexes && /^[0-9]+$/.test(normalizedInput)) {
            const index = parseInt(normalizedInput) - 1;
            if (index >= 0 && index < options.length) {
                const value = options[index].value;
                const newValues = selectedValues.includes(value)
                    ? selectedValues.filter(v => v !== value)
                    : [...selectedValues, value];
                updateSelectedValues(newValues);
            }
            return;
        }
        // Handle Escape
        if (key.escape) {
            onCancel();
            event.stopImmediatePropagation();
        }
    }, { isActive: !isDisabled });
    return {
        ...navigation,
        selectedValues,
        inputValues,
        isSubmitFocused,
        updateInputValue,
        onCancel,
    };
}
