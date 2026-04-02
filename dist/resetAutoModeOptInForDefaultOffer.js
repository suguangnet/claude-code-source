"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetAutoModeOptInForDefaultOffer = resetAutoModeOptInForDefaultOffer;
const bun_bundle_1 = require("bun:bundle");
const index_js_1 = require("src/services/analytics/index.js");
const config_js_1 = require("../utils/config.js");
const log_js_1 = require("../utils/log.js");
const permissionSetup_js_1 = require("../utils/permissions/permissionSetup.js");
const settings_js_1 = require("../utils/settings/settings.js");
/**
 * One-shot migration: clear skipAutoPermissionPrompt for users who accepted
 * the old 2-option AutoModeOptInDialog but don't have auto as their default.
 * Re-surfaces the dialog so they see the new "make it my default mode" option.
 * Guard lives in GlobalConfig (~/.claude.json), not settings.json, so it
 * survives settings resets and doesn't re-arm itself.
 *
 * Only runs when tengu_auto_mode_config.enabled === 'enabled'. For 'opt-in'
 * users, clearing skipAutoPermissionPrompt would remove auto from the carousel
 * (permissionSetup.ts:988) — the dialog would become unreachable and the
 * migration would defeat itself. In practice the ~40 target ants are all
 * 'enabled' (they reached the old dialog via bare Shift+Tab, which requires
 * 'enabled'), but the guard makes it safe regardless.
 */
function resetAutoModeOptInForDefaultOffer() {
    if ((0, bun_bundle_1.feature)('TRANSCRIPT_CLASSIFIER')) {
        const config = (0, config_js_1.getGlobalConfig)();
        if (config.hasResetAutoModeOptInForDefaultOffer)
            return;
        if ((0, permissionSetup_js_1.getAutoModeEnabledState)() !== 'enabled')
            return;
        try {
            const user = (0, settings_js_1.getSettingsForSource)('userSettings');
            if (user?.skipAutoPermissionPrompt &&
                user?.permissions?.defaultMode !== 'auto') {
                (0, settings_js_1.updateSettingsForSource)('userSettings', {
                    skipAutoPermissionPrompt: undefined,
                });
                (0, index_js_1.logEvent)('tengu_migrate_reset_auto_opt_in_for_default_offer', {});
            }
            (0, config_js_1.saveGlobalConfig)(c => {
                if (c.hasResetAutoModeOptInForDefaultOffer)
                    return c;
                return { ...c, hasResetAutoModeOptInForDefaultOffer: true };
            });
        }
        catch (error) {
            (0, log_js_1.logError)(new Error(`Failed to reset auto mode opt-in: ${error}`));
        }
    }
}
