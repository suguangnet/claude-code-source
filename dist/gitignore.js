"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPathGitignored = isPathGitignored;
exports.getGlobalGitignorePath = getGlobalGitignorePath;
exports.addFileGlobRuleToGitignore = addFileGlobRuleToGitignore;
const promises_1 = require("fs/promises");
const os_1 = require("os");
const path_1 = require("path");
const cwd_js_1 = require("../cwd.js");
const errors_js_1 = require("../errors.js");
const execFileNoThrow_js_1 = require("../execFileNoThrow.js");
const git_js_1 = require("../git.js");
const log_js_1 = require("../log.js");
/**
 * Checks if a path is ignored by git (via `git check-ignore`).
 *
 * This consults all applicable gitignore sources: repo `.gitignore` files
 * (nested), `.git/info/exclude`, and the global gitignore — with correct
 * precedence, because git itself resolves it.
 *
 * Exit codes: 0 = ignored, 1 = not ignored, 128 = not in a git repo.
 * Returns `false` for 128, so callers outside a git repo fail open.
 *
 * @param filePath The path to check (absolute or relative to cwd)
 * @param cwd The working directory to run git from
 */
async function isPathGitignored(filePath, cwd) {
    const { code } = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)('git', ['check-ignore', filePath], {
        preserveOutputOnError: false,
        cwd,
    });
    return code === 0;
}
/**
 * Gets the path to the global gitignore file (.config/git/ignore)
 * @returns The path to the global gitignore file
 */
function getGlobalGitignorePath() {
    return (0, path_1.join)((0, os_1.homedir)(), '.config', 'git', 'ignore');
}
/**
 * Adds a file pattern to the global gitignore file (.config/git/ignore)
 * if it's not already ignored by existing patterns in any gitignore file
 * @param filename The filename to add to gitignore
 * @param cwd The current working directory (optional)
 */
async function addFileGlobRuleToGitignore(filename, cwd = (0, cwd_js_1.getCwd)()) {
    try {
        if (!(await (0, git_js_1.dirIsInGitRepo)(cwd))) {
            return;
        }
        // First check if the pattern is already ignored by any gitignore file (including global)
        const gitignoreEntry = `**/${filename}`;
        // For directory patterns (ending with /), check with a sample file inside
        const testPath = filename.endsWith('/')
            ? `${filename}sample-file.txt`
            : filename;
        if (await isPathGitignored(testPath, cwd)) {
            // File is already ignored by existing patterns (local or global)
            return;
        }
        // Use the global gitignore file in .config/git/ignore
        const globalGitignorePath = getGlobalGitignorePath();
        // Create the directory if it doesn't exist
        const configGitDir = (0, path_1.dirname)(globalGitignorePath);
        await (0, promises_1.mkdir)(configGitDir, { recursive: true });
        // Add the entry to the global gitignore
        try {
            const content = await (0, promises_1.readFile)(globalGitignorePath, { encoding: 'utf-8' });
            if (content.includes(gitignoreEntry)) {
                return; // Pattern already exists, don't add again
            }
            await (0, promises_1.appendFile)(globalGitignorePath, `\n${gitignoreEntry}\n`);
        }
        catch (e) {
            const code = (0, errors_js_1.getErrnoCode)(e);
            if (code === 'ENOENT') {
                // Create global gitignore with entry
                await (0, promises_1.writeFile)(globalGitignorePath, `${gitignoreEntry}\n`, 'utf-8');
            }
            else {
                throw e;
            }
        }
    }
    catch (error) {
        (0, log_js_1.logError)(error);
    }
}
