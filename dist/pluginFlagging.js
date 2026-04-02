"use strict";
/**
 * Flagged plugin tracking utilities
 *
 * Tracks plugins that were auto-removed because they were delisted from
 * their marketplace. Data is stored in ~/.claude/plugins/flagged-plugins.json.
 * Flagged plugins appear in a "Flagged" section in /plugins until the user
 * dismisses them.
 *
 * Uses a module-level cache so that getFlaggedPlugins() can be called
 * synchronously during React render. The cache is populated on the first
 * async call (loadFlaggedPlugins or addFlaggedPlugin) and kept in sync
 * with writes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadFlaggedPlugins = loadFlaggedPlugins;
exports.getFlaggedPlugins = getFlaggedPlugins;
exports.addFlaggedPlugin = addFlaggedPlugin;
exports.markFlaggedPluginsSeen = markFlaggedPluginsSeen;
exports.removeFlaggedPlugin = removeFlaggedPlugin;
const crypto_1 = require("crypto");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const debug_js_1 = require("../debug.js");
const fsOperations_js_1 = require("../fsOperations.js");
const log_js_1 = require("../log.js");
const slowOperations_js_1 = require("../slowOperations.js");
const pluginDirectories_js_1 = require("./pluginDirectories.js");
const FLAGGED_PLUGINS_FILENAME = 'flagged-plugins.json';
const SEEN_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours
// Module-level cache — populated by loadFlaggedPlugins(), updated by writes.
let cache = null;
function getFlaggedPluginsPath() {
    return (0, path_1.join)((0, pluginDirectories_js_1.getPluginsDirectory)(), FLAGGED_PLUGINS_FILENAME);
}
function parsePluginsData(content) {
    const parsed = (0, slowOperations_js_1.jsonParse)(content);
    if (typeof parsed !== 'object' ||
        parsed === null ||
        !('plugins' in parsed) ||
        typeof parsed.plugins !== 'object' ||
        parsed.plugins === null) {
        return {};
    }
    const plugins = parsed.plugins;
    const result = {};
    for (const [id, entry] of Object.entries(plugins)) {
        if (entry &&
            typeof entry === 'object' &&
            'flaggedAt' in entry &&
            typeof entry.flaggedAt === 'string') {
            const parsed = {
                flaggedAt: entry.flaggedAt,
            };
            if ('seenAt' in entry &&
                typeof entry.seenAt === 'string') {
                parsed.seenAt = entry.seenAt;
            }
            result[id] = parsed;
        }
    }
    return result;
}
async function readFromDisk() {
    try {
        const content = await (0, promises_1.readFile)(getFlaggedPluginsPath(), {
            encoding: 'utf-8',
        });
        return parsePluginsData(content);
    }
    catch {
        return {};
    }
}
async function writeToDisk(plugins) {
    const filePath = getFlaggedPluginsPath();
    const tempPath = `${filePath}.${(0, crypto_1.randomBytes)(8).toString('hex')}.tmp`;
    try {
        await (0, fsOperations_js_1.getFsImplementation)().mkdir((0, pluginDirectories_js_1.getPluginsDirectory)());
        const content = (0, slowOperations_js_1.jsonStringify)({ plugins }, null, 2);
        await (0, promises_1.writeFile)(tempPath, content, {
            encoding: 'utf-8',
            mode: 0o600,
        });
        await (0, promises_1.rename)(tempPath, filePath);
        cache = plugins;
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        try {
            await (0, promises_1.unlink)(tempPath);
        }
        catch {
            // Ignore cleanup errors
        }
    }
}
/**
 * Load flagged plugins from disk into the module cache.
 * Must be called (and awaited) before getFlaggedPlugins() returns
 * meaningful data. Called by useManagePlugins during plugin refresh.
 */
async function loadFlaggedPlugins() {
    const all = await readFromDisk();
    const now = Date.now();
    let changed = false;
    for (const [id, entry] of Object.entries(all)) {
        if (entry.seenAt &&
            now - new Date(entry.seenAt).getTime() >= SEEN_EXPIRY_MS) {
            delete all[id];
            changed = true;
        }
    }
    cache = all;
    if (changed) {
        await writeToDisk(all);
    }
}
/**
 * Get all flagged plugins from the in-memory cache.
 * Returns an empty object if loadFlaggedPlugins() has not been called yet.
 */
function getFlaggedPlugins() {
    return cache ?? {};
}
/**
 * Add a plugin to the flagged list.
 *
 * @param pluginId "name@marketplace" format
 */
async function addFlaggedPlugin(pluginId) {
    if (cache === null) {
        cache = await readFromDisk();
    }
    const updated = {
        ...cache,
        [pluginId]: {
            flaggedAt: new Date().toISOString(),
        },
    };
    await writeToDisk(updated);
    (0, debug_js_1.logForDebugging)(`Flagged plugin: ${pluginId}`);
}
/**
 * Mark flagged plugins as seen. Called when the Installed view renders
 * flagged plugins. Sets seenAt on entries that don't already have it.
 * After 48 hours from seenAt, entries are auto-cleared on next load.
 */
async function markFlaggedPluginsSeen(pluginIds) {
    if (cache === null) {
        cache = await readFromDisk();
    }
    const now = new Date().toISOString();
    let changed = false;
    const updated = { ...cache };
    for (const id of pluginIds) {
        const entry = updated[id];
        if (entry && !entry.seenAt) {
            updated[id] = { ...entry, seenAt: now };
            changed = true;
        }
    }
    if (changed) {
        await writeToDisk(updated);
    }
}
/**
 * Remove a plugin from the flagged list. Called when the user dismisses
 * a flagged plugin notification in /plugins.
 */
async function removeFlaggedPlugin(pluginId) {
    if (cache === null) {
        cache = await readFromDisk();
    }
    if (!(pluginId in cache))
        return;
    const { [pluginId]: _, ...rest } = cache;
    cache = rest;
    await writeToDisk(rest);
}
