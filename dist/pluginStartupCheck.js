"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkEnabledPlugins = checkEnabledPlugins;
exports.getPluginEditableScopes = getPluginEditableScopes;
exports.isPersistableScope = isPersistableScope;
exports.settingSourceToScope = settingSourceToScope;
exports.getInstalledPlugins = getInstalledPlugins;
exports.findMissingPlugins = findMissingPlugins;
exports.installSelectedPlugins = installSelectedPlugins;
const path_1 = require("path");
const cwd_js_1 = require("../cwd.js");
const debug_js_1 = require("../debug.js");
const log_js_1 = require("../log.js");
const settings_js_1 = require("../settings/settings.js");
const addDirPluginSettings_js_1 = require("./addDirPluginSettings.js");
const installedPluginsManager_js_1 = require("./installedPluginsManager.js");
const marketplaceManager_js_1 = require("./marketplaceManager.js");
const pluginIdentifier_js_1 = require("./pluginIdentifier.js");
const pluginInstallationHelpers_js_1 = require("./pluginInstallationHelpers.js");
const schemas_js_1 = require("./schemas.js");
/**
 * Checks for enabled plugins across all settings sources, including --add-dir.
 *
 * Uses getInitialSettings() which merges all sources with policy as
 * highest priority, then layers --add-dir plugins underneath. This is the
 * authoritative "is this plugin enabled?" check — don't delegate to
 * getPluginEditableScopes() which serves a different purpose (scope tracking).
 *
 * @returns Array of plugin IDs (plugin@marketplace format) that are enabled
 */
async function checkEnabledPlugins() {
    const settings = (0, settings_js_1.getInitialSettings)();
    const enabledPlugins = [];
    // Start with --add-dir plugins (lowest priority)
    const addDirPlugins = (0, addDirPluginSettings_js_1.getAddDirEnabledPlugins)();
    for (const [pluginId, value] of Object.entries(addDirPlugins)) {
        if (pluginId.includes('@') && value) {
            enabledPlugins.push(pluginId);
        }
    }
    // Merged settings (policy > local > project > user) override --add-dir
    if (settings.enabledPlugins) {
        for (const [pluginId, value] of Object.entries(settings.enabledPlugins)) {
            if (!pluginId.includes('@')) {
                continue;
            }
            const idx = enabledPlugins.indexOf(pluginId);
            if (value) {
                if (idx === -1) {
                    enabledPlugins.push(pluginId);
                }
            }
            else {
                // Explicitly disabled — remove even if --add-dir enabled it
                if (idx !== -1) {
                    enabledPlugins.splice(idx, 1);
                }
            }
        }
    }
    return enabledPlugins;
}
/**
 * Gets the user-editable scope that "owns" each enabled plugin.
 *
 * Used for scope tracking: determining where to write back when a user
 * enables/disables a plugin. Managed (policy) settings are processed first
 * (lowest priority) because the user cannot edit them — the scope should
 * resolve to the highest user-controllable source.
 *
 * NOTE: This is NOT the authoritative "is this plugin enabled?" check.
 * Use checkEnabledPlugins() for that — it uses merged settings where
 * policy has highest priority and can block user-enabled plugins.
 *
 * Precedence (lowest to highest):
 * 0. addDir (--add-dir directories) - session-only, lowest priority
 * 1. managed (policySettings) - not user-editable
 * 2. user (userSettings)
 * 3. project (projectSettings)
 * 4. local (localSettings)
 * 5. flag (flagSettings) - session-only, not persisted
 *
 * @returns Map of plugin ID to the user-editable scope that owns it
 */
function getPluginEditableScopes() {
    const result = new Map();
    // Process --add-dir directories FIRST (lowest priority, overridden by all standard sources)
    const addDirPlugins = (0, addDirPluginSettings_js_1.getAddDirEnabledPlugins)();
    for (const [pluginId, value] of Object.entries(addDirPlugins)) {
        if (!pluginId.includes('@')) {
            continue;
        }
        if (value === true) {
            result.set(pluginId, 'flag'); // 'flag' scope = session-only, no write-back
        }
        else if (value === false) {
            result.delete(pluginId);
        }
    }
    // Process standard sources in precedence order (later overrides earlier)
    const scopeSources = [
        { scope: 'managed', source: 'policySettings' },
        { scope: 'user', source: 'userSettings' },
        { scope: 'project', source: 'projectSettings' },
        { scope: 'local', source: 'localSettings' },
        { scope: 'flag', source: 'flagSettings' },
    ];
    for (const { scope, source } of scopeSources) {
        const settings = (0, settings_js_1.getSettingsForSource)(source);
        if (!settings?.enabledPlugins) {
            continue;
        }
        for (const [pluginId, value] of Object.entries(settings.enabledPlugins)) {
            // Skip invalid format
            if (!pluginId.includes('@')) {
                continue;
            }
            // Log when a standard source overrides an --add-dir plugin
            if (pluginId in addDirPlugins && addDirPlugins[pluginId] !== value) {
                (0, debug_js_1.logForDebugging)(`Plugin ${pluginId} from --add-dir (${addDirPlugins[pluginId]}) overridden by ${source} (${value})`);
            }
            if (value === true) {
                // Plugin enabled at this scope
                result.set(pluginId, scope);
            }
            else if (value === false) {
                // Explicitly disabled - remove from result
                result.delete(pluginId);
            }
            // Note: Other values (like version strings for future P2) are ignored for now
        }
    }
    (0, debug_js_1.logForDebugging)(`Found ${result.size} enabled plugins with scopes: ${Array.from(result.entries())
        .map(([id, scope]) => `${id}(${scope})`)
        .join(', ')}`);
    return result;
}
/**
 * Check if a scope is persistable (not session-only).
 * @param scope The scope to check
 * @returns true if the scope should be persisted to installed_plugins.json
 */
