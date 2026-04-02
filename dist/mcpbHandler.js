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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMcpbSource = isMcpbSource;
exports.loadMcpServerUserConfig = loadMcpServerUserConfig;
exports.saveMcpServerUserConfig = saveMcpServerUserConfig;
exports.validateUserConfig = validateUserConfig;
exports.checkMcpbChanged = checkMcpbChanged;
exports.loadMcpbFile = loadMcpbFile;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("crypto");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const debug_js_1 = require("../debug.js");
const helpers_js_1 = require("../dxt/helpers.js");
const zip_js_1 = require("../dxt/zip.js");
const errors_js_1 = require("../errors.js");
const fsOperations_js_1 = require("../fsOperations.js");
const log_js_1 = require("../log.js");
const index_js_1 = require("../secureStorage/index.js");
const settings_js_1 = require("../settings/settings.js");
const slowOperations_js_1 = require("../slowOperations.js");
const systemDirectories_js_1 = require("../systemDirectories.js");
const fetchTelemetry_js_1 = require("./fetchTelemetry.js");
/**
 * Check if a source string is an MCPB file reference
 */
function isMcpbSource(source) {
    return source.endsWith('.mcpb') || source.endsWith('.dxt');
}
/**
 * Check if a source is a URL
 */
function isUrl(source) {
    return source.startsWith('http://') || source.startsWith('https://');
}
/**
 * Generate content hash for an MCPB file
 */
function generateContentHash(data) {
    return (0, crypto_1.createHash)('sha256').update(data).digest('hex').substring(0, 16);
}
/**
 * Get cache directory for MCPB files
 */
function getMcpbCacheDir(pluginPath) {
    return (0, path_1.join)(pluginPath, '.mcpb-cache');
}
/**
 * Get metadata file path for cached MCPB
 */
function getMetadataPath(cacheDir, source) {
    const sourceHash = (0, crypto_1.createHash)('md5')
        .update(source)
        .digest('hex')
        .substring(0, 8);
    return (0, path_1.join)(cacheDir, `${sourceHash}.metadata.json`);
}
/**
 * Compose the secureStorage key for a per-server secret bucket.
 * `pluginSecrets` is a flat map — per-server secrets share it with top-level
 * plugin options (pluginOptionsStorage.ts) using a `${pluginId}/${server}`
 * composite key. `/` can't appear in plugin IDs (`name@marketplace`) or
 * server names (MCP identifier constraints), so it's unambiguous. Keeps the
 * SecureStorageData schema unchanged and the single-keychain-entry size
 * budget (~2KB stdin-safe, see INC-3028) shared across all plugin secrets.
 */
function serverSecretsKey(pluginId, serverName) {
    return `${pluginId}/${serverName}`;
}
/**
 * Load user configuration for an MCP server, merging non-sensitive values
 * (from settings.json) with sensitive values (from secureStorage keychain).
 * secureStorage wins on collision — schema determines destination so
 * collision shouldn't happen, but if a user hand-edits settings.json we
 * trust the more secure source.
 *
 * Returns null only if NEITHER source has anything — callers skip
 * ${user_config.X} substitution in that case.
 *
 * @param pluginId - Plugin identifier in "plugin@marketplace" format
 * @param serverName - MCP server name from DXT manifest
 */
function loadMcpServerUserConfig(pluginId, serverName) {
    try {
        const settings = (0, settings_js_1.getSettings_DEPRECATED)();
        const nonSensitive = settings.pluginConfigs?.[pluginId]?.mcpServers?.[serverName];
        const sensitive = (0, index_js_1.getSecureStorage)().read()?.pluginSecrets?.[serverSecretsKey(pluginId, serverName)];
        if (!nonSensitive && !sensitive) {
            return null;
        }
        (0, debug_js_1.logForDebugging)(`Loaded user config for ${pluginId}/${serverName} (settings + secureStorage)`);
        return { ...nonSensitive, ...sensitive };
    }
    catch (error) {
        const errorObj = (0, errors_js_1.toError)(error);
        (0, log_js_1.logError)(errorObj);
        (0, debug_js_1.logForDebugging)(`Failed to load user config for ${pluginId}/${serverName}: ${error}`, { level: 'error' });
        return null;
    }
}
/**
 * Save user configuration for an MCP server, splitting by `schema[key].sensitive`.
 * Mirrors savePluginOptions (pluginOptionsStorage.ts:90) for top-level options:
 *   - `sensitive: true` → secureStorage (keychain on macOS, .credentials.json 0600 elsewhere)
 *   - everything else   → settings.json pluginConfigs[pluginId].mcpServers[serverName]
 *
 * Without this split, per-channel `sensitive: true` was a false sense of
 * security — the dialog masked the input but the save went to plaintext
 * settings.json anyway. H1 #3617646 (Telegram/Discord bot tokens in
 * world-readable .env) surfaced this as the gap to close.
 *
 * Writes are skipped if nothing in that category is present.
 *
 * @param pluginId - Plugin identifier in "plugin@marketplace" format
 * @param serverName - MCP server name from DXT manifest
 * @param config - User configuration values
 * @param schema - The userConfig schema for this server (manifest.user_config
 *   or channels[].userConfig) — drives the sensitive/non-sensitive split
 */
