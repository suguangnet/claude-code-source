"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadMarkdownFilesForSubdir = exports.CLAUDE_CONFIG_DIRECTORIES = void 0;
exports.extractDescriptionFromMarkdown = extractDescriptionFromMarkdown;
exports.parseAgentToolsFromFrontmatter = parseAgentToolsFromFrontmatter;
exports.parseSlashCommandToolsFromFrontmatter = parseSlashCommandToolsFromFrontmatter;
exports.getProjectDirsUpToHome = getProjectDirsUpToHome;
const bun_bundle_1 = require("bun:bundle");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const os_1 = require("os");
const path_1 = require("path");
const index_js_1 = require("src/services/analytics/index.js");
const state_js_1 = require("../bootstrap/state.js");
const debug_js_1 = require("./debug.js");
const envUtils_js_1 = require("./envUtils.js");
const errors_js_1 = require("./errors.js");
const file_js_1 = require("./file.js");
const frontmatterParser_js_1 = require("./frontmatterParser.js");
const git_js_1 = require("./git.js");
const permissionSetup_js_1 = require("./permissions/permissionSetup.js");
const ripgrep_js_1 = require("./ripgrep.js");
const constants_js_1 = require("./settings/constants.js");
const managedPath_js_1 = require("./settings/managedPath.js");
const pluginOnlyPolicy_js_1 = require("./settings/pluginOnlyPolicy.js");
// Claude configuration directory names
exports.CLAUDE_CONFIG_DIRECTORIES = [
    'commands',
    'agents',
    'output-styles',
    'skills',
    'workflows',
    ...((0, bun_bundle_1.feature)('TEMPLATES') ? ['templates'] : []),
];
/**
 * Extracts a description from markdown content
 * Uses the first non-empty line as the description, or falls back to a default
 */
function extractDescriptionFromMarkdown(content, defaultDescription = 'Custom item') {
    const lines = content.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
            // If it's a header, strip the header prefix
            const headerMatch = trimmed.match(/^#+\s+(.+)$/);
            const text = headerMatch?.[1] ?? trimmed;
            // Return the text, limited to reasonable length
            return text.length > 100 ? text.substring(0, 97) + '...' : text;
        }
    }
    return defaultDescription;
}
/**
 * Parses tools from frontmatter, supporting both string and array formats
 * Always returns a string array for consistency
 * @param toolsValue The value from frontmatter
 * @returns Parsed tool list as string[]
 */
function parseToolListString(toolsValue) {
    // Return null for missing/null - let caller decide the default
    if (toolsValue === undefined || toolsValue === null) {
        return null;
    }
    // Empty string or other falsy values mean no tools
    if (!toolsValue) {
        return [];
    }
    let toolsArray = [];
    if (typeof toolsValue === 'string') {
        toolsArray = [toolsValue];
    }
    else if (Array.isArray(toolsValue)) {
        toolsArray = toolsValue.filter((item) => typeof item === 'string');
    }
    if (toolsArray.length === 0) {
        return [];
    }
    const parsedTools = (0, permissionSetup_js_1.parseToolListFromCLI)(toolsArray);
    if (parsedTools.includes('*')) {
        return ['*'];
    }
    return parsedTools;
}
/**
 * Parse tools from agent frontmatter
 * Missing field = undefined (all tools)
 * Empty field = [] (no tools)
 */
function parseAgentToolsFromFrontmatter(toolsValue) {
    const parsed = parseToolListString(toolsValue);
    if (parsed === null) {
        // For agents: undefined = all tools (undefined), null = no tools ([])
        return toolsValue === undefined ? undefined : [];
    }
    // If parsed contains '*', return undefined (all tools)
    if (parsed.includes('*')) {
        return undefined;
    }
    return parsed;
}
/**
 * Parse allowed-tools from slash command frontmatter
 * Missing or empty field = no tools ([])
 */
