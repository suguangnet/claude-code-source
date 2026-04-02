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
exports.posixPathToWindowsPath = exports.windowsPathToPosixPath = exports.findGitBashPath = void 0;
exports.setShellIfWindows = setShellIfWindows;
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const path = __importStar(require("path"));
const pathWin32 = __importStar(require("path/win32"));
const cwd_js_1 = require("./cwd.js");
const debug_js_1 = require("./debug.js");
const execSyncWrapper_js_1 = require("./execSyncWrapper.js");
const memoize_js_2 = require("./memoize.js");
const platform_js_1 = require("./platform.js");
/**
 * Check if a file or directory exists on Windows using the dir command
 * @param path - The path to check
 * @returns true if the path exists, false otherwise
 */
function checkPathExists(path) {
    try {
        (0, execSyncWrapper_js_1.execSync_DEPRECATED)(`dir "${path}"`, { stdio: 'pipe' });
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Find an executable using where.exe on Windows
 * @param executable - The name of the executable to find
 * @returns The path to the executable or null if not found
 */
function findExecutable(executable) {
    // For git, check common installation locations first
    if (executable === 'git') {
        const defaultLocations = [
            // check 64 bit before 32 bit
            'C:\\Program Files\\Git\\cmd\\git.exe',
            'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
            // intentionally don't look for C:\Program Files\Git\mingw64\bin\git.exe
            // because that directory is the "raw" tools with no environment setup
        ];
        for (const location of defaultLocations) {
            if (checkPathExists(location)) {
                return location;
            }
        }
    }
    // Fall back to where.exe
    try {
        const result = (0, execSyncWrapper_js_1.execSync_DEPRECATED)(`where.exe ${executable}`, {
            stdio: 'pipe',
            encoding: 'utf8',
        }).trim();
        // SECURITY: Filter out any results from the current directory
        // to prevent executing malicious git.bat/cmd/exe files
        const paths = result.split('\r\n').filter(Boolean);
        const cwd = (0, cwd_js_1.getCwd)().toLowerCase();
        for (const candidatePath of paths) {
            // Normalize and compare paths to ensure we're not in current directory
            const normalizedPath = path.resolve(candidatePath).toLowerCase();
            const pathDir = path.dirname(normalizedPath).toLowerCase();
            // Skip if the executable is in the current working directory
            if (pathDir === cwd || normalizedPath.startsWith(cwd + path.sep)) {
                (0, debug_js_1.logForDebugging)(`Skipping potentially malicious executable in current directory: ${candidatePath}`);
                continue;
            }
            // Return the first valid path that's not in the current directory
            return candidatePath;
        }
        return null;
    }
    catch {
        return null;
    }
}
/**
 * If Windows, set the SHELL environment variable to git-bash path.
 * This is used by BashTool and Shell.ts for user shell commands.
 * COMSPEC is left unchanged for system process execution.
 */
function setShellIfWindows() {
    if ((0, platform_js_1.getPlatform)() === 'windows') {
        const gitBashPath = (0, exports.findGitBashPath)();
        process.env.SHELL = gitBashPath;
        (0, debug_js_1.logForDebugging)(`Using bash path: "${gitBashPath}"`);
    }
}
/**
 * Find the path where `bash.exe` included with git-bash exists, exiting the process if not found.
 */
exports.findGitBashPath = (0, memoize_js_1.default)(() => {
    if (process.env.CLAUDE_CODE_GIT_BASH_PATH) {
        if (checkPathExists(process.env.CLAUDE_CODE_GIT_BASH_PATH)) {
            return process.env.CLAUDE_CODE_GIT_BASH_PATH;
        }
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.error(`Claude Code was unable to find CLAUDE_CODE_GIT_BASH_PATH path "${process.env.CLAUDE_CODE_GIT_BASH_PATH}"`);
        // eslint-disable-next-line custom-rules/no-process-exit
        process.exit(1);
    }
    const gitPath = findExecutable('git');
    if (gitPath) {
        const bashPath = pathWin32.join(gitPath, '..', '..', 'bin', 'bash.exe');
        if (checkPathExists(bashPath)) {
            return bashPath;
        }
    }
    // biome-ignore lint/suspicious/noConsole:: intentional console output
    console.error('Claude Code on Windows requires git-bash (https://git-scm.com/downloads/win). If installed but not in PATH, set environment variable pointing to your bash.exe, similar to: CLAUDE_CODE_GIT_BASH_PATH=C:\\Program Files\\Git\\bin\\bash.exe');
    // eslint-disable-next-line custom-rules/no-process-exit
    process.exit(1);
});
/** Convert a Windows path to a POSIX path using pure JS. */
exports.windowsPathToPosixPath = (0, memoize_js_2.memoizeWithLRU)((windowsPath) => {
    // Handle UNC paths: \\server\share -> //server/share
    if (windowsPath.startsWith('\\\\')) {
        return windowsPath.replace(/\\/g, '/');
    }
    // Handle drive letter paths: C:\Users\foo -> /c/Users/foo
    const match = windowsPath.match(/^([A-Za-z]):[/\\]/);
    if (match) {
        const driveLetter = match[1].toLowerCase();
        return '/' + driveLetter + windowsPath.slice(2).replace(/\\/g, '/');
    }
    // Already POSIX or relative — just flip slashes
    return windowsPath.replace(/\\/g, '/');
}, (p) => p, 500);
/** Convert a POSIX path to a Windows path using pure JS. */
exports.posixPathToWindowsPath = (0, memoize_js_2.memoizeWithLRU)((posixPath) => {
    // Handle UNC paths: //server/share -> \\server\share
    if (posixPath.startsWith('//')) {
        return posixPath.replace(/\//g, '\\');
    }
    // Handle /cygdrive/c/... format
    const cygdriveMatch = posixPath.match(/^\/cygdrive\/([A-Za-z])(\/|$)/);
    if (cygdriveMatch) {
        const driveLetter = cygdriveMatch[1].toUpperCase();
        const rest = posixPath.slice(('/cygdrive/' + cygdriveMatch[1]).length);
        return driveLetter + ':' + (rest || '\\').replace(/\//g, '\\');
    }
    // Handle /c/... format (MSYS2/Git Bash)
    const driveMatch = posixPath.match(/^\/([A-Za-z])(\/|$)/);
    if (driveMatch) {
        const driveLetter = driveMatch[1].toUpperCase();
        const rest = posixPath.slice(2);
        return driveLetter + ':' + (rest || '\\').replace(/\//g, '\\');
    }
    // Already Windows or relative — just flip slashes
    return posixPath.replace(/\//g, '\\');
}, (p) => p, 500);
