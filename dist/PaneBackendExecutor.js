"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaneBackendExecutor = void 0;
exports.createPaneBackendExecutor = createPaneBackendExecutor;
const state_js_1 = require("../../../bootstrap/state.js");
const agentId_js_1 = require("../../../utils/agentId.js");
const shellQuote_js_1 = require("../../../utils/bash/shellQuote.js");
const cleanupRegistry_js_1 = require("../../../utils/cleanupRegistry.js");
const debug_js_1 = require("../../../utils/debug.js");
const slowOperations_js_1 = require("../../../utils/slowOperations.js");
const teammateMailbox_js_1 = require("../../../utils/teammateMailbox.js");
const spawnUtils_js_1 = require("../spawnUtils.js");
const teammateLayoutManager_js_1 = require("../teammateLayoutManager.js");
const detection_js_1 = require("./detection.js");
/**
 * PaneBackendExecutor adapts a PaneBackend to the TeammateExecutor interface.
 *
 * This allows pane-based backends (tmux, iTerm2) to be used through the same
 * TeammateExecutor abstraction as InProcessBackend, making getTeammateExecutor()
 * return a meaningful executor regardless of execution mode.
 *
 * The adapter handles:
 * - spawn(): Creates a pane and sends the Claude CLI command to it
 * - sendMessage(): Writes to the teammate's file-based mailbox
 * - terminate(): Sends a shutdown request via mailbox
 * - kill(): Kills the pane via the backend
 * - isActive(): Checks if the pane is still running
 */
