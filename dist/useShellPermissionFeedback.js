"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useShellPermissionFeedback = useShellPermissionFeedback;
const react_1 = require("react");
const index_js_1 = require("../../services/analytics/index.js");
const metadata_js_1 = require("../../services/analytics/metadata.js");
const AppState_js_1 = require("../../state/AppState.js");
const utils_js_1 = require("./utils.js");
/**
 * Shared feedback-mode state + handlers for shell permission dialogs (Bash,
 * PowerShell). Encapsulates the yes/no input-mode toggle, feedback text state,
 * focus tracking, and reject handling.
 */
function useShellPermissionFeedback({ toolUseConfirm, onDone, onReject, explainerVisible, }) {
    const setAppState = (0, AppState_js_1.useSetAppState)();
    const [rejectFeedback, setRejectFeedback] = (0, react_1.useState)('');
    const [acceptFeedback, setAcceptFeedback] = (0, react_1.useState)('');
    const [yesInputMode, setYesInputMode] = (0, react_1.useState)(false);
    const [noInputMode, setNoInputMode] = (0, react_1.useState)(false);
    const [focusedOption, setFocusedOption] = (0, react_1.useState)('yes');
    // Track whether user ever entered feedback mode (persists after collapse)
    const [yesFeedbackModeEntered, setYesFeedbackModeEntered] = (0, react_1.useState)(false);
    const [noFeedbackModeEntered, setNoFeedbackModeEntered] = (0, react_1.useState)(false);
    // Handle Tab key toggling input mode for Yes/No options
    function handleInputModeToggle(option) {
        // Notify that user is interacting with the dialog
        toolUseConfirm.onUserInteraction();
        const analyticsProps = {
            toolName: (0, metadata_js_1.sanitizeToolNameForAnalytics)(toolUseConfirm.tool.name),
            isMcp: toolUseConfirm.tool.isMcp ?? false,
        };
        if (option === 'yes') {
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
        else if (option === 'no') {
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
    }
    function handleReject(feedback) {
        const trimmedFeedback = feedback?.trim();
        const hasFeedback = !!trimmedFeedback;
        // Log escape if no feedback was provided (user pressed ESC)
        if (!hasFeedback) {
            (0, index_js_1.logEvent)('tengu_permission_request_escape', {
                explainer_visible: explainerVisible,
            });
            // Increment escape count for attribution tracking
            setAppState(prev => ({
                ...prev,
                attribution: {
                    ...prev.attribution,
                    escapeCount: prev.attribution.escapeCount + 1,
                },
            }));
        }
        (0, utils_js_1.logUnaryPermissionEvent)('tool_use_single', toolUseConfirm, 'reject', hasFeedback);
        if (trimmedFeedback) {
            toolUseConfirm.onReject(trimmedFeedback);
        }
        else {
            toolUseConfirm.onReject();
        }
        onReject();
        onDone();
    }
    function handleFocus(value) {
        // Notify that user is interacting with the dialog (only if focus changed)
        // This prevents triggering on the initial mount/render
        if (value !== focusedOption) {
            toolUseConfirm.onUserInteraction();
        }
        // Reset input mode when navigating away, but only if no text typed
        if (value !== 'yes' && yesInputMode && !acceptFeedback.trim()) {
            setYesInputMode(false);
        }
        if (value !== 'no' && noInputMode && !rejectFeedback.trim()) {
            setNoInputMode(false);
        }
        setFocusedOption(value);
    }
    return {
        yesInputMode,
        noInputMode,
        yesFeedbackModeEntered,
        noFeedbackModeEntered,
        acceptFeedback,
        rejectFeedback,
        setAcceptFeedback,
        setRejectFeedback,
        focusedOption,
        handleInputModeToggle,
        handleReject,
        handleFocus,
    };
}
