"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useInboxPoller = useInboxPoller;
const crypto_1 = require("crypto");
const react_1 = require("react");
const usehooks_ts_1 = require("usehooks-ts");
const xml_js_1 = require("../constants/xml.js");
const useTerminalNotification_js_1 = require("../ink/useTerminalNotification.js");
const notifier_js_1 = require("../services/notifier.js");
const AppState_js_1 = require("../state/AppState.js");
const Tool_js_1 = require("../Tool.js");
const types_js_1 = require("../tasks/InProcessTeammateTask/types.js");
const tools_js_1 = require("../tools.js");
const debug_js_1 = require("../utils/debug.js");
const inProcessTeammateHelpers_js_1 = require("../utils/inProcessTeammateHelpers.js");
const messages_js_1 = require("../utils/messages.js");
const PermissionMode_js_1 = require("../utils/permissions/PermissionMode.js");
const PermissionUpdate_js_1 = require("../utils/permissions/PermissionUpdate.js");
const slowOperations_js_1 = require("../utils/slowOperations.js");
const detection_js_1 = require("../utils/swarm/backends/detection.js");
const registry_js_1 = require("../utils/swarm/backends/registry.js");
const constants_js_1 = require("../utils/swarm/constants.js");
const leaderPermissionBridge_js_1 = require("../utils/swarm/leaderPermissionBridge.js");
const permissionSync_js_1 = require("../utils/swarm/permissionSync.js");
const teamHelpers_js_1 = require("../utils/swarm/teamHelpers.js");
const tasks_js_1 = require("../utils/tasks.js");
const teammate_js_1 = require("../utils/teammate.js");
const teammateContext_js_1 = require("../utils/teammateContext.js");
const teammateMailbox_js_1 = require("../utils/teammateMailbox.js");
const useSwarmPermissionPoller_js_1 = require("./useSwarmPermissionPoller.js");
/**
 * Get the agent name to poll for messages.
 * - In-process teammates return undefined (they use waitForNextPromptOrShutdown instead)
 * - Process-based teammates use their CLAUDE_CODE_AGENT_NAME
 * - Team leads use their name from teamContext.teammates
 * - Standalone sessions return undefined
 */
function getAgentNameToPoll(appState) {
    // In-process teammates should NOT use useInboxPoller - they have their own
    // polling mechanism via waitForNextPromptOrShutdown() in inProcessRunner.ts.
    // Using useInboxPoller would cause message routing issues since in-process
    // teammates share the same React context and AppState with the leader.
    //
    // Note: This can be called when the leader's REPL re-renders while an
    // in-process teammate's AsyncLocalStorage context is active (due to shared
    // setAppState). We return undefined to gracefully skip polling rather than
    // throwing, since this is a normal occurrence during concurrent execution.
    if ((0, teammateContext_js_1.isInProcessTeammate)()) {
        return undefined;
    }
    if ((0, teammate_js_1.isTeammate)()) {
        return (0, teammate_js_1.getAgentName)();
    }
    // Team lead polls using their agent name (not ID)
    if ((0, teammate_js_1.isTeamLead)(appState.teamContext)) {
        const leadAgentId = appState.teamContext.leadAgentId;
        // Look up the lead's name from teammates map
        const leadName = appState.teamContext.teammates[leadAgentId]?.name;
        return leadName || 'team-lead';
    }
    return undefined;
}
const INBOX_POLL_INTERVAL_MS = 1000;
/**
 * Polls the teammate inbox for new messages and submits them as turns.
 *
 * This hook:
 * 1. Polls every 1s for unread messages (teammates or team leads)
 * 2. When idle: submits messages immediately as a new turn
 * 3. When busy: queues messages in AppState.inbox for UI display, delivers when turn ends
 */
