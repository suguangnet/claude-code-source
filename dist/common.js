"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BROWSER_DETECTION_ORDER = exports.CHROMIUM_BROWSERS = exports.CLAUDE_IN_CHROME_MCP_SERVER_NAME = void 0;
exports.getAllBrowserDataPaths = getAllBrowserDataPaths;
exports.getAllNativeMessagingHostsDirs = getAllNativeMessagingHostsDirs;
exports.getAllWindowsRegistryKeys = getAllWindowsRegistryKeys;
exports.detectAvailableBrowser = detectAvailableBrowser;
exports.isClaudeInChromeMCPServer = isClaudeInChromeMCPServer;
exports.trackClaudeInChromeTabId = trackClaudeInChromeTabId;
exports.isTrackedClaudeInChromeTabId = isTrackedClaudeInChromeTabId;
exports.openInChrome = openInChrome;
exports.getSocketDir = getSocketDir;
exports.getSecureSocketPath = getSecureSocketPath;
exports.getAllSocketPaths = getAllSocketPaths;
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const os_1 = require("os");
const path_1 = require("path");
const normalization_js_1 = require("../../services/mcp/normalization.js");
const debug_js_1 = require("../debug.js");
const errors_js_1 = require("../errors.js");
const execFileNoThrow_js_1 = require("../execFileNoThrow.js");
const platform_js_1 = require("../platform.js");
const which_js_1 = require("../which.js");
exports.CLAUDE_IN_CHROME_MCP_SERVER_NAME = 'claude-in-chrome';
exports.CHROMIUM_BROWSERS = {
    chrome: {
        name: 'Google Chrome',
        macos: {
            appName: 'Google Chrome',
            dataPath: ['Library', 'Application Support', 'Google', 'Chrome'],
            nativeMessagingPath: [
                'Library',
                'Application Support',
                'Google',
                'Chrome',
                'NativeMessagingHosts',
            ],
        },
        linux: {
            binaries: ['google-chrome', 'google-chrome-stable'],
            dataPath: ['.config', 'google-chrome'],
            nativeMessagingPath: ['.config', 'google-chrome', 'NativeMessagingHosts'],
        },
        windows: {
            dataPath: ['Google', 'Chrome', 'User Data'],
            registryKey: 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts',
        },
    },
    brave: {
        name: 'Brave',
        macos: {
            appName: 'Brave Browser',
            dataPath: [
                'Library',
                'Application Support',
                'BraveSoftware',
                'Brave-Browser',
            ],
            nativeMessagingPath: [
                'Library',
                'Application Support',
                'BraveSoftware',
                'Brave-Browser',
                'NativeMessagingHosts',
            ],
        },
        linux: {
            binaries: ['brave-browser', 'brave'],
            dataPath: ['.config', 'BraveSoftware', 'Brave-Browser'],
            nativeMessagingPath: [
                '.config',
                'BraveSoftware',
                'Brave-Browser',
                'NativeMessagingHosts',
            ],
        },
        windows: {
            dataPath: ['BraveSoftware', 'Brave-Browser', 'User Data'],
            registryKey: 'HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts',
        },
    },
    arc: {
        name: 'Arc',
        macos: {
            appName: 'Arc',
            dataPath: ['Library', 'Application Support', 'Arc', 'User Data'],
            nativeMessagingPath: [
                'Library',
                'Application Support',
                'Arc',
                'User Data',
                'NativeMessagingHosts',
            ],
        },
        linux: {
            // Arc is not available on Linux
            binaries: [],
            dataPath: [],
            nativeMessagingPath: [],
        },
        windows: {
            // Arc Windows is Chromium-based
            dataPath: ['Arc', 'User Data'],
            registryKey: 'HKCU\\Software\\ArcBrowser\\Arc\\NativeMessagingHosts',
        },
    },
    chromium: {
        name: 'Chromium',
        macos: {
            appName: 'Chromium',
            dataPath: ['Library', 'Application Support', 'Chromium'],
            nativeMessagingPath: [
                'Library',
                'Application Support',
                'Chromium',
                'NativeMessagingHosts',
            ],
        },
        linux: {
            binaries: ['chromium', 'chromium-browser'],
            dataPath: ['.config', 'chromium'],
            nativeMessagingPath: ['.config', 'chromium', 'NativeMessagingHosts'],
        },
        windows: {
            dataPath: ['Chromium', 'User Data'],
            registryKey: 'HKCU\\Software\\Chromium\\NativeMessagingHosts',
        },
    },
    edge: {
        name: 'Microsoft Edge',
        macos: {
            appName: 'Microsoft Edge',
            dataPath: ['Library', 'Application Support', 'Microsoft Edge'],
            nativeMessagingPath: [
                'Library',
                'Application Support',
                'Microsoft Edge',
                'NativeMessagingHosts',
            ],
        },
        linux: {
            binaries: ['microsoft-edge', 'microsoft-edge-stable'],
            dataPath: ['.config', 'microsoft-edge'],
            nativeMessagingPath: [
                '.config',
                'microsoft-edge',
                'NativeMessagingHosts',
            ],
        },
        windows: {
            dataPath: ['Microsoft', 'Edge', 'User Data'],
            registryKey: 'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts',
        },
    },
    vivaldi: {
        name: 'Vivaldi',
        macos: {
            appName: 'Vivaldi',
            dataPath: ['Library', 'Application Support', 'Vivaldi'],
            nativeMessagingPath: [
                'Library',
                'Application Support',
                'Vivaldi',
                'NativeMessagingHosts',
            ],
        },
        linux: {
            binaries: ['vivaldi', 'vivaldi-stable'],
            dataPath: ['.config', 'vivaldi'],
            nativeMessagingPath: ['.config', 'vivaldi', 'NativeMessagingHosts'],
        },
        windows: {
            dataPath: ['Vivaldi', 'User Data'],
            registryKey: 'HKCU\\Software\\Vivaldi\\NativeMessagingHosts',
        },
    },
    opera: {
        name: 'Opera',
        macos: {
            appName: 'Opera',
            dataPath: ['Library', 'Application Support', 'com.operasoftware.Opera'],
            nativeMessagingPath: [
                'Library',
                'Application Support',
                'com.operasoftware.Opera',
                'NativeMessagingHosts',
            ],
        },
        linux: {
            binaries: ['opera'],
            dataPath: ['.config', 'opera'],
            nativeMessagingPath: ['.config', 'opera', 'NativeMessagingHosts'],
        },
        windows: {
            dataPath: ['Opera Software', 'Opera Stable'],
            registryKey: 'HKCU\\Software\\Opera Software\\Opera Stable\\NativeMessagingHosts',
            useRoaming: true, // Opera uses Roaming AppData, not Local
        },
    },
};
// Priority order for browser detection (most common first)
exports.BROWSER_DETECTION_ORDER = [
    'chrome',
    'brave',
    'arc',
    'edge',
    'chromium',
    'vivaldi',
    'opera',
];
/**
 * Get all browser data paths to check for extension installation
 */
