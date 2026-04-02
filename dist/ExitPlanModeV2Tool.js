"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExitPlanModeV2Tool = exports.outputSchema = exports._sdkInputSchema = void 0;
const bun_bundle_1 = require("bun:bundle");
const promises_1 = require("fs/promises");
const v4_1 = require("zod/v4");
const state_js_1 = require("../../bootstrap/state.js");
const index_js_1 = require("../../services/analytics/index.js");
const Tool_js_1 = require("../../Tool.js");
const agentId_js_1 = require("../../utils/agentId.js");
const agentSwarmsEnabled_js_1 = require("../../utils/agentSwarmsEnabled.js");
const debug_js_1 = require("../../utils/debug.js");
const inProcessTeammateHelpers_js_1 = require("../../utils/inProcessTeammateHelpers.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const log_js_1 = require("../../utils/log.js");
const plans_js_1 = require("../../utils/plans.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const teammate_js_1 = require("../../utils/teammate.js");
const teammateMailbox_js_1 = require("../../utils/teammateMailbox.js");
const constants_js_1 = require("../AgentTool/constants.js");
const constants_js_2 = require("../TeamCreateTool/constants.js");
const constants_js_3 = require("./constants.js");
const prompt_js_1 = require("./prompt.js");
const UI_js_1 = require("./UI.js");
/* eslint-disable @typescript-eslint/no-require-imports */
const autoModeStateModule = (0, bun_bundle_1.feature)('TRANSCRIPT_CLASSIFIER')
    ? require('../../utils/permissions/autoModeState.js')
    : null;
const permissionSetupModule = (0, bun_bundle_1.feature)('TRANSCRIPT_CLASSIFIER')
    ? require('../../utils/permissions/permissionSetup.js')
    : null;
/* eslint-enable @typescript-eslint/no-require-imports */
/**
 * Schema for prompt-based permission requests.
 * Used by Claude to request semantic permissions when exiting plan mode.
 */
const allowedPromptSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    tool: v4_1.z.enum(['Bash']).describe('The tool this prompt applies to'),
    prompt: v4_1.z
        .string()
        .describe('Semantic description of the action, e.g. "run tests", "install dependencies"'),
}));
const inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z
    .strictObject({
    // Prompt-based permissions requested by the plan
    allowedPrompts: v4_1.z
        .array(allowedPromptSchema())
        .optional()
        .describe('Prompt-based permissions needed to implement the plan. These describe categories of actions rather than specific commands.'),
})
    .passthrough());
/**
 * SDK-facing input schema - includes fields injected by normalizeToolInput.
 * The internal inputSchema doesn't have these fields because plan is read from disk,
 * but the SDK/hooks see the normalized version with plan and file path included.
 */
