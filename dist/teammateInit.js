"use strict";
/**
 * Teammate Initialization Module
 *
 * Handles initialization for Claude Code instances running as teammates in a swarm.
 * Registers a Stop hook to notify the team leader when the teammate becomes idle.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeTeammateHooks = initializeTeammateHooks;
const debug_js_1 = require("../debug.js");
const sessionHooks_js_1 = require("../hooks/sessionHooks.js");
const PermissionUpdate_js_1 = require("../permissions/PermissionUpdate.js");
const slowOperations_js_1 = require("../slowOperations.js");
const teammate_js_1 = require("../teammate.js");
const teammateMailbox_js_1 = require("../teammateMailbox.js");
const teamHelpers_js_1 = require("./teamHelpers.js");
/**
 * Initializes hooks for a teammate running in a swarm.
 * Should be called early in session startup after AppState is available.
 *
 * Registers a Stop hook that sends an idle notification to the team leader
 * when this teammate's session stops.
 */
function initializeTeammateHooks(setAppState, sessionId, teamInfo) {
    const { teamName, agentId, agentName } = teamInfo;
    // Read team file to get leader ID
    const teamFile = (0, teamHelpers_js_1.readTeamFile)(teamName);
    if (!teamFile) {
        (0, debug_js_1.logForDebugging)(`[TeammateInit] Team file not found for team: ${teamName}`);
        return;
    }
    const leadAgentId = teamFile.leadAgentId;
    // Apply team-wide allowed paths if any exist
    if (teamFile.teamAllowedPaths && teamFile.teamAllowedPaths.length > 0) {
        (0, debug_js_1.logForDebugging)(`[TeammateInit] Found ${teamFile.teamAllowedPaths.length} team-wide allowed path(s)`);
        for (const allowedPath of teamFile.teamAllowedPaths) {
            // For absolute paths (starting with /), prepend one / to create //path/** pattern
            // For relative paths, just use path/**
            const ruleContent = allowedPath.path.startsWith('/')
                ? `/${allowedPath.path}/**`
                : `${allowedPath.path}/**`;
            (0, debug_js_1.logForDebugging)(`[TeammateInit] Applying team permission: ${allowedPath.toolName} allowed in ${allowedPath.path} (rule: ${ruleContent})`);
            setAppState(prev => ({
                ...prev,
                toolPermissionContext: (0, PermissionUpdate_js_1.applyPermissionUpdate)(prev.toolPermissionContext, {
                    type: 'addRules',
                    rules: [
                        {
                            toolName: allowedPath.toolName,
                            ruleContent,
                        },
                    ],
                    behavior: 'allow',
                    destination: 'session',
                }),
            }));
        }
    }
    // Find the leader's name from the members array
    const leadMember = teamFile.members.find(m => m.agentId === leadAgentId);
    const leadAgentName = leadMember?.name || 'team-lead';
    // Don't register hook if this agent is the leader
    if (agentId === leadAgentId) {
        (0, debug_js_1.logForDebugging)('[TeammateInit] This agent is the team leader - skipping idle notification hook');
        return;
    }
    (0, debug_js_1.logForDebugging)(`[TeammateInit] Registering Stop hook for teammate ${agentName} to notify leader ${leadAgentName}`);
    // Register Stop hook to notify leader when this teammate stops
    (0, sessionHooks_js_1.addFunctionHook)(setAppState, sessionId, 'Stop', '', // No matcher - applies to all Stop events
    async (messages, _signal) => {
        // Mark this teammate as idle in the team config (fire and forget)
        void (0, teamHelpers_js_1.setMemberActive)(teamName, agentName, false);
        // Send idle notification to the team leader using agent name (not UUID)
        // Must await to ensure the write completes before process shutdown
        const notification = (0, teammateMailbox_js_1.createIdleNotification)(agentName, {
            idleReason: 'available',
            summary: (0, teammateMailbox_js_1.getLastPeerDmSummary)(messages),
        });
        await (0, teammateMailbox_js_1.writeToMailbox)(leadAgentName, {
            from: agentName,
            text: (0, slowOperations_js_1.jsonStringify)(notification),
            timestamp: new Date().toISOString(),
            color: (0, teammate_js_1.getTeammateColor)(),
        });
        (0, debug_js_1.logForDebugging)(`[TeammateInit] Sent idle notification to leader ${leadAgentName}`);
        return true; // Don't block the Stop
    }, 'Failed to send idle notification to team leader', {
        timeout: 10000,
    });
}
