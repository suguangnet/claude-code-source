"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateLegacyOpusToCurrent = migrateLegacyOpusToCurrent;
const index_js_1 = require("../services/analytics/index.js");
const config_js_1 = require("../utils/config.js");
const model_js_1 = require("../utils/model/model.js");
const providers_js_1 = require("../utils/model/providers.js");
const settings_js_1 = require("../utils/settings/settings.js");
/**
 * Migrate first-party users off explicit Opus 4.0/4.1 model strings.
 *
 * The 'opus' alias already resolves to Opus 4.6 for 1P, so anyone still
 * on an explicit 4.0/4.1 string pinned it in settings before 4.5 launched.
 * parseUserSpecifiedModel now silently remaps these at runtime anyway —
 * this migration cleans up the settings file so /model shows the right
 * thing, and sets a timestamp so the REPL can show a one-time notification.
 *
 * Only touches userSettings. Legacy strings in project/local/policy settings
 * are left alone (we can't/shouldn't rewrite those) and are still remapped at
 * runtime by parseUserSpecifiedModel. Reading and writing the same source
 * keeps this idempotent without a completion flag, and avoids silently
 * promoting 'opus' to the global default for users who only pinned it in one
 * project.
 */
function migrateLegacyOpusToCurrent() {
    if ((0, providers_js_1.getAPIProvider)() !== 'firstParty') {
        return;
    }
    if (!(0, model_js_1.isLegacyModelRemapEnabled)()) {
        return;
    }
    const model = (0, settings_js_1.getSettingsForSource)('userSettings')?.model;
    if (model !== 'claude-opus-4-20250514' &&
        model !== 'claude-opus-4-1-20250805' &&
        model !== 'claude-opus-4-0' &&
        model !== 'claude-opus-4-1') {
        return;
    }
    (0, settings_js_1.updateSettingsForSource)('userSettings', { model: 'opus' });
    (0, config_js_1.saveGlobalConfig)(current => ({
        ...current,
        legacyOpusMigrationTimestamp: Date.now(),
    }));
    (0, index_js_1.logEvent)('tengu_legacy_opus_migration', {
        from_model: model,
    });
}
