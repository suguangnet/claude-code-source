"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateSonnet45ToSonnet46 = migrateSonnet45ToSonnet46;
const index_js_1 = require("../services/analytics/index.js");
const auth_js_1 = require("../utils/auth.js");
const config_js_1 = require("../utils/config.js");
const providers_js_1 = require("../utils/model/providers.js");
const settings_js_1 = require("../utils/settings/settings.js");
/**
 * Migrate Pro/Max/Team Premium first-party users off explicit Sonnet 4.5
 * model strings to the 'sonnet' alias (which now resolves to Sonnet 4.6).
 *
 * Users may have been pinned to explicit Sonnet 4.5 strings by:
 * - The earlier migrateSonnet1mToSonnet45 migration (sonnet[1m] → explicit 4.5[1m])
 * - Manually selecting it via /model
 *
 * Reads userSettings specifically (not merged) so we only migrate what /model
 * wrote — project/local pins are left alone.
 * Idempotent: only writes if userSettings.model matches a Sonnet 4.5 string.
 */
function migrateSonnet45ToSonnet46() {
    if ((0, providers_js_1.getAPIProvider)() !== 'firstParty') {
        return;
    }
    if (!(0, auth_js_1.isProSubscriber)() && !(0, auth_js_1.isMaxSubscriber)() && !(0, auth_js_1.isTeamPremiumSubscriber)()) {
        return;
    }
    const model = (0, settings_js_1.getSettingsForSource)('userSettings')?.model;
    if (model !== 'claude-sonnet-4-5-20250929' &&
        model !== 'claude-sonnet-4-5-20250929[1m]' &&
        model !== 'sonnet-4-5-20250929' &&
        model !== 'sonnet-4-5-20250929[1m]') {
        return;
    }
    const has1m = model.endsWith('[1m]');
    (0, settings_js_1.updateSettingsForSource)('userSettings', {
        model: has1m ? 'sonnet[1m]' : 'sonnet',
    });
    // Skip notification for brand-new users — they never experienced the old default
    const config = (0, config_js_1.getGlobalConfig)();
    if (config.numStartups > 1) {
        (0, config_js_1.saveGlobalConfig)(current => ({
            ...current,
            sonnet45To46MigrationTimestamp: Date.now(),
        }));
    }
    (0, index_js_1.logEvent)('tengu_sonnet45_to_46_migration', {
        from_model: model,
        has_1m: has1m,
    });
}
