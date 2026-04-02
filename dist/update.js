"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.update = update;
const chalk_1 = __importDefault(require("chalk"));
const index_js_1 = require("src/services/analytics/index.js");
const autoUpdater_js_1 = require("src/utils/autoUpdater.js");
const completionCache_js_1 = require("src/utils/completionCache.js");
const config_js_1 = require("src/utils/config.js");
const debug_js_1 = require("src/utils/debug.js");
const doctorDiagnostic_js_1 = require("src/utils/doctorDiagnostic.js");
const gracefulShutdown_js_1 = require("src/utils/gracefulShutdown.js");
const localInstaller_js_1 = require("src/utils/localInstaller.js");
const index_js_2 = require("src/utils/nativeInstaller/index.js");
const packageManagers_js_1 = require("src/utils/nativeInstaller/packageManagers.js");
const process_js_1 = require("src/utils/process.js");
const semver_js_1 = require("src/utils/semver.js");
const settings_js_1 = require("src/utils/settings/settings.js");
async function update() {
    (0, index_js_1.logEvent)('tengu_update_check', {});
    (0, process_js_1.writeToStdout)(`Current version: ${MACRO.VERSION}\n`);
    const channel = (0, settings_js_1.getInitialSettings)()?.autoUpdatesChannel ?? 'latest';
    (0, process_js_1.writeToStdout)(`Checking for updates to ${channel} version...\n`);
    (0, debug_js_1.logForDebugging)('update: Starting update check');
    // Run diagnostic to detect potential issues
    (0, debug_js_1.logForDebugging)('update: Running diagnostic');
    const diagnostic = await (0, doctorDiagnostic_js_1.getDoctorDiagnostic)();
    (0, debug_js_1.logForDebugging)(`update: Installation type: ${diagnostic.installationType}`);
    (0, debug_js_1.logForDebugging)(`update: Config install method: ${diagnostic.configInstallMethod}`);
    // Check for multiple installations
    if (diagnostic.multipleInstallations.length > 1) {
        (0, process_js_1.writeToStdout)('\n');
        (0, process_js_1.writeToStdout)(chalk_1.default.yellow('Warning: Multiple installations found') + '\n');
        for (const install of diagnostic.multipleInstallations) {
            const current = diagnostic.installationType === install.type
                ? ' (currently running)'
                : '';
            (0, process_js_1.writeToStdout)(`- ${install.type} at ${install.path}${current}\n`);
        }
    }
    // Display warnings if any exist
    if (diagnostic.warnings.length > 0) {
        (0, process_js_1.writeToStdout)('\n');
        for (const warning of diagnostic.warnings) {
            (0, debug_js_1.logForDebugging)(`update: Warning detected: ${warning.issue}`);
            // Don't skip PATH warnings - they're always relevant
            // The user needs to know that 'which claude' points elsewhere
            (0, debug_js_1.logForDebugging)(`update: Showing warning: ${warning.issue}`);
            (0, process_js_1.writeToStdout)(chalk_1.default.yellow(`Warning: ${warning.issue}\n`));
            (0, process_js_1.writeToStdout)(chalk_1.default.bold(`Fix: ${warning.fix}\n`));
        }
    }
    // Update config if installMethod is not set (but skip for package managers)
    const config = (0, config_js_1.getGlobalConfig)();
    if (!config.installMethod &&
        diagnostic.installationType !== 'package-manager') {
        (0, process_js_1.writeToStdout)('\n');
        (0, process_js_1.writeToStdout)('Updating configuration to track installation method...\n');
        let detectedMethod = 'unknown';
        // Map diagnostic installation type to config install method
        switch (diagnostic.installationType) {
            case 'npm-local':
                detectedMethod = 'local';
                break;
            case 'native':
                detectedMethod = 'native';
                break;
            case 'npm-global':
                detectedMethod = 'global';
                break;
            default:
                detectedMethod = 'unknown';
        }
        (0, config_js_1.saveGlobalConfig)(current => ({
            ...current,
            installMethod: detectedMethod,
        }));
        (0, process_js_1.writeToStdout)(`Installation method set to: ${detectedMethod}\n`);
    }
    // Check if running from development build
    if (diagnostic.installationType === 'development') {
        (0, process_js_1.writeToStdout)('\n');
        (0, process_js_1.writeToStdout)(chalk_1.default.yellow('Warning: Cannot update development build') + '\n');
        await (0, gracefulShutdown_js_1.gracefulShutdown)(1);
    }
    // Check if running from a package manager
    if (diagnostic.installationType === 'package-manager') {
        const packageManager = await (0, packageManagers_js_1.getPackageManager)();
        (0, process_js_1.writeToStdout)('\n');
        if (packageManager === 'homebrew') {
            (0, process_js_1.writeToStdout)('Claude is managed by Homebrew.\n');
            const latest = await (0, autoUpdater_js_1.getLatestVersion)(channel);
            if (latest && !(0, semver_js_1.gte)(MACRO.VERSION, latest)) {
                (0, process_js_1.writeToStdout)(`Update available: ${MACRO.VERSION} → ${latest}\n`);
                (0, process_js_1.writeToStdout)('\n');
                (0, process_js_1.writeToStdout)('To update, run:\n');
                (0, process_js_1.writeToStdout)(chalk_1.default.bold('  brew upgrade claude-code') + '\n');
            }
            else {
                (0, process_js_1.writeToStdout)('Claude is up to date!\n');
            }
        }
        else if (packageManager === 'winget') {
            (0, process_js_1.writeToStdout)('Claude is managed by winget.\n');
            const latest = await (0, autoUpdater_js_1.getLatestVersion)(channel);
            if (latest && !(0, semver_js_1.gte)(MACRO.VERSION, latest)) {
                (0, process_js_1.writeToStdout)(`Update available: ${MACRO.VERSION} → ${latest}\n`);
                (0, process_js_1.writeToStdout)('\n');
                (0, process_js_1.writeToStdout)('To update, run:\n');
                (0, process_js_1.writeToStdout)(chalk_1.default.bold('  winget upgrade Anthropic.ClaudeCode') + '\n');
            }
            else {
                (0, process_js_1.writeToStdout)('Claude is up to date!\n');
            }
        }
        else if (packageManager === 'apk') {
            (0, process_js_1.writeToStdout)('Claude is managed by apk.\n');
            const latest = await (0, autoUpdater_js_1.getLatestVersion)(channel);
            if (latest && !(0, semver_js_1.gte)(MACRO.VERSION, latest)) {
                (0, process_js_1.writeToStdout)(`Update available: ${MACRO.VERSION} → ${latest}\n`);
                (0, process_js_1.writeToStdout)('\n');
                (0, process_js_1.writeToStdout)('To update, run:\n');
                (0, process_js_1.writeToStdout)(chalk_1.default.bold('  apk upgrade claude-code') + '\n');
            }
            else {
                (0, process_js_1.writeToStdout)('Claude is up to date!\n');
            }
        }
        else {
            // pacman, deb, and rpm don't get specific commands because they each have
            // multiple frontends (pacman: yay/paru/makepkg, deb: apt/apt-get/aptitude/nala,
            // rpm: dnf/yum/zypper)
            (0, process_js_1.writeToStdout)('Claude is managed by a package manager.\n');
            (0, process_js_1.writeToStdout)('Please use your package manager to update.\n');
        }
        await (0, gracefulShutdown_js_1.gracefulShutdown)(0);
    }
    // Check for config/reality mismatch (skip for package-manager installs)
    if (config.installMethod &&
        diagnostic.configInstallMethod !== 'not set' &&
        diagnostic.installationType !== 'package-manager') {
        const runningType = diagnostic.installationType;
        const configExpects = diagnostic.configInstallMethod;
        // Map installation types for comparison
        const typeMapping = {
            'npm-local': 'local',
            'npm-global': 'global',
            native: 'native',
            development: 'development',
            unknown: 'unknown',
        };
        const normalizedRunningType = typeMapping[runningType] || runningType;
        if (normalizedRunningType !== configExpects &&
            configExpects !== 'unknown') {
            (0, process_js_1.writeToStdout)('\n');
            (0, process_js_1.writeToStdout)(chalk_1.default.yellow('Warning: Configuration mismatch') + '\n');
            (0, process_js_1.writeToStdout)(`Config expects: ${configExpects} installation\n`);
            (0, process_js_1.writeToStdout)(`Currently running: ${runningType}\n`);
            (0, process_js_1.writeToStdout)(chalk_1.default.yellow(`Updating the ${runningType} installation you are currently using`) + '\n');
            // Update config to match reality
            (0, config_js_1.saveGlobalConfig)(current => ({
                ...current,
                installMethod: normalizedRunningType,
            }));
            (0, process_js_1.writeToStdout)(`Config updated to reflect current installation method: ${normalizedRunningType}\n`);
        }
    }
    // Handle native installation updates first
    if (diagnostic.installationType === 'native') {
        (0, debug_js_1.logForDebugging)('update: Detected native installation, using native updater');
        try {
            const result = await (0, index_js_2.installLatest)(channel, true);
            // Handle lock contention gracefully
            if (result.lockFailed) {
                const pidInfo = result.lockHolderPid
                    ? ` (PID ${result.lockHolderPid})`
                    : '';
                (0, process_js_1.writeToStdout)(chalk_1.default.yellow(`Another Claude process${pidInfo} is currently running. Please try again in a moment.`) + '\n');
                await (0, gracefulShutdown_js_1.gracefulShutdown)(0);
            }
            if (!result.latestVersion) {
                process.stderr.write('Failed to check for updates\n');
                await (0, gracefulShutdown_js_1.gracefulShutdown)(1);
            }
            if (result.latestVersion === MACRO.VERSION) {
                (0, process_js_1.writeToStdout)(chalk_1.default.green(`Claude Code is up to date (${MACRO.VERSION})`) + '\n');
            }
            else {
                (0, process_js_1.writeToStdout)(chalk_1.default.green(`Successfully updated from ${MACRO.VERSION} to version ${result.latestVersion}`) + '\n');
                await (0, completionCache_js_1.regenerateCompletionCache)();
            }
            await (0, gracefulShutdown_js_1.gracefulShutdown)(0);
        }
        catch (error) {
            process.stderr.write('Error: Failed to install native update\n');
            process.stderr.write(String(error) + '\n');
            process.stderr.write('Try running "claude doctor" for diagnostics\n');
            await (0, gracefulShutdown_js_1.gracefulShutdown)(1);
        }
    }
    // Fallback to existing JS/npm-based update logic
    // Remove native installer symlink since we're not using native installation
    // But only if user hasn't migrated to native installation
    if (config.installMethod !== 'native') {
        await (0, index_js_2.removeInstalledSymlink)();
    }
    (0, debug_js_1.logForDebugging)('update: Checking npm registry for latest version');
    (0, debug_js_1.logForDebugging)(`update: Package URL: ${MACRO.PACKAGE_URL}`);
    const npmTag = channel === 'stable' ? 'stable' : 'latest';
    const npmCommand = `npm view ${MACRO.PACKAGE_URL}@${npmTag} version`;
    (0, debug_js_1.logForDebugging)(`update: Running: ${npmCommand}`);
    const latestVersion = await (0, autoUpdater_js_1.getLatestVersion)(channel);
    (0, debug_js_1.logForDebugging)(`update: Latest version from npm: ${latestVersion || 'FAILED'}`);
    if (!latestVersion) {
        (0, debug_js_1.logForDebugging)('update: Failed to get latest version from npm registry');
        process.stderr.write(chalk_1.default.red('Failed to check for updates') + '\n');
        process.stderr.write('Unable to fetch latest version from npm registry\n');
        process.stderr.write('\n');
        process.stderr.write('Possible causes:\n');
        process.stderr.write('  • Network connectivity issues\n');
        process.stderr.write('  • npm registry is unreachable\n');
        process.stderr.write('  • Corporate proxy/firewall blocking npm\n');
        if (MACRO.PACKAGE_URL && !MACRO.PACKAGE_URL.startsWith('@anthropic')) {
            process.stderr.write('  • Internal/development build not published to npm\n');
        }
        process.stderr.write('\n');
        process.stderr.write('Try:\n');
        process.stderr.write('  • Check your internet connection\n');
        process.stderr.write('  • Run with --debug flag for more details\n');
        const packageName = MACRO.PACKAGE_URL ||
            (process.env.USER_TYPE === 'ant'
                ? '@anthropic-ai/claude-cli'
                : '@anthropic-ai/claude-code');
        process.stderr.write(`  • Manually check: npm view ${packageName} version\n`);
        process.stderr.write('  • Check if you need to login: npm whoami\n');
        await (0, gracefulShutdown_js_1.gracefulShutdown)(1);
    }
    // Check if versions match exactly, including any build metadata (like SHA)
    if (latestVersion === MACRO.VERSION) {
        (0, process_js_1.writeToStdout)(chalk_1.default.green(`Claude Code is up to date (${MACRO.VERSION})`) + '\n');
        await (0, gracefulShutdown_js_1.gracefulShutdown)(0);
    }
    (0, process_js_1.writeToStdout)(`New version available: ${latestVersion} (current: ${MACRO.VERSION})\n`);
    (0, process_js_1.writeToStdout)('Installing update...\n');
    // Determine update method based on what's actually running
    let useLocalUpdate = false;
    let updateMethodName = '';
    switch (diagnostic.installationType) {
        case 'npm-local':
            useLocalUpdate = true;
            updateMethodName = 'local';
            break;
        case 'npm-global':
            useLocalUpdate = false;
            updateMethodName = 'global';
            break;
        case 'unknown': {
            // Fallback to detection if we can't determine installation type
            const isLocal = await (0, localInstaller_js_1.localInstallationExists)();
            useLocalUpdate = isLocal;
            updateMethodName = isLocal ? 'local' : 'global';
            (0, process_js_1.writeToStdout)(chalk_1.default.yellow('Warning: Could not determine installation type') + '\n');
            (0, process_js_1.writeToStdout)(`Attempting ${updateMethodName} update based on file detection...\n`);
            break;
        }
        default:
            process.stderr.write(`Error: Cannot update ${diagnostic.installationType} installation\n`);
            await (0, gracefulShutdown_js_1.gracefulShutdown)(1);
    }
    (0, process_js_1.writeToStdout)(`Using ${updateMethodName} installation update method...\n`);
    (0, debug_js_1.logForDebugging)(`update: Update method determined: ${updateMethodName}`);
    (0, debug_js_1.logForDebugging)(`update: useLocalUpdate: ${useLocalUpdate}`);
    let status;
    if (useLocalUpdate) {
        (0, debug_js_1.logForDebugging)('update: Calling installOrUpdateClaudePackage() for local update');
        status = await (0, localInstaller_js_1.installOrUpdateClaudePackage)(channel);
    }
    else {
        (0, debug_js_1.logForDebugging)('update: Calling installGlobalPackage() for global update');
        status = await (0, autoUpdater_js_1.installGlobalPackage)();
    }
    (0, debug_js_1.logForDebugging)(`update: Installation status: ${status}`);
    switch (status) {
        case 'success':
            (0, process_js_1.writeToStdout)(chalk_1.default.green(`Successfully updated from ${MACRO.VERSION} to version ${latestVersion}`) + '\n');
            await (0, completionCache_js_1.regenerateCompletionCache)();
            break;
        case 'no_permissions':
            process.stderr.write('Error: Insufficient permissions to install update\n');
            if (useLocalUpdate) {
                process.stderr.write('Try manually updating with:\n');
                process.stderr.write(`  cd ~/.claude/local && npm update ${MACRO.PACKAGE_URL}\n`);
            }
            else {
                process.stderr.write('Try running with sudo or fix npm permissions\n');
                process.stderr.write('Or consider using native installation with: claude install\n');
            }
            await (0, gracefulShutdown_js_1.gracefulShutdown)(1);
            break;
        case 'install_failed':
            process.stderr.write('Error: Failed to install update\n');
            if (useLocalUpdate) {
                process.stderr.write('Try manually updating with:\n');
                process.stderr.write(`  cd ~/.claude/local && npm update ${MACRO.PACKAGE_URL}\n`);
            }
            else {
                process.stderr.write('Or consider using native installation with: claude install\n');
            }
            await (0, gracefulShutdown_js_1.gracefulShutdown)(1);
            break;
        case 'in_progress':
            process.stderr.write('Error: Another instance is currently performing an update\n');
            process.stderr.write('Please wait and try again later\n');
            await (0, gracefulShutdown_js_1.gracefulShutdown)(1);
            break;
    }
    await (0, gracefulShutdown_js_1.gracefulShutdown)(0);
}