function saveMcpServerUserConfig(pluginId, serverName, config, schema) {
    try {
        const nonSensitive = {};
        const sensitive = {};
        for (const [key, value] of Object.entries(config)) {
            if (schema[key]?.sensitive === true) {
                sensitive[key] = String(value);
            }
            else {
                nonSensitive[key] = value;
            }
        }
        // Scrub ONLY keys we're writing in this call. Covers both directions
        // across schema-version flips:
        //  - sensitive→secureStorage ⇒ remove stale plaintext from settings.json
        //  - nonSensitive→settings.json ⇒ remove stale entry from secureStorage
        //    (otherwise loadMcpServerUserConfig's {...nonSensitive, ...sensitive}
        //    would let the stale secureStorage value win on next read)
        // Partial `config` (user only re-enters one field) leaves other fields
        // untouched in BOTH stores — defense-in-depth against future callers.
        const sensitiveKeysInThisSave = new Set(Object.keys(sensitive));
        const nonSensitiveKeysInThisSave = new Set(Object.keys(nonSensitive));
        // Sensitive → secureStorage FIRST. If this fails (keychain locked,
        // .credentials.json perms), throw before touching settings.json — the
        // old plaintext stays as a fallback instead of losing BOTH copies.
        //
        // Also scrub non-sensitive keys from secureStorage — schema flipped
        // sensitive→false and they're being written to settings.json now. Without
        // this, loadMcpServerUserConfig's merge would let the stale secureStorage
        // value win on next read.
        const storage = (0, index_js_1.getSecureStorage)();
        const k = serverSecretsKey(pluginId, serverName);
        const existingInSecureStorage = storage.read()?.pluginSecrets?.[k] ?? undefined;
        const secureScrubbed = existingInSecureStorage
            ? Object.fromEntries(Object.entries(existingInSecureStorage).filter(([key]) => !nonSensitiveKeysInThisSave.has(key)))
            : undefined;
        const needSecureScrub = secureScrubbed &&
            existingInSecureStorage &&
            Object.keys(secureScrubbed).length !==
                Object.keys(existingInSecureStorage).length;
        if (Object.keys(sensitive).length > 0 || needSecureScrub) {
            const existing = storage.read() ?? {};
            if (!existing.pluginSecrets) {
                existing.pluginSecrets = {};
            }
            // secureStorage keyvault is a flat object — direct replace, no merge
            // semantics to worry about (unlike settings.json's mergeWith).
            existing.pluginSecrets[k] = {
                ...secureScrubbed,
                ...sensitive,
            };
            const result = storage.update(existing);
            if (!result.success) {
                throw new Error(`Failed to save sensitive config to secure storage for ${k}`);
            }
            if (result.warning) {
                (0, debug_js_1.logForDebugging)(`Server secrets save warning: ${result.warning}`, {
                    level: 'warn',
                });
            }
            if (needSecureScrub) {
                (0, debug_js_1.logForDebugging)(`saveMcpServerUserConfig: scrubbed ${Object.keys(existingInSecureStorage).length -
                    Object.keys(secureScrubbed).length} stale non-sensitive key(s) from secureStorage for ${k}`);
            }
        }
        // Non-sensitive → settings.json. Write whenever there are new non-sensitive
        // values OR existing plaintext sensitive values to scrub — so reconfiguring
        // a sensitive-only schema still cleans up the old settings.json. Runs
        // AFTER the secureStorage write succeeded, so the scrub can't leave you
        // with zero copies of the secret.
        //
        // updateSettingsForSource does mergeWith(diskSettings, ourSettings, ...)
        // which PRESERVES destination keys absent from source — so simply omitting
        // sensitive keys doesn't scrub them, the disk copy merges back in. Instead:
        // set each sensitive key to explicit `undefined` — mergeWith (with the
        // customizer at settings.ts:349) treats explicit undefined as a delete.
        const settings = (0, settings_js_1.getSettings_DEPRECATED)();
        const existingInSettings = settings.pluginConfigs?.[pluginId]?.mcpServers?.[serverName] ?? {};
        const keysToScrubFromSettings = Object.keys(existingInSettings).filter(k => sensitiveKeysInThisSave.has(k));
        if (Object.keys(nonSensitive).length > 0 ||
            keysToScrubFromSettings.length > 0) {
            if (!settings.pluginConfigs) {
                settings.pluginConfigs = {};
            }
            if (!settings.pluginConfigs[pluginId]) {
                settings.pluginConfigs[pluginId] = {};
            }
            if (!settings.pluginConfigs[pluginId].mcpServers) {
                settings.pluginConfigs[pluginId].mcpServers = {};
            }
            // Build the scrub-via-undefined map. The UserConfigValues type doesn't
            // include undefined, but updateSettingsForSource's mergeWith customizer
            // needs explicit undefined to delete — cast is deliberate internal
            // plumbing (same rationale as deletePluginOptions in
            // pluginOptionsStorage.ts:184, see CLAUDE.md's 10% case).
            const scrubbed = Object.fromEntries(keysToScrubFromSettings.map(k => [k, undefined]));
            settings.pluginConfigs[pluginId].mcpServers[serverName] = {
                ...nonSensitive,
                ...scrubbed,
            };
            const result = (0, settings_js_1.updateSettingsForSource)('userSettings', settings);
            if (result.error) {
                throw result.error;
            }
            if (keysToScrubFromSettings.length > 0) {
                (0, debug_js_1.logForDebugging)(`saveMcpServerUserConfig: scrubbed ${keysToScrubFromSettings.length} plaintext sensitive key(s) from settings.json for ${pluginId}/${serverName}`);
            }
        }
        (0, debug_js_1.logForDebugging)(`Saved user config for ${pluginId}/${serverName} (${Object.keys(nonSensitive).length} non-sensitive, ${Object.keys(sensitive).length} sensitive)`);
    }
    catch (error) {
        const errorObj = (0, errors_js_1.toError)(error);
        (0, log_js_1.logError)(errorObj);
        throw new Error(`Failed to save user configuration for ${pluginId}/${serverName}: ${errorObj.message}`);
    }
}
/**
 * Validate user configuration values against DXT user_config schema
 */
