"use strict";
/**
 * Teammate Mailbox - File-based messaging system for agent swarms
 *
 * Each teammate has an inbox file at .claude/teams/{team_name}/inboxes/{agent_name}.json
 * Other teammates can write messages to it, and the recipient sees them as attachments.
 *
 * Note: Inboxes are keyed by agent name within a team.
 */
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
exports.ModeSetRequestMessageSchema = exports.ShutdownRejectedMessageSchema = exports.ShutdownApprovedMessageSchema = exports.ShutdownRequestMessageSchema = exports.PlanApprovalResponseMessageSchema = exports.PlanApprovalRequestMessageSchema = void 0;
exports.getInboxPath = getInboxPath;
exports.readMailbox = readMailbox;
exports.readUnreadMessages = readUnreadMessages;
exports.writeToMailbox = writeToMailbox;
exports.markMessageAsReadByIndex = markMessageAsReadByIndex;
exports.markMessagesAsRead = markMessagesAsRead;
exports.clearMailbox = clearMailbox;
exports.formatTeammateMessages = formatTeammateMessages;
exports.createIdleNotification = createIdleNotification;
exports.isIdleNotification = isIdleNotification;
exports.createPermissionRequestMessage = createPermissionRequestMessage;
exports.createPermissionResponseMessage = createPermissionResponseMessage;
exports.isPermissionRequest = isPermissionRequest;
exports.isPermissionResponse = isPermissionResponse;
exports.createSandboxPermissionRequestMessage = createSandboxPermissionRequestMessage;
exports.createSandboxPermissionResponseMessage = createSandboxPermissionResponseMessage;
exports.isSandboxPermissionRequest = isSandboxPermissionRequest;
exports.isSandboxPermissionResponse = isSandboxPermissionResponse;
exports.createShutdownRequestMessage = createShutdownRequestMessage;
exports.createShutdownApprovedMessage = createShutdownApprovedMessage;
exports.createShutdownRejectedMessage = createShutdownRejectedMessage;
exports.sendShutdownRequestToMailbox = sendShutdownRequestToMailbox;
exports.isShutdownRequest = isShutdownRequest;
exports.isPlanApprovalRequest = isPlanApprovalRequest;
exports.isShutdownApproved = isShutdownApproved;
exports.isShutdownRejected = isShutdownRejected;
exports.isPlanApprovalResponse = isPlanApprovalResponse;
exports.isTaskAssignment = isTaskAssignment;
exports.isTeamPermissionUpdate = isTeamPermissionUpdate;
exports.createModeSetRequestMessage = createModeSetRequestMessage;
exports.isModeSetRequest = isModeSetRequest;
exports.isStructuredProtocolMessage = isStructuredProtocolMessage;
exports.markMessagesAsReadByPredicate = markMessagesAsReadByPredicate;
exports.getLastPeerDmSummary = getLastPeerDmSummary;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const v4_1 = require("zod/v4");
const xml_js_1 = require("../constants/xml.js");
const coreSchemas_js_1 = require("../entrypoints/sdk/coreSchemas.js");
const constants_js_1 = require("../tools/SendMessageTool/constants.js");
const agentId_js_1 = require("./agentId.js");
const array_js_1 = require("./array.js");
const debug_js_1 = require("./debug.js");
const envUtils_js_1 = require("./envUtils.js");
const errors_js_1 = require("./errors.js");
const lazySchema_js_1 = require("./lazySchema.js");
const lockfile = __importStar(require("./lockfile.js"));
const log_js_1 = require("./log.js");
const slowOperations_js_1 = require("./slowOperations.js");
const constants_js_2 = require("./swarm/constants.js");
const tasks_js_1 = require("./tasks.js");
const teammate_js_1 = require("./teammate.js");
// Lock options: retry with backoff so concurrent callers (multiple Claudes
// in a swarm) wait for the lock instead of failing immediately. The sync
// lockSync API blocked the event loop; the async API needs explicit retries
// to achieve the same serialization semantics.
const LOCK_OPTIONS = {
    retries: {
        retries: 10,
        minTimeout: 5,
        maxTimeout: 100,
    },
};
/**
 * Get the path to a teammate's inbox file
 * Structure: ~/.claude/teams/{team_name}/inboxes/{agent_name}.json
 */
