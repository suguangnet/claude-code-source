"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PANEL_GRACE_MS = exports.STOPPED_DISPLAY_MS = exports.POLL_INTERVAL_MS = void 0;
exports.updateTaskState = updateTaskState;
exports.registerTask = registerTask;
exports.evictTerminalTask = evictTerminalTask;
exports.getRunningTasks = getRunningTasks;
exports.generateTaskAttachments = generateTaskAttachments;
exports.applyTaskOffsetsAndEvictions = applyTaskOffsetsAndEvictions;
exports.pollTasks = pollTasks;
const xml_js_1 = require("../../constants/xml.js");
const Task_js_1 = require("../../Task.js");
const messageQueueManager_js_1 = require("../messageQueueManager.js");
const sdkEventQueue_js_1 = require("../sdkEventQueue.js");
const diskOutput_js_1 = require("./diskOutput.js");
// Standard polling interval for all tasks
exports.POLL_INTERVAL_MS = 1000;
// Duration to display killed tasks before eviction
exports.STOPPED_DISPLAY_MS = 3000;
// Grace period for terminal local_agent tasks in the coordinator panel
exports.PANEL_GRACE_MS = 30000;
/**
 * Update a task's state in AppState.
 * Helper function for task implementations.
 * Generic to allow type-safe updates for specific task types.
 */
function updateTaskState(taskId, setAppState, updater) {
    setAppState(prev => {
        const task = prev.tasks?.[taskId];
        if (!task) {
            return prev;
        }
        const updated = updater(task);
        if (updated === task) {
            // Updater returned the same reference (early-return no-op). Skip the
            // spread so s.tasks subscribers don't re-render on unchanged state.
            return prev;
        }
        return {
            ...prev,
            tasks: {
                ...prev.tasks,
                [taskId]: updated,
            },
        };
    });
}
/**
 * Register a new task in AppState.
 */
function registerTask(task, setAppState) {
    let isReplacement = false;
    setAppState(prev => {
        const existing = prev.tasks[task.id];
        isReplacement = existing !== undefined;
        // Carry forward UI-held state on re-register (resumeAgentBackground
        // replaces the task; user's retain shouldn't reset). startTime keeps
        // the panel sort stable; messages + diskLoaded preserve the viewed
        // transcript across the replace (the user's just-appended prompt lives
        // in messages and isn't on disk yet).
        const merged = existing && 'retain' in existing
            ? {
                ...task,
                retain: existing.retain,
                startTime: existing.startTime,
                messages: existing.messages,
                diskLoaded: existing.diskLoaded,
                pendingMessages: existing.pendingMessages,
            }
            : task;
        return { ...prev, tasks: { ...prev.tasks, [task.id]: merged } };
    });
    // Replacement (resume) — not a new start. Skip to avoid double-emit.
    if (isReplacement)
        return;
    (0, sdkEventQueue_js_1.enqueueSdkEvent)({
        type: 'system',
        subtype: 'task_started',
        task_id: task.id,
        tool_use_id: task.toolUseId,
        description: task.description,
        task_type: task.type,
        workflow_name: 'workflowName' in task
            ? task.workflowName
            : undefined,
        prompt: 'prompt' in task ? task.prompt : undefined,
    });
}
/**
 * Eagerly evict a terminal task from AppState.
 * The task must be in a terminal state (completed/failed/killed) with notified=true.
 * This allows memory to be freed without waiting for the next query loop iteration.
 * The lazy GC in generateTaskAttachments() remains as a safety net.
 */
function evictTerminalTask(taskId, setAppState) {
    setAppState(prev => {
        const task = prev.tasks?.[taskId];
        if (!task)
            return prev;
        if (!(0, Task_js_1.isTerminalTaskStatus)(task.status))
            return prev;
        if (!task.notified)
            return prev;
        // Panel grace period — blocks eviction until deadline passes.
        // 'retain' in task narrows to LocalAgentTaskState (the only type with
        // that field); evictAfter is optional so 'evictAfter' in task would
        // miss tasks that haven't had it set yet.
        if ('retain' in task && (task.evictAfter ?? Infinity) > Date.now()) {
            return prev;
        }
        const { [taskId]: _, ...remainingTasks } = prev.tasks;
        return { ...prev, tasks: remainingTasks };
    });
}
/**
 * Get all running tasks.
 */
function getRunningTasks(state) {
    const tasks = state.tasks ?? {};
    return Object.values(tasks).filter(task => task.status === 'running');
}
/**
 * Generate attachments for tasks with new output or status changes.
 * Called by the framework to create push notifications.
 */
