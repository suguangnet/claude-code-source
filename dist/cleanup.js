"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.addCleanupResults = addCleanupResults;
exports.convertFileNameToDate = convertFileNameToDate;
exports.cleanupOldMessageFiles = cleanupOldMessageFiles;
exports.cleanupOldSessionFiles = cleanupOldSessionFiles;
exports.cleanupOldPlanFiles = cleanupOldPlanFiles;
exports.cleanupOldFileHistoryBackups = cleanupOldFileHistoryBackups;
exports.cleanupOldSessionEnvDirs = cleanupOldSessionEnvDirs;
exports.cleanupOldDebugLogs = cleanupOldDebugLogs;
exports.cleanupNpmCacheForAnthropicPackages = cleanupNpmCacheForAnthropicPackages;
exports.cleanupOldVersionsThrottled = cleanupOldVersionsThrottled;
exports.cleanupOldMessageFilesInBackground = cleanupOldMessageFilesInBackground;
const fs = __importStar(require("fs/promises"));
const os_1 = require("os");
const path_1 = require("path");
const index_js_1 = require("../services/analytics/index.js");
const cachePaths_js_1 = require("./cachePaths.js");
const debug_js_1 = require("./debug.js");
const envUtils_js_1 = require("./envUtils.js");
const fsOperations_js_1 = require("./fsOperations.js");
const imageStore_js_1 = require("./imageStore.js");
const lockfile = __importStar(require("./lockfile.js"));
const log_js_1 = require("./log.js");
const index_js_2 = require("./nativeInstaller/index.js");
const pasteStore_js_1 = require("./pasteStore.js");
const sessionStorage_js_1 = require("./sessionStorage.js");
const allErrors_js_1 = require("./settings/allErrors.js");
const settings_js_1 = require("./settings/settings.js");
const toolResultStorage_js_1 = require("./toolResultStorage.js");
const worktree_js_1 = require("./worktree.js");
const DEFAULT_CLEANUP_PERIOD_DAYS = 30;
function getCutoffDate() {
    const settings = (0, settings_js_1.getSettings_DEPRECATED)() || {};
    const cleanupPeriodDays = settings.cleanupPeriodDays ?? DEFAULT_CLEANUP_PERIOD_DAYS;
    const cleanupPeriodMs = cleanupPeriodDays * 24 * 60 * 60 * 1000;
    return new Date(Date.now() - cleanupPeriodMs);
}
function addCleanupResults(a, b) {
    return {
        messages: a.messages + b.messages,
        errors: a.errors + b.errors,
    };
}
function convertFileNameToDate(filename) {
    const isoStr = filename
        .split('.')[0]
        .replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/, 'T$1:$2:$3.$4Z');
    return new Date(isoStr);
}
async function cleanupOldFilesInDirectory(dirPath, cutoffDate, isMessagePath) {
    const result = { messages: 0, errors: 0 };
    try {
        const files = await (0, fsOperations_js_1.getFsImplementation)().readdir(dirPath);
        for (const file of files) {
            try {
                // Convert filename format where all ':.' were replaced with '-'
                const timestamp = convertFileNameToDate(file.name);
                if (timestamp < cutoffDate) {
                    await (0, fsOperations_js_1.getFsImplementation)().unlink((0, path_1.join)(dirPath, file.name));
                    // Increment the appropriate counter
                    if (isMessagePath) {
                        result.messages++;
                    }
                    else {
                        result.errors++;
                    }
                }
            }
            catch (error) {
                // Log but continue processing other files
                (0, log_js_1.logError)(error);
            }
        }
    }
    catch (error) {
        // Ignore if directory doesn't exist
        if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') {
            (0, log_js_1.logError)(error);
        }
    }
    return result;
}
async function cleanupOldMessageFiles() {
    const fsImpl = (0, fsOperations_js_1.getFsImplementation)();
    const cutoffDate = getCutoffDate();
    const errorPath = cachePaths_js_1.CACHE_PATHS.errors();
    const baseCachePath = cachePaths_js_1.CACHE_PATHS.baseLogs();
    // Clean up message and error logs
    let result = await cleanupOldFilesInDirectory(errorPath, cutoffDate, false);
    // Clean up MCP logs
    try {
        let dirents;
        try {
            dirents = await fsImpl.readdir(baseCachePath);
        }
        catch {
            return result;
        }
        const mcpLogDirs = dirents
            .filter(dirent => dirent.isDirectory() && dirent.name.startsWith('mcp-logs-'))
            .map(dirent => (0, path_1.join)(baseCachePath, dirent.name));
        for (const mcpLogDir of mcpLogDirs) {
            // Clean up files in MCP log directory
            result = addCleanupResults(result, await cleanupOldFilesInDirectory(mcpLogDir, cutoffDate, true));
            await tryRmdir(mcpLogDir, fsImpl);
        }
    }
    catch (error) {
        if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') {
            (0, log_js_1.logError)(error);
        }
    }
    return result;
}
async function unlinkIfOld(filePath, cutoffDate, fsImpl) {
    const stats = await fsImpl.stat(filePath);
    if (stats.mtime < cutoffDate) {
        await fsImpl.unlink(filePath);
        return true;
    }
    return false;
}
async function tryRmdir(dirPath, fsImpl) {
    try {
        await fsImpl.rmdir(dirPath);
    }
    catch {
        // not empty / doesn't exist
    }
}
async function cleanupOldSessionFiles() {
    const cutoffDate = getCutoffDate();
    const result = { messages: 0, errors: 0 };
    const projectsDir = (0, sessionStorage_js_1.getProjectsDir)();
    const fsImpl = (0, fsOperations_js_1.getFsImplementation)();
    let projectDirents;
    try {
        projectDirents = await fsImpl.readdir(projectsDir);
    }
    catch {
        return result;
    }
    for (const projectDirent of projectDirents) {
        if (!projectDirent.isDirectory())
            continue;
        const projectDir = (0, path_1.join)(projectsDir, projectDirent.name);
        // Single readdir per project directory — partition into files and session dirs
        let entries;
        try {
            entries = await fsImpl.readdir(projectDir);
        }
        catch {
            result.errors++;
            continue;
        }
        for (const entry of entries) {
            if (entry.isFile()) {
                if (!entry.name.endsWith('.jsonl') && !entry.name.endsWith('.cast')) {
                    continue;
                }
                try {
                    if (await unlinkIfOld((0, path_1.join)(projectDir, entry.name), cutoffDate, fsImpl)) {
                        result.messages++;
                    }
                }
                catch {
                    result.errors++;
                }
            }
            else if (entry.isDirectory()) {
                // Session directory — clean up tool-results/<toolDir>/* beneath it
                const sessionDir = (0, path_1.join)(projectDir, entry.name);
                const toolResultsDir = (0, path_1.join)(sessionDir, toolResultStorage_js_1.TOOL_RESULTS_SUBDIR);
                let toolDirs;
                try {
                    toolDirs = await fsImpl.readdir(toolResultsDir);
                }
                catch {
                    // No tool-results dir — still try to remove an empty session dir
                    await tryRmdir(sessionDir, fsImpl);
                    continue;
                }
                for (const toolEntry of toolDirs) {
                    if (toolEntry.isFile()) {
                        try {
                            if (await unlinkIfOld((0, path_1.join)(toolResultsDir, toolEntry.name), cutoffDate, fsImpl)) {
                                result.messages++;
                            }
                        }
                        catch {
                            result.errors++;
                        }
                    }
                    else if (toolEntry.isDirectory()) {
                        const toolDirPath = (0, path_1.join)(toolResultsDir, toolEntry.name);
                        let toolFiles;
                        try {
                            toolFiles = await fsImpl.readdir(toolDirPath);
                        }
                        catch {
                            continue;
                        }
                        for (const tf of toolFiles) {
                            if (!tf.isFile())
                                continue;
                            try {
                                if (await unlinkIfOld((0, path_1.join)(toolDirPath, tf.name), cutoffDate, fsImpl)) {
                                    result.messages++;
                                }
                            }
                            catch {
                                result.errors++;
                            }
                        }
                        await tryRmdir(toolDirPath, fsImpl);
                    }
                }
                await tryRmdir(toolResultsDir, fsImpl);
                await tryRmdir(sessionDir, fsImpl);
            }
        }
        await tryRmdir(projectDir, fsImpl);
    }
    return result;
}
/**
 * Generic helper for cleaning up old files in a single directory
 * @param dirPath Path to the directory to clean
 * @param extension File extension to filter (e.g., '.md', '.jsonl')
 * @param removeEmptyDir Whether to remove the directory if empty after cleanup
 */
