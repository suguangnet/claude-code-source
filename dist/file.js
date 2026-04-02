"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FILE_NOT_FOUND_CWD_NOTE = exports.MAX_OUTPUT_SIZE = void 0;
exports.pathExists = pathExists;
exports.readFileSafe = readFileSafe;
exports.getFileModificationTime = getFileModificationTime;
exports.getFileModificationTimeAsync = getFileModificationTimeAsync;
exports.writeTextContent = writeTextContent;
exports.detectFileEncoding = detectFileEncoding;
exports.detectLineEndings = detectLineEndings;
exports.convertLeadingTabsToSpaces = convertLeadingTabsToSpaces;
exports.getAbsoluteAndRelativePaths = getAbsoluteAndRelativePaths;
exports.getDisplayPath = getDisplayPath;
exports.findSimilarFile = findSimilarFile;
exports.suggestPathUnderCwd = suggestPathUnderCwd;
exports.isCompactLinePrefixEnabled = isCompactLinePrefixEnabled;
exports.addLineNumbers = addLineNumbers;
exports.stripLineNumberPrefix = stripLineNumberPrefix;
exports.isDirEmpty = isDirEmpty;
exports.readFileSyncCached = readFileSyncCached;
exports.writeFileSyncAndFlush_DEPRECATED = writeFileSyncAndFlush_DEPRECATED;
exports.getDesktopPath = getDesktopPath;
exports.isFileWithinReadSizeLimit = isFileWithinReadSizeLimit;
exports.normalizePathForComparison = normalizePathForComparison;
exports.pathsEqual = pathsEqual;
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const os_1 = require("os");
const path_1 = require("path");
const index_js_1 = require("src/services/analytics/index.js");
const growthbook_js_1 = require("../services/analytics/growthbook.js");
const cwd_js_1 = require("../utils/cwd.js");
const debug_js_1 = require("./debug.js");
const errors_js_1 = require("./errors.js");
const fileRead_js_1 = require("./fileRead.js");
const fileReadCache_js_1 = require("./fileReadCache.js");
const fsOperations_js_1 = require("./fsOperations.js");
const log_js_1 = require("./log.js");
const path_js_1 = require("./path.js");
const platform_js_1 = require("./platform.js");
/**
 * Check if a path exists asynchronously.
 */
async function pathExists(path) {
    try {
        await (0, promises_1.stat)(path);
        return true;
    }
    catch {
        return false;
    }
}
exports.MAX_OUTPUT_SIZE = 0.25 * 1024 * 1024; // 0.25MB in bytes
function readFileSafe(filepath) {
    try {
        const fs = (0, fsOperations_js_1.getFsImplementation)();
        return fs.readFileSync(filepath, { encoding: 'utf8' });
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return null;
    }
}
/**
 * Get the normalized modification time of a file in milliseconds.
 * Uses Math.floor to ensure consistent timestamp comparisons across file operations,
 * reducing false positives from sub-millisecond precision changes (e.g., from IDE
 * file watchers that touch files without changing content).
 */
function getFileModificationTime(filePath) {
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    return Math.floor(fs.statSync(filePath).mtimeMs);
}
/**
 * Async variant of getFileModificationTime. Same floor semantics.
 * Use this in async paths (getChangedFiles runs every turn on every readFileState
 * entry — sync statSync there triggers the slow-operation indicator on network/
 * slow disks).
 */
