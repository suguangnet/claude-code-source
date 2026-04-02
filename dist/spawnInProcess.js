"use strict";
/**
 * In-process teammate spawning
 *
 * Creates and registers an in-process teammate task. Unlike process-based
 * teammates (tmux/iTerm2), in-process teammates run in the same Node.js
 * process using AsyncLocalStorage for context isolation.
 *
 * The actual agent execution loop is handled by InProcessTeammateTask
 * component (Task #14). This module handles:
 * 1. Creating TeammateContext
 * 2. Creating linked AbortController
 * 3. Registering InProcessTeammateTaskState in AppState
 * 4. Returning spawn result for backend
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.spawnInProcessTeammate = spawnInProcessTeammate;
exports.killInProcessTeammate = killInProcessTeammate;
const sample_js_1 = __importDefault(require("lodash-es/sample.js"));
const state_js_1 = require("../../bootstrap/state.js");
const spinnerVerbs_js_1 = require("../../constants/spinnerVerbs.js");
const turnCompletionVerbs_js_1 = require("../../constants/turnCompletionVerbs.js");
const Task_js_1 = require("../../Task.js");
const abortController_js_1 = require("../abortController.js");
const agentId_js_1 = require("../agentId.js");
const cleanupRegistry_js_1 = require("../cleanupRegistry.js");
const debug_js_1 = require("../debug.js");
const sdkEventQueue_js_1 = require("../sdkEventQueue.js");
const diskOutput_js_1 = require("../task/diskOutput.js");
const framework_js_1 = require("../task/framework.js");
const teammateContext_js_1 = require("../teammateContext.js");
const perfettoTracing_js_1 = require("../telemetry/perfettoTracing.js");
const teamHelpers_js_1 = require("./teamHelpers.js");
/**
 * Spawns an in-process teammate.
 *
 * Creates the teammate's context, registers the task in AppState, and returns
 * the spawn result. The actual agent execution is driven by the
 * InProcessTeammateTask component which uses runWithTeammateContext() to
 * execute the agent loop with proper identity isolation.
 *
 * @param config - Spawn configuration
 * @param context - Context with setAppState for registering task
 * @returns Spawn result with teammate info
 */
