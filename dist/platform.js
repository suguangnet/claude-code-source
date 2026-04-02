"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLinuxDistroInfo = exports.getWslVersion = exports.getPlatform = exports.SUPPORTED_PLATFORMS = void 0;
exports.detectVcs = detectVcs;
const promises_1 = require("fs/promises");
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const os_1 = require("os");
const fsOperations_js_1 = require("./fsOperations.js");
const log_js_1 = require("./log.js");
exports.SUPPORTED_PLATFORMS = ['macos', 'wsl'];
exports.getPlatform = (0, memoize_js_1.default)(() => {
    try {
        if (process.platform === 'darwin') {
            return 'macos';
        }
        if (process.platform === 'win32') {
            return 'windows';
        }
        if (process.platform === 'linux') {
            // Check if running in WSL (Windows Subsystem for Linux)
            try {
                const procVersion = (0, fsOperations_js_1.getFsImplementation)().readFileSync('/proc/version', { encoding: 'utf8' });
                if (procVersion.toLowerCase().includes('microsoft') ||
                    procVersion.toLowerCase().includes('wsl')) {
                    return 'wsl';
                }
            }
            catch (error) {
                // Error reading /proc/version, assume regular Linux
                (0, log_js_1.logError)(error);
            }
            // Regular Linux
            return 'linux';
        }
        // Unknown platform
        return 'unknown';
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return 'unknown';
    }
});
exports.getWslVersion = (0, memoize_js_1.default)(() => {
    // Only check for WSL on Linux systems
    if (process.platform !== 'linux') {
        return undefined;
    }
    try {
        const procVersion = (0, fsOperations_js_1.getFsImplementation)().readFileSync('/proc/version', {
            encoding: 'utf8',
        });
        // First check for explicit WSL version markers (e.g., "WSL2", "WSL3", etc.)
        const wslVersionMatch = procVersion.match(/WSL(\d+)/i);
        if (wslVersionMatch && wslVersionMatch[1]) {
            return wslVersionMatch[1];
        }
        // If no explicit WSL version but contains Microsoft, assume WSL1
        // This handles the original WSL1 format: "4.4.0-19041-Microsoft"
        if (procVersion.toLowerCase().includes('microsoft')) {
            return '1';
        }
        // Not WSL or unable to determine version
        return undefined;
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return undefined;
    }
});
exports.getLinuxDistroInfo = (0, memoize_js_1.default)(async () => {
    if (process.platform !== 'linux') {
        return undefined;
    }
    const result = {
        linuxKernel: (0, os_1.release)(),
    };
    try {
        const content = await (0, promises_1.readFile)('/etc/os-release', 'utf8');
        for (const line of content.split('\n')) {
            const match = line.match(/^(ID|VERSION_ID)=(.*)$/);
            if (match && match[1] && match[2]) {
                const value = match[2].replace(/^"|"$/g, '');
                if (match[1] === 'ID') {
                    result.linuxDistroId = value;
                }
                else {
                    result.linuxDistroVersion = value;
                }
            }
        }
    }
    catch {
        // /etc/os-release may not exist on all Linux systems
    }
    return result;
});
const VCS_MARKERS = [
    ['.git', 'git'],
    ['.hg', 'mercurial'],
    ['.svn', 'svn'],
    ['.p4config', 'perforce'],
    ['$tf', 'tfs'],
    ['.tfvc', 'tfs'],
    ['.jj', 'jujutsu'],
    ['.sl', 'sapling'],
];
async function detectVcs(dir) {
    const detected = new Set();
    // Check for Perforce via env var
    if (process.env.P4PORT) {
        detected.add('perforce');
    }
    try {
        const targetDir = dir ?? (0, fsOperations_js_1.getFsImplementation)().cwd();
        const entries = new Set(await (0, promises_1.readdir)(targetDir));
        for (const [marker, vcs] of VCS_MARKERS) {
            if (entries.has(marker)) {
                detected.add(vcs);
            }
        }
    }
    catch {
        // Directory may not be readable
    }
    return [...detected];
}
