"use strict";
/**
 * LocalMainSessionTask - Handles backgrounding the main session query.
 *
 * When user presses Ctrl+B twice during a query, the session is "backgrounded":
 * - The query continues running in the background
 * - The UI clears to a fresh prompt
 * - A notification is sent when the query completes
 *
 * This reuses the LocalAgentTask state structure since the behavior is similar.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMainSessionTask = registerMainSessionTask;
exports.completeMainSessionTask = completeMainSessionTask;
exports.foregroundMainSessionTask = foregroundMainSessionTask;
exports.isMainSessionTask = isMainSessionTask;
exports.startBackgroundSession = startBackgroundSession;
const crypto_1 = require("crypto");
const xml_js_1 = require("../constants/xml.js");
const query_js_1 = require("../query.js");
const tokenEstimation_js_1 = require("../services/tokenEstimation.js");
const Task_js_1 = require("../Task.js");
const ids_js_1 = require("../types/ids.js");
const abortController_js_1 = require("../utils/abortController.js");
const agentContext_js_1 = require("../utils/agentContext.js");
const cleanupRegistry_js_1 = require("../utils/cleanupRegistry.js");
const debug_js_1 = require("../utils/debug.js");
const log_js_1 = require("../utils/log.js");
const messageQueueManager_js_1 = require("../utils/messageQueueManager.js");
const sdkEventQueue_js_1 = require("../utils/sdkEventQueue.js");
const sessionStorage_js_1 = require("../utils/sessionStorage.js");
const diskOutput_js_1 = require("../utils/task/diskOutput.js");
const framework_js_1 = require("../utils/task/framework.js");
/**
 * Default agent definition for main session tasks when no agent is specified.
 */
const DEFAULT_MAIN_SESSION_AGENT = {
    agentType: 'main-session',
    whenToUse: 'Main session query',
    source: 'userSettings',
    getSystemPrompt: () => '',
};
/**
 * Generate a unique task ID for main session tasks.
 * Uses 's' prefix to distinguish from agent tasks ('a' prefix).
 */
const TASK_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
function generateMainSessionTaskId() {
    const bytes = (0, crypto_1.randomBytes)(8);
    let id = 's';
    for (let i = 0; i < 8; i++) {
        id += TASK_ID_ALPHABET[bytes[i] % TASK_ID_ALPHABET.length];
    }
    return id;
}
/**
 * Register a backgrounded main session task.
 * Called when the user backgrounds the current session query.
 *
 * @param description - Description of the task
 * @param setAppState - State setter function
 * @param mainThreadAgentDefinition - Optional agent definition if running with --agent
 * @param existingAbortController - Optional abort controller to reuse (for backgrounding an active query)
 * @returns Object with task ID and abort signal for stopping the background query
 */
function registerMainSessionTask(description, setAppState, mainThreadAgentDefinition, existingAbortController) {
    const taskId = generateMainSessionTaskId();
    // Link output to an isolated per-task transcript file (same layout as
    // sub-agents). Do NOT use getTranscriptPath() — that's the main session's
    // file, and writing there from a background query after /clear would corrupt
    // the post-clear conversation. The isolated path lets this task survive
    // /clear: the symlink re-link in clearConversation handles session ID changes.
    void (0, diskOutput_js_1.initTaskOutputAsSymlink)(taskId, (0, sessionStorage_js_1.getAgentTranscriptPath)((0, ids_js_1.asAgentId)(taskId)));
    // Use the existing abort controller if provided (important for backgrounding an active query)
    // This ensures that aborting the task will abort the actual query
    const abortController = existingAbortController ?? (0, abortController_js_1.createAbortController)();
    const unregisterCleanup = (0, cleanupRegistry_js_1.registerCleanup)(async () => {
        // Clean up on process exit
        setAppState(prev => {
            const { [taskId]: removed, ...rest } = prev.tasks;
            return { ...prev, tasks: rest };
        });
    });
    // Use provided agent definition or default
    const selectedAgent = mainThreadAgentDefinition ?? DEFAULT_MAIN_SESSION_AGENT;
    // Create task state - already backgrounded since this is called when user backgrounds
    const taskState = {
        ...(0, Task_js_1.createTaskStateBase)(taskId, 'local_agent', description),
        type: 'local_agent',
        status: 'running',
        agentId: taskId,
        prompt: description,
        selectedAgent,
        agentType: 'main-session',
        abortController,
        unregisterCleanup,
        retrieved: false,
        lastReportedToolCount: 0,
        lastReportedTokenCount: 0,
        isBackgrounded: true, // Already backgrounded
        pendingMessages: [],
        retain: false,
        diskLoaded: false,
    };
    (0, debug_js_1.logForDebugging)(`[LocalMainSessionTask] Registering task ${taskId} with description: ${description}`);
    (0, framework_js_1.registerTask)(taskState, setAppState);
    // Verify task was registered by checking state
    setAppState(prev => {
        const hasTask = taskId in prev.tasks;
        (0, debug_js_1.logForDebugging)(`[LocalMainSessionTask] After registration, task ${taskId} exists in state: ${hasTask}`);
        return prev;
    });
    return { taskId, abortSignal: abortController.signal };
}
/**
 * Complete the main session task and send notification.
 * Called when the backgrounded query finishes.
 */
