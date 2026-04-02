"use strict";
/**
 * Utilities for managing shell configuration files (like .bashrc, .zshrc)
 * Used for managing claude aliases and PATH entries
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLAUDE_ALIAS_REGEX = void 0;
exports.getShellConfigPaths = getShellConfigPaths;
exports.filterClaudeAliases = filterClaudeAliases;
exports.readFileLines = readFileLines;
exports.writeFileLines = writeFileLines;
exports.findClaudeAlias = findClaudeAlias;
exports.findValidClaudeAlias = findValidClaudeAlias;
const promises_1 = require("fs/promises");
const os_1 = require("os");
const path_1 = require("path");
const errors_js_1 = require("./errors.js");
const localInstaller_js_1 = require("./localInstaller.js");
exports.CLAUDE_ALIAS_REGEX = /^\s*alias\s+claude\s*=/;
/**
 * Get the paths to shell configuration files
 * Respects ZDOTDIR for zsh users
 * @param options Optional overrides for testing (env, homedir)
 */
function getShellConfigPaths(options) {
    const home = options?.homedir ?? (0, os_1.homedir)();
    const env = options?.env ?? process.env;
    const zshConfigDir = env.ZDOTDIR || home;
    return {
        zsh: (0, path_1.join)(zshConfigDir, '.zshrc'),
        bash: (0, path_1.join)(home, '.bashrc'),
        fish: (0, path_1.join)(home, '.config/fish/config.fish'),
    };
}
/**
 * Filter out installer-created claude aliases from an array of lines
 * Only removes aliases pointing to $HOME/.claude/local/claude
 * Preserves custom user aliases that point to other locations
 * Returns the filtered lines and whether our default installer alias was found
 */
function filterClaudeAliases(lines) {
    let hadAlias = false;
    const filtered = lines.filter(line => {
        // Check if this is a claude alias
        if (exports.CLAUDE_ALIAS_REGEX.test(line)) {
            // Extract the alias target - handle spaces, quotes, and various formats
            // First try with quotes
            let match = line.match(/alias\s+claude\s*=\s*["']([^"']+)["']/);
            if (!match) {
                // Try without quotes (capturing until end of line or comment)
                match = line.match(/alias\s+claude\s*=\s*([^#\n]+)/);
            }
            if (match && match[1]) {
                const target = match[1].trim();
                // Only remove if it points to the installer location
                // The installer always creates aliases with the full expanded path
                if (target === (0, localInstaller_js_1.getLocalClaudePath)()) {
                    hadAlias = true;
                    return false; // Remove this line
                }
            }
            // Keep custom aliases that don't point to the installer location
        }
        return true;
    });
    return { filtered, hadAlias };
}
/**
 * Read a file and split it into lines
 * Returns null if file doesn't exist or can't be read
 */
async function readFileLines(filePath) {
    try {
        const content = await (0, promises_1.readFile)(filePath, { encoding: 'utf8' });
        return content.split('\n');
    }
    catch (e) {
        if ((0, errors_js_1.isFsInaccessible)(e))
            return null;
        throw e;
    }
}
/**
 * Write lines back to a file
 */
async function writeFileLines(filePath, lines) {
    const fh = await (0, promises_1.open)(filePath, 'w');
    try {
        await fh.writeFile(lines.join('\n'), { encoding: 'utf8' });
        await fh.datasync();
    }
    finally {
        await fh.close();
    }
}
/**
 * Check if a claude alias exists in any shell config file
 * Returns the alias target if found, null otherwise
 * @param options Optional overrides for testing (env, homedir)
 */
async function findClaudeAlias(options) {
    const configs = getShellConfigPaths(options);
    for (const configPath of Object.values(configs)) {
        const lines = await readFileLines(configPath);
        if (!lines)
            continue;
        for (const line of lines) {
            if (exports.CLAUDE_ALIAS_REGEX.test(line)) {
                // Extract the alias target
                const match = line.match(/alias\s+claude=["']?([^"'\s]+)/);
                if (match && match[1]) {
                    return match[1];
                }
            }
        }
    }
    return null;
}
/**
 * Check if a claude alias exists and points to a valid executable
 * Returns the alias target if valid, null otherwise
 * @param options Optional overrides for testing (env, homedir)
 */
async function findValidClaudeAlias(options) {
    const aliasTarget = await findClaudeAlias(options);
    if (!aliasTarget)
        return null;
    const home = options?.homedir ?? (0, os_1.homedir)();
    // Expand ~ to home directory
    const expandedPath = aliasTarget.startsWith('~')
        ? aliasTarget.replace('~', home)
        : aliasTarget;
    // Check if the target exists and is executable
    try {
        const stats = await (0, promises_1.stat)(expandedPath);
        // Check if it's a file (could be executable or symlink)
        if (stats.isFile() || stats.isSymbolicLink()) {
            return aliasTarget;
        }
    }
    catch {
        // Target doesn't exist or can't be accessed
    }
    return null;
}
