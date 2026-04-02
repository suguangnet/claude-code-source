"use strict";
/**
 * Provides ripgrep glob exclusion patterns for orphaned plugin versions.
 *
 * When plugin versions are updated, old versions are marked with a
 * `.orphaned_at` file but kept on disk for 7 days (since concurrent
 * sessions might still reference them). During this window, Grep/Glob
 * could return files from orphaned versions, causing Claude to use
 * outdated plugin code.
 *
 * We find `.orphaned_at` markers via a single ripgrep call and generate
 * `--glob '!<dir>/**'` patterns for their parent directories. The cache
 * is warmed in main.tsx AFTER cleanupOrphanedPluginVersionsInBackground
 * settles disk state. Once populated, the exclusion list is frozen for
 * the session unless /reload-plugins is called; subsequent disk mutations
 * (autoupdate, concurrent sessions) don't affect it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGlobExclusionsForPluginCache = getGlobExclusionsForPluginCache;
exports.clearPluginCacheExclusions = clearPluginCacheExclusions;
const path_1 = require("path");
const ripgrep_js_1 = require("../ripgrep.js");
const pluginDirectories_js_1 = require("./pluginDirectories.js");
// Inlined from cacheUtils.ts to avoid a circular dep through commands.js.
const ORPHANED_AT_FILENAME = '.orphaned_at';
/** Session-scoped cache. Frozen once computed — only cleared by explicit /reload-plugins. */
let cachedExclusions = null;
/**
 * Get ripgrep glob exclusion patterns for orphaned plugin versions.
 *
 * @param searchPath - When provided, exclusions are only returned if the
 *   search overlaps the plugin cache directory (avoids unnecessary --glob
 *   args for searches outside the cache).
 *
 * Warmed eagerly in main.tsx after orphan GC; the lazy-compute path here
 * is a fallback. Best-effort: returns empty array if anything goes wrong.
 */
async function getGlobExclusionsForPluginCache(searchPath) {
    const cachePath = (0, path_1.normalize)((0, path_1.join)((0, pluginDirectories_js_1.getPluginsDirectory)(), 'cache'));
    if (searchPath && !pathsOverlap(searchPath, cachePath)) {
        return [];
    }
    if (cachedExclusions !== null) {
        return cachedExclusions;
    }
    try {
        // Find all .orphaned_at files within the plugin cache directory.
        // --hidden: marker is a dotfile. --no-ignore: don't let a stray
        // .gitignore hide it. --max-depth 4: marker is always at
        // cache/<marketplace>/<plugin>/<version>/.orphaned_at — don't recurse
        // into plugin contents (node_modules, etc.). Never-aborts signal: no
        // caller signal to thread.
        const markers = await (0, ripgrep_js_1.ripGrep)([
            '--files',
            '--hidden',
            '--no-ignore',
            '--max-depth',
            '4',
            '--glob',
            ORPHANED_AT_FILENAME,
        ], cachePath, new AbortController().signal);
        cachedExclusions = markers.map(markerPath => {
            // ripgrep may return absolute or relative — normalize to relative.
            const versionDir = (0, path_1.dirname)(markerPath);
            const rel = (0, path_1.isAbsolute)(versionDir)
                ? (0, path_1.relative)(cachePath, versionDir)
                : versionDir;
            // ripgrep glob patterns always use forward slashes, even on Windows
            const posixRelative = rel.replace(/\\/g, '/');
            return `!**/${posixRelative}/**`;
        });
        return cachedExclusions;
    }
    catch {
        // Best-effort — don't break core search tools if ripgrep fails here
        cachedExclusions = [];
        return cachedExclusions;
    }
}
function clearPluginCacheExclusions() {
    cachedExclusions = null;
}
/**
 * One path is a prefix of the other. Special-cases root (normalize('/') + sep
 * = '//'). Case-insensitive on win32 since normalize() doesn't lowercase
 * drive letters and CLAUDE_CODE_PLUGIN_CACHE_DIR may disagree with resolved.
 */
function pathsOverlap(a, b) {
    const na = normalizeForCompare(a);
    const nb = normalizeForCompare(b);
    return (na === nb ||
        na === path_1.sep ||
        nb === path_1.sep ||
        na.startsWith(nb + path_1.sep) ||
        nb.startsWith(na + path_1.sep));
}
function normalizeForCompare(p) {
    const n = (0, path_1.normalize)(p);
    return process.platform === 'win32' ? n.toLowerCase() : n;
}