async function spawnInProcessTeammate(config, context) {
    const { name, teamName, prompt, color, planModeRequired, model } = config;
    const { setAppState } = context;
    // Generate deterministic agent ID
    const agentId = (0, agentId_js_1.formatAgentId)(name, teamName);
    const taskId = (0, Task_js_1.generateTaskId)('in_process_teammate');
    (0, debug_js_1.logForDebugging)(`[spawnInProcessTeammate] Spawning ${agentId} (taskId: ${taskId})`);
    try {
        // Create independent AbortController for this teammate
        // Teammates should not be aborted when the leader's query is interrupted
        const abortController = (0, abortController_js_1.createAbortController)();
        // Get parent session ID for transcript correlation
        const parentSessionId = (0, state_js_1.getSessionId)();
        // Create teammate identity (stored as plain data in AppState)
        const identity = {
            agentId,
            agentName: name,
            teamName,
            color,
            planModeRequired,
            parentSessionId,
        };
        // Create teammate context for AsyncLocalStorage
        // This will be used by runWithTeammateContext() during agent execution
        const teammateContext = (0, teammateContext_js_1.createTeammateContext)({
            agentId,
            agentName: name,
            teamName,
            color,
            planModeRequired,
            parentSessionId,
            abortController,
        });
        // Register agent in Perfetto trace for hierarchy visualization
        if ((0, perfettoTracing_js_1.isPerfettoTracingEnabled)()) {
            (0, perfettoTracing_js_1.registerAgent)(agentId, name, parentSessionId);
        }
        // Create task state
        const description = `${name}: ${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`;
        const taskState = {
            ...(0, Task_js_1.createTaskStateBase)(taskId, 'in_process_teammate', description, context.toolUseId),
            type: 'in_process_teammate',
            status: 'running',
            identity,
            prompt,
            model,
            abortController,
            awaitingPlanApproval: false,
            spinnerVerb: (0, sample_js_1.default)((0, spinnerVerbs_js_1.getSpinnerVerbs)()),
            pastTenseVerb: (0, sample_js_1.default)(turnCompletionVerbs_js_1.TURN_COMPLETION_VERBS),
            permissionMode: planModeRequired ? 'plan' : 'default',
            isIdle: false,
            shutdownRequested: false,
            lastReportedToolCount: 0,
            lastReportedTokenCount: 0,
            pendingUserMessages: [],
            messages: [], // Initialize to empty array so getDisplayedMessages works immediately
        };
        // Register cleanup handler for graceful shutdown
        const unregisterCleanup = (0, cleanupRegistry_js_1.registerCleanup)(async () => {
            (0, debug_js_1.logForDebugging)(`[spawnInProcessTeammate] Cleanup called for ${agentId}`);
            abortController.abort();
            // Task state will be updated by the execution loop when it detects abort
        });
        taskState.unregisterCleanup = unregisterCleanup;
        // Register task in AppState
        (0, framework_js_1.registerTask)(taskState, setAppState);
        (0, debug_js_1.logForDebugging)(`[spawnInProcessTeammate] Registered ${agentId} in AppState`);
        return {
            success: true,
            agentId,
            taskId,
            abortController,
            teammateContext,
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during spawn';
        (0, debug_js_1.logForDebugging)(`[spawnInProcessTeammate] Failed to spawn ${agentId}: ${errorMessage}`);
        return {
            success: false,
            agentId,
            error: errorMessage,
        };
    }
}
/**
 * Kills an in-process teammate by aborting its controller.
 *
 * Note: This is the implementation called by InProcessBackend.kill().
 *
 * @param taskId - Task ID of the teammate to kill
 * @param setAppState - AppState setter
 * @returns true if killed successfully
 */
function killInProcessTeammate(taskId, setAppState) {
    let killed = false;
    let teamName = null;
    let agentId = null;
    let toolUseId;
    let description;
    setAppState((prev) => {
        const task = prev.tasks[taskId];
        if (!task || task.type !== 'in_process_teammate') {
            return prev;
        }
        const teammateTask = task;
        if (teammateTask.status !== 'running') {
            return prev;
        }
        // Capture identity for cleanup after state update
        teamName = teammateTask.identity.teamName;
        agentId = teammateTask.identity.agentId;
        toolUseId = teammateTask.toolUseId;
        description = teammateTask.description;
        // Abort the controller to stop execution
        teammateTask.abortController?.abort();
        // Call cleanup handler
        teammateTask.unregisterCleanup?.();
        // Update task state and remove from teamContext.teammates
        killed = true;
        // Call pending idle callbacks to unblock any waiters (e.g., engine.waitForIdle)
        teammateTask.onIdleCallbacks?.forEach(cb => cb());
        // Remove from teamContext.teammates using the agentId
        let updatedTeamContext = prev.teamContext;
        if (prev.teamContext && prev.teamContext.teammates && agentId) {
            const { [agentId]: _, ...remainingTeammates } = prev.teamContext.teammates;
            updatedTeamContext = {
                ...prev.teamContext,
                teammates: remainingTeammates,
            };
        }
        return {
            ...prev,
            teamContext: updatedTeamContext,
            tasks: {
                ...prev.tasks,
                [taskId]: {
                    ...teammateTask,
                    status: 'killed',
                    notified: true,
                    endTime: Date.now(),
                    onIdleCallbacks: [], // Clear callbacks to prevent stale references
                    messages: teammateTask.messages?.length
                        ? [teammateTask.messages[teammateTask.messages.length - 1]]
                        : undefined,
                    pendingUserMessages: [],
                    inProgressToolUseIDs: undefined,
                    abortController: undefined,
                    unregisterCleanup: undefined,
                    currentWorkAbortController: undefined,
                },
            },
        };
    });
    // Remove from team file (outside state updater to avoid file I/O in callback)
    if (teamName && agentId) {
        (0, teamHelpers_js_1.removeMemberByAgentId)(teamName, agentId);
    }
    if (killed) {
        void (0, diskOutput_js_1.evictTaskOutput)(taskId);
        // notified:true was pre-set so no XML notification fires; close the SDK
        // task_started bookend directly. The in-process runner's own
        // completion/failure emit guards on status==='running' so it won't
        // double-emit after seeing status:killed.
        (0, sdkEventQueue_js_1.emitTaskTerminatedSdk)(taskId, 'stopped', {
            toolUseId,
            summary: description,
        });
        setTimeout(framework_js_1.evictTerminalTask.bind(null, taskId, setAppState), framework_js_1.STOPPED_DISPLAY_MS);
    }
    // Release perfetto agent registry entry
    if (agentId) {
        (0, perfettoTracing_js_1.unregisterAgent)(agentId);
    }
    return killed;
}