function getInboxPath(agentName, teamName) {
    const team = teamName || (0, teammate_js_1.getTeamName)() || 'default';
    const safeTeam = (0, tasks_js_1.sanitizePathComponent)(team);
    const safeAgentName = (0, tasks_js_1.sanitizePathComponent)(agentName);
    const inboxDir = (0, path_1.join)((0, envUtils_js_1.getTeamsDir)(), safeTeam, 'inboxes');
    const fullPath = (0, path_1.join)(inboxDir, `${safeAgentName}.json`);
    (0, debug_js_1.logForDebugging)(`[TeammateMailbox] getInboxPath: agent=${agentName}, team=${team}, fullPath=${fullPath}`);
    return fullPath;
}
/**
 * Ensure the inbox directory exists for a team
 */
async function ensureInboxDir(teamName) {
    const team = teamName || (0, teammate_js_1.getTeamName)() || 'default';
    const safeTeam = (0, tasks_js_1.sanitizePathComponent)(team);
    const inboxDir = (0, path_1.join)((0, envUtils_js_1.getTeamsDir)(), safeTeam, 'inboxes');
    await (0, promises_1.mkdir)(inboxDir, { recursive: true });
    (0, debug_js_1.logForDebugging)(`[TeammateMailbox] Ensured inbox directory: ${inboxDir}`);
}
/**
 * Read all messages from a teammate's inbox
 * @param agentName - The agent name (not UUID) to read inbox for
 * @param teamName - Optional team name (defaults to CLAUDE_CODE_TEAM_NAME env var or 'default')
 */
async function readMailbox(agentName, teamName) {
    const inboxPath = getInboxPath(agentName, teamName);
    (0, debug_js_1.logForDebugging)(`[TeammateMailbox] readMailbox: path=${inboxPath}`);
    try {
        const content = await (0, promises_1.readFile)(inboxPath, 'utf-8');
        const messages = (0, slowOperations_js_1.jsonParse)(content);
        (0, debug_js_1.logForDebugging)(`[TeammateMailbox] readMailbox: read ${messages.length} message(s)`);
        return messages;
    }
    catch (error) {
        const code = (0, errors_js_1.getErrnoCode)(error);
        if (code === 'ENOENT') {
            (0, debug_js_1.logForDebugging)(`[TeammateMailbox] readMailbox: file does not exist`);
            return [];
        }
        (0, debug_js_1.logForDebugging)(`Failed to read inbox for ${agentName}: ${error}`);
        (0, log_js_1.logError)(error);
        return [];
    }
}
/**
 * Read only unread messages from a teammate's inbox
 * @param agentName - The agent name (not UUID) to read inbox for
 * @param teamName - Optional team name
 */
async function readUnreadMessages(agentName, teamName) {
    const messages = await readMailbox(agentName, teamName);
    const unread = messages.filter(m => !m.read);
    (0, debug_js_1.logForDebugging)(`[TeammateMailbox] readUnreadMessages: ${unread.length} unread of ${messages.length} total`);
    return unread;
}
/**
 * Write a message to a teammate's inbox
 * Uses file locking to prevent race conditions when multiple agents write concurrently
 * @param recipientName - The recipient's agent name (not UUID)
 * @param message - The message to write
 * @param teamName - Optional team name
 */
