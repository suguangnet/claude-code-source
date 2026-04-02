"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.call = call;
const state_js_1 = require("../../bootstrap/state.js");
const agentColorManager_js_1 = require("../../tools/AgentTool/agentColorManager.js");
const sessionStorage_js_1 = require("../../utils/sessionStorage.js");
const teammate_js_1 = require("../../utils/teammate.js");
const RESET_ALIASES = ['default', 'reset', 'none', 'gray', 'grey'];
async function call(onDone, context, args) {
    // Teammates cannot set their own color
    if ((0, teammate_js_1.isTeammate)()) {
        onDone('Cannot set color: This session is a swarm teammate. Teammate colors are assigned by the team leader.', { display: 'system' });
        return null;
    }
    if (!args || args.trim() === '') {
        const colorList = agentColorManager_js_1.AGENT_COLORS.join(', ');
        onDone(`Please provide a color. Available colors: ${colorList}, default`, {
            display: 'system',
        });
        return null;
    }
    const colorArg = args.trim().toLowerCase();
    // Handle reset to default (gray)
    if (RESET_ALIASES.includes(colorArg)) {
        const sessionId = (0, state_js_1.getSessionId)();
        const fullPath = (0, sessionStorage_js_1.getTranscriptPath)();
        // Use "default" sentinel (not empty string) so truthiness guards
        // in sessionStorage.ts persist the reset across session restarts
        await (0, sessionStorage_js_1.saveAgentColor)(sessionId, 'default', fullPath);
        context.setAppState(prev => ({
            ...prev,
            standaloneAgentContext: {
                ...prev.standaloneAgentContext,
                name: prev.standaloneAgentContext?.name ?? '',
                color: undefined,
            },
        }));
        onDone('Session color reset to default', { display: 'system' });
        return null;
    }
    if (!agentColorManager_js_1.AGENT_COLORS.includes(colorArg)) {
        const colorList = agentColorManager_js_1.AGENT_COLORS.join(', ');
        onDone(`Invalid color "${colorArg}". Available colors: ${colorList}, default`, { display: 'system' });
        return null;
    }
    const sessionId = (0, state_js_1.getSessionId)();
    const fullPath = (0, sessionStorage_js_1.getTranscriptPath)();
    // Save to transcript for persistence across sessions
    await (0, sessionStorage_js_1.saveAgentColor)(sessionId, colorArg, fullPath);
    // Update AppState for immediate effect
    context.setAppState(prev => ({
        ...prev,
        standaloneAgentContext: {
            ...prev.standaloneAgentContext,
            name: prev.standaloneAgentContext?.name ?? '',
            color: colorArg,
        },
    }));
    onDone(`Session color set to: ${colorArg}`, { display: 'system' });
    return null;
}
