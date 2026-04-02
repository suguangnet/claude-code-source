"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_MODEL_OPTIONS = void 0;
exports.getDefaultSubagentModel = getDefaultSubagentModel;
exports.getAgentModel = getAgentModel;
exports.getAgentModelDisplay = getAgentModelDisplay;
exports.getAgentModelOptions = getAgentModelOptions;
const stringUtils_js_1 = require("../stringUtils.js");
const aliases_js_1 = require("./aliases.js");
const bedrock_js_1 = require("./bedrock.js");
const model_js_1 = require("./model.js");
const providers_js_1 = require("./providers.js");
exports.AGENT_MODEL_OPTIONS = [...aliases_js_1.MODEL_ALIASES, 'inherit'];
/**
 * Get the default subagent model. Returns 'inherit' so subagents inherit
 * the model from the parent thread.
 */
function getDefaultSubagentModel() {
    return 'inherit';
}
/**
 * Get the effective model string for an agent.
 *
 * For Bedrock, if the parent model uses a cross-region inference prefix (e.g., "eu.", "us."),
 * that prefix is inherited by subagents using alias models (e.g., "sonnet", "haiku", "opus").
 * This ensures subagents use the same region as the parent, which is necessary when
 * IAM permissions are scoped to specific cross-region inference profiles.
 */
function getAgentModel(agentModel, parentModel, toolSpecifiedModel, permissionMode) {
    if (process.env.CLAUDE_CODE_SUBAGENT_MODEL) {
        return (0, model_js_1.parseUserSpecifiedModel)(process.env.CLAUDE_CODE_SUBAGENT_MODEL);
    }
    // Extract Bedrock region prefix from parent model to inherit for subagents.
    // This ensures subagents use the same cross-region inference profile (e.g., "eu.", "us.")
    // as the parent, which is required when IAM permissions only allow specific regions.
    const parentRegionPrefix = (0, bedrock_js_1.getBedrockRegionPrefix)(parentModel);
    // Helper to apply parent region prefix for Bedrock models.
    // `originalSpec` is the raw model string before resolution (alias or full ID).
    // If the user explicitly specified a full model ID that already carries its own
    // region prefix (e.g., "eu.anthropic.…"), we preserve it instead of overwriting
    // with the parent's prefix. This prevents silent data-residency violations when
    // an agent config intentionally pins to a different region than the parent.
    const applyParentRegionPrefix = (resolvedModel, originalSpec) => {
        if (parentRegionPrefix && (0, providers_js_1.getAPIProvider)() === 'bedrock') {
            if ((0, bedrock_js_1.getBedrockRegionPrefix)(originalSpec))
                return resolvedModel;
            return (0, bedrock_js_1.applyBedrockRegionPrefix)(resolvedModel, parentRegionPrefix);
        }
        return resolvedModel;
    };
    // Prioritize tool-specified model if provided
    if (toolSpecifiedModel) {
        if (aliasMatchesParentTier(toolSpecifiedModel, parentModel)) {
            return parentModel;
        }
        const model = (0, model_js_1.parseUserSpecifiedModel)(toolSpecifiedModel);
        return applyParentRegionPrefix(model, toolSpecifiedModel);
    }
    const agentModelWithExp = agentModel ?? getDefaultSubagentModel();
    if (agentModelWithExp === 'inherit') {
        // Apply runtime model resolution for inherit to get the effective model
        // This ensures agents using 'inherit' get opusplan→Opus resolution in plan mode
        return (0, model_js_1.getRuntimeMainLoopModel)({
            permissionMode: permissionMode ?? 'default',
            mainLoopModel: parentModel,
            exceeds200kTokens: false,
        });
    }
    if (aliasMatchesParentTier(agentModelWithExp, parentModel)) {
        return parentModel;
    }
    const model = (0, model_js_1.parseUserSpecifiedModel)(agentModelWithExp);
    return applyParentRegionPrefix(model, agentModelWithExp);
}
/**
 * Check if a bare family alias (opus/sonnet/haiku) matches the parent model's
 * tier. When it does, the subagent inherits the parent's exact model string
 * instead of resolving the alias to a provider default.
 *
 * Prevents surprising downgrades: a Vertex user on Opus 4.6 (via /model) who
 * spawns a subagent with `model: opus` should get Opus 4.6, not whatever
 * getDefaultOpusModel() returns for 3P.
 * See https://github.com/anthropics/claude-code/issues/30815.
 *
 * Only bare family aliases match. `opus[1m]`, `best`, `opusplan` fall through
 * since they carry semantics beyond "same tier as parent".
 */
function aliasMatchesParentTier(alias, parentModel) {
    const canonical = (0, model_js_1.getCanonicalName)(parentModel);
    switch (alias.toLowerCase()) {
        case 'opus':
            return canonical.includes('opus');
        case 'sonnet':
            return canonical.includes('sonnet');
        case 'haiku':
            return canonical.includes('haiku');
        default:
            return false;
    }
}
function getAgentModelDisplay(model) {
    // When model is omitted, getDefaultSubagentModel() returns 'inherit' at runtime
    if (!model)
        return 'Inherit from parent (default)';
    if (model === 'inherit')
        return 'Inherit from parent';
    return (0, stringUtils_js_1.capitalize)(model);
}
/**
 * Get available model options for agents
 */
function getAgentModelOptions() {
    return [
        {
            value: 'sonnet',
            label: 'Sonnet',
            description: 'Balanced performance - best for most agents',
        },
        {
            value: 'opus',
            label: 'Opus',
            description: 'Most capable for complex reasoning tasks',
        },
        {
            value: 'haiku',
            label: 'Haiku',
            description: 'Fast and efficient for simple tasks',
        },
        {
            value: 'inherit',
            label: 'Inherit from parent',
            description: 'Use the same model as the main conversation',
        },
    ];
}
