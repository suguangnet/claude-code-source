"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InProcessBackend = void 0;
exports.createInProcessBackend = createInProcessBackend;
const InProcessTeammateTask_js_1 = require("../../../tasks/InProcessTeammateTask/InProcessTeammateTask.js");
const agentId_js_1 = require("../../../utils/agentId.js");
const debug_js_1 = require("../../../utils/debug.js");
const slowOperations_js_1 = require("../../../utils/slowOperations.js");
const teammateMailbox_js_1 = require("../../../utils/teammateMailbox.js");
const inProcessRunner_js_1 = require("../inProcessRunner.js");
const spawnInProcess_js_1 = require("../spawnInProcess.js");
/**
 * InProcessBackend implements TeammateExecutor for in-process teammates.
 *
 * Unlike pane-based backends (tmux/iTerm2), in-process teammates run in the
 * same Node.js process with isolated context via AsyncLocalStorage. They:
 * - Share resources (API client, MCP connections) with the leader
 * - Communicate via file-based mailbox (same as pane-based teammates)
 * - Are terminated via AbortController (not kill-pane)
 *
 * IMPORTANT: Before spawning, call setContext() to provide the ToolUseContext
 * needed for AppState access. This is intended for use via the TeammateExecutor
 * abstraction (getTeammateExecutor() in registry.ts).
 */
