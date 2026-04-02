"use strict";
/**
 * Shared helper functions for plugin installation
 *
 * This module contains common utilities used across the plugin installation
 * system to reduce code duplication and improve maintainability.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentTimestamp = getCurrentTimestamp;
exports.validatePathWithinBase = validatePathWithinBase;
exports.cacheAndRegisterPlugin = cacheAndRegisterPlugin;
exports.registerPluginInstallation = registerPluginInstallation;
exports.parsePluginId = parsePluginId;
exports.formatResolutionError = formatResolutionError;
exports.installResolvedPlugin = installResolvedPlugin;
exports.installPluginFromMarketplace = installPluginFromMarketplace;
const crypto_1 = require("crypto");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const index_js_1 = require("../../services/analytics/index.js");
const cwd_js_1 = require("../cwd.js");
const errors_js_1 = require("../errors.js");
const fsOperations_js_1 = require("../fsOperations.js");
const log_js_1 = require("../log.js");
const settings_js_1 = require("../settings/settings.js");
const pluginTelemetry_js_1 = require("../telemetry/pluginTelemetry.js");
const cacheUtils_js_1 = require("./cacheUtils.js");
const dependencyResolver_js_1 = require("./dependencyResolver.js");
const installedPluginsManager_js_1 = require("./installedPluginsManager.js");
const managedPlugins_js_1 = require("./managedPlugins.js");
const marketplaceManager_js_1 = require("./marketplaceManager.js");
const pluginIdentifier_js_1 = require("./pluginIdentifier.js");
const pluginLoader_js_1 = require("./pluginLoader.js");
const pluginPolicy_js_1 = require("./pluginPolicy.js");
const pluginVersioning_js_1 = require("./pluginVersioning.js");
const schemas_js_1 = require("./schemas.js");
const zipCache_js_1 = require("./zipCache.js");
/**
 * Get current ISO timestamp
 */
function getCurrentTimestamp() {
    return new Date().toISOString();
}
/**
 * Validate that a resolved path stays within a base directory.
 * Prevents path traversal attacks where malicious paths like './../../../etc/passwd'
 * could escape the expected directory.
 *
 * @param basePath - The base directory that the resolved path must stay within
 * @param relativePath - The relative path to validate
 * @returns The validated absolute path
 * @throws Error if the path would escape the base directory
 */
function validatePathWithinBase(basePath, relativePath) {
    const resolvedPath = (0, path_1.resolve)(basePath, relativePath);
    const normalizedBase = (0, path_1.resolve)(basePath) + path_1.sep;
    // Check if the resolved path starts with the base path
    // Adding sep ensures we don't match partial directory names
    // e.g., /foo/bar should not match /foo/barbaz
    if (!resolvedPath.startsWith(normalizedBase) &&
        resolvedPath !== (0, path_1.resolve)(basePath)) {
        throw new Error(`Path traversal detected: "${relativePath}" would escape the base directory`);
    }
    return resolvedPath;
}
/**
 * Cache a plugin (local or external) and add it to installed_plugins.json
 *
 * This function combines the common pattern of:
 * 1. Caching a plugin to ~/.claude/plugins/cache/
 * 2. Adding it to the installed plugins registry
 *
 * Both local plugins (with string source like "./path") and external plugins
 * (with object source like {source: "github", ...}) are cached to the same
 * location to ensure consistent behavior.
 *
 * @param pluginId - Plugin ID in "plugin@marketplace" format
 * @param entry - Plugin marketplace entry
 * @param scope - Installation scope (user, project, local, or managed). Defaults to 'user'.
 *                'managed' scope is used for plugins installed automatically from managed settings.
 * @param projectPath - Project path (required for project/local scopes)
 * @param localSourcePath - For local plugins, the resolved absolute path to the source directory
 * @returns The installation path
 */
