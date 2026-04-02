"use strict";
/**
 * Download functionality for native installer
 *
 * Handles downloading Claude binaries from various sources:
 * - Artifactory NPM packages
 * - GCS bucket
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports._downloadAndVerifyBinaryForTesting = exports.STALL_TIMEOUT_MS = exports.MAX_DOWNLOAD_RETRIES = exports.StallTimeoutError = exports.ARTIFACTORY_REGISTRY_URL = void 0;
exports.getLatestVersionFromArtifactory = getLatestVersionFromArtifactory;
exports.getLatestVersionFromBinaryRepo = getLatestVersionFromBinaryRepo;
exports.getLatestVersion = getLatestVersion;
exports.downloadVersionFromArtifactory = downloadVersionFromArtifactory;
exports.downloadVersionFromBinaryRepo = downloadVersionFromBinaryRepo;
exports.downloadVersion = downloadVersion;
const bun_bundle_1 = require("bun:bundle");
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("crypto");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const index_js_1 = require("src/services/analytics/index.js");
const debug_js_1 = require("../debug.js");
const errors_js_1 = require("../errors.js");
const execFileNoThrow_js_1 = require("../execFileNoThrow.js");
const fsOperations_js_1 = require("../fsOperations.js");
const log_js_1 = require("../log.js");
const sleep_js_1 = require("../sleep.js");
const slowOperations_js_1 = require("../slowOperations.js");
const installer_js_1 = require("./installer.js");
const GCS_BUCKET_URL = 'https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases';
exports.ARTIFACTORY_REGISTRY_URL = 'https://artifactory.infra.ant.dev/artifactory/api/npm/npm-all/';
async function getLatestVersionFromArtifactory(tag = 'latest') {
    const startTime = Date.now();
    const { stdout, code, stderr } = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)('npm', [
        'view',
        `${MACRO.NATIVE_PACKAGE_URL}@${tag}`,
        'version',
        '--prefer-online',
        '--registry',
        exports.ARTIFACTORY_REGISTRY_URL,
    ], {
        timeout: 30000,
        preserveOutputOnError: true,
    });
    const latencyMs = Date.now() - startTime;
    if (code !== 0) {
        (0, index_js_1.logEvent)('tengu_version_check_failure', {
            latency_ms: latencyMs,
            source_npm: true,
            exit_code: code,
        });
        const error = new Error(`npm view failed with code ${code}: ${stderr}`);
        (0, log_js_1.logError)(error);
        throw error;
    }
    (0, index_js_1.logEvent)('tengu_version_check_success', {
        latency_ms: latencyMs,
        source_npm: true,
    });
    (0, debug_js_1.logForDebugging)(`npm view ${MACRO.NATIVE_PACKAGE_URL}@${tag} version: ${stdout}`);
    const latestVersion = stdout.trim();
    return latestVersion;
}
async function getLatestVersionFromBinaryRepo(channel = 'latest', baseUrl, authConfig) {
    const startTime = Date.now();
    try {
        const response = await axios_1.default.get(`${baseUrl}/${channel}`, {
            timeout: 30000,
            responseType: 'text',
            ...authConfig,
        });
        const latencyMs = Date.now() - startTime;
        (0, index_js_1.logEvent)('tengu_version_check_success', {
            latency_ms: latencyMs,
        });
        return response.data.trim();
    }
    catch (error) {
        const latencyMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        let httpStatus;
        if (axios_1.default.isAxiosError(error) && error.response) {
            httpStatus = error.response.status;
        }
        (0, index_js_1.logEvent)('tengu_version_check_failure', {
            latency_ms: latencyMs,
            http_status: httpStatus,
            is_timeout: errorMessage.includes('timeout'),
        });
        const fetchError = new Error(`Failed to fetch version from ${baseUrl}/${channel}: ${errorMessage}`);
        (0, log_js_1.logError)(fetchError);
        throw fetchError;
    }
}
async function getLatestVersion(channelOrVersion) {
    // Direct version - match internal format too (e.g. 1.0.30-dev.shaf4937ce)
    if (/^v?\d+\.\d+\.\d+(-\S+)?$/.test(channelOrVersion)) {
        const normalized = channelOrVersion.startsWith('v')
            ? channelOrVersion.slice(1)
            : channelOrVersion;
        // 99.99.x is reserved for CI smoke-test fixtures on real GCS.
        // feature() is false in all shipped builds — DCE collapses this to an
        // unconditional throw. Only `bun --feature=ALLOW_TEST_VERSIONS` (the
        // smoke test's source-level invocation) bypasses.
        if (/^99\.99\./.test(normalized) && !(0, bun_bundle_1.feature)('ALLOW_TEST_VERSIONS')) {
            throw new Error(`Version ${normalized} is not available for installation. Use 'stable' or 'latest'.`);
        }
        return normalized;
    }
    // ReleaseChannel validation
    const channel = channelOrVersion;
    if (channel !== 'stable' && channel !== 'latest') {
        throw new Error(`Invalid channel: ${channelOrVersion}. Use 'stable' or 'latest'`);
    }
    // Route to appropriate source
    if (process.env.USER_TYPE === 'ant') {
        // Use Artifactory for ant users
        const npmTag = channel === 'stable' ? 'stable' : 'latest';
        return getLatestVersionFromArtifactory(npmTag);
    }
    // Use GCS for external users
    return getLatestVersionFromBinaryRepo(channel, GCS_BUCKET_URL);
}
async function downloadVersionFromArtifactory(version, stagingPath) {
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    // If we get here, we own the lock and can delete a partial download
    await fs.rm(stagingPath, { recursive: true, force: true });
    // Get the platform-specific package name
    const platform = (0, installer_js_1.getPlatform)();
    const platformPackageName = `${MACRO.NATIVE_PACKAGE_URL}-${platform}`;
    // Fetch integrity hash for the platform-specific package
    (0, debug_js_1.logForDebugging)(`Fetching integrity hash for ${platformPackageName}@${version}`);
    const { stdout: integrityOutput, code, stderr, } = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)('npm', [
        'view',
        `${platformPackageName}@${version}`,
        'dist.integrity',
        '--registry',
        exports.ARTIFACTORY_REGISTRY_URL,
    ], {
        timeout: 30000,
        preserveOutputOnError: true,
    });
    if (code !== 0) {
        throw new Error(`npm view integrity failed with code ${code}: ${stderr}`);
    }
    const integrity = integrityOutput.trim();
    if (!integrity) {
        throw new Error(`Failed to fetch integrity hash for ${platformPackageName}@${version}`);
    }
    (0, debug_js_1.logForDebugging)(`Got integrity hash for ${platform}: ${integrity}`);
    // Create isolated npm project in staging
    await fs.mkdir(stagingPath);
    const packageJson = {
        name: 'claude-native-installer',
        version: '0.0.1',
        dependencies: {
            [MACRO.NATIVE_PACKAGE_URL]: version,
        },
    };
    // Create package-lock.json with integrity verification for platform-specific package
    const packageLock = {
        name: 'claude-native-installer',
        version: '0.0.1',
        lockfileVersion: 3,
        requires: true,
        packages: {
            '': {
                name: 'claude-native-installer',
                version: '0.0.1',
                dependencies: {
                    [MACRO.NATIVE_PACKAGE_URL]: version,
                },
            },
            [`node_modules/${MACRO.NATIVE_PACKAGE_URL}`]: {
                version: version,
                optionalDependencies: {
                    [platformPackageName]: version,
                },
            },
            [`node_modules/${platformPackageName}`]: {
                version: version,
                integrity: integrity,
            },
        },
    };
    (0, slowOperations_js_1.writeFileSync_DEPRECATED)((0, path_1.join)(stagingPath, 'package.json'), (0, slowOperations_js_1.jsonStringify)(packageJson, null, 2), { encoding: 'utf8', flush: true });
    (0, slowOperations_js_1.writeFileSync_DEPRECATED)((0, path_1.join)(stagingPath, 'package-lock.json'), (0, slowOperations_js_1.jsonStringify)(packageLock, null, 2), { encoding: 'utf8', flush: true });
    // Install with npm - it will verify integrity from package-lock.json
    // Use --prefer-online to force fresh metadata checks, helping with Artifactory replication delays
    const result = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)('npm', ['ci', '--prefer-online', '--registry', exports.ARTIFACTORY_REGISTRY_URL], {
        timeout: 60000,
        preserveOutputOnError: true,
        cwd: stagingPath,
    });
    if (result.code !== 0) {
        throw new Error(`npm ci failed with code ${result.code}: ${result.stderr}`);
    }
    (0, debug_js_1.logForDebugging)(`Successfully downloaded and verified ${MACRO.NATIVE_PACKAGE_URL}@${version}`);
}
// Stall timeout: abort if no bytes received for this duration
const DEFAULT_STALL_TIMEOUT_MS = 60000; // 60 seconds
const MAX_DOWNLOAD_RETRIES = 3;
exports.MAX_DOWNLOAD_RETRIES = MAX_DOWNLOAD_RETRIES;
function getStallTimeoutMs() {
    return (Number(process.env.CLAUDE_CODE_STALL_TIMEOUT_MS_FOR_TESTING) ||
        DEFAULT_STALL_TIMEOUT_MS);
}
class StallTimeoutError extends Error {
    constructor() {
        super('Download stalled: no data received for 60 seconds');
        this.name = 'StallTimeoutError';
    }
}
exports.StallTimeoutError = StallTimeoutError;
/**
 * Common logic for downloading and verifying a binary.
 * Includes stall detection (aborts if no bytes for 60s) and retry logic.
 */
