"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskGetTool = void 0;
const v4_1 = require("zod/v4");
const Tool_js_1 = require("../../Tool.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const tasks_js_1 = require("../../utils/tasks.js");
const constants_js_1 = require("./constants.js");
const prompt_js_1 = require("./prompt.js");
const inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.strictObject({
    taskId: v4_1.z.string().describe('The ID of the task to retrieve'),
}));
const outputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    task: v4_1.z
        .object({
        id: v4_1.z.string(),
        subject: v4_1.z.string(),
        description: v4_1.z.string(),
        status: (0, tasks_js_1.TaskStatusSchema)(),
        blocks: v4_1.z.array(v4_1.z.string()),
        blockedBy: v4_1.z.array(v4_1.z.string()),
    })
        .nullable(),
}));
exports.TaskGetTool = (0, Tool_js_1.buildTool)({
    name: constants_js_1.TASK_GET_TOOL_NAME,
    searchHint: 'retrieve a task by ID',
    maxResultSizeChars: 100000,
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
        return 'TaskGet';
    },
    shouldDefer: true,
    isEnabled() {
        return (0, tasks_js_1.isTodoV2Enabled)();
    },
    isConcurrencySafe() {
        return true;
    },
    isReadOnly() {
        return true;
    },
    toAutoClassifierInput(input) {
        return input.taskId;
    },
    renderToolUseMessage() {
        return null;
    },
    async call({ taskId }) {
        const taskListId = (0, tasks_js_1.getTaskListId)();
        const task = await (0, tasks_js_1.getTask)(taskListId, taskId);
        if (!task) {
            return {
                data: {
                    task: null,
                },
            };
        }
        return {
            data: {
                task: {
                    id: task.id,
                    subject: task.subject,
                    description: task.description,
                    status: task.status,
                    blocks: task.blocks,
                    blockedBy: task.blockedBy,
                },
            },
        };
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        const { task } = content;
        if (!task) {
            return {
                tool_use_id: toolUseID,
                type: 'tool_result',
                content: 'Task not found',
            };
        }
        const lines = [
            `Task #${task.id}: ${task.subject}`,
            `Status: ${task.status}`,
            `Description: ${task.description}`,
        ];
        if (task.blockedBy.length > 0) {
            lines.push(`Blocked by: ${task.blockedBy.map(id => `#${id}`).join(', ')}`);
        }
        if (task.blocks.length > 0) {
            lines.push(`Blocks: ${task.blocks.map(id => `#${id}`).join(', ')}`);
        }
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: lines.join('\n'),
        };
    },
});
