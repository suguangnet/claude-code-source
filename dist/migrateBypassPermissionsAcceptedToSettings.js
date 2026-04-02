"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateBypassPermissionsAcceptedToSettings = migrateBypassPermissionsAcceptedToSettings;
const index_js_1 = require("src/services/analytics/index.js");
const config_js_1 = require("../utils/config.js");
const log_js_1 = require("../utils/log.js");
const settings_js_1 = require("../utils/settings/settings.js");
/**
 * Migration: Move bypassPermissionsModeAccepted from global config to settings.json
 * as skipDangerousModePermissionPrompt. This is a better home since settings.json
 * is the user-configurable settings file.
 */
function migrateBypassPermissionsAcceptedToSettings() {
    const globalConfig = (0, config_js_1.getGlobalConfig)();
    if (!globalConfig.bypassPermissionsModeAccepted) {
        return;
    }
    try {
        if (!(0, settings_js_1.hasSkipDangerousModePermissionPrompt)()) {
            (0, settings_js_1.updateSettingsForSource)('userSettings', {
                skipDangerousModePermissionPrompt: true,
            });
        }
        (0, index_js_1.logEvent)('tengu_migrate_bypass_permissions_accepted', {});
        (0, config_js_1.saveGlobalConfig)(current => {
            if (!('bypassPermissionsModeAccepted' in current))
                return current;
            const { bypassPermissionsModeAccepted: _, ...updatedConfig } = current;
            return updatedConfig;
        });
    }
    catch (error) {
        (0, log_js_1.logError)(new Error(`Failed to migrate bypass permissions accepted: ${error}`));
    }
}