function validateUserConfig(values, schema) {
    const errors = [];
    // Check each field in the schema
    for (const [key, fieldSchema] of Object.entries(schema)) {
        const value = values[key];
        // Check required fields
        if (fieldSchema.required && (value === undefined || value === '')) {
            errors.push(`${fieldSchema.title || key} is required but not provided`);
            continue;
        }
        // Skip validation for optional fields that aren't provided
        if (value === undefined || value === '') {
            continue;
        }
        // Type validation
        if (fieldSchema.type === 'string') {
            if (Array.isArray(value)) {
                // String arrays are allowed if multiple: true
                if (!fieldSchema.multiple) {
                    errors.push(`${fieldSchema.title || key} must be a string, not an array`);
                }
                else if (!value.every(v => typeof v === 'string')) {
                    errors.push(`${fieldSchema.title || key} must be an array of strings`);
                }
            }
            else if (typeof value !== 'string') {
                errors.push(`${fieldSchema.title || key} must be a string`);
            }
        }
        else if (fieldSchema.type === 'number' && typeof value !== 'number') {
            errors.push(`${fieldSchema.title || key} must be a number`);
        }
        else if (fieldSchema.type === 'boolean' && typeof value !== 'boolean') {
            errors.push(`${fieldSchema.title || key} must be a boolean`);
        }
        else if ((fieldSchema.type === 'file' || fieldSchema.type === 'directory') &&
            typeof value !== 'string') {
            errors.push(`${fieldSchema.title || key} must be a path string`);
        }
        // Number range validation
        if (fieldSchema.type === 'number' && typeof value === 'number') {
            if (fieldSchema.min !== undefined && value < fieldSchema.min) {
                errors.push(`${fieldSchema.title || key} must be at least ${fieldSchema.min}`);
            }
            if (fieldSchema.max !== undefined && value > fieldSchema.max) {
                errors.push(`${fieldSchema.title || key} must be at most ${fieldSchema.max}`);
            }
        }
    }
    return { valid: errors.length === 0, errors };
}
/**
 * Generate MCP server configuration from DXT manifest
 */
