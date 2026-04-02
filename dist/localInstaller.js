"use strict";
/**
 * Utilities for handling local installation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLocalClaudePath = getLocalClaudePath;
exports.isRunningFromLocalInstallation = isRunningFromLocalInstallation;
exports.ensureLocalPackageEnvironment = ensureLocalPackageEnvironment;
exports.installOrUpdateClaudePackage = installOrUpdateClaudePackage;
exports.localInstallationExists = localInstallationExists;
exports.getShellType = getShellType;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const config_js_1 = require("./config.js");
const envUtils_js_1 = require("./envUtils.js");
const errors_js_1 = require("./errors.js");
const execFileNoThrow_js_1 = require("./execFileNoThrow.js");
const fsOperations_js_1 = require("./fsOperations.js");
const log_js_1 = require("./log.js");
const slowOperations_js_1 = require("./slowOperations.js");
// Lazy getters: getClaudeConfigHomeDir() is memoized and reads process.env.
// Evaluating at module scope would capture the value before entrypoints like
// hfi.tsx get a chance to set CLAUDE_CONFIG_DIR in main(), and would also
// populate the memoize cache with that stale value for all 150+ other callers.
function getLocalInstallDir() {
    return (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), 'local');
}
function getLocalClaudePath() {
    return (0, path_1.join)(getLocalInstallDir(), 'claude');
}
/**
 * Check if we're running from our managed local installation
 */
function isRunningFromLocalInstallation() {
    const execPath = process.argv[1] || '';
    return execPath.includes('/.claude/local/node_modules/');
}
/**
 * Write `content` to `path` only if the file does not already exist.
 * Uses O_EXCL ('wx') for atomic create-if-missing.
 */
async function writeIfMissing(path, content, mode) {
    try {
        await (0, promises_1.writeFile)(path, content, { encoding: 'utf8', flag: 'wx', mode });
        return true;
    }
    catch (e) {
        if ((0, errors_js_1.getErrnoCode)(e) === 'EEXIST')
            return false;
        throw e;
    }
}
/**
 * Ensure the local package environment is set up
 * Creates the directory, package.json, and wrapper script
 */
async function ensureLocalPackageEnvironment() {
    try {
        const localInstallDir = getLocalInstallDir();
        // Create installation directory (recursive, idempotent)
        await (0, fsOperations_js_1.getFsImplementation)().mkdir(localInstallDir);
        // Create package.json if it doesn't exist
        await writeIfMissing((0, path_1.join)(localInstallDir, 'package.json'), (0, slowOperations_js_1.jsonStringify)({ name: 'claude-local', version: '0.0.1', private: true }, null, 2));
        // Create the wrapper script if it doesn't exist
        const wrapperPath = (0, path_1.join)(localInstallDir, 'claude');
        const created = await writeIfMissing(wrapperPath, `#!/bin/sh\nexec "${localInstallDir}/node_modules/.bin/claude" "$@"`, 0o755);
        if (created) {
            // Mode in writeFile is masked by umask; chmod to ensure executable bit.
            await (0, promises_1.chmod)(wrapperPath, 0o755);
        }
        return true;
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return false;
    }
}
/**
 * Install or update Claude CLI package in the local directory
 * @param channel - Release channel to use (latest or stable)
 * @param specificVersion - Optional specific version to install (overrides channel)
 */
async function installOrUpdateClaudePackage(channel, specificVersion) {
    try {
        // First ensure the environment is set up
        if (!(await ensureLocalPackageEnvironment())) {
            return 'install_failed';
        }
        // Use specific version if provided, otherwise use channel tag
        const versionSpec = specificVersion
            ? specificVersion
            : channel === 'stable'
                ? 'stable'
                : 'latest';
        const result = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)('npm', ['install', `${MACRO.PACKAGE_URL}@${versionSpec}`], { cwd: getLocalInstallDir(), maxBuffer: 1000000 });
        if (result.code !== 0) {
            const error = new Error(`Failed to install Claude CLI package: ${result.stderr}`);
            (0, log_js_1.logError)(error);
            return result.code === 190 ? 'in_progress' : 'install_failed';
        }
        // Set installMethod to 'local' to prevent npm permission warnings
        (0, config_js_1.saveGlobalConfig)(current => ({
            ...current,
            installMethod: 'local',
        }));
        return 'success';
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return 'install_failed';
    }
}
/**
 * Check if local installation exists.
 * Pure existence probe — callers use this to choose update path / UI hints.
 */
async function localInstallationExists() {
    try {
        await (0, promises_1.access)((0, path_1.join)(getLocalInstallDir(), 'node_modules', '.bin', 'claude'));
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Get shell type to determine appropriate path setup
 */
function getShellType() {
    const shellPath = process.env.SHELL || '';
    if (shellPath.includes('zsh'))
        return 'zsh';
    if (shellPath.includes('bash'))
        return 'bash';
    if (shellPath.includes('fish'))
        return 'fish';
    return 'unknown';
}