function getAllBrowserDataPaths() {
    const platform = (0, platform_js_1.getPlatform)();
    const home = (0, os_1.homedir)();
    const paths = [];
    for (const browserId of exports.BROWSER_DETECTION_ORDER) {
        const config = exports.CHROMIUM_BROWSERS[browserId];
        let dataPath;
        switch (platform) {
            case 'macos':
                dataPath = config.macos.dataPath;
                break;
            case 'linux':
            case 'wsl':
                dataPath = config.linux.dataPath;
                break;
            case 'windows': {
                if (config.windows.dataPath.length > 0) {
                    const appDataBase = config.windows.useRoaming
                        ? (0, path_1.join)(home, 'AppData', 'Roaming')
                        : (0, path_1.join)(home, 'AppData', 'Local');
                    paths.push({
                        browser: browserId,
                        path: (0, path_1.join)(appDataBase, ...config.windows.dataPath),
                    });
                }
                continue;
            }
        }
        if (dataPath && dataPath.length > 0) {
            paths.push({
                browser: browserId,
                path: (0, path_1.join)(home, ...dataPath),
            });
        }
    }
    return paths;
}
/**
 * Get native messaging host directories for all supported browsers
 */
function getAllNativeMessagingHostsDirs() {
    const platform = (0, platform_js_1.getPlatform)();
    const home = (0, os_1.homedir)();
    const paths = [];
    for (const browserId of exports.BROWSER_DETECTION_ORDER) {
        const config = exports.CHROMIUM_BROWSERS[browserId];
        switch (platform) {
            case 'macos':
                if (config.macos.nativeMessagingPath.length > 0) {
                    paths.push({
                        browser: browserId,
                        path: (0, path_1.join)(home, ...config.macos.nativeMessagingPath),
                    });
                }
                break;
            case 'linux':
            case 'wsl':
                if (config.linux.nativeMessagingPath.length > 0) {
                    paths.push({
                        browser: browserId,
                        path: (0, path_1.join)(home, ...config.linux.nativeMessagingPath),
                    });
                }
                break;
            case 'windows':
                // Windows uses registry, not file paths for native messaging
                // We'll use a common location for the manifest file
                break;
        }
    }
    return paths;
}
/**
 * Get Windows registry keys for all supported browsers
 */