exports._sdkInputSchema = (0, lazySchema_js_1.lazySchema)(() => inputSchema().extend({
    plan: v4_1.z
        .string()
        .optional()
        .describe('The plan content (injected by normalizeToolInput from disk)'),
    planFilePath: v4_1.z
        .string()
        .optional()
        .describe('The plan file path (injected by normalizeToolInput)'),
}));
exports.outputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    plan: v4_1.z
        .string()
        .nullable()
        .describe('The plan that was presented to the user'),
    isAgent: v4_1.z.boolean(),
    filePath: v4_1.z
        .string()
        .optional()
        .describe('The file path where the plan was saved'),
    hasTaskTool: v4_1.z
        .boolean()
        .optional()
        .describe('Whether the Agent tool is available in the current context'),
    planWasEdited: v4_1.z
        .boolean()
        .optional()
        .describe('True when the user edited the plan (CCR web UI or Ctrl+G); determines whether the plan is echoed back in tool_result'),
    awaitingLeaderApproval: v4_1.z
        .boolean()
        .optional()
        .describe('When true, the teammate has sent a plan approval request to the team leader'),
    requestId: v4_1.z
        .string()
        .optional()
        .describe('Unique identifier for the plan approval request'),
}));
exports.ExitPlanModeV2Tool = (0, Tool_js_1.buildTool)({
    name: constants_js_3.EXIT_PLAN_MODE_V2_TOOL_NAME,
    searchHint: 'present plan for approval and start coding (plan mode only)',
    maxResultSizeChars: 100000,
    async description() {
        return 'Prompts the user to exit plan mode and start coding';
    },
    async prompt() {
        return prompt_js_1.EXIT_PLAN_MODE_V2_TOOL_PROMPT;
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return (0, exports.outputSchema)();
    },
    userFacingName() {
        return '';
    },
    shouldDefer: true,
    isEnabled() {
        // When --channels is active the user is likely on Telegram/Discord, not
        // watching the TUI. The plan-approval dialog would hang. Paired with the
        // same gate on EnterPlanMode so plan mode isn't a trap.
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
        return false; // Now writes to disk
    },
    requiresUserInteraction() {
        // For ALL teammates, no local user interaction needed:
        // - If isPlanModeRequired(): team lead approves via mailbox
        // - Otherwise: exits locally without approval (voluntary plan mode)
        if ((0, teammate_js_1.isTeammate)()) {
            return false;
        }
        // For non-teammates, require user confirmation to exit plan mode
        return true;
    },
    async validateInput(_input, { getAppState, options }) {
        // Teammate AppState may show leader's mode (runAgent.ts skips override in
        // acceptEdits/bypassPermissions/auto); isPlanModeRequired() is the real source
        if ((0, teammate_js_1.isTeammate)()) {
            return { result: true };
        }
        // The deferred-tool list announces this tool regardless of mode, so the
        // model can call it after plan approval (fresh delta on compact/clear).
        // Reject before checkPermissions to avoid showing the approval dialog.
        const mode = getAppState().toolPermissionContext.mode;
        if (mode !== 'plan') {
            (0, index_js_1.logEvent)('tengu_exit_plan_mode_called_outside_plan', {
                model: options.mainLoopModel,
                mode: mode,
                hasExitedPlanModeInSession: (0, state_js_1.hasExitedPlanModeInSession)(),
            });
            return {
                result: false,
                message: 'You are not in plan mode. This tool is only for exiting plan mode after writing a plan. If your plan was already approved, continue with implementation.',
                errorCode: 1,
            };
        }
        return { result: true };
    },
    async checkPermissions(input, context) {
        // For ALL teammates, bypass the permission UI to avoid sending permission_request
        // The call() method handles the appropriate behavior:
        // - If isPlanModeRequired(): sends plan_approval_request to leader
        // - Otherwise: exits plan mode locally (voluntary plan mode)
        if ((0, teammate_js_1.isTeammate)()) {
            return {
                behavior: 'allow',
                updatedInput: input,
            };
        }
        // For non-teammates, require user confirmation to exit plan mode
        return {
            behavior: 'ask',
            message: 'Exit plan mode?',
            updatedInput: input,
        };
    },
    renderToolUseMessage: UI_js_1.renderToolUseMessage,
    renderToolResultMessage: UI_js_1.renderToolResultMessage,
    renderToolUseRejectedMessage: UI_js_1.renderToolUseRejectedMessage,
    async call(input, context) {
        const isAgent = !!context.agentId;
        const filePath = (0, plans_js_1.getPlanFilePath)(context.agentId);
        // CCR web UI may send an edited plan via permissionResult.updatedInput.
        // queryHelpers.ts full-replaces finalInput, so when CCR sends {} (no edit)
        // input.plan is undefined -> disk fallback. The internal inputSchema omits
        // `plan` (normally injected by normalizeToolInput), hence the narrowing.
        const inputPlan = 'plan' in input && typeof input.plan === 'string' ? input.plan : undefined;
        const plan = inputPlan ?? (0, plans_js_1.getPlan)(context.agentId);
        // Sync disk so VerifyPlanExecution / Read see the edit. Re-snapshot
        // after: the only other persistFileSnapshotIfRemote call (api.ts) runs
        // in normalizeToolInput, pre-permission — it captured the old plan.
        if (inputPlan !== undefined && filePath) {
            await (0, promises_1.writeFile)(filePath, inputPlan, 'utf-8').catch(e => (0, log_js_1.logError)(e));
            void (0, plans_js_1.persistFileSnapshotIfRemote)();
        }
        // Check if this is a teammate that requires leader approval
        if ((0, teammate_js_1.isTeammate)() && (0, teammate_js_1.isPlanModeRequired)()) {
            // Plan is required for plan_mode_required teammates
            if (!plan) {
                throw new Error(`No plan file found at ${filePath}. Please write your plan to this file before calling ExitPlanMode.`);
            }
            const agentName = (0, teammate_js_1.getAgentName)() || 'unknown';
            const teamName = (0, teammate_js_1.getTeamName)();
            const requestId = (0, agentId_js_1.generateRequestId)('plan_approval', (0, agentId_js_1.formatAgentId)(agentName, teamName || 'default'));
            const approvalRequest = {
                type: 'plan_approval_request',
                from: agentName,
                timestamp: new Date().toISOString(),
                planFilePath: filePath,
                planContent: plan,
                requestId,
            };
            await (0, teammateMailbox_js_1.writeToMailbox)('team-lead', {
                from: agentName,
                text: (0, slowOperations_js_1.jsonStringify)(approvalRequest),
                timestamp: new Date().toISOString(),
            }, teamName);
            // Update task state to show awaiting approval (for in-process teammates)
            const appState = context.getAppState();
            const agentTaskId = (0, inProcessTeammateHelpers_js_1.findInProcessTeammateTaskId)(agentName, appState);
            if (agentTaskId) {
                (0, inProcessTeammateHelpers_js_1.setAwaitingPlanApproval)(agentTaskId, context.setAppState, true);
            }
            return {
                data: {
                    plan,
                    isAgent: true,
                    filePath,
                    awaitingLeaderApproval: true,
                    requestId,
                },
            };
        }
        // Note: Background verification hook is registered in REPL.tsx AFTER context clear
        // via registerPlanVerificationHook(). Registering here would be cleared during context clear.
        // Ensure mode is changed when exiting plan mode.
        // This handles cases where permission flow didn't set the mode
        // (e.g., when PermissionRequest hook auto-approves without providing updatedPermissions).
        const appState = context.getAppState();
        // Compute gate-off fallback before setAppState so we can notify the user.
        // Circuit breaker defense: if prePlanMode was an auto-like mode but the
        // gate is now off (circuit breaker or settings disable), restore to
        // 'default' instead. Without this, ExitPlanMode would bypass the circuit
        // breaker by calling setAutoModeActive(true) directly.
        let gateFallbackNotification = null;
        if ((0, bun_bundle_1.feature)('TRANSCRIPT_CLASSIFIER')) {
            const prePlanRaw = appState.toolPermissionContext.prePlanMode ?? 'default';
            if (prePlanRaw === 'auto' &&
                !(permissionSetupModule?.isAutoModeGateEnabled() ?? false)) {
                const reason = permissionSetupModule?.getAutoModeUnavailableReason() ??
                    'circuit-breaker';
                gateFallbackNotification =
                    permissionSetupModule?.getAutoModeUnavailableNotification(reason) ??
                        'auto mode unavailable';
                (0, debug_js_1.logForDebugging)(`[auto-mode gate @ ExitPlanModeV2Tool] prePlanMode=${prePlanRaw} ` +
                    `but gate is off (reason=${reason}) — falling back to default on plan exit`, { level: 'warn' });
            }
        }
        if (gateFallbackNotification) {
            context.addNotification?.({
                key: 'auto-mode-gate-plan-exit-fallback',
                text: `plan exit → default · ${gateFallbackNotification}`,
                priority: 'immediate',
                color: 'warning',
                timeoutMs: 10000,
            });
        }
        context.setAppState(prev => {
            if (prev.toolPermissionContext.mode !== 'plan')
                return prev;
            (0, state_js_1.setHasExitedPlanMode)(true);
            (0, state_js_1.setNeedsPlanModeExitAttachment)(true);
            let restoreMode = prev.toolPermissionContext.prePlanMode ?? 'default';
            if ((0, bun_bundle_1.feature)('TRANSCRIPT_CLASSIFIER')) {
                if (restoreMode === 'auto' &&
                    !(permissionSetupModule?.isAutoModeGateEnabled() ?? false)) {
                    restoreMode = 'default';
                }
                const finalRestoringAuto = restoreMode === 'auto';
                // Capture pre-restore state — isAutoModeActive() is the authoritative
                // signal (prePlanMode/strippedDangerousRules are stale after
                // transitionPlanAutoMode deactivates mid-plan).
                const autoWasUsedDuringPlan = autoModeStateModule?.isAutoModeActive() ?? false;
                autoModeStateModule?.setAutoModeActive(finalRestoringAuto);
                if (autoWasUsedDuringPlan && !finalRestoringAuto) {
                    (0, state_js_1.setNeedsAutoModeExitAttachment)(true);
                }
            }
            // If restoring to a non-auto mode and permissions were stripped (either
            // from entering plan from auto, or from shouldPlanUseAutoMode),
            // restore them. If restoring to auto, keep them stripped.
            const restoringToAuto = restoreMode === 'auto';
            let baseContext = prev.toolPermissionContext;
            if (restoringToAuto) {
                baseContext =
                    permissionSetupModule?.stripDangerousPermissionsForAutoMode(baseContext) ?? baseContext;
            }
            else if (prev.toolPermissionContext.strippedDangerousRules) {
                baseContext =
                    permissionSetupModule?.restoreDangerousPermissions(baseContext) ??
                        baseContext;
            }
            return {
                ...prev,
                toolPermissionContext: {
                    ...baseContext,
                    mode: restoreMode,
                    prePlanMode: undefined,
                },
            };
        });
        const hasTaskTool = (0, agentSwarmsEnabled_js_1.isAgentSwarmsEnabled)() &&
            context.options.tools.some(t => (0, Tool_js_1.toolMatchesName)(t, constants_js_1.AGENT_TOOL_NAME));
        return {
            data: {
                plan,
                isAgent,
                filePath,
                hasTaskTool: hasTaskTool || undefined,
                planWasEdited: inputPlan !== undefined || undefined,
            },
        };
    },
    mapToolResultToToolResultBlockParam({ isAgent, plan, filePath, hasTaskTool, planWasEdited, awaitingLeaderApproval, requestId, }, toolUseID) {
        // Handle teammate awaiting leader approval
        if (awaitingLeaderApproval) {
            return {
                type: 'tool_result',
                content: `Your plan has been submitted to the team lead for approval.

Plan file: ${filePath}

**What happens next:**
1. Wait for the team lead to review your plan
2. You will receive a message in your inbox with approval/rejection
3. If approved, you can proceed with implementation
4. If rejected, refine your plan based on the feedback

**Important:** Do NOT proceed until you receive approval. Check your inbox for response.

Request ID: ${requestId}`,
                tool_use_id: toolUseID,
            };
        }
        if (isAgent) {
            return {
                type: 'tool_result',
                content: 'User has approved the plan. There is nothing else needed from you now. Please respond with "ok"',
                tool_use_id: toolUseID,
            };
        }
        // Handle empty plan
        if (!plan || plan.trim() === '') {
            return {
                type: 'tool_result',
                content: 'User has approved exiting plan mode. You can now proceed.',
                tool_use_id: toolUseID,
            };
        }
        const teamHint = hasTaskTool
            ? `\n\nIf this plan can be broken down into multiple independent tasks, consider using the ${constants_js_2.TEAM_CREATE_TOOL_NAME} tool to create a team and parallelize the work.`
            : '';
        // Always include the plan — extractApprovedPlan() in the Ultraplan CCR
        // flow parses the tool_result to retrieve the plan text for the local CLI.
        // Label edited plans so the model knows the user changed something.
        const planLabel = planWasEdited
            ? 'Approved Plan (edited by user)'
            : 'Approved Plan';
        return {
            type: 'tool_result',
            content: `User has approved your plan. You can now start coding. Start with updating your todo list if applicable

Your plan has been saved to: ${filePath}
You can refer back to it if needed during implementation.${teamHint}

## ${planLabel}:
${plan}`,
            tool_use_id: toolUseID,
        };
    },
});
