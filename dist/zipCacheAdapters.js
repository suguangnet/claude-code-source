"use strict";
/**
 * Zip Cache Adapters
 *
 * I/O helpers for the plugin zip cache. These functions handle reading/writing
 * zip-cache-local metadata files, extracting ZIPs to session directories,
 * and creating ZIPs for newly installed plugins.
 *
 * The zip cache stores data on a mounted volume (e.g., Filestore) that persists
 * across ephemeral container lifetimes. The session cache is a local temp dir
 * for extracted plugins used during a single session.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.readZipCacheKnownMarketplaces = readZipCacheKnownMarketplaces;
exports.writeZipCacheKnownMarketplaces = writeZipCacheKnownMarketplaces;
exports.readMarketplaceJson = readMarketplaceJson;
exports.saveMarketplaceJsonToZipCache = saveMarketplaceJsonToZipCache;
exports.syncMarketplacesToZipCache = syncMarketplacesToZipCache;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const debug_js_1 = require("../debug.js");
const slowOperations_js_1 = require("../slowOperations.js");
const marketplaceManager_js_1 = require("./marketplaceManager.js");
const schemas_js_1 = require("./schemas.js");
const zipCache_js_1 = require("./zipCache.js");
// ── Metadata I/O ──
/**
 * Read known_marketplaces.json from the zip cache.
 * Returns empty object if file doesn't exist, can't be parsed, or fails schema
 * validation (data comes from a shared mounted volume — other containers may write).
 */
async function readZipCacheKnownMarketplaces() {
    try {
        const content = await (0, promises_1.readFile)((0, zipCache_js_1.getZipCacheKnownMarketplacesPath)(), 'utf-8');
        const parsed = (0, schemas_js_1.KnownMarketplacesFileSchema)().safeParse((0, slowOperations_js_1.jsonParse)(content));
        if (!parsed.success) {
            (0, debug_js_1.logForDebugging)(`Invalid known_marketplaces.json in zip cache: ${parsed.error.message}`, { level: 'error' });
            return {};
        }
        return parsed.data;
    }
    catch {
        return {};
    }
}
/**
 * Write known_marketplaces.json to the zip cache atomically.
 */
async function writeZipCacheKnownMarketplaces(data) {
    await (0, zipCache_js_1.atomicWriteToZipCache)((0, zipCache_js_1.getZipCacheKnownMarketplacesPath)(), (0, slowOperations_js_1.jsonStringify)(data, null, 2));
}
// ── Marketplace JSON ──
/**
 * Read a marketplace JSON file from the zip cache.
 */
async function readMarketplaceJson(marketplaceName) {
    const zipCachePath = (0, zipCache_js_1.getPluginZipCachePath)();
    if (!zipCachePath) {
        return null;
    }
    const relPath = (0, zipCache_js_1.getMarketplaceJsonRelativePath)(marketplaceName);
    const fullPath = (0, path_1.join)(zipCachePath, relPath);
    try {
        const content = await (0, promises_1.readFile)(fullPath, 'utf-8');
        const parsed = (0, slowOperations_js_1.jsonParse)(content);
        const result = (0, schemas_js_1.PluginMarketplaceSchema)().safeParse(parsed);
        if (result.success) {
            return result.data;
        }
        (0, debug_js_1.logForDebugging)(`Invalid marketplace JSON for ${marketplaceName}: ${result.error}`);
        return null;
    }
    catch {
        return null;
    }
}
/**
 * Save a marketplace JSON to the zip cache from its install location.
 */
async function saveMarketplaceJsonToZipCache(marketplaceName, installLocation) {
    const zipCachePath = (0, zipCache_js_1.getPluginZipCachePath)();
    if (!zipCachePath) {
        return;
    }
    const content = await readMarketplaceJsonContent(installLocation);
    if (content !== null) {
        const relPath = (0, zipCache_js_1.getMarketplaceJsonRelativePath)(marketplaceName);
        await (0, zipCache_js_1.atomicWriteToZipCache)((0, path_1.join)(zipCachePath, relPath), content);
    }
}
/**
 * Read marketplace.json content from a cloned marketplace directory or file.
 * For directory sources: checks .claude-plugin/marketplace.json, marketplace.json
 * For URL sources: the installLocation IS the marketplace JSON file itself.
 */
async function readMarketplaceJsonContent(dir) {
    const candidates = [
        (0, path_1.join)(dir, '.claude-plugin', 'marketplace.json'),
        (0, path_1.join)(dir, 'marketplace.json'),
        dir, // For URL sources, installLocation IS the marketplace JSON file
    ];
    for (const candidate of candidates) {
        try {
            return await (0, promises_1.readFile)(candidate, 'utf-8');
        }
        catch {
            // ENOENT (doesn't exist) or EISDIR (directory) — try next
        }
    }
    return null;
}
/**
 * Sync marketplace data to zip cache for offline access.
 * Saves marketplace JSONs and merges with previously cached data
 * so ephemeral containers can access marketplaces without re-cloning.
 */
async function syncMarketplacesToZipCache() {
    // Read-only iteration — Safe variant so a corrupted config doesn't throw.
    // This runs during startup paths; a throw here cascades to the same
    // try-block that catches loadAllPlugins failures.
    const knownMarketplaces = await (0, marketplaceManager_js_1.loadKnownMarketplacesConfigSafe)();
    // Save marketplace JSONs to zip cache
    for (const [name, entry] of Object.entries(knownMarketplaces)) {
        if (!entry.installLocation)
            continue;
        try {
            await saveMarketplaceJsonToZipCache(name, entry.installLocation);
        }
        catch (error) {
            (0, debug_js_1.logForDebugging)(`Failed to save marketplace JSON for ${name}: ${error}`);
        }
    }
    // Merge with previously cached data (ephemeral containers lose global config)
    const zipCacheKnownMarketplaces = await readZipCacheKnownMarketplaces();
    const mergedKnownMarketplaces = {
        ...zipCacheKnownMarketplaces,
        ...knownMarketplaces,
    };
    await writeZipCacheKnownMarketplaces(mergedKnownMarketplaces);
}
