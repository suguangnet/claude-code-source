"use strict";
/**
 * Plugin Zip Cache Module
 *
 * Manages plugins as ZIP archives in a mounted directory (e.g., Filestore).
 * When CLAUDE_CODE_PLUGIN_USE_ZIP_CACHE is enabled and CLAUDE_CODE_PLUGIN_CACHE_DIR
 * is set, plugins are stored as ZIPs in that directory and extracted to a
 * session-local temp directory at startup.
 *
 * Limitations:
 * - Only headless mode is supported
 * - All settings sources are used (same as normal plugin flow)
 * - Only github, git, and url marketplace sources are supported
 * - Only strict:true marketplace entries are supported
 * - Auto-update is non-blocking (background, does not affect current session)
 *
 * Directory structure of the zip cache:
 * /mnt/plugins-cache/
 *   ├── known_marketplaces.json
 *   ├── installed_plugins.json
 *   ├── marketplaces/
 *   │   ├── official-marketplace.json
 *   │   └── company-marketplace.json
 *   └── plugins/
 *       ├── official-marketplace/
 *       │   └── plugin-a/
 *       │       └── 1.0.0.zip
 *       └── company-marketplace/
 *           └── plugin-b/
 *               └── 2.1.3.zip
 */
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
exports.isPluginZipCacheEnabled = isPluginZipCacheEnabled;
exports.getPluginZipCachePath = getPluginZipCachePath;
exports.getZipCacheKnownMarketplacesPath = getZipCacheKnownMarketplacesPath;
exports.getZipCacheInstalledPluginsPath = getZipCacheInstalledPluginsPath;
exports.getZipCacheMarketplacesDir = getZipCacheMarketplacesDir;
exports.getZipCachePluginsDir = getZipCachePluginsDir;
exports.getSessionPluginCachePath = getSessionPluginCachePath;
exports.cleanupSessionPluginCache = cleanupSessionPluginCache;
exports.resetSessionPluginCache = resetSessionPluginCache;
exports.atomicWriteToZipCache = atomicWriteToZipCache;
exports.createZipFromDirectory = createZipFromDirectory;
exports.extractZipToDirectory = extractZipToDirectory;
exports.convertDirectoryToZipInPlace = convertDirectoryToZipInPlace;
exports.getMarketplaceJsonRelativePath = getMarketplaceJsonRelativePath;
exports.isMarketplaceSourceSupportedByZipCache = isMarketplaceSourceSupportedByZipCache;
const crypto_1 = require("crypto");
const promises_1 = require("fs/promises");
const os_1 = require("os");
const path_1 = require("path");
const debug_js_1 = require("../debug.js");
const zip_js_1 = require("../dxt/zip.js");
const envUtils_js_1 = require("../envUtils.js");
const fsOperations_js_1 = require("../fsOperations.js");
const pathValidation_js_1 = require("../permissions/pathValidation.js");
/**
 * Check if the plugin zip cache mode is enabled.
 */
function isPluginZipCacheEnabled() {
    return (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_PLUGIN_USE_ZIP_CACHE);
}
/**
 * Get the path to the zip cache directory.
 * Requires CLAUDE_CODE_PLUGIN_CACHE_DIR to be set.
 * Returns undefined if zip cache is not enabled.
 */
function getPluginZipCachePath() {
    if (!isPluginZipCacheEnabled()) {
        return undefined;
    }
    const dir = process.env.CLAUDE_CODE_PLUGIN_CACHE_DIR;
    return dir ? (0, pathValidation_js_1.expandTilde)(dir) : undefined;
}
/**
 * Get the path to known_marketplaces.json in the zip cache.
 */
function getZipCacheKnownMarketplacesPath() {
    const cachePath = getPluginZipCachePath();
    if (!cachePath) {
        throw new Error('Plugin zip cache is not enabled');
    }
    return (0, path_1.join)(cachePath, 'known_marketplaces.json');
}
/**
 * Get the path to installed_plugins.json in the zip cache.
 */
function getZipCacheInstalledPluginsPath() {
    const cachePath = getPluginZipCachePath();
    if (!cachePath) {
        throw new Error('Plugin zip cache is not enabled');
    }
    return (0, path_1.join)(cachePath, 'installed_plugins.json');
}
/**
 * Get the marketplaces directory within the zip cache.
 */
function getZipCacheMarketplacesDir() {
    const cachePath = getPluginZipCachePath();
    if (!cachePath) {
        throw new Error('Plugin zip cache is not enabled');
    }
    return (0, path_1.join)(cachePath, 'marketplaces');
}
/**
 * Get the plugins directory within the zip cache.
 */
function getZipCachePluginsDir() {
    const cachePath = getPluginZipCachePath();
    if (!cachePath) {
        throw new Error('Plugin zip cache is not enabled');
    }
    return (0, path_1.join)(cachePath, 'plugins');
}
// Session plugin cache: a temp directory on local disk (NOT in the mounted zip cache)
// that holds extracted plugins for the duration of the session.
let sessionPluginCachePath = null;
let sessionPluginCachePromise = null;
/**
 * Get or create the session plugin cache directory.
 * This is a temp directory on local disk where plugins are extracted for the session.
 */