async function cleanupSingleDirectory(dirPath, extension, removeEmptyDir = true) {
    const cutoffDate = getCutoffDate();
    const result = { messages: 0, errors: 0 };
    const fsImpl = (0, fsOperations_js_1.getFsImplementation)();
    let dirents;
    try {
        dirents = await fsImpl.readdir(dirPath);
    }
    catch {
        return result;
    }
    for (const dirent of dirents) {
        if (!dirent.isFile() || !dirent.name.endsWith(extension))
            continue;
        try {
            if (await unlinkIfOld((0, path_1.join)(dirPath, dirent.name), cutoffDate, fsImpl)) {
                result.messages++;
            }
        }
        catch {
            result.errors++;
        }
    }
    if (removeEmptyDir) {
        await tryRmdir(dirPath, fsImpl);
    }
    return result;
}
function cleanupOldPlanFiles() {
    const plansDir = (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), 'plans');
    return cleanupSingleDirectory(plansDir, '.md');
}
async function cleanupOldFileHistoryBackups() {
    const cutoffDate = getCutoffDate();
    const result = { messages: 0, errors: 0 };
    const fsImpl = (0, fsOperations_js_1.getFsImplementation)();
    try {
        const configDir = (0, envUtils_js_1.getClaudeConfigHomeDir)();
        const fileHistoryStorageDir = (0, path_1.join)(configDir, 'file-history');
        let dirents;
        try {
            dirents = await fsImpl.readdir(fileHistoryStorageDir);
        }
        catch {
            return result;
        }
        const fileHistorySessionsDirs = dirents
            .filter(dirent => dirent.isDirectory())
            .map(dirent => (0, path_1.join)(fileHistoryStorageDir, dirent.name));
        await Promise.all(fileHistorySessionsDirs.map(async (fileHistorySessionDir) => {
            try {
                const stats = await fsImpl.stat(fileHistorySessionDir);
                if (stats.mtime < cutoffDate) {
                    await fsImpl.rm(fileHistorySessionDir, {
                        recursive: true,
                        force: true,
                    });
                    result.messages++;
                }
            }
            catch {
                result.errors++;
            }
        }));
        await tryRmdir(fileHistoryStorageDir, fsImpl);
    }
    catch (error) {
        (0, log_js_1.logError)(error);
    }
    return result;
}
async function cleanupOldSessionEnvDirs() {
    const cutoffDate = getCutoffDate();
    const result = { messages: 0, errors: 0 };
    const fsImpl = (0, fsOperations_js_1.getFsImplementation)();
    try {
        const configDir = (0, envUtils_js_1.getClaudeConfigHomeDir)();
        const sessionEnvBaseDir = (0, path_1.join)(configDir, 'session-env');
        let dirents;
        try {
            dirents = await fsImpl.readdir(sessionEnvBaseDir);
        }
        catch {
            return result;
        }
        const sessionEnvDirs = dirents
            .filter(dirent => dirent.isDirectory())
            .map(dirent => (0, path_1.join)(sessionEnvBaseDir, dirent.name));
        for (const sessionEnvDir of sessionEnvDirs) {
            try {
                const stats = await fsImpl.stat(sessionEnvDir);
                if (stats.mtime < cutoffDate) {
                    await fsImpl.rm(sessionEnvDir, { recursive: true, force: true });
                    result.messages++;
                }
            }
            catch {
                result.errors++;
            }
        }
        await tryRmdir(sessionEnvBaseDir, fsImpl);
    }
    catch (error) {
        (0, log_js_1.logError)(error);
    }
    return result;
}
/**
 * Cleans up old debug log files from ~/.claude/debug/
 * Preserves the 'latest' symlink which points to the current session's log.
 * Debug logs can grow very large (especially with the infinite logging loop bug)
 * and accumulate indefinitely without this cleanup.
 */
