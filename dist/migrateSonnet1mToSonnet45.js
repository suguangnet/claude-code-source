"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateSonnet1mToSonnet45 = migrateSonnet1mToSonnet45;
const state_js_1 = require("../bootstrap/state.js");
const config_js_1 = require("../utils/config.js");
const settings_js_1 = require("../utils/settings/settings.js");
/**
 * Migrate users who had "sonnet[1m]" saved to the explicit "sonnet-4-5-20250929[1m]".
 *
 * The "sonnet" alias now resolves to Sonnet 4.6, so users who previously set
 * "sonnet[1m]" (targeting Sonnet 4.5 with 1M context) need to be pinned to the
 * explicit version to preserve their intended model.
 *
 * This is needed because Sonnet 4.6 1M was offered to a different group of users than
 * Sonnet 4.5 1M, so we needed to pin existing sonnet[1m] users to Sonnet 4.5 1M.
 *
 * Reads from userSettings specifically (not merged settings) so we don't
 * promote a project-scoped "sonnet[1m]" to the global default. Runs once,
 * tracked by a completion flag in global config.
 */
function migrateSonnet1mToSonnet45() {
    const config = (0, config_js_1.getGlobalConfig)();
    if (config.sonnet1m45MigrationComplete) {
        return;
    }
    const model = (0, settings_js_1.getSettingsForSource)('userSettings')?.model;
    if (model === 'sonnet[1m]') {
        (0, settings_js_1.updateSettingsForSource)('userSettings', {
            model: 'sonnet-4-5-20250929[1m]',
        });
    }
    // Also migrate the in-memory override if already set
    const override = (0, state_js_1.getMainLoopModelOverride)();
    if (override === 'sonnet[1m]') {
        (0, state_js_1.setMainLoopModelOverride)('sonnet-4-5-20250929[1m]');
    }
    (0, config_js_1.saveGlobalConfig)(current => ({
        ...current,
        sonnet1m45MigrationComplete: true,
    }));
}
