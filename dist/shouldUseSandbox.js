"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldUseSandbox = shouldUseSandbox;
const growthbook_js_1 = require("src/services/analytics/growthbook.js");
const commands_js_1 = require("../../utils/bash/commands.js");
const sandbox_adapter_js_1 = require("../../utils/sandbox/sandbox-adapter.js");
const settings_js_1 = require("../../utils/settings/settings.js");
const bashPermissions_js_1 = require("./bashPermissions.js");
// NOTE: excludedCommands is a user-facing convenience feature, not a security boundary.
// It is not a security bug to be able to bypass excludedCommands — the sandbox permission
// system (which prompts users) is the actual security control.
function containsExcludedCommand(command) {
    // Check dynamic config for disabled commands and substrings (only for ants)
    if (process.env.USER_TYPE === 'ant') {
        const disabledCommands = (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_sandbox_disabled_commands', { commands: [], substrings: [] });
        // Check if command contains any disabled substrings
        for (const substring of disabledCommands.substrings) {
            if (command.includes(substring)) {
                return true;
            }
        }
        // Check if command starts with any disabled commands
        try {
            const commandParts = (0, commands_js_1.splitCommand_DEPRECATED)(command);
            for (const part of commandParts) {
                const baseCommand = part.trim().split(' ')[0];
                if (baseCommand && disabledCommands.commands.includes(baseCommand)) {
                    return true;
                }
            }
        }
        catch {
            // If we can't parse the command (e.g., malformed bash syntax),
            // treat it as not excluded to allow other validation checks to handle it
            // This prevents crashes when rendering tool use messages
        }
    }
    // Check user-configured excluded commands from settings
    const settings = (0, settings_js_1.getSettings_DEPRECATED)();
    const userExcludedCommands = settings.sandbox?.excludedCommands ?? [];
    if (userExcludedCommands.length === 0) {
        return false;
    }
    // Split compound commands (e.g. "docker ps && curl evil.com") into individual
    // subcommands and check each one against excluded patterns. This prevents a
    // compound command from escaping the sandbox just because its first subcommand
    // matches an excluded pattern.
    let subcommands;
    try {
        subcommands = (0, commands_js_1.splitCommand_DEPRECATED)(command);
    }
    catch {
        subcommands = [command];
    }
    for (const subcommand of subcommands) {
        const trimmed = subcommand.trim();
        // Also try matching with env var prefixes and wrapper commands stripped, so
        // that `FOO=bar bazel ...` and `timeout 30 bazel ...` match `bazel:*`. Not a
        // security boundary (see NOTE at top); the &&-split above already lets
        // `export FOO=bar && bazel ...` match. BINARY_HIJACK_VARS kept as a heuristic.
        //
        // We iteratively apply both stripping operations until no new candidates are
        // produced (fixed-point), matching the approach in filterRulesByContentsMatchingInput.
        // This handles interleaved patterns like `timeout 300 FOO=bar bazel run`
        // where single-pass composition would fail.
        const candidates = [trimmed];
        const seen = new Set(candidates);
        let startIdx = 0;
        while (startIdx < candidates.length) {
            const endIdx = candidates.length;
            for (let i = startIdx; i < endIdx; i++) {
                const cmd = candidates[i];
                const envStripped = (0, bashPermissions_js_1.stripAllLeadingEnvVars)(cmd, bashPermissions_js_1.BINARY_HIJACK_VARS);
                if (!seen.has(envStripped)) {
                    candidates.push(envStripped);
                    seen.add(envStripped);
                }
                const wrapperStripped = (0, bashPermissions_js_1.stripSafeWrappers)(cmd);
                if (!seen.has(wrapperStripped)) {
                    candidates.push(wrapperStripped);
                    seen.add(wrapperStripped);
                }
            }
            startIdx = endIdx;
        }
        for (const pattern of userExcludedCommands) {
            const rule = (0, bashPermissions_js_1.bashPermissionRule)(pattern);
            for (const cand of candidates) {
                switch (rule.type) {
                    case 'prefix':
                        if (cand === rule.prefix || cand.startsWith(rule.prefix + ' ')) {
                            return true;
                        }
                        break;
                    case 'exact':
                        if (cand === rule.command) {
                            return true;
                        }
                        break;
                    case 'wildcard':
                        if ((0, bashPermissions_js_1.matchWildcardPattern)(rule.pattern, cand)) {
                            return true;
                        }
                        break;
                }
            }
        }
    }
    return false;
}
function shouldUseSandbox(input) {
    if (!sandbox_adapter_js_1.SandboxManager.isSandboxingEnabled()) {
        return false;
    }
    // Don't sandbox if explicitly overridden AND unsandboxed commands are allowed by policy
    if (input.dangerouslyDisableSandbox &&
        sandbox_adapter_js_1.SandboxManager.areUnsandboxedCommandsAllowed()) {
        return false;
    }
    if (!input.command) {
        return false;
    }
    // Don't sandbox if the command contains user-configured excluded commands
    if (containsExcludedCommand(input.command)) {
        return false;
    }
    return true;
}
