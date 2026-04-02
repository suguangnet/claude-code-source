"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearAllPluginCaches = clearAllPluginCaches;
exports.clearAllCaches = clearAllCaches;
exports.markPluginVersionOrphaned = markPluginVersionOrphaned;
exports.cleanupOrphanedPluginVersionsInBackground = cleanupOrphanedPluginVersionsInBackground;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const commands_js_1 = require("../../commands.js");
const outputStyles_js_1 = require("../../constants/outputStyles.js");
const loadAgentsDir_js_1 = require("../../tools/AgentTool/loadAgentsDir.js");
const prompt_js_1 = require("../../tools/SkillTool/prompt.js");
const attachments_js_1 = require("../attachments.js");
const debug_js_1 = require("../debug.js");
const errors_js_1 = require("../errors.js");
const log_js_1 = require("../log.js");
const installedPluginsManager_js_1 = require("./installedPluginsManager.js");
const loadPluginAgents_js_1 = require("./loadPluginAgents.js");
const loadPluginCommands_js_1 = require("./loadPluginCommands.js");
const loadPluginHooks_js_1 = require("./loadPluginHooks.js");
const loadPluginOutputStyles_js_1 = require("./loadPluginOutputStyles.js");
const pluginLoader_js_1 = require("./pluginLoader.js");
const pluginOptionsStorage_js_1 = require("./pluginOptionsStorage.js");
const zipCache_js_1 = require("./zipCache.js");
const ORPHANED_AT_FILENAME = '.orphaned_at';
const CLEANUP_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
function clearAllPluginCaches() {
    (0, pluginLoader_js_1.clearPluginCache)();
    (0, loadPluginCommands_js_1.clearPluginCommandCache)();
    (0, loadPluginAgents_js_1.clearPluginAgentCache)();
    (0, loadPluginHooks_js_1.clearPluginHookCache)();
    // Prune hooks from plugins no longer in the enabled set so uninstalled/
    // disabled plugins stop firing immediately (gh-36995). Prune-only: hooks
    // from newly-enabled plugins are NOT added here — they wait for
    // /reload-plugins like commands/agents/MCP do. Fire-and-forget: old hooks
    // stay valid until the prune completes (preserves gh-29767). No-op when
    // STATE.registeredHooks is empty (test/preload.ts beforeEach clears it via
    // resetStateForTests before reaching here).
    (0, loadPluginHooks_js_1.pruneRemovedPluginHooks)().catch(e => (0, log_js_1.logError)(e));
    (0, pluginOptionsStorage_js_1.clearPluginOptionsCache)();
    (0, loadPluginOutputStyles_js_1.clearPluginOutputStyleCache)();
    (0, outputStyles_js_1.clearAllOutputStylesCache)();
}
function clearAllCaches() {
    clearAllPluginCaches();
    (0, commands_js_1.clearCommandsCache)();
    (0, loadAgentsDir_js_1.clearAgentDefinitionsCache)();
    (0, prompt_js_1.clearPromptCache)();
    (0, attachments_js_1.resetSentSkillNames)();
}
/**
 * Mark a plugin version as orphaned.
 * Called when a plugin is uninstalled or updated to a new version.
 */
async function markPluginVersionOrphaned(versionPath) {
    try {
        await (0, promises_1.writeFile)(getOrphanedAtPath(versionPath), `${Date.now()}`, 'utf-8');
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`Failed to write .orphaned_at: ${versionPath}: ${error}`);
    }
}
/**
 * Clean up orphaned plugin versions that have been orphaned for more than 7 days.
 *
 * Pass 1: Remove .orphaned_at from installed versions (clears stale markers)
 * Pass 2: For each cached version not in installed_plugins.json:
 *   - If no .orphaned_at exists: create it (handles old CC versions, manual edits)
 *   - If .orphaned_at exists and > 7 days old: delete the version
 */