function completeMainSessionTask(taskId, success, setAppState) {
    let wasBackgrounded = true;
    let toolUseId;
    (0, framework_js_1.updateTaskState)(taskId, setAppState, task => {
        if (task.status !== 'running') {
            return task;
        }
        // Track if task was backgrounded (for notification decision)
        wasBackgrounded = task.isBackgrounded ?? true;
        toolUseId = task.toolUseId;
        task.unregisterCleanup?.();
        return {
            ...task,
            status: success ? 'completed' : 'failed',
            endTime: Date.now(),
            messages: task.messages?.length ? [task.messages.at(-1)] : undefined,
        };
    });
    void (0, diskOutput_js_1.evictTaskOutput)(taskId);
    // Only send notification if task is still backgrounded (not foregrounded)
    // If foregrounded, user is watching it directly - no notification needed
    if (wasBackgrounded) {
        enqueueMainSessionNotification(taskId, 'Background session', success ? 'completed' : 'failed', setAppState, toolUseId);
    }
    else {
        // Foregrounded: no XML notification (TUI user is watching), but SDK
        // consumers still need to see the task_started bookend close.
        // Set notified so evictTerminalTask/generateTaskAttachments eviction
        // guards pass; the backgrounded path sets this inside
        // enqueueMainSessionNotification's check-and-set.
        (0, framework_js_1.updateTaskState)(taskId, setAppState, task => ({ ...task, notified: true }));
        (0, sdkEventQueue_js_1.emitTaskTerminatedSdk)(taskId, success ? 'completed' : 'failed', {
            toolUseId,
            summary: 'Background session',
        });
    }
}
/**
 * Enqueue a notification about the backgrounded session completing.
 */
function enqueueMainSessionNotification(taskId, description, status, setAppState, toolUseId) {
    // Atomically check and set notified flag to prevent duplicate notifications.
    let shouldEnqueue = false;
    (0, framework_js_1.updateTaskState)(taskId, setAppState, task => {
        if (task.notified) {
            return task;
        }
        shouldEnqueue = true;
        return { ...task, notified: true };
    });
    if (!shouldEnqueue) {
        return;
    }
    const summary = status === 'completed'
        ? `Background session "${description}" completed`
        : `Background session "${description}" failed`;
    const toolUseIdLine = toolUseId
        ? `\n<${xml_js_1.TOOL_USE_ID_TAG}>${toolUseId}</${xml_js_1.TOOL_USE_ID_TAG}>`
        : '';
    const outputPath = (0, diskOutput_js_1.getTaskOutputPath)(taskId);
    const message = `<${xml_js_1.TASK_NOTIFICATION_TAG}>
<${xml_js_1.TASK_ID_TAG}>${taskId}</${xml_js_1.TASK_ID_TAG}>${toolUseIdLine}
<${xml_js_1.OUTPUT_FILE_TAG}>${outputPath}</${xml_js_1.OUTPUT_FILE_TAG}>
<${xml_js_1.STATUS_TAG}>${status}</${xml_js_1.STATUS_TAG}>
<${xml_js_1.SUMMARY_TAG}>${summary}</${xml_js_1.SUMMARY_TAG}>
</${xml_js_1.TASK_NOTIFICATION_TAG}>`;
    (0, messageQueueManager_js_1.enqueuePendingNotification)({ value: message, mode: 'task-notification' });
}
/**
 * Foreground a main session task - mark it as foregrounded so its output
 * appears in the main view. The background query keeps running.
 * Returns the task's accumulated messages, or undefined if task not found.
 */
function foregroundMainSessionTask(taskId, setAppState) {
    let taskMessages;
    setAppState(prev => {
        const task = prev.tasks[taskId];
        if (!task || task.type !== 'local_agent') {
            return prev;
        }
        taskMessages = task.messages;
        // Restore previous foregrounded task to background if it exists
        const prevId = prev.foregroundedTaskId;
        const prevTask = prevId ? prev.tasks[prevId] : undefined;
        const restorePrev = prevId && prevId !== taskId && prevTask?.type === 'local_agent';
        return {
            ...prev,
            foregroundedTaskId: taskId,
            tasks: {
                ...prev.tasks,
                ...(restorePrev && { [prevId]: { ...prevTask, isBackgrounded: true } }),
                [taskId]: { ...task, isBackgrounded: false },
            },
        };
    });
    return taskMessages;
}
/**
 * Check if a task is a main session task (vs a regular agent task).
 */