function parseSlashCommandToolsFromFrontmatter(toolsValue) {
    const parsed = parseToolListString(toolsValue);
    if (parsed === null) {
        return [];
    }
    return parsed;
}
/**
 * Gets a unique identifier for a file based on its device ID and inode.
 * This allows detection of duplicate files accessed through different paths
 * (e.g., via symlinks). Returns null if the file doesn't exist or can't be stat'd.
 *
 * Note: On Windows, dev and ino may not be reliable for all file systems.
 * The code handles this gracefully by returning null on error (fail open),
 * meaning deduplication may not work on some Windows configurations.
 *
 * Uses bigint: true to handle filesystems with large inodes (e.g., ExFAT)
 * that exceed JavaScript's Number precision (53 bits). Without bigint, different
 * large inodes can round to the same Number, causing false duplicate detection.
 * See: https://github.com/anthropics/claude-code/issues/13893
 *
 * @param filePath - Path to the file
 * @returns A string identifier "device:inode" or null if file can't be identified
 */
async function getFileIdentity(filePath) {
    try {
        const stats = await (0, promises_1.lstat)(filePath, { bigint: true });
        // Some filesystems (NFS, FUSE, network mounts) report dev=0 and ino=0
        // for all files, which would cause every file to look like a duplicate.
        // Return null to skip deduplication for these unreliable identities.
        if (stats.dev === 0n && stats.ino === 0n) {
            return null;
        }
        return `${stats.dev}:${stats.ino}`;
    }
    catch {
        return null;
    }
}
/**
 * Compute the stop boundary for getProjectDirsUpToHome's upward walk.
 *
 * Normally the walk stops at the nearest `.git` above `cwd`. But if the Bash
 * tool has cd'd into a nested git repo inside the session's project (submodule,
 * vendored dep with its own `.git`), that nested root isn't the right boundary —
 * stopping there makes the parent project's `.claude/` unreachable (#31905).
 *
 * The boundary is widened to the session's git root only when BOTH:
 *   - the nearest `.git` from cwd belongs to a *different* canonical repo
 *     (submodule/vendored clone — not a worktree, which resolves back to main)
 *   - that nearest `.git` sits *inside* the session's project tree
 *
 * Worktrees (under `.claude/worktrees/`) stay on the old behavior: their `.git`
 * file is the stop, and loadMarkdownFilesForSubdir's fallback adds the main-repo
 * copy only when the worktree lacks one.
 */
function resolveStopBoundary(cwd) {
    const cwdGitRoot = (0, git_js_1.findGitRoot)(cwd);
    const sessionGitRoot = (0, git_js_1.findGitRoot)((0, state_js_1.getProjectRoot)());
    if (!cwdGitRoot || !sessionGitRoot) {
        return cwdGitRoot;
    }
    // findCanonicalGitRoot resolves worktree `.git` files to the main repo.
    // Submodules (no commondir) and standalone clones fall through unchanged.
    const cwdCanonical = (0, git_js_1.findCanonicalGitRoot)(cwd);
    if (cwdCanonical &&
        (0, file_js_1.normalizePathForComparison)(cwdCanonical) ===
            (0, file_js_1.normalizePathForComparison)(sessionGitRoot)) {
        // Same canonical repo (main, or a worktree of main). Stop at nearest .git.
        return cwdGitRoot;
    }
    // Different canonical repo. Is it nested *inside* the session's project?
    const nCwdGitRoot = (0, file_js_1.normalizePathForComparison)(cwdGitRoot);
    const nSessionRoot = (0, file_js_1.normalizePathForComparison)(sessionGitRoot);
    if (nCwdGitRoot !== nSessionRoot &&
        nCwdGitRoot.startsWith(nSessionRoot + path_1.sep)) {
        // Nested repo inside the project — skip past it, stop at the project's root.
        return sessionGitRoot;
    }
    // Sibling repo or elsewhere. Stop at nearest .git (old behavior).
    return cwdGitRoot;
}
/**
 * Traverses from the current directory up to the git root (or home directory if not in a git repo),
 * collecting all .claude directories along the way.
 *
 * Stopping at git root prevents commands/skills from parent directories outside the repository
 * from leaking into projects. For example, if ~/projects/.claude/commands/ exists, it won't
 * appear in ~/projects/my-repo/ if my-repo is a git repository.
 *
 * @param subdir Subdirectory (eg. "commands", "agents")
 * @param cwd Current working directory to start from
 * @returns Array of directory paths containing .claude/subdir, from most specific (cwd) to least specific
 */
