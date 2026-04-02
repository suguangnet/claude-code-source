"use strict";
/**
 * LSP Plugin Recommendation Utility
 *
 * Scans installed marketplaces for LSP plugins and recommends plugins
 * based on file extensions, but ONLY when the LSP binary is already
 * installed on the system.
 *
 * Limitation: Can only detect LSP plugins that declare their servers
 * inline in the marketplace entry. Plugins with separate .lsp.json files
 * are not detectable until after installation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMatchingLspPlugins = getMatchingLspPlugins;
exports.addToNeverSuggest = addToNeverSuggest;
exports.incrementIgnoredCount = incrementIgnoredCount;
exports.isLspRecommendationsDisabled = isLspRecommendationsDisabled;
exports.resetIgnoredCount = resetIgnoredCount;
const path_1 = require("path");
const binaryCheck_js_1 = require("../binaryCheck.js");
const config_js_1 = require("../config.js");
const debug_js_1 = require("../debug.js");
const installedPluginsManager_js_1 = require("./installedPluginsManager.js");
const marketplaceManager_js_1 = require("./marketplaceManager.js");
const schemas_js_1 = require("./schemas.js");
// Maximum number of times user can ignore recommendations before we stop showing
const MAX_IGNORED_COUNT = 5;
/**
 * Check if a marketplace is official (from Anthropic)
 */
function isOfficialMarketplace(name) {
    return schemas_js_1.ALLOWED_OFFICIAL_MARKETPLACE_NAMES.has(name.toLowerCase());
}
/**
 * Extract LSP info (extensions and command) from inline lspServers config.
 *
 * NOTE: Can only read inline configs, not external .lsp.json files.
 * String paths are skipped as they reference files only available after installation.
 *
 * @param lspServers - The lspServers field from PluginMarketplaceEntry
 * @returns LSP info with extensions and command, or null if not extractable
 */
function extractLspInfoFromManifest(lspServers) {
    if (!lspServers) {
        return null;
    }
    // If it's a string path (e.g., "./.lsp.json"), we can't read it from marketplace
    if (typeof lspServers === 'string') {
        (0, debug_js_1.logForDebugging)('[lspRecommendation] Skipping string path lspServers (not readable from marketplace)');
        return null;
    }
    // If it's an array, process each element
    if (Array.isArray(lspServers)) {
        for (const item of lspServers) {
            // Skip string paths in arrays
            if (typeof item === 'string') {
                continue;
            }
            // Try to extract from inline config object
            const info = extractFromServerConfigRecord(item);
            if (info) {
                return info;
            }
        }
        return null;
    }
    // It's an inline config object: Record<string, LspServerConfig>
    return extractFromServerConfigRecord(lspServers);
}
/**
 * Extract LSP info from a server config record (inline object format)
 */
/**
 * Type guard to check if a value is a record object
 */
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function extractFromServerConfigRecord(serverConfigs) {
    const extensions = new Set();
    let command = null;
    for (const [_serverName, config] of Object.entries(serverConfigs)) {
        if (!isRecord(config)) {
            continue;
        }
        // Get command from first valid server config
        if (!command && typeof config.command === 'string') {
            command = config.command;
        }
        // Collect all extensions from extensionToLanguage mapping
        const extMapping = config.extensionToLanguage;
        if (isRecord(extMapping)) {
            for (const ext of Object.keys(extMapping)) {
                extensions.add(ext.toLowerCase());
            }
        }
    }
    if (!command || extensions.size === 0) {
        return null;
    }
    return { extensions, command };
}
/**
 * Get all LSP plugins from all installed marketplaces
 *
 * @returns Map of pluginId to plugin info with LSP metadata
 */
async function getLspPluginsFromMarketplaces() {
    const result = new Map();
    try {
        const config = await (0, marketplaceManager_js_1.loadKnownMarketplacesConfig)();
        for (const marketplaceName of Object.keys(config)) {
            try {
                const marketplace = await (0, marketplaceManager_js_1.getMarketplace)(marketplaceName);
                const isOfficial = isOfficialMarketplace(marketplaceName);
                for (const entry of marketplace.plugins) {
                    // Skip plugins without lspServers
                    if (!entry.lspServers) {
                        continue;
                    }
                    const lspInfo = extractLspInfoFromManifest(entry.lspServers);
                    if (!lspInfo) {
                        continue;
                    }
                    const pluginId = `${entry.name}@${marketplaceName}`;
                    result.set(pluginId, {
                        entry,
                        marketplaceName,
                        extensions: lspInfo.extensions,
                        command: lspInfo.command,
                        isOfficial,
                    });
                }
            }
            catch (error) {
                (0, debug_js_1.logForDebugging)(`[lspRecommendation] Failed to load marketplace ${marketplaceName}: ${error}`);
            }
        }
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`[lspRecommendation] Failed to load marketplaces config: ${error}`);
    }
    return result;
}
/**
 * Find matching LSP plugins for a file path.
 *
 * Returns recommendations for plugins that:
 * 1. Support the file's extension
 * 2. Have their LSP binary installed on the system
 * 3. Are not already installed
 * 4. Are not in the user's "never suggest" list
 *
 * Results are sorted with official marketplace plugins first.
 *
 * @param filePath - Path to the file to find LSP plugins for
 * @returns Array of matching plugin recommendations (empty if none or disabled)
 */