async function writeToMailbox(recipientName, message, teamName) {
    await ensureInboxDir(teamName);
    const inboxPath = getInboxPath(recipientName, teamName);
    const lockFilePath = `${inboxPath}.lock`;
    (0, debug_js_1.logForDebugging)(`[TeammateMailbox] writeToMailbox: recipient=${recipientName}, from=${message.from}, path=${inboxPath}`);
    // Ensure the inbox file exists before locking (proper-lockfile requires the file to exist)
    try {
        await (0, promises_1.writeFile)(inboxPath, '[]', { encoding: 'utf-8', flag: 'wx' });
        (0, debug_js_1.logForDebugging)(`[TeammateMailbox] writeToMailbox: created new inbox file`);
    }
    catch (error) {
        const code = (0, errors_js_1.getErrnoCode)(error);
        if (code !== 'EEXIST') {
            (0, debug_js_1.logForDebugging)(`[TeammateMailbox] writeToMailbox: failed to create inbox file: ${error}`);
            (0, log_js_1.logError)(error);
            return;
        }
    }
    let release;
    try {
        release = await lockfile.lock(inboxPath, {
            lockfilePath: lockFilePath,
            ...LOCK_OPTIONS,
        });
        // Re-read messages after acquiring lock to get the latest state
        const messages = await readMailbox(recipientName, teamName);
        const newMessage = {
            ...message,
            read: false,
        };
        messages.push(newMessage);
        await (0, promises_1.writeFile)(inboxPath, (0, slowOperations_js_1.jsonStringify)(messages, null, 2), 'utf-8');
        (0, debug_js_1.logForDebugging)(`[TeammateMailbox] Wrote message to ${recipientName}'s inbox from ${message.from}`);
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`Failed to write to inbox for ${recipientName}: ${error}`);
        (0, log_js_1.logError)(error);
    }
    finally {
        if (release) {
            await release();
        }
    }
}
/**
 * Mark a specific message in a teammate's inbox as read by index
 * Uses file locking to prevent race conditions
 * @param agentName - The agent name to mark message as read for
 * @param teamName - Optional team name
 * @param messageIndex - Index of the message to mark as read
 */
async function markMessageAsReadByIndex(agentName, teamName, messageIndex) {
    const inboxPath = getInboxPath(agentName, teamName);
    (0, debug_js_1.logForDebugging)(`[TeammateMailbox] markMessageAsReadByIndex called: agentName=${agentName}, teamName=${teamName}, index=${messageIndex}, path=${inboxPath}`);
    const lockFilePath = `${inboxPath}.lock`;
    let release;
    try {
        (0, debug_js_1.logForDebugging)(`[TeammateMailbox] markMessageAsReadByIndex: acquiring lock...`);
        release = await lockfile.lock(inboxPath, {
            lockfilePath: lockFilePath,
            ...LOCK_OPTIONS,
        });
        (0, debug_js_1.logForDebugging)(`[TeammateMailbox] markMessageAsReadByIndex: lock acquired`);
        // Re-read messages after acquiring lock to get the latest state
        const messages = await readMailbox(agentName, teamName);
        (0, debug_js_1.logForDebugging)(`[TeammateMailbox] markMessageAsReadByIndex: read ${messages.length} messages after lock`);
        if (messageIndex < 0 || messageIndex >= messages.length) {
            (0, debug_js_1.logForDebugging)(`[TeammateMailbox] markMessageAsReadByIndex: index ${messageIndex} out of bounds (${messages.length} messages)`);
            return;
        }
        const message = messages[messageIndex];
        if (!message || message.read) {
            (0, debug_js_1.logForDebugging)(`[TeammateMailbox] markMessageAsReadByIndex: message already read or missing`);
            return;
        }
        messages[messageIndex] = { ...message, read: true };
        await (0, promises_1.writeFile)(inboxPath, (0, slowOperations_js_1.jsonStringify)(messages, null, 2), 'utf-8');
        (0, debug_js_1.logForDebugging)(`[TeammateMailbox] markMessageAsReadByIndex: marked message at index ${messageIndex} as read`);
    }
    catch (error) {
        const code = (0, errors_js_1.getErrnoCode)(error);
        if (code === 'ENOENT') {
            (0, debug_js_1.logForDebugging)(`[TeammateMailbox] markMessageAsReadByIndex: file does not exist at ${inboxPath}`);
            return;
        }
        (0, debug_js_1.logForDebugging)(`[TeammateMailbox] markMessageAsReadByIndex FAILED for ${agentName}: ${error}`);
        (0, log_js_1.logError)(error);
    }
    finally {
        if (release) {
            await release();
            (0, debug_js_1.logForDebugging)(`[TeammateMailbox] markMessageAsReadByIndex: lock released`);
        }
    }
}
/**
 * Mark all messages in a teammate's inbox as read
 * Uses file locking to prevent race conditions
 * @param agentName - The agent name to mark messages as read for
 * @param teamName - Optional team name
 */
