"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkCrossProjectResume = checkCrossProjectResume;
const path_1 = require("path");
const state_js_1 = require("../bootstrap/state.js");
const shellQuote_js_1 = require("./bash/shellQuote.js");
const sessionStorage_js_1 = require("./sessionStorage.js");
/**
 * Check if a log is from a different project directory and determine
 * whether it's a related worktree or a completely different project.
 *
 * For same-repo worktrees, we can resume directly without requiring cd.
 * For different projects, we generate the cd command.
 */
function checkCrossProjectResume(log, showAllProjects, worktreePaths) {
    const currentCwd = (0, state_js_1.getOriginalCwd)();
    if (!showAllProjects || !log.projectPath || log.projectPath === currentCwd) {
        return { isCrossProject: false };
    }
    // Gate worktree detection to ants only for staged rollout
    if (process.env.USER_TYPE !== 'ant') {
        const sessionId = (0, sessionStorage_js_1.getSessionIdFromLog)(log);
        const command = `cd ${(0, shellQuote_js_1.quote)([log.projectPath])} && claude --resume ${sessionId}`;
        return {
            isCrossProject: true,
            isSameRepoWorktree: false,
            command,
            projectPath: log.projectPath,
        };
    }
    // Check if log.projectPath is under a worktree of the same repo
    const isSameRepo = worktreePaths.some(wt => log.projectPath === wt || log.projectPath.startsWith(wt + path_1.sep));
    if (isSameRepo) {
        return {
            isCrossProject: true,
            isSameRepoWorktree: true,
            projectPath: log.projectPath,
        };
    }
    // Different repo - generate cd command
    const sessionId = (0, sessionStorage_js_1.getSessionIdFromLog)(log);
    const command = `cd ${(0, shellQuote_js_1.quote)([log.projectPath])} && claude --resume ${sessionId}`;
    return {
        isCrossProject: true,
        isSameRepoWorktree: false,
        command,
        projectPath: log.projectPath,
    };
}