async function getFileModificationTimeAsync(filePath) {
    const s = await (0, fsOperations_js_1.getFsImplementation)().stat(filePath);
    return Math.floor(s.mtimeMs);
}
function writeTextContent(filePath, content, encoding, endings) {
    let toWrite = content;
    if (endings === 'CRLF') {
        // Normalize any existing CRLF to LF first so a new_string that already
        // contains \r\n (raw model output) doesn't become \r\r\n after the join.
        toWrite = content.replaceAll('\r\n', '\n').split('\n').join('\r\n');
    }
    writeFileSyncAndFlush_DEPRECATED(filePath, toWrite, { encoding });
}
function detectFileEncoding(filePath) {
    try {
        const fs = (0, fsOperations_js_1.getFsImplementation)();
        const { resolvedPath } = (0, fsOperations_js_1.safeResolvePath)(fs, filePath);
        return (0, fileRead_js_1.detectEncodingForResolvedPath)(resolvedPath);
    }
    catch (error) {
        if ((0, errors_js_1.isFsInaccessible)(error)) {
            (0, debug_js_1.logForDebugging)(`detectFileEncoding failed for expected reason: ${error.code}`, {
                level: 'debug',
            });
        }
        else {
            (0, log_js_1.logError)(error);
        }
        return 'utf8';
    }
}
function detectLineEndings(filePath, encoding = 'utf8') {
    try {
        const fs = (0, fsOperations_js_1.getFsImplementation)();
        const { resolvedPath } = (0, fsOperations_js_1.safeResolvePath)(fs, filePath);
        const { buffer, bytesRead } = fs.readSync(resolvedPath, { length: 4096 });
        const content = buffer.toString(encoding, 0, bytesRead);
        return (0, fileRead_js_1.detectLineEndingsForString)(content);
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return 'LF';
    }
}
function convertLeadingTabsToSpaces(content) {
    // The /gm regex scans every line even on no-match; skip it entirely
    // for the common tab-free case.
    if (!content.includes('\t'))
        return content;
    return content.replace(/^\t+/gm, _ => '  '.repeat(_.length));
}
function getAbsoluteAndRelativePaths(path) {
    const absolutePath = path ? (0, path_js_1.expandPath)(path) : undefined;
    const relativePath = absolutePath
        ? (0, path_1.relative)((0, cwd_js_1.getCwd)(), absolutePath)
        : undefined;
    return { absolutePath, relativePath };
}
function getDisplayPath(filePath) {
    // Use relative path if file is in the current working directory
    const { relativePath } = getAbsoluteAndRelativePaths(filePath);
    if (relativePath && !relativePath.startsWith('..')) {
        return relativePath;
    }
    // Use tilde notation for files in home directory
    const homeDir = (0, os_1.homedir)();
    if (filePath.startsWith(homeDir + path_1.sep)) {
        return '~' + filePath.slice(homeDir.length);
    }
    // Otherwise return the absolute path
    return filePath;
}
/**
 * Find files with the same name but different extensions in the same directory
 * @param filePath The path to the file that doesn't exist
 * @returns The found file with a different extension, or undefined if none found
 */
function findSimilarFile(filePath) {
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    try {
        const dir = (0, path_1.dirname)(filePath);
        const fileBaseName = (0, path_1.basename)(filePath, (0, path_1.extname)(filePath));
        // Get all files in the directory
        const files = fs.readdirSync(dir);
        // Find files with the same base name but different extension
        const similarFiles = files.filter(file => (0, path_1.basename)(file.name, (0, path_1.extname)(file.name)) === fileBaseName &&
            (0, path_1.join)(dir, file.name) !== filePath);
        // Return just the filename of the first match if found
        const firstMatch = similarFiles[0];
        if (firstMatch) {
            return firstMatch.name;
        }
        return undefined;
    }
    catch (error) {
        // Missing dir (ENOENT) is expected; for other errors log and return undefined
        if (!(0, errors_js_1.isENOENT)(error)) {
            (0, log_js_1.logError)(error);
        }
        return undefined;
    }
}
/**
 * Marker included in file-not-found error messages that contain a cwd note.
 * UI renderers check for this to show a short "File not found" message.
 */
exports.FILE_NOT_FOUND_CWD_NOTE = 'Note: your current working directory is';
/**
 * Suggests a corrected path under the current working directory when a file/directory
 * is not found. Detects the "dropped repo folder" pattern where the model constructs
 * an absolute path missing the repo directory component.
 *
 * Example:
 *   cwd = /Users/zeeg/src/currentRepo
 *   requestedPath = /Users/zeeg/src/foobar           (doesn't exist)
 *   returns        /Users/zeeg/src/currentRepo/foobar (if it exists)
 *
 * @param requestedPath - The absolute path that was not found
 * @returns The corrected path if found under cwd, undefined otherwise
 */
