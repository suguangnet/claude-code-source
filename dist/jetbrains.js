"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isJetBrainsPluginInstalled = isJetBrainsPluginInstalled;
exports.isJetBrainsPluginInstalledCached = isJetBrainsPluginInstalledCached;
exports.isJetBrainsPluginInstalledCachedSync = isJetBrainsPluginInstalledCachedSync;
const os_1 = require("os");
const path_1 = require("path");
const fsOperations_js_1 = require("../utils/fsOperations.js");
const PLUGIN_PREFIX = 'claude-code-jetbrains-plugin';
// Map of IDE names to their directory patterns
const ideNameToDirMap = {
    pycharm: ['PyCharm'],
    intellij: ['IntelliJIdea', 'IdeaIC'],
    webstorm: ['WebStorm'],
    phpstorm: ['PhpStorm'],
    rubymine: ['RubyMine'],
    clion: ['CLion'],
    goland: ['GoLand'],
    rider: ['Rider'],
    datagrip: ['DataGrip'],
    appcode: ['AppCode'],
    dataspell: ['DataSpell'],
    aqua: ['Aqua'],
    gateway: ['Gateway'],
    fleet: ['Fleet'],
    androidstudio: ['AndroidStudio'],
};
// Build plugin directory paths
// https://www.jetbrains.com/help/pycharm/directories-used-by-the-ide-to-store-settings-caches-plugins-and-logs.html#plugins-directory
function buildCommonPluginDirectoryPaths(ideName) {
    const homeDir = (0, os_1.homedir)();
    const directories = [];
    const idePatterns = ideNameToDirMap[ideName.toLowerCase()];
    if (!idePatterns) {
        return directories;
    }
    const appData = process.env.APPDATA || (0, path_1.join)(homeDir, 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA || (0, path_1.join)(homeDir, 'AppData', 'Local');
    switch ((0, os_1.platform)()) {
        case 'darwin':
            directories.push((0, path_1.join)(homeDir, 'Library', 'Application Support', 'JetBrains'), (0, path_1.join)(homeDir, 'Library', 'Application Support'));
            if (ideName.toLowerCase() === 'androidstudio') {
                directories.push((0, path_1.join)(homeDir, 'Library', 'Application Support', 'Google'));
            }
            break;
        case 'win32':
            directories.push((0, path_1.join)(appData, 'JetBrains'), (0, path_1.join)(localAppData, 'JetBrains'), (0, path_1.join)(appData));
            if (ideName.toLowerCase() === 'androidstudio') {
                directories.push((0, path_1.join)(localAppData, 'Google'));
            }
            break;
        case 'linux':
            directories.push((0, path_1.join)(homeDir, '.config', 'JetBrains'), (0, path_1.join)(homeDir, '.local', 'share', 'JetBrains'));
            for (const pattern of idePatterns) {
                directories.push((0, path_1.join)(homeDir, '.' + pattern));
            }
            if (ideName.toLowerCase() === 'androidstudio') {
                directories.push((0, path_1.join)(homeDir, '.config', 'Google'));
            }
            break;
        default:
            break;
    }
    return directories;
}
// Find all actual plugin directories that exist
async function detectPluginDirectories(ideName) {
    const foundDirectories = [];
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    const pluginDirPaths = buildCommonPluginDirectoryPaths(ideName);
    const idePatterns = ideNameToDirMap[ideName.toLowerCase()];
    if (!idePatterns) {
        return foundDirectories;
    }
    // Precompile once — idePatterns is invariant across baseDirs
    const regexes = idePatterns.map(p => new RegExp('^' + p));
    for (const baseDir of pluginDirPaths) {
        try {
            const entries = await fs.readdir(baseDir);
            for (const regex of regexes) {
                for (const entry of entries) {
                    if (!regex.test(entry.name))
                        continue;
                    // Accept symlinks too — dirent.isDirectory() is false for symlinks,
                    // but GNU stow users symlink their JetBrains config dirs. Downstream
                    // fs.stat() calls will filter out symlinks that don't point to dirs.
                    if (!entry.isDirectory() && !entry.isSymbolicLink())
                        continue;
                    const dir = (0, path_1.join)(baseDir, entry.name);
                    // Linux is the only OS to not have a plugins directory
                    if ((0, os_1.platform)() === 'linux') {
                        foundDirectories.push(dir);
                        continue;
                    }
                    const pluginDir = (0, path_1.join)(dir, 'plugins');
                    try {
                        await fs.stat(pluginDir);
                        foundDirectories.push(pluginDir);
                    }
                    catch {
                        // Plugin directory doesn't exist, skip
                    }
                }
            }
        }
        catch {
            // Ignore errors from stale IDE directories (ENOENT, EACCES, etc.)
            continue;
        }
    }
    return foundDirectories.filter((dir, index) => foundDirectories.indexOf(dir) === index);
}
async function isJetBrainsPluginInstalled(ideType) {
    const pluginDirs = await detectPluginDirectories(ideType);
    for (const dir of pluginDirs) {
        const pluginPath = (0, path_1.join)(dir, PLUGIN_PREFIX);
        try {
            await (0, fsOperations_js_1.getFsImplementation)().stat(pluginPath);
            return true;
        }
        catch {
            // Plugin not found in this directory, continue
        }
    }
    return false;
}
const pluginInstalledCache = new Map();
const pluginInstalledPromiseCache = new Map();
async function isJetBrainsPluginInstalledMemoized(ideType, forceRefresh = false) {
    if (!forceRefresh) {
        const existing = pluginInstalledPromiseCache.get(ideType);
        if (existing) {
            return existing;
        }
    }
    const promise = isJetBrainsPluginInstalled(ideType).then(result => {
        pluginInstalledCache.set(ideType, result);
        return result;
    });
    pluginInstalledPromiseCache.set(ideType, promise);
    return promise;
}
async function isJetBrainsPluginInstalledCached(ideType, forceRefresh = false) {
    if (forceRefresh) {
        pluginInstalledCache.delete(ideType);
        pluginInstalledPromiseCache.delete(ideType);
    }
    return isJetBrainsPluginInstalledMemoized(ideType, forceRefresh);
}
/**
 * Returns the cached result of isJetBrainsPluginInstalled synchronously.
 * Returns false if the result hasn't been resolved yet.
 * Use this only in sync contexts (e.g., status notice isActive checks).
 */
function isJetBrainsPluginInstalledCachedSync(ideType) {
    return pluginInstalledCache.get(ideType) ?? false;
}
