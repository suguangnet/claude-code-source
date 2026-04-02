"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkNeedsClaudeAiLogin = checkNeedsClaudeAiLogin;
exports.checkIsGitClean = checkIsGitClean;
exports.checkHasRemoteEnvironment = checkHasRemoteEnvironment;
exports.checkIsInGitRepo = checkIsInGitRepo;
exports.checkHasGitRemote = checkHasGitRemote;
exports.checkGithubAppInstalled = checkGithubAppInstalled;
exports.checkGithubTokenSynced = checkGithubTokenSynced;
exports.checkRepoForRemoteAccess = checkRepoForRemoteAccess;
const axios_1 = __importDefault(require("axios"));
const oauth_js_1 = require("src/constants/oauth.js");
const client_js_1 = require("src/services/oauth/client.js");
const growthbook_js_1 = require("../../../services/analytics/growthbook.js");
const auth_js_1 = require("../../auth.js");
const cwd_js_1 = require("../../cwd.js");
const debug_js_1 = require("../../debug.js");
const detectRepository_js_1 = require("../../detectRepository.js");
const errors_js_1 = require("../../errors.js");
const git_js_1 = require("../../git.js");
const api_js_1 = require("../../teleport/api.js");
const environments_js_1 = require("../../teleport/environments.js");
/**
 * Checks if user needs to log in with Claude.ai
 * Extracted from getTeleportErrors() in TeleportError.tsx
 * @returns true if login is required, false otherwise
 */
async function checkNeedsClaudeAiLogin() {
    if (!(0, auth_js_1.isClaudeAISubscriber)()) {
        return false;
    }
    return (0, auth_js_1.checkAndRefreshOAuthTokenIfNeeded)();
}
/**
 * Checks if git working directory is clean (no uncommitted changes)
 * Ignores untracked files since they won't be lost during branch switching
 * Extracted from getTeleportErrors() in TeleportError.tsx
 * @returns true if git is clean, false otherwise
 */
async function checkIsGitClean() {
    const isClean = await (0, git_js_1.getIsClean)({ ignoreUntracked: true });
    return isClean;
}
/**
 * Checks if user has access to at least one remote environment
 * @returns true if user has remote environments, false otherwise
 */
async function checkHasRemoteEnvironment() {
    try {
        const environments = await (0, environments_js_1.fetchEnvironments)();
        return environments.length > 0;
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`checkHasRemoteEnvironment failed: ${(0, errors_js_1.errorMessage)(error)}`);
        return false;
    }
}
/**
 * Checks if current directory is inside a git repository (has .git/).
 * Distinct from checkHasGitRemote — a local-only repo passes this but not that.
 */
function checkIsInGitRepo() {
    return (0, git_js_1.findGitRoot)((0, cwd_js_1.getCwd)()) !== null;
}
/**
 * Checks if current repository has a GitHub remote configured.
 * Returns false for local-only repos (git init with no `origin`).
 */
async function checkHasGitRemote() {
    const repository = await (0, detectRepository_js_1.detectCurrentRepository)();
    return repository !== null;
}
/**
 * Checks if GitHub app is installed on a specific repository
 * @param owner The repository owner (e.g., "anthropics")
 * @param repo The repository name (e.g., "claude-cli-internal")
 * @returns true if GitHub app is installed, false otherwise
 */
