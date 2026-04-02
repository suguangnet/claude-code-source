"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.maybeRemoveApiKeyFromMacOSKeychainThrows = maybeRemoveApiKeyFromMacOSKeychainThrows;
exports.normalizeApiKeyForConfig = normalizeApiKeyForConfig;
const execa_1 = require("execa");
const macOsKeychainHelpers_js_1 = require("src/utils/secureStorage/macOsKeychainHelpers.js");
async function maybeRemoveApiKeyFromMacOSKeychainThrows() {
    if (process.platform === 'darwin') {
        const storageServiceName = (0, macOsKeychainHelpers_js_1.getMacOsKeychainStorageServiceName)();
        const result = await (0, execa_1.execa)(`security delete-generic-password -a $USER -s "${storageServiceName}"`, { shell: true, reject: false });
        if (result.exitCode !== 0) {
            throw new Error('Failed to delete keychain entry');
        }
    }
}
function normalizeApiKeyForConfig(apiKey) {
    return apiKey.slice(-20);
}
