"use strict";
/**
 * Synchronized Permission Prompts for Agent Swarms
 *
 * This module provides infrastructure for coordinating permission prompts across
 * multiple agents in a swarm. When a worker agent needs permission for a tool use,
 * it can forward the request to the team leader, who can then approve or deny it.
 *
 * The system uses the teammate mailbox for message passing:
 * - Workers send permission requests to the leader's mailbox
 * - Leaders send permission responses to the worker's mailbox
 *
 * Flow:
 * 1. Worker agent encounters a permission prompt
 * 2. Worker sends a permission_request message to the leader's mailbox
 * 3. Leader polls for mailbox messages and detects permission requests
 * 4. User approves/denies via the leader's UI
 * 5. Leader sends a permission_response message to the worker's mailbox
 * 6. Worker polls mailbox for responses and continues execution
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
exports.submitPermissionRequest = exports.SwarmPermissionRequestSchema = void 0;
exports.getPermissionDir = getPermissionDir;
exports.generateRequestId = generateRequestId;
exports.createPermissionRequest = createPermissionRequest;
exports.writePermissionRequest = writePermissionRequest;
exports.readPendingPermissions = readPendingPermissions;
exports.readResolvedPermission = readResolvedPermission;
exports.resolvePermission = resolvePermission;
exports.cleanupOldResolutions = cleanupOldResolutions;
exports.pollForResponse = pollForResponse;
exports.removeWorkerResponse = removeWorkerResponse;
exports.isTeamLeader = isTeamLeader;
exports.isSwarmWorker = isSwarmWorker;
exports.deleteResolvedPermission = deleteResolvedPermission;
exports.getLeaderName = getLeaderName;
exports.sendPermissionRequestViaMailbox = sendPermissionRequestViaMailbox;
exports.sendPermissionResponseViaMailbox = sendPermissionResponseViaMailbox;
exports.generateSandboxRequestId = generateSandboxRequestId;
exports.sendSandboxPermissionRequestViaMailbox = sendSandboxPermissionRequestViaMailbox;
exports.sendSandboxPermissionResponseViaMailbox = sendSandboxPermissionResponseViaMailbox;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const v4_1 = require("zod/v4");
const debug_js_1 = require("../debug.js");
const errors_js_1 = require("../errors.js");
const lazySchema_js_1 = require("../lazySchema.js");
const lockfile = __importStar(require("../lockfile.js"));
const log_js_1 = require("../log.js");
const slowOperations_js_1 = require("../slowOperations.js");
const teammate_js_1 = require("../teammate.js");
const teammateMailbox_js_1 = require("../teammateMailbox.js");
const teamHelpers_js_1 = require("./teamHelpers.js");
/**
 * Full request schema for a permission request from a worker to the leader
 */
exports.SwarmPermissionRequestSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    /** Unique identifier for this request */
    id: v4_1.z.string(),
    /** Worker's CLAUDE_CODE_AGENT_ID */
    workerId: v4_1.z.string(),
    /** Worker's CLAUDE_CODE_AGENT_NAME */
    workerName: v4_1.z.string(),
    /** Worker's CLAUDE_CODE_AGENT_COLOR */
    workerColor: v4_1.z.string().optional(),
    /** Team name for routing */
    teamName: v4_1.z.string(),
    /** Tool name requiring permission (e.g., "Bash", "Edit") */
    toolName: v4_1.z.string(),
    /** Original toolUseID from worker's context */
    toolUseId: v4_1.z.string(),
    /** Human-readable description of the tool use */
    description: v4_1.z.string(),
    /** Serialized tool input */
    input: v4_1.z.record(v4_1.z.string(), v4_1.z.unknown()),
    /** Suggested permission rules from the permission result */
    permissionSuggestions: v4_1.z.array(v4_1.z.unknown()),
    /** Status of the request */
    status: v4_1.z.enum(['pending', 'approved', 'rejected']),
    /** Who resolved the request */
    resolvedBy: v4_1.z.enum(['worker', 'leader']).optional(),
    /** Timestamp when resolved */
    resolvedAt: v4_1.z.number().optional(),
    /** Rejection feedback message */
    feedback: v4_1.z.string().optional(),
    /** Modified input if changed by resolver */
    updatedInput: v4_1.z.record(v4_1.z.string(), v4_1.z.unknown()).optional(),
    /** "Always allow" rules applied during resolution */
    permissionUpdates: v4_1.z.array(v4_1.z.unknown()).optional(),
    /** Timestamp when request was created */
    createdAt: v4_1.z.number(),
}));
/**
 * Get the base directory for a team's permission requests
 * Path: ~/.claude/teams/{teamName}/permissions/
 */
