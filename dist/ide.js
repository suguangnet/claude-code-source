"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callIdeRpc = exports.isSupportedTerminal = exports.isSupportedJetBrainsTerminal = exports.isSupportedVSCodeTerminal = void 0;
exports.isVSCodeIde = isVSCodeIde;
exports.isJetBrainsIde = isJetBrainsIde;
exports.getTerminalIdeType = getTerminalIdeType;
exports.getSortedIdeLockfiles = getSortedIdeLockfiles;
exports.getIdeLockfilesPaths = getIdeLockfilesPaths;
exports.cleanupStaleIdeLockfiles = cleanupStaleIdeLockfiles;
exports.maybeInstallIDEExtension = maybeInstallIDEExtension;
exports.findAvailableIDE = findAvailableIDE;
exports.detectIDEs = detectIDEs;
exports.maybeNotifyIDEConnected = maybeNotifyIDEConnected;
exports.hasAccessToIDEExtensionDiffFeature = hasAccessToIDEExtensionDiffFeature;
exports.isIDEExtensionInstalled = isIDEExtensionInstalled;
exports.isCursorInstalled = isCursorInstalled;
exports.isWindsurfInstalled = isWindsurfInstalled;
exports.isVSCodeInstalled = isVSCodeInstalled;
exports.detectRunningIDEs = detectRunningIDEs;
exports.detectRunningIDEsCached = detectRunningIDEsCached;
exports.resetDetectRunningIDEs = resetDetectRunningIDEs;
exports.getConnectedIdeName = getConnectedIdeName;
exports.getIdeClientName = getIdeClientName;
exports.toIDEDisplayName = toIDEDisplayName;
exports.getConnectedIdeClient = getConnectedIdeClient;
exports.closeOpenDiffs = closeOpenDiffs;
exports.initializeIdeIntegration = initializeIdeIntegration;
const axios_1 = __importDefault(require("axios"));
const execa_1 = require("execa");
const capitalize_js_1 = __importDefault(require("lodash-es/capitalize.js"));
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const net_1 = require("net");
const os = __importStar(require("os"));
const path_1 = require("path");
const index_js_1 = require("src/services/analytics/index.js");
const state_js_1 = require("../bootstrap/state.js");
const client_js_1 = require("../services/mcp/client.js");
Object.defineProperty(exports, "callIdeRpc", { enumerable: true, get: function () { return client_js_1.callIdeRpc; } });
const config_js_1 = require("./config.js");
const env_js_1 = require("./env.js");
const envUtils_js_1 = require("./envUtils.js");
const execFileNoThrow_js_1 = require("./execFileNoThrow.js");
const fsOperations_js_1 = require("./fsOperations.js");
const genericProcessUtils_js_1 = require("./genericProcessUtils.js");
const jetbrains_js_1 = require("./jetbrains.js");
const log_js_1 = require("./log.js");
const platform_js_1 = require("./platform.js");
const semver_js_1 = require("./semver.js");
// Lazy: IdeOnboardingDialog.tsx pulls React/ink; only needed in interactive onboarding path
/* eslint-disable @typescript-eslint/no-require-imports */
const ideOnboardingDialog = () => require('src/components/IdeOnboardingDialog.js');
const abortController_js_1 = require("./abortController.js");
const debug_js_1 = require("./debug.js");
const envDynamic_js_1 = require("./envDynamic.js");
const errors_js_1 = require("./errors.js");
/* eslint-enable @typescript-eslint/no-require-imports */
const idePathConversion_js_1 = require("./idePathConversion.js");
const sleep_js_1 = require("./sleep.js");
const slowOperations_js_1 = require("./slowOperations.js");
function isProcessRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
// Returns a function that lazily fetches our process's ancestor PID chain,
// caching within the closure's lifetime. Callers should scope this to a
// single detection pass — PIDs recycle and process trees change over time.
function makeAncestorPidLookup() {
    let promise = null;
    return () => {
        if (!promise) {
            promise = (0, genericProcessUtils_js_1.getAncestorPidsAsync)(process.ppid, 10).then(pids => new Set(pids));
        }
        return promise;
    };
}
const supportedIdeConfigs = {
    cursor: {
        ideKind: 'vscode',
        displayName: 'Cursor',
        processKeywordsMac: ['Cursor Helper', 'Cursor.app'],
        processKeywordsWindows: ['cursor.exe'],
        processKeywordsLinux: ['cursor'],
    },
    windsurf: {
        ideKind: 'vscode',
        displayName: 'Windsurf',
        processKeywordsMac: ['Windsurf Helper', 'Windsurf.app'],
        processKeywordsWindows: ['windsurf.exe'],
        processKeywordsLinux: ['windsurf'],
    },
    vscode: {
        ideKind: 'vscode',
        displayName: 'VS Code',
        processKeywordsMac: ['Visual Studio Code', 'Code Helper'],
        processKeywordsWindows: ['code.exe'],
        processKeywordsLinux: ['code'],
    },
    intellij: {
        ideKind: 'jetbrains',
        displayName: 'IntelliJ IDEA',
        processKeywordsMac: ['IntelliJ IDEA'],
        processKeywordsWindows: ['idea64.exe'],
        processKeywordsLinux: ['idea', 'intellij'],
    },
    pycharm: {
        ideKind: 'jetbrains',
        displayName: 'PyCharm',
        processKeywordsMac: ['PyCharm'],
        processKeywordsWindows: ['pycharm64.exe'],
        processKeywordsLinux: ['pycharm'],
    },
    webstorm: {
        ideKind: 'jetbrains',
        displayName: 'WebStorm',
        processKeywordsMac: ['WebStorm'],
        processKeywordsWindows: ['webstorm64.exe'],
        processKeywordsLinux: ['webstorm'],
    },
    phpstorm: {
        ideKind: 'jetbrains',
        displayName: 'PhpStorm',
        processKeywordsMac: ['PhpStorm'],
        processKeywordsWindows: ['phpstorm64.exe'],
        processKeywordsLinux: ['phpstorm'],
    },
    rubymine: {
        ideKind: 'jetbrains',
        displayName: 'RubyMine',
        processKeywordsMac: ['RubyMine'],
        processKeywordsWindows: ['rubymine64.exe'],
        processKeywordsLinux: ['rubymine'],
    },
    clion: {
        ideKind: 'jetbrains',
        displayName: 'CLion',
        processKeywordsMac: ['CLion'],
        processKeywordsWindows: ['clion64.exe'],
        processKeywordsLinux: ['clion'],
    },
    goland: {
        ideKind: 'jetbrains',
        displayName: 'GoLand',
        processKeywordsMac: ['GoLand'],
        processKeywordsWindows: ['goland64.exe'],
        processKeywordsLinux: ['goland'],
    },
    rider: {
        ideKind: 'jetbrains',
        displayName: 'Rider',
        processKeywordsMac: ['Rider'],
        processKeywordsWindows: ['rider64.exe'],
        processKeywordsLinux: ['rider'],
    },
    datagrip: {
        ideKind: 'jetbrains',
        displayName: 'DataGrip',
        processKeywordsMac: ['DataGrip'],
        processKeywordsWindows: ['datagrip64.exe'],
        processKeywordsLinux: ['datagrip'],
    },
    appcode: {
        ideKind: 'jetbrains',
        displayName: 'AppCode',
        processKeywordsMac: ['AppCode'],
        processKeywordsWindows: ['appcode.exe'],
        processKeywordsLinux: ['appcode'],
    },
    dataspell: {
        ideKind: 'jetbrains',
        displayName: 'DataSpell',
        processKeywordsMac: ['DataSpell'],
        processKeywordsWindows: ['dataspell64.exe'],
        processKeywordsLinux: ['dataspell'],
    },
    aqua: {
        ideKind: 'jetbrains',
        displayName: 'Aqua',
        processKeywordsMac: [], // Do not auto-detect since aqua is too common
        processKeywordsWindows: ['aqua64.exe'],
        processKeywordsLinux: [],
    },
    gateway: {
        ideKind: 'jetbrains',
        displayName: 'Gateway',
        processKeywordsMac: [], // Do not auto-detect since gateway is too common
        processKeywordsWindows: ['gateway64.exe'],
        processKeywordsLinux: [],
    },
    fleet: {
        ideKind: 'jetbrains',
        displayName: 'Fleet',
        processKeywordsMac: [], // Do not auto-detect since fleet is too common
        processKeywordsWindows: ['fleet.exe'],
        processKeywordsLinux: [],
    },
    androidstudio: {
        ideKind: 'jetbrains',
        displayName: 'Android Studio',
        processKeywordsMac: ['Android Studio'],
        processKeywordsWindows: ['studio64.exe'],
        processKeywordsLinux: ['android-studio'],
    },
};
function isVSCodeIde(ide) {
    if (!ide)
        return false;
    const config = supportedIdeConfigs[ide];
    return config && config.ideKind === 'vscode';
}
function isJetBrainsIde(ide) {
    if (!ide)
        return false;
    const config = supportedIdeConfigs[ide];
    return config && config.ideKind === 'jetbrains';
}
exports.isSupportedVSCodeTerminal = (0, memoize_js_1.default)(() => {
    return isVSCodeIde(env_js_1.env.terminal);
});
exports.isSupportedJetBrainsTerminal = (0, memoize_js_1.default)(() => {
    return isJetBrainsIde(envDynamic_js_1.envDynamic.terminal);
});
exports.isSupportedTerminal = (0, memoize_js_1.default)(() => {
    return ((0, exports.isSupportedVSCodeTerminal)() ||
        (0, exports.isSupportedJetBrainsTerminal)() ||
        Boolean(process.env.FORCE_CODE_TERMINAL));
});
function getTerminalIdeType() {
    if (!(0, exports.isSupportedTerminal)()) {
        return null;
    }
    return env_js_1.env.terminal;
}
/**
 * Gets sorted IDE lockfiles from ~/.claude/ide directory
 * @returns Array of full lockfile paths sorted by modification time (newest first)
 */
