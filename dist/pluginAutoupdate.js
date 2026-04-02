"use strict";
/**
 * Background plugin autoupdate functionality
 *
 * At startup, this module:
 * 1. First updates marketplaces that have autoUpdate enabled
 * 2. Then checks all installed plugins from those marketplaces and updates them
 *
 * Updates are non-inplace (disk-only), requiring a restart to take effect.
 * Official Anthropic marketplaces have autoUpdate enabled by default,
 * but users can disable it per-marketplace.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.onPluginsAutoUpdated = onPluginsAutoUpdated;
exports.getAutoUpdatedPluginNames = getAutoUpdatedPluginNames;
exports.updatePluginsForMarketplaces = updatePluginsForMarketplaces;
exports.autoUpdateMarketplacesAndPluginsInBackground = autoUpdateMarketplacesAndPluginsInBackground;
const pluginOperations_js_1 = require("../../services/plugins/pluginOperations.js");
const config_js_1 = require("../config.js");
const debug_js_1 = require("../debug.js");
const errors_js_1 = require("../errors.js");
const log_js_1 = require("../log.js");
const installedPluginsManager_js_1 = require("./installedPluginsManager.js");
const marketplaceManager_js_1 = require("./marketplaceManager.js");
const pluginIdentifier_js_1 = require("./pluginIdentifier.js");
const schemas_js_1 = require("./schemas.js");
// Store callback for plugin update notifications
let pluginUpdateCallback = null;
// Store pending updates that occurred before callback was registered
// This handles the race condition where updates complete before REPL mounts
let pendingNotification = null;
/**
 * Register a callback to be notified when plugins are auto-updated.
 * This is used by the REPL to show restart notifications.
 *
 * If plugins were already updated before the callback was registered,
 * the callback will be invoked immediately with the pending updates.
 */
function onPluginsAutoUpdated(callback) {
    pluginUpdateCallback = callback;
    // If there are pending updates that happened before registration, deliver them now
    if (pendingNotification !== null && pendingNotification.length > 0) {
        callback(pendingNotification);
        pendingNotification = null;
    }
    return () => {
        pluginUpdateCallback = null;
    };
}
/**
 * Check if pending updates came from autoupdate (for notification purposes).
 * Returns the list of plugin names that have pending updates.
 */
function getAutoUpdatedPluginNames() {
    if (!(0, installedPluginsManager_js_1.hasPendingUpdates)()) {
        return [];
    }
    return (0, installedPluginsManager_js_1.getPendingUpdatesDetails)().map(d => (0, pluginIdentifier_js_1.parsePluginIdentifier)(d.pluginId).name);
}
/**
 * Get the set of marketplaces that have autoUpdate enabled.
 * Returns the marketplace names that should be auto-updated.
 */
async function getAutoUpdateEnabledMarketplaces() {
    const config = await (0, marketplaceManager_js_1.loadKnownMarketplacesConfig)();
    const declared = (0, marketplaceManager_js_1.getDeclaredMarketplaces)();
    const enabled = new Set();
    for (const [name, entry] of Object.entries(config)) {
        // Settings-declared autoUpdate takes precedence over JSON state
        const declaredAutoUpdate = declared[name]?.autoUpdate;
        const autoUpdate = declaredAutoUpdate !== undefined
            ? declaredAutoUpdate
            : (0, schemas_js_1.isMarketplaceAutoUpdate)(name, entry);
        if (autoUpdate) {
            enabled.add(name.toLowerCase());
        }
    }
    return enabled;
}
/**
 * Update a single plugin's installations.
 * Returns the plugin ID if any installation was updated, null otherwise.
 */
async function updatePlugin(pluginId, installations) {
    let wasUpdated = false;
    for (const { scope } of installations) {
        try {
            const result = await (0, pluginOperations_js_1.updatePluginOp)(pluginId, scope);
            if (result.success && !result.alreadyUpToDate) {
                wasUpdated = true;
                (0, debug_js_1.logForDebugging)(`Plugin autoupdate: updated ${pluginId} from ${result.oldVersion} to ${result.newVersion}`);
            }
            else if (!result.alreadyUpToDate) {
                (0, debug_js_1.logForDebugging)(`Plugin autoupdate: failed to update ${pluginId}: ${result.message}`, { level: 'warn' });
            }
        }
        catch (error) {
            (0, debug_js_1.logForDebugging)(`Plugin autoupdate: error updating ${pluginId}: ${(0, errors_js_1.errorMessage)(error)}`, { level: 'warn' });
        }
    }
    return wasUpdated ? pluginId : null;
}
/**
 * Update all project-relevant installed plugins from the given marketplaces.
 *
 * Iterates installed_plugins.json, filters to plugins whose marketplace is in
 * the set, further filters each plugin's installations to those relevant to
 * the current project (user/managed scope, or project/local scope matching
 * cwd — see isInstallationRelevantToCurrentProject), then calls updatePluginOp
 * per installation. Already-up-to-date plugins are silently skipped.
 *
 * Called by:
 * - updatePlugins() below — background autoupdate path (autoUpdate-enabled
 *   marketplaces only; third-party marketplaces default autoUpdate: false)
 * - ManageMarketplaces.tsx applyChanges() — user-initiated /plugin marketplace
 *   update. Before #29512 this path only called refreshMarketplace() (git
 *   pull on the marketplace clone), so the loader would create the new
 *   version cache dir but installed_plugins.json stayed on the old version,
 *   and the orphan GC stamped the NEW dir with .orphaned_at on next startup.
 *
 * @param marketplaceNames - lowercase marketplace names to update plugins from
 * @returns plugin IDs that were actually updated (not already up-to-date)
 */
