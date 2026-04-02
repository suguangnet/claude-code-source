"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBinaryInstalled = isBinaryInstalled;
exports.clearBinaryCache = clearBinaryCache;
const debug_js_1 = require("./debug.js");
const which_js_1 = require("./which.js");
// Session cache to avoid repeated checks
const binaryCache = new Map();
/**
 * Check if a binary/command is installed and available on the system.
 * Uses 'which' on Unix systems (macOS, Linux, WSL) and 'where' on Windows.
 *
 * @param command - The command name to check (e.g., 'gopls', 'rust-analyzer')
 * @returns Promise<boolean> - true if the command exists, false otherwise
 */
async function isBinaryInstalled(command) {
    // Edge case: empty or whitespace-only command
    if (!command || !command.trim()) {
        (0, debug_js_1.logForDebugging)('[binaryCheck] Empty command provided, returning false');
        return false;
    }
    // Trim the command to handle whitespace
    const trimmedCommand = command.trim();
    // Check cache first
    const cached = binaryCache.get(trimmedCommand);
    if (cached !== undefined) {
        (0, debug_js_1.logForDebugging)(`[binaryCheck] Cache hit for '${trimmedCommand}': ${cached}`);
        return cached;
    }
    let exists = false;
    if (await (0, which_js_1.which)(trimmedCommand).catch(() => null)) {
        exists = true;
    }
    // Cache the result
    binaryCache.set(trimmedCommand, exists);
    (0, debug_js_1.logForDebugging)(`[binaryCheck] Binary '${trimmedCommand}' ${exists ? 'found' : 'not found'}`);
    return exists;
}
/**
 * Clear the binary check cache (useful for testing)
 */
function clearBinaryCache() {
    binaryCache.clear();
}
