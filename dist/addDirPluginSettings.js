"use strict";
/**
 * Reads plugin-related settings (enabledPlugins, extraKnownMarketplaces)
 * from --add-dir directories.
 *
 * These have the LOWEST priority — callers must spread standard settings
 * on top so that user/project/local/flag/policy sources all override.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAddDirEnabledPlugins = getAddDirEnabledPlugins;
exports.getAddDirExtraMarketplaces = getAddDirExtraMarketplaces;
const path_1 = require("path");
const state_js_1 = require("../../bootstrap/state.js");
const settings_js_1 = require("../settings/settings.js");
const SETTINGS_FILES = ['settings.json', 'settings.local.json'];
/**
 * Returns a merged record of enabledPlugins from all --add-dir directories.
 *
 * Within each directory, settings.local.json is processed after settings.json
 * (local wins within that dir). Across directories, later CLI-order wins on
 * conflict.
 *
 * This has the lowest priority — callers must spread their standard settings
 * on top to let user/project/local/flag/policy override.
 */
function getAddDirEnabledPlugins() {
    const result = {};
    for (const dir of (0, state_js_1.getAdditionalDirectoriesForClaudeMd)()) {
        for (const file of SETTINGS_FILES) {
            const { settings } = (0, settings_js_1.parseSettingsFile)((0, path_1.join)(dir, '.claude', file));
            if (!settings?.enabledPlugins) {
                continue;
            }
            Object.assign(result, settings.enabledPlugins);
        }
    }
    return result;
}
/**
 * Returns a merged record of extraKnownMarketplaces from all --add-dir directories.
 *
 * Same priority rules as getAddDirEnabledPlugins: settings.local.json wins
 * within each dir, and callers spread standard settings on top.
 */
function getAddDirExtraMarketplaces() {
    const result = {};
    for (const dir of (0, state_js_1.getAdditionalDirectoriesForClaudeMd)()) {
        for (const file of SETTINGS_FILES) {
            const { settings } = (0, settings_js_1.parseSettingsFile)((0, path_1.join)(dir, '.claude', file));
            if (!settings?.extraKnownMarketplaces) {
                continue;
            }
            Object.assign(result, settings.extraKnownMarketplaces);
        }
    }
    return result;
}
