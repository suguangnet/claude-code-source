"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGitEmail = exports.getCoreUserData = void 0;
exports.initUser = initUser;
exports.resetUserCache = resetUserCache;
exports.getUserForGrowthBook = getUserForGrowthBook;
const execa_1 = require("execa");
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const state_js_1 = require("../bootstrap/state.js");
const auth_js_1 = require("./auth.js");
const config_js_1 = require("./config.js");
const cwd_js_1 = require("./cwd.js");
const env_js_1 = require("./env.js");
const envUtils_js_1 = require("./envUtils.js");
// Cache for email fetched asynchronously at startup
let cachedEmail = null; // null means not fetched yet
let emailFetchPromise = null;
/**
 * Initialize user data asynchronously. Should be called early in startup.
 * This pre-fetches the email so getUser() can remain synchronous.
 */
async function initUser() {
    if (cachedEmail === null && !emailFetchPromise) {
        emailFetchPromise = getEmailAsync();
        cachedEmail = await emailFetchPromise;
        emailFetchPromise = null;
        // Clear memoization cache so next call picks up the email
        exports.getCoreUserData.cache.clear?.();
    }
}
/**
 * Reset all user data caches. Call on auth changes (login/logout/account switch)
 * so the next getCoreUserData() call picks up fresh credentials and email.
 */
function resetUserCache() {
    cachedEmail = null;
    emailFetchPromise = null;
    exports.getCoreUserData.cache.clear?.();
    exports.getGitEmail.cache.clear?.();
}
/**
 * Get core user data.
 * This is the base representation that gets transformed for different analytics providers.
 */
exports.getCoreUserData = (0, memoize_js_1.default)((includeAnalyticsMetadata) => {
    const deviceId = (0, config_js_1.getOrCreateUserID)();
    const config = (0, config_js_1.getGlobalConfig)();
    let subscriptionType;
    let rateLimitTier;
    let firstTokenTime;
    if (includeAnalyticsMetadata) {
        subscriptionType = (0, auth_js_1.getSubscriptionType)() ?? undefined;
        rateLimitTier = (0, auth_js_1.getRateLimitTier)() ?? undefined;
        if (subscriptionType && config.claudeCodeFirstTokenDate) {
            const configFirstTokenTime = new Date(config.claudeCodeFirstTokenDate).getTime();
            if (!isNaN(configFirstTokenTime)) {
                firstTokenTime = configFirstTokenTime;
            }
        }
    }
    // Only include OAuth account data when actively using OAuth authentication
    const oauthAccount = (0, auth_js_1.getOauthAccountInfo)();
    const organizationUuid = oauthAccount?.organizationUuid;
    const accountUuid = oauthAccount?.accountUuid;
    return {
        deviceId,
        sessionId: (0, state_js_1.getSessionId)(),
        email: getEmail(),
        appVersion: MACRO.VERSION,
        platform: (0, env_js_1.getHostPlatformForAnalytics)(),
        organizationUuid,
        accountUuid,
        userType: process.env.USER_TYPE,
        subscriptionType,
        rateLimitTier,
        firstTokenTime,
        ...((0, envUtils_js_1.isEnvTruthy)(process.env.GITHUB_ACTIONS) && {
            githubActionsMetadata: {
                actor: process.env.GITHUB_ACTOR,
                actorId: process.env.GITHUB_ACTOR_ID,
                repository: process.env.GITHUB_REPOSITORY,
                repositoryId: process.env.GITHUB_REPOSITORY_ID,
                repositoryOwner: process.env.GITHUB_REPOSITORY_OWNER,
                repositoryOwnerId: process.env.GITHUB_REPOSITORY_OWNER_ID,
            },
        }),
    };
});
/**
 * Get user data for GrowthBook (same as core data with analytics metadata).
 */
function getUserForGrowthBook() {
    return (0, exports.getCoreUserData)(true);
}
function getEmail() {
    // Return cached email if available (from async initialization)
    if (cachedEmail !== null) {
        return cachedEmail;
    }
    // Only include OAuth email when actively using OAuth authentication
    const oauthAccount = (0, auth_js_1.getOauthAccountInfo)();
    if (oauthAccount?.emailAddress) {
        return oauthAccount.emailAddress;
    }
    // Ant-only fallbacks below (no execSync)
    if (process.env.USER_TYPE !== 'ant') {
        return undefined;
    }
    if (process.env.COO_CREATOR) {
        return `${process.env.COO_CREATOR}@anthropic.com`;
    }
    // If initUser() wasn't called, we return undefined instead of blocking
    return undefined;
}
async function getEmailAsync() {
    // Only include OAuth email when actively using OAuth authentication
    const oauthAccount = (0, auth_js_1.getOauthAccountInfo)();
    if (oauthAccount?.emailAddress) {
        return oauthAccount.emailAddress;
    }
    // Ant-only fallbacks below
    if (process.env.USER_TYPE !== 'ant') {
        return undefined;
    }
    if (process.env.COO_CREATOR) {
        return `${process.env.COO_CREATOR}@anthropic.com`;
    }
    return (0, exports.getGitEmail)();
}
/**
 * Get the user's git email from `git config user.email`.
 * Memoized so the subprocess only spawns once per process.
 */
exports.getGitEmail = (0, memoize_js_1.default)(async () => {
    const result = await (0, execa_1.execa)('git config --get user.email', {
        shell: true,
        reject: false,
        cwd: (0, cwd_js_1.getCwd)(),
    });
    return result.exitCode === 0 && result.stdout
        ? result.stdout.trim()
        : undefined;
});