function getProjectDirsUpToHome(subdir, cwd) {
    const home = (0, path_1.resolve)((0, os_1.homedir)()).normalize('NFC');
    const gitRoot = resolveStopBoundary(cwd);
    let current = (0, path_1.resolve)(cwd);
    const dirs = [];
    // Traverse from current directory up to git root (or home if not in a git repo)
    while (true) {
        // Stop if we've reached the home directory (don't check it, as it's loaded separately as userDir)
        // Use normalized comparison to handle Windows drive letter casing (C:\ vs c:\)
        if ((0, file_js_1.normalizePathForComparison)(current) === (0, file_js_1.normalizePathForComparison)(home)) {
            break;
        }
        const claudeSubdir = (0, path_1.join)(current, '.claude', subdir);
        // Filter to existing dirs. This is a perf filter (avoids spawning
        // ripgrep on non-existent dirs downstream) and the worktree fallback
        // in loadMarkdownFilesForSubdir relies on it. statSync + explicit error
        // handling instead of existsSync — re-throws unexpected errors rather
        // than silently swallowing them. Downstream loadMarkdownFiles handles
        // the TOCTOU window (dir disappearing before read) gracefully.
        try {
            (0, fs_1.statSync)(claudeSubdir);
            dirs.push(claudeSubdir);
        }
        catch (e) {
            if (!(0, errors_js_1.isFsInaccessible)(e))
                throw e;
        }
        // Stop after processing the git root directory - this prevents commands from parent
        // directories outside the repository from appearing in the project
        if (gitRoot &&
            (0, file_js_1.normalizePathForComparison)(current) ===
                (0, file_js_1.normalizePathForComparison)(gitRoot)) {
            break;
        }
        // Move to parent directory
        const parent = (0, path_1.dirname)(current);
        // Safety check: if parent is the same as current, we've reached the root
        if (parent === current) {
            break;
        }
        current = parent;
    }
    return dirs;
}
/**
 * Loads markdown files from managed, user, and project directories
 * @param subdir Subdirectory (eg. "agents" or "commands")
 * @param cwd Current working directory for project directory traversal
 * @returns Array of parsed markdown files with metadata
 */