function getAllWindowsRegistryKeys() {
    const keys = [];
    for (const browserId of exports.BROWSER_DETECTION_ORDER) {
        const config = exports.CHROMIUM_BROWSERS[browserId];
        if (config.windows.registryKey) {
            keys.push({
                browser: browserId,
                key: config.windows.registryKey,
            });
        }
    }
    return keys;
}
/**
 * Detect which browser to use for opening URLs
 * Returns the first available browser, or null if none found
 */
async function detectAvailableBrowser() {
    const platform = (0, platform_js_1.getPlatform)();
    for (const browserId of exports.BROWSER_DETECTION_ORDER) {
        const config = exports.CHROMIUM_BROWSERS[browserId];
        switch (platform) {
            case 'macos': {
                // Check if the .app bundle (a directory) exists
                const appPath = `/Applications/${config.macos.appName}.app`;
                try {
                    const stats = await (0, promises_1.stat)(appPath);
                    if (stats.isDirectory()) {
                        (0, debug_js_1.logForDebugging)(`[Claude in Chrome] Detected browser: ${config.name}`);
                        return browserId;
                    }
                }
                catch (e) {
                    if (!(0, errors_js_1.isFsInaccessible)(e))
                        throw e;
                    // App not found, continue checking
                }
                break;
            }
            case 'wsl':
            case 'linux': {
                // Check if any binary exists
                for (const binary of config.linux.binaries) {
                    if (await (0, which_js_1.which)(binary).catch(() => null)) {
                        (0, debug_js_1.logForDebugging)(`[Claude in Chrome] Detected browser: ${config.name}`);
                        return browserId;
                    }
                }
                break;
            }
            case 'windows': {
                // Check if data path exists (indicates browser is installed)
                const home = (0, os_1.homedir)();
                if (config.windows.dataPath.length > 0) {
                    const appDataBase = config.windows.useRoaming
                        ? (0, path_1.join)(home, 'AppData', 'Roaming')
                        : (0, path_1.join)(home, 'AppData', 'Local');
                    const dataPath = (0, path_1.join)(appDataBase, ...config.windows.dataPath);
                    try {
                        const stats = await (0, promises_1.stat)(dataPath);
                        if (stats.isDirectory()) {
                            (0, debug_js_1.logForDebugging)(`[Claude in Chrome] Detected browser: ${config.name}`);
                            return browserId;
                        }
                    }
                    catch (e) {
                        if (!(0, errors_js_1.isFsInaccessible)(e))
                            throw e;
                        // Browser not found, continue checking
                    }
                }
                break;
            }
        }
    }
    return null;
}
function isClaudeInChromeMCPServer(name) {
    return (0, normalization_js_1.normalizeNameForMCP)(name) === exports.CLAUDE_IN_CHROME_MCP_SERVER_NAME;
}
const MAX_TRACKED_TABS = 200;
const trackedTabIds = new Set();
function trackClaudeInChromeTabId(tabId) {
    if (trackedTabIds.size >= MAX_TRACKED_TABS && !trackedTabIds.has(tabId)) {
        trackedTabIds.clear();
    }
    trackedTabIds.add(tabId);
}
function isTrackedClaudeInChromeTabId(tabId) {
    return trackedTabIds.has(tabId);
}
async function openInChrome(url) {
    const currentPlatform = (0, platform_js_1.getPlatform)();
    // Detect the best available browser
    const browser = await detectAvailableBrowser();
    if (!browser) {
        (0, debug_js_1.logForDebugging)('[Claude in Chrome] No compatible browser found');
        return false;
    }
    const config = exports.CHROMIUM_BROWSERS[browser];
    switch (currentPlatform) {
        case 'macos': {
            const { code } = await (0, execFileNoThrow_js_1.execFileNoThrow)('open', [
                '-a',
                config.macos.appName,
                url,
            ]);
            return code === 0;
        }
        case 'windows': {
            // Use rundll32 to avoid cmd.exe metacharacter issues with URLs containing & | > <
            const { code } = await (0, execFileNoThrow_js_1.execFileNoThrow)('rundll32', ['url,OpenURL', url]);
            return code === 0;
        }
        case 'wsl':
        case 'linux': {
            for (const binary of config.linux.binaries) {
                const { code } = await (0, execFileNoThrow_js_1.execFileNoThrow)(binary, [url]);
                if (code === 0) {
                    return true;
                }
            }
            return false;
        }
        default:
            return false;
    }
}
/**
 * Get the socket directory path (Unix only)
 */