function getPermissionDir(teamName) {
    return (0, path_1.join)((0, teamHelpers_js_1.getTeamDir)(teamName), 'permissions');
}
/**
 * Get the pending directory for a team
 */
function getPendingDir(teamName) {
    return (0, path_1.join)(getPermissionDir(teamName), 'pending');
}
/**
 * Get the resolved directory for a team
 */
function getResolvedDir(teamName) {
    return (0, path_1.join)(getPermissionDir(teamName), 'resolved');
}
/**
 * Ensure the permissions directory structure exists (async)
 */
async function ensurePermissionDirsAsync(teamName) {
    const permDir = getPermissionDir(teamName);
    const pendingDir = getPendingDir(teamName);
    const resolvedDir = getResolvedDir(teamName);
    for (const dir of [permDir, pendingDir, resolvedDir]) {
        await (0, promises_1.mkdir)(dir, { recursive: true });
    }
}
/**
 * Get the path to a pending request file
 */
function getPendingRequestPath(teamName, requestId) {
    return (0, path_1.join)(getPendingDir(teamName), `${requestId}.json`);
}
/**
 * Get the path to a resolved request file
 */
function getResolvedRequestPath(teamName, requestId) {
    return (0, path_1.join)(getResolvedDir(teamName), `${requestId}.json`);
}
/**
 * Generate a unique request ID
 */
function generateRequestId() {
    return `perm-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
/**
 * Create a new SwarmPermissionRequest object
 */
function createPermissionRequest(params) {
    const teamName = params.teamName || (0, teammate_js_1.getTeamName)();
    const workerId = params.workerId || (0, teammate_js_1.getAgentId)();
    const workerName = params.workerName || (0, teammate_js_1.getAgentName)();
    const workerColor = params.workerColor || (0, teammate_js_1.getTeammateColor)();
    if (!teamName) {
        throw new Error('Team name is required for permission requests');
    }
    if (!workerId) {
        throw new Error('Worker ID is required for permission requests');
    }
    if (!workerName) {
        throw new Error('Worker name is required for permission requests');
    }
    return {
        id: generateRequestId(),
        workerId,
        workerName,
        workerColor,
        teamName,
        toolName: params.toolName,
        toolUseId: params.toolUseId,
        description: params.description,
        input: params.input,
        permissionSuggestions: params.permissionSuggestions || [],
        status: 'pending',
        createdAt: Date.now(),
    };
}
/**
 * Write a permission request to the pending directory with file locking
 * Called by worker agents when they need permission approval from the leader
 *
 * @returns The written request
 */
async function writePermissionRequest(request) {
    await ensurePermissionDirsAsync(request.teamName);
    const pendingPath = getPendingRequestPath(request.teamName, request.id);
    const lockDir = getPendingDir(request.teamName);
    // Create a directory-level lock file for atomic writes
    const lockFilePath = (0, path_1.join)(lockDir, '.lock');
    await (0, promises_1.writeFile)(lockFilePath, '', 'utf-8');
    let release;
    try {
        release = await lockfile.lock(lockFilePath);
        // Write the request file
        await (0, promises_1.writeFile)(pendingPath, (0, slowOperations_js_1.jsonStringify)(request, null, 2), 'utf-8');
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Wrote pending request ${request.id} from ${request.workerName} for ${request.toolName}`);
        return request;
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Failed to write permission request: ${error}`);
        (0, log_js_1.logError)(error);
        throw error;
    }
    finally {
        if (release) {
            await release();
        }
    }
}
/**
 * Read all pending permission requests for a team
 * Called by the team leader to see what requests need attention
 */
async function readPendingPermissions(teamName) {
    const team = teamName || (0, teammate_js_1.getTeamName)();
    if (!team) {
        (0, debug_js_1.logForDebugging)('[PermissionSync] No team name available');
        return [];
    }
    const pendingDir = getPendingDir(team);
    let files;
    try {
        files = await (0, promises_1.readdir)(pendingDir);
    }
    catch (e) {
        const code = (0, errors_js_1.getErrnoCode)(e);
        if (code === 'ENOENT') {
            return [];
        }
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Failed to read pending requests: ${e}`);
        (0, log_js_1.logError)(e);
        return [];
    }
    const jsonFiles = files.filter(f => f.endsWith('.json') && f !== '.lock');
    const results = await Promise.all(jsonFiles.map(async (file) => {
        const filePath = (0, path_1.join)(pendingDir, file);
        try {
            const content = await (0, promises_1.readFile)(filePath, 'utf-8');
            const parsed = (0, exports.SwarmPermissionRequestSchema)().safeParse((0, slowOperations_js_1.jsonParse)(content));
            if (parsed.success) {
                return parsed.data;
            }
            (0, debug_js_1.logForDebugging)(`[PermissionSync] Invalid request file ${file}: ${parsed.error.message}`);
            return null;
        }
        catch (err) {
            (0, debug_js_1.logForDebugging)(`[PermissionSync] Failed to read request file ${file}: ${err}`);
            return null;
        }
    }));
    const requests = results.filter(r => r !== null);
    // Sort by creation time (oldest first)
    requests.sort((a, b) => a.createdAt - b.createdAt);
    return requests;
}
/**
 * Read a resolved permission request by ID
 * Called by workers to check if their request has been resolved
 *
 * @returns The resolved request, or null if not yet resolved
 */
