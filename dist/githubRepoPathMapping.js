"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateGithubRepoPathMapping = updateGithubRepoPathMapping;
exports.getKnownPathsForRepo = getKnownPathsForRepo;
exports.filterExistingPaths = filterExistingPaths;
exports.validateRepoAtPath = validateRepoAtPath;
exports.removePathFromRepo = removePathFromRepo;
const promises_1 = require("fs/promises");
const state_js_1 = require("../bootstrap/state.js");
const config_js_1 = require("./config.js");
const debug_js_1 = require("./debug.js");
const detectRepository_js_1 = require("./detectRepository.js");
const file_js_1 = require("./file.js");
const gitFilesystem_js_1 = require("./git/gitFilesystem.js");
const git_js_1 = require("./git.js");
/**
 * Updates the GitHub repository path mapping in global config.
 * Called at startup (fire-and-forget) to track known local paths for repos.
 * This is non-blocking and errors are logged silently.
 *
 * Stores the git root (not cwd) so the mapping always points to the
 * repository root regardless of which subdirectory the user launched from.
 * If the path is already tracked, it is promoted to the front of the list
 * so the most recently used clone appears first.
 */
async function updateGithubRepoPathMapping() {
    try {
        const repo = await (0, detectRepository_js_1.detectCurrentRepository)();
        if (!repo) {
            (0, debug_js_1.logForDebugging)('Not in a GitHub repository, skipping path mapping update');
            return;
        }
        // Use the git root as the canonical path for this repo clone.
        // This ensures we always store the repo root, not an arbitrary subdirectory.
        const cwd = (0, state_js_1.getOriginalCwd)();
        const gitRoot = (0, git_js_1.findGitRoot)(cwd);
        const basePath = gitRoot ?? cwd;
        // Resolve symlinks for canonical storage
        let currentPath;
        try {
            currentPath = (await (0, promises_1.realpath)(basePath)).normalize('NFC');
        }
        catch {
            currentPath = basePath;
        }
        // Normalize repo key to lowercase for case-insensitive matching
        const repoKey = repo.toLowerCase();
        const config = (0, config_js_1.getGlobalConfig)();
        const existingPaths = config.githubRepoPaths?.[repoKey] ?? [];
        if (existingPaths[0] === currentPath) {
            // Already at the front — nothing to do
            (0, debug_js_1.logForDebugging)(`Path ${currentPath} already tracked for repo ${repoKey}`);
            return;
        }
        // Remove if present elsewhere (to promote to front), then prepend
        const withoutCurrent = existingPaths.filter(p => p !== currentPath);
        const updatedPaths = [currentPath, ...withoutCurrent];
        (0, config_js_1.saveGlobalConfig)(current => ({
            ...current,
            githubRepoPaths: {
                ...current.githubRepoPaths,
                [repoKey]: updatedPaths,
            },
        }));
        (0, debug_js_1.logForDebugging)(`Added ${currentPath} to tracked paths for repo ${repoKey}`);
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`Error updating repo path mapping: ${error}`);
        // Silently fail - this is non-blocking startup work
    }
}
/**
 * Gets known local paths for a given GitHub repository.
 * @param repo The repository in "owner/repo" format
 * @returns Array of known absolute paths, or empty array if none
 */
function getKnownPathsForRepo(repo) {
    const config = (0, config_js_1.getGlobalConfig)();
    const repoKey = repo.toLowerCase();
    return config.githubRepoPaths?.[repoKey] ?? [];
}
/**
 * Filters paths to only those that exist on the filesystem.
 * @param paths Array of absolute paths to check
 * @returns Array of paths that exist
 */
async function filterExistingPaths(paths) {
    const results = await Promise.all(paths.map(file_js_1.pathExists));
    return paths.filter((_, i) => results[i]);
}
/**
 * Validates that a path contains the expected GitHub repository.
 * @param path Absolute path to check
 * @param expectedRepo Expected repository in "owner/repo" format
 * @returns true if the path contains the expected repo, false otherwise
 */
async function validateRepoAtPath(path, expectedRepo) {
    try {
        const remoteUrl = await (0, gitFilesystem_js_1.getRemoteUrlForDir)(path);
        if (!remoteUrl) {
            return false;
        }
        const actualRepo = (0, detectRepository_js_1.parseGitHubRepository)(remoteUrl);
        if (!actualRepo) {
            return false;
        }
        // Case-insensitive comparison
        return actualRepo.toLowerCase() === expectedRepo.toLowerCase();
    }
    catch {
        return false;
    }
}
/**
 * Removes a path from the tracked paths for a given repository.
 * Used when a path is found to be invalid during selection.
 * @param repo The repository in "owner/repo" format
 * @param pathToRemove The path to remove from tracking
 */
function removePathFromRepo(repo, pathToRemove) {
    const config = (0, config_js_1.getGlobalConfig)();
    const repoKey = repo.toLowerCase();
    const existingPaths = config.githubRepoPaths?.[repoKey] ?? [];
    const updatedPaths = existingPaths.filter(path => path !== pathToRemove);
    if (updatedPaths.length === existingPaths.length) {
        // Path wasn't in the list, nothing to do
        return;
    }
    const updatedMapping = { ...config.githubRepoPaths };
    if (updatedPaths.length === 0) {
        // Remove the repo key entirely if no paths remain
        delete updatedMapping[repoKey];
    }
    else {
        updatedMapping[repoKey] = updatedPaths;
    }
    (0, config_js_1.saveGlobalConfig)(current => ({
        ...current,
        githubRepoPaths: updatedMapping,
    }));
    (0, debug_js_1.logForDebugging)(`Removed ${pathToRemove} from tracked paths for repo ${repoKey}`);
}