exports.loadMarkdownFilesForSubdir = (0, memoize_js_1.default)(async function (subdir, cwd) {
    const searchStartTime = Date.now();
    const userDir = (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), subdir);
    const managedDir = (0, path_1.join)((0, managedPath_js_1.getManagedFilePath)(), '.claude', subdir);
    const projectDirs = getProjectDirsUpToHome(subdir, cwd);
    // For git worktrees where the worktree does NOT have .claude/<subdir> checked
    // out (e.g. sparse-checkout), fall back to the main repository's copy.
    // getProjectDirsUpToHome stops at the worktree root (where the .git file is),
    // so it never sees the main repo on its own.
    //
    // Only add the main repo's copy when the worktree root's .claude/<subdir>
    // is absent. A standard `git worktree add` checks out the full tree, so the
    // worktree already has identical .claude/<subdir> content — loading the main
    // repo's copy too would duplicate every command/agent/skill
    // (anthropics/claude-code#29599, #28182, #26992).
    //
    // projectDirs already reflects existence (getProjectDirsUpToHome checked
    // each dir), so we compare against that instead of stat'ing again.
    const gitRoot = (0, git_js_1.findGitRoot)(cwd);
    const canonicalRoot = (0, git_js_1.findCanonicalGitRoot)(cwd);
    if (gitRoot && canonicalRoot && canonicalRoot !== gitRoot) {
        const worktreeSubdir = (0, file_js_1.normalizePathForComparison)((0, path_1.join)(gitRoot, '.claude', subdir));
        const worktreeHasSubdir = projectDirs.some(dir => (0, file_js_1.normalizePathForComparison)(dir) === worktreeSubdir);
        if (!worktreeHasSubdir) {
            const mainClaudeSubdir = (0, path_1.join)(canonicalRoot, '.claude', subdir);
            if (!projectDirs.includes(mainClaudeSubdir)) {
                projectDirs.push(mainClaudeSubdir);
            }
        }
    }
    const [managedFiles, userFiles, projectFilesNested] = await Promise.all([
        // Always load managed (policy settings)
        loadMarkdownFiles(managedDir).then(_ => _.map(file => ({
            ...file,
            baseDir: managedDir,
            source: 'policySettings',
        }))),
        // Conditionally load user files
        (0, constants_js_1.isSettingSourceEnabled)('userSettings') &&
            !(subdir === 'agents' && (0, pluginOnlyPolicy_js_1.isRestrictedToPluginOnly)('agents'))
            ? loadMarkdownFiles(userDir).then(_ => _.map(file => ({
                ...file,
                baseDir: userDir,
                source: 'userSettings',
            })))
            : Promise.resolve([]),
        // Conditionally load project files from all directories up to home
        (0, constants_js_1.isSettingSourceEnabled)('projectSettings') &&
            !(subdir === 'agents' && (0, pluginOnlyPolicy_js_1.isRestrictedToPluginOnly)('agents'))
            ? Promise.all(projectDirs.map(projectDir => loadMarkdownFiles(projectDir).then(_ => _.map(file => ({
                ...file,
                baseDir: projectDir,
                source: 'projectSettings',
            })))))
            : Promise.resolve([]),
    ]);
    // Flatten nested project files array
    const projectFiles = projectFilesNested.flat();
    // Combine all files with priority: managed > user > project
    const allFiles = [...managedFiles, ...userFiles, ...projectFiles];
    // Deduplicate files that resolve to the same physical file (same inode).
    // This prevents the same file from appearing multiple times when ~/.claude is
    // symlinked to a directory within the project hierarchy, causing the same
    // physical file to be discovered through different paths.
    const fileIdentities = await Promise.all(allFiles.map(file => getFileIdentity(file.filePath)));
    const seenFileIds = new Map();
    const deduplicatedFiles = [];
    for (const [i, file] of allFiles.entries()) {
        const fileId = fileIdentities[i] ?? null;
        if (fileId === null) {
            // If we can't identify the file, include it (fail open)
            deduplicatedFiles.push(file);
            continue;
        }
        const existingSource = seenFileIds.get(fileId);
        if (existingSource !== undefined) {
            (0, debug_js_1.logForDebugging)(`Skipping duplicate file '${file.filePath}' from ${file.source} (same inode already loaded from ${existingSource})`);
            continue;
        }
        seenFileIds.set(fileId, file.source);
        deduplicatedFiles.push(file);
    }
    const duplicatesRemoved = allFiles.length - deduplicatedFiles.length;
    if (duplicatesRemoved > 0) {
        (0, debug_js_1.logForDebugging)(`Deduplicated ${duplicatesRemoved} files in ${subdir} (same inode via symlinks or hard links)`);
    }
    (0, index_js_1.logEvent)(`tengu_dir_search`, {
        durationMs: Date.now() - searchStartTime,
        managedFilesFound: managedFiles.length,
        userFilesFound: userFiles.length,
        projectFilesFound: projectFiles.length,
        projectDirsSearched: projectDirs.length,
        subdir: subdir,
    });
    return deduplicatedFiles;
}, 
// Custom resolver creates cache key from both subdir and cwd parameters
(subdir, cwd) => `${subdir}:${cwd}`);
/**
 * Native implementation to find markdown files using Node.js fs APIs
 *
 * This implementation exists alongside ripgrep for the following reasons:
 * 1. Ripgrep has poor startup performance in native builds (noticeable on app startup)
 * 2. Provides a fallback when ripgrep is unavailable
 * 3. Can be explicitly enabled via CLAUDE_CODE_USE_NATIVE_FILE_SEARCH env var
 *
 * Symlink handling:
 * - Follows symlinks (equivalent to ripgrep's --follow flag)
 * - Uses device+inode tracking to detect cycles (same as ripgrep's same_file library)
 * - Falls back to realpath on systems without inode support
 *
 * Does not respect .gitignore (matches ripgrep with --no-ignore flag)
 *
 * @param dir Directory to search
 * @param signal AbortSignal for timeout
 * @returns Array of file paths
 */
