"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markITerm2SetupComplete = markITerm2SetupComplete;
exports.checkAndRestoreITerm2Backup = checkAndRestoreITerm2Backup;
const promises_1 = require("fs/promises");
const os_1 = require("os");
const path_1 = require("path");
const config_js_1 = require("./config.js");
const log_js_1 = require("./log.js");
function markITerm2SetupComplete() {
    (0, config_js_1.saveGlobalConfig)(current => ({
        ...current,
        iterm2SetupInProgress: false,
    }));
}
function getIterm2RecoveryInfo() {
    const config = (0, config_js_1.getGlobalConfig)();
    return {
        inProgress: config.iterm2SetupInProgress ?? false,
        backupPath: config.iterm2BackupPath || null,
    };
}
function getITerm2PlistPath() {
    return (0, path_1.join)((0, os_1.homedir)(), 'Library', 'Preferences', 'com.googlecode.iterm2.plist');
}
async function checkAndRestoreITerm2Backup() {
    const { inProgress, backupPath } = getIterm2RecoveryInfo();
    if (!inProgress) {
        return { status: 'no_backup' };
    }
    if (!backupPath) {
        markITerm2SetupComplete();
        return { status: 'no_backup' };
    }
    try {
        await (0, promises_1.stat)(backupPath);
    }
    catch {
        markITerm2SetupComplete();
        return { status: 'no_backup' };
    }
    try {
        await (0, promises_1.copyFile)(backupPath, getITerm2PlistPath());
        markITerm2SetupComplete();
        return { status: 'restored' };
    }
    catch (restoreError) {
        (0, log_js_1.logError)(new Error(`Failed to restore iTerm2 settings with: ${restoreError}`));
        markITerm2SetupComplete();
        return { status: 'failed', backupPath };
    }
}