async function readResolvedPermission(requestId, teamName) {
    const team = teamName || (0, teammate_js_1.getTeamName)();
    if (!team) {
        return null;
    }
    const resolvedPath = getResolvedRequestPath(team, requestId);
    try {
        const content = await (0, promises_1.readFile)(resolvedPath, 'utf-8');
        const parsed = (0, exports.SwarmPermissionRequestSchema)().safeParse((0, slowOperations_js_1.jsonParse)(content));
        if (parsed.success) {
            return parsed.data;
        }
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Invalid resolved request ${requestId}: ${parsed.error.message}`);
        return null;
    }
    catch (e) {
        const code = (0, errors_js_1.getErrnoCode)(e);
        if (code === 'ENOENT') {
            return null;
        }
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Failed to read resolved request ${requestId}: ${e}`);
        (0, log_js_1.logError)(e);
        return null;
    }
}
/**
 * Resolve a permission request
 * Called by the team leader (or worker in self-resolution cases)
 *
 * Writes the resolution to resolved/, removes from pending/
 */
async function resolvePermission(requestId, resolution, teamName) {
    const team = teamName || (0, teammate_js_1.getTeamName)();
    if (!team) {
        (0, debug_js_1.logForDebugging)('[PermissionSync] No team name available');
        return false;
    }
    await ensurePermissionDirsAsync(team);
    const pendingPath = getPendingRequestPath(team, requestId);
    const resolvedPath = getResolvedRequestPath(team, requestId);
    const lockFilePath = (0, path_1.join)(getPendingDir(team), '.lock');
    await (0, promises_1.writeFile)(lockFilePath, '', 'utf-8');
    let release;
    try {
        release = await lockfile.lock(lockFilePath);
        // Read the pending request
        let content;
        try {
            content = await (0, promises_1.readFile)(pendingPath, 'utf-8');
        }
        catch (e) {
            const code = (0, errors_js_1.getErrnoCode)(e);
            if (code === 'ENOENT') {
                (0, debug_js_1.logForDebugging)(`[PermissionSync] Pending request not found: ${requestId}`);
                return false;
            }
            throw e;
        }
        const parsed = (0, exports.SwarmPermissionRequestSchema)().safeParse((0, slowOperations_js_1.jsonParse)(content));
        if (!parsed.success) {
            (0, debug_js_1.logForDebugging)(`[PermissionSync] Invalid pending request ${requestId}: ${parsed.error.message}`);
            return false;
        }
        const request = parsed.data;
        // Update the request with resolution data
        const resolvedRequest = {
            ...request,
            status: resolution.decision === 'approved' ? 'approved' : 'rejected',
            resolvedBy: resolution.resolvedBy,
            resolvedAt: Date.now(),
            feedback: resolution.feedback,
            updatedInput: resolution.updatedInput,
            permissionUpdates: resolution.permissionUpdates,
        };
        // Write to resolved directory
        await (0, promises_1.writeFile)(resolvedPath, (0, slowOperations_js_1.jsonStringify)(resolvedRequest, null, 2), 'utf-8');
        // Remove from pending directory
        await (0, promises_1.unlink)(pendingPath);
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Resolved request ${requestId} with ${resolution.decision}`);
        return true;
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Failed to resolve request: ${error}`);
        (0, log_js_1.logError)(error);
        return false;
    }
    finally {
        if (release) {
            await release();
        }
    }
}
/**
 * Clean up old resolved permission files
 * Called periodically to prevent file accumulation
 *
 * @param teamName - Team name
 * @param maxAgeMs - Maximum age in milliseconds (default: 1 hour)
 */
