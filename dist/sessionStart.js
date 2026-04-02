"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.takeInitialUserMessage = takeInitialUserMessage;
exports.processSessionStartHooks = processSessionStartHooks;
exports.processSetupHooks = processSetupHooks;
const state_js_1 = require("../bootstrap/state.js");
const attachments_js_1 = require("./attachments.js");
const debug_js_1 = require("./debug.js");
const diagLogs_js_1 = require("./diagLogs.js");
const envUtils_js_1 = require("./envUtils.js");
const fileChangedWatcher_js_1 = require("./hooks/fileChangedWatcher.js");
const hooksConfigSnapshot_js_1 = require("./hooks/hooksConfigSnapshot.js");
const hooks_js_1 = require("./hooks.js");
const log_js_1 = require("./log.js");
const loadPluginHooks_js_1 = require("./plugins/loadPluginHooks.js");
// Set by processSessionStartHooks when a hook emits initialUserMessage;
// consumed once by takeInitialUserMessage. This side channel avoids changing
// the Promise<HookResultMessage[]> return type that main.tsx and print.ts
// both already await on (sessionStartHooksPromise is kicked in main.tsx and
// joined later — rippling a structural return-type change through that
// handoff would touch five callsites for what is a print-mode-only value).
let pendingInitialUserMessage;
function takeInitialUserMessage() {
    const v = pendingInitialUserMessage;
    pendingInitialUserMessage = undefined;
    return v;
}
// Note to CLAUDE: do not add ANY "warmup" logic. It is **CRITICAL** that you do not add extra work on startup.
async function processSessionStartHooks(source, { sessionId, agentType, model, forceSyncExecution, } = {}) {
    // --bare skips all hooks. executeHooks already early-returns under --bare
    // (hooks.ts:1861), but this skips the loadPluginHooks() await below too —
    // no point loading plugin hooks that'll never run.
    if ((0, envUtils_js_1.isBareMode)()) {
        return [];
    }
    const hookMessages = [];
    const additionalContexts = [];
    const allWatchPaths = [];
    // Skip loading plugin hooks if restricted to managed hooks only
    // Plugin hooks are untrusted external code that should be blocked by policy
    if ((0, hooksConfigSnapshot_js_1.shouldAllowManagedHooksOnly)()) {
        (0, debug_js_1.logForDebugging)('Skipping plugin hooks - allowManagedHooksOnly is enabled');
    }
    else {
        // Ensure plugin hooks are loaded before executing SessionStart hooks.
        // loadPluginHooks() may be called early during startup (fire-and-forget, non-blocking)
        // to pre-load hooks, but we must guarantee hooks are registered before executing them.
        // This function is memoized, so if hooks are already loaded, this returns immediately
        // with negligible overhead (just a cache lookup).
        try {
            await (0, diagLogs_js_1.withDiagnosticsTiming)('load_plugin_hooks', () => (0, loadPluginHooks_js_1.loadPluginHooks)());
        }
        catch (error) {
            // Log error but don't crash - continue with session start without plugin hooks
            /* eslint-disable no-restricted-syntax -- both branches wrap with context, not a toError case */
            const enhancedError = error instanceof Error
                ? new Error(`Failed to load plugin hooks during ${source}: ${error.message}`)
                : new Error(`Failed to load plugin hooks during ${source}: ${String(error)}`);
            /* eslint-enable no-restricted-syntax */
            if (error instanceof Error && error.stack) {
                enhancedError.stack = error.stack;
            }
            (0, log_js_1.logError)(enhancedError);
            // Provide specific guidance based on error type
            const errorMessage = error instanceof Error ? error.message : String(error);
            let userGuidance = '';
            if (errorMessage.includes('Failed to clone') ||
                errorMessage.includes('network') ||
                errorMessage.includes('ETIMEDOUT') ||
                errorMessage.includes('ENOTFOUND')) {
                userGuidance =
                    'This appears to be a network issue. Check your internet connection and try again.';
            }
            else if (errorMessage.includes('Permission denied') ||
                errorMessage.includes('EACCES') ||
                errorMessage.includes('EPERM')) {
                userGuidance =
                    'This appears to be a permissions issue. Check file permissions on ~/.claude/plugins/';
            }
            else if (errorMessage.includes('Invalid') ||
                errorMessage.includes('parse') ||
                errorMessage.includes('JSON') ||
                errorMessage.includes('schema')) {
                userGuidance =
                    'This appears to be a configuration issue. Check your plugin settings in .claude/settings.json';
            }
            else {
                userGuidance =
                    'Please fix the plugin configuration or remove problematic plugins from your settings.';
            }
            (0, debug_js_1.logForDebugging)(`Warning: Failed to load plugin hooks. SessionStart hooks from plugins will not execute. ` +
                `Error: ${errorMessage}. ${userGuidance}`, { level: 'warn' });
            // Continue execution - plugin hooks won't be available, but project-level hooks
            // from .claude/settings.json (loaded via captureHooksConfigSnapshot) will still work
        }
    }
    // Execute SessionStart hooks, ignoring blocking errors
    // Use the provided agentType or fall back to the one stored in bootstrap state
    const resolvedAgentType = agentType ?? (0, state_js_1.getMainThreadAgentType)();
    for await (const hookResult of (0, hooks_js_1.executeSessionStartHooks)(source, sessionId, resolvedAgentType, model, undefined, undefined, forceSyncExecution)) {
        if (hookResult.message) {
            hookMessages.push(hookResult.message);
        }
        if (hookResult.additionalContexts &&
            hookResult.additionalContexts.length > 0) {
            additionalContexts.push(...hookResult.additionalContexts);
        }
        if (hookResult.initialUserMessage) {
            pendingInitialUserMessage = hookResult.initialUserMessage;
        }
        if (hookResult.watchPaths && hookResult.watchPaths.length > 0) {
            allWatchPaths.push(...hookResult.watchPaths);
        }
    }
    if (allWatchPaths.length > 0) {
        (0, fileChangedWatcher_js_1.updateWatchPaths)(allWatchPaths);
    }
    // If hooks provided additional context, add it as a message
    if (additionalContexts.length > 0) {
        const contextMessage = (0, attachments_js_1.createAttachmentMessage)({
            type: 'hook_additional_context',
            content: additionalContexts,
            hookName: 'SessionStart',
            toolUseID: 'SessionStart',
            hookEvent: 'SessionStart',
        });
        hookMessages.push(contextMessage);
    }
    return hookMessages;
}
async function processSetupHooks(trigger, { forceSyncExecution } = {}) {
    // Same rationale as processSessionStartHooks above.
    if ((0, envUtils_js_1.isBareMode)()) {
        return [];
    }
    const hookMessages = [];
    const additionalContexts = [];
    if ((0, hooksConfigSnapshot_js_1.shouldAllowManagedHooksOnly)()) {
        (0, debug_js_1.logForDebugging)('Skipping plugin hooks - allowManagedHooksOnly is enabled');
    }
    else {
        try {
            await (0, loadPluginHooks_js_1.loadPluginHooks)();
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            (0, debug_js_1.logForDebugging)(`Warning: Failed to load plugin hooks. Setup hooks from plugins will not execute. Error: ${errorMessage}`, { level: 'warn' });
        }
    }
    for await (const hookResult of (0, hooks_js_1.executeSetupHooks)(trigger, undefined, undefined, forceSyncExecution)) {
        if (hookResult.message) {
            hookMessages.push(hookResult.message);
        }
        if (hookResult.additionalContexts &&
            hookResult.additionalContexts.length > 0) {
            additionalContexts.push(...hookResult.additionalContexts);
        }
    }
    if (additionalContexts.length > 0) {
        const contextMessage = (0, attachments_js_1.createAttachmentMessage)({
            type: 'hook_additional_context',
            content: additionalContexts,
            hookName: 'Setup',
            toolUseID: 'Setup',
            hookEvent: 'Setup',
        });
        hookMessages.push(contextMessage);
    }
    return hookMessages;
}