async function markMessagesAsRead(agentName, teamName) {
    const inboxPath = getInboxPath(agentName, teamName);
    (0, debug_js_1.logForDebugging)(`[TeammateMailbox] markMessagesAsRead called: agentName=${agentName}, teamName=${teamName}, path=${inboxPath}`);
    const lockFilePath = `${inboxPath}.lock`;
    let release;
    try {
        (0, debug_js_1.logForDebugging)(`[TeammateMailbox] markMessagesAsRead: acquiring lock...`);
        release = await lockfile.lock(inboxPath, {
            lockfilePath: lockFilePath,
            ...LOCK_OPTIONS,
        });
        (0, debug_js_1.logForDebugging)(`[TeammateMailbox] markMessagesAsRead: lock acquired`);
        // Re-read messages after acquiring lock to get the latest state
        const messages = await readMailbox(agentName, teamName);
        (0, debug_js_1.logForDebugging)(`[TeammateMailbox] markMessagesAsRead: read ${messages.length} messages after lock`);
        if (messages.length === 0) {
            (0, debug_js_1.logForDebugging)(`[TeammateMailbox] markMessagesAsRead: no messages to mark`);
            return;
        }
        const unreadCount = (0, array_js_1.count)(messages, m => !m.read);
        (0, debug_js_1.logForDebugging)(`[TeammateMailbox] markMessagesAsRead: ${unreadCount} unread of ${messages.length} total`);
        // messages comes from jsonParse — fresh, unshared objects safe to mutate
        for (const m of messages)
            m.read = true;
        await (0, promises_1.writeFile)(inboxPath, (0, slowOperations_js_1.jsonStringify)(messages, null, 2), 'utf-8');
        (0, debug_js_1.logForDebugging)(`[TeammateMailbox] markMessagesAsRead: WROTE ${unreadCount} message(s) as read to ${inboxPath}`);
    }
    catch (error) {
        const code = (0, errors_js_1.getErrnoCode)(error);
        if (code === 'ENOENT') {
            (0, debug_js_1.logForDebugging)(`[TeammateMailbox] markMessagesAsRead: file does not exist at ${inboxPath}`);
            return;
        }
        (0, debug_js_1.logForDebugging)(`[TeammateMailbox] markMessagesAsRead FAILED for ${agentName}: ${error}`);
        (0, log_js_1.logError)(error);
    }
    finally {
        if (release) {
            await release();
            (0, debug_js_1.logForDebugging)(`[TeammateMailbox] markMessagesAsRead: lock released`);
        }
    }
}
/**
 * Clear a teammate's inbox (delete all messages)
 * @param agentName - The agent name to clear inbox for
 * @param teamName - Optional team name
 */
async function clearMailbox(agentName, teamName) {
    const inboxPath = getInboxPath(agentName, teamName);
    try {
        // flag 'r+' throws ENOENT if the file doesn't exist, so we don't
        // accidentally create an inbox file that wasn't there.
        await (0, promises_1.writeFile)(inboxPath, '[]', { encoding: 'utf-8', flag: 'r+' });
        (0, debug_js_1.logForDebugging)(`[TeammateMailbox] Cleared inbox for ${agentName}`);
    }
    catch (error) {
        const code = (0, errors_js_1.getErrnoCode)(error);
        if (code === 'ENOENT') {
            return;
        }
        (0, debug_js_1.logForDebugging)(`Failed to clear inbox for ${agentName}: ${error}`);
        (0, log_js_1.logError)(error);
    }
}
/**
 * Format teammate messages as XML for attachment display
 */
