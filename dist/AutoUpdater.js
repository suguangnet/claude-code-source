"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertMinVersion = assertMinVersion;
exports.getMaxVersion = getMaxVersion;
exports.getMaxVersionMessage = getMaxVersionMessage;
exports.shouldSkipVersion = shouldSkipVersion;
exports.getLockFilePath = getLockFilePath;
exports.checkGlobalInstallPermissions = checkGlobalInstallPermissions;
exports.getLatestVersion = getLatestVersion;
exports.getNpmDistTags = getNpmDistTags;
exports.getLatestVersionFromGcs = getLatestVersionFromGcs;
exports.getGcsDistTags = getGcsDistTags;
exports.getVersionHistory = getVersionHistory;
exports.installGlobalPackage = installGlobalPackage;
const axios_1 = __importDefault(require("axios"));
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const os_1 = require("os");
const path_1 = require("path");
const growthbook_js_1 = require("src/services/analytics/growthbook.js");
const index_js_1 = require("src/services/analytics/index.js");
const config_js_1 = require("./config.js");
const debug_js_1 = require("./debug.js");
const env_js_1 = require("./env.js");
const envUtils_js_1 = require("./envUtils.js");
const errors_js_1 = require("./errors.js");
const execFileNoThrow_js_1 = require("./execFileNoThrow.js");
const fsOperations_js_1 = require("./fsOperations.js");
const gracefulShutdown_js_1 = require("./gracefulShutdown.js");
const log_js_1 = require("./log.js");
const semver_js_1 = require("./semver.js");
const settings_js_1 = require("./settings/settings.js");
const shellConfig_js_1 = require("./shellConfig.js");
const slowOperations_js_1 = require("./slowOperations.js");
const GCS_BUCKET_URL = 'https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases';
class AutoUpdaterError extends errors_js_1.ClaudeError {
}
/**
 * Checks if the current version meets the minimum required version from Statsig config
 * Terminates the process with an error message if the version is too old
 *
 * NOTE ON SHA-BASED VERSIONING:
 * We use SemVer-compliant versioning with build metadata format (X.X.X+SHA) for continuous deployment.
 * According to SemVer specs, build metadata (the +SHA part) is ignored when comparing versions.
 *
 * Versioning approach:
 * 1. For version requirements/compatibility (assertMinVersion), we use semver comparison that ignores build metadata
 * 2. For updates ('claude update'), we use exact string comparison to detect any change, including SHA
 *    - This ensures users always get the latest build, even when only the SHA changes
 *    - The UI clearly shows both versions including build metadata
 *
 * This approach keeps version comparison logic simple while maintaining traceability via the SHA.
 */
async function assertMinVersion() {
    if (process.env.NODE_ENV === 'test') {
        return;
    }
    try {
        const versionConfig = await (0, growthbook_js_1.getDynamicConfig_BLOCKS_ON_INIT)('tengu_version_config', { minVersion: '0.0.0' });
        if (versionConfig.minVersion &&
            (0, semver_js_1.lt)(MACRO.VERSION, versionConfig.minVersion)) {
            // biome-ignore lint/suspicious/noConsole:: intentional console output
            console.error(`
It looks like your version of Claude Code (${MACRO.VERSION}) needs an update.
A newer version (${versionConfig.minVersion} or higher) is required to continue.

To update, please run:
    claude update

This will ensure you have access to the latest features and improvements.
`);
            (0, gracefulShutdown_js_1.gracefulShutdownSync)(1);
        }
    }
    catch (error) {
        (0, log_js_1.logError)(error);
    }
}
/**
 * Returns the maximum allowed version for the current user type.
 * For ants, returns the `ant` field (dev version format).
 * For external users, returns the `external` field (clean semver).
 * This is used as a server-side kill switch to pause auto-updates during incidents.
 * Returns undefined if no cap is configured.
 */
async function getMaxVersion() {
    const config = await getMaxVersionConfig();
    if (process.env.USER_TYPE === 'ant') {
        return config.ant || undefined;
    }
    return config.external || undefined;
}
/**
 * Returns the server-driven message explaining the known issue, if configured.
 * Shown in the warning banner when the current version exceeds the max allowed version.
 */
async function getMaxVersionMessage() {
    const config = await getMaxVersionConfig();
    if (process.env.USER_TYPE === 'ant') {
        return config.ant_message || undefined;
    }
    return config.external_message || undefined;
}
async function getMaxVersionConfig() {
    try {
        return await (0, growthbook_js_1.getDynamicConfig_BLOCKS_ON_INIT)('tengu_max_version_config', {});
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return {};
    }
}
/**
 * Checks if a target version should be skipped due to user's minimumVersion setting.
 * This is used when switching to stable channel - the user can choose to stay on their
 * current version until stable catches up, preventing downgrades.
 */