function isPersistableScope(scope) {
    return scope !== 'flag';
}
/**
 * Convert SettingSource to plugin scope.
 * @param source The settings source
 * @returns The corresponding plugin scope
 */
function settingSourceToScope(source) {
    return pluginIdentifier_js_1.SETTING_SOURCE_TO_SCOPE[source];
}
/**
 * Gets the list of currently installed plugins
 * Reads from installed_plugins.json which tracks global installation state.
 * Automatically runs migration on first call if needed.
 *
 * Always uses V2 format and initializes the in-memory session state
 * (which triggers V1→V2 migration if needed).
 *
 * @returns Array of installed plugin IDs
 */
async function getInstalledPlugins() {
    // Trigger sync in background (don't await - don't block startup)
    // This syncs enabledPlugins from settings.json to installed_plugins.json
    void (0, installedPluginsManager_js_1.migrateFromEnabledPlugins)().catch(error => {
        (0, log_js_1.logError)(error);
    });
    // Always use V2 format - initializes in-memory session state and triggers V1→V2 migration
    const v2Data = (0, installedPluginsManager_js_1.getInMemoryInstalledPlugins)();
    const installed = Object.keys(v2Data.plugins);
    (0, debug_js_1.logForDebugging)(`Found ${installed.length} installed plugins`);
    return installed;
}
/**
 * Finds plugins that are enabled but not installed
 * @param enabledPlugins Array of enabled plugin IDs
 * @returns Array of missing plugin IDs
 */
async function findMissingPlugins(enabledPlugins) {
    try {
        const installedPlugins = await getInstalledPlugins();
        // Filter to not-installed synchronously, then look up all in parallel.
        // Results are collected in original enabledPlugins order.
        const notInstalled = enabledPlugins.filter(id => !installedPlugins.includes(id));
        const lookups = await Promise.all(notInstalled.map(async (pluginId) => {
            try {
                const plugin = await (0, marketplaceManager_js_1.getPluginById)(pluginId);
                return { pluginId, found: plugin !== null && plugin !== undefined };
            }
            catch (error) {
                (0, debug_js_1.logForDebugging)(`Failed to check plugin ${pluginId} in marketplace: ${error}`);
                // Plugin doesn't exist in any marketplace, will be handled as an error
                return { pluginId, found: false };
            }
        }));
        const missing = lookups
            .filter(({ found }) => found)
            .map(({ pluginId }) => pluginId);
        return missing;
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return [];
    }
}
/**
 * Installs the selected plugins
 * @param pluginsToInstall Array of plugin IDs to install
 * @param onProgress Optional callback for installation progress
 * @param scope Installation scope: user, project, or local (defaults to 'user')
 * @returns Installation results with succeeded and failed plugins
 */
async function installSelectedPlugins(pluginsToInstall, onProgress, scope = 'user') {
    // Get projectPath for non-user scopes
    const projectPath = scope !== 'user' ? (0, cwd_js_1.getCwd)() : undefined;
    // Get the correct settings source for this scope
    const settingSource = (0, pluginIdentifier_js_1.scopeToSettingSource)(scope);
    const settings = (0, settings_js_1.getSettingsForSource)(settingSource);
    const updatedEnabledPlugins = { ...settings?.enabledPlugins };
    const installed = [];
    const failed = [];
    for (let i = 0; i < pluginsToInstall.length; i++) {
        const pluginId = pluginsToInstall[i];
        if (!pluginId)
            continue;
        if (onProgress) {
            onProgress(pluginId, i + 1, pluginsToInstall.length);
        }
        try {
            const pluginInfo = await (0, marketplaceManager_js_1.getPluginById)(pluginId);
            if (!pluginInfo) {
                failed.push({
                    name: pluginId,
                    error: 'Plugin not found in any marketplace',
                });
                continue;
            }
            // Cache the plugin if it's from an external source
            const { entry, marketplaceInstallLocation } = pluginInfo;
            if (!(0, schemas_js_1.isLocalPluginSource)(entry.source)) {
                // External plugin - cache and register it with scope
                await (0, pluginInstallationHelpers_js_1.cacheAndRegisterPlugin)(pluginId, entry, scope, projectPath);
            }
            else {
                // Local plugin - just register it with the install path and scope
                (0, pluginInstallationHelpers_js_1.registerPluginInstallation)({
                    pluginId,
                    installPath: (0, path_1.join)(marketplaceInstallLocation, entry.source),
                    version: entry.version,
                }, scope, projectPath);
            }
            // Mark as enabled in settings
            updatedEnabledPlugins[pluginId] = true;
            installed.push(pluginId);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            failed.push({ name: pluginId, error: errorMessage });
            (0, log_js_1.logError)(error);
        }
    }
    // Update settings with newly enabled plugins using the correct settings source
    (0, settings_js_1.updateSettingsForSource)(settingSource, {
        ...settings,
        enabledPlugins: updatedEnabledPlugins,
    });
    return { installed, failed };
}