function formatTeammateMessages(messages) {
    return messages
        .map(m => {
        const colorAttr = m.color ? ` color="${m.color}"` : '';
        const summaryAttr = m.summary ? ` summary="${m.summary}"` : '';
        return `<${xml_js_1.TEAMMATE_MESSAGE_TAG} teammate_id="${m.from}"${colorAttr}${summaryAttr}>\n${m.text}\n</${xml_js_1.TEAMMATE_MESSAGE_TAG}>`;
    })
        .join('\n\n');
}
/**
 * Creates an idle notification message to send to the team leader
 */
function createIdleNotification(agentId, options) {
    return {
        type: 'idle_notification',
        from: agentId,
        timestamp: new Date().toISOString(),
        idleReason: options?.idleReason,
        summary: options?.summary,
        completedTaskId: options?.completedTaskId,
        completedStatus: options?.completedStatus,
        failureReason: options?.failureReason,
    };
}
/**
 * Checks if a message text contains an idle notification
 */
function isIdleNotification(messageText) {
    try {
        const parsed = (0, slowOperations_js_1.jsonParse)(messageText);
        if (parsed && parsed.type === 'idle_notification') {
            return parsed;
        }
    }
    catch {
        // Not JSON or not a valid idle notification
    }
    return null;
}
/**
 * Creates a permission request message to send to the team leader
 */
function createPermissionRequestMessage(params) {
    return {
        type: 'permission_request',
        request_id: params.request_id,
        agent_id: params.agent_id,
        tool_name: params.tool_name,
        tool_use_id: params.tool_use_id,
        description: params.description,
        input: params.input,
        permission_suggestions: params.permission_suggestions || [],
    };
}
/**
 * Creates a permission response message to send back to a worker
 */
function createPermissionResponseMessage(params) {
    if (params.subtype === 'error') {
        return {
            type: 'permission_response',
            request_id: params.request_id,
            subtype: 'error',
            error: params.error || 'Permission denied',
        };
    }
    return {
        type: 'permission_response',
        request_id: params.request_id,
        subtype: 'success',
        response: {
            updated_input: params.updated_input,
            permission_updates: params.permission_updates,
        },
    };
}
/**
 * Checks if a message text contains a permission request
 */
function isPermissionRequest(messageText) {
    try {
        const parsed = (0, slowOperations_js_1.jsonParse)(messageText);
        if (parsed && parsed.type === 'permission_request') {
            return parsed;
        }
    }
    catch {
        // Not JSON or not a valid permission request
    }
    return null;
}
/**
 * Checks if a message text contains a permission response
 */
function isPermissionResponse(messageText) {
    try {
        const parsed = (0, slowOperations_js_1.jsonParse)(messageText);
        if (parsed && parsed.type === 'permission_response') {
            return parsed;
        }
    }
    catch {
        // Not JSON or not a valid permission response
    }
    return null;
}
/**
 * Creates a sandbox permission request message to send to the team leader
 */
function createSandboxPermissionRequestMessage(params) {
    return {
        type: 'sandbox_permission_request',
        requestId: params.requestId,
        workerId: params.workerId,
        workerName: params.workerName,
        workerColor: params.workerColor,
        hostPattern: { host: params.host },
        createdAt: Date.now(),
    };
}
/**
 * Creates a sandbox permission response message to send back to a worker
 */
function createSandboxPermissionResponseMessage(params) {
    return {
        type: 'sandbox_permission_response',
        requestId: params.requestId,
        host: params.host,
        allow: params.allow,
        timestamp: new Date().toISOString(),
    };
}
/**
 * Checks if a message text contains a sandbox permission request
 */
