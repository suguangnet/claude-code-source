"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogEventNotificationSchema = void 0;
exports.notifyVscodeFileUpdated = notifyVscodeFileUpdated;
exports.setupVscodeSdkMcp = setupVscodeSdkMcp;
const debug_js_1 = require("src/utils/debug.js");
const v4_1 = require("zod/v4");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const growthbook_js_1 = require("../analytics/growthbook.js");
const index_js_1 = require("../analytics/index.js");
function readAutoModeEnabledState() {
    const v = (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_auto_mode_config', {})?.enabled;
    return v === 'enabled' || v === 'disabled' || v === 'opt-in' ? v : undefined;
}
exports.LogEventNotificationSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    method: v4_1.z.literal('log_event'),
    params: v4_1.z.object({
        eventName: v4_1.z.string(),
        eventData: v4_1.z.object({}).passthrough(),
    }),
}));
// Store the VSCode MCP client reference for sending notifications
let vscodeMcpClient = null;
/**
 * Sends a file_updated notification to the VSCode MCP server. This is used to
 * notify VSCode when files are edited or written by Claude.
 */
function notifyVscodeFileUpdated(filePath, oldContent, newContent) {
    if (process.env.USER_TYPE !== 'ant' || !vscodeMcpClient) {
        return;
    }
    void vscodeMcpClient.client
        .notification({
        method: 'file_updated',
        params: { filePath, oldContent, newContent },
    })
        .catch((error) => {
        // Do not throw if the notification failed
        (0, debug_js_1.logForDebugging)(`[VSCode] Failed to send file_updated notification: ${error.message}`);
    });
}
/**
 * Sets up the speicial internal VSCode MCP for bidirectional communication using notifications.
 */
function setupVscodeSdkMcp(sdkClients) {
    const client = sdkClients.find(client => client.name === 'claude-vscode');
    if (client && client.type === 'connected') {
        // Store the client reference for later use
        vscodeMcpClient = client;
        client.client.setNotificationHandler((0, exports.LogEventNotificationSchema)(), async (notification) => {
            const { eventName, eventData } = notification.params;
            (0, index_js_1.logEvent)(`tengu_vscode_${eventName}`, eventData);
        });
        // Send necessary experiment gates to VSCode immediately.
        const gates = {
            tengu_vscode_review_upsell: (0, growthbook_js_1.checkStatsigFeatureGate_CACHED_MAY_BE_STALE)('tengu_vscode_review_upsell'),
            tengu_vscode_onboarding: (0, growthbook_js_1.checkStatsigFeatureGate_CACHED_MAY_BE_STALE)('tengu_vscode_onboarding'),
            // Browser support.
            tengu_quiet_fern: (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_quiet_fern', false),
            // In-band OAuth via claude_authenticate (vs. extension-native PKCE).
            tengu_vscode_cc_auth: (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_vscode_cc_auth', false),
        };
        // Tri-state: 'enabled' | 'disabled' | 'opt-in'. Omit if unknown so VSCode
        // fails closed (treats absent as 'disabled').
        const autoModeState = readAutoModeEnabledState();
        if (autoModeState !== undefined) {
            gates.tengu_auto_mode_state = autoModeState;
        }
        void client.client.notification({
            method: 'experiment_gates',
            params: { gates },
        });
    }
}
