"use strict";
/**
 * Shared utilities for displaying agent information.
 * Used by both the CLI `claude agents` handler and the interactive `/agents` command.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_SOURCE_GROUPS = void 0;
exports.resolveAgentOverrides = resolveAgentOverrides;
exports.resolveAgentModelDisplay = resolveAgentModelDisplay;
exports.getOverrideSourceLabel = getOverrideSourceLabel;
exports.compareAgentsByName = compareAgentsByName;
const agent_js_1 = require("../../utils/model/agent.js");
const constants_js_1 = require("../../utils/settings/constants.js");
/**
 * Ordered list of agent source groups for display.
 * Both the CLI and interactive UI should use this to ensure consistent ordering.
 */
exports.AGENT_SOURCE_GROUPS = [
    { label: 'User agents', source: 'userSettings' },
    { label: 'Project agents', source: 'projectSettings' },
    { label: 'Local agents', source: 'localSettings' },
    { label: 'Managed agents', source: 'policySettings' },
    { label: 'Plugin agents', source: 'plugin' },
    { label: 'CLI arg agents', source: 'flagSettings' },
    { label: 'Built-in agents', source: 'built-in' },
];
/**
 * Annotate agents with override information by comparing against the active
 * (winning) agent list. An agent is "overridden" when another agent with the
 * same type from a higher-priority source takes precedence.
 *
 * Also deduplicates by (agentType, source) to handle git worktree duplicates
 * where the same agent file is loaded from both the worktree and main repo.
 */
function resolveAgentOverrides(allAgents, activeAgents) {
    const activeMap = new Map();
    for (const agent of activeAgents) {
        activeMap.set(agent.agentType, agent);
    }
    const seen = new Set();
    const resolved = [];
    // Iterate allAgents, annotating each with override info from activeAgents.
    // Deduplicate by (agentType, source) to handle git worktree duplicates.
    for (const agent of allAgents) {
        const key = `${agent.agentType}:${agent.source}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        const active = activeMap.get(agent.agentType);
        const overriddenBy = active && active.source !== agent.source ? active.source : undefined;
        resolved.push({ ...agent, overriddenBy });
    }
    return resolved;
}
/**
 * Resolve the display model string for an agent.
 * Returns the model alias or 'inherit' for display purposes.
 */
function resolveAgentModelDisplay(agent) {
    const model = agent.model || (0, agent_js_1.getDefaultSubagentModel)();
    if (!model)
        return undefined;
    return model === 'inherit' ? 'inherit' : model;
}
/**
 * Get a human-readable label for the source that overrides an agent.
 * Returns lowercase, e.g. "user", "project", "managed".
 */
function getOverrideSourceLabel(source) {
    return (0, constants_js_1.getSourceDisplayName)(source).toLowerCase();
}
/**
 * Compare agents alphabetically by name (case-insensitive).
 */
function compareAgentsByName(a, b) {
    return a.agentType.localeCompare(b.agentType, undefined, {
        sensitivity: 'base',
    });
}
