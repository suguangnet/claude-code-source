"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markTerminalSetupInProgress = markTerminalSetupInProgress;
exports.markTerminalSetupComplete = markTerminalSetupComplete;
exports.getTerminalPlistPath = getTerminalPlistPath;
exports.backupTerminalPreferences = backupTerminalPreferences;
exports.checkAndRestoreTerminalBackup = checkAndRestoreTerminalBackup;
const promises_1 = require("fs/promises");
const os_1 = require("os");
const path_1 = require("path");
const config_js_1 = require("./config.js");
const execFileNoThrow_js_1 = require("./execFileNoThrow.js");
const log_js_1 = require("./log.js");
function markTerminalSetupInProgress(backupPath) {
    (0, config_js_1.saveGlobalConfig)(current => ({
        ...current,
        appleTerminalSetupInProgress: true,
        appleTerminalBackupPath: backupPath,
    }));
}
function markTerminalSetupComplete() {
    (0, config_js_1.saveGlobalConfig)(current => ({
        ...current,
        appleTerminalSetupInProgress: false,
    }));
}
function getTerminalRecoveryInfo() {
    const config = (0, config_js_1.getGlobalConfig)();
    return {
        inProgress: config.appleTerminalSetupInProgress ?? false,
        backupPath: config.appleTerminalBackupPath || null,
    };
}
function getTerminalPlistPath() {
    return (0, path_1.join)((0, os_1.homedir)(), 'Library', 'Preferences', 'com.apple.Terminal.plist');
}
async function backupTerminalPreferences() {
    const terminalPlistPath = getTerminalPlistPath();
    const backupPath = `${terminalPlistPath}.bak`;
    try {
        const { code } = await (0, execFileNoThrow_js_1.execFileNoThrow)('defaults', [
            'export',
            'com.apple.Terminal',
            terminalPlistPath,
        ]);
        if (code !== 0) {
            return null;
        }
        try {
            await (0, promises_1.stat)(terminalPlistPath);
        }
        catch {
            return null;
        }
        await (0, execFileNoThrow_js_1.execFileNoThrow)('defaults', [
            'export',
            'com.apple.Terminal',
            backupPath,
        ]);
        markTerminalSetupInProgress(backupPath);
        return backupPath;
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return null;
    }
}
async function checkAndRestoreTerminalBackup() {
    const { inProgress, backupPath } = getTerminalRecoveryInfo();
    if (!inProgress) {
        return { status: 'no_backup' };
    }
    if (!backupPath) {
        markTerminalSetupComplete();
        return { status: 'no_backup' };
    }
    try {
        await (0, promises_1.stat)(backupPath);
    }
    catch {
        markTerminalSetupComplete();
        return { status: 'no_backup' };
    }
    try {
        const { code } = await (0, execFileNoThrow_js_1.execFileNoThrow)('defaults', [
            'import',
            'com.apple.Terminal',
            backupPath,
        ]);
        if (code !== 0) {
            return { status: 'failed', backupPath };
        }
        await (0, execFileNoThrow_js_1.execFileNoThrow)('killall', ['cfprefsd']);
        markTerminalSetupComplete();
        return { status: 'restored' };
    }
    catch (restoreError) {
        (0, log_js_1.logError)(new Error(`Failed to restore Terminal.app settings with: ${restoreError}`));
        markTerminalSetupComplete();
        return { status: 'failed', backupPath };
    }
}
