"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSessionEnvDirPath = getSessionEnvDirPath;
exports.getHookEnvFilePath = getHookEnvFilePath;
exports.clearCwdEnvFiles = clearCwdEnvFiles;
exports.invalidateSessionEnvCache = invalidateSessionEnvCache;
exports.getSessionEnvironmentScript = getSessionEnvironmentScript;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const state_js_1 = require("../bootstrap/state.js");
const debug_js_1 = require("./debug.js");
const envUtils_js_1 = require("./envUtils.js");
const errors_js_1 = require("./errors.js");
const platform_js_1 = require("./platform.js");
// Cache states:
// undefined = not yet loaded (need to check disk)
// null = checked disk, no files exist (don't check again)
// string = loaded and cached (use cached value)
let sessionEnvScript = undefined;
async function getSessionEnvDirPath() {
    const sessionEnvDir = (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), 'session-env', (0, state_js_1.getSessionId)());
    await (0, promises_1.mkdir)(sessionEnvDir, { recursive: true });
    return sessionEnvDir;
}
async function getHookEnvFilePath(hookEvent, hookIndex) {
    const prefix = hookEvent.toLowerCase();
    return (0, path_1.join)(await getSessionEnvDirPath(), `${prefix}-hook-${hookIndex}.sh`);
}
async function clearCwdEnvFiles() {
    try {
        const dir = await getSessionEnvDirPath();
        const files = await (0, promises_1.readdir)(dir);
        await Promise.all(files
            .filter(f => (f.startsWith('filechanged-hook-') ||
            f.startsWith('cwdchanged-hook-')) &&
            HOOK_ENV_REGEX.test(f))
            .map(f => (0, promises_1.writeFile)((0, path_1.join)(dir, f), '')));
    }
    catch (e) {
        const code = (0, errors_js_1.getErrnoCode)(e);
        if (code !== 'ENOENT') {
            (0, debug_js_1.logForDebugging)(`Failed to clear cwd env files: ${(0, errors_js_1.errorMessage)(e)}`);
        }
    }
}
function invalidateSessionEnvCache() {
    (0, debug_js_1.logForDebugging)('Invalidating session environment cache');
    sessionEnvScript = undefined;
}
async function getSessionEnvironmentScript() {
    if ((0, platform_js_1.getPlatform)() === 'windows') {
        (0, debug_js_1.logForDebugging)('Session environment not yet supported on Windows');
        return null;
    }
    if (sessionEnvScript !== undefined) {
        return sessionEnvScript;
    }
    const scripts = [];
    // Check for CLAUDE_ENV_FILE passed from parent process (e.g., HFI trajectory runner)
    // This allows venv/conda activation to persist across shell commands
    const envFile = process.env.CLAUDE_ENV_FILE;
    if (envFile) {
        try {
            const envScript = (await (0, promises_1.readFile)(envFile, 'utf8')).trim();
            if (envScript) {
                scripts.push(envScript);
                (0, debug_js_1.logForDebugging)(`Session environment loaded from CLAUDE_ENV_FILE: ${envFile} (${envScript.length} chars)`);
            }
        }
        catch (e) {
            const code = (0, errors_js_1.getErrnoCode)(e);
            if (code !== 'ENOENT') {
                (0, debug_js_1.logForDebugging)(`Failed to read CLAUDE_ENV_FILE: ${(0, errors_js_1.errorMessage)(e)}`);
            }
        }
    }
    // Load hook environment files from session directory
    const sessionEnvDir = await getSessionEnvDirPath();
    try {
        const files = await (0, promises_1.readdir)(sessionEnvDir);
        // We are sorting the hook env files by the order in which they are listed
        // in the settings.json file so that the resulting env is deterministic
        const hookFiles = files
            .filter(f => HOOK_ENV_REGEX.test(f))
            .sort(sortHookEnvFiles);
        for (const file of hookFiles) {
            const filePath = (0, path_1.join)(sessionEnvDir, file);
            try {
                const content = (await (0, promises_1.readFile)(filePath, 'utf8')).trim();
                if (content) {
                    scripts.push(content);
                }
            }
            catch (e) {
                const code = (0, errors_js_1.getErrnoCode)(e);
                if (code !== 'ENOENT') {
                    (0, debug_js_1.logForDebugging)(`Failed to read hook file ${filePath}: ${(0, errors_js_1.errorMessage)(e)}`);
                }
            }
        }
        if (hookFiles.length > 0) {
            (0, debug_js_1.logForDebugging)(`Session environment loaded from ${hookFiles.length} hook file(s)`);
        }
    }
    catch (e) {
        const code = (0, errors_js_1.getErrnoCode)(e);
        if (code !== 'ENOENT') {
            (0, debug_js_1.logForDebugging)(`Failed to load session environment from hooks: ${(0, errors_js_1.errorMessage)(e)}`);
        }
    }
    if (scripts.length === 0) {
        (0, debug_js_1.logForDebugging)('No session environment scripts found');
        sessionEnvScript = null;
        return sessionEnvScript;
    }
    sessionEnvScript = scripts.join('\n');
    (0, debug_js_1.logForDebugging)(`Session environment script ready (${sessionEnvScript.length} chars total)`);
    return sessionEnvScript;
}
const HOOK_ENV_PRIORITY = {
    setup: 0,
    sessionstart: 1,
    cwdchanged: 2,
    filechanged: 3,
};
const HOOK_ENV_REGEX = /^(setup|sessionstart|cwdchanged|filechanged)-hook-(\d+)\.sh$/;
function sortHookEnvFiles(a, b) {
    const aMatch = a.match(HOOK_ENV_REGEX);
    const bMatch = b.match(HOOK_ENV_REGEX);
    const aType = aMatch?.[1] || '';
    const bType = bMatch?.[1] || '';
    if (aType !== bType) {
        return (HOOK_ENV_PRIORITY[aType] ?? 99) - (HOOK_ENV_PRIORITY[bType] ?? 99);
    }
    const aIndex = parseInt(aMatch?.[2] || '0', 10);
    const bIndex = parseInt(bMatch?.[2] || '0', 10);
    return aIndex - bIndex;
}