async function getSessionPluginCachePath() {
    if (sessionPluginCachePath) {
        return sessionPluginCachePath;
    }
    if (!sessionPluginCachePromise) {
        sessionPluginCachePromise = (async () => {
            const suffix = (0, crypto_1.randomBytes)(8).toString('hex');
            const dir = (0, path_1.join)((0, os_1.tmpdir)(), `claude-plugin-session-${suffix}`);
            await (0, fsOperations_js_1.getFsImplementation)().mkdir(dir);
            sessionPluginCachePath = dir;
            (0, debug_js_1.logForDebugging)(`Created session plugin cache at ${dir}`);
            return dir;
        })();
    }
    return sessionPluginCachePromise;
}
/**
 * Clean up the session plugin cache directory.
 * Should be called when the session ends.
 */
async function cleanupSessionPluginCache() {
    if (!sessionPluginCachePath) {
        return;
    }
    try {
        await (0, promises_1.rm)(sessionPluginCachePath, { recursive: true, force: true });
        (0, debug_js_1.logForDebugging)(`Cleaned up session plugin cache at ${sessionPluginCachePath}`);
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`Failed to clean up session plugin cache: ${error}`);
    }
    finally {
        sessionPluginCachePath = null;
        sessionPluginCachePromise = null;
    }
}
/**
 * Reset the session plugin cache path (for testing).
 */
function resetSessionPluginCache() {
    sessionPluginCachePath = null;
    sessionPluginCachePromise = null;
}
/**
 * Write data to a file in the zip cache atomically.
 * Writes to a temp file in the same directory, then renames.
 */
async function atomicWriteToZipCache(targetPath, data) {
    const dir = (0, path_1.dirname)(targetPath);
    await (0, fsOperations_js_1.getFsImplementation)().mkdir(dir);
    const tmpName = `.${(0, path_1.basename)(targetPath)}.tmp.${(0, crypto_1.randomBytes)(4).toString('hex')}`;
    const tmpPath = (0, path_1.join)(dir, tmpName);
    try {
        if (typeof data === 'string') {
            await (0, promises_1.writeFile)(tmpPath, data, { encoding: 'utf-8' });
        }
        else {
            await (0, promises_1.writeFile)(tmpPath, data);
        }
        await (0, promises_1.rename)(tmpPath, targetPath);
    }
    catch (error) {
        // Clean up tmp file on failure
        try {
            await (0, promises_1.rm)(tmpPath, { force: true });
        }
        catch {
            // ignore cleanup errors
        }
        throw error;
    }
}
/**
 * Create a ZIP archive from a directory.
 * Resolves symlinks to actual file contents (replaces symlinks with real data).
 * Stores Unix mode bits in external_attr so extractZipToDirectory can restore
 * +x — otherwise the round-trip (git clone → zip → extract) loses exec bits.
 *
 * @param sourceDir - Directory to zip
 * @returns ZIP file as Uint8Array
 */
async function createZipFromDirectory(sourceDir) {
    const files = {};
    const visited = new Set();
    await collectFilesForZip(sourceDir, '', files, visited);
    const { zipSync } = await Promise.resolve().then(() => __importStar(require('fflate')));
    const zipData = zipSync(files, { level: 6 });
    (0, debug_js_1.logForDebugging)(`Created ZIP from ${sourceDir}: ${Object.keys(files).length} files, ${zipData.length} bytes`);
    return zipData;
}
/**
 * Recursively collect files from a directory for zipping.
 * Uses lstat to detect symlinks and tracks visited inodes for cycle detection.
 */
