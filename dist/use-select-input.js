"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSelectInput = void 0;
const react_1 = require("react");
const overlayContext_js_1 = require("../../context/overlayContext.js");
const ink_js_1 = require("../../ink.js");
const useKeybinding_js_1 = require("../../keybindings/useKeybinding.js");
const stringUtils_js_1 = require("../../utils/stringUtils.js");
const useSelectInput = ({ isDisabled = false, disableSelection = false, state, options, isMultiSelect = false, onUpFromFirstItem, onDownFromLastItem, onInputModeToggle, inputValues, imagesSelected = false, onEnterImageSelection, }) => {
    // Automatically register as an overlay when onCancel is provided.
    // This ensures CancelRequestHandler won't intercept Escape when the select is active.
    (0, overlayContext_js_1.useRegisterOverlay)('select', !!state.onCancel);
    // Determine if the focused option is an input type
    const isInInput = (0, react_1.useMemo)(() => {
        const focusedOption = options.find(opt => opt.value === state.focusedValue);
        return focusedOption?.type === 'input';
    }, [options, state.focusedValue]);
    // Core navigation via keybindings (up/down/enter/escape)
    // When in input mode, exclude navigation/accept keybindings so that
    // j/k/enter pass through to the TextInput instead of being intercepted.
    const keybindingHandlers = (0, react_1.useMemo)(() => {
        const handlers = {};
        if (!isInInput) {
            handlers['select:next'] = () => {
                if (onDownFromLastItem) {
                    const lastOption = options[options.length - 1];
                    if (lastOption && state.focusedValue === lastOption.value) {
                        onDownFromLastItem();
                        return;
                    }
                }
                state.focusNextOption();
            };
            handlers['select:previous'] = () => {
                if (onUpFromFirstItem && state.visibleFromIndex === 0) {
                    const firstOption = options[0];
                    if (firstOption && state.focusedValue === firstOption.value) {
                        onUpFromFirstItem();
                        return;
                    }
                }
                state.focusPreviousOption();
            };
            handlers['select:accept'] = () => {
                if (disableSelection === true)
                    return;
                if (state.focusedValue === undefined)
                    return;
                const focusedOption = options.find(opt => opt.value === state.focusedValue);
                if (focusedOption?.disabled === true)
                    return;
                state.selectFocusedOption?.();
                state.onChange?.(state.focusedValue);
            };
        }
        if (state.onCancel) {
            handlers['select:cancel'] = () => {
                state.onCancel();
            };
        }
        return handlers;
    }, [
        options,
        state,
        onDownFromLastItem,
        onUpFromFirstItem,
        isInInput,
        disableSelection,
    ]);
    (0, useKeybinding_js_1.useKeybindings)(keybindingHandlers, {
        context: 'Select',
        isActive: !isDisabled,
    });
    // Remaining keys that stay as useInput: number keys, pageUp/pageDown, tab, space,
    // and arrow key navigation when in input mode
    (0, ink_js_1.useInput)((input, key, event) => {
        const normalizedInput = (0, stringUtils_js_1.normalizeFullWidthDigits)(input);
        const focusedOption = options.find(opt => opt.value === state.focusedValue);
        const currentIsInInput = focusedOption?.type === 'input';
        // Handle Tab key for input mode toggling
        if (key.tab && onInputModeToggle && state.focusedValue !== undefined) {
            onInputModeToggle(state.focusedValue);
            return;
        }
        if (currentIsInInput) {
            // When in image selection mode, suppress all input handling so
            // Attachments keybindings can handle navigation/deletion instead
            if (imagesSelected)
                return;
            // DOWN arrow enters image selection mode if images exist
            if (key.downArrow && onEnterImageSelection?.()) {
                event.stopImmediatePropagation();
                return;
            }
            // Arrow keys still navigate the select even while in input mode
            if (key.downArrow || (key.ctrl && input === 'n')) {
                if (onDownFromLastItem) {
                    const lastOption = options[options.length - 1];
                    if (lastOption && state.focusedValue === lastOption.value) {
                        onDownFromLastItem();
                        event.stopImmediatePropagation();
                        return;
                    }
                }
                state.focusNextOption();
                event.stopImmediatePropagation();
                return;
            }
            if (key.upArrow || (key.ctrl && input === 'p')) {
                if (onUpFromFirstItem && state.visibleFromIndex === 0) {
                    const firstOption = options[0];
                    if (firstOption && state.focusedValue === firstOption.value) {
                        onUpFromFirstItem();
                        event.stopImmediatePropagation();
                        return;
                    }
                }
                state.focusPreviousOption();
                event.stopImmediatePropagation();
                return;
            }
            // All other keys (including digits) pass through to TextInput.
            // Digits should type literally into the input rather than select
            // options — the user has focused a text field and expects typing
            // to insert characters, not jump to a different option.
            return;
        }
        if (key.pageDown) {
            state.focusNextPage();
        }
        if (key.pageUp) {
            state.focusPreviousPage();
        }
        if (disableSelection !== true) {
            // Space for multi-select toggle
            if (isMultiSelect &&
                (0, stringUtils_js_1.normalizeFullWidthSpace)(input) === ' ' &&
                state.focusedValue !== undefined) {
                const isFocusedOptionDisabled = focusedOption?.disabled === true;
                if (!isFocusedOptionDisabled) {
                    state.selectFocusedOption?.();
                    state.onChange?.(state.focusedValue);
                }
            }
            if (disableSelection !== 'numeric' &&
                /^[0-9]+$/.test(normalizedInput)) {
                const index = parseInt(normalizedInput) - 1;
                if (index >= 0 && index < state.options.length) {
                    const selectedOption = state.options[index];
                    if (selectedOption.disabled === true) {
                        return;
                    }
                    if (selectedOption.type === 'input') {
                        const currentValue = inputValues?.get(selectedOption.value) ?? '';
                        if (currentValue.trim()) {
                            // Pre-filled input: auto-submit (user can Tab to edit instead)
                            state.onChange?.(selectedOption.value);
                            return;
                        }
                        if (selectedOption.allowEmptySubmitToCancel) {
                            state.onChange?.(selectedOption.value);
                            return;
                        }
                        state.focusOption(selectedOption.value);
                        return;
                    }
                    state.onChange?.(selectedOption.value);
                    return;
                }
            }
        }
    }, { isActive: !isDisabled });
};
exports.useSelectInput = useSelectInput;
