"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CronCreateTool = void 0;
const v4_1 = require("zod/v4");
const state_js_1 = require("../../bootstrap/state.js");
const Tool_js_1 = require("../../Tool.js");
const cron_js_1 = require("../../utils/cron.js");
const cronTasks_js_1 = require("../../utils/cronTasks.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const semanticBoolean_js_1 = require("../../utils/semanticBoolean.js");
const teammateContext_js_1 = require("../../utils/teammateContext.js");
const prompt_js_1 = require("./prompt.js");
const UI_js_1 = require("./UI.js");
const MAX_JOBS = 50;
const inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.strictObject({
    cron: v4_1.z
        .string()
        .describe('Standard 5-field cron expression in local time: "M H DoM Mon DoW" (e.g. "*/5 * * * *" = every 5 minutes, "30 14 28 2 *" = Feb 28 at 2:30pm local once).'),
    prompt: v4_1.z.string().describe('The prompt to enqueue at each fire time.'),
    recurring: (0, semanticBoolean_js_1.semanticBoolean)(v4_1.z.boolean().optional()).describe(`true (default) = fire on every cron match until deleted or auto-expired after ${prompt_js_1.DEFAULT_MAX_AGE_DAYS} days. false = fire once at the next match, then auto-delete. Use false for "remind me at X" one-shot requests with pinned minute/hour/dom/month.`),
    durable: (0, semanticBoolean_js_1.semanticBoolean)(v4_1.z.boolean().optional()).describe('true = persist to .claude/scheduled_tasks.json and survive restarts. false (default) = in-memory only, dies when this Claude session ends. Use true only when the user asks the task to survive across sessions.'),
}));
const outputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    id: v4_1.z.string(),
    humanSchedule: v4_1.z.string(),
    recurring: v4_1.z.boolean(),
    durable: v4_1.z.boolean().optional(),
}));
exports.CronCreateTool = (0, Tool_js_1.buildTool)({
    name: prompt_js_1.CRON_CREATE_TOOL_NAME,
    searchHint: 'schedule a recurring or one-shot prompt',
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
        return `${input.cron}: ${input.prompt}`;
    },
    async description() {
        return (0, prompt_js_1.buildCronCreateDescription)((0, prompt_js_1.isDurableCronEnabled)());
    },
    async prompt() {
        return (0, prompt_js_1.buildCronCreatePrompt)((0, prompt_js_1.isDurableCronEnabled)());
    },
    getPath() {
        return (0, cronTasks_js_1.getCronFilePath)();
    },
    async validateInput(input) {
        if (!(0, cron_js_1.parseCronExpression)(input.cron)) {
            return {
                result: false,
                message: `Invalid cron expression '${input.cron}'. Expected 5 fields: M H DoM Mon DoW.`,
                errorCode: 1,
            };
        }
        if ((0, cronTasks_js_1.nextCronRunMs)(input.cron, Date.now()) === null) {
            return {
                result: false,
                message: `Cron expression '${input.cron}' does not match any calendar date in the next year.`,
                errorCode: 2,
            };
        }
        const tasks = await (0, cronTasks_js_1.listAllCronTasks)();
        if (tasks.length >= MAX_JOBS) {
            return {
                result: false,
                message: `Too many scheduled jobs (max ${MAX_JOBS}). Cancel one first.`,
                errorCode: 3,
            };
        }
        // Teammates don't persist across sessions, so a durable teammate cron
        // would orphan on restart (agentId would point to a nonexistent teammate).
        if (input.durable && (0, teammateContext_js_1.getTeammateContext)()) {
            return {
                result: false,
                message: 'durable crons are not supported for teammates (teammates do not persist across sessions)',
                errorCode: 4,
            };
        }
        return { result: true };
    },
    async call({ cron, prompt, recurring = true, durable = false }) {
        // Kill switch forces session-only; schema stays stable so the model sees
        // no validation errors when the gate flips mid-session.
        const effectiveDurable = durable && (0, prompt_js_1.isDurableCronEnabled)();
        const id = await (0, cronTasks_js_1.addCronTask)(cron, prompt, recurring, effectiveDurable, (0, teammateContext_js_1.getTeammateContext)()?.agentId);
        // Enable the scheduler so the task fires in this session. The
        // useScheduledTasks hook polls this flag and will start watching
        // on the next tick. For durable: false tasks the file never changes
        // — check() reads the session store directly — but the enable flag
        // is still what starts the tick loop.
        (0, state_js_1.setScheduledTasksEnabled)(true);
        return {
            data: {
                id,
                humanSchedule: (0, cron_js_1.cronToHuman)(cron),
                recurring,
                durable: effectiveDurable,
            },
        };
    },
    mapToolResultToToolResultBlockParam(output, toolUseID) {
        const where = output.durable
            ? 'Persisted to .claude/scheduled_tasks.json'
            : 'Session-only (not written to disk, dies when Claude exits)';
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: output.recurring
                ? `Scheduled recurring job ${output.id} (${output.humanSchedule}). ${where}. Auto-expires after ${prompt_js_1.DEFAULT_MAX_AGE_DAYS} days. Use CronDelete to cancel sooner.`
                : `Scheduled one-shot task ${output.id} (${output.humanSchedule}). ${where}. It will fire once then auto-delete.`,
        };
    },
    renderToolUseMessage: UI_js_1.renderCreateToolUseMessage,
    renderToolResultMessage: UI_js_1.renderCreateResultMessage,
});
