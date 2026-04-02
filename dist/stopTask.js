"use strict";
// Shared logic for stopping a running task.
// Used by TaskStopTool (LLM-invoked) and SDK stop_task control request.
Object.defineProperty(exports, "__esModule", { value: true });
exports.StopTaskError = void 0;
exports.stopTask = stopTask;
const tasks_js_1 = require("../tasks.js");
const sdkEventQueue_js_1 = require("../utils/sdkEventQueue.js");
const guards_js_1 = require("./LocalShellTask/guards.js");
class StopTaskError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'StopTaskError';
    }
}
exports.StopTaskError = StopTaskError;
/**
 * Look up a task by ID, validate it is running, kill it, and mark it as notified.
 *
 * Throws {@link StopTaskError} when the task cannot be stopped (not found,
 * not running, or unsupported type). Callers can inspect `error.code` to
 * distinguish the failure reason.
 */
async function stopTask(taskId, context) {
    const { getAppState, setAppState } = context;
    const appState = getAppState();
    const task = appState.tasks?.[taskId];
    if (!task) {
        throw new StopTaskError(`No task found with ID: ${taskId}`, 'not_found');
    }
    if (task.status !== 'running') {
        throw new StopTaskError(`Task ${taskId} is not running (status: ${task.status})`, 'not_running');
    }
    const taskImpl = (0, tasks_js_1.getTaskByType)(task.type);
    if (!taskImpl) {
        throw new StopTaskError(`Unsupported task type: ${task.type}`, 'unsupported_type');
    }
    await taskImpl.kill(taskId, setAppState);
    // Bash: suppress the "exit code 137" notification (noise). Agent tasks: don't
    // suppress — the AbortError catch sends a notification carrying
    // extractPartialResult(agentMessages), which is the payload not noise.
    if ((0, guards_js_1.isLocalShellTask)(task)) {
        let suppressed = false;
        setAppState(prev => {
            const prevTask = prev.tasks[taskId];
            if (!prevTask || prevTask.notified) {
                return prev;
            }
            suppressed = true;
            return {
                ...prev,
                tasks: {
                    ...prev.tasks,
                    [taskId]: { ...prevTask, notified: true },
                },
            };
        });
        // Suppressing the XML notification also suppresses print.ts's parsed
        // task_notification SDK event — emit it directly so SDK consumers see
        // the task close.
        if (suppressed) {
            (0, sdkEventQueue_js_1.emitTaskTerminatedSdk)(taskId, 'stopped', {
                toolUseId: task.toolUseId,
                summary: task.description,
            });
        }
    }
    const command = (0, guards_js_1.isLocalShellTask)(task) ? task.command : task.description;
    return { taskId, taskType: task.type, command };
}
