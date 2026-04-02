"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAutoModeUnavailableNotification = useAutoModeUnavailableNotification;
const bun_bundle_1 = require("bun:bundle");
const react_1 = require("react");
const notifications_js_1 = require("src/context/notifications.js");
const state_js_1 = require("../../bootstrap/state.js");
const AppState_js_1 = require("../../state/AppState.js");
const permissionSetup_js_1 = require("../../utils/permissions/permissionSetup.js");
const settings_js_1 = require("../../utils/settings/settings.js");
/**
 * Shows a one-shot notification when the shift-tab carousel wraps past where
 * auto mode would have been. Covers all reasons (settings, circuit-breaker,
 * org-allowlist). The startup case (defaultMode: auto silently downgraded) is
 * handled by verifyAutoModeGateAccess → checkAndDisableAutoModeIfNeeded.
 */
function useAutoModeUnavailableNotification() {
    const { addNotification } = (0, notifications_js_1.useNotifications)();
    const mode = (0, AppState_js_1.useAppState)(s => s.toolPermissionContext.mode);
    const isAutoModeAvailable = (0, AppState_js_1.useAppState)(s => s.toolPermissionContext.isAutoModeAvailable);
    const shownRef = (0, react_1.useRef)(false);
    const prevModeRef = (0, react_1.useRef)(mode);
    (0, react_1.useEffect)(() => {
        const prevMode = prevModeRef.current;
        prevModeRef.current = mode;
        if (!(0, bun_bundle_1.feature)('TRANSCRIPT_CLASSIFIER'))
            return;
        if ((0, state_js_1.getIsRemoteMode)())
            return;
        if (shownRef.current)
            return;
        const wrappedPastAutoSlot = mode === 'default' &&
            prevMode !== 'default' &&
            prevMode !== 'auto' &&
            !isAutoModeAvailable &&
            (0, settings_js_1.hasAutoModeOptIn)();
        if (!wrappedPastAutoSlot)
            return;
        const reason = (0, permissionSetup_js_1.getAutoModeUnavailableReason)();
        if (!reason)
            return;
        shownRef.current = true;
        addNotification({
            key: 'auto-mode-unavailable',
            text: (0, permissionSetup_js_1.getAutoModeUnavailableNotification)(reason),
            color: 'warning',
            priority: 'medium',
        });
    }, [mode, isAutoModeAvailable, addNotification]);
}