function isSandboxPermissionRequest(messageText) {
    try {
        const parsed = (0, slowOperations_js_1.jsonParse)(messageText);
        if (parsed && parsed.type === 'sandbox_permission_request') {
            return parsed;
        }
    }
    catch {
        // Not JSON or not a valid sandbox permission request
    }
    return null;
}
/**
 * Checks if a message text contains a sandbox permission response
 */
function isSandboxPermissionResponse(messageText) {
    try {
        const parsed = (0, slowOperations_js_1.jsonParse)(messageText);
        if (parsed && parsed.type === 'sandbox_permission_response') {
            return parsed;
        }
    }
    catch {
        // Not JSON or not a valid sandbox permission response
    }
    return null;
}
/**
 * Message sent when a teammate requests plan approval from the team leader
 */
exports.PlanApprovalRequestMessageSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    type: v4_1.z.literal('plan_approval_request'),
    from: v4_1.z.string(),
    timestamp: v4_1.z.string(),
    planFilePath: v4_1.z.string(),
    planContent: v4_1.z.string(),
    requestId: v4_1.z.string(),
}));
/**
 * Message sent by the team leader in response to a plan approval request
 */
exports.PlanApprovalResponseMessageSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    type: v4_1.z.literal('plan_approval_response'),
    requestId: v4_1.z.string(),
    approved: v4_1.z.boolean(),
    feedback: v4_1.z.string().optional(),
    timestamp: v4_1.z.string(),
    permissionMode: (0, coreSchemas_js_1.PermissionModeSchema)().optional(),
}));
/**
 * Shutdown request message sent from leader to teammate via mailbox
 */
exports.ShutdownRequestMessageSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    type: v4_1.z.literal('shutdown_request'),
    requestId: v4_1.z.string(),
    from: v4_1.z.string(),
    reason: v4_1.z.string().optional(),
    timestamp: v4_1.z.string(),
}));
/**
 * Shutdown approved message sent from teammate to leader via mailbox
 */
exports.ShutdownApprovedMessageSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    type: v4_1.z.literal('shutdown_approved'),
    requestId: v4_1.z.string(),
    from: v4_1.z.string(),
    timestamp: v4_1.z.string(),
    paneId: v4_1.z.string().optional(),
    backendType: v4_1.z.string().optional(),
}));
/**
 * Shutdown rejected message sent from teammate to leader via mailbox
 */
exports.ShutdownRejectedMessageSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    type: v4_1.z.literal('shutdown_rejected'),
    requestId: v4_1.z.string(),
    from: v4_1.z.string(),
    reason: v4_1.z.string(),
    timestamp: v4_1.z.string(),
}));
/**
 * Creates a shutdown request message to send to a teammate
 */
function createShutdownRequestMessage(params) {
    return {
        type: 'shutdown_request',
        requestId: params.requestId,
        from: params.from,
        reason: params.reason,
        timestamp: new Date().toISOString(),
    };
}
/**
 * Creates a shutdown approved message to send to the team leader
 */
function createShutdownApprovedMessage(params) {
    return {
        type: 'shutdown_approved',
        requestId: params.requestId,
        from: params.from,
        timestamp: new Date().toISOString(),
        paneId: params.paneId,
        backendType: params.backendType,
    };
}
/**
 * Creates a shutdown rejected message to send to the team leader
 */
function createShutdownRejectedMessage(params) {
    return {
        type: 'shutdown_rejected',
        requestId: params.requestId,
        from: params.from,
        reason: params.reason,
        timestamp: new Date().toISOString(),
    };
}
/**
 * Sends a shutdown request to a teammate's mailbox.
 * This is the core logic extracted for reuse by both the tool and UI components.
 *
 * @param targetName - Name of the teammate to send shutdown request to
 * @param teamName - Optional team name (defaults to CLAUDE_CODE_TEAM_NAME env var)
 * @param reason - Optional reason for the shutdown request
 * @returns The request ID and target name
 */
