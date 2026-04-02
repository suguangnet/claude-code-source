"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.copyAnsiToClipboard = copyAnsiToClipboard;
const promises_1 = require("fs/promises");
const os_1 = require("os");
const path_1 = require("path");
const ansiToPng_js_1 = require("./ansiToPng.js");
const execFileNoThrow_js_1 = require("./execFileNoThrow.js");
const log_js_1 = require("./log.js");
const platform_js_1 = require("./platform.js");
/**
 * Copies an image (from ANSI text) to the system clipboard.
 * Supports macOS, Linux (with xclip/xsel), and Windows.
 *
 * Pure-TS pipeline: ANSI text → bitmap-font render → PNG encode. No WASM,
 * no system fonts, so this works in every build (native and JS).
 */
async function copyAnsiToClipboard(ansiText, options) {
    try {
        const tempDir = (0, path_1.join)((0, os_1.tmpdir)(), 'claude-code-screenshots');
        await (0, promises_1.mkdir)(tempDir, { recursive: true });
        const pngPath = (0, path_1.join)(tempDir, `screenshot-${Date.now()}.png`);
        const pngBuffer = (0, ansiToPng_js_1.ansiToPng)(ansiText, options);
        await (0, promises_1.writeFile)(pngPath, pngBuffer);
        const result = await copyPngToClipboard(pngPath);
        try {
            await (0, promises_1.unlink)(pngPath);
        }
        catch {
            // Ignore cleanup errors
        }
        return result;
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return {
            success: false,
            message: `Failed to copy screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
    }
}
async function copyPngToClipboard(pngPath) {
    const platform = (0, platform_js_1.getPlatform)();
    if (platform === 'macos') {
        // macOS: Use osascript to copy PNG to clipboard
        // Escape backslashes and double quotes for AppleScript string
        const escapedPath = pngPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const script = `set the clipboard to (read (POSIX file "${escapedPath}") as «class PNGf»)`;
        const result = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)('osascript', ['-e', script], {
            timeout: 5000,
        });
        if (result.code === 0) {
            return { success: true, message: 'Screenshot copied to clipboard' };
        }
        return {
            success: false,
            message: `Failed to copy to clipboard: ${result.stderr}`,
        };
    }
    if (platform === 'linux') {
        // Linux: Try xclip first, then xsel
        const xclipResult = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)('xclip', ['-selection', 'clipboard', '-t', 'image/png', '-i', pngPath], { timeout: 5000 });
        if (xclipResult.code === 0) {
            return { success: true, message: 'Screenshot copied to clipboard' };
        }
        // Try xsel as fallback
        const xselResult = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)('xsel', ['--clipboard', '--input', '--type', 'image/png'], { timeout: 5000 });
        if (xselResult.code === 0) {
            return { success: true, message: 'Screenshot copied to clipboard' };
        }
        return {
            success: false,
            message: 'Failed to copy to clipboard. Please install xclip or xsel: sudo apt install xclip',
        };
    }
    if (platform === 'windows') {
        // Windows: Use PowerShell to copy image to clipboard
        const psScript = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetImage([System.Drawing.Image]::FromFile('${pngPath.replace(/'/g, "''")}'))`;
        const result = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)('powershell', ['-NoProfile', '-Command', psScript], { timeout: 5000 });
        if (result.code === 0) {
            return { success: true, message: 'Screenshot copied to clipboard' };
        }
        return {
            success: false,
            message: `Failed to copy to clipboard: ${result.stderr}`,
        };
    }
    return {
        success: false,
        message: `Screenshot to clipboard is not supported on ${platform}`,
    };
}
