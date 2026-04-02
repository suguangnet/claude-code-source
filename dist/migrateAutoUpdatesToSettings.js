"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateAutoUpdatesToSettings = migrateAutoUpdatesToSettings;
const index_js_1 = require("src/services/analytics/index.js");
const config_js_1 = require("../utils/config.js");
const log_js_1 = require("../utils/log.js");
const settings_js_1 = require("../utils/settings/settings.js");
/**
 * Migration: Move user-set autoUpdates preference to settings.json env var
 * Only migrates if user explicitly disabled auto-updates (not for protection)
 * This preserves user intent while allowing native installations to auto-update
 */
function migrateAutoUpdatesToSettings() {
    const globalConfig = (0, config_js_1.getGlobalConfig)();
    // Only migrate if autoUpdates was explicitly set to false by user preference
    // (not automatically for native protection)
    if (globalConfig.autoUpdates !== false ||
        globalConfig.autoUpdatesProtectedForNative === true) {
        return;
    }
    try {
        const userSettings = (0, settings_js_1.getSettingsForSource)('userSettings') || {};
        // Always set DISABLE_AUTOUPDATER to preserve user intent
        // We need to overwrite even if it exists, to ensure the migration is complete
        (0, settings_js_1.updateSettingsForSource)('userSettings', {
            ...userSettings,
            env: {
                ...userSettings.env,
                DISABLE_AUTOUPDATER: '1',
            },
        });
        (0, index_js_1.logEvent)('tengu_migrate_autoupdates_to_settings', {
            was_user_preference: true,
            already_had_env_var: !!userSettings.env?.DISABLE_AUTOUPDATER,
        });
        // explicitly set, so this takes effect immediately
        process.env.DISABLE_AUTOUPDATER = '1';
        // Remove autoUpdates from global config after successful migration
        (0, config_js_1.saveGlobalConfig)(current => {
            const { autoUpdates: _, autoUpdatesProtectedForNative: __, ...updatedConfig } = current;
            return updatedConfig;
        });
    }
    catch (error) {
        (0, log_js_1.logError)(new Error(`Failed to migrate auto-updates: ${error}`));
        (0, index_js_1.logEvent)('tengu_migrate_autoupdates_error', {
            has_error: true,
        });
    }
}
