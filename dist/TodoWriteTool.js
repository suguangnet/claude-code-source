"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TodoWriteTool = void 0;
const bun_bundle_1 = require("bun:bundle");
const v4_1 = require("zod/v4");
const state_js_1 = require("../../bootstrap/state.js");
const growthbook_js_1 = require("../../services/analytics/growthbook.js");
const Tool_js_1 = require("../../Tool.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const tasks_js_1 = require("../../utils/tasks.js");
const types_js_1 = require("../../utils/todo/types.js");
const constants_js_1 = require("../AgentTool/constants.js");
const constants_js_2 = require("./constants.js");
const prompt_js_1 = require("./prompt.js");
const inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.strictObject({
    todos: (0, types_js_1.TodoListSchema)().describe('The updated todo list'),
}));
const outputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    oldTodos: (0, types_js_1.TodoListSchema)().describe('The todo list before the update'),
    newTodos: (0, types_js_1.TodoListSchema)().describe('The todo list after the update'),
    verificationNudgeNeeded: v4_1.z.boolean().optional(),
}));
exports.TodoWriteTool = (0, Tool_js_1.buildTool)({
    name: constants_js_2.TODO_WRITE_TOOL_NAME,
    searchHint: 'manage the session task checklist',
    maxResultSizeChars: 100000,
    strict: true,
    async description() {
        return prompt_js_1.DESCRIPTION;
    },
    async prompt() {
        return prompt_js_1.PROMPT;
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
        return !(0, tasks_js_1.isTodoV2Enabled)();
    },
    toAutoClassifierInput(input) {
        return `${input.todos.length} items`;
    },
    async checkPermissions(input) {
        // No permission checks required for todo operations
        return { behavior: 'allow', updatedInput: input };
    },
    renderToolUseMessage() {
        return null;
    },
    async call({ todos }, context) {
        const appState = context.getAppState();
        const todoKey = context.agentId ?? (0, state_js_1.getSessionId)();
        const oldTodos = appState.todos[todoKey] ?? [];
        const allDone = todos.every(_ => _.status === 'completed');
        const newTodos = allDone ? [] : todos;
        // Structural nudge: if the main-thread agent is closing out a 3+ item
        // list and none of those items was a verification step, append a reminder
        // to the tool result. Fires at the exact loop-exit moment where skips
        // happen ("when the last task closed, the loop exited").
        let verificationNudgeNeeded = false;
        if ((0, bun_bundle_1.feature)('VERIFICATION_AGENT') &&
            (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_hive_evidence', false) &&
            !context.agentId &&
            allDone &&
            todos.length >= 3 &&
            !todos.some(t => /verif/i.test(t.content))) {
            verificationNudgeNeeded = true;
        }
        context.setAppState(prev => ({
            ...prev,
            todos: {
                ...prev.todos,
                [todoKey]: newTodos,
            },
        }));
        return {
            data: {
                oldTodos,
                newTodos: todos,
                verificationNudgeNeeded,
            },
        };
    },
    mapToolResultToToolResultBlockParam({ verificationNudgeNeeded }, toolUseID) {
        const base = `Todos have been modified successfully. Ensure that you continue to use the todo list to track your progress. Please proceed with the current tasks if applicable`;
        const nudge = verificationNudgeNeeded
            ? `\n\nNOTE: You just closed out 3+ tasks and none of them was a verification step. Before writing your final summary, spawn the verification agent (subagent_type="${constants_js_1.VERIFICATION_AGENT_TYPE}"). You cannot self-assign PARTIAL by listing caveats in your summary \u2014 only the verifier issues a verdict.`
            : '';
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: base + nudge,
        };
    },
});
