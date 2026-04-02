"use strict";
/**
 * Swarm Initialization Hook
 *
 * Initializes swarm features: teammate hooks and context.
 * Handles both fresh spawns and resumed teammate sessions.
 *
 * This hook is conditionally loaded to allow dead code elimination when swarms are disabled.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSwarmInitialization = useSwarmInitialization;
const react_1 = require("react");
const state_js_1 = require("../bootstrap/state.js");
const agentSwarmsEnabled_js_1 = require("../utils/agentSwarmsEnabled.js");
const reconnection_js_1 = require("../utils/swarm/reconnection.js");
const teamHelpers_js_1 = require("../utils/swarm/teamHelpers.js");
const teammateInit_js_1 = require("../utils/swarm/teammateInit.js");
const teammate_js_1 = require("../utils/teammate.js");
/**
 * Hook that initializes swarm features when ENABLE_AGENT_SWARMS is true.
 *
 * Handles both:
 * - Resumed teammate sessions (from --resume or /resume) where teamName/agentName
 *   are stored in transcript messages
 * - Fresh spawns where context is read from environment variables
 */
function useSwarmInitialization(setAppState, initialMessages, { enabled = true } = {}) {
    (0, react_1.useEffect)(() => {
        if (!enabled)
            return;
        if ((0, agentSwarmsEnabled_js_1.isAgentSwarmsEnabled)()) {
            // Check if this is a resumed agent session (from --resume or /resume)
            // Resumed sessions have teamName/agentName stored in transcript messages
            const firstMessage = initialMessages?.[0];
            const teamName = firstMessage && 'teamName' in firstMessage
                ? firstMessage.teamName
                : undefined;
            const agentName = firstMessage && 'agentName' in firstMessage
                ? firstMessage.agentName
                : undefined;
            if (teamName && agentName) {
                // Resumed agent session - set up team context from stored info
                (0, reconnection_js_1.initializeTeammateContextFromSession)(setAppState, teamName, agentName);
                // Get agentId from team file for hook initialization
                const teamFile = (0, teamHelpers_js_1.readTeamFile)(teamName);
                const member = teamFile?.members.find((m) => m.name === agentName);
                if (member) {
                    (0, teammateInit_js_1.initializeTeammateHooks)(setAppState, (0, state_js_1.getSessionId)(), {
                        teamName,
                        agentId: member.agentId,
                        agentName,
                    });
                }
            }
            else {
                // Fresh spawn or standalone session
                // teamContext is already computed in main.tsx via computeInitialTeamContext()
                // and included in initialState, so we only need to initialize hooks here
                const context = (0, teammate_js_1.getDynamicTeamContext)?.();
                if (context?.teamName && context?.agentId && context?.agentName) {
                    (0, teammateInit_js_1.initializeTeammateHooks)(setAppState, (0, state_js_1.getSessionId)(), {
                        teamName: context.teamName,
                        agentId: context.agentId,
                        agentName: context.agentName,
                    });
                }
            }
        }
    }, [setAppState, initialMessages, enabled]);
}
