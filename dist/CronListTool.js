"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CronListTool = void 0;
const v4_1 = require("zod/v4");
const Tool_js_1 = require("../../Tool.js");
const cron_js_1 = require("../../utils/cron.js");
const cronTasks_js_1 = require("../../utils/cronTasks.js");
const format_js_1 = require("../../utils/format.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const teammateContext_js_1 = require("../../utils/teammateContext.js");
const prompt_js_1 = require("./prompt.js");
const UI_js_1 = require("./UI.js");
const inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.strictObject({}));
const outputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    jobs: v4_1.z.array(v4_1.z.object({
        id: v4_1.z.string(),
        cron: v4_1.z.string(),
        humanSchedule: v4_1.z.string(),
        prompt: v4_1.z.string(),
        recurring: v4_1.z.boolean().optional(),
        durable: v4_1.z.boolean().optional(),
    })),
}));
exports.CronListTool = (0, Tool_js_1.buildTool)({
    name: prompt_js_1.CRON_LIST_TOOL_NAME,
    searchHint: 'list active cron jobs',
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
    isConcurrencySafe() {
        return true;
    },
    isReadOnly() {
        return true;
    },
    async description() {
        return prompt_js_1.CRON_LIST_DESCRIPTION;
    },
    async prompt() {
        return (0, prompt_js_1.buildCronListPrompt)((0, prompt_js_1.isDurableCronEnabled)());
    },
    async call() {
        const allTasks = await (0, cronTasks_js_1.listAllCronTasks)();
        // Teammates only see their own crons; team lead (no ctx) sees all.
        const ctx = (0, teammateContext_js_1.getTeammateContext)();
        const tasks = ctx
            ? allTasks.filter(t => t.agentId === ctx.agentId)
            : allTasks;
        const jobs = tasks.map(t => ({
            id: t.id,
            cron: t.cron,
            humanSchedule: (0, cron_js_1.cronToHuman)(t.cron),
            prompt: t.prompt,
            ...(t.recurring ? { recurring: true } : {}),
            ...(t.durable === false ? { durable: false } : {}),
        }));
        return { data: { jobs } };
    },
    mapToolResultToToolResultBlockParam(output, toolUseID) {
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: output.jobs.length > 0
                ? output.jobs
                    .map(j => `${j.id} — ${j.humanSchedule}${j.recurring ? ' (recurring)' : ' (one-shot)'}${j.durable === false ? ' [session-only]' : ''}: ${(0, format_js_1.truncate)(j.prompt, 80, true)}`)
                    .join('\n')
                : 'No scheduled jobs.',
        };
    },
    renderToolUseMessage: UI_js_1.renderListToolUseMessage,
    renderToolResultMessage: UI_js_1.renderListResultMessage,
});