async function getSortedIdeLockfiles() {
    try {
        const ideLockFilePaths = await getIdeLockfilesPaths();
        // Collect all lockfiles from all directories
        const allLockfiles = await Promise.all(ideLockFilePaths.map(async (ideLockFilePath) => {
            try {
                const entries = await (0, fsOperations_js_1.getFsImplementation)().readdir(ideLockFilePath);
                const lockEntries = entries.filter(file => file.name.endsWith('.lock'));
                // Stat all lockfiles in parallel; skip ones that fail
                const stats = await Promise.all(lockEntries.map(async (file) => {
                    const fullPath = (0, path_1.join)(ideLockFilePath, file.name);
                    try {
                        const fileStat = await (0, fsOperations_js_1.getFsImplementation)().stat(fullPath);
                        return { path: fullPath, mtime: fileStat.mtime };
                    }
                    catch {
                        return null;
                    }
                }));
                return stats.filter(s => s !== null);
            }
            catch (error) {
                // Candidate paths are pushed without pre-checking existence, so
                // missing/inaccessible dirs are expected here — skip silently.
                if (!(0, errors_js_1.isFsInaccessible)(error)) {
                    (0, log_js_1.logError)(error);
                }
                return [];
            }
        }));
        // Flatten and sort all lockfiles by last modified date (newest first)
        return allLockfiles
            .flat()
            .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
            .map(file => file.path);
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return [];
    }
}
async function readIdeLockfile(path) {
    try {
        const content = await (0, fsOperations_js_1.getFsImplementation)().readFile(path, {
            encoding: 'utf-8',
        });
        let workspaceFolders = [];
        let pid;
        let ideName;
        let useWebSocket = false;
        let runningInWindows = false;
        let authToken;
        try {
            const parsedContent = (0, slowOperations_js_1.jsonParse)(content);
            if (parsedContent.workspaceFolders) {
                workspaceFolders = parsedContent.workspaceFolders;
            }
            pid = parsedContent.pid;
            ideName = parsedContent.ideName;
            useWebSocket = parsedContent.transport === 'ws';
            runningInWindows = parsedContent.runningInWindows === true;
            authToken = parsedContent.authToken;
        }
        catch (_) {
            // Older format- just a list of paths.
            workspaceFolders = content.split('\n').map(line => line.trim());
        }
        // Extract the port from the filename (e.g., 12345.lock -> 12345)
        const filename = path.split(path_1.sep).pop();
        if (!filename)
            return null;
        const port = filename.replace('.lock', '');
        return {
            workspaceFolders,
            port: parseInt(port),
            pid,
            ideName,
            useWebSocket,
            runningInWindows,
            authToken,
        };
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return null;
    }
}
/**
 * Checks if the IDE connection is responding by testing if the port is open
 * @param host Host to connect to
 * @param port Port to connect to
 * @param timeout Optional timeout in milliseconds (defaults to 500ms)
 * @returns true if the port is open, false otherwise
 */
