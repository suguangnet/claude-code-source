"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useFilePermissionDialog = useFilePermissionDialog;
const react_1 = require("react");
const AppState_js_1 = require("src/state/AppState.js");
const useKeybinding_js_1 = require("../../../keybindings/useKeybinding.js");
const index_js_1 = require("../../../services/analytics/index.js");
const metadata_js_1 = require("../../../services/analytics/metadata.js");
const permissionOptions_js_1 = require("./permissionOptions.js");
const usePermissionHandler_js_1 = require("./usePermissionHandler.js");
/**
 * Hook for handling file permission dialogs with common logic
 */
function useFilePermissionDialog({ filePath, completionType, languageName, toolUseConfirm, onDone, onReject, parseInput, operationType = 'write', }) {
    const toolPermissionContext = (0, AppState_js_1.useAppState)(s => s.toolPermissionContext);
    const [acceptFeedback, setAcceptFeedback] = (0, react_1.useState)('');
    const [rejectFeedback, setRejectFeedback] = (0, react_1.useState)('');
    const [focusedOption, setFocusedOption] = (0, react_1.useState)('yes');
    const [yesInputMode, setYesInputMode] = (0, react_1.useState)(false);
    const [noInputMode, setNoInputMode] = (0, react_1.useState)(false);
    // Track whether user ever entered feedback mode (persists after collapse)
    const [yesFeedbackModeEntered, setYesFeedbackModeEntered] = (0, react_1.useState)(false);
    const [noFeedbackModeEntered, setNoFeedbackModeEntered] = (0, react_1.useState)(false);
    // Generate options based on context
    const options = (0, react_1.useMemo)(() => (0, permissionOptions_js_1.getFilePermissionOptions)({
        filePath,
        toolPermissionContext,
        operationType,
        onRejectFeedbackChange: setRejectFeedback,
        onAcceptFeedbackChange: setAcceptFeedback,
        yesInputMode,
        noInputMode,
    }), [filePath, toolPermissionContext, operationType, yesInputMode, noInputMode]);
    // Handle option selection using shared handlers
    const onChange = (0, react_1.useCallback)((option, input, feedback) => {
        const params = {
            messageId: toolUseConfirm.assistantMessage.message.id,
            path: filePath,
            toolUseConfirm,
            toolPermissionContext,
            onDone,
            onReject,
            completionType,
            languageName,
            operationType,
        };
        // Override the input in toolUseConfirm to pass the parsed input
        const originalOnAllow = toolUseConfirm.onAllow;
        toolUseConfirm.onAllow = (_input, permissionUpdates, feedback) => {
            originalOnAllow(input, permissionUpdates, feedback);
        };
        const handler = usePermissionHandler_js_1.PERMISSION_HANDLERS[option.type];
        handler(params, {
            feedback,
            hasFeedback: !!feedback,
            enteredFeedbackMode: option.type === 'accept-once'
                ? yesFeedbackModeEntered
                : noFeedbackModeEntered,
            scope: option.type === 'accept-session' ? option.scope : undefined,
        });
    }, [
        filePath,
        completionType,
        languageName,
        toolUseConfirm,
        toolPermissionContext,
        onDone,
        onReject,
        operationType,
        yesFeedbackModeEntered,
        noFeedbackModeEntered,
    ]);
    // Handler for confirm:cycleMode - select accept-session option
    const handleCycleMode = (0, react_1.useCallback)(() => {
        const sessionOption = options.find(o => o.option.type === 'accept-session');
        if (sessionOption) {
            const parsedInput = parseInput(toolUseConfirm.input);
            onChange(sessionOption.option, parsedInput);
        }
    }, [options, parseInput, toolUseConfirm.input, onChange]);
    // Register keyboard shortcut handler via keybindings system
    (0, useKeybinding_js_1.useKeybindings)({ 'confirm:cycleMode': handleCycleMode }, { context: 'Confirmation' });
    // Wrap setFocusedOption and reset input mode when navigating away
    const handleFocusedOptionChange = (0, react_1.useCallback)((value) => {
        // Reset input mode when navigating away, but only if no text typed
        if (value !== 'yes' && yesInputMode && !acceptFeedback.trim()) {
            setYesInputMode(false);
        }
        if (value !== 'no' && noInputMode && !rejectFeedback.trim()) {
            setNoInputMode(false);
        }
        setFocusedOption(value);
    }, [yesInputMode, noInputMode, acceptFeedback, rejectFeedback]);
    // Handle Tab key toggling input mode for Yes/No options
    const handleInputModeToggle = (0, react_1.useCallback)((value) => {
        const analyticsProps = {
            toolName: (0, metadata_js_1.sanitizeToolNameForAnalytics)(toolUseConfirm.tool.name),
            isMcp: toolUseConfirm.tool.isMcp ?? false,
        };
        if (value === 'yes') {
            if (yesInputMode) {
                setYesInputMode(false);
                (0, index_js_1.logEvent)('tengu_accept_feedback_mode_collapsed', analyticsProps);
            }
            else {
                setYesInputMode(true);
                setYesFeedbackModeEntered(true);
                (0, index_js_1.logEvent)('tengu_accept_feedback_mode_entered', analyticsProps);
            }
        }
        else if (value === 'no') {
            if (noInputMode) {
                setNoInputMode(false);
                (0, index_js_1.logEvent)('tengu_reject_feedback_mode_collapsed', analyticsProps);
            }
            else {
                setNoInputMode(true);
                setNoFeedbackModeEntered(true);
                (0, index_js_1.logEvent)('tengu_reject_feedback_mode_entered', analyticsProps);
            }
        }
    }, [yesInputMode, noInputMode, toolUseConfirm]);
    return {
        options,
        onChange,
        acceptFeedback,
        rejectFeedback,
        focusedOption,
        setFocusedOption: handleFocusedOptionChange,
        handleInputModeToggle,
        yesInputMode,
        noInputMode,
    };
}
