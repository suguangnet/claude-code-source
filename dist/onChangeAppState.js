"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.externalMetadataToAppState = externalMetadataToAppState;
exports.onChangeAppState = onChangeAppState;
const state_js_1 = require("../bootstrap/state.js");
const auth_js_1 = require("../utils/auth.js");
const config_js_1 = require("../utils/config.js");
const errors_js_1 = require("../utils/errors.js");
const log_js_1 = require("../utils/log.js");
const managedEnv_js_1 = require("../utils/managedEnv.js");
const PermissionMode_js_1 = require("../utils/permissions/PermissionMode.js");
const sessionState_js_1 = require("../utils/sessionState.js");
const settings_js_1 = require("../utils/settings/settings.js");
// Inverse of the push below — restore on worker restart.
function externalMetadataToAppState(metadata) {
    return prev => ({
        ...prev,
        ...(typeof metadata.permission_mode === 'string'
            ? {
                toolPermissionContext: {
                    ...prev.toolPermissionContext,
                    mode: (0, PermissionMode_js_1.permissionModeFromString)(metadata.permission_mode),
                },
            }
            : {}),
        ...(typeof metadata.is_ultraplan_mode === 'boolean'
            ? { isUltraplanMode: metadata.is_ultraplan_mode }
            : {}),
    });
}
function onChangeAppState({ newState, oldState, }) {
    // toolPermissionContext.mode — single choke point for CCR/SDK mode sync.
    //
    // Prior to this block, mode changes were relayed to CCR by only 2 of 8+
    // mutation paths: a bespoke setAppState wrapper in print.ts (headless/SDK
    // mode only) and a manual notify in the set_permission_mode handler.
    // Every other path — Shift+Tab cycling, ExitPlanModePermissionRequest
    // dialog options, the /plan slash command, rewind, the REPL bridge's
    // onSetPermissionMode — mutated AppState without telling
    // CCR, leaving external_metadata.permission_mode stale and the web UI out
    // of sync with the CLI's actual mode.
    //
    // Hooking the diff here means ANY setAppState call that changes the mode
    // notifies CCR (via notifySessionMetadataChanged → ccrClient.reportMetadata)
    // and the SDK status stream (via notifyPermissionModeChanged → registered
    // in print.ts). The scattered callsites above need zero changes.
    const prevMode = oldState.toolPermissionContext.mode;
    const newMode = newState.toolPermissionContext.mode;
    if (prevMode !== newMode) {
        // CCR external_metadata must not receive internal-only mode names
        // (bubble, ungated auto). Externalize first — and skip
        // the CCR notify if the EXTERNAL mode didn't change (e.g.,
        // default→bubble→default is noise from CCR's POV since both
        // externalize to 'default'). The SDK channel (notifyPermissionModeChanged)
        // passes raw mode; its listener in print.ts applies its own filter.
        const prevExternal = (0, PermissionMode_js_1.toExternalPermissionMode)(prevMode);
        const newExternal = (0, PermissionMode_js_1.toExternalPermissionMode)(newMode);
        if (prevExternal !== newExternal) {
            // Ultraplan = first plan cycle only. The initial control_request
            // sets mode and isUltraplanMode atomically, so the flag's
            // transition gates it. null per RFC 7396 (removes the key).
            const isUltraplan = newExternal === 'plan' &&
                newState.isUltraplanMode &&
                !oldState.isUltraplanMode
                ? true
                : null;
            (0, sessionState_js_1.notifySessionMetadataChanged)({
                permission_mode: newExternal,
                is_ultraplan_mode: isUltraplan,
            });
        }
        (0, sessionState_js_1.notifyPermissionModeChanged)(newMode);
    }
    // mainLoopModel: remove it from settings?
    if (newState.mainLoopModel !== oldState.mainLoopModel &&
        newState.mainLoopModel === null) {
        // Remove from settings
        (0, settings_js_1.updateSettingsForSource)('userSettings', { model: undefined });
        (0, state_js_1.setMainLoopModelOverride)(null);
    }
    // mainLoopModel: add it to settings?
    if (newState.mainLoopModel !== oldState.mainLoopModel &&
        newState.mainLoopModel !== null) {
        // Save to settings
        (0, settings_js_1.updateSettingsForSource)('userSettings', { model: newState.mainLoopModel });
        (0, state_js_1.setMainLoopModelOverride)(newState.mainLoopModel);
    }
    // expandedView → persist as showExpandedTodos + showSpinnerTree for backwards compat
    if (newState.expandedView !== oldState.expandedView) {
        const showExpandedTodos = newState.expandedView === 'tasks';
        const showSpinnerTree = newState.expandedView === 'teammates';
        if ((0, config_js_1.getGlobalConfig)().showExpandedTodos !== showExpandedTodos ||
            (0, config_js_1.getGlobalConfig)().showSpinnerTree !== showSpinnerTree) {
            (0, config_js_1.saveGlobalConfig)(current => ({
                ...current,
                showExpandedTodos,
                showSpinnerTree,
            }));
        }
    }
    // verbose
    if (newState.verbose !== oldState.verbose &&
        (0, config_js_1.getGlobalConfig)().verbose !== newState.verbose) {
        const verbose = newState.verbose;
        (0, config_js_1.saveGlobalConfig)(current => ({
            ...current,
            verbose,
        }));
    }
    // tungstenPanelVisible (ant-only tmux panel sticky toggle)
    if (process.env.USER_TYPE === 'ant') {
        if (newState.tungstenPanelVisible !== oldState.tungstenPanelVisible &&
            newState.tungstenPanelVisible !== undefined &&
            (0, config_js_1.getGlobalConfig)().tungstenPanelVisible !== newState.tungstenPanelVisible) {
            const tungstenPanelVisible = newState.tungstenPanelVisible;
            (0, config_js_1.saveGlobalConfig)(current => ({ ...current, tungstenPanelVisible }));
        }
    }
    // settings: clear auth-related caches when settings change
    // This ensures apiKeyHelper and AWS/GCP credential changes take effect immediately
    if (newState.settings !== oldState.settings) {
        try {
            (0, auth_js_1.clearApiKeyHelperCache)();
            (0, auth_js_1.clearAwsCredentialsCache)();
            (0, auth_js_1.clearGcpCredentialsCache)();
            // Re-apply environment variables when settings.env changes
            // This is additive-only: new vars are added, existing may be overwritten, nothing is deleted
            if (newState.settings.env !== oldState.settings.env) {
                (0, managedEnv_js_1.applyConfigEnvironmentVariables)();
            }
        }
        catch (error) {
            (0, log_js_1.logError)((0, errors_js_1.toError)(error));
        }
    }
}