async function checkIdeConnection(host, port, timeout = 500) {
    try {
        return new Promise(resolve => {
            const socket = (0, net_1.createConnection)({
                host: host,
                port: port,
                timeout: timeout,
            });
            socket.on('connect', () => {
                socket.destroy();
                void resolve(true);
            });
            socket.on('error', () => {
                void resolve(false);
            });
            socket.on('timeout', () => {
                socket.destroy();
                void resolve(false);
            });
        });
    }
    catch (_) {
        // Invalid URL or other errors
        return false;
    }
}
/**
 * Resolve the Windows USERPROFILE path. WSL often doesn't pass USERPROFILE
 * through, so fall back to shelling out to powershell.exe. That spawn is
 * ~500ms–2s cold; the value is static per session.
 */
const getWindowsUserProfile = (0, memoize_js_1.default)(async () => {
    if (process.env.USERPROFILE)
        return process.env.USERPROFILE;
    const { stdout, code } = await (0, execFileNoThrow_js_1.execFileNoThrow)('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$env:USERPROFILE',
    ]);
    if (code === 0 && stdout.trim())
        return stdout.trim();
    (0, debug_js_1.logForDebugging)('Unable to get Windows USERPROFILE via PowerShell - IDE detection may be incomplete');
    return undefined;
});
/**
 * Gets the potential IDE lockfiles directories path based on platform.
 * Paths are not pre-checked for existence — the consumer readdirs each
 * and handles ENOENT. Pre-checking with stat() would double syscalls,
 * and on WSL (where /mnt/c access is 2-10x slower) the per-user-dir
 * stat loop compounded startup latency.
 */
async function getIdeLockfilesPaths() {
    const paths = [(0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), 'ide')];
    if ((0, platform_js_1.getPlatform)() !== 'wsl') {
        return paths;
    }
    // For Windows, use heuristics to find the potential paths.
    // See https://learn.microsoft.com/en-us/windows/wsl/filesystems
    const windowsHome = await getWindowsUserProfile();
    if (windowsHome) {
        const converter = new idePathConversion_js_1.WindowsToWSLConverter(process.env.WSL_DISTRO_NAME);
        const wslPath = converter.toLocalPath(windowsHome);
        paths.push((0, path_1.resolve)(wslPath, '.claude', 'ide'));
    }
    // Construct the path based on the standard Windows WSL locations
    // This can fail if the current user does not have "List folder contents" permission on C:\Users
    try {
        const usersDir = '/mnt/c/Users';
        const userDirs = await (0, fsOperations_js_1.getFsImplementation)().readdir(usersDir);
        for (const user of userDirs) {
            // Skip files (e.g. desktop.ini) — readdir on a file path throws ENOTDIR.
            // isFsInaccessible covers ENOTDIR, but pre-filtering here avoids the
            // cost of attempting to readdir non-directories. Symlinks are kept since
            // Windows creates junction points for user profiles.
            if (!user.isDirectory() && !user.isSymbolicLink()) {
                continue;
            }
            if (user.name === 'Public' ||
                user.name === 'Default' ||
                user.name === 'Default User' ||
                user.name === 'All Users') {
                continue; // Skip system directories
            }
            paths.push((0, path_1.join)(usersDir, user.name, '.claude', 'ide'));
        }
    }
    catch (error) {
        if ((0, errors_js_1.isFsInaccessible)(error)) {
            // Expected on WSL when C: drive is not mounted or user lacks permissions
            (0, debug_js_1.logForDebugging)(`WSL IDE lockfile path detection failed (${error.code}): ${(0, errors_js_1.errorMessage)(error)}`);
        }
        else {
            (0, log_js_1.logError)(error);
        }
    }
    return paths;
}
/**
 * Cleans up stale IDE lockfiles
 * - Removes lockfiles for processes that are no longer running
 * - Removes lockfiles for ports that are not responding
 */