async function findMarkdownFilesNative(dir, signal) {
    const files = [];
    const visitedDirs = new Set();
    async function walk(currentDir) {
        if (signal.aborted) {
            return;
        }
        // Cycle detection: track visited directories by device+inode
        // Uses bigint: true to handle filesystems with large inodes (e.g., ExFAT)
        // that exceed JavaScript's Number precision (53 bits).
        // See: https://github.com/anthropics/claude-code/issues/13893
        try {
            const stats = await (0, promises_1.stat)(currentDir, { bigint: true });
            if (stats.isDirectory()) {
                const dirKey = stats.dev !== undefined && stats.ino !== undefined
                    ? `${stats.dev}:${stats.ino}` // Unix/Linux: device + inode
                    : await (0, promises_1.realpath)(currentDir); // Windows: canonical path
                if (visitedDirs.has(dirKey)) {
                    (0, debug_js_1.logForDebugging)(`Skipping already visited directory (circular symlink): ${currentDir}`);
                    return;
                }
                visitedDirs.add(dirKey);
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            (0, debug_js_1.logForDebugging)(`Failed to stat directory ${currentDir}: ${errorMessage}`);
            return;
        }
        try {
            const entries = await (0, promises_1.readdir)(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                if (signal.aborted) {
                    break;
                }
                const fullPath = (0, path_1.join)(currentDir, entry.name);
                try {
                    // Handle symlinks: isFile() and isDirectory() return false for symlinks
                    if (entry.isSymbolicLink()) {
                        try {
                            const stats = await (0, promises_1.stat)(fullPath); // stat() follows symlinks
                            if (stats.isDirectory()) {
                                await walk(fullPath);
                            }
                            else if (stats.isFile() && entry.name.endsWith('.md')) {
                                files.push(fullPath);
                            }
                        }
                        catch (error) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            (0, debug_js_1.logForDebugging)(`Failed to follow symlink ${fullPath}: ${errorMessage}`);
                        }
                    }
                    else if (entry.isDirectory()) {
                        await walk(fullPath);
                    }
                    else if (entry.isFile() && entry.name.endsWith('.md')) {
                        files.push(fullPath);
                    }
                }
                catch (error) {
                    // Skip files/directories we can't access
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    (0, debug_js_1.logForDebugging)(`Failed to access ${fullPath}: ${errorMessage}`);
                }
            }
        }
        catch (error) {
            // If readdir fails (e.g., permission denied), log and continue
            const errorMessage = error instanceof Error ? error.message : String(error);
            (0, debug_js_1.logForDebugging)(`Failed to read directory ${currentDir}: ${errorMessage}`);
        }
    }
    await walk(dir);
    return files;
}
/**
 * Generic function to load markdown files from specified directories
 * @param dir Directory (eg. "~/.claude/commands")
 * @returns Array of parsed markdown files with metadata
 */
async function loadMarkdownFiles(dir) {
    // File search strategy:
    // - Default: ripgrep (faster, battle-tested)
    // - Fallback: native Node.js (when CLAUDE_CODE_USE_NATIVE_FILE_SEARCH is set)
    //
    // Why both? Ripgrep has poor startup performance in native builds.
    const useNative = (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_USE_NATIVE_FILE_SEARCH);
    const signal = AbortSignal.timeout(3000);
    let files;
    try {
        files = useNative
            ? await findMarkdownFilesNative(dir, signal)
            : await (0, ripgrep_js_1.ripGrep)(['--files', '--hidden', '--follow', '--no-ignore', '--glob', '*.md'], dir, signal);
    }
    catch (e) {
        // Handle missing/inaccessible dir directly instead of pre-checking
        // existence (TOCTOU). findMarkdownFilesNative already catches internally;
        // ripGrep rejects on inaccessible target paths.
        if ((0, errors_js_1.isFsInaccessible)(e))
            return [];
        throw e;
    }
    const results = await Promise.all(files.map(async (filePath) => {
        try {
            const rawContent = await (0, promises_1.readFile)(filePath, { encoding: 'utf-8' });
            const { frontmatter, content } = (0, frontmatterParser_js_1.parseFrontmatter)(rawContent, filePath);
            return {
                filePath,
                frontmatter,
                content,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            (0, debug_js_1.logForDebugging)(`Failed to read/parse markdown file:  ${filePath}: ${errorMessage}`);
            return null;
        }
    }));
    return results.filter(_ => _ !== null);
}
