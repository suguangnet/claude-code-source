"use strict";
/**
 * Auto-install logic for the official Anthropic marketplace.
 *
 * This module handles automatically installing the official marketplace
 * on startup for new users, with appropriate checks for:
 * - Enterprise policy restrictions
 * - Git availability
 * - Previous installation attempts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RETRY_CONFIG = void 0;
exports.isOfficialMarketplaceAutoInstallDisabled = isOfficialMarketplaceAutoInstallDisabled;
exports.checkAndInstallOfficialMarketplace = checkAndInstallOfficialMarketplace;
const path_1 = require("path");
const growthbook_js_1 = require("../../services/analytics/growthbook.js");
const index_js_1 = require("../../services/analytics/index.js");
const config_js_1 = require("../config.js");
const debug_js_1 = require("../debug.js");
const envUtils_js_1 = require("../envUtils.js");
const errors_js_1 = require("../errors.js");
const log_js_1 = require("../log.js");
const gitAvailability_js_1 = require("./gitAvailability.js");
const marketplaceHelpers_js_1 = require("./marketplaceHelpers.js");
const marketplaceManager_js_1 = require("./marketplaceManager.js");
const officialMarketplace_js_1 = require("./officialMarketplace.js");
const officialMarketplaceGcs_js_1 = require("./officialMarketplaceGcs.js");
/**
 * Check if official marketplace auto-install is disabled via environment variable.
 */
function isOfficialMarketplaceAutoInstallDisabled() {
    return (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL);
}
/**
 * Configuration for retry logic
 */
exports.RETRY_CONFIG = {
    MAX_ATTEMPTS: 10,
    INITIAL_DELAY_MS: 60 * 60 * 1000, // 1 hour
    BACKOFF_MULTIPLIER: 2,
    MAX_DELAY_MS: 7 * 24 * 60 * 60 * 1000, // 1 week
};
/**
 * Calculate next retry delay using exponential backoff
 */
function calculateNextRetryDelay(retryCount) {
    const delay = exports.RETRY_CONFIG.INITIAL_DELAY_MS *
        Math.pow(exports.RETRY_CONFIG.BACKOFF_MULTIPLIER, retryCount);
    return Math.min(delay, exports.RETRY_CONFIG.MAX_DELAY_MS);
}
/**
 * Determine if installation should be retried based on failure reason and retry state
 */
function shouldRetryInstallation(config) {
    // If never attempted, should try
    if (!config.officialMarketplaceAutoInstallAttempted) {
        return true;
    }
    // If already installed successfully, don't retry
    if (config.officialMarketplaceAutoInstalled) {
        return false;
    }
    const failReason = config.officialMarketplaceAutoInstallFailReason;
    const retryCount = config.officialMarketplaceAutoInstallRetryCount || 0;
    const nextRetryTime = config.officialMarketplaceAutoInstallNextRetryTime;
    const now = Date.now();
    // Check if we've exceeded max attempts
    if (retryCount >= exports.RETRY_CONFIG.MAX_ATTEMPTS) {
        return false;
    }
    // Permanent failures - don't retry
    if (failReason === 'policy_blocked') {
        return false;
    }
    // Check if enough time has passed for next retry
    if (nextRetryTime && now < nextRetryTime) {
        return false;
    }
    // Retry for temporary failures (unknown), semi-permanent (git_unavailable),
    // and legacy state (undefined failReason from before retry logic existed)
    return (failReason === 'unknown' ||
        failReason === 'git_unavailable' ||
        failReason === 'gcs_unavailable' ||
        failReason === undefined);
}
/**
 * Check and install the official marketplace on startup.
 *
 * This function is designed to be called as a fire-and-forget operation
 * during startup. It will:
 * 1. Check if installation was already attempted
 * 2. Check if marketplace is already installed
 * 3. Check enterprise policy restrictions
 * 4. Check git availability
 * 5. Attempt installation
 * 6. Record the result in GlobalConfig
 *
 * @returns Result indicating whether installation succeeded or was skipped
 */
