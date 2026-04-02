"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSkillImprovement = initSkillImprovement;
exports.applySkillImprovement = applySkillImprovement;
const bun_bundle_1 = require("bun:bundle");
const state_js_1 = require("../../bootstrap/state.js");
const growthbook_js_1 = require("../../services/analytics/growthbook.js");
const index_js_1 = require("../../services/analytics/index.js");
const claude_js_1 = require("../../services/api/claude.js");
const Tool_js_1 = require("../../Tool.js");
const abortController_js_1 = require("../abortController.js");
const array_js_1 = require("../array.js");
const cwd_js_1 = require("../cwd.js");
const errors_js_1 = require("../errors.js");
const log_js_1 = require("../log.js");
const messages_js_1 = require("../messages.js");
const model_js_1 = require("../model/model.js");
const slowOperations_js_1 = require("../slowOperations.js");
const systemPromptType_js_1 = require("../systemPromptType.js");
const apiQueryHookHelper_js_1 = require("./apiQueryHookHelper.js");
const postSamplingHooks_js_1 = require("./postSamplingHooks.js");
const TURN_BATCH_SIZE = 5;
function formatRecentMessages(messages) {
    return messages
        .filter(m => m.type === 'user' || m.type === 'assistant')
        .map(m => {
        const role = m.type === 'user' ? 'User' : 'Assistant';
        const content = m.message.content;
        if (typeof content === 'string')
            return `${role}: ${content.slice(0, 500)}`;
        const text = content
            .filter((b) => b.type === 'text')
            .map(b => b.text)
            .join('\n');
        return `${role}: ${text.slice(0, 500)}`;
    })
        .join('\n\n');
}
function findProjectSkill() {
    const skills = (0, state_js_1.getInvokedSkillsForAgent)(null);
    for (const [, info] of skills) {
        if (info.skillPath.startsWith('projectSettings:')) {
            return info;
        }
    }
    return undefined;
}
function createSkillImprovementHook() {
    let lastAnalyzedCount = 0;
    let lastAnalyzedIndex = 0;
    const config = {
        name: 'skill_improvement',
        async shouldRun(context) {
            if (context.querySource !== 'repl_main_thread') {
                return false;
            }
            if (!findProjectSkill()) {
                return false;
            }
            // Only run every TURN_BATCH_SIZE user messages
            const userCount = (0, array_js_1.count)(context.messages, m => m.type === 'user');
            if (userCount - lastAnalyzedCount < TURN_BATCH_SIZE) {
                return false;
            }
            lastAnalyzedCount = userCount;
            return true;
        },
        buildMessages(context) {
            const projectSkill = findProjectSkill();
            // Only analyze messages since the last check — the skill definition
            // provides enough context for the classifier to understand corrections
            const newMessages = context.messages.slice(lastAnalyzedIndex);
            lastAnalyzedIndex = context.messages.length;
            return [
                (0, messages_js_1.createUserMessage)({
                    content: `You are analyzing a conversation where a user is executing a skill (a repeatable process).
Your job: identify if the user's recent messages contain preferences, requests, or corrections that should be permanently added to the skill definition for future runs.

<skill_definition>
${projectSkill.content}
</skill_definition>

<recent_messages>
${formatRecentMessages(newMessages)}
</recent_messages>

Look for:
- Requests to add, change, or remove steps: "can you also ask me X", "please do Y too", "don't do Z"
- Preferences about how steps should work: "ask me about energy levels", "note the time", "use a casual tone"
- Corrections: "no, do X instead", "always use Y", "make sure to..."

Ignore:
- Routine conversation that doesn't generalize (one-time answers, chitchat)
- Things the skill already does

Output a JSON array inside <updates> tags. Each item: {"section": "which step/section to modify or 'new step'", "change": "what to add/modify", "reason": "which user message prompted this"}.
Output <updates>[]</updates> if no updates are needed.`,
                }),
            ];
        },
        systemPrompt: 'You detect user preferences and process improvements during skill execution. Flag anything the user asks for that should be remembered for next time.',
        useTools: false,
        parseResponse(content) {
            const updatesStr = (0, messages_js_1.extractTag)(content, 'updates');
            if (!updatesStr) {
                return [];
            }
            try {
                return (0, slowOperations_js_1.jsonParse)(updatesStr);
            }
            catch {
                return [];
            }
        },
        logResult(result, context) {
            if (result.type === 'success' && result.result.length > 0) {
                const projectSkill = findProjectSkill();
                const skillName = projectSkill?.skillName ?? 'unknown';
                (0, index_js_1.logEvent)('tengu_skill_improvement_detected', {
                    updateCount: result.result
                        .length,
                    uuid: result.uuid,
                    // _PROTO_skill_name routes to the privileged skill_name BQ column.
                    _PROTO_skill_name: skillName,
                });
                context.toolUseContext.setAppState(prev => ({
                    ...prev,
                    skillImprovement: {
                        suggestion: { skillName, updates: result.result },
                    },
                }));
            }
        },
        getModel: model_js_1.getSmallFastModel,
    };
    return (0, apiQueryHookHelper_js_1.createApiQueryHook)(config);
}
function initSkillImprovement() {
    if ((0, bun_bundle_1.feature)('SKILL_IMPROVEMENT') &&
        (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_copper_panda', false)) {
        (0, postSamplingHooks_js_1.registerPostSamplingHook)(createSkillImprovementHook());
    }
}
/**
 * Apply skill improvements by calling a side-channel LLM to rewrite the skill file.
 * Fire-and-forget — does not block the main conversation.
 */
async function applySkillImprovement(skillName, updates) {
    if (!skillName)
        return;
    const { join } = await Promise.resolve().then(() => __importStar(require('path')));
    const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
    // Skills live at .claude/skills/<name>/SKILL.md relative to CWD
    const filePath = join((0, cwd_js_1.getCwd)(), '.claude', 'skills', skillName, 'SKILL.md');
    let currentContent;
    try {
        currentContent = await fs.readFile(filePath, 'utf-8');
    }
    catch {
        (0, log_js_1.logError)(new Error(`Failed to read skill file for improvement: ${filePath}`));
        return;
    }
    const updateList = updates.map(u => `- ${u.section}: ${u.change}`).join('\n');
    const response = await (0, claude_js_1.queryModelWithoutStreaming)({
        messages: [
            (0, messages_js_1.createUserMessage)({
                content: `You are editing a skill definition file. Apply the following improvements to the skill.

<current_skill_file>
${currentContent}
</current_skill_file>

<improvements>
${updateList}
</improvements>

Rules:
- Integrate the improvements naturally into the existing structure
- Preserve frontmatter (--- block) exactly as-is
- Preserve the overall format and style
- Do not remove existing content unless an improvement explicitly replaces it
- Output the complete updated file inside <updated_file> tags`,
            }),
        ],
        systemPrompt: (0, systemPromptType_js_1.asSystemPrompt)([
            'You edit skill definition files to incorporate user preferences. Output only the updated file content.',
        ]),
        thinkingConfig: { type: 'disabled' },
        tools: [],
        signal: (0, abortController_js_1.createAbortController)().signal,
        options: {
            getToolPermissionContext: async () => (0, Tool_js_1.getEmptyToolPermissionContext)(),
            model: (0, model_js_1.getSmallFastModel)(),
            toolChoice: undefined,
            isNonInteractiveSession: false,
            hasAppendSystemPrompt: false,
            temperatureOverride: 0,
            agents: [],
            querySource: 'skill_improvement_apply',
            mcpTools: [],
        },
    });
    const responseText = (0, messages_js_1.extractTextContent)(response.message.content).trim();
    const updatedContent = (0, messages_js_1.extractTag)(responseText, 'updated_file');
    if (!updatedContent) {
        (0, log_js_1.logError)(new Error('Skill improvement apply: no updated_file tag in response'));
        return;
    }
    try {
        await fs.writeFile(filePath, updatedContent, 'utf-8');
    }
    catch (e) {
        (0, log_js_1.logError)((0, errors_js_1.toError)(e));
    }
}