async function cacheAndRegisterPlugin(pluginId, entry, scope = 'user', projectPath, localSourcePath) {
    // For local plugins, we need the resolved absolute path
    // Cast to PluginSource since cachePlugin handles any string path at runtime
    const source = typeof entry.source === 'string' && localSourcePath
        ? localSourcePath
        : entry.source;
    const cacheResult = await (0, pluginLoader_js_1.cachePlugin)(source, {
        manifest: entry,
    });
    // For local plugins, use the original source path for Git SHA calculation
    // because the cached temp directory doesn't have .git (it's copied from a
    // subdirectory of the marketplace git repo). For external plugins, use the
    // cached path. For git-subdir sources, cachePlugin already captured the SHA
    // before discarding the ephemeral clone (the extracted subdir has no .git).
    const pathForGitSha = localSourcePath || cacheResult.path;
    const gitCommitSha = cacheResult.gitCommitSha ?? (await (0, installedPluginsManager_js_1.getGitCommitSha)(pathForGitSha));
    const now = getCurrentTimestamp();
    const version = await (0, pluginVersioning_js_1.calculatePluginVersion)(pluginId, entry.source, cacheResult.manifest, pathForGitSha, entry.version, cacheResult.gitCommitSha);
    // Move the cached plugin to the versioned path: cache/marketplace/plugin/version/
    const versionedPath = (0, pluginLoader_js_1.getVersionedCachePath)(pluginId, version);
    let finalPath = cacheResult.path;
    // Only move if the paths are different and plugin was cached to a different location
    if (cacheResult.path !== versionedPath) {
        // Create the versioned directory structure
        await (0, fsOperations_js_1.getFsImplementation)().mkdir((0, path_1.dirname)(versionedPath));
        // Remove existing versioned path if present (force: no-op if missing)
        await (0, promises_1.rm)(versionedPath, { recursive: true, force: true });
        // Check if versionedPath is a subdirectory of cacheResult.path
        // This happens when marketplace name equals plugin name (e.g., "exa-mcp-server@exa-mcp-server")
        // In this case, we can't directly rename because we'd be moving a directory into itself
        const normalizedCachePath = cacheResult.path.endsWith(path_1.sep)
            ? cacheResult.path
            : cacheResult.path + path_1.sep;
        const isSubdirectory = versionedPath.startsWith(normalizedCachePath);
        if (isSubdirectory) {
            // Move to a temp location first, then to final destination
            // We can't directly rename/copy a directory into its own subdirectory
            // Use the parent of cacheResult.path (same filesystem) to avoid EXDEV
            // errors when /tmp is on a different filesystem (e.g., tmpfs)
            const tempPath = (0, path_1.join)((0, path_1.dirname)(cacheResult.path), `.claude-plugin-temp-${Date.now()}-${(0, crypto_1.randomBytes)(4).toString('hex')}`);
            await (0, promises_1.rename)(cacheResult.path, tempPath);
            await (0, fsOperations_js_1.getFsImplementation)().mkdir((0, path_1.dirname)(versionedPath));
            await (0, promises_1.rename)(tempPath, versionedPath);
        }
        else {
            // Move the cached plugin to the versioned location
            await (0, promises_1.rename)(cacheResult.path, versionedPath);
        }
        finalPath = versionedPath;
    }
    // Zip cache mode: convert directory to ZIP and remove the directory
    if ((0, zipCache_js_1.isPluginZipCacheEnabled)()) {
        const zipPath = (0, pluginLoader_js_1.getVersionedZipCachePath)(pluginId, version);
        await (0, zipCache_js_1.convertDirectoryToZipInPlace)(finalPath, zipPath);
        finalPath = zipPath;
    }
    // Add to both V1 and V2 installed_plugins files with correct scope
    (0, installedPluginsManager_js_1.addInstalledPlugin)(pluginId, {
        version,
        installedAt: now,
        lastUpdated: now,
        installPath: finalPath,
        gitCommitSha,
    }, scope, projectPath);
    return finalPath;
}
/**
 * Register a plugin installation without caching
 *
 * Used for local plugins that are already on disk and don't need remote caching.
 * External plugins should use cacheAndRegisterPlugin() instead.
 *
 * @param info - Plugin installation information
 * @param scope - Installation scope (user, project, local, or managed). Defaults to 'user'.
 *                'managed' scope is used for plugins registered from managed settings.
 * @param projectPath - Project path (required for project/local scopes)
 */
function registerPluginInstallation(info, scope = 'user', projectPath) {
    const now = getCurrentTimestamp();
    (0, installedPluginsManager_js_1.addInstalledPlugin)(info.pluginId, {
        version: info.version || 'unknown',
        installedAt: now,
        lastUpdated: now,
        installPath: info.installPath,
    }, scope, projectPath);
}
/**
 * Parse plugin ID into components
 *
 * @param pluginId - Plugin ID in "plugin@marketplace" format
 * @returns Parsed components or null if invalid
 */
function parsePluginId(pluginId) {
    const parts = pluginId.split('@');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return null;
    }
    return {
        name: parts[0],
        marketplace: parts[1],
    };
}
/**
 * Format a failed ResolutionResult into a user-facing message. Unified on
 * the richer CLI messages (the "Is the X marketplace added?" hint is useful
 * for UI users too).
 */
