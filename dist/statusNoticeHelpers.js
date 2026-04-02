"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_DESCRIPTIONS_THRESHOLD = void 0;
exports.getAgentDescriptionsTotalTokens = getAgentDescriptionsTotalTokens;
const tokenEstimation_js_1 = require("../services/tokenEstimation.js");
exports.AGENT_DESCRIPTIONS_THRESHOLD = 15000;
/**
 * Calculate cumulative token estimate for agent descriptions
 */
function getAgentDescriptionsTotalTokens(agentDefinitions) {
    if (!agentDefinitions)
        return 0;
    return agentDefinitions.activeAgents
        .filter(a => a.source !== 'built-in')
        .reduce((total, agent) => {
        const description = `${agent.agentType}: ${agent.whenToUse}`;
        return total + (0, tokenEstimation_js_1.roughTokenCountEstimation)(description);
    }, 0);
}