function isMainSessionTask(task) {
    if (typeof task !== 'object' ||
        task === null ||
        !('type' in task) ||
        !('agentType' in task)) {
        return false;
    }
    return (task.type === 'local_agent' &&
        task.agentType === 'main-session');
}
// Max recent activities to keep for display
const MAX_RECENT_ACTIVITIES = 5;
/**
 * Start a fresh background session with the given messages.
 *
 * Spawns an independent query() call with the current messages and registers it
 * as a background task. The caller's foreground query continues running normally.
 */
function startBackgroundSession({ messages, queryParams, description, setAppState, agentDefinition, }) {
    const { taskId, abortSignal } = registerMainSessionTask(description, setAppState, agentDefinition);
    // Persist the pre-backgrounding conversation to the task's isolated
    // transcript so TaskOutput shows context immediately. Subsequent messages
    // are written incrementally below.
    void (0, sessionStorage_js_1.recordSidechainTranscript)(messages, taskId).catch(err => (0, debug_js_1.logForDebugging)(`bg-session initial transcript write failed: ${err}`));
    // Wrap in agent context so skill invocations scope to this task's agentId
    // (not null). This lets clearInvokedSkills(preservedAgentIds) selectively
    // preserve this task's skills across /clear. AsyncLocalStorage isolates
    // concurrent async chains — this wrapper doesn't affect the foreground.
    const agentContext = {
        agentId: taskId,
        agentType: 'subagent',
        subagentName: 'main-session',
        isBuiltIn: true,
    };
    void (0, agentContext_js_1.runWithAgentContext)(agentContext, async () => {
        try {
            const bgMessages = [...messages];
            const recentActivities = [];
            let toolCount = 0;
            let tokenCount = 0;
            let lastRecordedUuid = messages.at(-1)?.uuid ?? null;
            for await (const event of (0, query_js_1.query)({
                messages: bgMessages,
                ...queryParams,
            })) {
                if (abortSignal.aborted) {
                    // Aborted mid-stream — completeMainSessionTask won't be reached.
                    // chat:killAgents path already marked notified + emitted; stopTask path did not.
                    let alreadyNotified = false;
                    (0, framework_js_1.updateTaskState)(taskId, setAppState, task => {
                        alreadyNotified = task.notified === true;
                        return alreadyNotified ? task : { ...task, notified: true };
                    });
                    if (!alreadyNotified) {
                        (0, sdkEventQueue_js_1.emitTaskTerminatedSdk)(taskId, 'stopped', {
                            summary: description,
                        });
                    }
                    return;
                }
                if (event.type !== 'user' &&
                    event.type !== 'assistant' &&
                    event.type !== 'system') {
                    continue;
                }
                bgMessages.push(event);
                // Per-message write (matches runAgent.ts pattern) — gives live
                // TaskOutput progress and keeps the transcript file current even if
                // /clear re-links the symlink mid-run.
                void (0, sessionStorage_js_1.recordSidechainTranscript)([event], taskId, lastRecordedUuid).catch(err => (0, debug_js_1.logForDebugging)(`bg-session transcript write failed: ${err}`));
                lastRecordedUuid = event.uuid;
                if (event.type === 'assistant') {
                    for (const block of event.message.content) {
                        if (block.type === 'text') {
                            tokenCount += (0, tokenEstimation_js_1.roughTokenCountEstimation)(block.text);
                        }
                        else if (block.type === 'tool_use') {
                            toolCount++;
                            const activity = {
                                toolName: block.name,
                                input: block.input,
                            };
                            recentActivities.push(activity);
                            if (recentActivities.length > MAX_RECENT_ACTIVITIES) {
                                recentActivities.shift();
                            }
                        }
                    }
                }
                setAppState(prev => {
                    const task = prev.tasks[taskId];
                    if (!task || task.type !== 'local_agent')
                        return prev;
                    const prevProgress = task.progress;
                    if (prevProgress?.tokenCount === tokenCount &&
                        prevProgress.toolUseCount === toolCount &&
                        task.messages === bgMessages) {
                        return prev;
                    }
                    return {
                        ...prev,
                        tasks: {
                            ...prev.tasks,
                            [taskId]: {
                                ...task,
                                progress: {
                                    tokenCount,
                                    toolUseCount: toolCount,
                                    recentActivities: prevProgress?.toolUseCount === toolCount
                                        ? prevProgress.recentActivities
                                        : [...recentActivities],
                                },
                                messages: bgMessages,
                            },
                        },
                    };
                });
            }
            completeMainSessionTask(taskId, true, setAppState);
        }
        catch (error) {
            (0, log_js_1.logError)(error);
            completeMainSessionTask(taskId, false, setAppState);
        }
    });
    return taskId;
}