async function cleanupOldResolutions(teamName, maxAgeMs = 3600000) {
    const team = teamName || (0, teammate_js_1.getTeamName)();
    if (!team) {
        return 0;
    }
    const resolvedDir = getResolvedDir(team);
    let files;
    try {
        files = await (0, promises_1.readdir)(resolvedDir);
    }
    catch (e) {
        const code = (0, errors_js_1.getErrnoCode)(e);
        if (code === 'ENOENT') {
            return 0;
        }
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Failed to cleanup resolutions: ${e}`);
        (0, log_js_1.logError)(e);
        return 0;
    }
    const now = Date.now();
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    const cleanupResults = await Promise.all(jsonFiles.map(async (file) => {
        const filePath = (0, path_1.join)(resolvedDir, file);
        try {
            const content = await (0, promises_1.readFile)(filePath, 'utf-8');
            const request = (0, slowOperations_js_1.jsonParse)(content);
            // Check if the resolution is old enough to clean up
            // Use >= to handle edge case where maxAgeMs is 0 (clean up everything)
            const resolvedAt = request.resolvedAt || request.createdAt;
            if (now - resolvedAt >= maxAgeMs) {
                await (0, promises_1.unlink)(filePath);
                (0, debug_js_1.logForDebugging)(`[PermissionSync] Cleaned up old resolution: ${file}`);
                return 1;
            }
            return 0;
        }
        catch {
            // If we can't parse it, clean it up anyway
            try {
                await (0, promises_1.unlink)(filePath);
                return 1;
            }
            catch {
                // Ignore deletion errors
                return 0;
            }
        }
    }));
    const cleanedCount = cleanupResults.reduce((sum, n) => sum + n, 0);
    if (cleanedCount > 0) {
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Cleaned up ${cleanedCount} old resolutions`);
    }
    return cleanedCount;
}
/**
 * Poll for a permission response (worker-side convenience function)
 * Converts the resolved request into a simpler response format
 *
 * @returns The permission response, or null if not yet resolved
 */
async function pollForResponse(requestId, _agentName, teamName) {
    const resolved = await readResolvedPermission(requestId, teamName);
    if (!resolved) {
        return null;
    }
    return {
        requestId: resolved.id,
        decision: resolved.status === 'approved' ? 'approved' : 'denied',
        timestamp: resolved.resolvedAt
            ? new Date(resolved.resolvedAt).toISOString()
            : new Date(resolved.createdAt).toISOString(),
        feedback: resolved.feedback,
        updatedInput: resolved.updatedInput,
        permissionUpdates: resolved.permissionUpdates,
    };
}
/**
 * Remove a worker's response after processing
 * This is an alias for deleteResolvedPermission for backward compatibility
 */
async function removeWorkerResponse(requestId, _agentName, teamName) {
    await deleteResolvedPermission(requestId, teamName);
}
/**
 * Check if the current agent is a team leader
 */