async function checkAndInstallOfficialMarketplace() {
    const config = (0, config_js_1.getGlobalConfig)();
    // Check if we should retry installation
    if (!shouldRetryInstallation(config)) {
        const reason = config.officialMarketplaceAutoInstallFailReason ?? 'already_attempted';
        (0, debug_js_1.logForDebugging)(`Official marketplace auto-install skipped: ${reason}`);
        return {
            installed: false,
            skipped: true,
            reason,
        };
    }
    try {
        // Check if auto-install is disabled via env var
        if (isOfficialMarketplaceAutoInstallDisabled()) {
            (0, debug_js_1.logForDebugging)('Official marketplace auto-install disabled via env var, skipping');
            (0, config_js_1.saveGlobalConfig)(current => ({
                ...current,
                officialMarketplaceAutoInstallAttempted: true,
                officialMarketplaceAutoInstalled: false,
                officialMarketplaceAutoInstallFailReason: 'policy_blocked',
            }));
            (0, index_js_1.logEvent)('tengu_official_marketplace_auto_install', {
                installed: false,
                skipped: true,
                policy_blocked: true,
            });
            return { installed: false, skipped: true, reason: 'policy_blocked' };
        }
        // Check if marketplace is already installed
        const knownMarketplaces = await (0, marketplaceManager_js_1.loadKnownMarketplacesConfig)();
        if (knownMarketplaces[officialMarketplace_js_1.OFFICIAL_MARKETPLACE_NAME]) {
            (0, debug_js_1.logForDebugging)(`Official marketplace '${officialMarketplace_js_1.OFFICIAL_MARKETPLACE_NAME}' already installed, skipping`);
            // Mark as attempted so we don't check again
            (0, config_js_1.saveGlobalConfig)(current => ({
                ...current,
                officialMarketplaceAutoInstallAttempted: true,
                officialMarketplaceAutoInstalled: true,
            }));
            return { installed: false, skipped: true, reason: 'already_installed' };
        }
        // Check enterprise policy restrictions
        if (!(0, marketplaceHelpers_js_1.isSourceAllowedByPolicy)(officialMarketplace_js_1.OFFICIAL_MARKETPLACE_SOURCE)) {
            (0, debug_js_1.logForDebugging)('Official marketplace blocked by enterprise policy, skipping');
            (0, config_js_1.saveGlobalConfig)(current => ({
                ...current,
                officialMarketplaceAutoInstallAttempted: true,
                officialMarketplaceAutoInstalled: false,
                officialMarketplaceAutoInstallFailReason: 'policy_blocked',
            }));
            (0, index_js_1.logEvent)('tengu_official_marketplace_auto_install', {
                installed: false,
                skipped: true,
                policy_blocked: true,
            });
            return { installed: false, skipped: true, reason: 'policy_blocked' };
        }
        // inc-5046: try GCS mirror first — doesn't need git, doesn't hit GitHub.
        // Backend (anthropic#317037) publishes a marketplace zip to the same
        // bucket as the native binary. If GCS succeeds, register the marketplace
        // with source:'github' (still true — GCS is a mirror) and skip git
        // entirely.
        const cacheDir = (0, marketplaceManager_js_1.getMarketplacesCacheDir)();
        const installLocation = (0, path_1.join)(cacheDir, officialMarketplace_js_1.OFFICIAL_MARKETPLACE_NAME);
        const gcsSha = await (0, officialMarketplaceGcs_js_1.fetchOfficialMarketplaceFromGcs)(installLocation, cacheDir);
        if (gcsSha !== null) {
            const known = await (0, marketplaceManager_js_1.loadKnownMarketplacesConfig)();
            known[officialMarketplace_js_1.OFFICIAL_MARKETPLACE_NAME] = {
                source: officialMarketplace_js_1.OFFICIAL_MARKETPLACE_SOURCE,
                installLocation,
                lastUpdated: new Date().toISOString(),
            };
            await (0, marketplaceManager_js_1.saveKnownMarketplacesConfig)(known);
            (0, config_js_1.saveGlobalConfig)(current => ({
                ...current,
                officialMarketplaceAutoInstallAttempted: true,
                officialMarketplaceAutoInstalled: true,
                officialMarketplaceAutoInstallFailReason: undefined,
                officialMarketplaceAutoInstallRetryCount: undefined,
                officialMarketplaceAutoInstallLastAttemptTime: undefined,
                officialMarketplaceAutoInstallNextRetryTime: undefined,
            }));
            (0, index_js_1.logEvent)('tengu_official_marketplace_auto_install', {
                installed: true,
                skipped: false,
                via_gcs: true,
            });
            return { installed: true, skipped: false };
        }
        // GCS failed (404 until backend writes, or network). Fall through to git
        // ONLY if the kill-switch allows — same gate as refreshMarketplace().
        if (!(0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_plugin_official_mkt_git_fallback', true)) {
            (0, debug_js_1.logForDebugging)('Official marketplace GCS failed; git fallback disabled by flag — skipping install');
            // Same retry-with-backoff metadata as git_unavailable below — transient
            // GCS failures should retry with exponential backoff, not give up.
            const retryCount = (config.officialMarketplaceAutoInstallRetryCount || 0) + 1;
            const now = Date.now();
            const nextRetryTime = now + calculateNextRetryDelay(retryCount);
            (0, config_js_1.saveGlobalConfig)(current => ({
                ...current,
                officialMarketplaceAutoInstallAttempted: true,
                officialMarketplaceAutoInstalled: false,
                officialMarketplaceAutoInstallFailReason: 'gcs_unavailable',
                officialMarketplaceAutoInstallRetryCount: retryCount,
                officialMarketplaceAutoInstallLastAttemptTime: now,
                officialMarketplaceAutoInstallNextRetryTime: nextRetryTime,
            }));
            (0, index_js_1.logEvent)('tengu_official_marketplace_auto_install', {
                installed: false,
                skipped: true,
                gcs_unavailable: true,
                retry_count: retryCount,
            });
            return { installed: false, skipped: true, reason: 'gcs_unavailable' };
        }
        // Check git availability
        const gitAvailable = await (0, gitAvailability_js_1.checkGitAvailable)();
        if (!gitAvailable) {
            (0, debug_js_1.logForDebugging)('Git not available, skipping official marketplace auto-install');
            const retryCount = (config.officialMarketplaceAutoInstallRetryCount || 0) + 1;
            const now = Date.now();
            const nextRetryDelay = calculateNextRetryDelay(retryCount);
            const nextRetryTime = now + nextRetryDelay;
            let configSaveFailed = false;
            try {
                (0, config_js_1.saveGlobalConfig)(current => ({
                    ...current,
                    officialMarketplaceAutoInstallAttempted: true,
                    officialMarketplaceAutoInstalled: false,
                    officialMarketplaceAutoInstallFailReason: 'git_unavailable',
                    officialMarketplaceAutoInstallRetryCount: retryCount,
                    officialMarketplaceAutoInstallLastAttemptTime: now,
                    officialMarketplaceAutoInstallNextRetryTime: nextRetryTime,
                }));
            }
            catch (saveError) {
                configSaveFailed = true;
                // Log the error properly so it gets tracked
                const configError = (0, errors_js_1.toError)(saveError);
                (0, log_js_1.logError)(configError);
                (0, debug_js_1.logForDebugging)(`Failed to save marketplace auto-install git_unavailable state: ${saveError}`, { level: 'error' });
            }
            (0, index_js_1.logEvent)('tengu_official_marketplace_auto_install', {
                installed: false,
                skipped: true,
                git_unavailable: true,
                retry_count: retryCount,
            });
            return {
                installed: false,
                skipped: true,
                reason: 'git_unavailable',
                configSaveFailed,
            };
        }
        // Attempt installation
        (0, debug_js_1.logForDebugging)('Attempting to auto-install official marketplace');
        await (0, marketplaceManager_js_1.addMarketplaceSource)(officialMarketplace_js_1.OFFICIAL_MARKETPLACE_SOURCE);
        // Success
        (0, debug_js_1.logForDebugging)('Successfully auto-installed official marketplace');
        const previousRetryCount = config.officialMarketplaceAutoInstallRetryCount || 0;
        (0, config_js_1.saveGlobalConfig)(current => ({
            ...current,
            officialMarketplaceAutoInstallAttempted: true,
            officialMarketplaceAutoInstalled: true,
            // Clear retry metadata on success
            officialMarketplaceAutoInstallFailReason: undefined,
            officialMarketplaceAutoInstallRetryCount: undefined,
            officialMarketplaceAutoInstallLastAttemptTime: undefined,
            officialMarketplaceAutoInstallNextRetryTime: undefined,
        }));
        (0, index_js_1.logEvent)('tengu_official_marketplace_auto_install', {
            installed: true,
            skipped: false,
            retry_count: previousRetryCount,
        });
        return { installed: true, skipped: false };
    }
    catch (error) {
        // Handle installation failure
        const errorMessage = error instanceof Error ? error.message : String(error);
        // On macOS, /usr/bin/git is an xcrun shim that always exists on PATH, so
        // checkGitAvailable() (which only does `which git`) passes even without
        // Xcode CLT installed. The shim then fails at clone time with
        // "xcrun: error: invalid active developer path (...)". Poison the memoized
        // availability check so other git callers in this session skip cleanly,
        // then return silently without recording any attempt state — next startup
        // tries fresh (no backoff machinery for what is effectively "git absent").
        if (errorMessage.includes('xcrun: error:')) {
            (0, gitAvailability_js_1.markGitUnavailable)();
            (0, debug_js_1.logForDebugging)('Official marketplace auto-install: git is a non-functional macOS xcrun shim, treating as git_unavailable');
            (0, index_js_1.logEvent)('tengu_official_marketplace_auto_install', {
                installed: false,
                skipped: true,
                git_unavailable: true,
                macos_xcrun_shim: true,
            });
            return {
                installed: false,
                skipped: true,
                reason: 'git_unavailable',
            };
        }
        (0, debug_js_1.logForDebugging)(`Failed to auto-install official marketplace: ${errorMessage}`, { level: 'error' });
        (0, log_js_1.logError)((0, errors_js_1.toError)(error));
        const retryCount = (config.officialMarketplaceAutoInstallRetryCount || 0) + 1;
        const now = Date.now();
        const nextRetryDelay = calculateNextRetryDelay(retryCount);
        const nextRetryTime = now + nextRetryDelay;
        let configSaveFailed = false;
        try {
            (0, config_js_1.saveGlobalConfig)(current => ({
                ...current,
                officialMarketplaceAutoInstallAttempted: true,
                officialMarketplaceAutoInstalled: false,
                officialMarketplaceAutoInstallFailReason: 'unknown',
                officialMarketplaceAutoInstallRetryCount: retryCount,
                officialMarketplaceAutoInstallLastAttemptTime: now,
                officialMarketplaceAutoInstallNextRetryTime: nextRetryTime,
            }));
        }
        catch (saveError) {
            configSaveFailed = true;
            // Log the error properly so it gets tracked
            const configError = (0, errors_js_1.toError)(saveError);
            (0, log_js_1.logError)(configError);
            (0, debug_js_1.logForDebugging)(`Failed to save marketplace auto-install failure state: ${saveError}`, { level: 'error' });
            // Still return the failure result even if config save failed
            // This ensures we report the installation failure correctly
        }
        (0, index_js_1.logEvent)('tengu_official_marketplace_auto_install', {
            installed: false,
            skipped: true,
            failed: true,
            retry_count: retryCount,
        });
        return {
            installed: false,
            skipped: true,
            reason: 'unknown',
            configSaveFailed,
        };
    }
}
