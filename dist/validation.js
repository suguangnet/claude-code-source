"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateDirectoryForWorkspace = validateDirectoryForWorkspace;
exports.addDirHelpMessage = addDirHelpMessage;
const chalk_1 = __importDefault(require("chalk"));
const promises_1 = require("fs/promises");
const path_1 = require("path");
const errors_js_1 = require("../../utils/errors.js");
const path_js_1 = require("../../utils/path.js");
const filesystem_js_1 = require("../../utils/permissions/filesystem.js");
async function validateDirectoryForWorkspace(directoryPath, permissionContext) {
    if (!directoryPath) {
        return {
            resultType: 'emptyPath',
        };
    }
    // resolve() strips the trailing slash expandPath can leave on absolute
    // inputs, so /foo and /foo/ map to the same storage key (CC-33).
    const absolutePath = (0, path_1.resolve)((0, path_js_1.expandPath)(directoryPath));
    // Check if path exists and is a directory (single syscall)
    try {
        const stats = await (0, promises_1.stat)(absolutePath);
        if (!stats.isDirectory()) {
            return {
                resultType: 'notADirectory',
                directoryPath,
                absolutePath,
            };
        }
    }
    catch (e) {
        const code = (0, errors_js_1.getErrnoCode)(e);
        // Match prior existsSync() semantics: treat any of these as "not found"
        // rather than re-throwing. EACCES/EPERM in particular must not crash
        // startup when a settings-configured additional directory is inaccessible.
        if (code === 'ENOENT' ||
            code === 'ENOTDIR' ||
            code === 'EACCES' ||
            code === 'EPERM') {
            return {
                resultType: 'pathNotFound',
                directoryPath,
                absolutePath,
            };
        }
        throw e;
    }
    // Get current permission context
    const currentWorkingDirs = (0, filesystem_js_1.allWorkingDirectories)(permissionContext);
    // Check if already within an existing working directory
    for (const workingDir of currentWorkingDirs) {
        if ((0, filesystem_js_1.pathInWorkingPath)(absolutePath, workingDir)) {
            return {
                resultType: 'alreadyInWorkingDirectory',
                directoryPath,
                workingDir,
            };
        }
    }
    return {
        resultType: 'success',
        absolutePath,
    };
}
function addDirHelpMessage(result) {
    switch (result.resultType) {
        case 'emptyPath':
            return 'Please provide a directory path.';
        case 'pathNotFound':
            return `Path ${chalk_1.default.bold(result.absolutePath)} was not found.`;
        case 'notADirectory': {
            const parentDir = (0, path_1.dirname)(result.absolutePath);
            return `${chalk_1.default.bold(result.directoryPath)} is not a directory. Did you mean to add the parent directory ${chalk_1.default.bold(parentDir)}?`;
        }
        case 'alreadyInWorkingDirectory':
            return `${chalk_1.default.bold(result.directoryPath)} is already accessible within the existing working directory ${chalk_1.default.bold(result.workingDir)}.`;
        case 'success':
            return `Added ${chalk_1.default.bold(result.absolutePath)} as a working directory.`;
    }
}
