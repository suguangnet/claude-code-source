"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPermissionContext = createPermissionContext;
exports.createPermissionQueueOps = createPermissionQueueOps;
exports.createResolveOnce = createResolveOnce;
const bun_bundle_1 = require("bun:bundle");
const index_js_1 = require("src/services/analytics/index.js");
const metadata_js_1 = require("src/services/analytics/metadata.js");
const bashPermissions_js_1 = require("../../tools/BashTool/bashPermissions.js");
const toolName_js_1 = require("../../tools/BashTool/toolName.js");
const classifierApprovals_js_1 = require("../../utils/classifierApprovals.js");
const debug_js_1 = require("../../utils/debug.js");
const hooks_js_1 = require("../../utils/hooks.js");
const messages_js_1 = require("../../utils/messages.js");
const PermissionUpdate_js_1 = require("../../utils/permissions/PermissionUpdate.js");
const permissionLogging_js_1 = require("./permissionLogging.js");
function createResolveOnce(resolve) {
    let claimed = false;
    let delivered = false;
    return {
        resolve(value) {
            if (delivered)
                return;
            delivered = true;
            claimed = true;
            resolve(value);
        },
        isResolved() {
            return claimed;
        },
        claim() {
            if (claimed)
                return false;
            claimed = true;
            return true;
        },
    };
}
function createPermissionContext(tool, input, toolUseContext, assistantMessage, toolUseID, setToolPermissionContext, queueOps) {
    const messageId = assistantMessage.message.id;
    const ctx = {
        tool,
        input,
        toolUseContext,
        assistantMessage,
        messageId,
        toolUseID,
        logDecision(args, opts) {
            (0, permissionLogging_js_1.logPermissionDecision)({
                tool,
                input: opts?.input ?? input,
                toolUseContext,
                messageId,
                toolUseID,
            }, args, opts?.permissionPromptStartTimeMs);
        },
        logCancelled() {
            (0, index_js_1.logEvent)('tengu_tool_use_cancelled', {
                messageID: messageId,
                toolName: (0, metadata_js_1.sanitizeToolNameForAnalytics)(tool.name),
            });
        },
        async persistPermissions(updates) {
            if (updates.length === 0)
                return false;
            (0, PermissionUpdate_js_1.persistPermissionUpdates)(updates);
            const appState = toolUseContext.getAppState();
            setToolPermissionContext((0, PermissionUpdate_js_1.applyPermissionUpdates)(appState.toolPermissionContext, updates));
            return updates.some(update => (0, PermissionUpdate_js_1.supportsPersistence)(update.destination));
        },
        resolveIfAborted(resolve) {
            if (!toolUseContext.abortController.signal.aborted)
                return false;
            this.logCancelled();
            resolve(this.cancelAndAbort(undefined, true));
            return true;
        },
        cancelAndAbort(feedback, isAbort, contentBlocks) {
            const sub = !!toolUseContext.agentId;
            const baseMessage = feedback
                ? `${sub ? messages_js_1.SUBAGENT_REJECT_MESSAGE_WITH_REASON_PREFIX : messages_js_1.REJECT_MESSAGE_WITH_REASON_PREFIX}${feedback}`
                : sub
                    ? messages_js_1.SUBAGENT_REJECT_MESSAGE
                    : messages_js_1.REJECT_MESSAGE;
            const message = sub ? baseMessage : (0, messages_js_1.withMemoryCorrectionHint)(baseMessage);
            if (isAbort || (!feedback && !contentBlocks?.length && !sub)) {
                (0, debug_js_1.logForDebugging)(`Aborting: tool=${tool.name} isAbort=${isAbort} hasFeedback=${!!feedback} isSubagent=${sub}`);
                toolUseContext.abortController.abort();
            }
            return { behavior: 'ask', message, contentBlocks };
        },
        ...((0, bun_bundle_1.feature)('BASH_CLASSIFIER')
            ? {
                async tryClassifier(pendingClassifierCheck, updatedInput) {
                    if (tool.name !== toolName_js_1.BASH_TOOL_NAME || !pendingClassifierCheck) {
                        return null;
                    }
                    const classifierDecision = await (0, bashPermissions_js_1.awaitClassifierAutoApproval)(pendingClassifierCheck, toolUseContext.abortController.signal, toolUseContext.options.isNonInteractiveSession);
                    if (!classifierDecision) {
                        return null;
                    }
                    if ((0, bun_bundle_1.feature)('TRANSCRIPT_CLASSIFIER') &&
                        classifierDecision.type === 'classifier') {
                        const matchedRule = classifierDecision.reason.match(/^Allowed by prompt rule: "(.+)"$/)?.[1];
                        if (matchedRule) {
                            (0, classifierApprovals_js_1.setClassifierApproval)(toolUseID, matchedRule);
                        }
                    }
                    (0, permissionLogging_js_1.logPermissionDecision)({ tool, input, toolUseContext, messageId, toolUseID }, { decision: 'accept', source: { type: 'classifier' } }, undefined);
                    return {
                        behavior: 'allow',
                        updatedInput: updatedInput ?? input,
                        userModified: false,
                        decisionReason: classifierDecision,
                    };
                },
            }
            : {}),
        async runHooks(permissionMode, suggestions, updatedInput, permissionPromptStartTimeMs) {
            for await (const hookResult of (0, hooks_js_1.executePermissionRequestHooks)(tool.name, toolUseID, input, toolUseContext, permissionMode, suggestions, toolUseContext.abortController.signal)) {
                if (hookResult.permissionRequestResult) {
                    const decision = hookResult.permissionRequestResult;
                    if (decision.behavior === 'allow') {
                        const finalInput = decision.updatedInput ?? updatedInput ?? input;
                        return await this.handleHookAllow(finalInput, decision.updatedPermissions ?? [], permissionPromptStartTimeMs);
                    }
                    else if (decision.behavior === 'deny') {
                        this.logDecision({ decision: 'reject', source: { type: 'hook' } }, { permissionPromptStartTimeMs });
                        if (decision.interrupt) {
                            (0, debug_js_1.logForDebugging)(`Hook interrupt: tool=${tool.name} hookMessage=${decision.message}`);
                            toolUseContext.abortController.abort();
                        }
                        return this.buildDeny(decision.message || 'Permission denied by hook', {
                            type: 'hook',
                            hookName: 'PermissionRequest',
                            reason: decision.message,
                        });
                    }
                }
            }
            return null;
        },
        buildAllow(updatedInput, opts) {
            return {
                behavior: 'allow',
                updatedInput,
                userModified: opts?.userModified ?? false,
                ...(opts?.decisionReason && { decisionReason: opts.decisionReason }),
                ...(opts?.acceptFeedback && { acceptFeedback: opts.acceptFeedback }),
                ...(opts?.contentBlocks &&
                    opts.contentBlocks.length > 0 && {
                    contentBlocks: opts.contentBlocks,
                }),
            };
        },
        buildDeny(message, decisionReason) {
            return { behavior: 'deny', message, decisionReason };
        },
        async handleUserAllow(updatedInput, permissionUpdates, feedback, permissionPromptStartTimeMs, contentBlocks, decisionReason) {
            const acceptedPermanentUpdates = await this.persistPermissions(permissionUpdates);
            this.logDecision({
                decision: 'accept',
                source: { type: 'user', permanent: acceptedPermanentUpdates },
            }, { input: updatedInput, permissionPromptStartTimeMs });
            const userModified = tool.inputsEquivalent
                ? !tool.inputsEquivalent(input, updatedInput)
                : false;
            const trimmedFeedback = feedback?.trim();
            return this.buildAllow(updatedInput, {
                userModified,
                decisionReason,
                acceptFeedback: trimmedFeedback || undefined,
                contentBlocks,
            });
        },
        async handleHookAllow(finalInput, permissionUpdates, permissionPromptStartTimeMs) {
            const acceptedPermanentUpdates = await this.persistPermissions(permissionUpdates);
            this.logDecision({
                decision: 'accept',
                source: { type: 'hook', permanent: acceptedPermanentUpdates },
            }, { input: finalInput, permissionPromptStartTimeMs });
            return this.buildAllow(finalInput, {
                decisionReason: { type: 'hook', hookName: 'PermissionRequest' },
            });
        },
        pushToQueue(item) {
            queueOps?.push(item);
        },
        removeFromQueue() {
            queueOps?.remove(toolUseID);
        },
        updateQueueItem(patch) {
            queueOps?.update(toolUseID, patch);
        },
    };
    return Object.freeze(ctx);
}
/**
 * Create a PermissionQueueOps backed by a React state setter.
 * This is the bridge between React's `setToolUseConfirmQueue` and the
 * generic queue interface used by PermissionContext.
 */
function createPermissionQueueOps(setToolUseConfirmQueue) {
    return {
        push(item) {
            setToolUseConfirmQueue(queue => [...queue, item]);
        },
        remove(toolUseID) {
            setToolUseConfirmQueue(queue => queue.filter(item => item.toolUseID !== toolUseID));
        },
        update(toolUseID, patch) {
            setToolUseConfirmQueue(queue => queue.map(item => item.toolUseID === toolUseID ? { ...item, ...patch } : item));
        },
    };
}
