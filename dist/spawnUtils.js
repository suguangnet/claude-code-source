"use strict";
/**
 * Shared utilities for spawning teammates across different backends.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTeammateCommand = getTeammateCommand;
exports.buildInheritedCliFlags = buildInheritedCliFlags;
exports.buildInheritedEnvVars = buildInheritedEnvVars;
const state_js_1 = require("../../bootstrap/state.js");
const shellQuote_js_1 = require("../bash/shellQuote.js");
const bundledMode_js_1 = require("../bundledMode.js");
const teammateModeSnapshot_js_1 = require("./backends/teammateModeSnapshot.js");
const constants_js_1 = require("./constants.js");
/**
 * Gets the command to use for spawning teammate processes.
 * Uses TEAMMATE_COMMAND_ENV_VAR if set, otherwise falls back to the
 * current process executable path.
 */
function getTeammateCommand() {
    if (process.env[constants_js_1.TEAMMATE_COMMAND_ENV_VAR]) {
        return process.env[constants_js_1.TEAMMATE_COMMAND_ENV_VAR];
    }
    return (0, bundledMode_js_1.isInBundledMode)() ? process.execPath : process.argv[1];
}
/**
 * Builds CLI flags to propagate from the current session to spawned teammates.
 * This ensures teammates inherit important settings like permission mode,
 * model selection, and plugin configuration from their parent.
 *
 * @param options.planModeRequired - If true, don't inherit bypass permissions (plan mode takes precedence)
 * @param options.permissionMode - Permission mode to propagate
 */
function buildInheritedCliFlags(options) {
    const flags = [];
    const { planModeRequired, permissionMode } = options || {};
    // Propagate permission mode to teammates, but NOT if plan mode is required
    // Plan mode takes precedence over bypass permissions for safety
    if (planModeRequired) {
        // Don't inherit bypass permissions when plan mode is required
    }
    else if (permissionMode === 'bypassPermissions' ||
        (0, state_js_1.getSessionBypassPermissionsMode)()) {
        flags.push('--dangerously-skip-permissions');
    }
    else if (permissionMode === 'acceptEdits') {
        flags.push('--permission-mode acceptEdits');
    }
    // Propagate --model if explicitly set via CLI
    const modelOverride = (0, state_js_1.getMainLoopModelOverride)();
    if (modelOverride) {
        flags.push(`--model ${(0, shellQuote_js_1.quote)([modelOverride])}`);
    }
    // Propagate --settings if set via CLI
    const settingsPath = (0, state_js_1.getFlagSettingsPath)();
    if (settingsPath) {
        flags.push(`--settings ${(0, shellQuote_js_1.quote)([settingsPath])}`);
    }
    // Propagate --plugin-dir for each inline plugin
    const inlinePlugins = (0, state_js_1.getInlinePlugins)();
    for (const pluginDir of inlinePlugins) {
        flags.push(`--plugin-dir ${(0, shellQuote_js_1.quote)([pluginDir])}`);
    }
    // Propagate --teammate-mode so tmux teammates use the same mode as leader
    const sessionMode = (0, teammateModeSnapshot_js_1.getTeammateModeFromSnapshot)();
    flags.push(`--teammate-mode ${sessionMode}`);
    // Propagate --chrome / --no-chrome if explicitly set on the CLI
    const chromeFlagOverride = (0, state_js_1.getChromeFlagOverride)();
    if (chromeFlagOverride === true) {
        flags.push('--chrome');
    }
    else if (chromeFlagOverride === false) {
        flags.push('--no-chrome');
    }
    return flags.join(' ');
}
/**
 * Environment variables that must be explicitly forwarded to tmux-spawned
 * teammates. Tmux may start a new login shell that doesn't inherit the
 * parent's env, so we forward any that are set in the current process.
 */
const TEAMMATE_ENV_VARS = [
    // API provider selection — without these, teammates default to firstParty
    // and send requests to the wrong endpoint (GitHub issue #23561)
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CODE_USE_VERTEX',
    'CLAUDE_CODE_USE_FOUNDRY',
    // Custom API endpoint
    'ANTHROPIC_BASE_URL',
    // Config directory override
    'CLAUDE_CONFIG_DIR',
    // CCR marker — teammates need this for CCR-aware code paths. Auth finds
    // its own way via /home/claude/.claude/remote/.oauth_token regardless;
    // the FD env var wouldn't help (pipe FDs don't cross tmux).
    'CLAUDE_CODE_REMOTE',
    // Auto-memory gate (memdir/paths.ts) checks REMOTE && !MEMORY_DIR to
    // disable memory on ephemeral CCR filesystems. Forwarding REMOTE alone
    // would flip teammates to memory-off when the parent has it on.
    'CLAUDE_CODE_REMOTE_MEMORY_DIR',
    // Upstream proxy — the parent's MITM relay is reachable from teammates
    // (same container network). Forward the proxy vars so teammates route
    // customer-configured upstream traffic through the relay for credential
    // injection. Without these, teammates bypass the proxy entirely.
    'HTTPS_PROXY',
    'https_proxy',
    'HTTP_PROXY',
    'http_proxy',
    'NO_PROXY',
    'no_proxy',
    'SSL_CERT_FILE',
    'NODE_EXTRA_CA_CERTS',
    'REQUESTS_CA_BUNDLE',
    'CURL_CA_BUNDLE',
];
/**
 * Builds the `env KEY=VALUE ...` string for teammate spawn commands.
 * Always includes CLAUDECODE=1 and CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1,
 * plus any provider/config env vars that are set in the current process.
 */
function buildInheritedEnvVars() {
    const envVars = ['CLAUDECODE=1', 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1'];
    for (const key of TEAMMATE_ENV_VARS) {
        const value = process.env[key];
        if (value !== undefined && value !== '') {
            envVars.push(`${key}=${(0, shellQuote_js_1.quote)([value])}`);
        }
    }
    return envVars.join(' ');
}
