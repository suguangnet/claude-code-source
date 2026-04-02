"use strict";
/**
 * Standalone agent utilities for sessions with custom names/colors
 *
 * These helpers provide access to standalone agent context (name and color)
 * for sessions that are NOT part of a swarm team. When a session is part
 * of a swarm, these functions return undefined to let swarm context take
 * precedence.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStandaloneAgentName = getStandaloneAgentName;
const teammate_js_1 = require("./teammate.js");
/**
 * Returns the standalone agent name if set and not a swarm teammate.
 * Uses getTeamName() for consistency with isTeammate() swarm detection.
 */
function getStandaloneAgentName(appState) {
    // If in a team (swarm), don't return standalone name
    if ((0, teammate_js_1.getTeamName)()) {
        return undefined;
    }
    return appState.standaloneAgentContext?.name;
}