async function downloadAndVerifyBinary(binaryUrl, expectedChecksum, binaryPath, requestConfig = {}) {
    let lastError;
    for (let attempt = 1; attempt <= MAX_DOWNLOAD_RETRIES; attempt++) {
        const controller = new AbortController();
        let stallTimer;
        const clearStallTimer = () => {
            if (stallTimer) {
                clearTimeout(stallTimer);
                stallTimer = undefined;
            }
        };
        const resetStallTimer = () => {
            clearStallTimer();
            stallTimer = setTimeout(c => c.abort(), getStallTimeoutMs(), controller);
        };
        try {
            // Start the stall timer before the request
            resetStallTimer();
            const response = await axios_1.default.get(binaryUrl, {
                timeout: 5 * 60000, // 5 minute total timeout
                responseType: 'arraybuffer',
                signal: controller.signal,
                onDownloadProgress: () => {
                    // Reset stall timer on each chunk of data received
                    resetStallTimer();
                },
                ...requestConfig,
            });
            clearStallTimer();
            // Verify checksum
            const hash = (0, crypto_1.createHash)('sha256');
            hash.update(response.data);
            const actualChecksum = hash.digest('hex');
            if (actualChecksum !== expectedChecksum) {
                throw new Error(`Checksum mismatch: expected ${expectedChecksum}, got ${actualChecksum}`);
            }
            // Write binary to disk
            await (0, promises_1.writeFile)(binaryPath, Buffer.from(response.data));
            await (0, promises_1.chmod)(binaryPath, 0o755);
            // Success - return early
            return;
        }
        catch (error) {
            clearStallTimer();
            // Check if this was a stall timeout (axios wraps abort signals in CanceledError)
            const isStallTimeout = axios_1.default.isCancel(error);
            if (isStallTimeout) {
                lastError = new StallTimeoutError();
            }
            else {
                lastError = (0, errors_js_1.toError)(error);
            }
            // Only retry on stall timeouts
            if (isStallTimeout && attempt < MAX_DOWNLOAD_RETRIES) {
                (0, debug_js_1.logForDebugging)(`Download stalled on attempt ${attempt}/${MAX_DOWNLOAD_RETRIES}, retrying...`);
                // Brief pause before retry to let network recover
                await (0, sleep_js_1.sleep)(1000);
                continue;
            }
            // Don't retry other errors (HTTP errors, checksum mismatches, etc.)
            throw lastError;
        }
    }
    // Should not reach here, but just in case
    throw lastError ?? new Error('Download failed after all retries');
}
async function downloadVersionFromBinaryRepo(version, stagingPath, baseUrl, authConfig) {
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    // If we get here, we own the lock and can delete a partial download
    await fs.rm(stagingPath, { recursive: true, force: true });
    // Get platform
    const platform = (0, installer_js_1.getPlatform)();
    const startTime = Date.now();
    // Log download attempt start
    (0, index_js_1.logEvent)('tengu_binary_download_attempt', {});
    // Fetch manifest to get checksum
    let manifest;
    try {
        const manifestResponse = await axios_1.default.get(`${baseUrl}/${version}/manifest.json`, {
            timeout: 10000,
            responseType: 'json',
            ...authConfig,
        });
        manifest = manifestResponse.data;
    }
    catch (error) {
        const latencyMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        let httpStatus;
        if (axios_1.default.isAxiosError(error) && error.response) {
            httpStatus = error.response.status;
        }
        (0, index_js_1.logEvent)('tengu_binary_manifest_fetch_failure', {
            latency_ms: latencyMs,
            http_status: httpStatus,
            is_timeout: errorMessage.includes('timeout'),
        });
        (0, log_js_1.logError)(new Error(`Failed to fetch manifest from ${baseUrl}/${version}/manifest.json: ${errorMessage}`));
        throw error;
    }
    const platformInfo = manifest.platforms[platform];
    if (!platformInfo) {
        (0, index_js_1.logEvent)('tengu_binary_platform_not_found', {});
        throw new Error(`Platform ${platform} not found in manifest for version ${version}`);
    }
    const expectedChecksum = platformInfo.checksum;
    // Both GCS and generic bucket use identical layout: ${baseUrl}/${version}/${platform}/${binaryName}
    const binaryName = (0, installer_js_1.getBinaryName)(platform);
    const binaryUrl = `${baseUrl}/${version}/${platform}/${binaryName}`;
    // Write to staging
    await fs.mkdir(stagingPath);
    const binaryPath = (0, path_1.join)(stagingPath, binaryName);
    try {
        await downloadAndVerifyBinary(binaryUrl, expectedChecksum, binaryPath, authConfig || {});
        const latencyMs = Date.now() - startTime;
        (0, index_js_1.logEvent)('tengu_binary_download_success', {
            latency_ms: latencyMs,
        });
    }
    catch (error) {
        const latencyMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        let httpStatus;
        if (axios_1.default.isAxiosError(error) && error.response) {
            httpStatus = error.response.status;
        }
        (0, index_js_1.logEvent)('tengu_binary_download_failure', {
            latency_ms: latencyMs,
            http_status: httpStatus,
            is_timeout: errorMessage.includes('timeout'),
            is_checksum_mismatch: errorMessage.includes('Checksum mismatch'),
        });
        (0, log_js_1.logError)(new Error(`Failed to download binary from ${binaryUrl}: ${errorMessage}`));
        throw error;
    }
}
async function downloadVersion(version, stagingPath) {
    // Test-fixture versions route to the private sentinel bucket. DCE'd in all
    // shipped builds — the string 'claude-code-ci-sentinel' and the gcloud call
    // never exist in compiled binaries. Same gcloud-token pattern as
    // remoteSkillLoader.ts:175-195.
    if ((0, bun_bundle_1.feature)('ALLOW_TEST_VERSIONS') && /^99\.99\./.test(version)) {
        const { stdout } = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)('gcloud', [
            'auth',
            'print-access-token',
        ]);
        await downloadVersionFromBinaryRepo(version, stagingPath, 'https://storage.googleapis.com/claude-code-ci-sentinel', { headers: { Authorization: `Bearer ${stdout.trim()}` } });
        return 'binary';
    }
    if (process.env.USER_TYPE === 'ant') {
        // Use Artifactory for ant users
        await downloadVersionFromArtifactory(version, stagingPath);
        return 'npm';
    }
    // Use GCS for external users
    await downloadVersionFromBinaryRepo(version, stagingPath, GCS_BUCKET_URL);
    return 'binary';
}
exports.STALL_TIMEOUT_MS = DEFAULT_STALL_TIMEOUT_MS;
exports._downloadAndVerifyBinaryForTesting = downloadAndVerifyBinary;
