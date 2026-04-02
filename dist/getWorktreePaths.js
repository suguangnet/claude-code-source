"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWorktreePaths = getWorktreePaths;
const path_1 = require("path");
const index_js_1 = require("../services/analytics/index.js");
const execFileNoThrow_js_1 = require("./execFileNoThrow.js");
const git_js_1 = require("./git.js");
/**
 * Returns the paths of all worktrees for the current git repository.
 * If git is not available, not in a git repo, or only has one worktree,
 * returns an empty array.
 *
 * This version includes analytics tracking and uses the CLI's gitExe()
 * resolver. For a portable version without CLI deps, use
 * getWorktreePathsPortable().
 *
 * @param cwd Directory to run the command from
 * @returns Array of absolute worktree paths
 */
async function getWorktreePaths(cwd) {
    const startTime = Date.now();
    const { stdout, code } = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['worktree', 'list', '--porcelain'], {
        cwd,
        preserveOutputOnError: false,
    });
    const durationMs = Date.now() - startTime;
    if (code !== 0) {
        (0, index_js_1.logEvent)('tengu_worktree_detection', {
            duration_ms: durationMs,
            worktree_count: 0,
            success: false,
        });
        return [];
    }
    // Parse porcelain output - lines starting with "worktree " contain paths
    // Example:
    // worktree /Users/foo/repo
    // HEAD abc123
    // branch refs/heads/main
    //
    // worktree /Users/foo/repo-wt1
    // HEAD def456
    // branch refs/heads/feature
    const worktreePaths = stdout
        .split('\n')
        .filter(line => line.startsWith('worktree '))
        .map(line => line.slice('worktree '.length).normalize('NFC'));
    (0, index_js_1.logEvent)('tengu_worktree_detection', {
        duration_ms: durationMs,
        worktree_count: worktreePaths.length,
        success: true,
    });
    // Sort worktrees: current worktree first, then alphabetically
    const currentWorktree = worktreePaths.find(path => cwd === path || cwd.startsWith(path + path_1.sep));
    const otherWorktrees = worktreePaths
        .filter(path => path !== currentWorktree)
        .sort((a, b) => a.localeCompare(b));
    return currentWorktree ? [currentWorktree, ...otherWorktrees] : otherWorktrees;
}