async function getMatchingLspPlugins(filePath) {
    // Check if globally disabled
    if (isLspRecommendationsDisabled()) {
        (0, debug_js_1.logForDebugging)('[lspRecommendation] Recommendations are disabled');
        return [];
    }
    // Extract file extension
    const ext = (0, path_1.extname)(filePath).toLowerCase();
    if (!ext) {
        (0, debug_js_1.logForDebugging)('[lspRecommendation] No file extension found');
        return [];
    }
    (0, debug_js_1.logForDebugging)(`[lspRecommendation] Looking for LSP plugins for ${ext}`);
    // Get all LSP plugins from marketplaces
    const allLspPlugins = await getLspPluginsFromMarketplaces();
    // Get config for filtering
    const config = (0, config_js_1.getGlobalConfig)();
    const neverPlugins = config.lspRecommendationNeverPlugins ?? [];
    // Filter to matching plugins
    const matchingPlugins = [];
    for (const [pluginId, info] of allLspPlugins) {
        // Check extension match
        if (!info.extensions.has(ext)) {
            continue;
        }
        // Filter: not in "never" list
        if (neverPlugins.includes(pluginId)) {
            (0, debug_js_1.logForDebugging)(`[lspRecommendation] Skipping ${pluginId} (in never suggest list)`);
            continue;
        }
        // Filter: not already installed
        if ((0, installedPluginsManager_js_1.isPluginInstalled)(pluginId)) {
            (0, debug_js_1.logForDebugging)(`[lspRecommendation] Skipping ${pluginId} (already installed)`);
            continue;
        }
        matchingPlugins.push({ info, pluginId });
    }
    // Filter: binary must be installed (async check)
    const pluginsWithBinary = [];
    for (const { info, pluginId } of matchingPlugins) {
        const binaryExists = await (0, binaryCheck_js_1.isBinaryInstalled)(info.command);
        if (binaryExists) {
            pluginsWithBinary.push({ info, pluginId });
            (0, debug_js_1.logForDebugging)(`[lspRecommendation] Binary '${info.command}' found for ${pluginId}`);
        }
        else {
            (0, debug_js_1.logForDebugging)(`[lspRecommendation] Skipping ${pluginId} (binary '${info.command}' not found)`);
        }
    }
    // Sort: official marketplaces first
    pluginsWithBinary.sort((a, b) => {
        if (a.info.isOfficial && !b.info.isOfficial)
            return -1;
        if (!a.info.isOfficial && b.info.isOfficial)
            return 1;
        return 0;
    });
    // Convert to recommendations
    return pluginsWithBinary.map(({ info, pluginId }) => ({
        pluginId,
        pluginName: info.entry.name,
        marketplaceName: info.marketplaceName,
        description: info.entry.description,
        isOfficial: info.isOfficial,
        extensions: Array.from(info.extensions),
        command: info.command,
    }));
}
/**
 * Add a plugin to the "never suggest" list
 *
 * @param pluginId - Plugin ID to never suggest again
 */
function addToNeverSuggest(pluginId) {
    (0, config_js_1.saveGlobalConfig)(currentConfig => {
        const current = currentConfig.lspRecommendationNeverPlugins ?? [];
        if (current.includes(pluginId)) {
            return currentConfig;
        }
        return {
            ...currentConfig,
            lspRecommendationNeverPlugins: [...current, pluginId],
        };
    });
    (0, debug_js_1.logForDebugging)(`[lspRecommendation] Added ${pluginId} to never suggest`);
}
/**
 * Increment the ignored recommendation count.
 * After MAX_IGNORED_COUNT ignores, recommendations are disabled.
 */
function incrementIgnoredCount() {
    (0, config_js_1.saveGlobalConfig)(currentConfig => {
        const newCount = (currentConfig.lspRecommendationIgnoredCount ?? 0) + 1;
        return {
            ...currentConfig,
            lspRecommendationIgnoredCount: newCount,
        };
    });
    (0, debug_js_1.logForDebugging)('[lspRecommendation] Incremented ignored count');
}
/**
 * Check if LSP recommendations are disabled.
 * Disabled when:
 * - User explicitly disabled via config
 * - User has ignored MAX_IGNORED_COUNT recommendations
 */
function isLspRecommendationsDisabled() {
    const config = (0, config_js_1.getGlobalConfig)();
    return (config.lspRecommendationDisabled === true ||
        (config.lspRecommendationIgnoredCount ?? 0) >= MAX_IGNORED_COUNT);
}
/**
 * Reset the ignored count (useful if user re-enables recommendations)
 */
function resetIgnoredCount() {
    (0, config_js_1.saveGlobalConfig)(currentConfig => {
        const currentCount = currentConfig.lspRecommendationIgnoredCount ?? 0;
        if (currentCount === 0) {
            return currentConfig;
        }
        return {
            ...currentConfig,
            lspRecommendationIgnoredCount: 0,
        };
    });
    (0, debug_js_1.logForDebugging)('[lspRecommendation] Reset ignored count');
}