async function sendShutdownRequestToMailbox(targetName, teamName, reason) {
    const resolvedTeamName = teamName || (0, teammate_js_1.getTeamName)();
    // Get sender name (supports in-process teammates via AsyncLocalStorage)
    const senderName = (0, teammate_js_1.getAgentName)() || constants_js_2.TEAM_LEAD_NAME;
    // Generate a deterministic request ID for this shutdown request
    const requestId = (0, agentId_js_1.generateRequestId)('shutdown', targetName);
    // Create and send the shutdown request message
    const shutdownMessage = createShutdownRequestMessage({
        requestId,
        from: senderName,
        reason,
    });
    await writeToMailbox(targetName, {
        from: senderName,
        text: (0, slowOperations_js_1.jsonStringify)(shutdownMessage),
        timestamp: new Date().toISOString(),
        color: (0, teammate_js_1.getTeammateColor)(),
    }, resolvedTeamName);
    return { requestId, target: targetName };
}
/**
 * Checks if a message text contains a shutdown request
 */
function isShutdownRequest(messageText) {
    try {
        const result = (0, exports.ShutdownRequestMessageSchema)().safeParse((0, slowOperations_js_1.jsonParse)(messageText));
        if (result.success)
            return result.data;
    }
    catch {
        // Not JSON
    }
    return null;
}
/**
 * Checks if a message text contains a plan approval request
 */
function isPlanApprovalRequest(messageText) {
    try {
        const result = (0, exports.PlanApprovalRequestMessageSchema)().safeParse((0, slowOperations_js_1.jsonParse)(messageText));
        if (result.success)
            return result.data;
    }
    catch {
        // Not JSON
    }
    return null;
}
/**
 * Checks if a message text contains a shutdown approved message
 */
function isShutdownApproved(messageText) {
    try {
        const result = (0, exports.ShutdownApprovedMessageSchema)().safeParse((0, slowOperations_js_1.jsonParse)(messageText));
        if (result.success)
            return result.data;
    }
    catch {
        // Not JSON
    }
    return null;
}
/**
 * Checks if a message text contains a shutdown rejected message
 */
function isShutdownRejected(messageText) {
    try {
        const result = (0, exports.ShutdownRejectedMessageSchema)().safeParse((0, slowOperations_js_1.jsonParse)(messageText));
        if (result.success)
            return result.data;
    }
    catch {
        // Not JSON
    }
    return null;
}
/**
 * Checks if a message text contains a plan approval response
 */
function isPlanApprovalResponse(messageText) {
    try {
        const result = (0, exports.PlanApprovalResponseMessageSchema)().safeParse((0, slowOperations_js_1.jsonParse)(messageText));
        if (result.success)
            return result.data;
    }
    catch {
        // Not JSON
    }
    return null;
}
/**
 * Checks if a message text contains a task assignment
 */
function isTaskAssignment(messageText) {
    try {
        const parsed = (0, slowOperations_js_1.jsonParse)(messageText);
        if (parsed && parsed.type === 'task_assignment') {
            return parsed;
        }
    }
    catch {
        // Not JSON or not a valid task assignment
    }
    return null;
}
/**
 * Checks if a message text contains a team permission update
 */
function isTeamPermissionUpdate(messageText) {
    try {
        const parsed = (0, slowOperations_js_1.jsonParse)(messageText);
        if (parsed && parsed.type === 'team_permission_update') {
            return parsed;
        }
    }
    catch {
        // Not JSON or not a valid team permission update
    }
    return null;
}
/**
 * Mode set request message sent from leader to teammate via mailbox
 * Uses SDK PermissionModeSchema for validated mode values
 */
exports.ModeSetRequestMessageSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    type: v4_1.z.literal('mode_set_request'),
    mode: (0, coreSchemas_js_1.PermissionModeSchema)(),
    from: v4_1.z.string(),
}));
/**
 * Creates a mode set request message to send to a teammate
 */
function createModeSetRequestMessage(params) {
    return {
        type: 'mode_set_request',
        mode: params.mode,
        from: params.from,
    };
}
/**
 * Checks if a message text contains a mode set request
 */
