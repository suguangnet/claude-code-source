"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAndDisableBypassPermissionsIfNeeded = checkAndDisableBypassPermissionsIfNeeded;
exports.resetBypassPermissionsCheck = resetBypassPermissionsCheck;
exports.useKickOffCheckAndDisableBypassPermissionsIfNeeded = useKickOffCheckAndDisableBypassPermissionsIfNeeded;
exports.checkAndDisableAutoModeIfNeeded = checkAndDisableAutoModeIfNeeded;
exports.resetAutoModeGateCheck = resetAutoModeGateCheck;
exports.useKickOffCheckAndDisableAutoModeIfNeeded = useKickOffCheckAndDisableAutoModeIfNeeded;
const bun_bundle_1 = require("bun:bundle");
const react_1 = require("react");
const AppState_js_1 = require("src/state/AppState.js");
const state_js_1 = require("../../bootstrap/state.js");
const permissionSetup_js_1 = require("./permissionSetup.js");
let bypassPermissionsCheckRan = false;
async function checkAndDisableBypassPermissionsIfNeeded(toolPermissionContext, setAppState) {
    // Check if bypassPermissions should be disabled based on Statsig gate
    // Do this only once, before the first query, to ensure we have the latest gate value
    if (bypassPermissionsCheckRan) {
        return;
    }
    bypassPermissionsCheckRan = true;
    if (!toolPermissionContext.isBypassPermissionsModeAvailable) {
        return;
    }
    const shouldDisable = await (0, permissionSetup_js_1.shouldDisableBypassPermissions)();
    if (!shouldDisable) {
        return;
    }
    setAppState(prev => {
        return {
            ...prev,
            toolPermissionContext: (0, permissionSetup_js_1.createDisabledBypassPermissionsContext)(prev.toolPermissionContext),
        };
    });
}
/**
 * Reset the run-once flag for checkAndDisableBypassPermissionsIfNeeded.
 * Call this after /login so the gate check re-runs with the new org.
 */
function resetBypassPermissionsCheck() {
    bypassPermissionsCheckRan = false;
}
function useKickOffCheckAndDisableBypassPermissionsIfNeeded() {
    const toolPermissionContext = (0, AppState_js_1.useAppState)(s => s.toolPermissionContext);
    const setAppState = (0, AppState_js_1.useSetAppState)();
    // Run once, when the component mounts
    (0, react_1.useEffect)(() => {
        if ((0, state_js_1.getIsRemoteMode)())
            return;
        void checkAndDisableBypassPermissionsIfNeeded(toolPermissionContext, setAppState);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}
let autoModeCheckRan = false;
async function checkAndDisableAutoModeIfNeeded(toolPermissionContext, setAppState, fastMode) {
    if ((0, bun_bundle_1.feature)('TRANSCRIPT_CLASSIFIER')) {
        if (autoModeCheckRan) {
            return;
        }
        autoModeCheckRan = true;
        const { updateContext, notification } = await (0, permissionSetup_js_1.verifyAutoModeGateAccess)(toolPermissionContext, fastMode);
        setAppState(prev => {
            // Apply the transform to CURRENT context, not the stale snapshot we
            // passed to verifyAutoModeGateAccess. The async GrowthBook await inside
            // can be outrun by a mid-turn shift-tab; spreading a stale context here
            // would revert the user's mode change.
            const nextCtx = updateContext(prev.toolPermissionContext);
            const newState = nextCtx === prev.toolPermissionContext
                ? prev
                : { ...prev, toolPermissionContext: nextCtx };
            if (!notification)
                return newState;
            return {
                ...newState,
                notifications: {
                    ...newState.notifications,
                    queue: [
                        ...newState.notifications.queue,
                        {
                            key: 'auto-mode-gate-notification',
                            text: notification,
                            color: 'warning',
                            priority: 'high',
                        },
                    ],
                },
            };
        });
    }
}
/**
 * Reset the run-once flag for checkAndDisableAutoModeIfNeeded.
 * Call this after /login so the gate check re-runs with the new org.
 */
function resetAutoModeGateCheck() {
    autoModeCheckRan = false;
}
function useKickOffCheckAndDisableAutoModeIfNeeded() {
    const mainLoopModel = (0, AppState_js_1.useAppState)(s => s.mainLoopModel);
    const mainLoopModelForSession = (0, AppState_js_1.useAppState)(s => s.mainLoopModelForSession);
    const fastMode = (0, AppState_js_1.useAppState)(s => s.fastMode);
    const setAppState = (0, AppState_js_1.useSetAppState)();
    const store = (0, AppState_js_1.useAppStateStore)();
    const isFirstRunRef = (0, react_1.useRef)(true);
    // Runs on mount (startup check) AND whenever the model or fast mode changes
    // (kick-out / carousel-restore). Watching both model fields covers /model,
    // Cmd+P picker, /config, and bridge onSetModel paths; fastMode covers
    // /fast on|off for the tengu_auto_mode_config.disableFastMode circuit
    // breaker. The print.ts headless paths are covered by the sync
    // isAutoModeGateEnabled() check.
    (0, react_1.useEffect)(() => {
        if ((0, state_js_1.getIsRemoteMode)())
            return;
        if (isFirstRunRef.current) {
            isFirstRunRef.current = false;
        }
        else {
            resetAutoModeGateCheck();
        }
        void checkAndDisableAutoModeIfNeeded(store.getState().toolPermissionContext, setAppState, fastMode);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mainLoopModel, mainLoopModelForSession, fastMode]);
}
