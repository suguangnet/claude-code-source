"use strict";
/**
 * Plugin delisting detection.
 *
 * Compares installed plugins against marketplace manifests to find plugins
 * that have been removed, and auto-uninstalls them.
 *
 * The security.json fetch was removed (see #25447) — ~29.5M/week GitHub hits
 * for UI reason/text only. If re-introduced, serve from downloads.claude.ai.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectDelistedPlugins = detectDelistedPlugins;
exports.detectAndUninstallDelistedPlugins = detectAndUninstallDelistedPlugins;
const pluginOperations_js_1 = require("../../services/plugins/pluginOperations.js");
const debug_js_1 = require("../debug.js");
const errors_js_1 = require("../errors.js");
const installedPluginsManager_js_1 = require("./installedPluginsManager.js");
const marketplaceManager_js_1 = require("./marketplaceManager.js");
const pluginFlagging_js_1 = require("./pluginFlagging.js");
/**
 * Detect plugins installed from a marketplace that are no longer listed there.
 *
 * @param installedPlugins All installed plugins
 * @param marketplace The marketplace to check against
 * @param marketplaceName The marketplace name suffix (e.g. "claude-plugins-official")
 * @returns List of delisted plugin IDs in "name@marketplace" format
 */
function detectDelistedPlugins(installedPlugins, marketplace, marketplaceName) {
    const marketplacePluginNames = new Set(marketplace.plugins.map(p => p.name));
    const suffix = `@${marketplaceName}`;
    const delisted = [];
    for (const pluginId of Object.keys(installedPlugins.plugins)) {
        if (!pluginId.endsWith(suffix))
            continue;
        const pluginName = pluginId.slice(0, -suffix.length);
        if (!marketplacePluginNames.has(pluginName)) {
            delisted.push(pluginId);
        }
    }
    return delisted;
}
/**
 * Detect delisted plugins across all marketplaces, auto-uninstall them,
 * and record them as flagged.
 *
 * This is the core delisting enforcement logic, shared between interactive
 * mode (useManagePlugins) and headless mode (main.tsx print path).
 *
 * @returns List of newly flagged plugin IDs
 */
async function detectAndUninstallDelistedPlugins() {
    await (0, pluginFlagging_js_1.loadFlaggedPlugins)();
    const installedPlugins = (0, installedPluginsManager_js_1.loadInstalledPluginsV2)();
    const alreadyFlagged = (0, pluginFlagging_js_1.getFlaggedPlugins)();
    // Read-only iteration — Safe variant so a corrupted config doesn't throw
    // out of this function (it's called in the same try-block as loadAllPlugins
    // in useManagePlugins, so a throw here would void loadAllPlugins' resilience).
    const knownMarketplaces = await (0, marketplaceManager_js_1.loadKnownMarketplacesConfigSafe)();
    const newlyFlagged = [];
    for (const marketplaceName of Object.keys(knownMarketplaces)) {
        try {
            const marketplace = await (0, marketplaceManager_js_1.getMarketplace)(marketplaceName);
            if (!marketplace.forceRemoveDeletedPlugins)
                continue;
            const delisted = detectDelistedPlugins(installedPlugins, marketplace, marketplaceName);
            for (const pluginId of delisted) {
                if (pluginId in alreadyFlagged)
                    continue;
                // Skip managed-only plugins — enterprise admin should handle those
                const installations = installedPlugins.plugins[pluginId] ?? [];
                const hasUserInstall = installations.some(i => i.scope === 'user' || i.scope === 'project' || i.scope === 'local');
                if (!hasUserInstall)
                    continue;
                // Auto-uninstall the delisted plugin from all user-controllable scopes
                for (const installation of installations) {
                    const { scope } = installation;
                    if (scope !== 'user' && scope !== 'project' && scope !== 'local') {
                        continue;
                    }
                    try {
                        await (0, pluginOperations_js_1.uninstallPluginOp)(pluginId, scope);
                    }
                    catch (error) {
                        (0, debug_js_1.logForDebugging)(`Failed to auto-uninstall delisted plugin ${pluginId} from ${scope}: ${(0, errors_js_1.errorMessage)(error)}`, { level: 'error' });
                    }
                }
                await (0, pluginFlagging_js_1.addFlaggedPlugin)(pluginId);
                newlyFlagged.push(pluginId);
            }
        }
        catch (error) {
            // Marketplace may not be available yet — log and continue
            (0, debug_js_1.logForDebugging)(`Failed to check for delisted plugins in "${marketplaceName}": ${(0, errors_js_1.errorMessage)(error)}`, { level: 'warn' });
        }
    }
    return newlyFlagged;
}
