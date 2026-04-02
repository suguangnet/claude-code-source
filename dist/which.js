"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.whichSync = exports.which = void 0;
const execa_1 = require("execa");
const execSyncWrapper_js_1 = require("./execSyncWrapper.js");
async function whichNodeAsync(command) {
    if (process.platform === 'win32') {
        // On Windows, use where.exe and return the first result
        const result = await (0, execa_1.execa)(`where.exe ${command}`, {
            shell: true,
            stderr: 'ignore',
            reject: false,
        });
        if (result.exitCode !== 0 || !result.stdout) {
            return null;
        }
        // where.exe returns multiple paths separated by newlines, return the first
        return result.stdout.trim().split(/\r?\n/)[0] || null;
    }
    // On POSIX systems (macOS, Linux, WSL), use which
    // Cross-platform safe: Windows is handled above
    // eslint-disable-next-line custom-rules/no-cross-platform-process-issues
    const result = await (0, execa_1.execa)(`which ${command}`, {
        shell: true,
        stderr: 'ignore',
        reject: false,
    });
    if (result.exitCode !== 0 || !result.stdout) {
        return null;
    }
    return result.stdout.trim();
}
function whichNodeSync(command) {
    if (process.platform === 'win32') {
        try {
            const result = (0, execSyncWrapper_js_1.execSync_DEPRECATED)(`where.exe ${command}`, {
                encoding: 'utf-8',
                stdio: ['ignore', 'pipe', 'ignore'],
            });
            const output = result.toString().trim();
            return output.split(/\r?\n/)[0] || null;
        }
        catch {
            return null;
        }
    }
    try {
        const result = (0, execSyncWrapper_js_1.execSync_DEPRECATED)(`which ${command}`, {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        return result.toString().trim() || null;
    }
    catch {
        return null;
    }
}
const bunWhich = typeof Bun !== 'undefined' && typeof Bun.which === 'function'
    ? Bun.which
    : null;
/**
 * Finds the full path to a command executable.
 * Uses Bun.which when running in Bun (fast, no process spawn),
 * otherwise spawns the platform-appropriate command.
 *
 * @param command - The command name to look up
 * @returns The full path to the command, or null if not found
 */
exports.which = bunWhich
    ? async (command) => bunWhich(command)
    : whichNodeAsync;
/**
 * Synchronous version of `which`.
 *
 * @param command - The command name to look up
 * @returns The full path to the command, or null if not found
 */
exports.whichSync = bunWhich ?? whichNodeSync;