async function cleanupStaleIdeLockfiles() {
    try {
        const lockfiles = await getSortedIdeLockfiles();
        for (const lockfilePath of lockfiles) {
            const lockfileInfo = await readIdeLockfile(lockfilePath);
            if (!lockfileInfo) {
                // If we can't read the lockfile, delete it
                try {
                    await (0, fsOperations_js_1.getFsImplementation)().unlink(lockfilePath);
                }
                catch (error) {
                    (0, log_js_1.logError)(error);
                }
                continue;
            }
            const host = await detectHostIP(lockfileInfo.runningInWindows, lockfileInfo.port);
            let shouldDelete = false;
            if (lockfileInfo.pid) {
                // Check if the process is still running
                if (!isProcessRunning(lockfileInfo.pid)) {
                    if ((0, platform_js_1.getPlatform)() !== 'wsl') {
                        shouldDelete = true;
                    }
                    else {
                        // The process id may not be reliable in wsl, so also check the connection
                        const isResponding = await checkIdeConnection(host, lockfileInfo.port);
                        if (!isResponding) {
                            shouldDelete = true;
                        }
                    }
                }
            }
            else {
                // No PID, check if the URL is responding
                const isResponding = await checkIdeConnection(host, lockfileInfo.port);
                if (!isResponding) {
                    shouldDelete = true;
                }
            }
            if (shouldDelete) {
                try {
                    await (0, fsOperations_js_1.getFsImplementation)().unlink(lockfilePath);
                }
                catch (error) {
                    (0, log_js_1.logError)(error);
                }
            }
        }
    }
    catch (error) {
        (0, log_js_1.logError)(error);
    }
}
async function maybeInstallIDEExtension(ideType) {
    try {
        // Install/update the extension
        const installedVersion = await installIDEExtension(ideType);
        // Only track successful installations
        (0, index_js_1.logEvent)('tengu_ext_installed', {});
        // Set diff tool config to auto if it has not been set already
        const globalConfig = (0, config_js_1.getGlobalConfig)();
        if (!globalConfig.diffTool) {
            (0, config_js_1.saveGlobalConfig)(current => ({ ...current, diffTool: 'auto' }));
        }
        return {
            installed: true,
            error: null,
            installedVersion,
            ideType: ideType,
        };
    }
    catch (error) {
        (0, index_js_1.logEvent)('tengu_ext_install_error', {});
        // Handle installation errors
        const errorMessage = error instanceof Error ? error.message : String(error);
        (0, log_js_1.logError)(error);
        return {
            installed: false,
            error: errorMessage,
            installedVersion: null,
            ideType: ideType,
        };
    }
}
let currentIDESearch = null;
async function findAvailableIDE() {
    if (currentIDESearch) {
        currentIDESearch.abort();
    }
    currentIDESearch = (0, abortController_js_1.createAbortController)();
    const signal = currentIDESearch.signal;
    // Clean up stale IDE lockfiles first so we don't check them at all.
    await cleanupStaleIdeLockfiles();
    const startTime = Date.now();
    while (Date.now() - startTime < 30000 && !signal.aborted) {
        // Skip iteration during scroll drain — detectIDEs reads lockfiles +
        // shells out to ps, competing for the event loop with scroll frames.
        // Next tick after scroll settles resumes the search.
        if ((0, state_js_1.getIsScrollDraining)()) {
            await (0, sleep_js_1.sleep)(1000, signal);
            continue;
        }
        const ides = await detectIDEs(false);
        if (signal.aborted) {
            return null;
        }
        // Return the IDE if and only if there is exactly one match, otherwise the user must
        // use /ide to select an IDE. When running from a supported built-in terminal, detectIDEs()
        // should return at most one IDE.
        if (ides.length === 1) {
            return ides[0];
        }
        await (0, sleep_js_1.sleep)(1000, signal);
    }
    return null;
}
/**
 * Detects IDEs that have a running extension/plugin.
 * @param includeInvalid If true, also return IDEs that are invalid (ie. where
 * the workspace directory does not match the cwd)
 */
