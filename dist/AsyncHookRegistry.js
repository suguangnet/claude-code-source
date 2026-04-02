"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPendingAsyncHook = registerPendingAsyncHook;
exports.getPendingAsyncHooks = getPendingAsyncHooks;
exports.checkForAsyncHookResponses = checkForAsyncHookResponses;
exports.removeDeliveredAsyncHooks = removeDeliveredAsyncHooks;
exports.finalizePendingAsyncHooks = finalizePendingAsyncHooks;
exports.clearAllAsyncHooks = clearAllAsyncHooks;
const debug_js_1 = require("../debug.js");
const sessionEnvironment_js_1 = require("../sessionEnvironment.js");
const slowOperations_js_1 = require("../slowOperations.js");
const hookEvents_js_1 = require("./hookEvents.js");
// Global registry state
const pendingHooks = new Map();
function registerPendingAsyncHook({ processId, hookId, asyncResponse, hookName, hookEvent, command, shellCommand, toolName, pluginId, }) {
    const timeout = asyncResponse.asyncTimeout || 15000; // Default 15s
    (0, debug_js_1.logForDebugging)(`Hooks: Registering async hook ${processId} (${hookName}) with timeout ${timeout}ms`);
    const stopProgressInterval = (0, hookEvents_js_1.startHookProgressInterval)({
        hookId,
        hookName,
        hookEvent,
        getOutput: async () => {
            const taskOutput = pendingHooks.get(processId)?.shellCommand?.taskOutput;
            if (!taskOutput) {
                return { stdout: '', stderr: '', output: '' };
            }
            const stdout = await taskOutput.getStdout();
            const stderr = taskOutput.getStderr();
            return { stdout, stderr, output: stdout + stderr };
        },
    });
    pendingHooks.set(processId, {
        processId,
        hookId,
        hookName,
        hookEvent,
        toolName,
        pluginId,
        command,
        startTime: Date.now(),
        timeout,
        responseAttachmentSent: false,
        shellCommand,
        stopProgressInterval,
    });
}
function getPendingAsyncHooks() {
    return Array.from(pendingHooks.values()).filter(hook => !hook.responseAttachmentSent);
}
async function finalizeHook(hook, exitCode, outcome) {
    hook.stopProgressInterval();
    const taskOutput = hook.shellCommand?.taskOutput;
    const stdout = taskOutput ? await taskOutput.getStdout() : '';
    const stderr = taskOutput?.getStderr() ?? '';
    hook.shellCommand?.cleanup();
    (0, hookEvents_js_1.emitHookResponse)({
        hookId: hook.hookId,
        hookName: hook.hookName,
        hookEvent: hook.hookEvent,
        output: stdout + stderr,
        stdout,
        stderr,
        exitCode,
        outcome,
    });
}
async function checkForAsyncHookResponses() {
    const responses = [];
    const pendingCount = pendingHooks.size;
    (0, debug_js_1.logForDebugging)(`Hooks: Found ${pendingCount} total hooks in registry`);
    // Snapshot hooks before processing — we'll mutate the map after.
    const hooks = Array.from(pendingHooks.values());
    const settled = await Promise.allSettled(hooks.map(async (hook) => {
        const stdout = (await hook.shellCommand?.taskOutput.getStdout()) ?? '';
        const stderr = hook.shellCommand?.taskOutput.getStderr() ?? '';
        (0, debug_js_1.logForDebugging)(`Hooks: Checking hook ${hook.processId} (${hook.hookName}) - attachmentSent: ${hook.responseAttachmentSent}, stdout length: ${stdout.length}`);
        if (!hook.shellCommand) {
            (0, debug_js_1.logForDebugging)(`Hooks: Hook ${hook.processId} has no shell command, removing from registry`);
            hook.stopProgressInterval();
            return { type: 'remove', processId: hook.processId };
        }
        (0, debug_js_1.logForDebugging)(`Hooks: Hook shell status ${hook.shellCommand.status}`);
        if (hook.shellCommand.status === 'killed') {
            (0, debug_js_1.logForDebugging)(`Hooks: Hook ${hook.processId} is ${hook.shellCommand.status}, removing from registry`);
            hook.stopProgressInterval();
            hook.shellCommand.cleanup();
            return { type: 'remove', processId: hook.processId };
        }
        if (hook.shellCommand.status !== 'completed') {
            return { type: 'skip' };
        }
        if (hook.responseAttachmentSent || !stdout.trim()) {
            (0, debug_js_1.logForDebugging)(`Hooks: Skipping hook ${hook.processId} - already delivered/sent or no stdout`);
            hook.stopProgressInterval();
            return { type: 'remove', processId: hook.processId };
        }
        const lines = stdout.split('\n');
        (0, debug_js_1.logForDebugging)(`Hooks: Processing ${lines.length} lines of stdout for ${hook.processId}`);
        const execResult = await hook.shellCommand.result;
        const exitCode = execResult.code;
        let response = {};
        for (const line of lines) {
            if (line.trim().startsWith('{')) {
                (0, debug_js_1.logForDebugging)(`Hooks: Found JSON line: ${line.trim().substring(0, 100)}...`);
                try {
                    const parsed = (0, slowOperations_js_1.jsonParse)(line.trim());
                    if (!('async' in parsed)) {
                        (0, debug_js_1.logForDebugging)(`Hooks: Found sync response from ${hook.processId}: ${(0, slowOperations_js_1.jsonStringify)(parsed)}`);
                        response = parsed;
                        break;
                    }
                }
                catch {
                    (0, debug_js_1.logForDebugging)(`Hooks: Failed to parse JSON from ${hook.processId}: ${line.trim()}`);
                }
            }
        }
        hook.responseAttachmentSent = true;
        await finalizeHook(hook, exitCode, exitCode === 0 ? 'success' : 'error');
        return {
            type: 'response',
            processId: hook.processId,
            isSessionStart: hook.hookEvent === 'SessionStart',
            payload: {
                processId: hook.processId,
                response,
                hookName: hook.hookName,
                hookEvent: hook.hookEvent,
                toolName: hook.toolName,
                pluginId: hook.pluginId,
                stdout,
                stderr,
                exitCode,
            },
        };
    }));
    // allSettled — isolate failures so one throwing callback doesn't orphan
    // already-applied side effects (responseAttachmentSent, finalizeHook) from others.
    let sessionStartCompleted = false;
    for (const s of settled) {
        if (s.status !== 'fulfilled') {
            (0, debug_js_1.logForDebugging)(`Hooks: checkForAsyncHookResponses callback rejected: ${s.reason}`, { level: 'error' });
            continue;
        }
        const r = s.value;
        if (r.type === 'remove') {
            pendingHooks.delete(r.processId);
        }
        else if (r.type === 'response') {
            responses.push(r.payload);
            pendingHooks.delete(r.processId);
            if (r.isSessionStart)
                sessionStartCompleted = true;
        }
    }
    if (sessionStartCompleted) {
        (0, debug_js_1.logForDebugging)(`Invalidating session env cache after SessionStart hook completed`);
        (0, sessionEnvironment_js_1.invalidateSessionEnvCache)();
    }
    (0, debug_js_1.logForDebugging)(`Hooks: checkForNewResponses returning ${responses.length} responses`);
    return responses;
}
function removeDeliveredAsyncHooks(processIds) {
    for (const processId of processIds) {
        const hook = pendingHooks.get(processId);
        if (hook && hook.responseAttachmentSent) {
            (0, debug_js_1.logForDebugging)(`Hooks: Removing delivered hook ${processId}`);
            hook.stopProgressInterval();
            pendingHooks.delete(processId);
        }
    }
}
async function finalizePendingAsyncHooks() {
    const hooks = Array.from(pendingHooks.values());
    await Promise.all(hooks.map(async (hook) => {
        if (hook.shellCommand?.status === 'completed') {
            const result = await hook.shellCommand.result;
            await finalizeHook(hook, result.code, result.code === 0 ? 'success' : 'error');
        }
        else {
            if (hook.shellCommand && hook.shellCommand.status !== 'killed') {
                hook.shellCommand.kill();
            }
            await finalizeHook(hook, 1, 'cancelled');
        }
    }));
    pendingHooks.clear();
}
// Test utility function to clear all hooks
function clearAllAsyncHooks() {
    for (const hook of pendingHooks.values()) {
        hook.stopProgressInterval();
    }
    pendingHooks.clear();
}