function isTeamLeader(teamName) {
    const team = teamName || (0, teammate_js_1.getTeamName)();
    if (!team) {
        return false;
    }
    // Team leaders don't have an agent ID set, or their ID is 'team-lead'
    const agentId = (0, teammate_js_1.getAgentId)();
    return !agentId || agentId === 'team-lead';
}
/**
 * Check if the current agent is a worker in a swarm
 */
function isSwarmWorker() {
    const teamName = (0, teammate_js_1.getTeamName)();
    const agentId = (0, teammate_js_1.getAgentId)();
    return !!teamName && !!agentId && !isTeamLeader();
}
/**
 * Delete a resolved permission file
 * Called after a worker has processed the resolution
 */
async function deleteResolvedPermission(requestId, teamName) {
    const team = teamName || (0, teammate_js_1.getTeamName)();
    if (!team) {
        return false;
    }
    const resolvedPath = getResolvedRequestPath(team, requestId);
    try {
        await (0, promises_1.unlink)(resolvedPath);
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Deleted resolved permission: ${requestId}`);
        return true;
    }
    catch (e) {
        const code = (0, errors_js_1.getErrnoCode)(e);
        if (code === 'ENOENT') {
            return false;
        }
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Failed to delete resolved permission: ${e}`);
        (0, log_js_1.logError)(e);
        return false;
    }
}
/**
 * Submit a permission request (alias for writePermissionRequest)
 * Provided for backward compatibility with worker integration code
 */
exports.submitPermissionRequest = writePermissionRequest;
// ============================================================================
// Mailbox-Based Permission System
// ============================================================================
/**
 * Get the leader's name from the team file
 * This is needed to send permission requests to the leader's mailbox
 */
async function getLeaderName(teamName) {
    const team = teamName || (0, teammate_js_1.getTeamName)();
    if (!team) {
        return null;
    }
    const teamFile = await (0, teamHelpers_js_1.readTeamFileAsync)(team);
    if (!teamFile) {
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Team file not found for team: ${team}`);
        return null;
    }
    const leadMember = teamFile.members.find(m => m.agentId === teamFile.leadAgentId);
    return leadMember?.name || 'team-lead';
}
/**
 * Send a permission request to the leader via mailbox.
 * This is the new mailbox-based approach that replaces the file-based pending directory.
 *
 * @param request - The permission request to send
 * @returns true if the message was sent successfully
 */
async function sendPermissionRequestViaMailbox(request) {
    const leaderName = await getLeaderName(request.teamName);
    if (!leaderName) {
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Cannot send permission request: leader name not found`);
        return false;
    }
    try {
        // Create the permission request message
        const message = (0, teammateMailbox_js_1.createPermissionRequestMessage)({
            request_id: request.id,
            agent_id: request.workerName,
            tool_name: request.toolName,
            tool_use_id: request.toolUseId,
            description: request.description,
            input: request.input,
            permission_suggestions: request.permissionSuggestions,
        });
        // Send to leader's mailbox (routes to in-process or file-based based on recipient)
        await (0, teammateMailbox_js_1.writeToMailbox)(leaderName, {
            from: request.workerName,
            text: (0, slowOperations_js_1.jsonStringify)(message),
            timestamp: new Date().toISOString(),
            color: request.workerColor,
        }, request.teamName);
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Sent permission request ${request.id} to leader ${leaderName} via mailbox`);
        return true;
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Failed to send permission request via mailbox: ${error}`);
        (0, log_js_1.logError)(error);
        return false;
    }
}
/**
 * Send a permission response to a worker via mailbox.
 * This is the new mailbox-based approach that replaces the file-based resolved directory.
 *
 * @param workerName - The worker's name to send the response to
 * @param resolution - The permission resolution
 * @param requestId - The original request ID
 * @param teamName - The team name
 * @returns true if the message was sent successfully
 */