async function detectIDEs(includeInvalid) {
    const detectedIDEs = [];
    try {
        // Get the CLAUDE_CODE_SSE_PORT if set
        const ssePort = process.env.CLAUDE_CODE_SSE_PORT;
        const envPort = ssePort ? parseInt(ssePort) : null;
        // Get the current working directory, normalized to NFC for consistent
        // comparison. macOS returns NFD paths (decomposed Unicode), while IDEs
        // like VS Code report NFC paths (composed Unicode). Without normalization,
        // paths containing accented/CJK characters fail to match.
        const cwd = (0, state_js_1.getOriginalCwd)().normalize('NFC');
        // Get sorted lockfiles (full paths) and read them all in parallel.
        // findAvailableIDE() polls this every 1s for up to 30s; serial I/O here was
        // showing up as ~500ms self-time in CPU profiles.
        const lockfiles = await getSortedIdeLockfiles();
        const lockfileInfos = await Promise.all(lockfiles.map(readIdeLockfile));
        // Ancestor PID walk shells out (ps in a loop, up to 10x). Make it lazy and
        // single-shot per detectIDEs() call; with the workspace-check-first ordering
        // below, this often never fires at all.
        const getAncestors = makeAncestorPidLookup();
        const needsAncestryCheck = (0, platform_js_1.getPlatform)() !== 'wsl' && (0, exports.isSupportedTerminal)();
        // Try to find a lockfile that contains our current working directory
        for (const lockfileInfo of lockfileInfos) {
            if (!lockfileInfo)
                continue;
            let isValid = false;
            if ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_IDE_SKIP_VALID_CHECK)) {
                isValid = true;
            }
            else if (lockfileInfo.port === envPort) {
                // If the port matches the environment variable, mark as valid regardless of directory
                isValid = true;
            }
            else {
                // Otherwise, check if the current working directory is within the workspace folders
                isValid = lockfileInfo.workspaceFolders.some(idePath => {
                    if (!idePath)
                        return false;
                    let localPath = idePath;
                    // Handle WSL-specific path conversion and distro matching
                    if ((0, platform_js_1.getPlatform)() === 'wsl' &&
                        lockfileInfo.runningInWindows &&
                        process.env.WSL_DISTRO_NAME) {
                        // Check for WSL distro mismatch
                        if (!(0, idePathConversion_js_1.checkWSLDistroMatch)(idePath, process.env.WSL_DISTRO_NAME)) {
                            return false;
                        }
                        // Try both the original path and the converted path
                        // This handles cases where the IDE might report either format
                        const resolvedOriginal = (0, path_1.resolve)(localPath).normalize('NFC');
                        if (cwd === resolvedOriginal ||
                            cwd.startsWith(resolvedOriginal + path_1.sep)) {
                            return true;
                        }
                        // Convert Windows IDE path to WSL local path and check that too
                        const converter = new idePathConversion_js_1.WindowsToWSLConverter(process.env.WSL_DISTRO_NAME);
                        localPath = converter.toLocalPath(idePath);
                    }
                    const resolvedPath = (0, path_1.resolve)(localPath).normalize('NFC');
                    // On Windows, normalize paths for case-insensitive drive letter comparison
                    if ((0, platform_js_1.getPlatform)() === 'windows') {
                        const normalizedCwd = cwd.replace(/^[a-zA-Z]:/, match => match.toUpperCase());
                        const normalizedResolvedPath = resolvedPath.replace(/^[a-zA-Z]:/, match => match.toUpperCase());
                        return (normalizedCwd === normalizedResolvedPath ||
                            normalizedCwd.startsWith(normalizedResolvedPath + path_1.sep));
                    }
                    return (cwd === resolvedPath || cwd.startsWith(resolvedPath + path_1.sep));
                });
            }
            if (!isValid && !includeInvalid) {
                continue;
            }
            // PID ancestry check: when running in a supported IDE's built-in terminal,
            // ensure this lockfile's IDE is actually our parent process. This
            // disambiguates when multiple IDE windows have overlapping workspace folders.
            // Runs AFTER the workspace check so non-matching lockfiles skip it entirely —
            // previously this shelled out once per lockfile and dominated CPU profiles
            // during findAvailableIDE() polling.
            if (needsAncestryCheck) {
                const portMatchesEnv = envPort !== null && lockfileInfo.port === envPort;
                if (!portMatchesEnv) {
                    if (!lockfileInfo.pid || !isProcessRunning(lockfileInfo.pid)) {
                        continue;
                    }
                    if (process.ppid !== lockfileInfo.pid) {
                        const ancestors = await getAncestors();
                        if (!ancestors.has(lockfileInfo.pid)) {
                            continue;
                        }
                    }
                }
            }
            const ideName = lockfileInfo.ideName ??
                ((0, exports.isSupportedTerminal)() ? toIDEDisplayName(envDynamic_js_1.envDynamic.terminal) : 'IDE');
            const host = await detectHostIP(lockfileInfo.runningInWindows, lockfileInfo.port);
            let url;
            if (lockfileInfo.useWebSocket) {
                url = `ws://${host}:${lockfileInfo.port}`;
            }
            else {
                url = `http://${host}:${lockfileInfo.port}/sse`;
            }
            detectedIDEs.push({
                url: url,
                name: ideName,
                workspaceFolders: lockfileInfo.workspaceFolders,
                port: lockfileInfo.port,
                isValid: isValid,
                authToken: lockfileInfo.authToken,
                ideRunningInWindows: lockfileInfo.runningInWindows,
            });
        }
        // The envPort should be defined for supported IDE terminals. If there is
        // an extension with a matching envPort, then we will single that one out
        // and return it, otherwise we return all the valid ones.
        if (!includeInvalid && envPort) {
            const envPortMatch = detectedIDEs.filter(ide => ide.isValid && ide.port === envPort);
            if (envPortMatch.length === 1) {
                return envPortMatch;
            }
        }
    }
    catch (error) {
        (0, log_js_1.logError)(error);
    }
    return detectedIDEs;
}
async function maybeNotifyIDEConnected(client) {
    await client.notification({
        method: 'ide_connected',
        params: {
            pid: process.pid,
        },
    });
}
function hasAccessToIDEExtensionDiffFeature(mcpClients) {
    // Check if there's a connected IDE client in the provided MCP clients list
    return mcpClients.some(client => client.type === 'connected' && client.name === 'ide');
}
const EXTENSION_ID = process.env.USER_TYPE === 'ant'
    ? 'anthropic.claude-code-internal'
    : 'anthropic.claude-code';
