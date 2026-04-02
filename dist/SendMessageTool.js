"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SendMessageTool = void 0;
const bun_bundle_1 = require("bun:bundle");
const v4_1 = require("zod/v4");
const state_js_1 = require("../../bootstrap/state.js");
const replBridgeHandle_js_1 = require("../../bridge/replBridgeHandle.js");
const Tool_js_1 = require("../../Tool.js");
const InProcessTeammateTask_js_1 = require("../../tasks/InProcessTeammateTask/InProcessTeammateTask.js");
const LocalAgentTask_js_1 = require("../../tasks/LocalAgentTask/LocalAgentTask.js");
const LocalMainSessionTask_js_1 = require("../../tasks/LocalMainSessionTask.js");
const ids_js_1 = require("../../types/ids.js");
const agentId_js_1 = require("../../utils/agentId.js");
const agentSwarmsEnabled_js_1 = require("../../utils/agentSwarmsEnabled.js");
const debug_js_1 = require("../../utils/debug.js");
const errors_js_1 = require("../../utils/errors.js");
const format_js_1 = require("../../utils/format.js");
const gracefulShutdown_js_1 = require("../../utils/gracefulShutdown.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const peerAddress_js_1 = require("../../utils/peerAddress.js");
const semanticBoolean_js_1 = require("../../utils/semanticBoolean.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const constants_js_1 = require("../../utils/swarm/constants.js");
const teamHelpers_js_1 = require("../../utils/swarm/teamHelpers.js");
const teammate_js_1 = require("../../utils/teammate.js");
const teammateMailbox_js_1 = require("../../utils/teammateMailbox.js");
const resumeAgent_js_1 = require("../AgentTool/resumeAgent.js");
const constants_js_2 = require("./constants.js");
const prompt_js_1 = require("./prompt.js");
const UI_js_1 = require("./UI.js");
const StructuredMessage = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.discriminatedUnion('type', [
    v4_1.z.object({
        type: v4_1.z.literal('shutdown_request'),
        reason: v4_1.z.string().optional(),
    }),
    v4_1.z.object({
        type: v4_1.z.literal('shutdown_response'),
        request_id: v4_1.z.string(),
        approve: (0, semanticBoolean_js_1.semanticBoolean)(),
        reason: v4_1.z.string().optional(),
    }),
    v4_1.z.object({
        type: v4_1.z.literal('plan_approval_response'),
        request_id: v4_1.z.string(),
        approve: (0, semanticBoolean_js_1.semanticBoolean)(),
        feedback: v4_1.z.string().optional(),
    }),
]));
const inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    to: v4_1.z
        .string()
        .describe((0, bun_bundle_1.feature)('UDS_INBOX')
        ? 'Recipient: teammate name, "*" for broadcast, "uds:<socket-path>" for a local peer, or "bridge:<session-id>" for a Remote Control peer (use ListPeers to discover)'
        : 'Recipient: teammate name, or "*" for broadcast to all teammates'),
    summary: v4_1.z
        .string()
        .optional()
        .describe('A 5-10 word summary shown as a preview in the UI (required when message is a string)'),
    message: v4_1.z.union([
        v4_1.z.string().describe('Plain text message content'),
        StructuredMessage(),
    ]),
}));
function findTeammateColor(appState, name) {
    const teammates = appState.teamContext?.teammates;
    if (!teammates)
        return undefined;
    for (const teammate of Object.values(teammates)) {
        if ('name' in teammate && teammate.name === name) {
            return teammate.color;
        }
    }
    return undefined;
}
async function handleMessage(recipientName, content, summary, context) {
    const appState = context.getAppState();
    const teamName = (0, teammate_js_1.getTeamName)(appState.teamContext);
    const senderName = (0, teammate_js_1.getAgentName)() || ((0, teammate_js_1.isTeammate)() ? 'teammate' : constants_js_1.TEAM_LEAD_NAME);
    const senderColor = (0, teammate_js_1.getTeammateColor)();
    await (0, teammateMailbox_js_1.writeToMailbox)(recipientName, {
        from: senderName,
        text: content,
        summary,
        timestamp: new Date().toISOString(),
        color: senderColor,
    }, teamName);
    const recipientColor = findTeammateColor(appState, recipientName);
    return {
        data: {
            success: true,
            message: `Message sent to ${recipientName}'s inbox`,
            routing: {
                sender: senderName,
                senderColor,
                target: `@${recipientName}`,
                targetColor: recipientColor,
                summary,
                content,
            },
        },
    };
}
async function handleBroadcast(content, summary, context) {
    const appState = context.getAppState();
    const teamName = (0, teammate_js_1.getTeamName)(appState.teamContext);
    if (!teamName) {
        throw new Error('Not in a team context. Create a team with Teammate spawnTeam first, or set CLAUDE_CODE_TEAM_NAME.');
    }
    const teamFile = await (0, teamHelpers_js_1.readTeamFileAsync)(teamName);
    if (!teamFile) {
        throw new Error(`Team "${teamName}" does not exist`);
    }
    const senderName = (0, teammate_js_1.getAgentName)() || ((0, teammate_js_1.isTeammate)() ? 'teammate' : constants_js_1.TEAM_LEAD_NAME);
    if (!senderName) {
        throw new Error('Cannot broadcast: sender name is required. Set CLAUDE_CODE_AGENT_NAME.');
    }
    const senderColor = (0, teammate_js_1.getTeammateColor)();
    const recipients = [];
    for (const member of teamFile.members) {
        if (member.name.toLowerCase() === senderName.toLowerCase()) {
            continue;
        }
        recipients.push(member.name);
    }
    if (recipients.length === 0) {
        return {
            data: {
                success: true,
                message: 'No teammates to broadcast to (you are the only team member)',
                recipients: [],
            },
        };
    }
    for (const recipientName of recipients) {
        await (0, teammateMailbox_js_1.writeToMailbox)(recipientName, {
            from: senderName,
            text: content,
            summary,
            timestamp: new Date().toISOString(),
            color: senderColor,
        }, teamName);
    }
    return {
        data: {
            success: true,
            message: `Message broadcast to ${recipients.length} teammate(s): ${recipients.join(', ')}`,
            recipients,
            routing: {
                sender: senderName,
                senderColor,
                target: '@team',
                summary,
                content,
            },
        },
    };
}
async function handleShutdownRequest(targetName, reason, context) {
    const appState = context.getAppState();
    const teamName = (0, teammate_js_1.getTeamName)(appState.teamContext);
    const senderName = (0, teammate_js_1.getAgentName)() || constants_js_1.TEAM_LEAD_NAME;
    const requestId = (0, agentId_js_1.generateRequestId)('shutdown', targetName);
    const shutdownMessage = (0, teammateMailbox_js_1.createShutdownRequestMessage)({
        requestId,
        from: senderName,
        reason,
    });
    await (0, teammateMailbox_js_1.writeToMailbox)(targetName, {
        from: senderName,
        text: (0, slowOperations_js_1.jsonStringify)(shutdownMessage),
        timestamp: new Date().toISOString(),
        color: (0, teammate_js_1.getTeammateColor)(),
    }, teamName);
    return {
        data: {
            success: true,
            message: `Shutdown request sent to ${targetName}. Request ID: ${requestId}`,
            request_id: requestId,
            target: targetName,
        },
    };
}
async function handleShutdownApproval(requestId, context) {
    const teamName = (0, teammate_js_1.getTeamName)();
    const agentId = (0, teammate_js_1.getAgentId)();
    const agentName = (0, teammate_js_1.getAgentName)() || 'teammate';
    (0, debug_js_1.logForDebugging)(`[SendMessageTool] handleShutdownApproval: teamName=${teamName}, agentId=${agentId}, agentName=${agentName}`);
    let ownPaneId;
    let ownBackendType;
    if (teamName) {
        const teamFile = await (0, teamHelpers_js_1.readTeamFileAsync)(teamName);
        if (teamFile && agentId) {
            const selfMember = teamFile.members.find(m => m.agentId === agentId);
            if (selfMember) {
                ownPaneId = selfMember.tmuxPaneId;
                ownBackendType = selfMember.backendType;
            }
        }
    }
    const approvedMessage = (0, teammateMailbox_js_1.createShutdownApprovedMessage)({
        requestId,
        from: agentName,
        paneId: ownPaneId,
        backendType: ownBackendType,
    });
    await (0, teammateMailbox_js_1.writeToMailbox)(constants_js_1.TEAM_LEAD_NAME, {
        from: agentName,
        text: (0, slowOperations_js_1.jsonStringify)(approvedMessage),
        timestamp: new Date().toISOString(),
        color: (0, teammate_js_1.getTeammateColor)(),
    }, teamName);
    if (ownBackendType === 'in-process') {
        (0, debug_js_1.logForDebugging)(`[SendMessageTool] In-process teammate ${agentName} approving shutdown - signaling abort`);
        if (agentId) {
            const appState = context.getAppState();
            const task = (0, InProcessTeammateTask_js_1.findTeammateTaskByAgentId)(agentId, appState.tasks);
            if (task?.abortController) {
                task.abortController.abort();
                (0, debug_js_1.logForDebugging)(`[SendMessageTool] Aborted controller for in-process teammate ${agentName}`);
            }
            else {
                (0, debug_js_1.logForDebugging)(`[SendMessageTool] Warning: Could not find task/abortController for ${agentName}`);
            }
        }
    }
    else {
        if (agentId) {
            const appState = context.getAppState();
            const task = (0, InProcessTeammateTask_js_1.findTeammateTaskByAgentId)(agentId, appState.tasks);
            if (task?.abortController) {
                (0, debug_js_1.logForDebugging)(`[SendMessageTool] Fallback: Found in-process task for ${agentName} via AppState, aborting`);
                task.abortController.abort();
                return {
                    data: {
                        success: true,
                        message: `Shutdown approved (fallback path). Agent ${agentName} is now exiting.`,
                        request_id: requestId,
                    },
                };
            }
        }
        setImmediate(async () => {
            await (0, gracefulShutdown_js_1.gracefulShutdown)(0, 'other');
        });
    }
    return {
        data: {
            success: true,
            message: `Shutdown approved. Sent confirmation to team-lead. Agent ${agentName} is now exiting.`,
            request_id: requestId,
        },
    };
}
async function handleShutdownRejection(requestId, reason) {
    const teamName = (0, teammate_js_1.getTeamName)();
    const agentName = (0, teammate_js_1.getAgentName)() || 'teammate';
    const rejectedMessage = (0, teammateMailbox_js_1.createShutdownRejectedMessage)({
        requestId,
        from: agentName,
        reason,
    });
    await (0, teammateMailbox_js_1.writeToMailbox)(constants_js_1.TEAM_LEAD_NAME, {
        from: agentName,
        text: (0, slowOperations_js_1.jsonStringify)(rejectedMessage),
        timestamp: new Date().toISOString(),
        color: (0, teammate_js_1.getTeammateColor)(),
    }, teamName);
    return {
        data: {
            success: true,
            message: `Shutdown rejected. Reason: "${reason}". Continuing to work.`,
            request_id: requestId,
        },
    };
}
async function handlePlanApproval(recipientName, requestId, context) {
    const appState = context.getAppState();
    const teamName = appState.teamContext?.teamName;
    if (!(0, teammate_js_1.isTeamLead)(appState.teamContext)) {
        throw new Error('Only the team lead can approve plans. Teammates cannot approve their own or other plans.');
    }
    const leaderMode = appState.toolPermissionContext.mode;
    const modeToInherit = leaderMode === 'plan' ? 'default' : leaderMode;
    const approvalResponse = {
        type: 'plan_approval_response',
        requestId,
        approved: true,
        timestamp: new Date().toISOString(),
        permissionMode: modeToInherit,
    };
    await (0, teammateMailbox_js_1.writeToMailbox)(recipientName, {
        from: constants_js_1.TEAM_LEAD_NAME,
        text: (0, slowOperations_js_1.jsonStringify)(approvalResponse),
        timestamp: new Date().toISOString(),
    }, teamName);
    return {
        data: {
            success: true,
            message: `Plan approved for ${recipientName}. They will receive the approval and can proceed with implementation.`,
            request_id: requestId,
        },
    };
}
async function handlePlanRejection(recipientName, requestId, feedback, context) {
    const appState = context.getAppState();
    const teamName = appState.teamContext?.teamName;
    if (!(0, teammate_js_1.isTeamLead)(appState.teamContext)) {
        throw new Error('Only the team lead can reject plans. Teammates cannot reject their own or other plans.');
    }
    const rejectionResponse = {
        type: 'plan_approval_response',
        requestId,
        approved: false,
        feedback,
        timestamp: new Date().toISOString(),
    };
    await (0, teammateMailbox_js_1.writeToMailbox)(recipientName, {
        from: constants_js_1.TEAM_LEAD_NAME,
        text: (0, slowOperations_js_1.jsonStringify)(rejectionResponse),
        timestamp: new Date().toISOString(),
    }, teamName);
    return {
        data: {
            success: true,
            message: `Plan rejected for ${recipientName} with feedback: "${feedback}"`,
            request_id: requestId,
        },
    };
}
exports.SendMessageTool = (0, Tool_js_1.buildTool)({
    name: constants_js_2.SEND_MESSAGE_TOOL_NAME,
    searchHint: 'send messages to agent teammates (swarm protocol)',
    maxResultSizeChars: 100000,
    userFacingName() {
        return 'SendMessage';
    },
    get inputSchema() {
        return inputSchema();
    },
    shouldDefer: true,
    isEnabled() {
        return (0, agentSwarmsEnabled_js_1.isAgentSwarmsEnabled)();
    },
    isReadOnly(input) {
        return typeof input.message === 'string';
    },
    backfillObservableInput(input) {
        if ('type' in input)
            return;
        if (typeof input.to !== 'string')
            return;
        if (input.to === '*') {
            input.type = 'broadcast';
            if (typeof input.message === 'string')
                input.content = input.message;
        }
        else if (typeof input.message === 'string') {
            input.type = 'message';
            input.recipient = input.to;
            input.content = input.message;
        }
        else if (typeof input.message === 'object' && input.message !== null) {
            const msg = input.message;
            input.type = msg.type;
            input.recipient = input.to;
            if (msg.request_id !== undefined)
                input.request_id = msg.request_id;
            if (msg.approve !== undefined)
                input.approve = msg.approve;
            const content = msg.reason ?? msg.feedback;
            if (content !== undefined)
                input.content = content;
        }
    },
    toAutoClassifierInput(input) {
        if (typeof input.message === 'string') {
            return `to ${input.to}: ${input.message}`;
        }
        switch (input.message.type) {
            case 'shutdown_request':
                return `shutdown_request to ${input.to}`;
            case 'shutdown_response':
                return `shutdown_response ${input.message.approve ? 'approve' : 'reject'} ${input.message.request_id}`;
            case 'plan_approval_response':
                return `plan_approval ${input.message.approve ? 'approve' : 'reject'} to ${input.to}`;
        }
    },
    async checkPermissions(input, _context) {
        if ((0, bun_bundle_1.feature)('UDS_INBOX') && (0, peerAddress_js_1.parseAddress)(input.to).scheme === 'bridge') {
            return {
                behavior: 'ask',
                message: `Send a message to Remote Control session ${input.to}? It arrives as a user prompt on the receiving Claude (possibly another machine) via Anthropic's servers.`,
                // safetyCheck (not mode) — permissions.ts guards this before both
                // bypassPermissions (step 1g) and auto-mode's allowlist/classifier.
                // Cross-machine prompt injection must stay bypass-immune.
                decisionReason: {
                    type: 'safetyCheck',
                    reason: 'Cross-machine bridge message requires explicit user consent',
                    classifierApprovable: false,
                },
            };
        }
        return { behavior: 'allow', updatedInput: input };
    },
    async validateInput(input, _context) {
        if (input.to.trim().length === 0) {
            return {
                result: false,
                message: 'to must not be empty',
                errorCode: 9,
            };
        }
        const addr = (0, peerAddress_js_1.parseAddress)(input.to);
        if ((addr.scheme === 'bridge' || addr.scheme === 'uds') &&
            addr.target.trim().length === 0) {
            return {
                result: false,
                message: 'address target must not be empty',
                errorCode: 9,
            };
        }
        if (input.to.includes('@')) {
            return {
                result: false,
                message: 'to must be a bare teammate name or "*" — there is only one team per session',
                errorCode: 9,
            };
        }
        if ((0, bun_bundle_1.feature)('UDS_INBOX') && (0, peerAddress_js_1.parseAddress)(input.to).scheme === 'bridge') {
            // Structured-message rejection first — it's the permanent constraint.
            // Showing "not connected" first would make the user reconnect only to
            // hit this error on retry.
            if (typeof input.message !== 'string') {
                return {
                    result: false,
                    message: 'structured messages cannot be sent cross-session — only plain text',
                    errorCode: 9,
                };
            }
            // postInterClaudeMessage derives from= via getReplBridgeHandle() —
            // check handle directly for the init-timing window. Also check
            // isReplBridgeActive() to reject outbound-only (CCR mirror) mode
            // where the bridge is write-only and peer messaging is unsupported.
            if (!(0, replBridgeHandle_js_1.getReplBridgeHandle)() || !(0, state_js_1.isReplBridgeActive)()) {
                return {
                    result: false,
                    message: 'Remote Control is not connected — cannot send to a bridge: target. Reconnect with /remote-control first.',
                    errorCode: 9,
                };
            }
            return { result: true };
        }
        if ((0, bun_bundle_1.feature)('UDS_INBOX') &&
            (0, peerAddress_js_1.parseAddress)(input.to).scheme === 'uds' &&
            typeof input.message === 'string') {
            // UDS cross-session send: summary isn't rendered (UI.tsx returns null
            // for string messages), so don't require it. Structured messages fall
            // through to the rejection below.
            return { result: true };
        }
        if (typeof input.message === 'string') {
            if (!input.summary || input.summary.trim().length === 0) {
                return {
                    result: false,
                    message: 'summary is required when message is a string',
                    errorCode: 9,
                };
            }
            return { result: true };
        }
        if (input.to === '*') {
            return {
                result: false,
                message: 'structured messages cannot be broadcast (to: "*")',
                errorCode: 9,
            };
        }
        if ((0, bun_bundle_1.feature)('UDS_INBOX') && (0, peerAddress_js_1.parseAddress)(input.to).scheme !== 'other') {
            return {
                result: false,
                message: 'structured messages cannot be sent cross-session — only plain text',
                errorCode: 9,
            };
        }
        if (input.message.type === 'shutdown_response' &&
            input.to !== constants_js_1.TEAM_LEAD_NAME) {
            return {
                result: false,
                message: `shutdown_response must be sent to "${constants_js_1.TEAM_LEAD_NAME}"`,
                errorCode: 9,
            };
        }
        if (input.message.type === 'shutdown_response' &&
            !input.message.approve &&
            (!input.message.reason || input.message.reason.trim().length === 0)) {
            return {
                result: false,
                message: 'reason is required when rejecting a shutdown request',
                errorCode: 9,
            };
        }
        return { result: true };
    },
    async description() {
        return prompt_js_1.DESCRIPTION;
    },
    async prompt() {
        return (0, prompt_js_1.getPrompt)();
    },
    mapToolResultToToolResultBlockParam(data, toolUseID) {
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: [
                {
                    type: 'text',
                    text: (0, slowOperations_js_1.jsonStringify)(data),
                },
            ],
        };
    },
    async call(input, context, canUseTool, assistantMessage) {
        if ((0, bun_bundle_1.feature)('UDS_INBOX') && typeof input.message === 'string') {
            const addr = (0, peerAddress_js_1.parseAddress)(input.to);
            if (addr.scheme === 'bridge') {
                // Re-check handle — checkPermissions blocks on user approval (can be
                // minutes). validateInput's check is stale if the bridge dropped
                // during the prompt wait; without this, from="unknown" ships.
                // Also re-check isReplBridgeActive for outbound-only mode.
                if (!(0, replBridgeHandle_js_1.getReplBridgeHandle)() || !(0, state_js_1.isReplBridgeActive)()) {
                    return {
                        data: {
                            success: false,
                            message: `Remote Control disconnected before send — cannot deliver to ${input.to}`,
                        },
                    };
                }
                /* eslint-disable @typescript-eslint/no-require-imports */
                const { postInterClaudeMessage } = require('../../bridge/peerSessions.js');
                /* eslint-enable @typescript-eslint/no-require-imports */
                const result = await postInterClaudeMessage(addr.target, input.message);
                const preview = input.summary || (0, format_js_1.truncate)(input.message, 50);
                return {
                    data: {
                        success: result.ok,
                        message: result.ok
                            ? `“${preview}” → ${input.to}`
                            : `Failed to send to ${input.to}: ${result.error ?? 'unknown'}`,
                    },
                };
            }
            if (addr.scheme === 'uds') {
                /* eslint-disable @typescript-eslint/no-require-imports */
                const { sendToUdsSocket } = require('../../utils/udsClient.js');
                /* eslint-enable @typescript-eslint/no-require-imports */
                try {
                    await sendToUdsSocket(addr.target, input.message);
                    const preview = input.summary || (0, format_js_1.truncate)(input.message, 50);
                    return {
                        data: {
                            success: true,
                            message: `“${preview}” → ${input.to}`,
                        },
                    };
                }
                catch (e) {
                    return {
                        data: {
                            success: false,
                            message: `Failed to send to ${input.to}: ${(0, errors_js_1.errorMessage)(e)}`,
                        },
                    };
                }
            }
        }
        // Route to in-process subagent by name or raw agentId before falling
        // through to ambient-team resolution. Stopped agents are auto-resumed.
        if (typeof input.message === 'string' && input.to !== '*') {
            const appState = context.getAppState();
            const registered = appState.agentNameRegistry.get(input.to);
            const agentId = registered ?? (0, ids_js_1.toAgentId)(input.to);
            if (agentId) {
                const task = appState.tasks[agentId];
                if ((0, LocalAgentTask_js_1.isLocalAgentTask)(task) && !(0, LocalMainSessionTask_js_1.isMainSessionTask)(task)) {
                    if (task.status === 'running') {
                        (0, LocalAgentTask_js_1.queuePendingMessage)(agentId, input.message, context.setAppStateForTasks ?? context.setAppState);
                        return {
                            data: {
                                success: true,
                                message: `Message queued for delivery to ${input.to} at its next tool round.`,
                            },
                        };
                    }
                    // task exists but stopped — auto-resume
                    try {
                        const result = await (0, resumeAgent_js_1.resumeAgentBackground)({
                            agentId,
                            prompt: input.message,
                            toolUseContext: context,
                            canUseTool,
                            invokingRequestId: assistantMessage?.requestId,
                        });
                        return {
                            data: {
                                success: true,
                                message: `Agent "${input.to}" was stopped (${task.status}); resumed it in the background with your message. You'll be notified when it finishes. Output: ${result.outputFile}`,
                            },
                        };
                    }
                    catch (e) {
                        return {
                            data: {
                                success: false,
                                message: `Agent "${input.to}" is stopped (${task.status}) and could not be resumed: ${(0, errors_js_1.errorMessage)(e)}`,
                            },
                        };
                    }
                }
                else {
                    // task evicted from state — try resume from disk transcript.
                    // agentId is either a registered name or a format-matching raw ID
                    // (toAgentId validates the createAgentId format, so teammate names
                    // never reach this block).
                    try {
                        const result = await (0, resumeAgent_js_1.resumeAgentBackground)({
                            agentId,
                            prompt: input.message,
                            toolUseContext: context,
                            canUseTool,
                            invokingRequestId: assistantMessage?.requestId,
                        });
                        return {
                            data: {
                                success: true,
                                message: `Agent "${input.to}" had no active task; resumed from transcript in the background with your message. You'll be notified when it finishes. Output: ${result.outputFile}`,
                            },
                        };
                    }
                    catch (e) {
                        return {
                            data: {
                                success: false,
                                message: `Agent "${input.to}" is registered but has no transcript to resume. It may have been cleaned up. (${(0, errors_js_1.errorMessage)(e)})`,
                            },
                        };
                    }
                }
            }
        }
        if (typeof input.message === 'string') {
            if (input.to === '*') {
                return handleBroadcast(input.message, input.summary, context);
            }
            return handleMessage(input.to, input.message, input.summary, context);
        }
        if (input.to === '*') {
            throw new Error('structured messages cannot be broadcast');
        }
        switch (input.message.type) {
            case 'shutdown_request':
                return handleShutdownRequest(input.to, input.message.reason, context);
            case 'shutdown_response':
                if (input.message.approve) {
                    return handleShutdownApproval(input.message.request_id, context);
                }
                return handleShutdownRejection(input.message.request_id, input.message.reason);
            case 'plan_approval_response':
                if (input.message.approve) {
                    return handlePlanApproval(input.to, input.message.request_id, context);
                }
                return handlePlanRejection(input.to, input.message.request_id, input.message.feedback ?? 'Plan needs revision', context);
        }
    },
    renderToolUseMessage: UI_js_1.renderToolUseMessage,
    renderToolResultMessage: UI_js_1.renderToolResultMessage,
});