async function cleanupOldDebugLogs() {
    const cutoffDate = getCutoffDate();
    const result = { messages: 0, errors: 0 };
    const fsImpl = (0, fsOperations_js_1.getFsImplementation)();
    const debugDir = (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), 'debug');
    let dirents;
    try {
        dirents = await fsImpl.readdir(debugDir);
    }
    catch {
        return result;
    }
    for (const dirent of dirents) {
        // Preserve the 'latest' symlink
        if (!dirent.isFile() ||
            !dirent.name.endsWith('.txt') ||
            dirent.name === 'latest') {
            continue;
        }
        try {
            if (await unlinkIfOld((0, path_1.join)(debugDir, dirent.name), cutoffDate, fsImpl)) {
                result.messages++;
            }
        }
        catch {
            result.errors++;
        }
    }
    // Intentionally do NOT remove debugDir even if empty — needed for future logs
    return result;
}
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Clean up old npm cache entries for Anthropic packages.
 * This helps reduce disk usage since we publish many dev versions per day.
 * Only runs once per day for Ant users.
 */
async function cleanupNpmCacheForAnthropicPackages() {
    const markerPath = (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), '.npm-cache-cleanup');
    try {
        const stat = await fs.stat(markerPath);
        if (Date.now() - stat.mtimeMs < ONE_DAY_MS) {
            (0, debug_js_1.logForDebugging)('npm cache cleanup: skipping, ran recently');
            return;
        }
    }
    catch {
        // File doesn't exist, proceed with cleanup
    }
    try {
        await lockfile.lock(markerPath, { retries: 0, realpath: false });
    }
    catch {
        (0, debug_js_1.logForDebugging)('npm cache cleanup: skipping, lock held');
        return;
    }
    (0, debug_js_1.logForDebugging)('npm cache cleanup: starting');
    const npmCachePath = (0, path_1.join)((0, os_1.homedir)(), '.npm', '_cacache');
    const NPM_CACHE_RETENTION_COUNT = 5;
    const startTime = Date.now();
    try {
        const cacache = await Promise.resolve().then(() => __importStar(require('cacache')));
        const cutoff = startTime - ONE_DAY_MS;
        // Stream index entries and collect all Anthropic package entries.
        // Previous implementation used cacache.verify() which does a full
        // integrity check + GC of the ENTIRE cache — O(all content blobs).
        // On large caches this took 60+ seconds and blocked the event loop.
        const stream = cacache.ls.stream(npmCachePath);
        const anthropicEntries = [];
        for await (const entry of stream) {
            if (entry.key.includes('@anthropic-ai/claude-')) {
                anthropicEntries.push({ key: entry.key, time: entry.time });
            }
        }
        // Group by package name (everything before the last @version separator)
        const byPackage = new Map();
        for (const entry of anthropicEntries) {
            const atVersionIdx = entry.key.lastIndexOf('@');
            const pkgName = atVersionIdx > 0 ? entry.key.slice(0, atVersionIdx) : entry.key;
            const existing = byPackage.get(pkgName) ?? [];
            existing.push(entry);
            byPackage.set(pkgName, existing);
        }
        // Remove entries older than 1 day OR beyond the top N most recent per package
        const keysToRemove = [];
        for (const [, entries] of byPackage) {
            entries.sort((a, b) => b.time - a.time); // newest first
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                if (entry.time < cutoff || i >= NPM_CACHE_RETENTION_COUNT) {
                    keysToRemove.push(entry.key);
                }
            }
        }
        await Promise.all(keysToRemove.map(key => cacache.rm.entry(npmCachePath, key)));
        await fs.writeFile(markerPath, new Date().toISOString());
        const durationMs = Date.now() - startTime;
        if (keysToRemove.length > 0) {
            (0, debug_js_1.logForDebugging)(`npm cache cleanup: Removed ${keysToRemove.length} old @anthropic-ai entries in ${durationMs}ms`);
        }
        else {
            (0, debug_js_1.logForDebugging)(`npm cache cleanup: completed in ${durationMs}ms`);
        }
        (0, index_js_1.logEvent)('tengu_npm_cache_cleanup', {
            success: true,
            durationMs,
            entriesRemoved: keysToRemove.length,
        });
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        (0, index_js_1.logEvent)('tengu_npm_cache_cleanup', {
            success: false,
            durationMs: Date.now() - startTime,
        });
    }
    finally {
        await lockfile.unlock(markerPath, { realpath: false }).catch(() => { });
    }
}
/**
 * Throttled wrapper around cleanupOldVersions for recurring cleanup in long-running sessions.
 * Uses a marker file and lock to ensure it runs at most once per 24 hours,
 * and does not block if another process is already running cleanup.
 * The regular cleanupOldVersions() should still be used for installer flows.
 */