async function cleanupOrphanedPluginVersionsInBackground() {
    // Zip cache mode stores plugins as .zip files, not directories. readSubdirs
    // filters to directories only, so removeIfEmpty would see plugin dirs as empty
    // and delete them (including the ZIPs). Skip cleanup entirely in zip mode.
    if ((0, zipCache_js_1.isPluginZipCacheEnabled)()) {
        return;
    }
    try {
        const installedVersions = getInstalledVersionPaths();
        if (!installedVersions)
            return;
        const cachePath = (0, pluginLoader_js_1.getPluginCachePath)();
        const now = Date.now();
        // Pass 1: Remove .orphaned_at from installed versions
        // This handles cases where a plugin was reinstalled after being orphaned
        await Promise.all([...installedVersions].map(p => removeOrphanedAtMarker(p)));
        // Pass 2: Process orphaned versions
        for (const marketplace of await readSubdirs(cachePath)) {
            const marketplacePath = (0, path_1.join)(cachePath, marketplace);
            for (const plugin of await readSubdirs(marketplacePath)) {
                const pluginPath = (0, path_1.join)(marketplacePath, plugin);
                for (const version of await readSubdirs(pluginPath)) {
                    const versionPath = (0, path_1.join)(pluginPath, version);
                    if (installedVersions.has(versionPath))
                        continue;
                    await processOrphanedPluginVersion(versionPath, now);
                }
                await removeIfEmpty(pluginPath);
            }
            await removeIfEmpty(marketplacePath);
        }
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`Plugin cache cleanup failed: ${error}`);
    }
}
function getOrphanedAtPath(versionPath) {
    return (0, path_1.join)(versionPath, ORPHANED_AT_FILENAME);
}
async function removeOrphanedAtMarker(versionPath) {
    const orphanedAtPath = getOrphanedAtPath(versionPath);
    try {
        await (0, promises_1.unlink)(orphanedAtPath);
    }
    catch (error) {
        const code = (0, errors_js_1.getErrnoCode)(error);
        if (code === 'ENOENT')
            return;
        (0, debug_js_1.logForDebugging)(`Failed to remove .orphaned_at: ${versionPath}: ${error}`);
    }
}
function getInstalledVersionPaths() {
    try {
        const paths = new Set();
        const diskData = (0, installedPluginsManager_js_1.loadInstalledPluginsFromDisk)();
        for (const installations of Object.values(diskData.plugins)) {
            for (const entry of installations) {
                paths.add(entry.installPath);
            }
        }
        return paths;
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`Failed to load installed plugins: ${error}`);
        return null;
    }
}
async function processOrphanedPluginVersion(versionPath, now) {
    const orphanedAtPath = getOrphanedAtPath(versionPath);
    let orphanedAt;
    try {
        orphanedAt = (await (0, promises_1.stat)(orphanedAtPath)).mtimeMs;
    }
    catch (error) {
        const code = (0, errors_js_1.getErrnoCode)(error);
        if (code === 'ENOENT') {
            await markPluginVersionOrphaned(versionPath);
            return;
        }
        (0, debug_js_1.logForDebugging)(`Failed to stat orphaned marker: ${versionPath}: ${error}`);
        return;
    }
    if (now - orphanedAt > CLEANUP_AGE_MS) {
        try {
            await (0, promises_1.rm)(versionPath, { recursive: true, force: true });
        }
        catch (error) {
            (0, debug_js_1.logForDebugging)(`Failed to delete orphaned version: ${versionPath}: ${error}`);
        }
    }
}
async function removeIfEmpty(dirPath) {
    if ((await readSubdirs(dirPath)).length === 0) {
        try {
            await (0, promises_1.rm)(dirPath, { recursive: true, force: true });
        }
        catch (error) {
            (0, debug_js_1.logForDebugging)(`Failed to remove empty dir: ${dirPath}: ${error}`);
        }
    }
}
async function readSubdirs(dirPath) {
    try {
        const entries = await (0, promises_1.readdir)(dirPath, { withFileTypes: true });
        return entries.filter(d => d.isDirectory()).map(d => d.name);
    }
    catch {
        return [];
    }
}
