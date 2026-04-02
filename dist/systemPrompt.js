"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asSystemPrompt = void 0;
exports.buildEffectiveSystemPrompt = buildEffectiveSystemPrompt;
const bun_bundle_1 = require("bun:bundle");
const index_js_1 = require("../services/analytics/index.js");
const loadAgentsDir_js_1 = require("../tools/AgentTool/loadAgentsDir.js");
const envUtils_js_1 = require("./envUtils.js");
const systemPromptType_js_1 = require("./systemPromptType.js");
var systemPromptType_js_2 = require("./systemPromptType.js");
Object.defineProperty(exports, "asSystemPrompt", { enumerable: true, get: function () { return systemPromptType_js_2.asSystemPrompt; } });
// Dead code elimination: conditional import for proactive mode.
// Same pattern as prompts.ts — lazy require to avoid pulling the module
// into non-proactive builds.
/* eslint-disable @typescript-eslint/no-require-imports */
const proactiveModule = (0, bun_bundle_1.feature)('PROACTIVE') || (0, bun_bundle_1.feature)('KAIROS')
    ? require('../proactive/index.js')
    : null;
/* eslint-enable @typescript-eslint/no-require-imports */
function isProactiveActive_SAFE_TO_CALL_ANYWHERE() {
    return proactiveModule?.isProactiveActive() ?? false;
}
/**
 * Builds the effective system prompt array based on priority:
 * 0. Override system prompt (if set, e.g., via loop mode - REPLACES all other prompts)
 * 1. Coordinator system prompt (if coordinator mode is active)
 * 2. Agent system prompt (if mainThreadAgentDefinition is set)
 *    - In proactive mode: agent prompt is APPENDED to default (agent adds domain
 *      instructions on top of the autonomous agent prompt, like teammates do)
 *    - Otherwise: agent prompt REPLACES default
 * 3. Custom system prompt (if specified via --system-prompt)
 * 4. Default system prompt (the standard Claude Code prompt)
 *
 * Plus appendSystemPrompt is always added at the end if specified (except when override is set).
 */
function buildEffectiveSystemPrompt({ mainThreadAgentDefinition, toolUseContext, customSystemPrompt, defaultSystemPrompt, appendSystemPrompt, overrideSystemPrompt, }) {
    if (overrideSystemPrompt) {
        return (0, systemPromptType_js_1.asSystemPrompt)([overrideSystemPrompt]);
    }
    // Coordinator mode: use coordinator prompt instead of default
    // Use inline env check instead of coordinatorModule to avoid circular
    // dependency issues during test module loading.
    if ((0, bun_bundle_1.feature)('COORDINATOR_MODE') &&
        (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_COORDINATOR_MODE) &&
        !mainThreadAgentDefinition) {
        // Lazy require to avoid circular dependency at module load time
        const { getCoordinatorSystemPrompt } = 
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../coordinator/coordinatorMode.js');
        return (0, systemPromptType_js_1.asSystemPrompt)([
            getCoordinatorSystemPrompt(),
            ...(appendSystemPrompt ? [appendSystemPrompt] : []),
        ]);
    }
    const agentSystemPrompt = mainThreadAgentDefinition
        ? (0, loadAgentsDir_js_1.isBuiltInAgent)(mainThreadAgentDefinition)
            ? mainThreadAgentDefinition.getSystemPrompt({
                toolUseContext: { options: toolUseContext.options },
            })
            : mainThreadAgentDefinition.getSystemPrompt()
        : undefined;
    // Log agent memory loaded event for main loop agents
    if (mainThreadAgentDefinition?.memory) {
        (0, index_js_1.logEvent)('tengu_agent_memory_loaded', {
            ...(process.env.USER_TYPE === 'ant' && {
                agent_type: mainThreadAgentDefinition.agentType,
            }),
            scope: mainThreadAgentDefinition.memory,
            source: 'main-thread',
        });
    }
    // In proactive mode, agent instructions are appended to the default prompt
    // rather than replacing it. The proactive default prompt is already lean
    // (autonomous agent identity + memory + env + proactive section), and agents
    // add domain-specific behavior on top — same pattern as teammates.
    if (agentSystemPrompt &&
        ((0, bun_bundle_1.feature)('PROACTIVE') || (0, bun_bundle_1.feature)('KAIROS')) &&
        isProactiveActive_SAFE_TO_CALL_ANYWHERE()) {
        return (0, systemPromptType_js_1.asSystemPrompt)([
            ...defaultSystemPrompt,
            `\n# Custom Agent Instructions\n${agentSystemPrompt}`,
            ...(appendSystemPrompt ? [appendSystemPrompt] : []),
        ]);
    }
    return (0, systemPromptType_js_1.asSystemPrompt)([
        ...(agentSystemPrompt
            ? [agentSystemPrompt]
            : customSystemPrompt
                ? [customSystemPrompt]
                : defaultSystemPrompt),
        ...(appendSystemPrompt ? [appendSystemPrompt] : []),
    ]);
}
