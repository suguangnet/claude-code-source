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
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAwsCredentialsProviderError = isAwsCredentialsProviderError;
exports.isValidAwsStsOutput = isValidAwsStsOutput;
exports.checkStsCallerIdentity = checkStsCallerIdentity;
exports.clearAwsIniCache = clearAwsIniCache;
const debug_js_1 = require("./debug.js");
function isAwsCredentialsProviderError(err) {
    return err?.name === 'CredentialsProviderError';
}
/** Typeguard to validate AWS STS assume-role output */
function isValidAwsStsOutput(obj) {
    if (!obj || typeof obj !== 'object') {
        return false;
    }
    const output = obj;
    // Check if Credentials exists and has required fields
    if (!output.Credentials || typeof output.Credentials !== 'object') {
        return false;
    }
    const credentials = output.Credentials;
    return (typeof credentials.AccessKeyId === 'string' &&
        typeof credentials.SecretAccessKey === 'string' &&
        typeof credentials.SessionToken === 'string' &&
        credentials.AccessKeyId.length > 0 &&
        credentials.SecretAccessKey.length > 0 &&
        credentials.SessionToken.length > 0);
}
/** Throws if STS caller identity cannot be retrieved. */
async function checkStsCallerIdentity() {
    const { STSClient, GetCallerIdentityCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-sts')));
    await new STSClient().send(new GetCallerIdentityCommand({}));
}
/**
 * Clear AWS credential provider cache by forcing a refresh
 * This ensures that any changes to ~/.aws/credentials are picked up immediately
 */
async function clearAwsIniCache() {
    try {
        (0, debug_js_1.logForDebugging)('Clearing AWS credential provider cache');
        const { fromIni } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/credential-providers')));
        const iniProvider = fromIni({ ignoreCache: true });
        await iniProvider(); // This updates the global file cache
        (0, debug_js_1.logForDebugging)('AWS credential provider cache refreshed');
    }
    catch (_error) {
        // Ignore errors - we're just clearing the cache
        (0, debug_js_1.logForDebugging)('Failed to clear AWS credential cache (this is expected if no credentials are configured)');
    }
}
