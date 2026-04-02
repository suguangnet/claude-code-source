"use strict";
// Pure (non-React) kill helpers for LocalShellTask.
// Extracted so runAgent.ts can kill agent-scoped bash tasks without pulling
// React/Ink into its module graph (same rationale as guards.ts).
Object.defineProperty(exports, "__esModule", { value: true });
exports.killTask = killTask;
exports.killShellTasksForAgent = killShellTasksForAgent;
const debug_js_1 = require("../../utils/debug.js");
const log_js_1 = require("../../utils/log.js");
const messageQueueManager_js_1 = require("../../utils/messageQueueManager.js");
const diskOutput_js_1 = require("../../utils/task/diskOutput.js");
const framework_js_1 = require("../../utils/task/framework.js");
const guards_js_1 = require("./guards.js");
function killTask(taskId, setAppState) {
    (0, framework_js_1.updateTaskState)(taskId, setAppState, task => {
        if (task.status !== 'running' || !(0, guards_js_1.isLocalShellTask)(task)) {
            return task;
        }
        try {
            (0, debug_js_1.logForDebugging)(`LocalShellTask ${taskId} kill requested`);
            task.shellCommand?.kill();
            task.shellCommand?.cleanup();
        }
        catch (error) {
            (0, log_js_1.logError)(error);
        }
        task.unregisterCleanup?.();
        if (task.cleanupTimeoutId) {
            clearTimeout(task.cleanupTimeoutId);
        }
        return {
            ...task,
            status: 'killed',
            notified: true,
            shellCommand: null,
            unregisterCleanup: undefined,
            cleanupTimeoutId: undefined,
            endTime: Date.now(),
        };
    });
    void (0, diskOutput_js_1.evictTaskOutput)(taskId);
}
/**
 * Kill all running bash tasks spawned by a given agent.
 * Called from runAgent.ts finally block so background processes don't outlive
 * the agent that started them (prevents 10-day fake-logs.sh zombies).
 */
function killShellTasksForAgent(agentId, getAppState, setAppState) {
    const tasks = getAppState().tasks ?? {};
    for (const [taskId, task] of Object.entries(tasks)) {
        if ((0, guards_js_1.isLocalShellTask)(task) &&
            task.agentId === agentId &&
            task.status === 'running') {
            (0, debug_js_1.logForDebugging)(`killShellTasksForAgent: killing orphaned shell task ${taskId} (agent ${agentId} exiting)`);
            killTask(taskId, setAppState);
        }
    }
    // Purge any queued notifications addressed to this agent — its query loop
    // has exited and won't drain them. killTask fires 'killed' notifications
    // asynchronously; drop the ones already queued and any that land later sit
    // harmlessly (no consumer matches a dead agentId).
    (0, messageQueueManager_js_1.dequeueAllMatching)(cmd => cmd.agentId === agentId);
}
