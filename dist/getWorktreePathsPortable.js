"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWorktreePathsPortable = getWorktreePathsPortable;
const child_process_1 = require("child_process");
const util_1 = require("util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
/**
 * Portable worktree detection using only child_process — no analytics,
 * no bootstrap deps, no execa. Used by listSessionsImpl.ts (SDK) and
 * anywhere that needs worktree paths without pulling in the CLI
 * dependency chain (execa → cross-spawn → which).
 */
async function getWorktreePathsPortable(cwd) {
    try {
        const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], { cwd, timeout: 5000 });
        if (!stdout)
            return [];
        return stdout
            .split('\n')
            .filter(line => line.startsWith('worktree '))
            .map(line => line.slice('worktree '.length).normalize('NFC'));
    }
    catch {
        return [];
    }
}
