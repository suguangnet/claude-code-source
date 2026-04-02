"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupShellCompletion = setupShellCompletion;
exports.regenerateCompletionCache = regenerateCompletionCache;
const chalk_1 = __importDefault(require("chalk"));
const promises_1 = require("fs/promises");
const os_1 = require("os");
const path_1 = require("path");
const url_1 = require("url");
const color_js_1 = require("../components/design-system/color.js");
const supports_hyperlinks_js_1 = require("../ink/supports-hyperlinks.js");
const debug_js_1 = require("./debug.js");
const errors_js_1 = require("./errors.js");
const execFileNoThrow_js_1 = require("./execFileNoThrow.js");
const log_js_1 = require("./log.js");
const EOL = '\n';
function detectShell() {
    const shell = process.env.SHELL || '';
    const home = (0, os_1.homedir)();
    const claudeDir = (0, path_1.join)(home, '.claude');
    if (shell.endsWith('/zsh') || shell.endsWith('/zsh.exe')) {
        const cacheFile = (0, path_1.join)(claudeDir, 'completion.zsh');
        return {
            name: 'zsh',
            rcFile: (0, path_1.join)(home, '.zshrc'),
            cacheFile,
            completionLine: `[[ -f "${cacheFile}" ]] && source "${cacheFile}"`,
            shellFlag: 'zsh',
        };
    }
    if (shell.endsWith('/bash') || shell.endsWith('/bash.exe')) {
        const cacheFile = (0, path_1.join)(claudeDir, 'completion.bash');
        return {
            name: 'bash',
            rcFile: (0, path_1.join)(home, '.bashrc'),
            cacheFile,
            completionLine: `[ -f "${cacheFile}" ] && source "${cacheFile}"`,
            shellFlag: 'bash',
        };
    }
    if (shell.endsWith('/fish') || shell.endsWith('/fish.exe')) {
        const xdg = process.env.XDG_CONFIG_HOME || (0, path_1.join)(home, '.config');
        const cacheFile = (0, path_1.join)(claudeDir, 'completion.fish');
        return {
            name: 'fish',
            rcFile: (0, path_1.join)(xdg, 'fish', 'config.fish'),
            cacheFile,
            completionLine: `[ -f "${cacheFile}" ] && source "${cacheFile}"`,
            shellFlag: 'fish',
        };
    }
    return null;
}
function formatPathLink(filePath) {
    if (!(0, supports_hyperlinks_js_1.supportsHyperlinks)()) {
        return filePath;
    }
    const fileUrl = (0, url_1.pathToFileURL)(filePath).href;
    return `\x1b]8;;${fileUrl}\x07${filePath}\x1b]8;;\x07`;
}
/**
 * Generate and cache the completion script, then add a source line to the
 * shell's rc file. Returns a user-facing status message.
 */
async function setupShellCompletion(theme) {
    const shell = detectShell();
    if (!shell) {
        return '';
    }
    // Ensure the cache directory exists
    try {
        await (0, promises_1.mkdir)((0, path_1.dirname)(shell.cacheFile), { recursive: true });
    }
    catch (e) {
        (0, log_js_1.logError)(e);
        return `${EOL}${(0, color_js_1.color)('warning', theme)(`Could not write ${shell.name} completion cache`)}${EOL}${chalk_1.default.dim(`Run manually: claude completion ${shell.shellFlag} > ${shell.cacheFile}`)}${EOL}`;
    }
    // Generate the completion script by writing directly to the cache file.
    // Using --output avoids piping through stdout where process.exit() can
    // truncate output before the pipe buffer drains.
    const claudeBin = process.argv[1] || 'claude';
    const result = await (0, execFileNoThrow_js_1.execFileNoThrow)(claudeBin, [
        'completion',
        shell.shellFlag,
        '--output',
        shell.cacheFile,
    ]);
    if (result.code !== 0) {
        return `${EOL}${(0, color_js_1.color)('warning', theme)(`Could not generate ${shell.name} shell completions`)}${EOL}${chalk_1.default.dim(`Run manually: claude completion ${shell.shellFlag} > ${shell.cacheFile}`)}${EOL}`;
    }
    // Check if rc file already sources completions
    let existing = '';
    try {
        existing = await (0, promises_1.readFile)(shell.rcFile, { encoding: 'utf-8' });
        if (existing.includes('claude completion') ||
            existing.includes(shell.cacheFile)) {
            return `${EOL}${(0, color_js_1.color)('success', theme)(`Shell completions updated for ${shell.name}`)}${EOL}${chalk_1.default.dim(`See ${formatPathLink(shell.rcFile)}`)}${EOL}`;
        }
    }
    catch (e) {
        if (!(0, errors_js_1.isENOENT)(e)) {
            (0, log_js_1.logError)(e);
            return `${EOL}${(0, color_js_1.color)('warning', theme)(`Could not install ${shell.name} shell completions`)}${EOL}${chalk_1.default.dim(`Add this to ${formatPathLink(shell.rcFile)}:`)}${EOL}${chalk_1.default.dim(shell.completionLine)}${EOL}`;
        }
    }
    // Append source line to rc file
    try {
        const configDir = (0, path_1.dirname)(shell.rcFile);
        await (0, promises_1.mkdir)(configDir, { recursive: true });
        const separator = existing && !existing.endsWith('\n') ? '\n' : '';
        const content = `${existing}${separator}\n# Claude Code shell completions\n${shell.completionLine}\n`;
        await (0, promises_1.writeFile)(shell.rcFile, content, { encoding: 'utf-8' });
        return `${EOL}${(0, color_js_1.color)('success', theme)(`Installed ${shell.name} shell completions`)}${EOL}${chalk_1.default.dim(`Added to ${formatPathLink(shell.rcFile)}`)}${EOL}${chalk_1.default.dim(`Run: source ${shell.rcFile}`)}${EOL}`;
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return `${EOL}${(0, color_js_1.color)('warning', theme)(`Could not install ${shell.name} shell completions`)}${EOL}${chalk_1.default.dim(`Add this to ${formatPathLink(shell.rcFile)}:`)}${EOL}${chalk_1.default.dim(shell.completionLine)}${EOL}`;
    }
}
/**
 * Regenerate cached shell completion scripts in ~/.claude/.
 * Called after `claude update` so completions stay in sync with the new binary.
 */
async function regenerateCompletionCache() {
    const shell = detectShell();
    if (!shell) {
        return;
    }
    (0, debug_js_1.logForDebugging)(`update: Regenerating ${shell.name} completion cache`);
    const claudeBin = process.argv[1] || 'claude';
    const result = await (0, execFileNoThrow_js_1.execFileNoThrow)(claudeBin, [
        'completion',
        shell.shellFlag,
        '--output',
        shell.cacheFile,
    ]);
    if (result.code !== 0) {
        (0, debug_js_1.logForDebugging)(`update: Failed to regenerate ${shell.name} completion cache`);
        return;
    }
    (0, debug_js_1.logForDebugging)(`update: Regenerated ${shell.name} completion cache at ${shell.cacheFile}`);
}
