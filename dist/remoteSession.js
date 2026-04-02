"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkBackgroundRemoteSessionEligibility = checkBackgroundRemoteSessionEligibility;
const growthbook_js_1 = require("../../../services/analytics/growthbook.js");
const index_js_1 = require("../../../services/policyLimits/index.js");
const detectRepository_js_1 = require("../../detectRepository.js");
const envUtils_js_1 = require("../../envUtils.js");
const preconditions_js_1 = require("./preconditions.js");
/**
 * Checks eligibility for creating a background remote session
 * Returns an array of failed preconditions (empty array means all checks passed)
 *
 * @returns Array of failed preconditions
 */
async function checkBackgroundRemoteSessionEligibility({ skipBundle = false, } = {}) {
    const errors = [];
    // Check policy first - if blocked, no need to check other preconditions
    if (!(0, index_js_1.isPolicyAllowed)('allow_remote_sessions')) {
        errors.push({ type: 'policy_blocked' });
        return errors;
    }
    const [needsLogin, hasRemoteEnv, repository] = await Promise.all([
        (0, preconditions_js_1.checkNeedsClaudeAiLogin)(),
        (0, preconditions_js_1.checkHasRemoteEnvironment)(),
        (0, detectRepository_js_1.detectCurrentRepositoryWithHost)(),
    ]);
    if (needsLogin) {
        errors.push({ type: 'not_logged_in' });
    }
    if (!hasRemoteEnv) {
        errors.push({ type: 'no_remote_environment' });
    }
    // When bundle seeding is on, in-git-repo is enough — CCR can seed from
    // a local bundle. No GitHub remote or app needed. Same gate as
    // teleport.tsx bundleSeedGateOn.
    const bundleSeedGateOn = !skipBundle &&
        ((0, envUtils_js_1.isEnvTruthy)(process.env.CCR_FORCE_BUNDLE) ||
            (0, envUtils_js_1.isEnvTruthy)(process.env.CCR_ENABLE_BUNDLE) ||
            (await (0, growthbook_js_1.checkGate_CACHED_OR_BLOCKING)('tengu_ccr_bundle_seed_enabled')));
    if (!(0, preconditions_js_1.checkIsInGitRepo)()) {
        errors.push({ type: 'not_in_git_repo' });
    }
    else if (bundleSeedGateOn) {
        // has .git/, bundle will work — skip remote+app checks
    }
    else if (repository === null) {
        errors.push({ type: 'no_git_remote' });
    }
    else if (repository.host === 'github.com') {
        const hasGithubApp = await (0, preconditions_js_1.checkGithubAppInstalled)(repository.owner, repository.name);
        if (!hasGithubApp) {
            errors.push({ type: 'github_app_not_installed' });
        }
    }
    return errors;
}