async function suggestPathUnderCwd(requestedPath) {
    const cwd = (0, cwd_js_1.getCwd)();
    const cwdParent = (0, path_1.dirname)(cwd);
    // Resolve symlinks in the requested path's parent directory (e.g., /tmp -> /private/tmp on macOS)
    // so the prefix comparison works correctly against the cwd (which is already realpath-resolved).
    let resolvedPath = requestedPath;
    try {
        const resolvedDir = await (0, promises_1.realpath)((0, path_1.dirname)(requestedPath));
        resolvedPath = (0, path_1.join)(resolvedDir, (0, path_1.basename)(requestedPath));
    }
    catch {
        // Parent directory doesn't exist, use the original path
    }
    // Only check if the requested path is under cwd's parent but not under cwd itself.
    // When cwdParent is the root directory (e.g., '/'), use it directly as the prefix
    // to avoid a double-separator '//' that would never match.
    const cwdParentPrefix = cwdParent === path_1.sep ? path_1.sep : cwdParent + path_1.sep;
    if (!resolvedPath.startsWith(cwdParentPrefix) ||
        resolvedPath.startsWith(cwd + path_1.sep) ||
        resolvedPath === cwd) {
        return undefined;
    }
    // Get the relative path from the parent directory
    const relFromParent = (0, path_1.relative)(cwdParent, resolvedPath);
    // Check if the same relative path exists under cwd
    const correctedPath = (0, path_1.join)(cwd, relFromParent);
    try {
        await (0, promises_1.stat)(correctedPath);
        return correctedPath;
    }
    catch {
        return undefined;
    }
}
/**
 * Whether to use the compact line-number prefix format (`N\t` instead of
 * `     N→`). The padded-arrow format costs 9 bytes/line overhead; at
 * 1.35B Read calls × 132 lines avg this is 2.18% of fleet uncached input
 * (bq-queries/read_line_prefix_overhead_verify.sql).
 *
 * Ant soak validated no Edit error regression (6.29% vs 6.86% baseline).
 * Killswitch pattern: GB can disable if issues surface externally.
 */
