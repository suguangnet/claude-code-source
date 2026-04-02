"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentInstallationType = getCurrentInstallationType;
exports.getInvokedBinary = getInvokedBinary;
exports.detectLinuxGlobPatternWarnings = detectLinuxGlobPatternWarnings;
exports.getDoctorDiagnostic = getDoctorDiagnostic;
const execa_1 = require("execa");
const promises_1 = require("fs/promises");
const os_1 = require("os");
const path_1 = require("path");
const autoUpdater_js_1 = require("./autoUpdater.js");
const bundledMode_js_1 = require("./bundledMode.js");
const config_js_1 = require("./config.js");
const cwd_js_1 = require("./cwd.js");
const envUtils_js_1 = require("./envUtils.js");
const execFileNoThrow_js_1 = require("./execFileNoThrow.js");
const fsOperations_js_1 = require("./fsOperations.js");
const localInstaller_js_1 = require("./localInstaller.js");
const packageManagers_js_1 = require("./nativeInstaller/packageManagers.js");
const platform_js_1 = require("./platform.js");
const ripgrep_js_1 = require("./ripgrep.js");
const sandbox_adapter_js_1 = require("./sandbox/sandbox-adapter.js");
const managedPath_js_1 = require("./settings/managedPath.js");
const types_js_1 = require("./settings/types.js");
const shellConfig_js_1 = require("./shellConfig.js");
const slowOperations_js_1 = require("./slowOperations.js");
const which_js_1 = require("./which.js");
function getNormalizedPaths() {
    let invokedPath = process.argv[1] || '';
    let execPath = process.execPath || process.argv[0] || '';
    // On Windows, convert backslashes to forward slashes for consistent path matching
    if ((0, platform_js_1.getPlatform)() === 'windows') {
        invokedPath = invokedPath.split(path_1.win32.sep).join(path_1.posix.sep);
        execPath = execPath.split(path_1.win32.sep).join(path_1.posix.sep);
    }
    return [invokedPath, execPath];
}
async function getCurrentInstallationType() {
    if (process.env.NODE_ENV === 'development') {
        return 'development';
    }
    const [invokedPath] = getNormalizedPaths();
    // Check if running in bundled mode first
    if ((0, bundledMode_js_1.isInBundledMode)()) {
        // Check if this bundled instance was installed by a package manager
        if ((0, packageManagers_js_1.detectHomebrew)() ||
            (0, packageManagers_js_1.detectWinget)() ||
            (0, packageManagers_js_1.detectMise)() ||
            (0, packageManagers_js_1.detectAsdf)() ||
            (await (0, packageManagers_js_1.detectPacman)()) ||
            (await (0, packageManagers_js_1.detectDeb)()) ||
            (await (0, packageManagers_js_1.detectRpm)()) ||
            (await (0, packageManagers_js_1.detectApk)())) {
            return 'package-manager';
        }
        return 'native';
    }
    // Check if running from local npm installation
    if ((0, localInstaller_js_1.isRunningFromLocalInstallation)()) {
        return 'npm-local';
    }
    // Check if we're in a typical npm global location
    const npmGlobalPaths = [
        '/usr/local/lib/node_modules',
        '/usr/lib/node_modules',
        '/opt/homebrew/lib/node_modules',
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/.nvm/versions/node/', // nvm installations
    ];
    if (npmGlobalPaths.some(path => invokedPath.includes(path))) {
        return 'npm-global';
    }
    // Also check for npm/nvm in the path even if not in standard locations
    if (invokedPath.includes('/npm/') || invokedPath.includes('/nvm/')) {
        return 'npm-global';
    }
    const npmConfigResult = await (0, execa_1.execa)('npm config get prefix', {
        shell: true,
        reject: false,
    });
    const globalPrefix = npmConfigResult.exitCode === 0 ? npmConfigResult.stdout.trim() : null;
    if (globalPrefix && invokedPath.startsWith(globalPrefix)) {
        return 'npm-global';
    }
    // If we can't determine, return unknown
    return 'unknown';
}
async function getInstallationPath() {
    if (process.env.NODE_ENV === 'development') {
        return (0, cwd_js_1.getCwd)();
    }
    // For bundled/native builds, show the binary location
    if ((0, bundledMode_js_1.isInBundledMode)()) {
        // Try to find the actual binary that was invoked
        try {
            return await (0, promises_1.realpath)(process.execPath);
        }
        catch {
            // This function doesn't expect errors
        }
        try {
            const path = await (0, which_js_1.which)('claude');
            if (path) {
                return path;
            }
        }
        catch {
            // This function doesn't expect errors
        }
        // If we can't find it, check common locations
        try {
            await (0, fsOperations_js_1.getFsImplementation)().stat((0, path_1.join)((0, os_1.homedir)(), '.local/bin/claude'));
            return (0, path_1.join)((0, os_1.homedir)(), '.local/bin/claude');
        }
        catch {
            // Not found
        }
        return 'native';
    }
    // For npm installations, use the path of the executable
    try {
        return process.argv[0] || 'unknown';
    }
    catch {
        return 'unknown';
    }
}
function getInvokedBinary() {
    try {
        // For bundled/compiled executables, show the actual binary path
        if ((0, bundledMode_js_1.isInBundledMode)()) {
            return process.execPath || 'unknown';
        }
        // For npm/development, show the script path
        return process.argv[1] || 'unknown';
    }
    catch {
        return 'unknown';
    }
}
async function detectMultipleInstallations() {
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    const installations = [];
    // Check for local installation
    const localPath = (0, path_1.join)((0, os_1.homedir)(), '.claude', 'local');
    if (await (0, localInstaller_js_1.localInstallationExists)()) {
        installations.push({ type: 'npm-local', path: localPath });
    }
    // Check for global npm installation
    const packagesToCheck = ['@anthropic-ai/claude-code'];
    if (MACRO.PACKAGE_URL && MACRO.PACKAGE_URL !== '@anthropic-ai/claude-code') {
        packagesToCheck.push(MACRO.PACKAGE_URL);
    }
    const npmResult = await (0, execFileNoThrow_js_1.execFileNoThrow)('npm', [
        '-g',
        'config',
        'get',
        'prefix',
    ]);
    if (npmResult.code === 0 && npmResult.stdout) {
        const npmPrefix = npmResult.stdout.trim();
        const isWindows = (0, platform_js_1.getPlatform)() === 'windows';
        // First check for active installations via bin/claude
        // Linux / macOS have prefix/bin/claude and prefix/lib/node_modules
        // Windows has prefix/claude and prefix/node_modules
        const globalBinPath = isWindows
            ? (0, path_1.join)(npmPrefix, 'claude')
            : (0, path_1.join)(npmPrefix, 'bin', 'claude');
        let globalBinExists = false;
        try {
            await fs.stat(globalBinPath);
            globalBinExists = true;
        }
        catch {
            // Not found
        }
        if (globalBinExists) {
            // Check if this is actually a Homebrew cask installation, not npm-global
            // When npm is installed via Homebrew, both can exist at /opt/homebrew/bin/claude
            // We need to resolve the symlink to see where it actually points
            let isCurrentHomebrewInstallation = false;
            try {
                // Resolve the symlink to get the actual target
                const realPath = await (0, promises_1.realpath)(globalBinPath);
                // If the symlink points to a Caskroom directory, it's a Homebrew cask
                // Only skip it if it's the same Homebrew installation we're currently running from
                if (realPath.includes('/Caskroom/')) {
                    isCurrentHomebrewInstallation = (0, packageManagers_js_1.detectHomebrew)();
                }
            }
            catch {
                // If we can't resolve the symlink, include it anyway
            }
            if (!isCurrentHomebrewInstallation) {
                installations.push({ type: 'npm-global', path: globalBinPath });
            }
        }
        else {
            // If no bin/claude exists, check for orphaned packages (no bin/claude symlink)
            for (const packageName of packagesToCheck) {
                const globalPackagePath = isWindows
                    ? (0, path_1.join)(npmPrefix, 'node_modules', packageName)
                    : (0, path_1.join)(npmPrefix, 'lib', 'node_modules', packageName);
                try {
                    await fs.stat(globalPackagePath);
                    installations.push({
                        type: 'npm-global-orphan',
                        path: globalPackagePath,
                    });
                }
                catch {
                    // Package not found
                }
            }
        }
    }
    // Check for native installation
    // Check common native installation paths
    const nativeBinPath = (0, path_1.join)((0, os_1.homedir)(), '.local', 'bin', 'claude');
    try {
        await fs.stat(nativeBinPath);
        installations.push({ type: 'native', path: nativeBinPath });
    }
    catch {
        // Not found
    }
    // Also check if config indicates native installation
    const config = (0, config_js_1.getGlobalConfig)();
    if (config.installMethod === 'native') {
        const nativeDataPath = (0, path_1.join)((0, os_1.homedir)(), '.local', 'share', 'claude');
        try {
            await fs.stat(nativeDataPath);
            if (!installations.some(i => i.type === 'native')) {
                installations.push({ type: 'native', path: nativeDataPath });
            }
        }
        catch {
            // Not found
        }
    }
    return installations;
}
async function detectConfigurationIssues(type) {
    const warnings = [];
    // Managed-settings forwards-compat: the schema preprocess silently drops
    // unknown strictPluginOnlyCustomization surface names so one future enum
    // value doesn't null out the entire policy file (settings.ts:101). But
    // admins should KNOW — read the raw file and diff. Runs before the
    // development-mode early return: this is config correctness, not an
    // install-path check, and it's useful to see during dev testing.
    try {
        const raw = await (0, promises_1.readFile)((0, path_1.join)((0, managedPath_js_1.getManagedFilePath)(), 'managed-settings.json'), 'utf-8');
        const parsed = (0, slowOperations_js_1.jsonParse)(raw);
        const field = parsed && typeof parsed === 'object'
            ? parsed.strictPluginOnlyCustomization
            : undefined;
        if (field !== undefined && typeof field !== 'boolean') {
            if (!Array.isArray(field)) {
                // .catch(undefined) in the schema silently drops this, so the rest
                // of managed settings survive — but the admin typed something
                // wrong (an object, a string, etc.).
                warnings.push({
                    issue: `managed-settings.json: strictPluginOnlyCustomization has an invalid value (expected true or an array, got ${typeof field})`,
                    fix: `The field is silently ignored (schema .catch rescues it). Set it to true, or an array of: ${types_js_1.CUSTOMIZATION_SURFACES.join(', ')}.`,
                });
            }
            else {
                const unknown = field.filter(x => typeof x === 'string' &&
                    !types_js_1.CUSTOMIZATION_SURFACES.includes(x));
                if (unknown.length > 0) {
                    warnings.push({
                        issue: `managed-settings.json: strictPluginOnlyCustomization has ${unknown.length} value(s) this client doesn't recognize: ${unknown.map(String).join(', ')}`,
                        fix: `These are silently ignored (forwards-compat). Known surfaces for this version: ${types_js_1.CUSTOMIZATION_SURFACES.join(', ')}. Either remove them, or this client is older than the managed-settings intended.`,
                    });
                }
            }
        }
    }
    catch {
        // ENOENT (no managed settings) / parse error — not this check's concern.
        // Parse errors are surfaced by the settings loader itself.
    }
    const config = (0, config_js_1.getGlobalConfig)();
    // Skip most warnings for development mode
    if (type === 'development') {
        return warnings;
    }
    // Check if ~/.local/bin is in PATH for native installations
    if (type === 'native') {
        const path = process.env.PATH || '';
        const pathDirectories = path.split(path_1.delimiter);
        const homeDir = (0, os_1.homedir)();
        const localBinPath = (0, path_1.join)(homeDir, '.local', 'bin');
        // On Windows, convert backslashes to forward slashes for consistent path matching
        let normalizedLocalBinPath = localBinPath;
        if ((0, platform_js_1.getPlatform)() === 'windows') {
            normalizedLocalBinPath = localBinPath.split(path_1.win32.sep).join(path_1.posix.sep);
        }
        // Check if ~/.local/bin is in PATH (handle both expanded and unexpanded forms)
        // Also handle trailing slashes that users may have in their PATH
        const localBinInPath = pathDirectories.some(dir => {
            let normalizedDir = dir;
            if ((0, platform_js_1.getPlatform)() === 'windows') {
                normalizedDir = dir.split(path_1.win32.sep).join(path_1.posix.sep);
            }
            // Remove trailing slashes for comparison (handles paths like /home/user/.local/bin/)
            const trimmedDir = normalizedDir.replace(/\/+$/, '');
            const trimmedRawDir = dir.replace(/[/\\]+$/, '');
            return (trimmedDir === normalizedLocalBinPath ||
                trimmedRawDir === '~/.local/bin' ||
                trimmedRawDir === '$HOME/.local/bin');
        });
        if (!localBinInPath) {
            const isWindows = (0, platform_js_1.getPlatform)() === 'windows';
            if (isWindows) {
                // Windows-specific PATH instructions
                const windowsLocalBinPath = localBinPath
                    .split(path_1.posix.sep)
                    .join(path_1.win32.sep);
                warnings.push({
                    issue: `Native installation exists but ${windowsLocalBinPath} is not in your PATH`,
                    fix: `Add it by opening: System Properties → Environment Variables → Edit User PATH → New → Add the path above. Then restart your terminal.`,
                });
            }
            else {
                // Unix-style PATH instructions
                const shellType = (0, localInstaller_js_1.getShellType)();
                const configPaths = (0, shellConfig_js_1.getShellConfigPaths)();
                const configFile = configPaths[shellType];
                const displayPath = configFile
                    ? configFile.replace((0, os_1.homedir)(), '~')
                    : 'your shell config file';
                warnings.push({
                    issue: 'Native installation exists but ~/.local/bin is not in your PATH',
                    fix: `Run: echo 'export PATH="$HOME/.local/bin:$PATH"' >> ${displayPath} then open a new terminal or run: source ${displayPath}`,
                });
            }
        }
    }
    // Check for configuration mismatches
    // Skip these checks if DISABLE_INSTALLATION_CHECKS is set (e.g., in HFI)
    if (!(0, envUtils_js_1.isEnvTruthy)(process.env.DISABLE_INSTALLATION_CHECKS)) {
        if (type === 'npm-local' && config.installMethod !== 'local') {
            warnings.push({
                issue: `Running from local installation but config install method is '${config.installMethod}'`,
                fix: 'Consider using native installation: claude install',
            });
        }
        if (type === 'native' && config.installMethod !== 'native') {
            warnings.push({
                issue: `Running native installation but config install method is '${config.installMethod}'`,
                fix: 'Run claude install to update configuration',
            });
        }
    }
    if (type === 'npm-global' && (await (0, localInstaller_js_1.localInstallationExists)())) {
        warnings.push({
            issue: 'Local installation exists but not being used',
            fix: 'Consider using native installation: claude install',
        });
    }
    const existingAlias = await (0, shellConfig_js_1.findClaudeAlias)();
    const validAlias = await (0, shellConfig_js_1.findValidClaudeAlias)();
    // Check if running local installation but it's not in PATH
    if (type === 'npm-local') {
        // Check if claude is already accessible via PATH
        const whichResult = await (0, which_js_1.which)('claude');
        const claudeInPath = !!whichResult;
        // Only show warning if claude is NOT in PATH AND no valid alias exists
        if (!claudeInPath && !validAlias) {
            if (existingAlias) {
                // Alias exists but points to invalid target
                warnings.push({
                    issue: 'Local installation not accessible',
                    fix: `Alias exists but points to invalid target: ${existingAlias}. Update alias: alias claude="~/.claude/local/claude"`,
                });
            }
            else {
                // No alias exists and not in PATH
                warnings.push({
                    issue: 'Local installation not accessible',
                    fix: 'Create alias: alias claude="~/.claude/local/claude"',
                });
            }
        }
    }
    return warnings;
}
function detectLinuxGlobPatternWarnings() {
    if ((0, platform_js_1.getPlatform)() !== 'linux') {
        return [];
    }
    const warnings = [];
    const globPatterns = sandbox_adapter_js_1.SandboxManager.getLinuxGlobPatternWarnings();
    if (globPatterns.length > 0) {
        // Show first 3 patterns, then indicate if there are more
        const displayPatterns = globPatterns.slice(0, 3).join(', ');
        const remaining = globPatterns.length - 3;
        const patternList = remaining > 0 ? `${displayPatterns} (${remaining} more)` : displayPatterns;
        warnings.push({
            issue: `Glob patterns in sandbox permission rules are not fully supported on Linux`,
            fix: `Found ${globPatterns.length} pattern(s): ${patternList}. On Linux, glob patterns in Edit/Read rules will be ignored.`,
        });
    }
    return warnings;
}
async function getDoctorDiagnostic() {
    const installationType = await getCurrentInstallationType();
    const version = typeof MACRO !== 'undefined' && MACRO.VERSION ? MACRO.VERSION : 'unknown';
    const installationPath = await getInstallationPath();
    const invokedBinary = getInvokedBinary();
    const multipleInstallations = await detectMultipleInstallations();
    const warnings = await detectConfigurationIssues(installationType);
    // Add glob pattern warnings for Linux sandboxing
    warnings.push(...detectLinuxGlobPatternWarnings());
    // Add warnings for leftover npm installations when running native
    if (installationType === 'native') {
        const npmInstalls = multipleInstallations.filter(i => i.type === 'npm-global' ||
            i.type === 'npm-global-orphan' ||
            i.type === 'npm-local');
        const isWindows = (0, platform_js_1.getPlatform)() === 'windows';
        for (const install of npmInstalls) {
            if (install.type === 'npm-global') {
                let uninstallCmd = 'npm -g uninstall @anthropic-ai/claude-code';
                if (MACRO.PACKAGE_URL &&
                    MACRO.PACKAGE_URL !== '@anthropic-ai/claude-code') {
                    uninstallCmd += ` && npm -g uninstall ${MACRO.PACKAGE_URL}`;
                }
                warnings.push({
                    issue: `Leftover npm global installation at ${install.path}`,
                    fix: `Run: ${uninstallCmd}`,
                });
            }
            else if (install.type === 'npm-global-orphan') {
                warnings.push({
                    issue: `Orphaned npm global package at ${install.path}`,
                    fix: isWindows
                        ? `Run: rmdir /s /q "${install.path}"`
                        : `Run: rm -rf ${install.path}`,
                });
            }
            else if (install.type === 'npm-local') {
                warnings.push({
                    issue: `Leftover npm local installation at ${install.path}`,
                    fix: isWindows
                        ? `Run: rmdir /s /q "${install.path}"`
                        : `Run: rm -rf ${install.path}`,
                });
            }
        }
    }
    const config = (0, config_js_1.getGlobalConfig)();
    // Get config values for display
    const configInstallMethod = config.installMethod || 'not set';
    // Check permissions for global installations
    let hasUpdatePermissions = null;
    if (installationType === 'npm-global') {
        const permCheck = await (0, autoUpdater_js_1.checkGlobalInstallPermissions)();
        hasUpdatePermissions = permCheck.hasPermissions;
        // Add warning if no permissions
        if (!hasUpdatePermissions && !(0, config_js_1.getAutoUpdaterDisabledReason)()) {
            warnings.push({
                issue: 'Insufficient permissions for auto-updates',
                fix: 'Do one of: (1) Re-install node without sudo, or (2) Use `claude install` for native installation',
            });
        }
    }
    // Get ripgrep status and configuration
    const ripgrepStatusRaw = (0, ripgrep_js_1.getRipgrepStatus)();
    // Provide simple ripgrep status info
    const ripgrepStatus = {
        working: ripgrepStatusRaw.working ?? true, // Assume working if not yet tested
        mode: ripgrepStatusRaw.mode,
        systemPath: ripgrepStatusRaw.mode === 'system' ? ripgrepStatusRaw.path : null,
    };
    // Get package manager info if running from package manager
    const packageManager = installationType === 'package-manager'
        ? await (0, packageManagers_js_1.getPackageManager)()
        : undefined;
    const diagnostic = {
        installationType,
        version,
        installationPath,
        invokedBinary,
        configInstallMethod,
        autoUpdates: (() => {
            const reason = (0, config_js_1.getAutoUpdaterDisabledReason)();
            return reason
                ? `disabled (${(0, config_js_1.formatAutoUpdaterDisabledReason)(reason)})`
                : 'enabled';
        })(),
        hasUpdatePermissions,
        multipleInstallations,
        warnings,
        packageManager,
        ripgrepStatus,
    };
    return diagnostic;
}
