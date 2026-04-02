"use strict";
/**
 * Team Discovery - Utilities for discovering teams and teammate status
 *
 * Scans ~/.claude/teams/ to find teams where the current session is the leader.
 * Used by the Teams UI in the footer to show team status.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTeammateStatuses = getTeammateStatuses;
const types_js_1 = require("./swarm/backends/types.js");
const teamHelpers_js_1 = require("./swarm/teamHelpers.js");
/**
 * Get detailed teammate statuses for a team
 * Reads isActive from config to determine status
 */
function getTeammateStatuses(teamName) {
    const teamFile = (0, teamHelpers_js_1.readTeamFile)(teamName);
    if (!teamFile) {
        return [];
    }
    const hiddenPaneIds = new Set(teamFile.hiddenPaneIds ?? []);
    const statuses = [];
    for (const member of teamFile.members) {
        // Exclude team-lead from the list
        if (member.name === 'team-lead') {
            continue;
        }
        // Read isActive from config, defaulting to true (active) if undefined
        const isActive = member.isActive !== false;
        const status = isActive ? 'running' : 'idle';
        statuses.push({
            name: member.name,
            agentId: member.agentId,
            agentType: member.agentType,
            model: member.model,
            prompt: member.prompt,
            status,
            color: member.color,
            tmuxPaneId: member.tmuxPaneId,
            cwd: member.cwd,
            worktreePath: member.worktreePath,
            isHidden: hiddenPaneIds.has(member.tmuxPaneId),
            backendType: member.backendType && (0, types_js_1.isPaneBackend)(member.backendType)
                ? member.backendType
                : undefined,
            mode: member.mode,
        });
    }
    return statuses;
}
// Note: For time formatting, use formatRelativeTimeAgo from '../utils/format.js'