async function sendPermissionResponseViaMailbox(workerName, resolution, requestId, teamName) {
    const team = teamName || (0, teammate_js_1.getTeamName)();
    if (!team) {
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Cannot send permission response: team name not found`);
        return false;
    }
    try {
        // Create the permission response message
        const message = (0, teammateMailbox_js_1.createPermissionResponseMessage)({
            request_id: requestId,
            subtype: resolution.decision === 'approved' ? 'success' : 'error',
            error: resolution.feedback,
            updated_input: resolution.updatedInput,
            permission_updates: resolution.permissionUpdates,
        });
        // Get the sender name (leader's name)
        const senderName = (0, teammate_js_1.getAgentName)() || 'team-lead';
        // Send to worker's mailbox (routes to in-process or file-based based on recipient)
        await (0, teammateMailbox_js_1.writeToMailbox)(workerName, {
            from: senderName,
            text: (0, slowOperations_js_1.jsonStringify)(message),
            timestamp: new Date().toISOString(),
        }, team);
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Sent permission response for ${requestId} to worker ${workerName} via mailbox`);
        return true;
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Failed to send permission response via mailbox: ${error}`);
        (0, log_js_1.logError)(error);
        return false;
    }
}
// ============================================================================
// Sandbox Permission Mailbox System
// ============================================================================
/**
 * Generate a unique sandbox permission request ID
 */
function generateSandboxRequestId() {
    return `sandbox-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
/**
 * Send a sandbox permission request to the leader via mailbox.
 * Called by workers when sandbox runtime needs network access approval.
 *
 * @param host - The host requesting network access
 * @param requestId - Unique ID for this request
 * @param teamName - Optional team name
 * @returns true if the message was sent successfully
 */
async function sendSandboxPermissionRequestViaMailbox(host, requestId, teamName) {
    const team = teamName || (0, teammate_js_1.getTeamName)();
    if (!team) {
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Cannot send sandbox permission request: team name not found`);
        return false;
    }
    const leaderName = await getLeaderName(team);
    if (!leaderName) {
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Cannot send sandbox permission request: leader name not found`);
        return false;
    }
    const workerId = (0, teammate_js_1.getAgentId)();
    const workerName = (0, teammate_js_1.getAgentName)();
    const workerColor = (0, teammate_js_1.getTeammateColor)();
    if (!workerId || !workerName) {
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Cannot send sandbox permission request: worker ID or name not found`);
        return false;
    }
    try {
        const message = (0, teammateMailbox_js_1.createSandboxPermissionRequestMessage)({
            requestId,
            workerId,
            workerName,
            workerColor,
            host,
        });
        // Send to leader's mailbox (routes to in-process or file-based based on recipient)
        await (0, teammateMailbox_js_1.writeToMailbox)(leaderName, {
            from: workerName,
            text: (0, slowOperations_js_1.jsonStringify)(message),
            timestamp: new Date().toISOString(),
            color: workerColor,
        }, team);
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Sent sandbox permission request ${requestId} for host ${host} to leader ${leaderName} via mailbox`);
        return true;
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Failed to send sandbox permission request via mailbox: ${error}`);
        (0, log_js_1.logError)(error);
        return false;
    }
}
/**
 * Send a sandbox permission response to a worker via mailbox.
 * Called by the leader when approving/denying a sandbox network access request.
 *
 * @param workerName - The worker's name to send the response to
 * @param requestId - The original request ID
 * @param host - The host that was approved/denied
 * @param allow - Whether the connection is allowed
 * @param teamName - Optional team name
 * @returns true if the message was sent successfully
 */
async function sendSandboxPermissionResponseViaMailbox(workerName, requestId, host, allow, teamName) {
    const team = teamName || (0, teammate_js_1.getTeamName)();
    if (!team) {
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Cannot send sandbox permission response: team name not found`);
        return false;
    }
    try {
        const message = (0, teammateMailbox_js_1.createSandboxPermissionResponseMessage)({
            requestId,
            host,
            allow,
        });
        const senderName = (0, teammate_js_1.getAgentName)() || 'team-lead';
        // Send to worker's mailbox (routes to in-process or file-based based on recipient)
        await (0, teammateMailbox_js_1.writeToMailbox)(workerName, {
            from: senderName,
            text: (0, slowOperations_js_1.jsonStringify)(message),
            timestamp: new Date().toISOString(),
        }, team);
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Sent sandbox permission response for ${requestId} (host: ${host}, allow: ${allow}) to worker ${workerName} via mailbox`);
        return true;
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`[PermissionSync] Failed to send sandbox permission response via mailbox: ${error}`);
        (0, log_js_1.logError)(error);
        return false;
    }
}
