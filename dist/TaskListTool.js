"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskListTool = void 0;
const v4_1 = require("zod/v4");
const Tool_js_1 = require("../../Tool.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const tasks_js_1 = require("../../utils/tasks.js");
const constants_js_1 = require("./constants.js");
const prompt_js_1 = require("./prompt.js");
const inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.strictObject({}));
const outputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    tasks: v4_1.z.array(v4_1.z.object({
        id: v4_1.z.string(),
        subject: v4_1.z.string(),
        status: (0, tasks_js_1.TaskStatusSchema)(),
        owner: v4_1.z.string().optional(),
        blockedBy: v4_1.z.array(v4_1.z.string()),
    })),
}));
exports.TaskListTool = (0, Tool_js_1.buildTool)({
    name: constants_js_1.TASK_LIST_TOOL_NAME,
    searchHint: 'list all tasks',
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
        return 'TaskList';
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
    renderToolUseMessage() {
        return null;
    },
    async call() {
        const taskListId = (0, tasks_js_1.getTaskListId)();
        const allTasks = (await (0, tasks_js_1.listTasks)(taskListId)).filter(t => !t.metadata?._internal);
        // Build a set of resolved task IDs for filtering
        const resolvedTaskIds = new Set(allTasks.filter(t => t.status === 'completed').map(t => t.id));
        const tasks = allTasks.map(task => ({
            id: task.id,
            subject: task.subject,
            status: task.status,
            owner: task.owner,
            blockedBy: task.blockedBy.filter(id => !resolvedTaskIds.has(id)),
        }));
        return {
            data: {
                tasks,
            },
        };
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        const { tasks } = content;
        if (tasks.length === 0) {
            return {
                tool_use_id: toolUseID,
                type: 'tool_result',
                content: 'No tasks found',
            };
        }
        const lines = tasks.map(task => {
            const owner = task.owner ? ` (${task.owner})` : '';
            const blocked = task.blockedBy.length > 0
                ? ` [blocked by ${task.blockedBy.map(id => `#${id}`).join(', ')}]`
                : '';
            return `#${task.id} [${task.status}] ${task.subject}${owner}${blocked}`;
        });
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: lines.join('\n'),
        };
    },
});