function getSocketDir() {
    return `/tmp/claude-mcp-browser-bridge-${getUsername()}`;
}
/**
 * Get the socket path (Unix) or pipe name (Windows)
 */
function getSecureSocketPath() {
    if ((0, os_1.platform)() === 'win32') {
        return `\\\\.\\pipe\\${getSocketName()}`;
    }
    return (0, path_1.join)(getSocketDir(), `${process.pid}.sock`);
}
/**
 * Get all socket paths including PID-based sockets in the directory
 * and legacy fallback paths
 */
function getAllSocketPaths() {
    // Windows uses named pipes, not Unix sockets
    if ((0, os_1.platform)() === 'win32') {
        return [`\\\\.\\pipe\\${getSocketName()}`];
    }
    const paths = [];
    const socketDir = getSocketDir();
    // Scan for *.sock files in the socket directory
    try {
        // eslint-disable-next-line custom-rules/no-sync-fs -- ClaudeForChromeContext.getSocketPaths (external @ant/claude-for-chrome-mcp) requires a sync () => string[] callback
        const files = (0, fs_1.readdirSync)(socketDir);
        for (const file of files) {
            if (file.endsWith('.sock')) {
                paths.push((0, path_1.join)(socketDir, file));
            }
        }
    }
    catch {
        // Directory may not exist yet
    }
    // Legacy fallback paths
    const legacyName = `claude-mcp-browser-bridge-${getUsername()}`;
    const legacyTmpdir = (0, path_1.join)((0, os_1.tmpdir)(), legacyName);
    const legacyTmp = `/tmp/${legacyName}`;
    if (!paths.includes(legacyTmpdir)) {
        paths.push(legacyTmpdir);
    }
    if (legacyTmpdir !== legacyTmp && !paths.includes(legacyTmp)) {
        paths.push(legacyTmp);
    }
    return paths;
}
function getSocketName() {
    // NOTE: This must match the one used in the Claude in Chrome MCP
    return `claude-mcp-browser-bridge-${getUsername()}`;
}
function getUsername() {
    try {
        return (0, os_1.userInfo)().username || 'default';
    }
    catch {
        return process.env.USER || process.env.USERNAME || 'default';
    }
}
