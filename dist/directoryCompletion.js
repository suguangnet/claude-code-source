"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePartialPath = parsePartialPath;
exports.scanDirectory = scanDirectory;
exports.getDirectoryCompletions = getDirectoryCompletions;
exports.clearDirectoryCache = clearDirectoryCache;
exports.isPathLikeToken = isPathLikeToken;
exports.scanDirectoryForPaths = scanDirectoryForPaths;
exports.getPathCompletions = getPathCompletions;
exports.clearPathCache = clearPathCache;
const lru_cache_1 = require("lru-cache");
const path_1 = require("path");
const cwd_js_1 = require("src/utils/cwd.js");
const fsOperations_js_1 = require("src/utils/fsOperations.js");
const log_js_1 = require("src/utils/log.js");
const path_js_1 = require("src/utils/path.js");
// Cache configuration
const CACHE_SIZE = 500;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
// Initialize LRU cache for directory scans
const directoryCache = new lru_cache_1.LRUCache({
    max: CACHE_SIZE,
    ttl: CACHE_TTL,
});
// Initialize LRU cache for path scans (files and directories)
const pathCache = new lru_cache_1.LRUCache({
    max: CACHE_SIZE,
    ttl: CACHE_TTL,
});
/**
 * Parses a partial path into directory and prefix components
 */
function parsePartialPath(partialPath, basePath) {
    // Handle empty input
    if (!partialPath) {
        const directory = basePath || (0, cwd_js_1.getCwd)();
        return { directory, prefix: '' };
    }
    const resolved = (0, path_js_1.expandPath)(partialPath, basePath);
    // If path ends with separator, treat as directory with no prefix
    // Handle both forward slash and platform-specific separator
    if (partialPath.endsWith('/') || partialPath.endsWith(path_1.sep)) {
        return { directory: resolved, prefix: '' };
    }
    // Split into directory and prefix
    const directory = (0, path_1.dirname)(resolved);
    const prefix = (0, path_1.basename)(partialPath);
    return { directory, prefix };
}
/**
 * Scans a directory and returns subdirectories
 * Uses LRU cache to avoid repeated filesystem calls
 */
async function scanDirectory(dirPath) {
    // Check cache first
    const cached = directoryCache.get(dirPath);
    if (cached) {
        return cached;
    }
    try {
        // Read directory contents
        const fs = (0, fsOperations_js_1.getFsImplementation)();
        const entries = await fs.readdir(dirPath);
        // Filter for directories only, exclude hidden directories
        const directories = entries
            .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
            .map(entry => ({
            name: entry.name,
            path: (0, path_1.join)(dirPath, entry.name),
            type: 'directory',
        }))
            .slice(0, 100); // Limit results for MVP
        // Cache the results
        directoryCache.set(dirPath, directories);
        return directories;
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return [];
    }
}
/**
 * Main function to get directory completion suggestions
 */
async function getDirectoryCompletions(partialPath, options = {}) {
    const { basePath = (0, cwd_js_1.getCwd)(), maxResults = 10 } = options;
    const { directory, prefix } = parsePartialPath(partialPath, basePath);
    const entries = await scanDirectory(directory);
    const prefixLower = prefix.toLowerCase();
    const matches = entries
        .filter(entry => entry.name.toLowerCase().startsWith(prefixLower))
        .slice(0, maxResults);
    return matches.map(entry => ({
        id: entry.path,
        displayText: entry.name + '/',
        description: 'directory',
        metadata: { type: 'directory' },
    }));
}
/**
 * Clears the directory cache
 */
function clearDirectoryCache() {
    directoryCache.clear();
}
/**
 * Checks if a string looks like a path (starts with path-like prefixes)
 */
function isPathLikeToken(token) {
    return (token.startsWith('~/') ||
        token.startsWith('/') ||
        token.startsWith('./') ||
        token.startsWith('../') ||
        token === '~' ||
        token === '.' ||
        token === '..');
}
/**
 * Scans a directory and returns both files and subdirectories
 * Uses LRU cache to avoid repeated filesystem calls
 */
async function scanDirectoryForPaths(dirPath, includeHidden = false) {
    const cacheKey = `${dirPath}:${includeHidden}`;
    const cached = pathCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    try {
        const fs = (0, fsOperations_js_1.getFsImplementation)();
        const entries = await fs.readdir(dirPath);
        const paths = entries
            .filter(entry => includeHidden || !entry.name.startsWith('.'))
            .map(entry => ({
            name: entry.name,
            path: (0, path_1.join)(dirPath, entry.name),
            type: entry.isDirectory() ? 'directory' : 'file',
        }))
            .sort((a, b) => {
            // Sort directories first, then alphabetically
            if (a.type === 'directory' && b.type !== 'directory')
                return -1;
            if (a.type !== 'directory' && b.type === 'directory')
                return 1;
            return a.name.localeCompare(b.name);
        })
            .slice(0, 100);
        pathCache.set(cacheKey, paths);
        return paths;
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return [];
    }
}
/**
 * Get path completion suggestions for files and directories
 */
async function getPathCompletions(partialPath, options = {}) {
    const { basePath = (0, cwd_js_1.getCwd)(), maxResults = 10, includeFiles = true, includeHidden = false, } = options;
    const { directory, prefix } = parsePartialPath(partialPath, basePath);
    const entries = await scanDirectoryForPaths(directory, includeHidden);
    const prefixLower = prefix.toLowerCase();
    const matches = entries
        .filter(entry => {
        if (!includeFiles && entry.type === 'file')
            return false;
        return entry.name.toLowerCase().startsWith(prefixLower);
    })
        .slice(0, maxResults);
    // Construct relative path based on original partialPath
    // e.g., if partialPath is "src/c", directory portion is "src/"
    // Strip leading "./" since it's just used for cwd search
    // Handle both forward slash and platform separator for Windows compatibility
    const hasSeparator = partialPath.includes('/') || partialPath.includes(path_1.sep);
    let dirPortion = '';
    if (hasSeparator) {
        // Find the last separator (either / or platform-specific)
        const lastSlash = partialPath.lastIndexOf('/');
        const lastSep = partialPath.lastIndexOf(path_1.sep);
        const lastSeparatorPos = Math.max(lastSlash, lastSep);
        dirPortion = partialPath.substring(0, lastSeparatorPos + 1);
    }
    if (dirPortion.startsWith('./') || dirPortion.startsWith('.' + path_1.sep)) {
        dirPortion = dirPortion.slice(2);
    }
    return matches.map(entry => {
        const fullPath = dirPortion + entry.name;
        return {
            id: fullPath,
            displayText: entry.type === 'directory' ? fullPath + '/' : fullPath,
            metadata: { type: entry.type },
        };
    });
}
/**
 * Clears both directory and path caches
 */
function clearPathCache() {
    directoryCache.clear();
    pathCache.clear();
}