async function isIDEExtensionInstalled(ideType) {
    if (isVSCodeIde(ideType)) {
        const command = await getVSCodeIDECommand(ideType);
        if (command) {
            try {
                const result = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)(command, ['--list-extensions'], {
                    env: getInstallationEnv(),
                });
                if (result.stdout?.includes(EXTENSION_ID)) {
                    return true;
                }
            }
            catch {
                // eat the error
            }
        }
    }
    else if (isJetBrainsIde(ideType)) {
        return await (0, jetbrains_js_1.isJetBrainsPluginInstalledCached)(ideType);
    }
    return false;
}
async function installIDEExtension(ideType) {
    if (isVSCodeIde(ideType)) {
        const command = await getVSCodeIDECommand(ideType);
        if (command) {
            if (process.env.USER_TYPE === 'ant') {
                return await installFromArtifactory(command);
            }
            let version = await getInstalledVSCodeExtensionVersion(command);
            // If it's not installed or the version is older than the one we have bundled,
            if (!version || (0, semver_js_1.lt)(version, getClaudeCodeVersion())) {
                // `code` may crash when invoked too quickly in succession
                await (0, sleep_js_1.sleep)(500);
                const result = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)(command, ['--force', '--install-extension', 'anthropic.claude-code'], {
                    env: getInstallationEnv(),
                });
                if (result.code !== 0) {
                    throw new Error(`${result.code}: ${result.error} ${result.stderr}`);
                }
                version = getClaudeCodeVersion();
            }
            return version;
        }
    }
    // No automatic installation for JetBrains IDEs as it is not supported in native
    // builds. We show a prominent notice for them to download from the marketplace
    // instead.
    return null;
}
function getInstallationEnv() {
    // Cursor on Linux may incorrectly implement
    // the `code` command and actually launch the UI.
    // Make this error out if this happens by clearing the DISPLAY
    // environment variable.
    if ((0, platform_js_1.getPlatform)() === 'linux') {
        return {
            ...process.env,
            DISPLAY: '',
        };
    }
    return undefined;
}
function getClaudeCodeVersion() {
    return MACRO.VERSION;
}
async function getInstalledVSCodeExtensionVersion(command) {
    const { stdout } = await (0, execFileNoThrow_js_1.execFileNoThrow)(command, ['--list-extensions', '--show-versions'], {
        env: getInstallationEnv(),
    });
    const lines = stdout?.split('\n') || [];
    for (const line of lines) {
        const [extensionId, version] = line.split('@');
        if (extensionId === 'anthropic.claude-code' && version) {
            return version;
        }
    }
    return null;
}
function getVSCodeIDECommandByParentProcess() {
    try {
        const platform = (0, platform_js_1.getPlatform)();
        // Only supported on OSX, where Cursor has the ability to
        // register itself as the 'code' command.
        if (platform !== 'macos') {
            return null;
        }
        let pid = process.ppid;
        // Walk up the process tree to find the actual app
        for (let i = 0; i < 10; i++) {
            if (!pid || pid === 0 || pid === 1)
                break;
            // Get the command for this PID
            // this function already returned if not running on macos
            const command = (0, execFileNoThrow_js_1.execSyncWithDefaults_DEPRECATED)(
            // eslint-disable-next-line custom-rules/no-direct-ps-commands
            `ps -o command= -p ${pid}`)?.trim();
            if (command) {
                // Check for known applications and extract the path up to and including .app
                const appNames = {
                    'Visual Studio Code.app': 'code',
                    'Cursor.app': 'cursor',
                    'Windsurf.app': 'windsurf',
                    'Visual Studio Code - Insiders.app': 'code',
                    'VSCodium.app': 'codium',
                };
                const pathToExecutable = '/Contents/MacOS/Electron';
                for (const [appName, executableName] of Object.entries(appNames)) {
                    const appIndex = command.indexOf(appName + pathToExecutable);
                    if (appIndex !== -1) {
                        // Extract the path from the beginning to the end of the .app name
                        const folderPathEnd = appIndex + appName.length;
                        // These are all known VSCode variants with the same structure
                        return (command.substring(0, folderPathEnd) +
                            '/Contents/Resources/app/bin/' +
                            executableName);
                    }
                }
            }
            // Get parent PID
            // this function already returned if not running on macos
            const ppidStr = (0, execFileNoThrow_js_1.execSyncWithDefaults_DEPRECATED)(
            // eslint-disable-next-line custom-rules/no-direct-ps-commands
            `ps -o ppid= -p ${pid}`)?.trim();
            if (!ppidStr) {
                break;
            }
            pid = parseInt(ppidStr.trim());
        }
        return null;
    }
    catch {
        return null;
    }
}
async function getVSCodeIDECommand(ideType) {
    const parentExecutable = getVSCodeIDECommandByParentProcess();
    if (parentExecutable) {
        // Verify the parent executable actually exists
        try {
            await (0, fsOperations_js_1.getFsImplementation)().stat(parentExecutable);
            return parentExecutable;
        }
        catch {
            // Parent executable doesn't exist
        }
    }
    // On Windows, explicitly request the .cmd wrapper. VS Code 1.110.0 began
    // prepending the install root (containing Code.exe, the Electron GUI binary)
    // to the integrated terminal's PATH ahead of bin\ (containing code.cmd, the
    // CLI wrapper) when launched via Start-Menu/Taskbar shortcuts. A bare 'code'
    // then resolves to Code.exe via PATHEXT which opens a new editor window
    // instead of running the CLI. Asking for 'code.cmd' forces cross-spawn/which
    // to skip Code.exe. See microsoft/vscode#299416 (fixed in Insiders) and
    // anthropics/claude-code#30975.
    const ext = (0, platform_js_1.getPlatform)() === 'windows' ? '.cmd' : '';
    switch (ideType) {
        case 'vscode':
            return 'code' + ext;
        case 'cursor':
            return 'cursor' + ext;
        case 'windsurf':
            return 'windsurf' + ext;
        default:
            break;
    }
    return null;
}
async function isCursorInstalled() {
    const result = await (0, execFileNoThrow_js_1.execFileNoThrow)('cursor', ['--version']);
    return result.code === 0;
}
async function isWindsurfInstalled() {
    const result = await (0, execFileNoThrow_js_1.execFileNoThrow)('windsurf', ['--version']);
    return result.code === 0;
}
async function isVSCodeInstalled() {
    const result = await (0, execFileNoThrow_js_1.execFileNoThrow)('code', ['--help']);
    // Check if the output indicates this is actually Visual Studio Code
    return (result.code === 0 && Boolean(result.stdout?.includes('Visual Studio Code')));
}
// Cache for IDE detection results
let cachedRunningIDEs = null;
/**
 * Internal implementation of IDE detection.
 */
