"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.plainTextStorage = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const envUtils_js_1 = require("../envUtils.js");
const errors_js_1 = require("../errors.js");
const fsOperations_js_1 = require("../fsOperations.js");
const slowOperations_js_1 = require("../slowOperations.js");
function getStoragePath() {
    const storageDir = (0, envUtils_js_1.getClaudeConfigHomeDir)();
    const storageFileName = '.credentials.json';
    return { storageDir, storagePath: (0, path_1.join)(storageDir, storageFileName) };
}
exports.plainTextStorage = {
    name: 'plaintext',
    read() {
        // sync IO: called from sync context (SecureStorage interface)
        const { storagePath } = getStoragePath();
        try {
            const data = (0, fsOperations_js_1.getFsImplementation)().readFileSync(storagePath, {
                encoding: 'utf8',
            });
            return (0, slowOperations_js_1.jsonParse)(data);
        }
        catch {
            return null;
        }
    },
    async readAsync() {
        const { storagePath } = getStoragePath();
        try {
            const data = await (0, fsOperations_js_1.getFsImplementation)().readFile(storagePath, {
                encoding: 'utf8',
            });
            return (0, slowOperations_js_1.jsonParse)(data);
        }
        catch {
            return null;
        }
    },
    update(data) {
        // sync IO: called from sync context (SecureStorage interface)
        try {
            const { storageDir, storagePath } = getStoragePath();
            try {
                (0, fsOperations_js_1.getFsImplementation)().mkdirSync(storageDir);
            }
            catch (e) {
                const code = (0, errors_js_1.getErrnoCode)(e);
                if (code !== 'EEXIST') {
                    throw e;
                }
            }
            (0, slowOperations_js_1.writeFileSync_DEPRECATED)(storagePath, (0, slowOperations_js_1.jsonStringify)(data), {
                encoding: 'utf8',
                flush: false,
            });
            (0, fs_1.chmodSync)(storagePath, 0o600);
            return {
                success: true,
                warning: 'Warning: Storing credentials in plaintext.',
            };
        }
        catch {
            return { success: false };
        }
    },
    delete() {
        // sync IO: called from sync context (SecureStorage interface)
        const { storagePath } = getStoragePath();
        try {
            (0, fsOperations_js_1.getFsImplementation)().unlinkSync(storagePath);
            return true;
        }
        catch (e) {
            const code = (0, errors_js_1.getErrnoCode)(e);
            if (code === 'ENOENT') {
                return true;
            }
            return false;
        }
    },
};
