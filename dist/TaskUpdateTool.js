"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskUpdateTool = void 0;
const bun_bundle_1 = require("bun:bundle");
const v4_1 = require("zod/v4");
const growthbook_js_1 = require("../../services/analytics/growthbook.js");
const Tool_js_1 = require("../../Tool.js");
const agentSwarmsEnabled_js_1 = require("../../utils/agentSwarmsEnabled.js");
const hooks_js_1 = require("../../utils/hooks.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const tasks_js_1 = require("../../utils/tasks.js");
const teammate_js_1 = require("../../utils/teammate.js");
const teammateMailbox_js_1 = require("../../utils/teammateMailbox.js");
const constants_js_1 = require("../AgentTool/constants.js");
const constants_js_2 = require("./constants.js");
const prompt_js_1 = require("./prompt.js");
const inputSchema = (0, lazySchema_js_1.lazySchema)(() => {
    // Extended status schema that includes 'deleted' as a special action
    const TaskUpdateStatusSchema = (0, tasks_js_1.TaskStatusSchema)().or(v4_1.z.literal('deleted'));
    return v4_1.z.strictObject({
        taskId: v4_1.z.string().describe('The ID of the task to update'),
        subject: v4_1.z.string().optional().describe('New subject for the task'),
        description: v4_1.z.string().optional().describe('New description for the task'),
        activeForm: v4_1.z
            .string()
            .optional()
            .describe('Present continuous form shown in spinner when in_progress (e.g., "Running tests")'),
        status: TaskUpdateStatusSchema.optional().describe('New status for the task'),
        addBlocks: v4_1.z
            .array(v4_1.z.string())
            .optional()
            .describe('Task IDs that this task blocks'),
        addBlockedBy: v4_1.z
            .array(v4_1.z.string())
            .optional()
            .describe('Task IDs that block this task'),
        owner: v4_1.z.string().optional().describe('New owner for the task'),
        metadata: v4_1.z
            .record(v4_1.z.string(), v4_1.z.unknown())
            .optional()
            .describe('Metadata keys to merge into the task. Set a key to null to delete it.'),
    });
});
const outputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    success: v4_1.z.boolean(),
    taskId: v4_1.z.string(),
    updatedFields: v4_1.z.array(v4_1.z.string()),
    error: v4_1.z.string().optional(),
    statusChange: v4_1.z
        .object({
        from: v4_1.z.string(),
        to: v4_1.z.string(),
    })
        .optional(),
    verificationNudgeNeeded: v4_1.z.boolean().optional(),
}));
exports.TaskUpdateTool = (0, Tool_js_1.buildTool)({
    name: constants_js_2.TASK_UPDATE_TOOL_NAME,
    searchHint: 'update a task',
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
        return 'TaskUpdate';
    },
    shouldDefer: true,
    isEnabled() {
        return (0, tasks_js_1.isTodoV2Enabled)();
    },
    isConcurrencySafe() {
        return true;
    },
    toAutoClassifierInput(input) {
        const parts = [input.taskId];
        if (input.status)
            parts.push(input.status);
        if (input.subject)
            parts.push(input.subject);
        return parts.join(' ');
    },
    renderToolUseMessage() {
        return null;
    },
    async call({ taskId, subject, description, activeForm, status, owner, addBlocks, addBlockedBy, metadata, }, context) {
        const taskListId = (0, tasks_js_1.getTaskListId)();
        // Auto-expand task list when updating tasks
        context.setAppState(prev => {
            if (prev.expandedView === 'tasks')
                return prev;
            return { ...prev, expandedView: 'tasks' };
        });
        // Check if task exists
        const existingTask = await (0, tasks_js_1.getTask)(taskListId, taskId);
        if (!existingTask) {
            return {
                data: {
                    success: false,
                    taskId,
                    updatedFields: [],
                    error: 'Task not found',
                },
            };
        }
        const updatedFields = [];
        // Update basic fields if provided and different from current value
        const updates = {};
        if (subject !== undefined && subject !== existingTask.subject) {
            updates.subject = subject;
            updatedFields.push('subject');
        }
        if (description !== undefined && description !== existingTask.description) {
            updates.description = description;
            updatedFields.push('description');
        }
        if (activeForm !== undefined && activeForm !== existingTask.activeForm) {
            updates.activeForm = activeForm;
            updatedFields.push('activeForm');
        }
        if (owner !== undefined && owner !== existingTask.owner) {
            updates.owner = owner;
            updatedFields.push('owner');
        }
        // Auto-set owner when a teammate marks a task as in_progress without
        // explicitly providing an owner. This ensures the task list can match
        // todo items to teammates for showing activity status.
        if ((0, agentSwarmsEnabled_js_1.isAgentSwarmsEnabled)() &&
            status === 'in_progress' &&
            owner === undefined &&
            !existingTask.owner) {
            const agentName = (0, teammate_js_1.getAgentName)();
            if (agentName) {
                updates.owner = agentName;
                updatedFields.push('owner');
            }
        }
        if (metadata !== undefined) {
            const merged = { ...(existingTask.metadata ?? {}) };
            for (const [key, value] of Object.entries(metadata)) {
                if (value === null) {
                    delete merged[key];
                }
                else {
                    merged[key] = value;
                }
            }
            updates.metadata = merged;
            updatedFields.push('metadata');
        }
        if (status !== undefined) {
            // Handle deletion - delete the task file and return early
            if (status === 'deleted') {
                const deleted = await (0, tasks_js_1.deleteTask)(taskListId, taskId);
                return {
                    data: {
                        success: deleted,
                        taskId,
                        updatedFields: deleted ? ['deleted'] : [],
                        error: deleted ? undefined : 'Failed to delete task',
                        statusChange: deleted
                            ? { from: existingTask.status, to: 'deleted' }
                            : undefined,
                    },
                };
            }
            // For regular status updates, validate and apply if different
            if (status !== existingTask.status) {
                // Run TaskCompleted hooks when marking a task as completed
                if (status === 'completed') {
                    const blockingErrors = [];
                    const generator = (0, hooks_js_1.executeTaskCompletedHooks)(taskId, existingTask.subject, existingTask.description, (0, teammate_js_1.getAgentName)(), (0, teammate_js_1.getTeamName)(), undefined, context?.abortController?.signal, undefined, context);
                    for await (const result of generator) {
                        if (result.blockingError) {
                            blockingErrors.push((0, hooks_js_1.getTaskCompletedHookMessage)(result.blockingError));
                        }
                    }
                    if (blockingErrors.length > 0) {
                        return {
                            data: {
                                success: false,
                                taskId,
                                updatedFields: [],
                                error: blockingErrors.join('\n'),
                            },
                        };
                    }
                }
                updates.status = status;
                updatedFields.push('status');
            }
        }
        if (Object.keys(updates).length > 0) {
            await (0, tasks_js_1.updateTask)(taskListId, taskId, updates);
        }
        // Notify new owner via mailbox when ownership changes
        if (updates.owner && (0, agentSwarmsEnabled_js_1.isAgentSwarmsEnabled)()) {
            const senderName = (0, teammate_js_1.getAgentName)() || 'team-lead';
            const senderColor = (0, teammate_js_1.getTeammateColor)();
            const assignmentMessage = JSON.stringify({
                type: 'task_assignment',
                taskId,
                subject: existingTask.subject,
                description: existingTask.description,
                assignedBy: senderName,
                timestamp: new Date().toISOString(),
            });
            await (0, teammateMailbox_js_1.writeToMailbox)(updates.owner, {
                from: senderName,
                text: assignmentMessage,
                timestamp: new Date().toISOString(),
                color: senderColor,
            }, taskListId);
        }
        // Add blocks if provided and not already present
        if (addBlocks && addBlocks.length > 0) {
            const newBlocks = addBlocks.filter(id => !existingTask.blocks.includes(id));
            for (const blockId of newBlocks) {
                await (0, tasks_js_1.blockTask)(taskListId, taskId, blockId);
            }
            if (newBlocks.length > 0) {
                updatedFields.push('blocks');
            }
        }
        // Add blockedBy if provided and not already present (reverse: the blocker blocks this task)
        if (addBlockedBy && addBlockedBy.length > 0) {
            const newBlockedBy = addBlockedBy.filter(id => !existingTask.blockedBy.includes(id));
            for (const blockerId of newBlockedBy) {
                await (0, tasks_js_1.blockTask)(taskListId, blockerId, taskId);
            }
            if (newBlockedBy.length > 0) {
                updatedFields.push('blockedBy');
            }
        }
        // Structural verification nudge: if the main-thread agent just closed
        // out a 3+ task list and none of those tasks was a verification step,
        // append a reminder to the tool result. Fires at the loop-exit moment
        // where skips happen ("when the last task closed, the loop exited").
        // Mirrors the TodoWriteTool nudge for V1 sessions; this covers V2
        // (interactive CLI). TaskUpdateToolOutput is @internal so this field
        // does not touch the public SDK surface.
        let verificationNudgeNeeded = false;
        if ((0, bun_bundle_1.feature)('VERIFICATION_AGENT') &&
            (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_hive_evidence', false) &&
            !context.agentId &&
            updates.status === 'completed') {
            const allTasks = await (0, tasks_js_1.listTasks)(taskListId);
            const allDone = allTasks.every(t => t.status === 'completed');
            if (allDone &&
                allTasks.length >= 3 &&
                !allTasks.some(t => /verif/i.test(t.subject))) {
                verificationNudgeNeeded = true;
            }
        }
        return {
            data: {
                success: true,
                taskId,
                updatedFields,
                statusChange: updates.status !== undefined
                    ? { from: existingTask.status, to: updates.status }
                    : undefined,
                verificationNudgeNeeded,
            },
        };
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        const { success, taskId, updatedFields, error, statusChange, verificationNudgeNeeded, } = content;
        if (!success) {
            // Return as non-error so it doesn't trigger sibling tool cancellation
            // in StreamingToolExecutor. "Task not found" is a benign condition
            // (e.g., task list already cleaned up) that the model can handle.
            return {
                tool_use_id: toolUseID,
                type: 'tool_result',
                content: error || `Task #${taskId} not found`,
            };
        }
        let resultContent = `Updated task #${taskId} ${updatedFields.join(', ')}`;
        // Add reminder for teammates when they complete a task (supports in-process teammates)
        if (statusChange?.to === 'completed' &&
            (0, teammate_js_1.getAgentId)() &&
            (0, agentSwarmsEnabled_js_1.isAgentSwarmsEnabled)()) {
            resultContent +=
                '\n\nTask completed. Call TaskList now to find your next available task or see if your work unblocked others.';
        }
        if (verificationNudgeNeeded) {
            resultContent += `\n\nNOTE: You just closed out 3+ tasks and none of them was a verification step. Before writing your final summary, spawn the verification agent (subagent_type="${constants_js_1.VERIFICATION_AGENT_TYPE}"). You cannot self-assign PARTIAL by listing caveats in your summary — only the verifier issues a verdict.`;
        }
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: resultContent,
        };
    },
});
