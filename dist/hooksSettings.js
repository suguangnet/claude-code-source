"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isHookEqual = isHookEqual;
exports.getHookDisplayText = getHookDisplayText;
exports.getAllHooks = getAllHooks;
exports.getHooksForEvent = getHooksForEvent;
exports.hookSourceDescriptionDisplayString = hookSourceDescriptionDisplayString;
exports.hookSourceHeaderDisplayString = hookSourceHeaderDisplayString;
exports.hookSourceInlineDisplayString = hookSourceInlineDisplayString;
exports.sortMatchersByPriority = sortMatchersByPriority;
const path_1 = require("path");
const state_js_1 = require("../../bootstrap/state.js");
const constants_js_1 = require("../settings/constants.js");
const settings_js_1 = require("../settings/settings.js");
const shellProvider_js_1 = require("../shell/shellProvider.js");
const sessionHooks_js_1 = require("./sessionHooks.js");
/**
 * Check if two hooks are equal (comparing only command/prompt content, not timeout)
 */
function isHookEqual(a, b) {
    if (a.type !== b.type)
        return false;
    // Use switch for exhaustive type checking
    // Note: We only compare command/prompt content, not timeout
    // `if` is part of identity: same command with different `if` conditions
    // are distinct hooks (e.g., setup.sh if=Bash(git *) vs if=Bash(npm *)).
    const sameIf = (x, y) => (x.if ?? '') === (y.if ?? '');
    switch (a.type) {
        case 'command':
            // shell is part of identity: same command string with different
            // shells are distinct hooks. Default 'bash' so undefined === 'bash'.
            return (b.type === 'command' &&
                a.command === b.command &&
                (a.shell ?? shellProvider_js_1.DEFAULT_HOOK_SHELL) === (b.shell ?? shellProvider_js_1.DEFAULT_HOOK_SHELL) &&
                sameIf(a, b));
        case 'prompt':
            return b.type === 'prompt' && a.prompt === b.prompt && sameIf(a, b);
        case 'agent':
            return b.type === 'agent' && a.prompt === b.prompt && sameIf(a, b);
        case 'http':
            return b.type === 'http' && a.url === b.url && sameIf(a, b);
        case 'function':
            // Function hooks can't be compared (no stable identifier)
            return false;
    }
}
/** Get the display text for a hook */
function getHookDisplayText(hook) {
    // Return custom status message if provided
    if ('statusMessage' in hook && hook.statusMessage) {
        return hook.statusMessage;
    }
    switch (hook.type) {
        case 'command':
            return hook.command;
        case 'prompt':
            return hook.prompt;
        case 'agent':
            return hook.prompt;
        case 'http':
            return hook.url;
        case 'callback':
            return 'callback';
        case 'function':
            return 'function';
    }
}
function getAllHooks(appState) {
    const hooks = [];
    // Check if restricted to managed hooks only
    const policySettings = (0, settings_js_1.getSettingsForSource)('policySettings');
    const restrictedToManagedOnly = policySettings?.allowManagedHooksOnly === true;
    // If allowManagedHooksOnly is set, don't show any hooks in the UI
    // (user/project/local are blocked, and managed hooks are intentionally hidden)
    if (!restrictedToManagedOnly) {
        // Get hooks from all editable sources
        const sources = [
            'userSettings',
            'projectSettings',
            'localSettings',
        ];
        // Track which settings files we've already processed to avoid duplicates
        // (e.g., when running from home directory, userSettings and projectSettings
        // both resolve to ~/.claude/settings.json)
        const seenFiles = new Set();
        for (const source of sources) {
            const filePath = (0, settings_js_1.getSettingsFilePathForSource)(source);
            if (filePath) {
                const resolvedPath = (0, path_1.resolve)(filePath);
                if (seenFiles.has(resolvedPath)) {
                    continue;
                }
                seenFiles.add(resolvedPath);
            }
            const sourceSettings = (0, settings_js_1.getSettingsForSource)(source);
            if (!sourceSettings?.hooks) {
                continue;
            }
            for (const [event, matchers] of Object.entries(sourceSettings.hooks)) {
                for (const matcher of matchers) {
                    for (const hookCommand of matcher.hooks) {
                        hooks.push({
                            event: event,
                            config: hookCommand,
                            matcher: matcher.matcher,
                            source,
                        });
                    }
                }
            }
        }
    }
    // Get session hooks
    const sessionId = (0, state_js_1.getSessionId)();
    const sessionHooks = (0, sessionHooks_js_1.getSessionHooks)(appState, sessionId);
    for (const [event, matchers] of sessionHooks.entries()) {
        for (const matcher of matchers) {
            for (const hookCommand of matcher.hooks) {
                hooks.push({
                    event,
                    config: hookCommand,
                    matcher: matcher.matcher,
                    source: 'sessionHook',
                });
            }
        }
    }
    return hooks;
}
function getHooksForEvent(appState, event) {
    return getAllHooks(appState).filter(hook => hook.event === event);
}
function hookSourceDescriptionDisplayString(source) {
    switch (source) {
        case 'userSettings':
            return 'User settings (~/.claude/settings.json)';
        case 'projectSettings':
            return 'Project settings (.claude/settings.json)';
        case 'localSettings':
            return 'Local settings (.claude/settings.local.json)';
        case 'pluginHook':
            // TODO: Get the actual plugin hook file paths instead of using glob pattern
            // We should capture the specific plugin paths during hook registration and display them here
            // e.g., "Plugin hooks (~/.claude/plugins/repos/source/example-plugin/example-plugin/hooks/hooks.json)"
            return 'Plugin hooks (~/.claude/plugins/*/hooks/hooks.json)';
        case 'sessionHook':
            return 'Session hooks (in-memory, temporary)';
        case 'builtinHook':
            return 'Built-in hooks (registered internally by Claude Code)';
        default:
            return source;
    }
}
function hookSourceHeaderDisplayString(source) {
    switch (source) {
        case 'userSettings':
            return 'User Settings';
        case 'projectSettings':
            return 'Project Settings';
        case 'localSettings':
            return 'Local Settings';
        case 'pluginHook':
            return 'Plugin Hooks';
        case 'sessionHook':
            return 'Session Hooks';
        case 'builtinHook':
            return 'Built-in Hooks';
        default:
            return source;
    }
}
function hookSourceInlineDisplayString(source) {
    switch (source) {
        case 'userSettings':
            return 'User';
        case 'projectSettings':
            return 'Project';
        case 'localSettings':
            return 'Local';
        case 'pluginHook':
            return 'Plugin';
        case 'sessionHook':
            return 'Session';
        case 'builtinHook':
            return 'Built-in';
        default:
            return source;
    }
}
function sortMatchersByPriority(matchers, hooksByEventAndMatcher, selectedEvent) {
    // Create a priority map based on SOURCES order (lower index = higher priority)
    const sourcePriority = constants_js_1.SOURCES.reduce((acc, source, index) => {
        acc[source] = index;
        return acc;
    }, {});
    return [...matchers].sort((a, b) => {
        const aHooks = hooksByEventAndMatcher[selectedEvent]?.[a] || [];
        const bHooks = hooksByEventAndMatcher[selectedEvent]?.[b] || [];
        const aSources = Array.from(new Set(aHooks.map(h => h.source)));
        const bSources = Array.from(new Set(bHooks.map(h => h.source)));
        // Sort by highest priority source first (lowest priority number)
        // Plugin hooks get lowest priority (highest number)
        const getSourcePriority = (source) => source === 'pluginHook' || source === 'builtinHook'
            ? 999
            : sourcePriority[source];
        const aHighestPriority = Math.min(...aSources.map(getSourcePriority));
        const bHighestPriority = Math.min(...bSources.map(getSourcePriority));
        if (aHighestPriority !== bHighestPriority) {
            return aHighestPriority - bHighestPriority;
        }
        // If same priority, sort by matcher name
        return a.localeCompare(b);
    });
}