async function cleanupOldVersionsThrottled() {
    const markerPath = (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), '.version-cleanup');
    try {
        const stat = await fs.stat(markerPath);
        if (Date.now() - stat.mtimeMs < ONE_DAY_MS) {
            (0, debug_js_1.logForDebugging)('version cleanup: skipping, ran recently');
            return;
        }
    }
    catch {
        // File doesn't exist, proceed with cleanup
    }
    try {
        await lockfile.lock(markerPath, { retries: 0, realpath: false });
    }
    catch {
        (0, debug_js_1.logForDebugging)('version cleanup: skipping, lock held');
        return;
    }
    (0, debug_js_1.logForDebugging)('version cleanup: starting (throttled)');
    try {
        await (0, index_js_2.cleanupOldVersions)();
        await fs.writeFile(markerPath, new Date().toISOString());
    }
    catch (error) {
        (0, log_js_1.logError)(error);
    }
    finally {
        await lockfile.unlock(markerPath, { realpath: false }).catch(() => { });
    }
}
async function cleanupOldMessageFilesInBackground() {
    // If settings have validation errors but the user explicitly set cleanupPeriodDays,
    // skip cleanup entirely rather than falling back to the default (30 days).
    // This prevents accidentally deleting files when the user intended a different retention period.
    const { errors } = (0, allErrors_js_1.getSettingsWithAllErrors)();
    if (errors.length > 0 && (0, settings_js_1.rawSettingsContainsKey)('cleanupPeriodDays')) {
        (0, debug_js_1.logForDebugging)('Skipping cleanup: settings have validation errors but cleanupPeriodDays was explicitly set. Fix settings errors to enable cleanup.');
        return;
    }
    await cleanupOldMessageFiles();
    await cleanupOldSessionFiles();
    await cleanupOldPlanFiles();
    await cleanupOldFileHistoryBackups();
    await cleanupOldSessionEnvDirs();
    await cleanupOldDebugLogs();
    await (0, imageStore_js_1.cleanupOldImageCaches)();
    await (0, pasteStore_js_1.cleanupOldPastes)(getCutoffDate());
    const removedWorktrees = await (0, worktree_js_1.cleanupStaleAgentWorktrees)(getCutoffDate());
    if (removedWorktrees > 0) {
        (0, index_js_1.logEvent)('tengu_worktree_cleanup', { removed: removedWorktrees });
    }
    if (process.env.USER_TYPE === 'ant') {
        await cleanupNpmCacheForAnthropicPackages();
    }
}