async function generateMcpConfig(manifest, extractedPath, userConfig = {}) {
    // Lazy import: @anthropic-ai/mcpb barrel pulls in zod v3 schemas (~700KB of
    // bound closures). See dxt/helpers.ts for details.
    const { getMcpConfigForManifest } = await Promise.resolve().then(() => __importStar(require('@anthropic-ai/mcpb')));
    const mcpConfig = await getMcpConfigForManifest({
        manifest,
        extensionPath: extractedPath,
        systemDirs: (0, systemDirectories_js_1.getSystemDirectories)(),
        userConfig,
        pathSeparator: '/',
    });
    if (!mcpConfig) {
        const error = new Error(`Failed to generate MCP server configuration from manifest "${manifest.name}"`);
        (0, log_js_1.logError)(error);
        throw error;
    }
    return mcpConfig;
}
/**
 * Load cache metadata for an MCPB source
 */
async function loadCacheMetadata(cacheDir, source) {
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    const metadataPath = getMetadataPath(cacheDir, source);
    try {
        const content = await fs.readFile(metadataPath, { encoding: 'utf-8' });
        return (0, slowOperations_js_1.jsonParse)(content);
    }
    catch (error) {
        const code = (0, errors_js_1.getErrnoCode)(error);
        if (code === 'ENOENT')
            return null;
        const errorObj = (0, errors_js_1.toError)(error);
        (0, log_js_1.logError)(errorObj);
        (0, debug_js_1.logForDebugging)(`Failed to load MCPB cache metadata: ${error}`, {
            level: 'error',
        });
        return null;
    }
}
/**
 * Save cache metadata for an MCPB source
 */
async function saveCacheMetadata(cacheDir, source, metadata) {
    const metadataPath = getMetadataPath(cacheDir, source);
    await (0, fsOperations_js_1.getFsImplementation)().mkdir(cacheDir);
    await (0, promises_1.writeFile)(metadataPath, (0, slowOperations_js_1.jsonStringify)(metadata, null, 2), 'utf-8');
}
/**
 * Download MCPB file from URL
 */
async function downloadMcpb(url, destPath, onProgress) {
    (0, debug_js_1.logForDebugging)(`Downloading MCPB from ${url}`);
    if (onProgress) {
        onProgress(`Downloading ${url}...`);
    }
    const started = performance.now();
    let fetchTelemetryFired = false;
    try {
        const response = await axios_1.default.get(url, {
            timeout: 120000, // 2 minute timeout
            responseType: 'arraybuffer',
            maxRedirects: 5, // Follow redirects (like curl -L)
            onDownloadProgress: progressEvent => {
                if (progressEvent.total && onProgress) {
                    const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
                    onProgress(`Downloading... ${percent}%`);
                }
            },
        });
        const data = new Uint8Array(response.data);
        // Fire telemetry before writeFile — the event measures the network
        // fetch, not disk I/O. A writeFile EACCES would otherwise match
        // classifyFetchError's /permission denied/ → misreport as auth.
        (0, fetchTelemetry_js_1.logPluginFetch)('mcpb', url, 'success', performance.now() - started);
        fetchTelemetryFired = true;
        // Save to disk (binary data)
        await (0, promises_1.writeFile)(destPath, Buffer.from(data));
        (0, debug_js_1.logForDebugging)(`Downloaded ${data.length} bytes to ${destPath}`);
        if (onProgress) {
            onProgress('Download complete');
        }
        return data;
    }
    catch (error) {
        if (!fetchTelemetryFired) {
            (0, fetchTelemetry_js_1.logPluginFetch)('mcpb', url, 'failure', performance.now() - started, (0, fetchTelemetry_js_1.classifyFetchError)(error));
        }
        const errorMsg = (0, errors_js_1.errorMessage)(error);
        const fullError = new Error(`Failed to download MCPB file from ${url}: ${errorMsg}`);
        (0, log_js_1.logError)(fullError);
        throw fullError;
    }
}
/**
 * Extract MCPB file and write contents to extraction directory.
 *
 * @param modes - name→mode map from `parseZipModes`. MCPB bundles can ship
 *   native MCP server binaries, so preserving the exec bit matters here.
 */
