"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleStopHooks = handleStopHooks;
const bun_bundle_1 = require("bun:bundle");
const shortcutFormat_js_1 = require("../keybindings/shortcutFormat.js");
const paths_js_1 = require("../memdir/paths.js");
const index_js_1 = require("../services/analytics/index.js");
const attachments_js_1 = require("../utils/attachments.js");
const debug_js_1 = require("../utils/debug.js");
const errors_js_1 = require("../utils/errors.js");
const hooks_js_1 = require("../utils/hooks.js");
const messages_js_1 = require("../utils/messages.js");
const tasks_js_1 = require("../utils/tasks.js");
const teammate_js_1 = require("../utils/teammate.js");
/* eslint-disable @typescript-eslint/no-require-imports */
const extractMemoriesModule = (0, bun_bundle_1.feature)('EXTRACT_MEMORIES')
    ? require('../services/extractMemories/extractMemories.js')
    : null;
const jobClassifierModule = (0, bun_bundle_1.feature)('TEMPLATES')
    ? require('../jobs/classifier.js')
    : null;
const autoDream_js_1 = require("../services/autoDream/autoDream.js");
const promptSuggestion_js_1 = require("../services/PromptSuggestion/promptSuggestion.js");
const envUtils_js_1 = require("../utils/envUtils.js");
const forkedAgent_js_1 = require("../utils/forkedAgent.js");
async function* handleStopHooks(messagesForQuery, assistantMessages, systemPrompt, userContext, systemContext, toolUseContext, querySource, stopHookActive) {
    const hookStartTime = Date.now();
    const stopHookContext = {
        messages: [...messagesForQuery, ...assistantMessages],
        systemPrompt,
        userContext,
        systemContext,
        toolUseContext,
        querySource,
    };
    // Only save params for main session queries — subagents must not overwrite.
    // Outside the prompt-suggestion gate: the REPL /btw command and the
    // side_question SDK control_request both read this snapshot, and neither
    // depends on prompt suggestions being enabled.
    if (querySource === 'repl_main_thread' || querySource === 'sdk') {
        (0, forkedAgent_js_1.saveCacheSafeParams)((0, forkedAgent_js_1.createCacheSafeParams)(stopHookContext));
    }
    // Template job classification: when running as a dispatched job, classify
    // state after each turn. Gate on repl_main_thread so background forks
    // (extract-memories, auto-dream) don't pollute the timeline with their own
    // assistant messages. Await the classifier so state.json is written before
    // the turn returns — otherwise `claude list` shows stale state for the gap.
    // Env key hardcoded (vs importing JOB_ENV_KEY from jobs/state) to match the
    // require()-gated jobs/ import pattern above; spawn.test.ts asserts the
    // string matches.
    if ((0, bun_bundle_1.feature)('TEMPLATES') &&
        process.env.CLAUDE_JOB_DIR &&
        querySource.startsWith('repl_main_thread') &&
        !toolUseContext.agentId) {
        // Full turn history — assistantMessages resets each queryLoop iteration,
        // so tool calls from earlier iterations (Agent spawn, then summary) need
        // messagesForQuery to be visible in the tool-call summary.
        const turnAssistantMessages = stopHookContext.messages.filter((m) => m.type === 'assistant');
        const p = jobClassifierModule
            .classifyAndWriteState(process.env.CLAUDE_JOB_DIR, turnAssistantMessages)
            .catch(err => {
            (0, debug_js_1.logForDebugging)(`[job] classifier error: ${(0, errors_js_1.errorMessage)(err)}`, {
                level: 'error',
            });
        });
        await Promise.race([
            p,
            // eslint-disable-next-line no-restricted-syntax -- sleep() has no .unref(); timer must not block exit
            new Promise(r => setTimeout(r, 60000).unref()),
        ]);
    }
    // --bare / SIMPLE: skip background bookkeeping (prompt suggestion,
    // memory extraction, auto-dream). Scripted -p calls don't want auto-memory
    // or forked agents contending for resources during shutdown.
    if (!(0, envUtils_js_1.isBareMode)()) {
        // Inline env check for dead code elimination in external builds
        if (!(0, envUtils_js_1.isEnvDefinedFalsy)(process.env.CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION)) {
            void (0, promptSuggestion_js_1.executePromptSuggestion)(stopHookContext);
        }
        if ((0, bun_bundle_1.feature)('EXTRACT_MEMORIES') &&
            !toolUseContext.agentId &&
            (0, paths_js_1.isExtractModeActive)()) {
            // Fire-and-forget in both interactive and non-interactive. For -p/SDK,
            // print.ts drains the in-flight promise after flushing the response
            // but before gracefulShutdownSync (see drainPendingExtraction).
            void extractMemoriesModule.executeExtractMemories(stopHookContext, toolUseContext.appendSystemMessage);
        }
        if (!toolUseContext.agentId) {
            void (0, autoDream_js_1.executeAutoDream)(stopHookContext, toolUseContext.appendSystemMessage);
        }
    }
    // chicago MCP: auto-unhide + lock release at turn end.
    // Main thread only — the CU lock is a process-wide module-level variable,
    // so a subagent's stopHooks releasing it leaves the main thread's cleanup
    // seeing isLockHeldLocally()===false → no exit notification, and unhides
    // mid-turn. Subagents don't start CU sessions so this is a pure skip.
    if ((0, bun_bundle_1.feature)('CHICAGO_MCP') && !toolUseContext.agentId) {
        try {
            const { cleanupComputerUseAfterTurn } = await Promise.resolve().then(() => __importStar(require('../utils/computerUse/cleanup.js')));
            await cleanupComputerUseAfterTurn(toolUseContext);
        }
        catch {
            // Failures are silent — this is dogfooding cleanup, not critical path
        }
    }
    try {
        const blockingErrors = [];
        const appState = toolUseContext.getAppState();
        const permissionMode = appState.toolPermissionContext.mode;
        const generator = (0, hooks_js_1.executeStopHooks)(permissionMode, toolUseContext.abortController.signal, undefined, stopHookActive ?? false, toolUseContext.agentId, toolUseContext, [...messagesForQuery, ...assistantMessages], toolUseContext.agentType);
        // Consume all progress messages and get blocking errors
        let stopHookToolUseID = '';
        let hookCount = 0;
        let preventedContinuation = false;
        let stopReason = '';
        let hasOutput = false;
        const hookErrors = [];
        const hookInfos = [];
        for await (const result of generator) {
            if (result.message) {
                yield result.message;
                // Track toolUseID from progress messages and count hooks
                if (result.message.type === 'progress' && result.message.toolUseID) {
                    stopHookToolUseID = result.message.toolUseID;
                    hookCount++;
                    // Extract hook command and prompt text from progress data
                    const progressData = result.message.data;
                    if (progressData.command) {
                        hookInfos.push({
                            command: progressData.command,
                            promptText: progressData.promptText,
                        });
                    }
                }
                // Track errors and output from attachments
                if (result.message.type === 'attachment') {
                    const attachment = result.message.attachment;
                    if ('hookEvent' in attachment &&
                        (attachment.hookEvent === 'Stop' ||
                            attachment.hookEvent === 'SubagentStop')) {
                        if (attachment.type === 'hook_non_blocking_error') {
                            hookErrors.push(attachment.stderr || `Exit code ${attachment.exitCode}`);
                            // Non-blocking errors always have output
                            hasOutput = true;
                        }
                        else if (attachment.type === 'hook_error_during_execution') {
                            hookErrors.push(attachment.content);
                            hasOutput = true;
                        }
                        else if (attachment.type === 'hook_success') {
                            // Check if successful hook produced any stdout/stderr
                            if ((attachment.stdout && attachment.stdout.trim()) ||
                                (attachment.stderr && attachment.stderr.trim())) {
                                hasOutput = true;
                            }
                        }
                        // Extract per-hook duration for timing visibility.
                        // Hooks run in parallel; match by command + first unassigned entry.
                        if ('durationMs' in attachment && 'command' in attachment) {
                            const info = hookInfos.find(i => i.command === attachment.command &&
                                i.durationMs === undefined);
                            if (info) {
                                info.durationMs = attachment.durationMs;
                            }
                        }
                    }
                }
            }
            if (result.blockingError) {
                const userMessage = (0, messages_js_1.createUserMessage)({
                    content: (0, hooks_js_1.getStopHookMessage)(result.blockingError),
                    isMeta: true, // Hide from UI (shown in summary message instead)
                });
                blockingErrors.push(userMessage);
                yield userMessage;
                hasOutput = true;
                // Add to hookErrors so it appears in the summary
                hookErrors.push(result.blockingError.blockingError);
            }
            // Check if hook wants to prevent continuation
            if (result.preventContinuation) {
                preventedContinuation = true;
                stopReason = result.stopReason || 'Stop hook prevented continuation';
                // Create attachment to track the stopped continuation (for structured data)
                yield (0, attachments_js_1.createAttachmentMessage)({
                    type: 'hook_stopped_continuation',
                    message: stopReason,
                    hookName: 'Stop',
                    toolUseID: stopHookToolUseID,
                    hookEvent: 'Stop',
                });
            }
            // Check if we were aborted during hook execution
            if (toolUseContext.abortController.signal.aborted) {
                (0, index_js_1.logEvent)('tengu_pre_stop_hooks_cancelled', {
                    queryChainId: toolUseContext.queryTracking
                        ?.chainId,
                    queryDepth: toolUseContext.queryTracking?.depth,
                });
                yield (0, messages_js_1.createUserInterruptionMessage)({
                    toolUse: false,
                });
                return { blockingErrors: [], preventContinuation: true };
            }
        }
        // Create summary system message if hooks ran
        if (hookCount > 0) {
            yield (0, messages_js_1.createStopHookSummaryMessage)(hookCount, hookInfos, hookErrors, preventedContinuation, stopReason, hasOutput, 'suggestion', stopHookToolUseID);
            // Send notification about errors (shown in verbose/transcript mode via ctrl+o)
            if (hookErrors.length > 0) {
                const expandShortcut = (0, shortcutFormat_js_1.getShortcutDisplay)('app:toggleTranscript', 'Global', 'ctrl+o');
                toolUseContext.addNotification?.({
                    key: 'stop-hook-error',
                    text: `Stop hook error occurred \u00b7 ${expandShortcut} to see`,
                    priority: 'immediate',
                });
            }
        }
        if (preventedContinuation) {
            return { blockingErrors: [], preventContinuation: true };
        }
        // Collect blocking errors from stop hooks
        if (blockingErrors.length > 0) {
            return { blockingErrors, preventContinuation: false };
        }
        // After Stop hooks pass, run TeammateIdle and TaskCompleted hooks if this is a teammate
        if ((0, teammate_js_1.isTeammate)()) {
            const teammateName = (0, teammate_js_1.getAgentName)() ?? '';
            const teamName = (0, teammate_js_1.getTeamName)() ?? '';
            const teammateBlockingErrors = [];
            let teammatePreventedContinuation = false;
            let teammateStopReason;
            // Each hook executor generates its own toolUseID — capture from progress
            // messages (same pattern as stopHookToolUseID at L142), not the Stop ID.
            let teammateHookToolUseID = '';
            // Run TaskCompleted hooks for any in-progress tasks owned by this teammate
            const taskListId = (0, tasks_js_1.getTaskListId)();
            const tasks = await (0, tasks_js_1.listTasks)(taskListId);
            const inProgressTasks = tasks.filter(t => t.status === 'in_progress' && t.owner === teammateName);
            for (const task of inProgressTasks) {
                const taskCompletedGenerator = (0, hooks_js_1.executeTaskCompletedHooks)(task.id, task.subject, task.description, teammateName, teamName, permissionMode, toolUseContext.abortController.signal, undefined, toolUseContext);
                for await (const result of taskCompletedGenerator) {
                    if (result.message) {
                        if (result.message.type === 'progress' &&
                            result.message.toolUseID) {
                            teammateHookToolUseID = result.message.toolUseID;
                        }
                        yield result.message;
                    }
                    if (result.blockingError) {
                        const userMessage = (0, messages_js_1.createUserMessage)({
                            content: (0, hooks_js_1.getTaskCompletedHookMessage)(result.blockingError),
                            isMeta: true,
                        });
                        teammateBlockingErrors.push(userMessage);
                        yield userMessage;
                    }
                    // Match Stop hook behavior: allow preventContinuation/stopReason
                    if (result.preventContinuation) {
                        teammatePreventedContinuation = true;
                        teammateStopReason =
                            result.stopReason || 'TaskCompleted hook prevented continuation';
                        yield (0, attachments_js_1.createAttachmentMessage)({
                            type: 'hook_stopped_continuation',
                            message: teammateStopReason,
                            hookName: 'TaskCompleted',
                            toolUseID: teammateHookToolUseID,
                            hookEvent: 'TaskCompleted',
                        });
                    }
                    if (toolUseContext.abortController.signal.aborted) {
                        return { blockingErrors: [], preventContinuation: true };
                    }
                }
            }
            // Run TeammateIdle hooks
            const teammateIdleGenerator = (0, hooks_js_1.executeTeammateIdleHooks)(teammateName, teamName, permissionMode, toolUseContext.abortController.signal);
            for await (const result of teammateIdleGenerator) {
                if (result.message) {
                    if (result.message.type === 'progress' && result.message.toolUseID) {
                        teammateHookToolUseID = result.message.toolUseID;
                    }
                    yield result.message;
                }
                if (result.blockingError) {
                    const userMessage = (0, messages_js_1.createUserMessage)({
                        content: (0, hooks_js_1.getTeammateIdleHookMessage)(result.blockingError),
                        isMeta: true,
                    });
                    teammateBlockingErrors.push(userMessage);
                    yield userMessage;
                }
                // Match Stop hook behavior: allow preventContinuation/stopReason
                if (result.preventContinuation) {
                    teammatePreventedContinuation = true;
                    teammateStopReason =
                        result.stopReason || 'TeammateIdle hook prevented continuation';
                    yield (0, attachments_js_1.createAttachmentMessage)({
                        type: 'hook_stopped_continuation',
                        message: teammateStopReason,
                        hookName: 'TeammateIdle',
                        toolUseID: teammateHookToolUseID,
                        hookEvent: 'TeammateIdle',
                    });
                }
                if (toolUseContext.abortController.signal.aborted) {
                    return { blockingErrors: [], preventContinuation: true };
                }
            }
            if (teammatePreventedContinuation) {
                return { blockingErrors: [], preventContinuation: true };
            }
            if (teammateBlockingErrors.length > 0) {
                return {
                    blockingErrors: teammateBlockingErrors,
                    preventContinuation: false,
                };
            }
        }
        return { blockingErrors: [], preventContinuation: false };
    }
    catch (error) {
        const durationMs = Date.now() - hookStartTime;
        (0, index_js_1.logEvent)('tengu_stop_hook_error', {
            duration: durationMs,
            queryChainId: toolUseContext.queryTracking
                ?.chainId,
            queryDepth: toolUseContext.queryTracking?.depth,
        });
        // Yield a system message that is not visible to the model for the user
        // to debug their hook.
        yield (0, messages_js_1.createSystemMessage)(`Stop hook failed: ${(0, errors_js_1.errorMessage)(error)}`, 'warning');
        return { blockingErrors: [], preventContinuation: false };
    }
}
