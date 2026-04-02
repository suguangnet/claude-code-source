"use strict";
/**
 * Path conversion utilities for IDE communication
 * Handles conversions between Claude's environment and the IDE's environment
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WindowsToWSLConverter = void 0;
exports.checkWSLDistroMatch = checkWSLDistroMatch;
const child_process_1 = require("child_process");
/**
 * Converter for Windows IDE + WSL Claude scenario
 */
class WindowsToWSLConverter {
    constructor(wslDistroName) {
        this.wslDistroName = wslDistroName;
    }
    toLocalPath(windowsPath) {
        if (!windowsPath)
            return windowsPath;
        // Check if this is a path from a different WSL distro
        if (this.wslDistroName) {
            const wslUncMatch = windowsPath.match(/^\\\\wsl(?:\.localhost|\$)\\([^\\]+)(.*)$/);
            if (wslUncMatch && wslUncMatch[1] !== this.wslDistroName) {
                // Different distro - wslpath will fail, so return original path
                return windowsPath;
            }
        }
        try {
            // Use wslpath to convert Windows paths to WSL paths
            const result = (0, child_process_1.execFileSync)('wslpath', ['-u', windowsPath], {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'], // wslpath writes "wslpath: <errortext>" to stderr
            }).trim();
            return result;
        }
        catch {
            // If wslpath fails, fall back to manual conversion
            return windowsPath
                .replace(/\\/g, '/') // Convert backslashes to forward slashes
                .replace(/^([A-Z]):/i, (_, letter) => `/mnt/${letter.toLowerCase()}`);
        }
    }
    toIDEPath(wslPath) {
        if (!wslPath)
            return wslPath;
        try {
            // Use wslpath to convert WSL paths to Windows paths
            const result = (0, child_process_1.execFileSync)('wslpath', ['-w', wslPath], {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'], // wslpath writes "wslpath: <errortext>" to stderr
            }).trim();
            return result;
        }
        catch {
            // If wslpath fails, return the original path
            return wslPath;
        }
    }
}
exports.WindowsToWSLConverter = WindowsToWSLConverter;
/**
 * Check if distro names match for WSL UNC paths
 */
function checkWSLDistroMatch(windowsPath, wslDistroName) {
    const wslUncMatch = windowsPath.match(/^\\\\wsl(?:\.localhost|\$)\\([^\\]+)(.*)$/);
    if (wslUncMatch) {
        return wslUncMatch[1] === wslDistroName;
    }
    return true; // Not a WSL UNC path, so no distro mismatch
}