function shouldSkipVersion(targetVersion) {
    const settings = (0, settings_js_1.getInitialSettings)();
    const minimumVersion = settings?.minimumVersion;
    if (!minimumVersion) {
        return false;
    }
    // Skip if target version is less than minimum
    const shouldSkip = !(0, semver_js_1.gte)(targetVersion, minimumVersion);
    if (shouldSkip) {
        (0, debug_js_1.logForDebugging)(`Skipping update to ${targetVersion} - below minimumVersion ${minimumVersion}`);
    }
    return shouldSkip;
}
// Lock file for auto-updater to prevent concurrent updates
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minute timeout for locks
/**
 * Get the path to the lock file
 * This is a function to ensure it's evaluated at runtime after test setup
 */
function getLockFilePath() {
    return (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), '.update.lock');
}
/**
 * Attempts to acquire a lock for auto-updater
 * @returns true if lock was acquired, false if another process holds the lock
 */
async function acquireLock() {
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    const lockPath = getLockFilePath();
    // Check for existing lock: 1 stat() on the happy path (fresh lock or ENOENT),
    // 2 on stale-lock recovery (re-verify staleness immediately before unlink).
    try {
        const stats = await fs.stat(lockPath);
        const age = Date.now() - stats.mtimeMs;
        if (age < LOCK_TIMEOUT_MS) {
            return false;
        }
        // Lock is stale, remove it before taking over. Re-verify staleness
        // immediately before unlinking to close a TOCTOU race: if two processes
        // both observe the stale lock, A unlinks + writes a fresh lock, then B
        // would unlink A's fresh lock and both believe they hold it. A fresh
        // lock has a recent mtime, so re-checking staleness makes B back off.
        try {
            const recheck = await fs.stat(lockPath);
            if (Date.now() - recheck.mtimeMs < LOCK_TIMEOUT_MS) {
                return false;
            }
            await fs.unlink(lockPath);
        }
        catch (err) {
            if (!(0, errors_js_1.isENOENT)(err)) {
                (0, log_js_1.logError)(err);
                return false;
            }
        }
    }
    catch (err) {
        if (!(0, errors_js_1.isENOENT)(err)) {
            (0, log_js_1.logError)(err);
            return false;
        }
        // ENOENT: no lock file, proceed to create one
    }
    // Create lock file atomically with O_EXCL (flag: 'wx'). If another process
    // wins the race and creates it first, we get EEXIST and back off.
    // Lazy-mkdir the config dir on ENOENT.
    try {
        await (0, promises_1.writeFile)(lockPath, `${process.pid}`, {
            encoding: 'utf8',
            flag: 'wx',
        });
        return true;
    }
    catch (err) {
        const code = (0, errors_js_1.getErrnoCode)(err);
        if (code === 'EEXIST') {
            return false;
        }
        if (code === 'ENOENT') {
            try {
                // fs.mkdir from getFsImplementation() is always recursive:true and
                // swallows EEXIST internally, so a dir-creation race cannot reach the
                // catch below — only writeFile's EEXIST (true lock contention) can.
                await fs.mkdir((0, envUtils_js_1.getClaudeConfigHomeDir)());
                await (0, promises_1.writeFile)(lockPath, `${process.pid}`, {
                    encoding: 'utf8',
                    flag: 'wx',
                });
                return true;
            }
            catch (mkdirErr) {
                if ((0, errors_js_1.getErrnoCode)(mkdirErr) === 'EEXIST') {
                    return false;
                }
                (0, log_js_1.logError)(mkdirErr);
                return false;
            }
        }
        (0, log_js_1.logError)(err);
        return false;
    }
}
/**
 * Releases the update lock if it's held by this process
 */
