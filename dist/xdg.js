"use strict";
/**
 * XDG Base Directory utilities for Claude CLI Native Installer
 *
 * Implements the XDG Base Directory specification for organizing
 * native installer components across appropriate system directories.
 *
 * @see https://specifications.freedesktop.org/basedir-spec/latest/
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getXDGStateHome = getXDGStateHome;
exports.getXDGCacheHome = getXDGCacheHome;
exports.getXDGDataHome = getXDGDataHome;
exports.getUserBinDir = getUserBinDir;
const os_1 = require("os");
const path_1 = require("path");
function resolveOptions(options) {
    return {
        env: options?.env ?? process.env,
        home: options?.homedir ?? process.env.HOME ?? (0, os_1.homedir)(),
    };
}
/**
 * Get XDG state home directory
 * Default: ~/.local/state
 * @param options Optional env and homedir overrides for testing
 */
function getXDGStateHome(options) {
    const { env, home } = resolveOptions(options);
    return env.XDG_STATE_HOME ?? (0, path_1.join)(home, '.local', 'state');
}
/**
 * Get XDG cache home directory
 * Default: ~/.cache
 * @param options Optional env and homedir overrides for testing
 */
function getXDGCacheHome(options) {
    const { env, home } = resolveOptions(options);
    return env.XDG_CACHE_HOME ?? (0, path_1.join)(home, '.cache');
}
/**
 * Get XDG data home directory
 * Default: ~/.local/share
 * @param options Optional env and homedir overrides for testing
 */
function getXDGDataHome(options) {
    const { env, home } = resolveOptions(options);
    return env.XDG_DATA_HOME ?? (0, path_1.join)(home, '.local', 'share');
}
/**
 * Get user bin directory (not technically XDG but follows the convention)
 * Default: ~/.local/bin
 * @param options Optional homedir override for testing
 */
function getUserBinDir(options) {
    const { home } = resolveOptions(options);
    return (0, path_1.join)(home, '.local', 'bin');
}
