"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskStopTool = void 0;
const v4_1 = require("zod/v4");
const Tool_js_1 = require("../../Tool.js");
const stopTask_js_1 = require("../../tasks/stopTask.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const prompt_js_1 = require("./prompt.js");
const UI_js_1 = require("./UI.js");
const inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.strictObject({
    task_id: v4_1.z
        .string()
        .optional()
        .describe('The ID of the background task to stop'),
    // shell_id is accepted for backward compatibility with the deprecated KillShell tool
    shell_id: v4_1.z.string().optional().describe('Deprecated: use task_id instead'),
}));
const outputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    message: v4_1.z.string().describe('Status message about the operation'),
    task_id: v4_1.z.string().describe('The ID of the task that was stopped'),
    task_type: v4_1.z.string().describe('The type of the task that was stopped'),
    // Optional: tool outputs are persisted to transcripts and replayed on --resume
    // without re-validation, so sessions from before this field was added lack it.
    command: v4_1.z
        .string()
        .optional()
        .describe('The command or description of the stopped task'),
}));
exports.TaskStopTool = (0, Tool_js_1.buildTool)({
    name: prompt_js_1.TASK_STOP_TOOL_NAME,
    searchHint: 'kill a running background task',
    // KillShell is the deprecated name - kept as alias for backward compatibility
    // with existing transcripts and SDK users
    aliases: ['KillShell'],
    maxResultSizeChars: 100000,
    userFacingName: () => (process.env.USER_TYPE === 'ant' ? '' : 'Stop Task'),
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    shouldDefer: true,
    isConcurrencySafe() {
        return true;
    },
    toAutoClassifierInput(input) {
        return input.task_id ?? input.shell_id ?? '';
    },
    async validateInput({ task_id, shell_id }, { getAppState }) {
        // Support both task_id and shell_id (deprecated KillShell compat)
        const id = task_id ?? shell_id;
        if (!id) {
            return {
                result: false,
                message: 'Missing required parameter: task_id',
                errorCode: 1,
            };
        }
        const appState = getAppState();
        const task = appState.tasks?.[id];
        if (!task) {
            return {
                result: false,
                message: `No task found with ID: ${id}`,
                errorCode: 1,
            };
        }
        if (task.status !== 'running') {
            return {
                result: false,
                message: `Task ${id} is not running (status: ${task.status})`,
                errorCode: 3,
            };
        }
        return { result: true };
    },
    async description() {
        return `Stop a running background task by ID`;
    },
    async prompt() {
        return prompt_js_1.DESCRIPTION;
    },
    mapToolResultToToolResultBlockParam(output, toolUseID) {
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: (0, slowOperations_js_1.jsonStringify)(output),
        };
    },
    renderToolUseMessage: UI_js_1.renderToolUseMessage,
    renderToolResultMessage: UI_js_1.renderToolResultMessage,
    async call({ task_id, shell_id }, { getAppState, setAppState, abortController }) {
        // Support both task_id and shell_id (deprecated KillShell compat)
        const id = task_id ?? shell_id;
        if (!id) {
            throw new Error('Missing required parameter: task_id');
        }
        const result = await (0, stopTask_js_1.stopTask)(id, {
            getAppState,
            setAppState,
        });
        return {
            data: {
                message: `Successfully stopped task: ${result.taskId} (${result.command})`,
                task_id: result.taskId,
                task_type: result.taskType,
                command: result.command,
            },
        };
    },
});