async function releaseLock() {
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    const lockPath = getLockFilePath();
    try {
        const lockData = await fs.readFile(lockPath, { encoding: 'utf8' });
        if (lockData === `${process.pid}`) {
            await fs.unlink(lockPath);
        }
    }
    catch (err) {
        if ((0, errors_js_1.isENOENT)(err)) {
            return;
        }
        (0, log_js_1.logError)(err);
    }
}
async function getInstallationPrefix() {
    // Run from home directory to avoid reading project-level .npmrc/.bunfig.toml
    const isBun = env_js_1.env.isRunningWithBun();
    let prefixResult = null;
    if (isBun) {
        prefixResult = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)('bun', ['pm', 'bin', '-g'], {
            cwd: (0, os_1.homedir)(),
        });
    }
    else {
        prefixResult = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)('npm', ['-g', 'config', 'get', 'prefix'], { cwd: (0, os_1.homedir)() });
    }
    if (prefixResult.code !== 0) {
        (0, log_js_1.logError)(new Error(`Failed to check ${isBun ? 'bun' : 'npm'} permissions`));
        return null;
    }
    return prefixResult.stdout.trim();
}
async function checkGlobalInstallPermissions() {
    try {
        const prefix = await getInstallationPrefix();
        if (!prefix) {
            return { hasPermissions: false, npmPrefix: null };
        }
        try {
            await (0, promises_1.access)(prefix, fs_1.constants.W_OK);
            return { hasPermissions: true, npmPrefix: prefix };
        }
        catch {
            (0, log_js_1.logError)(new AutoUpdaterError('Insufficient permissions for global npm install.'));
            return { hasPermissions: false, npmPrefix: prefix };
        }
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return { hasPermissions: false, npmPrefix: null };
    }
}
async function getLatestVersion(channel) {
    const npmTag = channel === 'stable' ? 'stable' : 'latest';
    // Run from home directory to avoid reading project-level .npmrc
    // which could be maliciously crafted to redirect to an attacker's registry
    const result = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)('npm', ['view', `${MACRO.PACKAGE_URL}@${npmTag}`, 'version', '--prefer-online'], { abortSignal: AbortSignal.timeout(5000), cwd: (0, os_1.homedir)() });
    if (result.code !== 0) {
        (0, debug_js_1.logForDebugging)(`npm view failed with code ${result.code}`);
        if (result.stderr) {
            (0, debug_js_1.logForDebugging)(`npm stderr: ${result.stderr.trim()}`);
        }
        else {
            (0, debug_js_1.logForDebugging)('npm stderr: (empty)');
        }
        if (result.stdout) {
            (0, debug_js_1.logForDebugging)(`npm stdout: ${result.stdout.trim()}`);
        }
        return null;
    }
    return result.stdout.trim();
}
/**
 * Get npm dist-tags (latest and stable versions) from the registry.
 * This is used by the doctor command to show users what versions are available.
 */
async function getNpmDistTags() {
    // Run from home directory to avoid reading project-level .npmrc
    const result = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)('npm', ['view', MACRO.PACKAGE_URL, 'dist-tags', '--json', '--prefer-online'], { abortSignal: AbortSignal.timeout(5000), cwd: (0, os_1.homedir)() });
    if (result.code !== 0) {
        (0, debug_js_1.logForDebugging)(`npm view dist-tags failed with code ${result.code}`);
        return { latest: null, stable: null };
    }
    try {
        const parsed = (0, slowOperations_js_1.jsonParse)(result.stdout.trim());
        return {
            latest: typeof parsed.latest === 'string' ? parsed.latest : null,
            stable: typeof parsed.stable === 'string' ? parsed.stable : null,
        };
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`Failed to parse dist-tags: ${error}`);
        return { latest: null, stable: null };
    }
}
/**
 * Get the latest version from GCS bucket for a given release channel.
 * This is used by installations that don't have npm (e.g. package manager installs).
 */
async function getLatestVersionFromGcs(channel) {
    try {
        const response = await axios_1.default.get(`${GCS_BUCKET_URL}/${channel}`, {
            timeout: 5000,
            responseType: 'text',
        });
        return response.data.trim();
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`Failed to fetch ${channel} from GCS: ${error}`);
        return null;
    }
}
/**
 * Get available versions from GCS bucket (for native installations).
 * Fetches both latest and stable channel pointers.
 */
async function getGcsDistTags() {
    const [latest, stable] = await Promise.all([
        getLatestVersionFromGcs('latest'),
        getLatestVersionFromGcs('stable'),
    ]);
    return { latest, stable };
}
/**
 * Get version history from npm registry (ant-only feature)
 * Returns versions sorted newest-first, limited to the specified count
 *
 * Uses NATIVE_PACKAGE_URL when available because:
 * 1. Native installation is the primary installation method for ant users
 * 2. Not all JS package versions have corresponding native packages
 * 3. This prevents rollback from listing versions that don't have native binaries
 */
