"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskCreateTool = void 0;
const v4_1 = require("zod/v4");
const Tool_js_1 = require("../../Tool.js");
const hooks_js_1 = require("../../utils/hooks.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const tasks_js_1 = require("../../utils/tasks.js");
const teammate_js_1 = require("../../utils/teammate.js");
const constants_js_1 = require("./constants.js");
const prompt_js_1 = require("./prompt.js");
const inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.strictObject({
    subject: v4_1.z.string().describe('A brief title for the task'),
    description: v4_1.z.string().describe('What needs to be done'),
    activeForm: v4_1.z
        .string()
        .optional()
        .describe('Present continuous form shown in spinner when in_progress (e.g., "Running tests")'),
    metadata: v4_1.z
        .record(v4_1.z.string(), v4_1.z.unknown())
        .optional()
        .describe('Arbitrary metadata to attach to the task'),
}));
const outputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    task: v4_1.z.object({
        id: v4_1.z.string(),
        subject: v4_1.z.string(),
    }),
}));
exports.TaskCreateTool = (0, Tool_js_1.buildTool)({
    name: constants_js_1.TASK_CREATE_TOOL_NAME,
    searchHint: 'create a task in the task list',
    maxResultSizeChars: 100000,
    async description() {
        return prompt_js_1.DESCRIPTION;
    },
    async prompt() {
        return (0, prompt_js_1.getPrompt)();
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    userFacingName() {
        return 'TaskCreate';
    },
    shouldDefer: true,
    isEnabled() {
        return (0, tasks_js_1.isTodoV2Enabled)();
    },
    isConcurrencySafe() {
        return true;
    },
    toAutoClassifierInput(input) {
        return input.subject;
    },
    renderToolUseMessage() {
        return null;
    },
    async call({ subject, description, activeForm, metadata }, context) {
        const taskId = await (0, tasks_js_1.createTask)((0, tasks_js_1.getTaskListId)(), {
            subject,
            description,
            activeForm,
            status: 'pending',
            owner: undefined,
            blocks: [],
            blockedBy: [],
            metadata,
        });
        const blockingErrors = [];
        const generator = (0, hooks_js_1.executeTaskCreatedHooks)(taskId, subject, description, (0, teammate_js_1.getAgentName)(), (0, teammate_js_1.getTeamName)(), undefined, context?.abortController?.signal, undefined, context);
        for await (const result of generator) {
            if (result.blockingError) {
                blockingErrors.push((0, hooks_js_1.getTaskCreatedHookMessage)(result.blockingError));
            }
        }
        if (blockingErrors.length > 0) {
            await (0, tasks_js_1.deleteTask)((0, tasks_js_1.getTaskListId)(), taskId);
            throw new Error(blockingErrors.join('\n'));
        }
        // Auto-expand task list when creating tasks
        context.setAppState(prev => {
            if (prev.expandedView === 'tasks')
                return prev;
            return { ...prev, expandedView: 'tasks' };
        });
        return {
            data: {
                task: {
                    id: taskId,
                    subject,
                },
            },
        };
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        const { task } = content;
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: `Task #${task.id} created successfully: ${task.subject}`,
        };
    },
});
