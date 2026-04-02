"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.macOsKeychainStorage = void 0;
exports.isMacOsKeychainLocked = isMacOsKeychainLocked;
const execa_1 = require("execa");
const debug_js_1 = require("../debug.js");
const execFileNoThrow_js_1 = require("../execFileNoThrow.js");
const execFileNoThrowPortable_js_1 = require("../execFileNoThrowPortable.js");
const slowOperations_js_1 = require("../slowOperations.js");
const macOsKeychainHelpers_js_1 = require("./macOsKeychainHelpers.js");
// `security -i` reads stdin with a 4096-byte fgets() buffer (BUFSIZ on darwin).
// A command line longer than this is truncated mid-argument: the first 4096
// bytes are consumed as one command (unterminated quote → fails), the overflow
// is interpreted as a second unknown command. Net: non-zero exit with NO data
// written, but the *previous* keychain entry is left intact — which fallback
// storage then reads as stale. See #30337.
// Headroom of 64B below the limit guards against edge-case line-terminator
// accounting differences.
const SECURITY_STDIN_LINE_LIMIT = 4096 - 64;
exports.macOsKeychainStorage = {
    name: 'keychain',
    read() {
        const prev = macOsKeychainHelpers_js_1.keychainCacheState.cache;
        if (Date.now() - prev.cachedAt < macOsKeychainHelpers_js_1.KEYCHAIN_CACHE_TTL_MS) {
            return prev.data;
        }
        try {
            const storageServiceName = (0, macOsKeychainHelpers_js_1.getMacOsKeychainStorageServiceName)(macOsKeychainHelpers_js_1.CREDENTIALS_SERVICE_SUFFIX);
            const username = (0, macOsKeychainHelpers_js_1.getUsername)();
            const result = (0, execFileNoThrowPortable_js_1.execSyncWithDefaults_DEPRECATED)(`security find-generic-password -a "${username}" -w -s "${storageServiceName}"`);
            if (result) {
                const data = (0, slowOperations_js_1.jsonParse)(result);
                macOsKeychainHelpers_js_1.keychainCacheState.cache = { data, cachedAt: Date.now() };
                return data;
            }
        }
        catch (_e) {
            // fall through
        }
        // Stale-while-error: if we had a value before and the refresh failed,
        // keep serving the stale value rather than caching null. Since #23192
        // clears the upstream memoize on every API request (macOS path), a
        // single transient `security` spawn failure would otherwise poison the
        // cache and surface as "Not logged in" across all subsystems until the
        // next user interaction. clearKeychainCache() sets data=null, so
        // explicit invalidation (logout, delete) still reads through.
        if (prev.data !== null) {
            (0, debug_js_1.logForDebugging)('[keychain] read failed; serving stale cache', {
                level: 'warn',
            });
            macOsKeychainHelpers_js_1.keychainCacheState.cache = { data: prev.data, cachedAt: Date.now() };
            return prev.data;
        }
        macOsKeychainHelpers_js_1.keychainCacheState.cache = { data: null, cachedAt: Date.now() };
        return null;
    },
    async readAsync() {
        const prev = macOsKeychainHelpers_js_1.keychainCacheState.cache;
        if (Date.now() - prev.cachedAt < macOsKeychainHelpers_js_1.KEYCHAIN_CACHE_TTL_MS) {
            return prev.data;
        }
        if (macOsKeychainHelpers_js_1.keychainCacheState.readInFlight) {
            return macOsKeychainHelpers_js_1.keychainCacheState.readInFlight;
        }
        const gen = macOsKeychainHelpers_js_1.keychainCacheState.generation;
        const promise = doReadAsync().then(data => {
            // If the cache was invalidated or updated while we were reading,
            // our subprocess result is stale — don't overwrite the newer entry.
            if (gen === macOsKeychainHelpers_js_1.keychainCacheState.generation) {
                // Stale-while-error — mirror read() above.
                if (data === null && prev.data !== null) {
                    (0, debug_js_1.logForDebugging)('[keychain] readAsync failed; serving stale cache', {
                        level: 'warn',
                    });
                }
                const next = data ?? prev.data;
                macOsKeychainHelpers_js_1.keychainCacheState.cache = { data: next, cachedAt: Date.now() };
                macOsKeychainHelpers_js_1.keychainCacheState.readInFlight = null;
                return next;
            }
            return data;
        });
        macOsKeychainHelpers_js_1.keychainCacheState.readInFlight = promise;
        return promise;
    },
    update(data) {
        // Invalidate cache before update
        (0, macOsKeychainHelpers_js_1.clearKeychainCache)();
        try {
            const storageServiceName = (0, macOsKeychainHelpers_js_1.getMacOsKeychainStorageServiceName)(macOsKeychainHelpers_js_1.CREDENTIALS_SERVICE_SUFFIX);
            const username = (0, macOsKeychainHelpers_js_1.getUsername)();
            const jsonString = (0, slowOperations_js_1.jsonStringify)(data);
            // Convert to hexadecimal to avoid any escaping issues
            const hexValue = Buffer.from(jsonString, 'utf-8').toString('hex');
            // Prefer stdin (`security -i`) so process monitors (CrowdStrike et al.)
            // see only "security -i", not the payload (INC-3028).
            // When the payload would overflow the stdin line buffer, fall back to
            // argv. Hex in argv is recoverable by a determined observer but defeats
            // naive plaintext-grep rules, and the alternative — silent credential
            // corruption — is strictly worse. ARG_MAX on darwin is 1MB so argv has
            // effectively no size limit for our purposes.
            const command = `add-generic-password -U -a "${username}" -s "${storageServiceName}" -X "${hexValue}"\n`;
            let result;
            if (command.length <= SECURITY_STDIN_LINE_LIMIT) {
                result = (0, execa_1.execaSync)('security', ['-i'], {
                    input: command,
                    stdio: ['pipe', 'pipe', 'pipe'],
                    reject: false,
                });
            }
            else {
                (0, debug_js_1.logForDebugging)(`Keychain payload (${jsonString.length}B JSON) exceeds security -i stdin limit; using argv`, { level: 'warn' });
                result = (0, execa_1.execaSync)('security', [
                    'add-generic-password',
                    '-U',
                    '-a',
                    username,
                    '-s',
                    storageServiceName,
                    '-X',
                    hexValue,
                ], { stdio: ['ignore', 'pipe', 'pipe'], reject: false });
            }
            if (result.exitCode !== 0) {
                return { success: false };
            }
            // Update cache with new data on success
            macOsKeychainHelpers_js_1.keychainCacheState.cache = { data, cachedAt: Date.now() };
            return { success: true };
        }
        catch (_e) {
            return { success: false };
        }
    },
    delete() {
        // Invalidate cache before delete
        (0, macOsKeychainHelpers_js_1.clearKeychainCache)();
        try {
            const storageServiceName = (0, macOsKeychainHelpers_js_1.getMacOsKeychainStorageServiceName)(macOsKeychainHelpers_js_1.CREDENTIALS_SERVICE_SUFFIX);
            const username = (0, macOsKeychainHelpers_js_1.getUsername)();
            (0, execFileNoThrowPortable_js_1.execSyncWithDefaults_DEPRECATED)(`security delete-generic-password -a "${username}" -s "${storageServiceName}"`);
            return true;
        }
        catch (_e) {
            return false;
        }
    },
};
async function doReadAsync() {
    try {
        const storageServiceName = (0, macOsKeychainHelpers_js_1.getMacOsKeychainStorageServiceName)(macOsKeychainHelpers_js_1.CREDENTIALS_SERVICE_SUFFIX);
        const username = (0, macOsKeychainHelpers_js_1.getUsername)();
        const { stdout, code } = await (0, execFileNoThrow_js_1.execFileNoThrow)('security', ['find-generic-password', '-a', username, '-w', '-s', storageServiceName], { useCwd: false, preserveOutputOnError: false });
        if (code === 0 && stdout) {
            return (0, slowOperations_js_1.jsonParse)(stdout.trim());
        }
    }
    catch (_e) {
        // fall through
    }
    return null;
}
let keychainLockedCache;
/**
 * Checks if the macOS keychain is locked.
 * Returns true if on macOS and keychain is locked (exit code 36 from security show-keychain-info).
 * This commonly happens in SSH sessions where the keychain isn't automatically unlocked.
 *
 * Cached for process lifetime — execaSync('security', ...) is a ~27ms sync
 * subprocess spawn, and this is called from render (AssistantTextMessage).
 * During virtual-scroll remounts on sessions with "Not logged in" messages,
 * each remount re-spawned security(1), adding 27ms/message to the commit.
 * Keychain lock state doesn't change during a CLI session.
 */
function isMacOsKeychainLocked() {
    if (keychainLockedCache !== undefined)
        return keychainLockedCache;
    // Only check on macOS
    if (process.platform !== 'darwin') {
        keychainLockedCache = false;
        return false;
    }
    try {
        const result = (0, execa_1.execaSync)('security', ['show-keychain-info'], {
            reject: false,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        // Exit code 36 indicates the keychain is locked
        keychainLockedCache = result.exitCode === 36;
    }
    catch {
        // If the command fails for any reason, assume keychain is not locked
        keychainLockedCache = false;
    }
    return keychainLockedCache;
}