async function getVersionHistory(limit) {
    if (process.env.USER_TYPE !== 'ant') {
        return [];
    }
    // Use native package URL when available to ensure we only show versions
    // that have native binaries (not all JS package versions have native builds)
    const packageUrl = MACRO.NATIVE_PACKAGE_URL ?? MACRO.PACKAGE_URL;
    // Run from home directory to avoid reading project-level .npmrc
    const result = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)('npm', ['view', packageUrl, 'versions', '--json', '--prefer-online'], 
    // Longer timeout for version list
    { abortSignal: AbortSignal.timeout(30000), cwd: (0, os_1.homedir)() });
    if (result.code !== 0) {
        (0, debug_js_1.logForDebugging)(`npm view versions failed with code ${result.code}`);
        if (result.stderr) {
            (0, debug_js_1.logForDebugging)(`npm stderr: ${result.stderr.trim()}`);
        }
        return [];
    }
    try {
        const versions = (0, slowOperations_js_1.jsonParse)(result.stdout.trim());
        // Take last N versions, then reverse to get newest first
        return versions.slice(-limit).reverse();
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`Failed to parse version history: ${error}`);
        return [];
    }
}
async function installGlobalPackage(specificVersion) {
    if (!(await acquireLock())) {
        (0, log_js_1.logError)(new AutoUpdaterError('Another process is currently installing an update'));
        // Log the lock contention
        (0, index_js_1.logEvent)('tengu_auto_updater_lock_contention', {
            pid: process.pid,
            currentVersion: MACRO.VERSION,
        });
        return 'in_progress';
    }
    try {
        await removeClaudeAliasesFromShellConfigs();
        // Check if we're using npm from Windows path in WSL
        if (!env_js_1.env.isRunningWithBun() && env_js_1.env.isNpmFromWindowsPath()) {
            (0, log_js_1.logError)(new Error('Windows NPM detected in WSL environment'));
            (0, index_js_1.logEvent)('tengu_auto_updater_windows_npm_in_wsl', {
                currentVersion: MACRO.VERSION,
            });
            // biome-ignore lint/suspicious/noConsole:: intentional console output
            console.error(`
Error: Windows NPM detected in WSL

You're running Claude Code in WSL but using the Windows NPM installation from /mnt/c/.
This configuration is not supported for updates.

To fix this issue:
  1. Install Node.js within your Linux distribution: e.g. sudo apt install nodejs npm
  2. Make sure Linux NPM is in your PATH before the Windows version
  3. Try updating again with 'claude update'
`);
            return 'install_failed';
        }
        const { hasPermissions } = await checkGlobalInstallPermissions();
        if (!hasPermissions) {
            return 'no_permissions';
        }
        // Use specific version if provided, otherwise use latest
        const packageSpec = specificVersion
            ? `${MACRO.PACKAGE_URL}@${specificVersion}`
            : MACRO.PACKAGE_URL;
        // Run from home directory to avoid reading project-level .npmrc/.bunfig.toml
        // which could be maliciously crafted to redirect to an attacker's registry
        const packageManager = env_js_1.env.isRunningWithBun() ? 'bun' : 'npm';
        const installResult = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)(packageManager, ['install', '-g', packageSpec], { cwd: (0, os_1.homedir)() });
        if (installResult.code !== 0) {
            const error = new AutoUpdaterError(`Failed to install new version of claude: ${installResult.stdout} ${installResult.stderr}`);
            (0, log_js_1.logError)(error);
            return 'install_failed';
        }
        // Set installMethod to 'global' to track npm global installations
        (0, config_js_1.saveGlobalConfig)(current => ({
            ...current,
            installMethod: 'global',
        }));
        return 'success';
    }
    finally {
        // Ensure we always release the lock
        await releaseLock();
    }
}
/**
 * Remove claude aliases from shell configuration files
 * This helps clean up old installation methods when switching to native or npm global
 */
async function removeClaudeAliasesFromShellConfigs() {
    const configMap = (0, shellConfig_js_1.getShellConfigPaths)();
    // Process each shell config file
    for (const [, configFile] of Object.entries(configMap)) {
        try {
            const lines = await (0, shellConfig_js_1.readFileLines)(configFile);
            if (!lines)
                continue;
            const { filtered, hadAlias } = (0, shellConfig_js_1.filterClaudeAliases)(lines);
            if (hadAlias) {
                await (0, shellConfig_js_1.writeFileLines)(configFile, filtered);
                (0, debug_js_1.logForDebugging)(`Removed claude alias from ${configFile}`);
            }
        }
        catch (error) {
            // Don't fail the whole operation if one file can't be processed
            (0, debug_js_1.logForDebugging)(`Failed to remove alias from ${configFile}: ${error}`, {
                level: 'error',
            });
        }
    }
}