class InProcessBackend {
    constructor() {
        this.type = 'in-process';
        /**
         * Tool use context for AppState access.
         * Must be set via setContext() before spawn() is called.
         */
        this.context = null;
    }
    /**
     * Sets the ToolUseContext for this backend.
     * Called by TeammateTool before spawning to provide AppState access.
     */
    setContext(context) {
        this.context = context;
    }
    /**
     * In-process backend is always available (no external dependencies).
     */
    async isAvailable() {
        return true;
    }
    /**
     * Spawns an in-process teammate.
     *
     * Uses spawnInProcessTeammate() to:
     * 1. Create TeammateContext via createTeammateContext()
     * 2. Create independent AbortController (not linked to parent)
     * 3. Register teammate in AppState.tasks
     * 4. Start agent execution via startInProcessTeammate()
     * 5. Return spawn result with agentId, taskId, abortController
     */
    async spawn(config) {
        if (!this.context) {
            (0, debug_js_1.logForDebugging)(`[InProcessBackend] spawn() called without context for ${config.name}`);
            return {
                success: false,
                agentId: `${config.name}@${config.teamName}`,
                error: 'InProcessBackend not initialized. Call setContext() before spawn().',
            };
        }
        (0, debug_js_1.logForDebugging)(`[InProcessBackend] spawn() called for ${config.name}`);
        const result = await (0, spawnInProcess_js_1.spawnInProcessTeammate)({
            name: config.name,
            teamName: config.teamName,
            prompt: config.prompt,
            color: config.color,
            planModeRequired: config.planModeRequired ?? false,
        }, this.context);
        // If spawn succeeded, start the agent execution loop
        if (result.success &&
            result.taskId &&
            result.teammateContext &&
            result.abortController) {
            // Start the agent loop in the background (fire-and-forget)
            // The prompt is passed through the task state and config
            (0, inProcessRunner_js_1.startInProcessTeammate)({
                identity: {
                    agentId: result.agentId,
                    agentName: config.name,
                    teamName: config.teamName,
                    color: config.color,
                    planModeRequired: config.planModeRequired ?? false,
                    parentSessionId: result.teammateContext.parentSessionId,
                },
                taskId: result.taskId,
                prompt: config.prompt,
                teammateContext: result.teammateContext,
                // Strip messages: the teammate never reads toolUseContext.messages
                // (runAgent overrides it via createSubagentContext). Passing the
                // parent's conversation would pin it for the teammate's lifetime.
                toolUseContext: { ...this.context, messages: [] },
                abortController: result.abortController,
                model: config.model,
                systemPrompt: config.systemPrompt,
                systemPromptMode: config.systemPromptMode,
                allowedTools: config.permissions,
                allowPermissionPrompts: config.allowPermissionPrompts,
            });
            (0, debug_js_1.logForDebugging)(`[InProcessBackend] Started agent execution for ${result.agentId}`);
        }
        return {
            success: result.success,
            agentId: result.agentId,
            taskId: result.taskId,
            abortController: result.abortController,
            error: result.error,
        };
    }
    /**
     * Sends a message to an in-process teammate.
     *
     * All teammates use file-based mailboxes for simplicity.
     */
    async sendMessage(agentId, message) {
        (0, debug_js_1.logForDebugging)(`[InProcessBackend] sendMessage() to ${agentId}: ${message.text.substring(0, 50)}...`);
        // Parse agentId to get agentName and teamName
        // agentId format: "agentName@teamName" (e.g., "researcher@my-team")
        const parsed = (0, agentId_js_1.parseAgentId)(agentId);
        if (!parsed) {
            (0, debug_js_1.logForDebugging)(`[InProcessBackend] Invalid agentId format: ${agentId}`);
            throw new Error(`Invalid agentId format: ${agentId}. Expected format: agentName@teamName`);
        }
        const { agentName, teamName } = parsed;
        // Write to file-based mailbox
        await (0, teammateMailbox_js_1.writeToMailbox)(agentName, {
            text: message.text,
            from: message.from,
            color: message.color,
            timestamp: message.timestamp ?? new Date().toISOString(),
        }, teamName);
        (0, debug_js_1.logForDebugging)(`[InProcessBackend] sendMessage() completed for ${agentId}`);
    }
    /**
     * Gracefully terminates an in-process teammate.
     *
     * Sends a shutdown request message to the teammate and sets the
     * shutdownRequested flag. The teammate processes the request and
     * either approves (exits) or rejects (continues working).
     *
     * Unlike pane-based teammates, in-process teammates handle their own
     * exit via the shutdown flow - no external killPane() is needed.
     */
    async terminate(agentId, reason) {
        (0, debug_js_1.logForDebugging)(`[InProcessBackend] terminate() called for ${agentId}: ${reason}`);
        if (!this.context) {
            (0, debug_js_1.logForDebugging)(`[InProcessBackend] terminate() failed: no context set for ${agentId}`);
            return false;
        }
        // Get current AppState to find the task
        const state = this.context.getAppState();
        const task = (0, InProcessTeammateTask_js_1.findTeammateTaskByAgentId)(agentId, state.tasks);
        if (!task) {
            (0, debug_js_1.logForDebugging)(`[InProcessBackend] terminate() failed: task not found for ${agentId}`);
            return false;
        }
        // Don't send another shutdown request if one is already pending
        if (task.shutdownRequested) {
            (0, debug_js_1.logForDebugging)(`[InProcessBackend] terminate(): shutdown already requested for ${agentId}`);
            return true;
        }
        // Generate deterministic request ID
        const requestId = `shutdown-${agentId}-${Date.now()}`;
        // Create shutdown request message
        const shutdownRequest = (0, teammateMailbox_js_1.createShutdownRequestMessage)({
            requestId,
            from: 'team-lead', // Terminate is always called by the leader
            reason,
        });
        // Send to teammate's mailbox
        const teammateAgentName = task.identity.agentName;
        await (0, teammateMailbox_js_1.writeToMailbox)(teammateAgentName, {
            from: 'team-lead',
            text: (0, slowOperations_js_1.jsonStringify)(shutdownRequest),
            timestamp: new Date().toISOString(),
        }, task.identity.teamName);
        // Mark the task as shutdown requested
        (0, InProcessTeammateTask_js_1.requestTeammateShutdown)(task.id, this.context.setAppState);
        (0, debug_js_1.logForDebugging)(`[InProcessBackend] terminate() sent shutdown request to ${agentId}`);
        return true;
    }
    /**
     * Force kills an in-process teammate immediately.
     *
     * Uses the teammate's AbortController to cancel all async operations
     * and updates the task state to 'killed'.
     */
    async kill(agentId) {
        (0, debug_js_1.logForDebugging)(`[InProcessBackend] kill() called for ${agentId}`);
        if (!this.context) {
            (0, debug_js_1.logForDebugging)(`[InProcessBackend] kill() failed: no context set for ${agentId}`);
            return false;
        }
        // Get current AppState to find the task
        const state = this.context.getAppState();
        const task = (0, InProcessTeammateTask_js_1.findTeammateTaskByAgentId)(agentId, state.tasks);
        if (!task) {
            (0, debug_js_1.logForDebugging)(`[InProcessBackend] kill() failed: task not found for ${agentId}`);
            return false;
        }
        // Kill the teammate via the existing helper function
        const killed = (0, spawnInProcess_js_1.killInProcessTeammate)(task.id, this.context.setAppState);
        (0, debug_js_1.logForDebugging)(`[InProcessBackend] kill() ${killed ? 'succeeded' : 'failed'} for ${agentId}`);
        return killed;
    }
    /**
     * Checks if an in-process teammate is still active.
     *
     * Returns true if the teammate exists, has status 'running',
     * and its AbortController has not been aborted.
     */
    async isActive(agentId) {
        (0, debug_js_1.logForDebugging)(`[InProcessBackend] isActive() called for ${agentId}`);
        if (!this.context) {
            (0, debug_js_1.logForDebugging)(`[InProcessBackend] isActive() failed: no context set for ${agentId}`);
            return false;
        }
        // Get current AppState to find the task
        const state = this.context.getAppState();
        const task = (0, InProcessTeammateTask_js_1.findTeammateTaskByAgentId)(agentId, state.tasks);
        if (!task) {
            (0, debug_js_1.logForDebugging)(`[InProcessBackend] isActive(): task not found for ${agentId}`);
            return false;
        }
        // Check if task is running and not aborted
        const isRunning = task.status === 'running';
        const isAborted = task.abortController?.signal.aborted ?? true;
        const active = isRunning && !isAborted;
        (0, debug_js_1.logForDebugging)(`[InProcessBackend] isActive() for ${agentId}: ${active} (running=${isRunning}, aborted=${isAborted})`);
        return active;
    }
}
exports.InProcessBackend = InProcessBackend;
/**
 * Factory function to create an InProcessBackend instance.
 * Used by the registry (Task #8) to get backend instances.
 */
function createInProcessBackend() {
    return new InProcessBackend();
}