function isCompactLinePrefixEnabled() {
    // 3P default: killswitch off = compact format enabled. Client-side only —
    // no server support needed, safe for Bedrock/Vertex/Foundry.
    return !(0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_compact_line_prefix_killswitch', false);
}
/**
 * Adds cat -n style line numbers to the content.
 */
function addLineNumbers({ content, 
// 1-indexed
startLine, }) {
    if (!content) {
        return '';
    }
    const lines = content.split(/\r?\n/);
    if (isCompactLinePrefixEnabled()) {
        return lines
            .map((line, index) => `${index + startLine}\t${line}`)
            .join('\n');
    }
    return lines
        .map((line, index) => {
        const numStr = String(index + startLine);
        if (numStr.length >= 6) {
            return `${numStr}→${line}`;
        }
        return `${numStr.padStart(6, ' ')}→${line}`;
    })
        .join('\n');
}
/**
 * Inverse of addLineNumbers — strips the `N→` or `N\t` prefix from a single
 * line. Co-located so format changes here and in addLineNumbers stay in sync.
 */
function stripLineNumberPrefix(line) {
    const match = line.match(/^\s*\d+[\u2192\t](.*)$/);
    return match?.[1] ?? line;
}
/**
 * Checks if a directory is empty.
 * @param dirPath The path to the directory to check
 * @returns true if the directory is empty or does not exist, false otherwise
 */
function isDirEmpty(dirPath) {
    try {
        return (0, fsOperations_js_1.getFsImplementation)().isDirEmptySync(dirPath);
    }
    catch (e) {
        // ENOENT: directory doesn't exist, consider it empty
        // Other errors (EPERM on macOS protected folders, etc.): assume not empty
        return (0, errors_js_1.isENOENT)(e);
    }
}
/**
 * Reads a file with caching to avoid redundant I/O operations.
 * This is the preferred method for FileEditTool operations.
 */
function readFileSyncCached(filePath) {
    const { content } = fileReadCache_js_1.fileReadCache.readFile(filePath);
    return content;
}
/**
 * Writes to a file and flushes the file to disk
 * @param filePath The path to the file to write to
 * @param content The content to write to the file
 * @param options Options for writing the file, including encoding and mode
 * @deprecated Use `fs.promises.writeFile` with flush option instead for non-blocking writes.
 * Sync file writes block the event loop and cause performance issues.
 */
function writeFileSyncAndFlush_DEPRECATED(filePath, content, options = { encoding: 'utf-8' }) {
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    // Check if the target file is a symlink to preserve it for all users
    // Note: We don't use safeResolvePath here because we need to manually handle
    // symlinks to ensure we write to the target while preserving the symlink itself
    let targetPath = filePath;
    try {
        // Try to read the symlink - if successful, it's a symlink
        const linkTarget = fs.readlinkSync(filePath);
        // Resolve to absolute path
        targetPath = (0, path_1.isAbsolute)(linkTarget)
            ? linkTarget
            : (0, path_1.resolve)((0, path_1.dirname)(filePath), linkTarget);
        (0, debug_js_1.logForDebugging)(`Writing through symlink: ${filePath} -> ${targetPath}`);
    }
    catch {
        // ENOENT (doesn't exist) or EINVAL (not a symlink) — keep targetPath = filePath
    }
    // Try atomic write first
    const tempPath = `${targetPath}.tmp.${process.pid}.${Date.now()}`;
    // Check if target file exists and get its permissions (single stat, reused in both atomic and fallback paths)
    let targetMode;
    let targetExists = false;
    try {
        targetMode = fs.statSync(targetPath).mode;
        targetExists = true;
        (0, debug_js_1.logForDebugging)(`Preserving file permissions: ${targetMode.toString(8)}`);
    }
    catch (e) {
        if (!(0, errors_js_1.isENOENT)(e))
            throw e;
        if (options.mode !== undefined) {
            // Use provided mode for new files
            targetMode = options.mode;
            (0, debug_js_1.logForDebugging)(`Setting permissions for new file: ${targetMode.toString(8)}`);
        }
    }
    try {
        (0, debug_js_1.logForDebugging)(`Writing to temp file: ${tempPath}`);
        // Write to temp file with flush and mode (if specified for new file)
        const writeOptions = {
            encoding: options.encoding,
            flush: true,
        };
        // Only set mode in writeFileSync for new files to ensure atomic permission setting
        if (!targetExists && options.mode !== undefined) {
            writeOptions.mode = options.mode;
        }
        (0, fs_1.writeFileSync)(tempPath, content, writeOptions);
        (0, debug_js_1.logForDebugging)(`Temp file written successfully, size: ${content.length} bytes`);
        // For existing files or if mode was not set atomically, apply permissions
        if (targetExists && targetMode !== undefined) {
            (0, fs_1.chmodSync)(tempPath, targetMode);
            (0, debug_js_1.logForDebugging)(`Applied original permissions to temp file`);
        }
        // Atomic rename (on POSIX systems, this is atomic)
        // On Windows, this will overwrite the destination if it exists
        (0, debug_js_1.logForDebugging)(`Renaming ${tempPath} to ${targetPath}`);
        fs.renameSync(tempPath, targetPath);
        (0, debug_js_1.logForDebugging)(`File ${targetPath} written atomically`);
    }
    catch (atomicError) {
        (0, debug_js_1.logForDebugging)(`Failed to write file atomically: ${atomicError}`, {
            level: 'error',
        });
        (0, index_js_1.logEvent)('tengu_atomic_write_error', {});
        // Clean up temp file on error
        try {
            (0, debug_js_1.logForDebugging)(`Cleaning up temp file: ${tempPath}`);
            fs.unlinkSync(tempPath);
        }
        catch (cleanupError) {
            (0, debug_js_1.logForDebugging)(`Failed to clean up temp file: ${cleanupError}`);
        }
        // Fallback to non-atomic write
        (0, debug_js_1.logForDebugging)(`Falling back to non-atomic write for ${targetPath}`);
        try {
            const fallbackOptions = {
                encoding: options.encoding,
                flush: true,
            };
            // Only set mode for new files
            if (!targetExists && options.mode !== undefined) {
                fallbackOptions.mode = options.mode;
            }
            (0, fs_1.writeFileSync)(targetPath, content, fallbackOptions);
            (0, debug_js_1.logForDebugging)(`File ${targetPath} written successfully with non-atomic fallback`);
        }
        catch (fallbackError) {
            (0, debug_js_1.logForDebugging)(`Non-atomic write also failed: ${fallbackError}`);
            throw fallbackError;
        }
    }
}
function getDesktopPath() {
    const platform = (0, platform_js_1.getPlatform)();
    const homeDir = (0, os_1.homedir)();
    if (platform === 'macos') {
        return (0, path_1.join)(homeDir, 'Desktop');
    }
    if (platform === 'windows') {
        // For WSL, try to access Windows desktop
        const windowsHome = process.env.USERPROFILE
            ? process.env.USERPROFILE.replace(/\\/g, '/')
            : null;
        if (windowsHome) {
            const wslPath = windowsHome.replace(/^[A-Z]:/, '');
            const desktopPath = `/mnt/c${wslPath}/Desktop`;
            if ((0, fsOperations_js_1.getFsImplementation)().existsSync(desktopPath)) {
                return desktopPath;
            }
        }
        // Fallback: try to find desktop in typical Windows user location
        try {
            const usersDir = '/mnt/c/Users';
            const userDirs = (0, fsOperations_js_1.getFsImplementation)().readdirSync(usersDir);
            for (const user of userDirs) {
                if (user.name === 'Public' ||
                    user.name === 'Default' ||
                    user.name === 'Default User' ||
                    user.name === 'All Users') {
                    continue;
                }
                const potentialDesktopPath = (0, path_1.join)(usersDir, user.name, 'Desktop');
                if ((0, fsOperations_js_1.getFsImplementation)().existsSync(potentialDesktopPath)) {
                    return potentialDesktopPath;
                }
            }
        }
        catch (error) {
            (0, log_js_1.logError)(error);
        }
    }
    // Linux/unknown platform fallback
    const desktopPath = (0, path_1.join)(homeDir, 'Desktop');
    if ((0, fsOperations_js_1.getFsImplementation)().existsSync(desktopPath)) {
        return desktopPath;
    }
    // If Desktop folder doesn't exist, fallback to home directory
    return homeDir;
}
/**
 * Validates that a file size is within the specified limit.
 * Returns true if the file is within the limit, false otherwise.
 *
 * @param filePath The path to the file to validate
 * @param maxSizeBytes The maximum allowed file size in bytes
 * @returns true if file size is within limit, false otherwise
 */
function isFileWithinReadSizeLimit(filePath, maxSizeBytes = exports.MAX_OUTPUT_SIZE) {
    try {
        const stats = (0, fsOperations_js_1.getFsImplementation)().statSync(filePath);
        return stats.size <= maxSizeBytes;
    }
    catch {
        // If we can't stat the file, return false to indicate validation failure
        return false;
    }
}
/**
 * Normalize a file path for comparison, handling platform differences.
 * On Windows, normalizes path separators and converts to lowercase for
 * case-insensitive comparison.
 */
function normalizePathForComparison(filePath) {
    // Use path.normalize() to clean up redundant separators and resolve . and ..
    let normalized = (0, path_1.normalize)(filePath);
    // On Windows, normalize for case-insensitive comparison:
    // - Convert forward slashes to backslashes (path.normalize only does this on actual Windows)
    // - Convert to lowercase (Windows paths are case-insensitive)
    if ((0, platform_js_1.getPlatform)() === 'windows') {
        normalized = normalized.replace(/\//g, '\\').toLowerCase();
    }
    return normalized;
}
/**
 * Compare two file paths for equality, handling Windows case-insensitivity.
 */
function pathsEqual(path1, path2) {
    return normalizePathForComparison(path1) === normalizePathForComparison(path2);
}
