"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDesktopInstallStatus = getDesktopInstallStatus;
exports.openCurrentSessionInDesktop = openCurrentSessionInDesktop;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const semver_1 = require("semver");
const state_js_1 = require("../bootstrap/state.js");
const cwd_js_1 = require("./cwd.js");
const debug_js_1 = require("./debug.js");
const execFileNoThrow_js_1 = require("./execFileNoThrow.js");
const file_js_1 = require("./file.js");
const semver_js_1 = require("./semver.js");
const MIN_DESKTOP_VERSION = '1.1.2396';
function isDevMode() {
    if (process.env.NODE_ENV === 'development') {
        return true;
    }
    // Local builds from build directories are dev mode even with NODE_ENV=production
    const pathsToCheck = [process.argv[1] || '', process.execPath || ''];
    const buildDirs = [
        '/build-ant/',
        '/build-ant-native/',
        '/build-external/',
        '/build-external-native/',
    ];
    return pathsToCheck.some(p => buildDirs.some(dir => p.includes(dir)));
}
/**
 * Builds a deep link URL for Claude Desktop to resume a CLI session.
 * Format: claude://resume?session={sessionId}&cwd={cwd}
 * In dev mode: claude-dev://resume?session={sessionId}&cwd={cwd}
 */
function buildDesktopDeepLink(sessionId) {
    const protocol = isDevMode() ? 'claude-dev' : 'claude';
    const url = new URL(`${protocol}://resume`);
    url.searchParams.set('session', sessionId);
    url.searchParams.set('cwd', (0, cwd_js_1.getCwd)());
    return url.toString();
}
/**
 * Check if Claude Desktop app is installed.
 * On macOS, checks for /Applications/Claude.app.
 * On Linux, checks if xdg-open can handle claude:// protocol.
 * On Windows, checks if the protocol handler exists.
 * In dev mode, always returns true (assumes dev Desktop is running).
 */
async function isDesktopInstalled() {
    // In dev mode, assume the dev Desktop app is running
    if (isDevMode()) {
        return true;
    }
    const platform = process.platform;
    if (platform === 'darwin') {
        // Check for Claude.app in /Applications
        return (0, file_js_1.pathExists)('/Applications/Claude.app');
    }
    else if (platform === 'linux') {
        // Check if xdg-mime can find a handler for claude://
        // Note: xdg-mime returns exit code 0 even with no handler, so check stdout too
        const { code, stdout } = await (0, execFileNoThrow_js_1.execFileNoThrow)('xdg-mime', [
            'query',
            'default',
            'x-scheme-handler/claude',
        ]);
        return code === 0 && stdout.trim().length > 0;
    }
    else if (platform === 'win32') {
        // On Windows, try to query the registry for the protocol handler
        const { code } = await (0, execFileNoThrow_js_1.execFileNoThrow)('reg', [
            'query',
            'HKEY_CLASSES_ROOT\\claude',
            '/ve',
        ]);
        return code === 0;
    }
    return false;
}
/**
 * Detect the installed Claude Desktop version.
 * On macOS, reads CFBundleShortVersionString from the app plist.
 * On Windows, finds the highest app-X.Y.Z directory in the Squirrel install.
 * Returns null if version cannot be determined.
 */
async function getDesktopVersion() {
    const platform = process.platform;
    if (platform === 'darwin') {
        const { code, stdout } = await (0, execFileNoThrow_js_1.execFileNoThrow)('defaults', [
            'read',
            '/Applications/Claude.app/Contents/Info.plist',
            'CFBundleShortVersionString',
        ]);
        if (code !== 0) {
            return null;
        }
        const version = stdout.trim();
        return version.length > 0 ? version : null;
    }
    else if (platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA;
        if (!localAppData) {
            return null;
        }
        const installDir = (0, path_1.join)(localAppData, 'AnthropicClaude');
        try {
            const entries = await (0, promises_1.readdir)(installDir);
            const versions = entries
                .filter(e => e.startsWith('app-'))
                .map(e => e.slice(4))
                .filter(v => (0, semver_1.coerce)(v) !== null)
                .sort((a, b) => {
                const ca = (0, semver_1.coerce)(a);
                const cb = (0, semver_1.coerce)(b);
                return ca.compare(cb);
            });
            return versions.length > 0 ? versions[versions.length - 1] : null;
        }
        catch {
            return null;
        }
    }
    return null;
}
/**
 * Check Desktop install status including version compatibility.
 */
async function getDesktopInstallStatus() {
    const installed = await isDesktopInstalled();
    if (!installed) {
        return { status: 'not-installed' };
    }
    let version;
    try {
        version = await getDesktopVersion();
    }
    catch {
        // Best effort — proceed with handoff if version detection fails
        return { status: 'ready', version: 'unknown' };
    }
    if (!version) {
        // Can't determine version — assume it's ready (dev mode or unknown install)
        return { status: 'ready', version: 'unknown' };
    }
    const coerced = (0, semver_1.coerce)(version);
    if (!coerced || !(0, semver_js_1.gte)(coerced.version, MIN_DESKTOP_VERSION)) {
        return { status: 'version-too-old', version };
    }
    return { status: 'ready', version };
}
/**
 * Opens a deep link URL using the platform-specific mechanism.
 * Returns true if the command succeeded, false otherwise.
 */
async function openDeepLink(deepLinkUrl) {
    const platform = process.platform;
    (0, debug_js_1.logForDebugging)(`Opening deep link: ${deepLinkUrl}`);
    if (platform === 'darwin') {
        if (isDevMode()) {
            // In dev mode, `open` launches a bare Electron binary (without app code)
            // because setAsDefaultProtocolClient registers just the Electron executable.
            // Use AppleScript to route the URL to the already-running Electron app.
            const { code } = await (0, execFileNoThrow_js_1.execFileNoThrow)('osascript', [
                '-e',
                `tell application "Electron" to open location "${deepLinkUrl}"`,
            ]);
            return code === 0;
        }
        const { code } = await (0, execFileNoThrow_js_1.execFileNoThrow)('open', [deepLinkUrl]);
        return code === 0;
    }
    else if (platform === 'linux') {
        const { code } = await (0, execFileNoThrow_js_1.execFileNoThrow)('xdg-open', [deepLinkUrl]);
        return code === 0;
    }
    else if (platform === 'win32') {
        // On Windows, use cmd /c start to open URLs
        const { code } = await (0, execFileNoThrow_js_1.execFileNoThrow)('cmd', [
            '/c',
            'start',
            '',
            deepLinkUrl,
        ]);
        return code === 0;
    }
    return false;
}
/**
 * Build and open a deep link to resume the current session in Claude Desktop.
 * Returns an object with success status and any error message.
 */
async function openCurrentSessionInDesktop() {
    const sessionId = (0, state_js_1.getSessionId)();
    // Check if Desktop is installed
    const installed = await isDesktopInstalled();
    if (!installed) {
        return {
            success: false,
            error: 'Claude Desktop is not installed. Install it from https://claude.ai/download',
        };
    }
    // Build and open the deep link
    const deepLinkUrl = buildDesktopDeepLink(sessionId);
    const opened = await openDeepLink(deepLinkUrl);
    if (!opened) {
        return {
            success: false,
            error: 'Failed to open Claude Desktop. Please try opening it manually.',
            deepLinkUrl,
        };
    }
    return { success: true, deepLinkUrl };
}