async function checkGithubAppInstalled(owner, repo, signal) {
    try {
        const accessToken = (0, auth_js_1.getClaudeAIOAuthTokens)()?.accessToken;
        if (!accessToken) {
            (0, debug_js_1.logForDebugging)('checkGithubAppInstalled: No access token found, assuming app not installed');
            return false;
        }
        const orgUUID = await (0, client_js_1.getOrganizationUUID)();
        if (!orgUUID) {
            (0, debug_js_1.logForDebugging)('checkGithubAppInstalled: No org UUID found, assuming app not installed');
            return false;
        }
        const url = `${(0, oauth_js_1.getOauthConfig)().BASE_API_URL}/api/oauth/organizations/${orgUUID}/code/repos/${owner}/${repo}`;
        const headers = {
            ...(0, api_js_1.getOAuthHeaders)(accessToken),
            'x-organization-uuid': orgUUID,
        };
        (0, debug_js_1.logForDebugging)(`Checking GitHub app installation for ${owner}/${repo}`);
        const response = await axios_1.default.get(url, {
            headers,
            timeout: 15000,
            signal,
        });
        if (response.status === 200) {
            if (response.data.status) {
                const installed = response.data.status.app_installed;
                (0, debug_js_1.logForDebugging)(`GitHub app ${installed ? 'is' : 'is not'} installed on ${owner}/${repo}`);
                return installed;
            }
            // status is null - app is not installed on this repo
            (0, debug_js_1.logForDebugging)(`GitHub app is not installed on ${owner}/${repo} (status is null)`);
            return false;
        }
        (0, debug_js_1.logForDebugging)(`checkGithubAppInstalled: Unexpected response status ${response.status}`);
        return false;
    }
    catch (error) {
        // 4XX errors typically mean app is not installed or repo not accessible
        if (axios_1.default.isAxiosError(error)) {
            const status = error.response?.status;
            if (status && status >= 400 && status < 500) {
                (0, debug_js_1.logForDebugging)(`checkGithubAppInstalled: Got ${status} error, app likely not installed on ${owner}/${repo}`);
                return false;
            }
        }
        (0, debug_js_1.logForDebugging)(`checkGithubAppInstalled error: ${(0, errors_js_1.errorMessage)(error)}`);
        return false;
    }
}
/**
 * Checks if the user has synced their GitHub credentials via /web-setup
 * @returns true if GitHub token is synced, false otherwise
 */
async function checkGithubTokenSynced() {
    try {
        const accessToken = (0, auth_js_1.getClaudeAIOAuthTokens)()?.accessToken;
        if (!accessToken) {
            (0, debug_js_1.logForDebugging)('checkGithubTokenSynced: No access token found');
            return false;
        }
        const orgUUID = await (0, client_js_1.getOrganizationUUID)();
        if (!orgUUID) {
            (0, debug_js_1.logForDebugging)('checkGithubTokenSynced: No org UUID found');
            return false;
        }
        const url = `${(0, oauth_js_1.getOauthConfig)().BASE_API_URL}/api/oauth/organizations/${orgUUID}/sync/github/auth`;
        const headers = {
            ...(0, api_js_1.getOAuthHeaders)(accessToken),
            'x-organization-uuid': orgUUID,
        };
        (0, debug_js_1.logForDebugging)('Checking if GitHub token is synced via web-setup');
        const response = await axios_1.default.get(url, {
            headers,
            timeout: 15000,
        });
        const synced = response.status === 200 && response.data?.is_authenticated === true;
        (0, debug_js_1.logForDebugging)(`GitHub token synced: ${synced} (status=${response.status}, data=${JSON.stringify(response.data)})`);
        return synced;
    }
    catch (error) {
        if (axios_1.default.isAxiosError(error)) {
            const status = error.response?.status;
            if (status && status >= 400 && status < 500) {
                (0, debug_js_1.logForDebugging)(`checkGithubTokenSynced: Got ${status}, token not synced`);
                return false;
            }
        }
        (0, debug_js_1.logForDebugging)(`checkGithubTokenSynced error: ${(0, errors_js_1.errorMessage)(error)}`);
        return false;
    }
}
/**
 * Tiered check for whether a GitHub repo is accessible for remote operations.
 * 1. GitHub App installed on the repo
 * 2. GitHub token synced via /web-setup
 * 3. Neither — caller should prompt user to set up access
 */
async function checkRepoForRemoteAccess(owner, repo) {
    if (await checkGithubAppInstalled(owner, repo)) {
        return { hasAccess: true, method: 'github-app' };
    }
    if ((0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_cobalt_lantern', false) &&
        (await checkGithubTokenSynced())) {
        return { hasAccess: true, method: 'token-sync' };
    }
    return { hasAccess: false, method: 'none' };
}
