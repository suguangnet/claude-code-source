"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnterPlanModeTool = void 0;
const bun_bundle_1 = require("bun:bundle");
const v4_1 = require("zod/v4");
const state_js_1 = require("../../bootstrap/state.js");
const Tool_js_1 = require("../../Tool.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const PermissionUpdate_js_1 = require("../../utils/permissions/PermissionUpdate.js");
const permissionSetup_js_1 = require("../../utils/permissions/permissionSetup.js");
const planModeV2_js_1 = require("../../utils/planModeV2.js");
const constants_js_1 = require("./constants.js");
const prompt_js_1 = require("./prompt.js");
const UI_js_1 = require("./UI.js");
const inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.strictObject({
// No parameters needed
}));
const outputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    message: v4_1.z.string().describe('Confirmation that plan mode was entered'),
}));
exports.EnterPlanModeTool = (0, Tool_js_1.buildTool)({
    name: constants_js_1.ENTER_PLAN_MODE_TOOL_NAME,
    searchHint: 'switch to plan mode to design an approach before coding',
    maxResultSizeChars: 100000,
    async description() {
        return 'Requests permission to enter plan mode for complex tasks requiring exploration and design';
    },
    async prompt() {
        return (0, prompt_js_1.getEnterPlanModeToolPrompt)();
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    userFacingName() {
        return '';
    },
    shouldDefer: true,
    isEnabled() {
        // When --channels is active, ExitPlanMode is disabled (its approval
        // dialog needs the terminal). Disable entry too so plan mode isn't a
        // trap the model can enter but never leave.
        if (((0, bun_bundle_1.feature)('KAIROS') || (0, bun_bundle_1.feature)('KAIROS_CHANNELS')) &&
            (0, state_js_1.getAllowedChannels)().length > 0) {
            return false;
        }
        return true;
    },
    isConcurrencySafe() {
        return true;
    },
    isReadOnly() {
        return true;
    },
    renderToolUseMessage: UI_js_1.renderToolUseMessage,
    renderToolResultMessage: UI_js_1.renderToolResultMessage,
    renderToolUseRejectedMessage: UI_js_1.renderToolUseRejectedMessage,
    async call(_input, context) {
        if (context.agentId) {
            throw new Error('EnterPlanMode tool cannot be used in agent contexts');
        }
        const appState = context.getAppState();
        (0, state_js_1.handlePlanModeTransition)(appState.toolPermissionContext.mode, 'plan');
        // Update the permission mode to 'plan'. prepareContextForPlanMode runs
        // the classifier activation side effects when the user's defaultMode is
        // 'auto' — see permissionSetup.ts for the full lifecycle.
        context.setAppState(prev => ({
            ...prev,
            toolPermissionContext: (0, PermissionUpdate_js_1.applyPermissionUpdate)((0, permissionSetup_js_1.prepareContextForPlanMode)(prev.toolPermissionContext), { type: 'setMode', mode: 'plan', destination: 'session' }),
        }));
        return {
            data: {
                message: 'Entered plan mode. You should now focus on exploring the codebase and designing an implementation approach.',
            },
        };
    },
    mapToolResultToToolResultBlockParam({ message }, toolUseID) {
        const instructions = (0, planModeV2_js_1.isPlanModeInterviewPhaseEnabled)()
            ? `${message}

DO NOT write or edit any files except the plan file. Detailed workflow instructions will follow.`
            : `${message}

In plan mode, you should:
1. Thoroughly explore the codebase to understand existing patterns
2. Identify similar features and architectural approaches
3. Consider multiple approaches and their trade-offs
4. Use AskUserQuestion if you need to clarify the approach
5. Design a concrete implementation strategy
6. When ready, use ExitPlanMode to present your plan for approval

Remember: DO NOT write or edit any files yet. This is a read-only exploration and planning phase.`;
        return {
            type: 'tool_result',
            content: instructions,
            tool_use_id: toolUseID,
        };
    },
});
