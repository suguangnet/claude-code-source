"use strict";
/**
 * Plugin policy checks backed by managed settings (policySettings).
 *
 * Kept as a leaf module (only imports settings) to avoid circular dependencies
 * — marketplaceHelpers.ts imports marketplaceManager.ts which transitively
 * reaches most of the plugin subsystem.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPluginBlockedByPolicy = isPluginBlockedByPolicy;
const settings_js_1 = require("../settings/settings.js");
/**
 * Check if a plugin is force-disabled by org policy (managed-settings.json).
 * Policy-blocked plugins cannot be installed or enabled by the user at any
 * scope. Used as the single source of truth for policy blocking across the
 * install chokepoint, enable op, and UI filters.
 */
function isPluginBlockedByPolicy(pluginId) {
    const policyEnabled = (0, settings_js_1.getSettingsForSource)('policySettings')?.enabledPlugins;
    return policyEnabled?.[pluginId] === false;
}