async function detectRunningIDEsImpl() {
    const runningIDEs = [];
    try {
        const platform = (0, platform_js_1.getPlatform)();
        if (platform === 'macos') {
            // On macOS, use ps with process name matching
            const result = await (0, execa_1.execa)('ps aux | grep -E "Visual Studio Code|Code Helper|Cursor Helper|Windsurf Helper|IntelliJ IDEA|PyCharm|WebStorm|PhpStorm|RubyMine|CLion|GoLand|Rider|DataGrip|AppCode|DataSpell|Aqua|Gateway|Fleet|Android Studio" | grep -v grep', { shell: true, reject: false });
            const stdout = result.stdout ?? '';
            for (const [ide, config] of Object.entries(supportedIdeConfigs)) {
                for (const keyword of config.processKeywordsMac) {
                    if (stdout.includes(keyword)) {
                        runningIDEs.push(ide);
                        break;
                    }
                }
            }
        }
        else if (platform === 'windows') {
            // On Windows, use tasklist with findstr for multiple patterns
            const result = await (0, execa_1.execa)('tasklist | findstr /I "Code.exe Cursor.exe Windsurf.exe idea64.exe pycharm64.exe webstorm64.exe phpstorm64.exe rubymine64.exe clion64.exe goland64.exe rider64.exe datagrip64.exe appcode.exe dataspell64.exe aqua64.exe gateway64.exe fleet.exe studio64.exe"', { shell: true, reject: false });
            const stdout = result.stdout ?? '';
            const normalizedStdout = stdout.toLowerCase();
            for (const [ide, config] of Object.entries(supportedIdeConfigs)) {
                for (const keyword of config.processKeywordsWindows) {
                    if (normalizedStdout.includes(keyword.toLowerCase())) {
                        runningIDEs.push(ide);
                        break;
                    }
                }
            }
        }
        else if (platform === 'linux') {
            // On Linux, use ps with process name matching
            const result = await (0, execa_1.execa)('ps aux | grep -E "code|cursor|windsurf|idea|pycharm|webstorm|phpstorm|rubymine|clion|goland|rider|datagrip|dataspell|aqua|gateway|fleet|android-studio" | grep -v grep', { shell: true, reject: false });
            const stdout = result.stdout ?? '';
            const normalizedStdout = stdout.toLowerCase();
            for (const [ide, config] of Object.entries(supportedIdeConfigs)) {
                for (const keyword of config.processKeywordsLinux) {
                    if (normalizedStdout.includes(keyword)) {
                        if (ide !== 'vscode') {
                            runningIDEs.push(ide);
                            break;
                        }
                        else if (!normalizedStdout.includes('cursor') &&
                            !normalizedStdout.includes('appcode')) {
                            // Special case conflicting keywords from some of the IDEs.
                            runningIDEs.push(ide);
                            break;
                        }
                    }
                }
            }
        }
    }
    catch (error) {
        // If process detection fails, return empty array
        (0, log_js_1.logError)(error);
    }
    return runningIDEs;
}
/**
 * Detects running IDEs and returns an array of IdeType for those that are running.
 * This performs fresh detection (~150ms) and updates the cache for subsequent
 * detectRunningIDEsCached() calls.
 */
async function detectRunningIDEs() {
    const result = await detectRunningIDEsImpl();
    cachedRunningIDEs = result;
    return result;
}
/**
 * Returns cached IDE detection results, or performs detection if cache is empty.
 * Use this for performance-sensitive paths like tips where fresh results aren't needed.
 */
async function detectRunningIDEsCached() {
    if (cachedRunningIDEs === null) {
        return detectRunningIDEs();
    }
    return cachedRunningIDEs;
}
/**
 * Resets the cache for detectRunningIDEsCached.
 * Exported for testing - allows resetting state between tests.
 */
function resetDetectRunningIDEs() {
    cachedRunningIDEs = null;
}
function getConnectedIdeName(mcpClients) {
    const ideClient = mcpClients.find(client => client.type === 'connected' && client.name === 'ide');
    return getIdeClientName(ideClient);
}
function getIdeClientName(ideClient) {
    const config = ideClient?.config;
    return config?.type === 'sse-ide' || config?.type === 'ws-ide'
        ? config.ideName
        : (0, exports.isSupportedTerminal)()
            ? toIDEDisplayName(envDynamic_js_1.envDynamic.terminal)
            : null;
}
const EDITOR_DISPLAY_NAMES = {
    code: 'VS Code',
    cursor: 'Cursor',
    windsurf: 'Windsurf',
    antigravity: 'Antigravity',
    vi: 'Vim',
    vim: 'Vim',
    nano: 'nano',
    notepad: 'Notepad',
    'start /wait notepad': 'Notepad',
    emacs: 'Emacs',
    subl: 'Sublime Text',
    atom: 'Atom',
};
function toIDEDisplayName(terminal) {
    if (!terminal)
        return 'IDE';
    const config = supportedIdeConfigs[terminal];
    if (config) {
        return config.displayName;
    }
    // Check editor command names (exact match first)
    const editorName = EDITOR_DISPLAY_NAMES[terminal.toLowerCase().trim()];
    if (editorName) {
        return editorName;
    }
    // Extract command name from path/arguments (e.g., "/usr/bin/code --wait" -> "code")
    const command = terminal.split(' ')[0];
    const commandName = command ? (0, path_1.basename)(command).toLowerCase() : null;
    if (commandName) {
        const mappedName = EDITOR_DISPLAY_NAMES[commandName];
        if (mappedName) {
            return mappedName;
        }
        // Fallback: capitalize the command basename
        return (0, capitalize_js_1.default)(commandName);
    }
    // Fallback: capitalize first letter
    return (0, capitalize_js_1.default)(terminal);
}
/**
 * Gets the connected IDE client from a list of MCP clients
 * @param mcpClients - Array of wrapped MCP clients
 * @returns The connected IDE client, or undefined if not found
 */
function getConnectedIdeClient(mcpClients) {
    if (!mcpClients) {
        return undefined;
    }
    const ideClient = mcpClients.find(client => client.type === 'connected' && client.name === 'ide');
    // Type guard to ensure we return the correct type
    return ideClient?.type === 'connected' ? ideClient : undefined;
}
/**
 * Notifies the IDE that a new prompt has been submitted.
 * This triggers IDE-specific actions like closing all diff tabs.
 */
async function closeOpenDiffs(ideClient) {
    try {
        await (0, client_js_1.callIdeRpc)('closeAllDiffTabs', {}, ideClient);
    }
    catch (_) {
        // Silently ignore errors when closing diff tabs
        // This prevents exceptions if the IDE doesn't support this operation
    }
}
/**
 * Initializes IDE detection and extension installation, then calls the provided callback
 * with the detected IDE information and installation status.
 * @param ideToInstallExtension The ide to install the extension to (if installing from external terminal)
 * @param onIdeDetected Callback to be called when an IDE is detected (including null)
 * @param onInstallationComplete Callback to be called when extension installation is complete
 */
