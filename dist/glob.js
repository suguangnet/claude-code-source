"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractGlobBaseDirectory = extractGlobBaseDirectory;
exports.glob = glob;
const path_1 = require("path");
const envUtils_js_1 = require("./envUtils.js");
const filesystem_js_1 = require("./permissions/filesystem.js");
const platform_js_1 = require("./platform.js");
const orphanedPluginFilter_js_1 = require("./plugins/orphanedPluginFilter.js");
const ripgrep_js_1 = require("./ripgrep.js");
/**
 * Extracts the static base directory from a glob pattern.
 * The base directory is everything before the first glob special character (* ? [ {).
 * Returns the directory portion and the remaining relative pattern.
 */
function extractGlobBaseDirectory(pattern) {
    // Find the first glob special character: *, ?, [, {
    const globChars = /[*?[{]/;
    const match = pattern.match(globChars);
    if (!match || match.index === undefined) {
        // No glob characters - this is a literal path
        // Return the directory portion and filename as pattern
        const dir = (0, path_1.dirname)(pattern);
        const file = (0, path_1.basename)(pattern);
        return { baseDir: dir, relativePattern: file };
    }
    // Get everything before the first glob character
    const staticPrefix = pattern.slice(0, match.index);
    // Find the last path separator in the static prefix
    const lastSepIndex = Math.max(staticPrefix.lastIndexOf('/'), staticPrefix.lastIndexOf(path_1.sep));
    if (lastSepIndex === -1) {
        // No path separator before the glob - pattern is relative to cwd
        return { baseDir: '', relativePattern: pattern };
    }
    let baseDir = staticPrefix.slice(0, lastSepIndex);
    const relativePattern = pattern.slice(lastSepIndex + 1);
    // Handle root directory patterns (e.g., /*.txt on Unix or C:/*.txt on Windows)
    // When lastSepIndex is 0, baseDir is empty but we need to use '/' as the root
    if (baseDir === '' && lastSepIndex === 0) {
        baseDir = '/';
    }
    // Handle Windows drive root paths (e.g., C:/*.txt)
    // 'C:' means "current directory on drive C" (relative), not root
    // We need 'C:/' or 'C:\' for the actual drive root
    if ((0, platform_js_1.getPlatform)() === 'windows' && /^[A-Za-z]:$/.test(baseDir)) {
        baseDir = baseDir + path_1.sep;
    }
    return { baseDir, relativePattern };
}
async function glob(filePattern, cwd, { limit, offset }, abortSignal, toolPermissionContext) {
    let searchDir = cwd;
    let searchPattern = filePattern;
    // Handle absolute paths by extracting the base directory and converting to relative pattern
    // ripgrep's --glob flag only works with relative patterns
    if ((0, path_1.isAbsolute)(filePattern)) {
        const { baseDir, relativePattern } = extractGlobBaseDirectory(filePattern);
        if (baseDir) {
            searchDir = baseDir;
            searchPattern = relativePattern;
        }
    }
    const ignorePatterns = (0, filesystem_js_1.normalizePatternsToPath)((0, filesystem_js_1.getFileReadIgnorePatterns)(toolPermissionContext), searchDir);
    // Use ripgrep for better memory performance
    // --files: list files instead of searching content
    // --glob: filter by pattern
    // --sort=modified: sort by modification time (oldest first)
    // --no-ignore: don't respect .gitignore (default true, set CLAUDE_CODE_GLOB_NO_IGNORE=false to respect .gitignore)
    // --hidden: include hidden files (default true, set CLAUDE_CODE_GLOB_HIDDEN=false to exclude)
    // Note: use || instead of ?? to treat empty string as unset (defaulting to true)
    const noIgnore = (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_GLOB_NO_IGNORE || 'true');
    const hidden = (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_GLOB_HIDDEN || 'true');
    const args = [
        '--files',
        '--glob',
        searchPattern,
        '--sort=modified',
        ...(noIgnore ? ['--no-ignore'] : []),
        ...(hidden ? ['--hidden'] : []),
    ];
    // Add ignore patterns
    for (const pattern of ignorePatterns) {
        args.push('--glob', `!${pattern}`);
    }
    // Exclude orphaned plugin version directories
    for (const exclusion of await (0, orphanedPluginFilter_js_1.getGlobExclusionsForPluginCache)(searchDir)) {
        args.push('--glob', exclusion);
    }
    const allPaths = await (0, ripgrep_js_1.ripGrep)(args, searchDir, abortSignal);
    // ripgrep returns relative paths, convert to absolute
    const absolutePaths = allPaths.map(p => (0, path_1.isAbsolute)(p) ? p : (0, path_1.join)(searchDir, p));
    const truncated = absolutePaths.length > offset + limit;
    const files = absolutePaths.slice(offset, offset + limit);
    return { files, truncated };
}
