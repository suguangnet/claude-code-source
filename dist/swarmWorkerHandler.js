"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSwarmWorkerPermission = handleSwarmWorkerPermission;
const bun_bundle_1 = require("bun:bundle");
const agentSwarmsEnabled_js_1 = require("../../../utils/agentSwarmsEnabled.js");
const errors_js_1 = require("../../../utils/errors.js");
const log_js_1 = require("../../../utils/log.js");
const permissionSync_js_1 = require("../../../utils/swarm/permissionSync.js");
const useSwarmPermissionPoller_js_1 = require("../../useSwarmPermissionPoller.js");
const PermissionContext_js_1 = require("../PermissionContext.js");
/**
 * Handles the swarm worker permission flow.
 *
 * When running as a swarm worker:
 * 1. Tries classifier auto-approval for bash commands
 * 2. Forwards the permission request to the leader via mailbox
 * 3. Registers callbacks for when the leader responds
 * 4. Sets the pending indicator while waiting
 *
 * Returns a PermissionDecision if the classifier auto-approves,
 * or a Promise that resolves when the leader responds.
 * Returns null if swarms are not enabled or this is not a swarm worker,
 * so the caller can fall through to interactive handling.
 */
async function handleSwarmWorkerPermission(params) {
    if (!(0, agentSwarmsEnabled_js_1.isAgentSwarmsEnabled)() || !(0, permissionSync_js_1.isSwarmWorker)()) {
        return null;
    }
    const { ctx, description, updatedInput, suggestions } = params;
    // For bash commands, try classifier auto-approval before forwarding to
    // the leader. Agents await the classifier result (rather than racing it
    // against user interaction like the main agent).
    const classifierResult = (0, bun_bundle_1.feature)('BASH_CLASSIFIER')
        ? await ctx.tryClassifier?.(params.pendingClassifierCheck, updatedInput)
        : null;
    if (classifierResult) {
        return classifierResult;
    }
    // Forward permission request to the leader via mailbox
    try {
        const clearPendingRequest = () => ctx.toolUseContext.setAppState(prev => ({
            ...prev,
            pendingWorkerRequest: null,
        }));
        const decision = await new Promise(resolve => {
            const { resolve: resolveOnce, claim } = (0, PermissionContext_js_1.createResolveOnce)(resolve);
            // Create the permission request
            const request = (0, permissionSync_js_1.createPermissionRequest)({
                toolName: ctx.tool.name,
                toolUseId: ctx.toolUseID,
                input: ctx.input,
                description,
                permissionSuggestions: suggestions,
            });
            // Register callback BEFORE sending the request to avoid race condition
            // where leader responds before callback is registered
            (0, useSwarmPermissionPoller_js_1.registerPermissionCallback)({
                requestId: request.id,
                toolUseId: ctx.toolUseID,
                async onAllow(allowedInput, permissionUpdates, feedback, contentBlocks) {
                    if (!claim())
                        return; // atomic check-and-mark before await
                    clearPendingRequest();
                    // Merge the updated input with the original input
                    const finalInput = allowedInput && Object.keys(allowedInput).length > 0
                        ? allowedInput
                        : ctx.input;
                    resolveOnce(await ctx.handleUserAllow(finalInput, permissionUpdates, feedback, undefined, contentBlocks));
                },
                onReject(feedback, contentBlocks) {
                    if (!claim())
                        return;
                    clearPendingRequest();
                    ctx.logDecision({
                        decision: 'reject',
                        source: { type: 'user_reject', hasFeedback: !!feedback },
                    });
                    resolveOnce(ctx.cancelAndAbort(feedback, undefined, contentBlocks));
                },
            });
            // Now that callback is registered, send the request to the leader
            void (0, permissionSync_js_1.sendPermissionRequestViaMailbox)(request);
            // Show visual indicator that we're waiting for leader approval
            ctx.toolUseContext.setAppState(prev => ({
                ...prev,
                pendingWorkerRequest: {
                    toolName: ctx.tool.name,
                    toolUseId: ctx.toolUseID,
                    description,
                },
            }));
            // If the abort signal fires while waiting for the leader response,
            // resolve the promise with a cancel decision so it does not hang.
            ctx.toolUseContext.abortController.signal.addEventListener('abort', () => {
                if (!claim())
                    return;
                clearPendingRequest();
                ctx.logCancelled();
                resolveOnce(ctx.cancelAndAbort(undefined, true));
            }, { once: true });
        });
        return decision;
    }
    catch (error) {
        // If swarm permission submission fails, fall back to local handling
        (0, log_js_1.logError)((0, errors_js_1.toError)(error));
        // Continue to local UI handling below
        return null;
    }
}