function useInboxPoller({ enabled, isLoading, focusedInputDialog, onSubmitMessage, }) {
    // Assign to original name for clarity within the function
    const onSubmitTeammateMessage = onSubmitMessage;
    const store = (0, AppState_js_1.useAppStateStore)();
    const setAppState = (0, AppState_js_1.useSetAppState)();
    const inboxMessageCount = (0, AppState_js_1.useAppState)(s => s.inbox.messages.length);
    const terminal = (0, useTerminalNotification_js_1.useTerminalNotification)();
    const poll = (0, react_1.useCallback)(async () => {
        if (!enabled)
            return;
        // Use ref to avoid dependency on appState object (prevents infinite loop)
        const currentAppState = store.getState();
        const agentName = getAgentNameToPoll(currentAppState);
        if (!agentName)
            return;
        const unread = await (0, teammateMailbox_js_1.readUnreadMessages)(agentName, currentAppState.teamContext?.teamName);
        if (unread.length === 0)
            return;
        (0, debug_js_1.logForDebugging)(`[InboxPoller] Found ${unread.length} unread message(s)`);
        // Check for plan approval responses and transition out of plan mode if approved
        // Security: Only accept approval responses from the team lead
        if ((0, teammate_js_1.isTeammate)() && (0, teammate_js_1.isPlanModeRequired)()) {
            for (const msg of unread) {
                const approvalResponse = (0, teammateMailbox_js_1.isPlanApprovalResponse)(msg.text);
                // Verify the message is from the team lead to prevent teammates from forging approvals
                if (approvalResponse && msg.from === 'team-lead') {
                    (0, debug_js_1.logForDebugging)(`[InboxPoller] Received plan approval response from team-lead: approved=${approvalResponse.approved}`);
                    if (approvalResponse.approved) {
                        // Use leader's permission mode if provided, otherwise default
                        const targetMode = approvalResponse.permissionMode ?? 'default';
                        // Transition out of plan mode
                        setAppState(prev => ({
                            ...prev,
                            toolPermissionContext: (0, PermissionUpdate_js_1.applyPermissionUpdate)(prev.toolPermissionContext, {
                                type: 'setMode',
                                mode: (0, PermissionMode_js_1.toExternalPermissionMode)(targetMode),
                                destination: 'session',
                            }),
                        }));
                        (0, debug_js_1.logForDebugging)(`[InboxPoller] Plan approved by team lead, exited plan mode to ${targetMode}`);
                    }
                    else {
                        (0, debug_js_1.logForDebugging)(`[InboxPoller] Plan rejected by team lead: ${approvalResponse.feedback || 'No feedback provided'}`);
                    }
                }
                else if (approvalResponse) {
                    (0, debug_js_1.logForDebugging)(`[InboxPoller] Ignoring plan approval response from non-team-lead: ${msg.from}`);
                }
            }
        }
        // Helper to mark messages as read in the inbox file.
        // Called after messages are successfully delivered or reliably queued.
        const markRead = () => {
            void (0, teammateMailbox_js_1.markMessagesAsRead)(agentName, currentAppState.teamContext?.teamName);
        };
        // Separate permission messages from regular teammate messages
        const permissionRequests = [];
        const permissionResponses = [];
        const sandboxPermissionRequests = [];
        const sandboxPermissionResponses = [];
        const shutdownRequests = [];
        const shutdownApprovals = [];
        const teamPermissionUpdates = [];
        const modeSetRequests = [];
        const planApprovalRequests = [];
        const regularMessages = [];
        for (const m of unread) {
            const permReq = (0, teammateMailbox_js_1.isPermissionRequest)(m.text);
            const permResp = (0, teammateMailbox_js_1.isPermissionResponse)(m.text);
            const sandboxReq = (0, teammateMailbox_js_1.isSandboxPermissionRequest)(m.text);
            const sandboxResp = (0, teammateMailbox_js_1.isSandboxPermissionResponse)(m.text);
            const shutdownReq = (0, teammateMailbox_js_1.isShutdownRequest)(m.text);
            const shutdownApproval = (0, teammateMailbox_js_1.isShutdownApproved)(m.text);
            const teamPermUpdate = (0, teammateMailbox_js_1.isTeamPermissionUpdate)(m.text);
            const modeSetReq = (0, teammateMailbox_js_1.isModeSetRequest)(m.text);
            const planApprovalReq = (0, teammateMailbox_js_1.isPlanApprovalRequest)(m.text);
            if (permReq) {
                permissionRequests.push(m);
            }
            else if (permResp) {
                permissionResponses.push(m);
            }
            else if (sandboxReq) {
                sandboxPermissionRequests.push(m);
            }
            else if (sandboxResp) {
                sandboxPermissionResponses.push(m);
            }
            else if (shutdownReq) {
                shutdownRequests.push(m);
            }
            else if (shutdownApproval) {
                shutdownApprovals.push(m);
            }
            else if (teamPermUpdate) {
                teamPermissionUpdates.push(m);
            }
            else if (modeSetReq) {
                modeSetRequests.push(m);
            }
            else if (planApprovalReq) {
                planApprovalRequests.push(m);
            }
            else {
                regularMessages.push(m);
            }
        }
        // Handle permission requests (leader side) - route to ToolUseConfirmQueue
        if (permissionRequests.length > 0 &&
            (0, teammate_js_1.isTeamLead)(currentAppState.teamContext)) {
            (0, debug_js_1.logForDebugging)(`[InboxPoller] Found ${permissionRequests.length} permission request(s)`);
            const setToolUseConfirmQueue = (0, leaderPermissionBridge_js_1.getLeaderToolUseConfirmQueue)();
            const teamName = currentAppState.teamContext?.teamName;
            for (const m of permissionRequests) {
                const parsed = (0, teammateMailbox_js_1.isPermissionRequest)(m.text);
                if (!parsed)
                    continue;
                if (setToolUseConfirmQueue) {
                    // Route through the standard ToolUseConfirmQueue so tmux workers
                    // get the same tool-specific UI (BashPermissionRequest, FileEditToolDiff, etc.)
                    // as in-process teammates.
                    const tool = (0, Tool_js_1.findToolByName)((0, tools_js_1.getAllBaseTools)(), parsed.tool_name);
                    if (!tool) {
                        (0, debug_js_1.logForDebugging)(`[InboxPoller] Unknown tool ${parsed.tool_name}, skipping permission request`);
                        continue;
                    }
                    const entry = {
                        assistantMessage: (0, messages_js_1.createAssistantMessage)({ content: '' }),
                        tool,
                        description: parsed.description,
                        input: parsed.input,
                        toolUseContext: {},
                        toolUseID: parsed.tool_use_id,
                        permissionResult: {
                            behavior: 'ask',
                            message: parsed.description,
                        },
                        permissionPromptStartTimeMs: Date.now(),
                        workerBadge: {
                            name: parsed.agent_id,
                            color: 'cyan',
                        },
                        onUserInteraction() {
                            // No-op for tmux workers (no classifier auto-approval)
                        },
                        onAbort() {
                            void (0, permissionSync_js_1.sendPermissionResponseViaMailbox)(parsed.agent_id, { decision: 'rejected', resolvedBy: 'leader' }, parsed.request_id, teamName);
                        },
                        onAllow(updatedInput, permissionUpdates) {
                            void (0, permissionSync_js_1.sendPermissionResponseViaMailbox)(parsed.agent_id, {
                                decision: 'approved',
                                resolvedBy: 'leader',
                                updatedInput,
                                permissionUpdates,
                            }, parsed.request_id, teamName);
                        },
                        onReject(feedback) {
                            void (0, permissionSync_js_1.sendPermissionResponseViaMailbox)(parsed.agent_id, {
                                decision: 'rejected',
                                resolvedBy: 'leader',
                                feedback,
                            }, parsed.request_id, teamName);
                        },
                        async recheckPermission() {
                            // No-op for tmux workers — permission state is on the worker side
                        },
                    };
                    // Deduplicate: if markMessagesAsRead failed on a prior poll,
                    // the same message will be re-read — skip if already queued.
                    setToolUseConfirmQueue(queue => {
                        if (queue.some(q => q.toolUseID === parsed.tool_use_id)) {
                            return queue;
                        }
                        return [...queue, entry];
                    });
                }
                else {
                    (0, debug_js_1.logForDebugging)(`[InboxPoller] ToolUseConfirmQueue unavailable, dropping permission request from ${parsed.agent_id}`);
                }
            }
            // Send desktop notification for the first request
            const firstParsed = (0, teammateMailbox_js_1.isPermissionRequest)(permissionRequests[0]?.text ?? '');
            if (firstParsed && !isLoading && !focusedInputDialog) {
                void (0, notifier_js_1.sendNotification)({
                    message: `${firstParsed.agent_id} needs permission for ${firstParsed.tool_name}`,
                    notificationType: 'worker_permission_prompt',
                }, terminal);
            }
        }
        // Handle permission responses (worker side) - invoke registered callbacks
        if (permissionResponses.length > 0 && (0, teammate_js_1.isTeammate)()) {
            (0, debug_js_1.logForDebugging)(`[InboxPoller] Found ${permissionResponses.length} permission response(s)`);
            for (const m of permissionResponses) {
                const parsed = (0, teammateMailbox_js_1.isPermissionResponse)(m.text);
                if (!parsed)
                    continue;
                if ((0, useSwarmPermissionPoller_js_1.hasPermissionCallback)(parsed.request_id)) {
                    (0, debug_js_1.logForDebugging)(`[InboxPoller] Processing permission response for ${parsed.request_id}: ${parsed.subtype}`);
                    if (parsed.subtype === 'success') {
                        (0, useSwarmPermissionPoller_js_1.processMailboxPermissionResponse)({
                            requestId: parsed.request_id,
                            decision: 'approved',
                            updatedInput: parsed.response?.updated_input,
                            permissionUpdates: parsed.response?.permission_updates,
                        });
                    }
                    else {
                        (0, useSwarmPermissionPoller_js_1.processMailboxPermissionResponse)({
                            requestId: parsed.request_id,
                            decision: 'rejected',
                            feedback: parsed.error,
                        });
                    }
                }
            }
        }
        // Handle sandbox permission requests (leader side) - add to workerSandboxPermissions queue
        if (sandboxPermissionRequests.length > 0 &&
            (0, teammate_js_1.isTeamLead)(currentAppState.teamContext)) {
            (0, debug_js_1.logForDebugging)(`[InboxPoller] Found ${sandboxPermissionRequests.length} sandbox permission request(s)`);
            const newSandboxRequests = [];
            for (const m of sandboxPermissionRequests) {
                const parsed = (0, teammateMailbox_js_1.isSandboxPermissionRequest)(m.text);
                if (!parsed)
                    continue;
                // Validate required nested fields to prevent crashes from malformed messages
                if (!parsed.hostPattern?.host) {
                    (0, debug_js_1.logForDebugging)(`[InboxPoller] Invalid sandbox permission request: missing hostPattern.host`);
                    continue;
                }
                newSandboxRequests.push({
                    requestId: parsed.requestId,
                    workerId: parsed.workerId,
                    workerName: parsed.workerName,
                    workerColor: parsed.workerColor,
                    host: parsed.hostPattern.host,
                    createdAt: parsed.createdAt,
                });
            }
            if (newSandboxRequests.length > 0) {
                setAppState(prev => ({
                    ...prev,
                    workerSandboxPermissions: {
                        ...prev.workerSandboxPermissions,
                        queue: [
                            ...prev.workerSandboxPermissions.queue,
                            ...newSandboxRequests,
                        ],
                    },
                }));
                // Send desktop notification for the first new request
                const firstRequest = newSandboxRequests[0];
                if (firstRequest && !isLoading && !focusedInputDialog) {
                    void (0, notifier_js_1.sendNotification)({
                        message: `${firstRequest.workerName} needs network access to ${firstRequest.host}`,
                        notificationType: 'worker_permission_prompt',
                    }, terminal);
                }
            }
        }
        // Handle sandbox permission responses (worker side) - invoke registered callbacks
        if (sandboxPermissionResponses.length > 0 && (0, teammate_js_1.isTeammate)()) {
            (0, debug_js_1.logForDebugging)(`[InboxPoller] Found ${sandboxPermissionResponses.length} sandbox permission response(s)`);
            for (const m of sandboxPermissionResponses) {
                const parsed = (0, teammateMailbox_js_1.isSandboxPermissionResponse)(m.text);
                if (!parsed)
                    continue;
                // Check if we have a registered callback for this request
                if ((0, useSwarmPermissionPoller_js_1.hasSandboxPermissionCallback)(parsed.requestId)) {
                    (0, debug_js_1.logForDebugging)(`[InboxPoller] Processing sandbox permission response for ${parsed.requestId}: allow=${parsed.allow}`);
                    // Process the response using the exported function
                    (0, useSwarmPermissionPoller_js_1.processSandboxPermissionResponse)({
                        requestId: parsed.requestId,
                        host: parsed.host,
                        allow: parsed.allow,
                    });
                    // Clear the pending sandbox request indicator
                    setAppState(prev => ({
                        ...prev,
                        pendingSandboxRequest: null,
                    }));
                }
            }
        }
        // Handle team permission updates (teammate side) - apply permission to context
        if (teamPermissionUpdates.length > 0 && (0, teammate_js_1.isTeammate)()) {
            (0, debug_js_1.logForDebugging)(`[InboxPoller] Found ${teamPermissionUpdates.length} team permission update(s)`);
            for (const m of teamPermissionUpdates) {
                const parsed = (0, teammateMailbox_js_1.isTeamPermissionUpdate)(m.text);
                if (!parsed) {
                    (0, debug_js_1.logForDebugging)(`[InboxPoller] Failed to parse team permission update: ${m.text.substring(0, 100)}`);
                    continue;
                }
                // Validate required nested fields to prevent crashes from malformed messages
                if (!parsed.permissionUpdate?.rules ||
                    !parsed.permissionUpdate?.behavior) {
                    (0, debug_js_1.logForDebugging)(`[InboxPoller] Invalid team permission update: missing permissionUpdate.rules or permissionUpdate.behavior`);
                    continue;
                }
                // Apply the permission update to the teammate's context
                (0, debug_js_1.logForDebugging)(`[InboxPoller] Applying team permission update: ${parsed.toolName} allowed in ${parsed.directoryPath}`);
                (0, debug_js_1.logForDebugging)(`[InboxPoller] Permission update rules: ${(0, slowOperations_js_1.jsonStringify)(parsed.permissionUpdate.rules)}`);
                setAppState(prev => {
                    const updated = (0, PermissionUpdate_js_1.applyPermissionUpdate)(prev.toolPermissionContext, {
                        type: 'addRules',
                        rules: parsed.permissionUpdate.rules,
                        behavior: parsed.permissionUpdate.behavior,
                        destination: 'session',
                    });
                    (0, debug_js_1.logForDebugging)(`[InboxPoller] Updated session allow rules: ${(0, slowOperations_js_1.jsonStringify)(updated.alwaysAllowRules.session)}`);
                    return {
                        ...prev,
                        toolPermissionContext: updated,
                    };
                });
            }
        }
        // Handle mode set requests (teammate side) - team lead changing teammate's mode
        if (modeSetRequests.length > 0 && (0, teammate_js_1.isTeammate)()) {
            (0, debug_js_1.logForDebugging)(`[InboxPoller] Found ${modeSetRequests.length} mode set request(s)`);
            for (const m of modeSetRequests) {
                // Only accept mode changes from team-lead
                if (m.from !== 'team-lead') {
                    (0, debug_js_1.logForDebugging)(`[InboxPoller] Ignoring mode set request from non-team-lead: ${m.from}`);
                    continue;
                }
                const parsed = (0, teammateMailbox_js_1.isModeSetRequest)(m.text);
                if (!parsed) {
                    (0, debug_js_1.logForDebugging)(`[InboxPoller] Failed to parse mode set request: ${m.text.substring(0, 100)}`);
                    continue;
                }
                const targetMode = (0, PermissionMode_js_1.permissionModeFromString)(parsed.mode);
                (0, debug_js_1.logForDebugging)(`[InboxPoller] Applying mode change from team-lead: ${targetMode}`);
                // Update local permission context
                setAppState(prev => ({
                    ...prev,
                    toolPermissionContext: (0, PermissionUpdate_js_1.applyPermissionUpdate)(prev.toolPermissionContext, {
                        type: 'setMode',
                        mode: (0, PermissionMode_js_1.toExternalPermissionMode)(targetMode),
                        destination: 'session',
                    }),
                }));
                // Update config.json so team lead can see the new mode
                const teamName = currentAppState.teamContext?.teamName;
                const agentName = (0, teammate_js_1.getAgentName)();
                if (teamName && agentName) {
                    (0, teamHelpers_js_1.setMemberMode)(teamName, agentName, targetMode);
                }
            }
        }
        // Handle plan approval requests (leader side) - auto-approve and write response to teammate inbox
        if (planApprovalRequests.length > 0 &&
            (0, teammate_js_1.isTeamLead)(currentAppState.teamContext)) {
            (0, debug_js_1.logForDebugging)(`[InboxPoller] Found ${planApprovalRequests.length} plan approval request(s), auto-approving`);
            const teamName = currentAppState.teamContext?.teamName;
            const leaderExternalMode = (0, PermissionMode_js_1.toExternalPermissionMode)(currentAppState.toolPermissionContext.mode);
            const modeToInherit = leaderExternalMode === 'plan' ? 'default' : leaderExternalMode;
            for (const m of planApprovalRequests) {
                const parsed = (0, teammateMailbox_js_1.isPlanApprovalRequest)(m.text);
                if (!parsed)
                    continue;
                // Write approval response to teammate's inbox
                const approvalResponse = {
                    type: 'plan_approval_response',
                    requestId: parsed.requestId,
                    approved: true,
                    timestamp: new Date().toISOString(),
                    permissionMode: modeToInherit,
                };
                void (0, teammateMailbox_js_1.writeToMailbox)(m.from, {
                    from: constants_js_1.TEAM_LEAD_NAME,
                    text: (0, slowOperations_js_1.jsonStringify)(approvalResponse),
                    timestamp: new Date().toISOString(),
                }, teamName);
                // Update in-process teammate task state if applicable
                const taskId = (0, inProcessTeammateHelpers_js_1.findInProcessTeammateTaskId)(m.from, currentAppState);
                if (taskId) {
                    (0, inProcessTeammateHelpers_js_1.handlePlanApprovalResponse)(taskId, {
                        type: 'plan_approval_response',
                        requestId: parsed.requestId,
                        approved: true,
                        timestamp: new Date().toISOString(),
                        permissionMode: modeToInherit,
                    }, setAppState);
                }
                (0, debug_js_1.logForDebugging)(`[InboxPoller] Auto-approved plan from ${m.from} (request ${parsed.requestId})`);
                // Still pass through as a regular message so the model has context
                // about what the teammate is doing, but the approval is already sent
                regularMessages.push(m);
            }
        }
        // Handle shutdown requests (teammate side) - preserve JSON for UI rendering
        if (shutdownRequests.length > 0 && (0, teammate_js_1.isTeammate)()) {
            (0, debug_js_1.logForDebugging)(`[InboxPoller] Found ${shutdownRequests.length} shutdown request(s)`);
            // Pass through shutdown requests - the UI component will render them nicely
            // and the model will receive instructions via the tool prompt documentation
            for (const m of shutdownRequests) {
                regularMessages.push(m);
            }
        }
        // Handle shutdown approvals (leader side) - kill the teammate's pane
        if (shutdownApprovals.length > 0 &&
            (0, teammate_js_1.isTeamLead)(currentAppState.teamContext)) {
            (0, debug_js_1.logForDebugging)(`[InboxPoller] Found ${shutdownApprovals.length} shutdown approval(s)`);
            for (const m of shutdownApprovals) {
                const parsed = (0, teammateMailbox_js_1.isShutdownApproved)(m.text);
                if (!parsed)
                    continue;
                // Kill the pane if we have the info (pane-based teammates)
                if (parsed.paneId && parsed.backendType) {
                    void (async () => {
                        try {
                            // Ensure backend classes are imported (no subprocess probes)
                            await (0, registry_js_1.ensureBackendsRegistered)();
                            const insideTmux = await (0, detection_js_1.isInsideTmux)();
                            const backend = (0, registry_js_1.getBackendByType)(parsed.backendType);
                            const success = await backend?.killPane(parsed.paneId, !insideTmux);
                            (0, debug_js_1.logForDebugging)(`[InboxPoller] Killed pane ${parsed.paneId} for ${parsed.from}: ${success}`);
                        }
                        catch (error) {
                            (0, debug_js_1.logForDebugging)(`[InboxPoller] Failed to kill pane for ${parsed.from}: ${error}`);
                        }
                    })();
                }
                // Remove the teammate from teamContext.teammates so the count is accurate
                const teammateToRemove = parsed.from;
                if (teammateToRemove && currentAppState.teamContext?.teammates) {
                    // Find the teammate ID by name
                    const teammateId = Object.entries(currentAppState.teamContext.teammates).find(([, t]) => t.name === teammateToRemove)?.[0];
                    if (teammateId) {
                        // Remove from team file (leader owns team file mutations)
                        const teamName = currentAppState.teamContext?.teamName;
                        if (teamName) {
                            (0, teamHelpers_js_1.removeTeammateFromTeamFile)(teamName, {
                                agentId: teammateId,
                                name: teammateToRemove,
                            });
                        }
                        // Unassign tasks and build notification message
                        const { notificationMessage } = teamName
                            ? await (0, tasks_js_1.unassignTeammateTasks)(teamName, teammateId, teammateToRemove, 'shutdown')
                            : { notificationMessage: `${teammateToRemove} has shut down.` };
                        setAppState(prev => {
                            if (!prev.teamContext?.teammates)
                                return prev;
                            if (!(teammateId in prev.teamContext.teammates))
                                return prev;
                            const { [teammateId]: _, ...remainingTeammates } = prev.teamContext.teammates;
                            // Mark the teammate's task as completed so hasRunningTeammates
                            // becomes false and the spinner stops. Without this, out-of-process
                            // (tmux) teammate tasks stay status:'running' forever because
                            // only in-process teammates have a runner that sets 'completed'.
                            const updatedTasks = { ...prev.tasks };
                            for (const [tid, task] of Object.entries(updatedTasks)) {
                                if ((0, types_js_1.isInProcessTeammateTask)(task) &&
                                    task.identity.agentId === teammateId) {
                                    updatedTasks[tid] = {
                                        ...task,
                                        status: 'completed',
                                        endTime: Date.now(),
                                    };
                                }
                            }
                            return {
                                ...prev,
                                tasks: updatedTasks,
                                teamContext: {
                                    ...prev.teamContext,
                                    teammates: remainingTeammates,
                                },
                                inbox: {
                                    messages: [
                                        ...prev.inbox.messages,
                                        {
                                            id: (0, crypto_1.randomUUID)(),
                                            from: 'system',
                                            text: (0, slowOperations_js_1.jsonStringify)({
                                                type: 'teammate_terminated',
                                                message: notificationMessage,
                                            }),
                                            timestamp: new Date().toISOString(),
                                            status: 'pending',
                                        },
                                    ],
                                },
                            };
                        });
                        (0, debug_js_1.logForDebugging)(`[InboxPoller] Removed ${teammateToRemove} (${teammateId}) from teamContext`);
                    }
                }
                // Pass through for UI rendering - the component will render it nicely
                regularMessages.push(m);
            }
        }
        // Process regular teammate messages (existing logic)
        if (regularMessages.length === 0) {
            // No regular messages, but we may have processed non-regular messages
            // (permissions, shutdown requests, etc.) above — mark those as read.
            markRead();
            return;
        }
        // Format messages with XML wrapper for Claude (include color if available)
        // Transform plan approval requests to include instructions for Claude
        const formatted = regularMessages
            .map(m => {
            const colorAttr = m.color ? ` color="${m.color}"` : '';
            const summaryAttr = m.summary ? ` summary="${m.summary}"` : '';
            const messageContent = m.text;
            return `<${xml_js_1.TEAMMATE_MESSAGE_TAG} teammate_id="${m.from}"${colorAttr}${summaryAttr}>\n${messageContent}\n</${xml_js_1.TEAMMATE_MESSAGE_TAG}>`;
        })
            .join('\n\n');
        // Helper to queue messages in AppState for later delivery
        const queueMessages = () => {
            setAppState(prev => ({
                ...prev,
                inbox: {
                    messages: [
                        ...prev.inbox.messages,
                        ...regularMessages.map(m => ({
                            id: (0, crypto_1.randomUUID)(),
                            from: m.from,
                            text: m.text,
                            timestamp: m.timestamp,
                            status: 'pending',
                            color: m.color,
                            summary: m.summary,
                        })),
                    ],
                },
            }));
        };
        if (!isLoading && !focusedInputDialog) {
            // IDLE: Submit as new turn immediately
            (0, debug_js_1.logForDebugging)(`[InboxPoller] Session idle, submitting immediately`);
            const submitted = onSubmitTeammateMessage(formatted);
            if (!submitted) {
                // Submission rejected (query already running), queue for later
                (0, debug_js_1.logForDebugging)(`[InboxPoller] Submission rejected, queuing for later delivery`);
                queueMessages();
            }
        }
        else {
            // BUSY: Add to inbox queue for UI display + later delivery
            (0, debug_js_1.logForDebugging)(`[InboxPoller] Session busy, queuing for later delivery`);
            queueMessages();
        }
        // Mark messages as read only after they have been successfully delivered
        // or reliably queued in AppState. This prevents permanent message loss
        // when the session is busy — if we crash before this point, the messages
        // will be re-read on the next poll cycle instead of being silently dropped.
        markRead();
    }, [
        enabled,
        isLoading,
        focusedInputDialog,
        onSubmitTeammateMessage,
        setAppState,
        terminal,
        store,
    ]);
    // When session becomes idle, deliver any pending messages and clean up processed ones
    (0, react_1.useEffect)(() => {
        if (!enabled)
            return;
        // Skip if busy or in a dialog
        if (isLoading || focusedInputDialog) {
            return;
        }
        // Use ref to avoid dependency on appState object (prevents infinite loop)
        const currentAppState = store.getState();
        const agentName = getAgentNameToPoll(currentAppState);
        if (!agentName)
            return;
        const pendingMessages = currentAppState.inbox.messages.filter(m => m.status === 'pending');
        const processedMessages = currentAppState.inbox.messages.filter(m => m.status === 'processed');
        // Clean up processed messages (they were already delivered mid-turn as attachments)
        if (processedMessages.length > 0) {
            (0, debug_js_1.logForDebugging)(`[InboxPoller] Cleaning up ${processedMessages.length} processed message(s) that were delivered mid-turn`);
            const processedIds = new Set(processedMessages.map(m => m.id));
            setAppState(prev => ({
                ...prev,
                inbox: {
                    messages: prev.inbox.messages.filter(m => !processedIds.has(m.id)),
                },
            }));
        }
        // No pending messages to deliver
        if (pendingMessages.length === 0)
            return;
        (0, debug_js_1.logForDebugging)(`[InboxPoller] Session idle, delivering ${pendingMessages.length} pending message(s)`);
        // Format messages with XML wrapper for Claude (include color if available)
        const formatted = pendingMessages
            .map(m => {
            const colorAttr = m.color ? ` color="${m.color}"` : '';
            const summaryAttr = m.summary ? ` summary="${m.summary}"` : '';
            return `<${xml_js_1.TEAMMATE_MESSAGE_TAG} teammate_id="${m.from}"${colorAttr}${summaryAttr}>\n${m.text}\n</${xml_js_1.TEAMMATE_MESSAGE_TAG}>`;
        })
            .join('\n\n');
        // Try to submit - only clear messages if successful
        const submitted = onSubmitTeammateMessage(formatted);
        if (submitted) {
            // Clear the specific messages we just submitted by their IDs
            const submittedIds = new Set(pendingMessages.map(m => m.id));
            setAppState(prev => ({
                ...prev,
                inbox: {
                    messages: prev.inbox.messages.filter(m => !submittedIds.has(m.id)),
                },
            }));
        }
        else {
            (0, debug_js_1.logForDebugging)(`[InboxPoller] Submission rejected, keeping messages queued`);
        }
    }, [
        enabled,
        isLoading,
        focusedInputDialog,
        onSubmitTeammateMessage,
        setAppState,
        inboxMessageCount,
        store,
    ]);
    // Poll if running as a teammate or as a team lead
    const shouldPoll = enabled && !!getAgentNameToPoll(store.getState());
    (0, usehooks_ts_1.useInterval)(() => void poll(), shouldPoll ? INBOX_POLL_INTERVAL_MS : null);
    // Initial poll on mount (only once)
    const hasDoneInitialPollRef = (0, react_1.useRef)(false);
    (0, react_1.useEffect)(() => {
        if (!enabled)
            return;
        if (hasDoneInitialPollRef.current)
            return;
        // Use store.getState() to avoid dependency on appState object
        if (getAgentNameToPoll(store.getState())) {
            hasDoneInitialPollRef.current = true;
            void poll();
        }
        // Note: poll uses store.getState() (not appState) so it won't re-run on appState changes
        // The ref guard is a safety measure to ensure initial poll only happens once
    }, [enabled, poll, store]);
}