async function extractMcpbContents(unzipped, extractPath, modes, onProgress) {
    if (onProgress) {
        onProgress('Extracting files...');
    }
    // Create extraction directory
    await (0, fsOperations_js_1.getFsImplementation)().mkdir(extractPath);
    // Write all files. Filter directory entries from the count so progress
    // messages use the same denominator as filesWritten (which skips them).
    let filesWritten = 0;
    const entries = Object.entries(unzipped).filter(([k]) => !k.endsWith('/'));
    const totalFiles = entries.length;
    for (const [filePath, fileData] of entries) {
        // Directory entries (common in zip -r, Python zipfile, Java ZipOutputStream)
        // are filtered above — writeFile would create `bin/` as an empty regular
        // file, then mkdir for `bin/server` would fail with ENOTDIR. The
        // mkdir(dirname(fullPath)) below creates parent dirs implicitly.
        const fullPath = (0, path_1.join)(extractPath, filePath);
        const dir = (0, path_1.dirname)(fullPath);
        // Ensure directory exists (recursive handles already-existing)
        if (dir !== extractPath) {
            await (0, fsOperations_js_1.getFsImplementation)().mkdir(dir);
        }
        // Determine if text or binary
        const isTextFile = filePath.endsWith('.json') ||
            filePath.endsWith('.js') ||
            filePath.endsWith('.ts') ||
            filePath.endsWith('.txt') ||
            filePath.endsWith('.md') ||
            filePath.endsWith('.yml') ||
            filePath.endsWith('.yaml');
        if (isTextFile) {
            const content = new TextDecoder().decode(fileData);
            await (0, promises_1.writeFile)(fullPath, content, 'utf-8');
        }
        else {
            await (0, promises_1.writeFile)(fullPath, Buffer.from(fileData));
        }
        const mode = modes[filePath];
        if (mode && mode & 0o111) {
            // Swallow EPERM/ENOTSUP (NFS root_squash, some FUSE mounts) — losing +x
            // is the pre-PR behavior and better than aborting mid-extraction.
            await (0, promises_1.chmod)(fullPath, mode & 0o777).catch(() => { });
        }
        filesWritten++;
        if (onProgress && filesWritten % 10 === 0) {
            onProgress(`Extracted ${filesWritten}/${totalFiles} files`);
        }
    }
    (0, debug_js_1.logForDebugging)(`Extracted ${filesWritten} files to ${extractPath}`);
    if (onProgress) {
        onProgress(`Extraction complete (${filesWritten} files)`);
    }
}
/**
 * Check if an MCPB source has changed and needs re-extraction
 */
async function checkMcpbChanged(source, pluginPath) {
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    const cacheDir = getMcpbCacheDir(pluginPath);
    const metadata = await loadCacheMetadata(cacheDir, source);
    if (!metadata) {
        // No cache metadata, needs loading
        return true;
    }
    // Check if extraction directory still exists
    try {
        await fs.stat(metadata.extractedPath);
    }
    catch (error) {
        const code = (0, errors_js_1.getErrnoCode)(error);
        if (code === 'ENOENT') {
            (0, debug_js_1.logForDebugging)(`MCPB extraction path missing: ${metadata.extractedPath}`);
        }
        else {
            (0, debug_js_1.logForDebugging)(`MCPB extraction path inaccessible: ${metadata.extractedPath}: ${error}`, { level: 'error' });
        }
        return true;
    }
    // For local files, check mtime
    if (!isUrl(source)) {
        const localPath = (0, path_1.join)(pluginPath, source);
        let stats;
        try {
            stats = await fs.stat(localPath);
        }
        catch (error) {
            const code = (0, errors_js_1.getErrnoCode)(error);
            if (code === 'ENOENT') {
                (0, debug_js_1.logForDebugging)(`MCPB source file missing: ${localPath}`);
            }
            else {
                (0, debug_js_1.logForDebugging)(`MCPB source file inaccessible: ${localPath}: ${error}`, { level: 'error' });
            }
            return true;
        }
        const cachedTime = new Date(metadata.cachedAt).getTime();
        // Floor to match the ms precision of cachedAt (ISO string). Sub-ms
        // precision on mtimeMs would make a freshly-cached file appear "newer"
        // than its own cache timestamp when both happen in the same millisecond.
        const fileTime = Math.floor(stats.mtimeMs);
        if (fileTime > cachedTime) {
            (0, debug_js_1.logForDebugging)(`MCPB file modified: ${new Date(fileTime)} > ${new Date(cachedTime)}`);
            return true;
        }
    }
    // For URLs, we'll re-check on explicit update (handled elsewhere)
    return false;
}
/**
 * Load and extract an MCPB file, with caching and user configuration support
 *
 * @param source - MCPB file path or URL
 * @param pluginPath - Plugin directory path
 * @param pluginId - Plugin identifier in "plugin@marketplace" format (for config storage)
 * @param onProgress - Progress callback
 * @param providedUserConfig - User configuration values (for initial setup or reconfiguration)
 * @returns Success with MCP config, or needs-config status with schema
 */
