"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectPythonPackageManager = detectPythonPackageManager;
exports.isIt2CliAvailable = isIt2CliAvailable;
exports.installIt2 = installIt2;
exports.verifyIt2Setup = verifyIt2Setup;
exports.getPythonApiInstructions = getPythonApiInstructions;
exports.markIt2SetupComplete = markIt2SetupComplete;
exports.setPreferTmuxOverIterm2 = setPreferTmuxOverIterm2;
exports.getPreferTmuxOverIterm2 = getPreferTmuxOverIterm2;
const os_1 = require("os");
const config_js_1 = require("../../../utils/config.js");
const debug_js_1 = require("../../../utils/debug.js");
const execFileNoThrow_js_1 = require("../../../utils/execFileNoThrow.js");
const log_js_1 = require("../../../utils/log.js");
/**
 * Detects which Python package manager is available on the system.
 * Checks in order of preference: uvx, pipx, pip.
 *
 * @returns The detected package manager, or null if none found
 */
async function detectPythonPackageManager() {
    // Check uv first (preferred for isolated environments)
    // We check for 'uv' since 'uv tool install' is the install command
    const uvResult = await (0, execFileNoThrow_js_1.execFileNoThrow)('which', ['uv']);
    if (uvResult.code === 0) {
        (0, debug_js_1.logForDebugging)('[it2Setup] Found uv (will use uv tool install)');
        return 'uvx'; // Keep the type name for compatibility
    }
    // Check pipx (good for isolated environments)
    const pipxResult = await (0, execFileNoThrow_js_1.execFileNoThrow)('which', ['pipx']);
    if (pipxResult.code === 0) {
        (0, debug_js_1.logForDebugging)('[it2Setup] Found pipx package manager');
        return 'pipx';
    }
    // Check pip (fallback)
    const pipResult = await (0, execFileNoThrow_js_1.execFileNoThrow)('which', ['pip']);
    if (pipResult.code === 0) {
        (0, debug_js_1.logForDebugging)('[it2Setup] Found pip package manager');
        return 'pip';
    }
    // Also check pip3
    const pip3Result = await (0, execFileNoThrow_js_1.execFileNoThrow)('which', ['pip3']);
    if (pip3Result.code === 0) {
        (0, debug_js_1.logForDebugging)('[it2Setup] Found pip3 package manager');
        return 'pip';
    }
    (0, debug_js_1.logForDebugging)('[it2Setup] No Python package manager found');
    return null;
}
/**
 * Checks if the it2 CLI tool is installed and accessible.
 *
 * @returns true if it2 is available
 */
async function isIt2CliAvailable() {
    const result = await (0, execFileNoThrow_js_1.execFileNoThrow)('which', ['it2']);
    return result.code === 0;
}
/**
 * Installs the it2 CLI tool using the detected package manager.
 *
 * @param packageManager - The package manager to use for installation
 * @returns Result indicating success or failure
 */
async function installIt2(packageManager) {
    (0, debug_js_1.logForDebugging)(`[it2Setup] Installing it2 using ${packageManager}`);
    // Run from home directory to avoid reading project-level pip.conf/uv.toml
    // which could be maliciously crafted to redirect to an attacker's PyPI server
    let result;
    switch (packageManager) {
        case 'uvx':
            // uv tool install it2 installs it globally in isolated env
            // (uvx is for running, uv tool install is for installing)
            result = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)('uv', ['tool', 'install', 'it2'], {
                cwd: (0, os_1.homedir)(),
            });
            break;
        case 'pipx':
            result = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)('pipx', ['install', 'it2'], {
                cwd: (0, os_1.homedir)(),
            });
            break;
        case 'pip':
            // Use --user to install without sudo
            result = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)('pip', ['install', '--user', 'it2'], { cwd: (0, os_1.homedir)() });
            if (result.code !== 0) {
                // Try pip3 if pip fails
                result = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)('pip3', ['install', '--user', 'it2'], { cwd: (0, os_1.homedir)() });
            }
            break;
    }
    if (result.code !== 0) {
        const error = result.stderr || 'Unknown installation error';
        (0, log_js_1.logError)(new Error(`[it2Setup] Failed to install it2: ${error}`));
        return {
            success: false,
            error,
            packageManager,
        };
    }
    (0, debug_js_1.logForDebugging)('[it2Setup] it2 installed successfully');
    return {
        success: true,
        packageManager,
    };
}
/**
 * Verifies that it2 is properly configured and can communicate with iTerm2.
 * This tests the Python API connection by running a simple it2 command.
 *
 * @returns Result indicating success or the specific failure reason
 */
async function verifyIt2Setup() {
    (0, debug_js_1.logForDebugging)('[it2Setup] Verifying it2 setup...');
    // First check if it2 is installed
    const installed = await isIt2CliAvailable();
    if (!installed) {
        return {
            success: false,
            error: 'it2 CLI is not installed or not in PATH',
        };
    }
    // Try to list sessions - this tests the Python API connection
    const result = await (0, execFileNoThrow_js_1.execFileNoThrow)('it2', ['session', 'list']);
    if (result.code !== 0) {
        const stderr = result.stderr.toLowerCase();
        // Check for common Python API errors
        if (stderr.includes('api') ||
            stderr.includes('python') ||
            stderr.includes('connection refused') ||
            stderr.includes('not enabled')) {
            (0, debug_js_1.logForDebugging)('[it2Setup] Python API not enabled in iTerm2');
            return {
                success: false,
                error: 'Python API not enabled in iTerm2 preferences',
                needsPythonApiEnabled: true,
            };
        }
        return {
            success: false,
            error: result.stderr || 'Failed to communicate with iTerm2',
        };
    }
    (0, debug_js_1.logForDebugging)('[it2Setup] it2 setup verified successfully');
    return {
        success: true,
    };
}
/**
 * Returns instructions for enabling the Python API in iTerm2.
 */
function getPythonApiInstructions() {
    return [
        'Almost done! Enable the Python API in iTerm2:',
        '',
        '  iTerm2 → Settings → General → Magic → Enable Python API',
        '',
        'After enabling, you may need to restart iTerm2.',
    ];
}
/**
 * Marks that it2 setup has been completed successfully.
 * This prevents showing the setup prompt again.
 */
function markIt2SetupComplete() {
    const config = (0, config_js_1.getGlobalConfig)();
    if (config.iterm2It2SetupComplete !== true) {
        (0, config_js_1.saveGlobalConfig)(current => ({
            ...current,
            iterm2It2SetupComplete: true,
        }));
        (0, debug_js_1.logForDebugging)('[it2Setup] Marked it2 setup as complete');
    }
}
/**
 * Marks that the user prefers to use tmux over iTerm2 split panes.
 * This prevents showing the setup prompt when in iTerm2.
 */
function setPreferTmuxOverIterm2(prefer) {
    const config = (0, config_js_1.getGlobalConfig)();
    if (config.preferTmuxOverIterm2 !== prefer) {
        (0, config_js_1.saveGlobalConfig)(current => ({
            ...current,
            preferTmuxOverIterm2: prefer,
        }));
        (0, debug_js_1.logForDebugging)(`[it2Setup] Set preferTmuxOverIterm2 = ${prefer}`);
    }
}
/**
 * Checks if the user prefers tmux over iTerm2 split panes.
 */
function getPreferTmuxOverIterm2() {
    return (0, config_js_1.getGlobalConfig)().preferTmuxOverIterm2 === true;
}
