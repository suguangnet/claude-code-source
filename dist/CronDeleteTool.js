"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CronDeleteTool = void 0;
const v4_1 = require("zod/v4");
const Tool_js_1 = require("../../Tool.js");
const cronTasks_js_1 = require("../../utils/cronTasks.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const teammateContext_js_1 = require("../../utils/teammateContext.js");
const prompt_js_1 = require("./prompt.js");
const UI_js_1 = require("./UI.js");
const inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.strictObject({
    id: v4_1.z.string().describe('Job ID returned by CronCreate.'),
}));
const outputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    id: v4_1.z.string(),
}));
exports.CronDeleteTool = (0, Tool_js_1.buildTool)({
    name: prompt_js_1.CRON_DELETE_TOOL_NAME,
    searchHint: 'cancel a scheduled cron job',
    maxResultSizeChars: 100000,
    shouldDefer: true,
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    isEnabled() {
        return (0, prompt_js_1.isKairosCronEnabled)();
    },
    toAutoClassifierInput(input) {
        return input.id;
    },
    async description() {
        return prompt_js_1.CRON_DELETE_DESCRIPTION;
    },
    async prompt() {
        return (0, prompt_js_1.buildCronDeletePrompt)((0, prompt_js_1.isDurableCronEnabled)());
    },
    getPath() {
        return (0, cronTasks_js_1.getCronFilePath)();
    },
    async validateInput(input) {
        const tasks = await (0, cronTasks_js_1.listAllCronTasks)();
        const task = tasks.find(t => t.id === input.id);
        if (!task) {
            return {
                result: false,
                message: `No scheduled job with id '${input.id}'`,
                errorCode: 1,
            };
        }
        // Teammates may only delete their own crons.
        const ctx = (0, teammateContext_js_1.getTeammateContext)();
        if (ctx && task.agentId !== ctx.agentId) {
            return {
                result: false,
                message: `Cannot delete cron job '${input.id}': owned by another agent`,
                errorCode: 2,
            };
        }
        return { result: true };
    },
    async call({ id }) {
        await (0, cronTasks_js_1.removeCronTasks)([id]);
        return { data: { id } };
    },
    mapToolResultToToolResultBlockParam(output, toolUseID) {
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: `Cancelled job ${output.id}.`,
        };
    },
    renderToolUseMessage: UI_js_1.renderDeleteToolUseMessage,
    renderToolResultMessage: UI_js_1.renderDeleteResultMessage,
});