async function loadMcpbFile(source, pluginPath, pluginId, onProgress, providedUserConfig, forceConfigDialog) {
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    const cacheDir = getMcpbCacheDir(pluginPath);
    await fs.mkdir(cacheDir);
    (0, debug_js_1.logForDebugging)(`Loading MCPB from source: ${source}`);
    // Check cache first
    const metadata = await loadCacheMetadata(cacheDir, source);
    if (metadata && !(await checkMcpbChanged(source, pluginPath))) {
        (0, debug_js_1.logForDebugging)(`Using cached MCPB from ${metadata.extractedPath} (hash: ${metadata.contentHash})`);
        // Load manifest from cache
        const manifestPath = (0, path_1.join)(metadata.extractedPath, 'manifest.json');
        let manifestContent;
        try {
            manifestContent = await fs.readFile(manifestPath, { encoding: 'utf-8' });
        }
        catch (error) {
            if ((0, errors_js_1.isENOENT)(error)) {
                const err = new Error(`Cached manifest not found: ${manifestPath}`);
                (0, log_js_1.logError)(err);
                throw err;
            }
            throw error;
        }
        const manifestData = new TextEncoder().encode(manifestContent);
        const manifest = await (0, helpers_js_1.parseAndValidateManifestFromBytes)(manifestData);
        // Check for user_config requirement
        if (manifest.user_config && Object.keys(manifest.user_config).length > 0) {
            // Server name from DXT manifest
            const serverName = manifest.name;
            // Try to load existing config from settings.json or use provided config
            const savedConfig = loadMcpServerUserConfig(pluginId, serverName);
            const userConfig = providedUserConfig || savedConfig || {};
            // Validate we have all required fields
            const validation = validateUserConfig(userConfig, manifest.user_config);
            // Return needs-config if: forced (reconfiguration) OR validation failed
            if (forceConfigDialog || !validation.valid) {
                return {
                    status: 'needs-config',
                    manifest,
                    extractedPath: metadata.extractedPath,
                    contentHash: metadata.contentHash,
                    configSchema: manifest.user_config,
                    existingConfig: savedConfig || {},
                    validationErrors: validation.valid ? [] : validation.errors,
                };
            }
            // Save config if it was provided (first time or reconfiguration)
            if (providedUserConfig) {
                saveMcpServerUserConfig(pluginId, serverName, providedUserConfig, manifest.user_config ?? {});
            }
            // Generate MCP config WITH user config
            const mcpConfig = await generateMcpConfig(manifest, metadata.extractedPath, userConfig);
            return {
                manifest,
                mcpConfig,
                extractedPath: metadata.extractedPath,
                contentHash: metadata.contentHash,
            };
        }
        // No user_config required - generate config without it
        const mcpConfig = await generateMcpConfig(manifest, metadata.extractedPath);
        return {
            manifest,
            mcpConfig,
            extractedPath: metadata.extractedPath,
            contentHash: metadata.contentHash,
        };
    }
    // Not cached or changed - need to download/load and extract
    let mcpbData;
    let mcpbFilePath;
    if (isUrl(source)) {
        // Download from URL
        const sourceHash = (0, crypto_1.createHash)('md5')
            .update(source)
            .digest('hex')
            .substring(0, 8);
        mcpbFilePath = (0, path_1.join)(cacheDir, `${sourceHash}.mcpb`);
        mcpbData = await downloadMcpb(source, mcpbFilePath, onProgress);
    }
    else {
        // Load from local path
        const localPath = (0, path_1.join)(pluginPath, source);
        if (onProgress) {
            onProgress(`Loading ${source}...`);
        }
        try {
            mcpbData = await fs.readFileBytes(localPath);
            mcpbFilePath = localPath;
        }
        catch (error) {
            if ((0, errors_js_1.isENOENT)(error)) {
                const err = new Error(`MCPB file not found: ${localPath}`);
                (0, log_js_1.logError)(err);
                throw err;
            }
            throw error;
        }
    }
    // Generate content hash
    const contentHash = generateContentHash(mcpbData);
    (0, debug_js_1.logForDebugging)(`MCPB content hash: ${contentHash}`);
    // Extract ZIP
    if (onProgress) {
        onProgress('Extracting MCPB archive...');
    }
    const unzipped = await (0, zip_js_1.unzipFile)(Buffer.from(mcpbData));
    // fflate doesn't surface external_attr — parse the central directory so
    // native MCP server binaries keep their exec bit after extraction.
    const modes = (0, zip_js_1.parseZipModes)(mcpbData);
    // Check for manifest.json
    const manifestData = unzipped['manifest.json'];
    if (!manifestData) {
        const error = new Error('No manifest.json found in MCPB file');
        (0, log_js_1.logError)(error);
        throw error;
    }
    // Parse and validate manifest
    const manifest = await (0, helpers_js_1.parseAndValidateManifestFromBytes)(manifestData);
    (0, debug_js_1.logForDebugging)(`MCPB manifest: ${manifest.name} v${manifest.version} by ${manifest.author.name}`);
    // Check if manifest has server config
    if (!manifest.server) {
        const error = new Error(`MCPB manifest for "${manifest.name}" does not define a server configuration`);
        (0, log_js_1.logError)(error);
        throw error;
    }
    // Extract to cache directory
    const extractPath = (0, path_1.join)(cacheDir, contentHash);
    await extractMcpbContents(unzipped, extractPath, modes, onProgress);
    // Check for user_config requirement
    if (manifest.user_config && Object.keys(manifest.user_config).length > 0) {
        // Server name from DXT manifest
        const serverName = manifest.name;
        // Try to load existing config from settings.json or use provided config
        const savedConfig = loadMcpServerUserConfig(pluginId, serverName);
        const userConfig = providedUserConfig || savedConfig || {};
        // Validate we have all required fields
        const validation = validateUserConfig(userConfig, manifest.user_config);
        if (!validation.valid) {
            // Save cache metadata even though config is incomplete
            const newMetadata = {
                source,
                contentHash,
                extractedPath: extractPath,
                cachedAt: new Date().toISOString(),
                lastChecked: new Date().toISOString(),
            };
            await saveCacheMetadata(cacheDir, source, newMetadata);
            // Return "needs configuration" status
            return {
                status: 'needs-config',
                manifest,
                extractedPath: extractPath,
                contentHash,
                configSchema: manifest.user_config,
                existingConfig: savedConfig || {},
                validationErrors: validation.errors,
            };
        }
        // Save config if it was provided (first time or reconfiguration)
        if (providedUserConfig) {
            saveMcpServerUserConfig(pluginId, serverName, providedUserConfig, manifest.user_config ?? {});
        }
        // Generate MCP config WITH user config
        if (onProgress) {
            onProgress('Generating MCP server configuration...');
        }
        const mcpConfig = await generateMcpConfig(manifest, extractPath, userConfig);
        // Save cache metadata
        const newMetadata = {
            source,
            contentHash,
            extractedPath: extractPath,
            cachedAt: new Date().toISOString(),
            lastChecked: new Date().toISOString(),
        };
        await saveCacheMetadata(cacheDir, source, newMetadata);
        return {
            manifest,
            mcpConfig,
            extractedPath: extractPath,
            contentHash,
        };
    }
    // No user_config required - generate config without it
    if (onProgress) {
        onProgress('Generating MCP server configuration...');
    }
    const mcpConfig = await generateMcpConfig(manifest, extractPath);
    // Save cache metadata
    const newMetadata = {
        source,
        contentHash,
        extractedPath: extractPath,
        cachedAt: new Date().toISOString(),
        lastChecked: new Date().toISOString(),
    };
    await saveCacheMetadata(cacheDir, source, newMetadata);
    (0, debug_js_1.logForDebugging)(`Successfully loaded MCPB: ${manifest.name} (extracted to ${extractPath})`);
    return {
        manifest,
        mcpConfig: mcpConfig,
        extractedPath: extractPath,
        contentHash,
    };
}