async function collectFilesForZip(baseDir, relativePath, files, visited) {
    const currentDir = relativePath ? (0, path_1.join)(baseDir, relativePath) : baseDir;
    let entries;
    try {
        entries = await (0, promises_1.readdir)(currentDir);
    }
    catch {
        return;
    }
    // Track visited directories by dev+ino to detect symlink cycles.
    // bigint: true is required — on Windows NTFS, the file index packs a 16-bit
    // sequence number into the high bits. Once that sequence exceeds ~32 (very
    // common on a busy CI runner that churns through temp files), the value
    // exceeds Number.MAX_SAFE_INTEGER and two adjacent directories round to the
    // same JS number, causing subdirs to be silently skipped as "cycles". This
    // broke the round-trip test on Windows CI when sharding shuffled which tests
    // ran first and pushed MFT sequence numbers over the precision cliff.
    // See also: markdownConfigLoader.ts getFileIdentity, anthropics/claude-code#13893
    try {
        const dirStat = await (0, promises_1.stat)(currentDir, { bigint: true });
        // ReFS (Dev Drive), NFS, some FUSE mounts report dev=0 and ino=0 for
        // everything. Fail open: skip cycle detection rather than skip the
        // directory. We already skip symlinked directories unconditionally below,
        // so the only cycle left here is a bind mount, which we accept.
        if (dirStat.dev !== 0n || dirStat.ino !== 0n) {
            const key = `${dirStat.dev}:${dirStat.ino}`;
            if (visited.has(key)) {
                (0, debug_js_1.logForDebugging)(`Skipping symlink cycle at ${currentDir}`);
                return;
            }
            visited.add(key);
        }
    }
    catch {
        return;
    }
    for (const entry of entries) {
        // Skip hidden files that are git-related
        if (entry === '.git') {
            continue;
        }
        const fullPath = (0, path_1.join)(currentDir, entry);
        const relPath = relativePath ? `${relativePath}/${entry}` : entry;
        let fileStat;
        try {
            fileStat = await (0, promises_1.lstat)(fullPath);
        }
        catch {
            continue;
        }
        // Skip symlinked directories (follow symlinked files)
        if (fileStat.isSymbolicLink()) {
            try {
                const targetStat = await (0, promises_1.stat)(fullPath);
                if (targetStat.isDirectory()) {
                    continue;
                }
                // Symlinked file — read its contents below
                fileStat = targetStat;
            }
            catch {
                continue; // broken symlink
            }
        }
        if (fileStat.isDirectory()) {
            await collectFilesForZip(baseDir, relPath, files, visited);
        }
        else if (fileStat.isFile()) {
            try {
                const content = await (0, promises_1.readFile)(fullPath);
                // os=3 (Unix) + st_mode in high 16 bits of external_attr — this is
                // what parseZipModes reads back on extraction. fileStat is already
                // in hand from the lstat/stat above, so no extra syscall.
                files[relPath] = [
                    new Uint8Array(content),
                    { os: 3, attrs: (fileStat.mode & 0xffff) << 16 },
                ];
            }
            catch (error) {
                (0, debug_js_1.logForDebugging)(`Failed to read file for zip: ${relPath}: ${error}`);
            }
        }
    }
}
/**
 * Extract a ZIP file to a target directory.
 *
 * @param zipPath - Path to the ZIP file
 * @param targetDir - Directory to extract into
 */
async function extractZipToDirectory(zipPath, targetDir) {
    const zipBuf = await (0, fsOperations_js_1.getFsImplementation)().readFileBytes(zipPath);
    const files = await (0, zip_js_1.unzipFile)(zipBuf);
    // fflate doesn't surface external_attr — parse the central directory so
    // exec bits survive extraction (hooks/scripts need +x to run via `sh -c`).
    const modes = (0, zip_js_1.parseZipModes)(zipBuf);
    await (0, fsOperations_js_1.getFsImplementation)().mkdir(targetDir);
    for (const [relPath, data] of Object.entries(files)) {
        // Skip directory entries (trailing slash)
        if (relPath.endsWith('/')) {
            await (0, fsOperations_js_1.getFsImplementation)().mkdir((0, path_1.join)(targetDir, relPath));
            continue;
        }
        const fullPath = (0, path_1.join)(targetDir, relPath);
        await (0, fsOperations_js_1.getFsImplementation)().mkdir((0, path_1.dirname)(fullPath));
        await (0, promises_1.writeFile)(fullPath, data);
        const mode = modes[relPath];
        if (mode && mode & 0o111) {
            // Swallow EPERM/ENOTSUP (NFS root_squash, some FUSE mounts) — losing +x
            // is the pre-PR behavior and better than aborting mid-extraction.
            await (0, promises_1.chmod)(fullPath, mode & 0o777).catch(() => { });
        }
    }
    (0, debug_js_1.logForDebugging)(`Extracted ZIP to ${targetDir}: ${Object.keys(files).length} entries`);
}
/**
 * Convert a plugin directory to a ZIP in-place: zip → atomic write → delete dir.
 * Both call sites (cacheAndRegisterPlugin, copyPluginToVersionedCache) need the
 * same sequence; getting it wrong (non-atomic write, forgetting rm) corrupts cache.
 */
async function convertDirectoryToZipInPlace(dirPath, zipPath) {
    const zipData = await createZipFromDirectory(dirPath);
    await atomicWriteToZipCache(zipPath, zipData);
    await (0, promises_1.rm)(dirPath, { recursive: true, force: true });
}
/**
 * Get the relative path for a marketplace JSON file within the zip cache.
 * Format: marketplaces/{marketplace-name}.json
 */
function getMarketplaceJsonRelativePath(marketplaceName) {
    const sanitized = marketplaceName.replace(/[^a-zA-Z0-9\-_]/g, '-');
    return (0, path_1.join)('marketplaces', `${sanitized}.json`);
}
/**
 * Check if a marketplace source type is supported by zip cache mode.
 *
 * Supported sources write to `join(cacheDir, name)` — syncMarketplacesToZipCache
 * reads marketplace.json from that installLocation, source-type-agnostic.
 * - github/git/url: clone to temp, rename into cacheDir
 * - settings: write synthetic marketplace.json directly to cacheDir (no fetch)
 *
 * Excluded: file/directory (installLocation is the user's path OUTSIDE cacheDir —
 * nonsensical in ephemeral containers), npm (node_modules bloat on Filestore mount).
 */
function isMarketplaceSourceSupportedByZipCache(source) {
    return ['github', 'git', 'url', 'settings'].includes(source.source);
}