async function initializeIdeIntegration(onIdeDetected, ideToInstallExtension, onShowIdeOnboarding, onInstallationComplete) {
    // Don't await so we don't block startup, but return a promise that resolves with the status
    void findAvailableIDE().then(onIdeDetected);
    const shouldAutoInstall = (0, config_js_1.getGlobalConfig)().autoInstallIdeExtension ?? true;
    if (!(0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL) &&
        shouldAutoInstall) {
        const ideType = ideToInstallExtension ?? getTerminalIdeType();
        if (ideType) {
            if (isVSCodeIde(ideType)) {
                void isIDEExtensionInstalled(ideType).then(async (isAlreadyInstalled) => {
                    void maybeInstallIDEExtension(ideType)
                        .catch(error => {
                        const ideInstallationStatus = {
                            installed: false,
                            error: error.message || 'Installation failed',
                            installedVersion: null,
                            ideType: ideType,
                        };
                        return ideInstallationStatus;
                    })
                        .then(status => {
                        onInstallationComplete(status);
                        if (status?.installed) {
                            // If we installed and don't yet have an IDE, search again.
                            void findAvailableIDE().then(onIdeDetected);
                        }
                        if (!isAlreadyInstalled &&
                            status?.installed === true &&
                            !ideOnboardingDialog().hasIdeOnboardingDialogBeenShown()) {
                            onShowIdeOnboarding();
                        }
                    });
                });
            }
            else if (isJetBrainsIde(ideType)) {
                // Always check installation to populate the sync cache used by status notices
                void isIDEExtensionInstalled(ideType).then(async (installed) => {
                    if (installed &&
                        !ideOnboardingDialog().hasIdeOnboardingDialogBeenShown()) {
                        onShowIdeOnboarding();
                    }
                });
            }
        }
    }
}
/**
 * Detects the host IP to use to connect to the extension.
 */
const detectHostIP = (0, memoize_js_1.default)(async (isIdeRunningInWindows, port) => {
    if (process.env.CLAUDE_CODE_IDE_HOST_OVERRIDE) {
        return process.env.CLAUDE_CODE_IDE_HOST_OVERRIDE;
    }
    if ((0, platform_js_1.getPlatform)() !== 'wsl' || !isIdeRunningInWindows) {
        return '127.0.0.1';
    }
    // If we are running under the WSL2 VM but the extension/plugin is running in
    // Windows, then we must use a different IP address to connect to the extension.
    // https://learn.microsoft.com/en-us/windows/wsl/networking
    try {
        const routeResult = await (0, execa_1.execa)('ip route show | grep -i default', {
            shell: true,
            reject: false,
        });
        if (routeResult.exitCode === 0 && routeResult.stdout) {
            const gatewayMatch = routeResult.stdout.match(/default via (\d+\.\d+\.\d+\.\d+)/);
            if (gatewayMatch) {
                const gatewayIP = gatewayMatch[1];
                if (await checkIdeConnection(gatewayIP, port)) {
                    return gatewayIP;
                }
            }
        }
    }
    catch (_) {
        // Suppress any errors
    }
    // Fallback to the default if we cannot find anything
    return '127.0.0.1';
}, (isIdeRunningInWindows, port) => `${isIdeRunningInWindows}:${port}`);
async function installFromArtifactory(command) {
    // Read auth token from ~/.npmrc
    const npmrcPath = (0, path_1.join)(os.homedir(), '.npmrc');
    let authToken = null;
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    try {
        const npmrcContent = await fs.readFile(npmrcPath, {
            encoding: 'utf8',
        });
        const lines = npmrcContent.split('\n');
        for (const line of lines) {
            // Look for the artifactory auth token line
            const match = line.match(/\/\/artifactory\.infra\.ant\.dev\/artifactory\/api\/npm\/npm-all\/:_authToken=(.+)/);
            if (match && match[1]) {
                authToken = match[1].trim();
                break;
            }
        }
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        throw new Error(`Failed to read npm authentication: ${error}`);
    }
    if (!authToken) {
        throw new Error('No artifactory auth token found in ~/.npmrc');
    }
    // Fetch the version from artifactory
    const versionUrl = 'https://artifactory.infra.ant.dev/artifactory/armorcode-claude-code-internal/claude-vscode-releases/stable';
    try {
        const versionResponse = await axios_1.default.get(versionUrl, {
            headers: {
                Authorization: `Bearer ${authToken}`,
            },
        });
        const version = versionResponse.data.trim();
        if (!version) {
            throw new Error('No version found in artifactory response');
        }
        // Download the .vsix file from artifactory
        const vsixUrl = `https://artifactory.infra.ant.dev/artifactory/armorcode-claude-code-internal/claude-vscode-releases/${version}/claude-code.vsix`;
        const tempVsixPath = (0, path_1.join)(os.tmpdir(), `claude-code-${version}-${Date.now()}.vsix`);
        try {
            const vsixResponse = await axios_1.default.get(vsixUrl, {
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                responseType: 'stream',
            });
            // Write the downloaded file to disk
            const writeStream = (0, fsOperations_js_1.getFsImplementation)().createWriteStream(tempVsixPath);
            await new Promise((resolve, reject) => {
                vsixResponse.data.pipe(writeStream);
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
            });
            // Install the .vsix file
            // Add delay to prevent code command crashes
            await (0, sleep_js_1.sleep)(500);
            const result = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)(command, ['--force', '--install-extension', tempVsixPath], {
                env: getInstallationEnv(),
            });
            if (result.code !== 0) {
                throw new Error(`${result.code}: ${result.error} ${result.stderr}`);
            }
            return version;
        }
        finally {
            // Clean up the temporary file
            try {
                await fs.unlink(tempVsixPath);
            }
            catch {
                // Ignore cleanup errors
            }
        }
    }
    catch (error) {
        if (axios_1.default.isAxiosError(error)) {
            throw new Error(`Failed to fetch extension version from artifactory: ${error.message}`);
        }
        throw error;
    }
}
