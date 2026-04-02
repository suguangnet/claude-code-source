"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAgentSwarmsEnabled = isAgentSwarmsEnabled;
const growthbook_js_1 = require("../services/analytics/growthbook.js");
const envUtils_js_1 = require("./envUtils.js");
/**
 * Check if --agent-teams flag is provided via CLI.
 * Checks process.argv directly to avoid import cycles with bootstrap/state.
 * Note: The flag is only shown in help for ant users, but if external users
 * pass it anyway, it will work (subject to the killswitch).
 */
function isAgentTeamsFlagSet() {
    return process.argv.includes('--agent-teams');
}
/**
 * Centralized runtime check for agent teams/teammate features.
 * This is the single gate that should be checked everywhere teammates
 * are referenced (prompts, code, tools isEnabled, UI, etc.).
 *
 * Ant builds: always enabled.
 * External builds require both:
 * 1. Opt-in via CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS env var OR --agent-teams flag
 * 2. GrowthBook gate 'tengu_amber_flint' enabled (killswitch)
 */
function isAgentSwarmsEnabled() {
    // Ant: always on
    if (process.env.USER_TYPE === 'ant') {
        return true;
    }
    // External: require opt-in via env var or --agent-teams flag
    if (!(0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS) &&
        !isAgentTeamsFlagSet()) {
        return false;
    }
    // Killswitch — always respected for external users
    if (!(0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_amber_flint', true)) {
        return false;
    }
    return true;
}