function isModeSetRequest(messageText) {
    try {
        const parsed = (0, exports.ModeSetRequestMessageSchema)().safeParse((0, slowOperations_js_1.jsonParse)(messageText));
        if (parsed.success) {
            return parsed.data;
        }
    }
    catch {
        // Not JSON or not a valid mode set request
    }
    return null;
}
/**
 * Checks if a message text is a structured protocol message that should be
 * routed by useInboxPoller rather than consumed as raw LLM context.
 *
 * These message types have specific handlers in useInboxPoller that route them
 * to the correct queues (workerPermissions, workerSandboxPermissions, etc.).
 * If getTeammateMailboxAttachments consumes them first, they get bundled as
 * raw text in attachments and never reach their intended handlers.
 */
function isStructuredProtocolMessage(messageText) {
    try {
        const parsed = (0, slowOperations_js_1.jsonParse)(messageText);
        if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
            return false;
        }
        const type = parsed.type;
        return (type === 'permission_request' ||
            type === 'permission_response' ||
            type === 'sandbox_permission_request' ||
            type === 'sandbox_permission_response' ||
            type === 'shutdown_request' ||
            type === 'shutdown_approved' ||
            type === 'team_permission_update' ||
            type === 'mode_set_request' ||
            type === 'plan_approval_request' ||
            type === 'plan_approval_response');
    }
    catch {
        return false;
    }
}
/**
 * Marks only messages matching a predicate as read, leaving others unread.
 * Uses the same file-locking mechanism as markMessagesAsRead.
 */
async function markMessagesAsReadByPredicate(agentName, predicate, teamName) {
    const inboxPath = getInboxPath(agentName, teamName);
    const lockFilePath = `${inboxPath}.lock`;
    let release;
    try {
        release = await lockfile.lock(inboxPath, {
            lockfilePath: lockFilePath,
            ...LOCK_OPTIONS,
        });
        const messages = await readMailbox(agentName, teamName);
        if (messages.length === 0) {
            return;
        }
        const updatedMessages = messages.map(m => !m.read && predicate(m) ? { ...m, read: true } : m);
        await (0, promises_1.writeFile)(inboxPath, (0, slowOperations_js_1.jsonStringify)(updatedMessages, null, 2), 'utf-8');
    }
    catch (error) {
        const code = (0, errors_js_1.getErrnoCode)(error);
        if (code === 'ENOENT') {
            return;
        }
        (0, log_js_1.logError)(error);
    }
    finally {
        if (release) {
            try {
                await release();
            }
            catch {
                // Lock may have already been released
            }
        }
    }
}
/**
 * Extracts a "[to {name}] {summary}" string from the last assistant message
 * if it ended with a SendMessage tool_use targeting a peer (not the team lead).
 * Returns undefined when the turn didn't end with a peer DM.
 */
function getLastPeerDmSummary(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (!msg)
            continue;
        // Stop at wake-up boundary: a user prompt (string content), not tool results (array content)
        if (msg.type === 'user' && typeof msg.message.content === 'string') {
            break;
        }
        if (msg.type !== 'assistant')
            continue;
        for (const block of msg.message.content) {
            if (block.type === 'tool_use' &&
                block.name === constants_js_1.SEND_MESSAGE_TOOL_NAME &&
                typeof block.input === 'object' &&
                block.input !== null &&
                'to' in block.input &&
                typeof block.input.to === 'string' &&
                block.input.to !== '*' &&
                block.input.to.toLowerCase() !== constants_js_2.TEAM_LEAD_NAME.toLowerCase() &&
                'message' in block.input &&
                typeof block.input.message === 'string') {
                const to = block.input.to;
                const summary = 'summary' in block.input && typeof block.input.summary === 'string'
                    ? block.input.summary
                    : block.input.message.slice(0, 80);
                return `[to ${to}] ${summary}`;
            }
        }
    }
    return undefined;
}
