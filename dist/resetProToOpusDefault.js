"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetProToOpusDefault = resetProToOpusDefault;
const index_js_1 = require("src/services/analytics/index.js");
const auth_js_1 = require("../utils/auth.js");
const config_js_1 = require("../utils/config.js");
const providers_js_1 = require("../utils/model/providers.js");
const settings_js_1 = require("../utils/settings/settings.js");
function resetProToOpusDefault() {
    const config = (0, config_js_1.getGlobalConfig)();
    if (config.opusProMigrationComplete) {
        return;
    }
    const apiProvider = (0, providers_js_1.getAPIProvider)();
    // Pro users on firstParty get auto-migrated to Opus 4.5 default
    if (apiProvider !== 'firstParty' || !(0, auth_js_1.isProSubscriber)()) {
        (0, config_js_1.saveGlobalConfig)(current => ({
            ...current,
            opusProMigrationComplete: true,
        }));
        (0, index_js_1.logEvent)('tengu_reset_pro_to_opus_default', { skipped: true });
        return;
    }
    const settings = (0, settings_js_1.getSettings_DEPRECATED)();
    // Only show notification if user was on default (no custom model setting)
    if (settings?.model === undefined) {
        const opusProMigrationTimestamp = Date.now();
        (0, config_js_1.saveGlobalConfig)(current => ({
            ...current,
            opusProMigrationComplete: true,
            opusProMigrationTimestamp,
        }));
        (0, index_js_1.logEvent)('tengu_reset_pro_to_opus_default', {
            skipped: false,
            had_custom_model: false,
        });
    }
    else {
        // User has a custom model setting, just mark migration complete
        (0, config_js_1.saveGlobalConfig)(current => ({
            ...current,
            opusProMigrationComplete: true,
        }));
        (0, index_js_1.logEvent)('tengu_reset_pro_to_opus_default', {
            skipped: false,
            had_custom_model: true,
        });
    }
}
