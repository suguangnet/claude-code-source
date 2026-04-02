"use strict";
/**
 * Plugin installation for headless/CCR mode.
 *
 * This module provides plugin installation without AppState updates,
 * suitable for non-interactive environments like CCR.
 *
 * When CLAUDE_CODE_PLUGIN_USE_ZIP_CACHE is enabled, plugins are stored as
 * ZIPs on a mounted volume. The storage layer (pluginLoader.ts) handles
 * ZIP creation on install and extraction on load transparently.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.installPluginsForHeadless = installPluginsForHeadless;
const index_js_1 = require("../../services/analytics/index.js");
const cleanupRegistry_js_1 = require("../cleanupRegistry.js");
const debug_js_1 = require("../debug.js");
const diagLogs_js_1 = require("../diagLogs.js");
const fsOperations_js_1 = require("../fsOperations.js");
const log_js_1 = require("../log.js");
const marketplaceManager_js_1 = require("./marketplaceManager.js");
const pluginBlocklist_js_1 = require("./pluginBlocklist.js");
const pluginLoader_js_1 = require("./pluginLoader.js");
const reconciler_js_1 = require("./reconciler.js");
const zipCache_js_1 = require("./zipCache.js");
const zipCacheAdapters_js_1 = require("./zipCacheAdapters.js");
/**
 * Install plugins for headless/CCR mode.
 *
 * This is the headless equivalent of performBackgroundPluginInstallations(),
 * but without AppState updates (no UI to update in headless mode).
 *
 * @returns true if any plugins were installed (caller should refresh MCP)
 */
async function installPluginsForHeadless() {
    const zipCacheMode = (0, zipCache_js_1.isPluginZipCacheEnabled)();
    (0, debug_js_1.logForDebugging)(`installPluginsForHeadless: starting${zipCacheMode ? ' (zip cache mode)' : ''}`);
    // Register seed marketplaces (CLAUDE_CODE_PLUGIN_SEED_DIR) before diffing.
    // Idempotent; no-op if seed not configured. Without this, findMissingMarketplaces
    // would see seed entries as missing → clone → defeats seed's purpose.
    //
    // If registration changed state, clear caches so the early plugin-load pass
    // (which runs during CLI startup before this function) doesn't keep stale
    // "marketplace not found" results. Without this clear, a first-boot headless
    // run with a seed-cached plugin would show 0 plugin commands/agents/skills
    // in the init message even though the seed has everything.
    const seedChanged = await (0, marketplaceManager_js_1.registerSeedMarketplaces)();
    if (seedChanged) {
        (0, marketplaceManager_js_1.clearMarketplacesCache)();
        (0, pluginLoader_js_1.clearPluginCache)('headlessPluginInstall: seed marketplaces registered');
    }
    // Ensure zip cache directory structure exists
    if (zipCacheMode) {
        await (0, fsOperations_js_1.getFsImplementation)().mkdir((0, zipCache_js_1.getZipCacheMarketplacesDir)());
        await (0, fsOperations_js_1.getFsImplementation)().mkdir((0, zipCache_js_1.getZipCachePluginsDir)());
    }
    // Declared now includes an implicit claude-plugins-official entry when any
    // enabled plugin references it (see getDeclaredMarketplaces). This routes
    // the official marketplace through the same reconciler path as any other —
    // which composes correctly with CLAUDE_CODE_PLUGIN_SEED_DIR: seed registers
    // it in known_marketplaces.json, reconciler diff sees it as upToDate, no clone.
    const declaredCount = Object.keys((0, marketplaceManager_js_1.getDeclaredMarketplaces)()).length;
    const metrics = {
        marketplaces_installed: 0,
        delisted_count: 0,
    };
    // Initialize from seedChanged so the caller (print.ts) calls
    // refreshPluginState() → clearCommandsCache/clearAgentDefinitionsCache
    // when seed registration added marketplaces. Without this, the caller
    // only refreshes when an actual plugin install happened.
    let pluginsChanged = seedChanged;
    try {
        if (declaredCount === 0) {
            (0, debug_js_1.logForDebugging)('installPluginsForHeadless: no marketplaces declared');
        }
        else {
            // Reconcile declared marketplaces (settings intent + implicit official)
            // with materialized state. Zip cache: skip unsupported source types.
            const reconcileResult = await (0, diagLogs_js_1.withDiagnosticsTiming)('headless_marketplace_reconcile', () => (0, reconciler_js_1.reconcileMarketplaces)({
                skip: zipCacheMode
                    ? (_name, source) => !(0, zipCache_js_1.isMarketplaceSourceSupportedByZipCache)(source)
                    : undefined,
                onProgress: event => {
                    if (event.type === 'installed') {
                        (0, debug_js_1.logForDebugging)(`installPluginsForHeadless: installed marketplace ${event.name}`);
                    }
                    else if (event.type === 'failed') {
                        (0, debug_js_1.logForDebugging)(`installPluginsForHeadless: failed to install marketplace ${event.name}: ${event.error}`);
                    }
                },
            }), r => ({
                installed_count: r.installed.length,
                updated_count: r.updated.length,
                failed_count: r.failed.length,
                skipped_count: r.skipped.length,
            }));
            if (reconcileResult.skipped.length > 0) {
                (0, debug_js_1.logForDebugging)(`installPluginsForHeadless: skipped ${reconcileResult.skipped.length} marketplace(s) unsupported by zip cache: ${reconcileResult.skipped.join(', ')}`);
            }
            const marketplacesChanged = reconcileResult.installed.length + reconcileResult.updated.length;
            // Clear caches so newly-installed marketplace plugins are discoverable.
            // Plugin caching is the loader's job — after caches clear, the caller's
            // refreshPluginState() → loadAllPlugins() will cache any missing plugins
            // from the newly-materialized marketplaces.
            if (marketplacesChanged > 0) {
                (0, marketplaceManager_js_1.clearMarketplacesCache)();
                (0, pluginLoader_js_1.clearPluginCache)('headlessPluginInstall: marketplaces reconciled');
                pluginsChanged = true;
            }
            metrics.marketplaces_installed = marketplacesChanged;
        }
        // Zip cache: save marketplace JSONs for offline access on ephemeral containers.
        // Runs unconditionally so that steady-state containers (all plugins installed)
        // still sync marketplace data that may have been cloned in a previous run.
        if (zipCacheMode) {
            await (0, zipCacheAdapters_js_1.syncMarketplacesToZipCache)();
        }
        // Delisting enforcement
        const newlyDelisted = await (0, pluginBlocklist_js_1.detectAndUninstallDelistedPlugins)();
        metrics.delisted_count = newlyDelisted.length;
        if (newlyDelisted.length > 0) {
            pluginsChanged = true;
        }
        if (pluginsChanged) {
            (0, pluginLoader_js_1.clearPluginCache)('headlessPluginInstall: plugins changed');
        }
        // Zip cache: register session cleanup for extracted plugin temp dirs
        if (zipCacheMode) {
            (0, cleanupRegistry_js_1.registerCleanup)(zipCache_js_1.cleanupSessionPluginCache);
        }
        return pluginsChanged;
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return false;
    }
    finally {
        (0, index_js_1.logEvent)('tengu_headless_plugin_install', metrics);
    }
}