class PaneBackendExecutor {
    constructor(backend) {
        this.context = null;
        this.cleanupRegistered = false;
        this.backend = backend;
        this.type = backend.type;
        this.spawnedTeammates = new Map();
    }
    /**
     * Sets the ToolUseContext for this executor.
     * Must be called before spawn() to provide access to AppState and permissions.
     */
    setContext(context) {
        this.context = context;
    }
    /**
     * Checks if the underlying pane backend is available.
     */
    async isAvailable() {
        return this.backend.isAvailable();
    }
    /**
     * Spawns a teammate in a new pane.
     *
     * Creates a pane via the backend, builds the CLI command with teammate
     * identity flags, and sends it to the pane.
     */
    async spawn(config) {
        const agentId = (0, agentId_js_1.formatAgentId)(config.name, config.teamName);
        if (!this.context) {
            (0, debug_js_1.logForDebugging)(`[PaneBackendExecutor] spawn() called without context for ${config.name}`);
            return {
                success: false,
                agentId,
                error: 'PaneBackendExecutor not initialized. Call setContext() before spawn().',
            };
        }
        try {
            // Assign a unique color to this teammate
            const teammateColor = config.color ?? (0, teammateLayoutManager_js_1.assignTeammateColor)(agentId);
            // Create a pane in the swarm view
            const { paneId, isFirstTeammate } = await this.backend.createTeammatePaneInSwarmView(config.name, teammateColor);
            // Check if we're inside tmux to determine how to send commands
            const insideTmux = await (0, detection_js_1.isInsideTmux)();
            // Enable pane border status on first teammate when inside tmux
            if (isFirstTeammate && insideTmux) {
                await this.backend.enablePaneBorderStatus();
            }
            // Build the command to spawn Claude Code with teammate identity
            const binaryPath = (0, spawnUtils_js_1.getTeammateCommand)();
            // Build teammate identity CLI args
            const teammateArgs = [
                `--agent-id ${(0, shellQuote_js_1.quote)([agentId])}`,
                `--agent-name ${(0, shellQuote_js_1.quote)([config.name])}`,
                `--team-name ${(0, shellQuote_js_1.quote)([config.teamName])}`,
                `--agent-color ${(0, shellQuote_js_1.quote)([teammateColor])}`,
                `--parent-session-id ${(0, shellQuote_js_1.quote)([config.parentSessionId || (0, state_js_1.getSessionId)()])}`,
                config.planModeRequired ? '--plan-mode-required' : '',
            ]
                .filter(Boolean)
                .join(' ');
            // Build CLI flags to propagate to teammate
            const appState = this.context.getAppState();
            let inheritedFlags = (0, spawnUtils_js_1.buildInheritedCliFlags)({
                planModeRequired: config.planModeRequired,
                permissionMode: appState.toolPermissionContext.mode,
            });
            // If teammate has a custom model, add --model flag (or replace inherited one)
            if (config.model) {
                inheritedFlags = inheritedFlags
                    .split(' ')
                    .filter((flag, i, arr) => flag !== '--model' && arr[i - 1] !== '--model')
                    .join(' ');
                inheritedFlags = inheritedFlags
                    ? `${inheritedFlags} --model ${(0, shellQuote_js_1.quote)([config.model])}`
                    : `--model ${(0, shellQuote_js_1.quote)([config.model])}`;
            }
            const flagsStr = inheritedFlags ? ` ${inheritedFlags}` : '';
            const workingDir = config.cwd;
            // Build environment variables to forward to teammate
            const envStr = (0, spawnUtils_js_1.buildInheritedEnvVars)();
            const spawnCommand = `cd ${(0, shellQuote_js_1.quote)([workingDir])} && env ${envStr} ${(0, shellQuote_js_1.quote)([binaryPath])} ${teammateArgs}${flagsStr}`;
            // Send the command to the new pane
            // Use swarm socket when running outside tmux (external swarm session)
            await this.backend.sendCommandToPane(paneId, spawnCommand, !insideTmux);
            // Track the spawned teammate
            this.spawnedTeammates.set(agentId, { paneId, insideTmux });
            // Register cleanup to kill all panes on leader exit (e.g., SIGHUP)
            if (!this.cleanupRegistered) {
                this.cleanupRegistered = true;
                (0, cleanupRegistry_js_1.registerCleanup)(async () => {
                    for (const [id, info] of this.spawnedTeammates) {
                        (0, debug_js_1.logForDebugging)(`[PaneBackendExecutor] Cleanup: killing pane for ${id}`);
                        await this.backend.killPane(info.paneId, !info.insideTmux);
                    }
                    this.spawnedTeammates.clear();
                });
            }
            // Send initial instructions to teammate via mailbox
            await (0, teammateMailbox_js_1.writeToMailbox)(config.name, {
                from: 'team-lead',
                text: config.prompt,
                timestamp: new Date().toISOString(),
            }, config.teamName);
            (0, debug_js_1.logForDebugging)(`[PaneBackendExecutor] Spawned teammate ${agentId} in pane ${paneId}`);
            return {
                success: true,
                agentId,
                paneId,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            (0, debug_js_1.logForDebugging)(`[PaneBackendExecutor] Failed to spawn ${agentId}: ${errorMessage}`);
            return {
                success: false,
                agentId,
                error: errorMessage,
            };
        }
    }
    /**
     * Sends a message to a pane-based teammate via file-based mailbox.
     *
     * All teammates (pane and in-process) use the same mailbox mechanism.
     */
    async sendMessage(agentId, message) {
        (0, debug_js_1.logForDebugging)(`[PaneBackendExecutor] sendMessage() to ${agentId}: ${message.text.substring(0, 50)}...`);
        const parsed = (0, agentId_js_1.parseAgentId)(agentId);
        if (!parsed) {
            throw new Error(`Invalid agentId format: ${agentId}. Expected format: agentName@teamName`);
        }
        const { agentName, teamName } = parsed;
        await (0, teammateMailbox_js_1.writeToMailbox)(agentName, {
            text: message.text,
            from: message.from,
            color: message.color,
            timestamp: message.timestamp ?? new Date().toISOString(),
        }, teamName);
        (0, debug_js_1.logForDebugging)(`[PaneBackendExecutor] sendMessage() completed for ${agentId}`);
    }
    /**
     * Gracefully terminates a pane-based teammate.
     *
     * For pane-based teammates, we send a shutdown request via mailbox and
     * let the teammate process handle exit gracefully.
     */
    async terminate(agentId, reason) {
        (0, debug_js_1.logForDebugging)(`[PaneBackendExecutor] terminate() called for ${agentId}: ${reason}`);
        const parsed = (0, agentId_js_1.parseAgentId)(agentId);
        if (!parsed) {
            (0, debug_js_1.logForDebugging)(`[PaneBackendExecutor] terminate() failed: invalid agentId format`);
            return false;
        }
        const { agentName, teamName } = parsed;
        // Send shutdown request via mailbox
        const shutdownRequest = {
            type: 'shutdown_request',
            requestId: `shutdown-${agentId}-${Date.now()}`,
            from: 'team-lead',
            reason,
        };
        await (0, teammateMailbox_js_1.writeToMailbox)(agentName, {
            from: 'team-lead',
            text: (0, slowOperations_js_1.jsonStringify)(shutdownRequest),
            timestamp: new Date().toISOString(),
        }, teamName);
        (0, debug_js_1.logForDebugging)(`[PaneBackendExecutor] terminate() sent shutdown request to ${agentId}`);
        return true;
    }
    /**
     * Force kills a pane-based teammate by killing its pane.
     */
    async kill(agentId) {
        (0, debug_js_1.logForDebugging)(`[PaneBackendExecutor] kill() called for ${agentId}`);
        const teammateInfo = this.spawnedTeammates.get(agentId);
        if (!teammateInfo) {
            (0, debug_js_1.logForDebugging)(`[PaneBackendExecutor] kill() failed: teammate ${agentId} not found in spawned map`);
            return false;
        }
        const { paneId, insideTmux } = teammateInfo;
        // Kill the pane via the backend
        // Use external session socket when we spawned outside tmux
        const killed = await this.backend.killPane(paneId, !insideTmux);
        if (killed) {
            this.spawnedTeammates.delete(agentId);
            (0, debug_js_1.logForDebugging)(`[PaneBackendExecutor] kill() succeeded for ${agentId}`);
        }
        else {
            (0, debug_js_1.logForDebugging)(`[PaneBackendExecutor] kill() failed for ${agentId}`);
        }
        return killed;
    }
    /**
     * Checks if a pane-based teammate is still active.
     *
     * For pane-based teammates, we check if the pane still exists.
     * This is a best-effort check - the pane may exist but the process inside
     * may have exited.
     */
    async isActive(agentId) {
        (0, debug_js_1.logForDebugging)(`[PaneBackendExecutor] isActive() called for ${agentId}`);
        const teammateInfo = this.spawnedTeammates.get(agentId);
        if (!teammateInfo) {
            (0, debug_js_1.logForDebugging)(`[PaneBackendExecutor] isActive(): teammate ${agentId} not found`);
            return false;
        }
        // For now, assume active if we have a record of it
        // A more robust check would query the backend for pane existence
        // but that would require adding a new method to PaneBackend
        return true;
    }
}
exports.PaneBackendExecutor = PaneBackendExecutor;
/**
 * Creates a PaneBackendExecutor wrapping the given PaneBackend.
 */
function createPaneBackendExecutor(backend) {
    return new PaneBackendExecutor(backend);
}