function formatResolutionError(r) {
    switch (r.reason) {
        case 'cycle':
            return `Dependency cycle: ${r.chain.join(' → ')}`;
        case 'cross-marketplace': {
            const depMkt = (0, pluginIdentifier_js_1.parsePluginIdentifier)(r.dependency).marketplace;
            const where = depMkt
                ? `marketplace "${depMkt}"`
                : 'a different marketplace';
            const hint = depMkt
                ? ` Add "${depMkt}" to allowCrossMarketplaceDependenciesOn in the ROOT marketplace's marketplace.json (the marketplace of the plugin you're installing — only its allowlist applies; no transitive trust).`
                : '';
            return `Dependency "${r.dependency}" (required by ${r.requiredBy}) is in ${where}, which is not in the allowlist — cross-marketplace dependencies are blocked by default. Install it manually first.${hint}`;
        }
        case 'not-found': {
            const { marketplace: depMkt } = (0, pluginIdentifier_js_1.parsePluginIdentifier)(r.missing);
            return depMkt
                ? `Dependency "${r.missing}" (required by ${r.requiredBy}) not found. Is the "${depMkt}" marketplace added?`
                : `Dependency "${r.missing}" (required by ${r.requiredBy}) not found in any configured marketplace`;
        }
    }
}
/**
 * Core plugin install logic, shared by the CLI path (`installPluginOp`) and
 * the interactive UI path (`installPluginFromMarketplace`). Given a
 * pre-resolved marketplace entry, this:
 *
 *   1. Guards against local-source plugins without a marketplace install
 *      location (would silently no-op otherwise).
 *   2. Resolves the transitive dependency closure (when PLUGIN_DEPENDENCIES
 *      is on; trivial single-plugin closure otherwise).
 *   3. Writes the entire closure to enabledPlugins in one settings update.
 *   4. Caches each closure member (downloads/copies sources as needed).
 *   5. Clears memoization caches.
 *
 * Returns a structured result. Message formatting, analytics, and top-level
 * error wrapping stay in the caller-specific wrappers.
 *
 * @param marketplaceInstallLocation Pass this if the caller already has it
 *   (from a prior marketplace search) to avoid a redundant lookup.
 */
async function installResolvedPlugin({ pluginId, entry, scope, marketplaceInstallLocation, }) {
    const settingSource = (0, pluginIdentifier_js_1.scopeToSettingSource)(scope);
    // ── Policy guard ──
    // Org-blocked plugins (managed-settings.json enabledPlugins: false) cannot
    // be installed. Checked here so all install paths (CLI, UI, hint-triggered)
    // are covered in one place.
    if ((0, pluginPolicy_js_1.isPluginBlockedByPolicy)(pluginId)) {
        return { ok: false, reason: 'blocked-by-policy', pluginName: entry.name };
    }
    // ── Resolve dependency closure ──
    // depInfo caches marketplace lookups so the materialize loop doesn't
    // re-fetch. Seed the root if the caller gave us its install location.
    const depInfo = new Map();
    // Without this guard, a local-source root with undefined
    // marketplaceInstallLocation falls through: depInfo isn't seeded, the
    // materialize loop's `if (!info) continue` skips the root, and the user
    // sees "Successfully installed" while nothing is cached.
    if ((0, schemas_js_1.isLocalPluginSource)(entry.source) && !marketplaceInstallLocation) {
        return {
            ok: false,
            reason: 'local-source-no-location',
            pluginName: entry.name,
        };
    }
    if (marketplaceInstallLocation) {
        depInfo.set(pluginId, { entry, marketplaceInstallLocation });
    }
    const rootMarketplace = (0, pluginIdentifier_js_1.parsePluginIdentifier)(pluginId).marketplace;
    const allowedCrossMarketplaces = new Set((rootMarketplace
        ? (await (0, marketplaceManager_js_1.getMarketplaceCacheOnly)(rootMarketplace))
            ?.allowCrossMarketplaceDependenciesOn
        : undefined) ?? []);
    const resolution = await (0, dependencyResolver_js_1.resolveDependencyClosure)(pluginId, async (id) => {
        if (depInfo.has(id))
            return depInfo.get(id).entry;
        if (id === pluginId)
            return entry;
        const info = await (0, marketplaceManager_js_1.getPluginById)(id);
        if (info)
            depInfo.set(id, info);
        return info?.entry ?? null;
    }, (0, dependencyResolver_js_1.getEnabledPluginIdsForScope)(settingSource), allowedCrossMarketplaces);
    if (!resolution.ok) {
        return { ok: false, reason: 'resolution-failed', resolution };
    }
    // ── Policy guard for transitive dependencies ──
    // The root plugin was already checked above, but any dependency in the
    // closure could also be policy-blocked. Check before writing to settings
    // so a non-blocked plugin can't pull in a blocked dependency.
    for (const id of resolution.closure) {
        if (id !== pluginId && (0, pluginPolicy_js_1.isPluginBlockedByPolicy)(id)) {
            return {
                ok: false,
                reason: 'dependency-blocked-by-policy',
                pluginName: entry.name,
                blockedDependency: id,
            };
        }
    }
    // ── ACTION: write entire closure to settings in one call ──
    const closureEnabled = {};
    for (const id of resolution.closure)
        closureEnabled[id] = true;
    const { error } = (0, settings_js_1.updateSettingsForSource)(settingSource, {
        enabledPlugins: {
            ...(0, settings_js_1.getSettingsForSource)(settingSource)?.enabledPlugins,
            ...closureEnabled,
        },
    });
    if (error) {
        return {
            ok: false,
            reason: 'settings-write-failed',
            message: error.message,
        };
    }
    // ── Materialize: cache each closure member ──
    const projectPath = scope !== 'user' ? (0, cwd_js_1.getCwd)() : undefined;
    for (const id of resolution.closure) {
        let info = depInfo.get(id);
        // Root wasn't pre-seeded (caller didn't pass marketplaceInstallLocation
        // for a non-local source). Fetch now; it's needed for the cache write.
        if (!info && id === pluginId) {
            const mktLocation = (await (0, marketplaceManager_js_1.getPluginById)(id))?.marketplaceInstallLocation;
            if (mktLocation)
                info = { entry, marketplaceInstallLocation: mktLocation };
        }
        if (!info)
            continue;
        let localSourcePath;
        const { source } = info.entry;
        if ((0, schemas_js_1.isLocalPluginSource)(source)) {
            localSourcePath = validatePathWithinBase(info.marketplaceInstallLocation, source);
        }
        await cacheAndRegisterPlugin(id, info.entry, scope, projectPath, localSourcePath);
    }
    (0, cacheUtils_js_1.clearAllCaches)();
    const depNote = (0, dependencyResolver_js_1.formatDependencyCountSuffix)(resolution.closure.filter(id => id !== pluginId));
    return { ok: true, closure: resolution.closure, depNote };
}
/**
 * Install a single plugin from a marketplace with the specified scope.
 * Interactive-UI wrapper around `installResolvedPlugin` — adds try/catch,
 * analytics, and UI-style message formatting.
 */