async function generateTaskAttachments(state) {
    const attachments = [];
    const updatedTaskOffsets = {};
    const evictedTaskIds = [];
    const tasks = state.tasks ?? {};
    for (const taskState of Object.values(tasks)) {
        if (taskState.notified) {
            switch (taskState.status) {
                case 'completed':
                case 'failed':
                case 'killed':
                    // Evict terminal tasks — they've been consumed and can be GC'd
                    evictedTaskIds.push(taskState.id);
                    continue;
                case 'pending':
                    // Keep in map — hasn't run yet, but parent already knows about it
                    continue;
                case 'running':
                    // Fall through to running logic below
                    break;
            }
        }
        if (taskState.status === 'running') {
            const delta = await (0, diskOutput_js_1.getTaskOutputDelta)(taskState.id, taskState.outputOffset);
            if (delta.content) {
                updatedTaskOffsets[taskState.id] = delta.newOffset;
            }
        }
        // Completed tasks are NOT notified here — each task type handles its own
        // completion notification via enqueuePendingNotification(). Generating
        // attachments here would race with those per-type callbacks, causing
        // dual delivery (one inline attachment + one separate API turn).
    }
    return { attachments, updatedTaskOffsets, evictedTaskIds };
}
/**
 * Apply the outputOffset patches and evictions from generateTaskAttachments.
 * Merges patches against FRESH prev.tasks (not the stale pre-await snapshot),
 * so concurrent status transitions aren't clobbered.
 */
function applyTaskOffsetsAndEvictions(setAppState, updatedTaskOffsets, evictedTaskIds) {
    const offsetIds = Object.keys(updatedTaskOffsets);
    if (offsetIds.length === 0 && evictedTaskIds.length === 0) {
        return;
    }
    setAppState(prev => {
        let changed = false;
        const newTasks = { ...prev.tasks };
        for (const id of offsetIds) {
            const fresh = newTasks[id];
            // Re-check status on fresh state — task may have completed during the
            // await. If it's no longer running, the offset update is moot.
            if (fresh?.status === 'running') {
                newTasks[id] = { ...fresh, outputOffset: updatedTaskOffsets[id] };
                changed = true;
            }
        }
        for (const id of evictedTaskIds) {
            const fresh = newTasks[id];
            // Re-check terminal+notified on fresh state (TOCTOU: resume may have
            // replaced the task during the generateTaskAttachments await)
            if (!fresh || !(0, Task_js_1.isTerminalTaskStatus)(fresh.status) || !fresh.notified) {
                continue;
            }
            if ('retain' in fresh && (fresh.evictAfter ?? Infinity) > Date.now()) {
                continue;
            }
            delete newTasks[id];
            changed = true;
        }
        return changed ? { ...prev, tasks: newTasks } : prev;
    });
}
/**
 * Poll all running tasks and check for updates.
 * This is the main polling loop called by the framework.
 */
async function pollTasks(getAppState, setAppState) {
    const state = getAppState();
    const { attachments, updatedTaskOffsets, evictedTaskIds } = await generateTaskAttachments(state);
    applyTaskOffsetsAndEvictions(setAppState, updatedTaskOffsets, evictedTaskIds);
    // Send notifications for completed tasks
    for (const attachment of attachments) {
        enqueueTaskNotification(attachment);
    }
}
/**
 * Enqueue a task notification to the message queue.
 */
function enqueueTaskNotification(attachment) {
    const statusText = getStatusText(attachment.status);
    const outputPath = (0, diskOutput_js_1.getTaskOutputPath)(attachment.taskId);
    const toolUseIdLine = attachment.toolUseId
        ? `\n<${xml_js_1.TOOL_USE_ID_TAG}>${attachment.toolUseId}</${xml_js_1.TOOL_USE_ID_TAG}>`
        : '';
    const message = `<${xml_js_1.TASK_NOTIFICATION_TAG}>
<${xml_js_1.TASK_ID_TAG}>${attachment.taskId}</${xml_js_1.TASK_ID_TAG}>${toolUseIdLine}
<${xml_js_1.TASK_TYPE_TAG}>${attachment.taskType}</${xml_js_1.TASK_TYPE_TAG}>
<${xml_js_1.OUTPUT_FILE_TAG}>${outputPath}</${xml_js_1.OUTPUT_FILE_TAG}>
<${xml_js_1.STATUS_TAG}>${attachment.status}</${xml_js_1.STATUS_TAG}>
<${xml_js_1.SUMMARY_TAG}>Task "${attachment.description}" ${statusText}</${xml_js_1.SUMMARY_TAG}>
</${xml_js_1.TASK_NOTIFICATION_TAG}>`;
    (0, messageQueueManager_js_1.enqueuePendingNotification)({ value: message, mode: 'task-notification' });
}
/**
 * Get human-readable status text.
 */
function getStatusText(status) {
    switch (status) {
        case 'completed':
            return 'completed successfully';
        case 'failed':
            return 'failed';
        case 'killed':
            return 'was stopped';
        case 'running':
            return 'is running';
        case 'pending':
            return 'is pending';
    }
}
