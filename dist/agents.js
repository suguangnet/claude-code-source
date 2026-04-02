"use strict";
/**
 * Agents subcommand handler — prints the list of configured agents.
 * Dynamically imported only when `claude agents` runs.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentsHandler = agentsHandler;
const agentDisplay_js_1 = require("../../tools/AgentTool/agentDisplay.js");
const loadAgentsDir_js_1 = require("../../tools/AgentTool/loadAgentsDir.js");
const cwd_js_1 = require("../../utils/cwd.js");
function formatAgent(agent) {
    const model = (0, agentDisplay_js_1.resolveAgentModelDisplay)(agent);
    const parts = [agent.agentType];
    if (model) {
        parts.push(model);
    }
    if (agent.memory) {
        parts.push(`${agent.memory} memory`);
    }
    return parts.join(' · ');
}
async function agentsHandler() {
    const cwd = (0, cwd_js_1.getCwd)();
    const { allAgents } = await (0, loadAgentsDir_js_1.getAgentDefinitionsWithOverrides)(cwd);
    const activeAgents = (0, loadAgentsDir_js_1.getActiveAgentsFromList)(allAgents);
    const resolvedAgents = (0, agentDisplay_js_1.resolveAgentOverrides)(allAgents, activeAgents);
    const lines = [];
    let totalActive = 0;
    for (const { label, source } of agentDisplay_js_1.AGENT_SOURCE_GROUPS) {
        const groupAgents = resolvedAgents
            .filter(a => a.source === source)
            .sort(agentDisplay_js_1.compareAgentsByName);
        if (groupAgents.length === 0)
            continue;
        lines.push(`${label}:`);
        for (const agent of groupAgents) {
            if (agent.overriddenBy) {
                const winnerSource = (0, agentDisplay_js_1.getOverrideSourceLabel)(agent.overriddenBy);
                lines.push(`  (shadowed by ${winnerSource}) ${formatAgent(agent)}`);
            }
            else {
                lines.push(`  ${formatAgent(agent)}`);
                totalActive++;
            }
        }
        lines.push('');
    }
    if (lines.length === 0) {
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.log('No agents found.');
    }
    else {
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.log(`${totalActive} active agents\n`);
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.log(lines.join('\n').trimEnd());
    }
}