async function installPluginFromMarketplace({ pluginId, entry, marketplaceName, scope = 'user', trigger = 'user', }) {
    try {
        // Look up the marketplace install location for local-source plugins.
        // Without this, plugins with relative-path sources fail from the
        // interactive UI path (/plugin install) even though the CLI path works.
        const pluginInfo = await (0, marketplaceManager_js_1.getPluginById)(pluginId);
        const marketplaceInstallLocation = pluginInfo?.marketplaceInstallLocation;
        const result = await installResolvedPlugin({
            pluginId,
            entry,
            scope,
            marketplaceInstallLocation,
        });
        if (!result.ok) {
            switch (result.reason) {
                case 'local-source-no-location':
                    return {
                        success: false,
                        error: `Cannot install local plugin "${result.pluginName}" without marketplace install location`,
                    };
                case 'settings-write-failed':
                    return {
                        success: false,
                        error: `Failed to update settings: ${result.message}`,
                    };
                case 'resolution-failed':
                    return {
                        success: false,
                        error: formatResolutionError(result.resolution),
                    };
                case 'blocked-by-policy':
                    return {
                        success: false,
                        error: `Plugin "${result.pluginName}" is blocked by your organization's policy and cannot be installed`,
                    };
                case 'dependency-blocked-by-policy':
                    return {
                        success: false,
                        error: `Cannot install "${result.pluginName}": dependency "${result.blockedDependency}" is blocked by your organization's policy`,
                    };
            }
        }
        // _PROTO_* routes to PII-tagged plugin_name/marketplace_name BQ columns.
        // plugin_id kept in additional_metadata (redacted to 'third-party' for
        // non-official) because dbt external_claude_code_plugin_installs.sql
        // extracts $.plugin_id for official-marketplace install tracking. Other
        // plugin lifecycle events drop the blob key — no downstream consumers.
        (0, index_js_1.logEvent)('tengu_plugin_installed', {
            _PROTO_plugin_name: entry.name,
            _PROTO_marketplace_name: marketplaceName,
            plugin_id: ((0, pluginIdentifier_js_1.isOfficialMarketplaceName)(marketplaceName)
                ? pluginId
                : 'third-party'),
            trigger: trigger,
            install_source: (trigger === 'hint'
                ? 'ui-suggestion'
                : 'ui-discover'),
            ...(0, pluginTelemetry_js_1.buildPluginTelemetryFields)(entry.name, marketplaceName, (0, managedPlugins_js_1.getManagedPluginNames)()),
            ...(entry.version && {
                version: entry.version,
            }),
        });
        return {
            success: true,
            message: `✓ Installed ${entry.name}${result.depNote}. Run /reload-plugins to activate.`,
        };
    }
    catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        (0, log_js_1.logError)((0, errors_js_1.toError)(err));
        return { success: false, error: `Failed to install: ${errorMessage}` };
    }
}