async function updatePluginsForMarketplaces(marketplaceNames) {
    const installedPlugins = (0, installedPluginsManager_js_1.loadInstalledPluginsFromDisk)();
    const pluginIds = Object.keys(installedPlugins.plugins);
    if (pluginIds.length === 0) {
        return [];
    }
    const results = await Promise.allSettled(pluginIds.map(async (pluginId) => {
        const { marketplace } = (0, pluginIdentifier_js_1.parsePluginIdentifier)(pluginId);
        if (!marketplace || !marketplaceNames.has(marketplace.toLowerCase())) {
            return null;
        }
        const allInstallations = installedPlugins.plugins[pluginId];
        if (!allInstallations || allInstallations.length === 0) {
            return null;
        }
        const relevantInstallations = allInstallations.filter(installedPluginsManager_js_1.isInstallationRelevantToCurrentProject);
        if (relevantInstallations.length === 0) {
            return null;
        }
        return updatePlugin(pluginId, relevantInstallations);
    }));
    return results
        .filter((r) => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value);
}
/**
 * Update plugins from marketplaces that have autoUpdate enabled.
 * Returns the list of plugin IDs that were updated.
 */
async function updatePlugins(autoUpdateEnabledMarketplaces) {
    return updatePluginsForMarketplaces(autoUpdateEnabledMarketplaces);
}
/**
 * Auto-update marketplaces and plugins in the background.
 *
 * This function:
 * 1. Checks which marketplaces have autoUpdate enabled
 * 2. Refreshes only those marketplaces (git pull/re-download)
 * 3. Updates installed plugins from those marketplaces
 * 4. If any plugins were updated, notifies via the registered callback
 *
 * Official Anthropic marketplaces have autoUpdate enabled by default,
 * but users can disable it per-marketplace in the UI.
 *
 * This function runs silently without blocking user interaction.
 * Called from main.tsx during startup as a background job.
 */
function autoUpdateMarketplacesAndPluginsInBackground() {
    void (async () => {
        if ((0, config_js_1.shouldSkipPluginAutoupdate)()) {
            (0, debug_js_1.logForDebugging)('Plugin autoupdate: skipped (auto-updater disabled)');
            return;
        }
        try {
            // Get marketplaces with autoUpdate enabled
            const autoUpdateEnabledMarketplaces = await getAutoUpdateEnabledMarketplaces();
            if (autoUpdateEnabledMarketplaces.size === 0) {
                return;
            }
            // Refresh only marketplaces with autoUpdate enabled
            const refreshResults = await Promise.allSettled(Array.from(autoUpdateEnabledMarketplaces).map(async (name) => {
                try {
                    await (0, marketplaceManager_js_1.refreshMarketplace)(name, undefined, {
                        disableCredentialHelper: true,
                    });
                }
                catch (error) {
                    (0, debug_js_1.logForDebugging)(`Plugin autoupdate: failed to refresh marketplace ${name}: ${(0, errors_js_1.errorMessage)(error)}`, { level: 'warn' });
                }
            }));
            // Log any refresh failures
            const failures = refreshResults.filter(r => r.status === 'rejected');
            if (failures.length > 0) {
                (0, debug_js_1.logForDebugging)(`Plugin autoupdate: ${failures.length} marketplace refresh(es) failed`, { level: 'warn' });
            }
            (0, debug_js_1.logForDebugging)('Plugin autoupdate: checking installed plugins');
            const updatedPlugins = await updatePlugins(autoUpdateEnabledMarketplaces);
            if (updatedPlugins.length > 0) {
                if (pluginUpdateCallback) {
                    // Callback is already registered, invoke it immediately
                    pluginUpdateCallback(updatedPlugins);
                }
                else {
                    // Callback not yet registered (REPL not mounted), store for later delivery
                    pendingNotification = updatedPlugins;
                }
            }
        }
        catch (error) {
            (0, log_js_1.logError)(error);
        }
    })();
}
