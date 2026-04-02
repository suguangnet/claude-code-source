"use strict";
/**
 * Background plugin and marketplace installation manager
 *
 * This module handles automatic installation of plugins and marketplaces
 * from trusted sources (repository and user settings) without blocking startup.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.performBackgroundPluginInstallations = performBackgroundPluginInstallations;
const debug_js_1 = require("../../utils/debug.js");
const diagLogs_js_1 = require("../../utils/diagLogs.js");
const log_js_1 = require("../../utils/log.js");
const marketplaceManager_js_1 = require("../../utils/plugins/marketplaceManager.js");
const pluginLoader_js_1 = require("../../utils/plugins/pluginLoader.js");
const reconciler_js_1 = require("../../utils/plugins/reconciler.js");
const refresh_js_1 = require("../../utils/plugins/refresh.js");
const index_js_1 = require("../analytics/index.js");
/**
 * Update marketplace installation status in app state
 */
function updateMarketplaceStatus(setAppState, name, status, error) {
    setAppState(prevState => ({
        ...prevState,
        plugins: {
            ...prevState.plugins,
            installationStatus: {
                ...prevState.plugins.installationStatus,
                marketplaces: prevState.plugins.installationStatus.marketplaces.map(m => (m.name === name ? { ...m, status, error } : m)),
            },
        },
    }));
}
/**
 * Perform background plugin startup checks and installations.
 *
 * This is a thin wrapper around reconcileMarketplaces() that maps onProgress
 * events to AppState updates for the REPL UI. After marketplaces are
 * reconciled:
 * - New installs → auto-refresh plugins (fixes "plugin-not-found" errors
 *   from the initial cache-only load on fresh homespace/cleared cache)
 * - Updates only → set needsRefresh, show notification for /reload-plugins
 */
async function performBackgroundPluginInstallations(setAppState) {
    (0, debug_js_1.logForDebugging)('performBackgroundPluginInstallations called');
    try {
        // Compute diff upfront for initial UI status (pending spinners)
        const declared = (0, marketplaceManager_js_1.getDeclaredMarketplaces)();
        const materialized = await (0, marketplaceManager_js_1.loadKnownMarketplacesConfig)().catch(() => ({}));
        const diff = (0, reconciler_js_1.diffMarketplaces)(declared, materialized);
        const pendingNames = [
            ...diff.missing,
            ...diff.sourceChanged.map(c => c.name),
        ];
        // Initialize AppState with pending status. No per-plugin pending status —
        // plugin load is fast (cache hit or local copy); marketplace clone is the
        // slow part worth showing progress for.
        setAppState(prev => ({
            ...prev,
            plugins: {
                ...prev.plugins,
                installationStatus: {
                    marketplaces: pendingNames.map(name => ({
                        name,
                        status: 'pending',
                    })),
                    plugins: [],
                },
            },
        }));
        if (pendingNames.length === 0) {
            return;
        }
        (0, debug_js_1.logForDebugging)(`Installing ${pendingNames.length} marketplace(s) in background`);
        const result = await (0, reconciler_js_1.reconcileMarketplaces)({
            onProgress: event => {
                switch (event.type) {
                    case 'installing':
                        updateMarketplaceStatus(setAppState, event.name, 'installing');
                        break;
                    case 'installed':
                        updateMarketplaceStatus(setAppState, event.name, 'installed');
                        break;
                    case 'failed':
                        updateMarketplaceStatus(setAppState, event.name, 'failed', event.error);
                        break;
                }
            },
        });
        const metrics = {
            installed_count: result.installed.length,
            updated_count: result.updated.length,
            failed_count: result.failed.length,
            up_to_date_count: result.upToDate.length,
        };
        (0, index_js_1.logEvent)('tengu_marketplace_background_install', metrics);
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'tengu_marketplace_background_install', metrics);
        if (result.installed.length > 0) {
            // New marketplaces were installed — auto-refresh plugins. This fixes
            // "Plugin not found in marketplace" errors from the initial cache-only
            // load (e.g., fresh homespace where marketplace cache was empty).
            // refreshActivePlugins clears all caches, reloads plugins, and bumps
            // pluginReconnectKey so MCP connections are re-established.
            (0, marketplaceManager_js_1.clearMarketplacesCache)();
            (0, debug_js_1.logForDebugging)(`Auto-refreshing plugins after ${result.installed.length} new marketplace(s) installed`);
            try {
                await (0, refresh_js_1.refreshActivePlugins)(setAppState);
            }
            catch (refreshError) {
                // If auto-refresh fails, fall back to needsRefresh notification so
                // the user can manually run /reload-plugins to recover.
                (0, log_js_1.logError)(refreshError);
                (0, debug_js_1.logForDebugging)(`Auto-refresh failed, falling back to needsRefresh: ${refreshError}`, { level: 'warn' });
                (0, pluginLoader_js_1.clearPluginCache)('performBackgroundPluginInstallations: auto-refresh failed');
                setAppState(prev => {
                    if (prev.plugins.needsRefresh)
                        return prev;
                    return {
                        ...prev,
                        plugins: { ...prev.plugins, needsRefresh: true },
                    };
                });
            }
        }
        else if (result.updated.length > 0) {
            // Existing marketplaces updated — notify user to run /reload-plugins.
            // Updates are less urgent and the user should choose when to apply them.
            (0, marketplaceManager_js_1.clearMarketplacesCache)();
            (0, pluginLoader_js_1.clearPluginCache)('performBackgroundPluginInstallations: marketplaces reconciled');
            setAppState(prev => {
                if (prev.plugins.needsRefresh)
                    return prev;
                return {
                    ...prev,
                    plugins: { ...prev.plugins, needsRefresh: true },
                };
            });
        }
    }
    catch (error) {
        (0, log_js_1.logError)(error);
    }
}
