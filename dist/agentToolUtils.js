"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentToolResultSchema = void 0;
exports.filterToolsForAgent = filterToolsForAgent;
exports.resolveAgentTools = resolveAgentTools;
exports.countToolUses = countToolUses;
exports.finalizeAgentTool = finalizeAgentTool;
exports.getLastToolUseName = getLastToolUseName;
exports.emitTaskProgress = emitTaskProgress;
exports.classifyHandoffIfNeeded = classifyHandoffIfNeeded;
exports.extractPartialResult = extractPartialResult;
exports.runAsyncAgentLifecycle = runAsyncAgentLifecycle;
const bun_bundle_1 = require("bun:bundle");
const v4_1 = require("zod/v4");
const state_js_1 = require("../../bootstrap/state.js");
const tools_js_1 = require("../../constants/tools.js");
const agentSummary_js_1 = require("../../services/AgentSummary/agentSummary.js");
const index_js_1 = require("../../services/analytics/index.js");
const dumpPrompts_js_1 = require("../../services/api/dumpPrompts.js");
const Tool_js_1 = require("../../Tool.js");
const LocalAgentTask_js_1 = require("../../tasks/LocalAgentTask/LocalAgentTask.js");
const ids_js_1 = require("../../types/ids.js");
const agentSwarmsEnabled_js_1 = require("../../utils/agentSwarmsEnabled.js");
const debug_js_1 = require("../../utils/debug.js");
const envUtils_js_1 = require("../../utils/envUtils.js");
const errors_js_1 = require("../../utils/errors.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const messages_js_1 = require("../../utils/messages.js");
const permissionRuleParser_js_1 = require("../../utils/permissions/permissionRuleParser.js");
const yoloClassifier_js_1 = require("../../utils/permissions/yoloClassifier.js");
const sdkProgress_js_1 = require("../../utils/task/sdkProgress.js");
const teammateContext_js_1 = require("../../utils/teammateContext.js");
const tokens_js_1 = require("../../utils/tokens.js");
const constants_js_1 = require("../ExitPlanModeTool/constants.js");
const constants_js_2 = require("./constants.js");
function filterToolsForAgent({ tools, isBuiltIn, isAsync = false, permissionMode, }) {
    return tools.filter(tool => {
        // Allow MCP tools for all agents
        if (tool.name.startsWith('mcp__')) {
            return true;
        }
        // Allow ExitPlanMode for agents in plan mode (e.g., in-process teammates)
        // This bypasses both the ALL_AGENT_DISALLOWED_TOOLS and async tool filters
        if ((0, Tool_js_1.toolMatchesName)(tool, constants_js_1.EXIT_PLAN_MODE_V2_TOOL_NAME) &&
            permissionMode === 'plan') {
            return true;
        }
        if (tools_js_1.ALL_AGENT_DISALLOWED_TOOLS.has(tool.name)) {
            return false;
        }
        if (!isBuiltIn && tools_js_1.CUSTOM_AGENT_DISALLOWED_TOOLS.has(tool.name)) {
            return false;
        }
        if (isAsync && !tools_js_1.ASYNC_AGENT_ALLOWED_TOOLS.has(tool.name)) {
            if ((0, agentSwarmsEnabled_js_1.isAgentSwarmsEnabled)() && (0, teammateContext_js_1.isInProcessTeammate)()) {
                // Allow AgentTool for in-process teammates to spawn sync subagents.
                // Validation in AgentTool.call() prevents background agents and teammate spawning.
                if ((0, Tool_js_1.toolMatchesName)(tool, constants_js_2.AGENT_TOOL_NAME)) {
                    return true;
                }
                // Allow task tools for in-process teammates to coordinate via shared task list
                if (tools_js_1.IN_PROCESS_TEAMMATE_ALLOWED_TOOLS.has(tool.name)) {
                    return true;
                }
            }
            return false;
        }
        return true;
    });
}
/**
 * Resolves and validates agent tools against available tools
 * Handles wildcard expansion and validation in one place
 */
function resolveAgentTools(agentDefinition, availableTools, isAsync = false, isMainThread = false) {
    const { tools: agentTools, disallowedTools, source, permissionMode, } = agentDefinition;
    // When isMainThread is true, skip filterToolsForAgent entirely — the main
    // thread's tool pool is already properly assembled by useMergedTools(), so
    // the sub-agent disallow lists shouldn't apply.
    const filteredAvailableTools = isMainThread
        ? availableTools
        : filterToolsForAgent({
            tools: availableTools,
            isBuiltIn: source === 'built-in',
            isAsync,
            permissionMode,
        });
    // Create a set of disallowed tool names for quick lookup
    const disallowedToolSet = new Set(disallowedTools?.map(toolSpec => {
        const { toolName } = (0, permissionRuleParser_js_1.permissionRuleValueFromString)(toolSpec);
        return toolName;
    }) ?? []);
    // Filter available tools based on disallowed list
    const allowedAvailableTools = filteredAvailableTools.filter(tool => !disallowedToolSet.has(tool.name));
    // If tools is undefined or ['*'], allow all tools (after filtering disallowed)
    const hasWildcard = agentTools === undefined ||
        (agentTools.length === 1 && agentTools[0] === '*');
    if (hasWildcard) {
        return {
            hasWildcard: true,
            validTools: [],
            invalidTools: [],
            resolvedTools: allowedAvailableTools,
        };
    }
    const availableToolMap = new Map();
    for (const tool of allowedAvailableTools) {
        availableToolMap.set(tool.name, tool);
    }
    const validTools = [];
    const invalidTools = [];
    const resolved = [];
    const resolvedToolsSet = new Set();
    let allowedAgentTypes;
    for (const toolSpec of agentTools) {
        // Parse the tool spec to extract the base tool name and any permission pattern
        const { toolName, ruleContent } = (0, permissionRuleParser_js_1.permissionRuleValueFromString)(toolSpec);
        // Special case: Agent tool carries allowedAgentTypes metadata in its spec
        if (toolName === constants_js_2.AGENT_TOOL_NAME) {
            if (ruleContent) {
                // Parse comma-separated agent types: "worker, researcher" → ["worker", "researcher"]
                allowedAgentTypes = ruleContent.split(',').map(s => s.trim());
            }
            // For sub-agents, Agent is excluded by filterToolsForAgent — mark the spec
            // valid for allowedAgentTypes tracking but skip tool resolution.
            if (!isMainThread) {
                validTools.push(toolSpec);
                continue;
            }
            // For main thread, filtering was skipped so Agent is in availableToolMap —
            // fall through to normal resolution below.
        }
        const tool = availableToolMap.get(toolName);
        if (tool) {
            validTools.push(toolSpec);
            if (!resolvedToolsSet.has(tool)) {
                resolved.push(tool);
                resolvedToolsSet.add(tool);
            }
        }
        else {
            invalidTools.push(toolSpec);
        }
    }
    return {
        hasWildcard: false,
        validTools,
        invalidTools,
        resolvedTools: resolved,
        allowedAgentTypes,
    };
}
exports.agentToolResultSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    agentId: v4_1.z.string(),
    // Optional: older persisted sessions won't have this (resume replays
    // results verbatim without re-validation). Used to gate the sync
    // result trailer — one-shot built-ins skip the SendMessage hint.
    agentType: v4_1.z.string().optional(),
    content: v4_1.z.array(v4_1.z.object({ type: v4_1.z.literal('text'), text: v4_1.z.string() })),
    totalToolUseCount: v4_1.z.number(),
    totalDurationMs: v4_1.z.number(),
    totalTokens: v4_1.z.number(),
    usage: v4_1.z.object({
        input_tokens: v4_1.z.number(),
        output_tokens: v4_1.z.number(),
        cache_creation_input_tokens: v4_1.z.number().nullable(),
        cache_read_input_tokens: v4_1.z.number().nullable(),
        server_tool_use: v4_1.z
            .object({
            web_search_requests: v4_1.z.number(),
            web_fetch_requests: v4_1.z.number(),
        })
            .nullable(),
        service_tier: v4_1.z.enum(['standard', 'priority', 'batch']).nullable(),
        cache_creation: v4_1.z
            .object({
            ephemeral_1h_input_tokens: v4_1.z.number(),
            ephemeral_5m_input_tokens: v4_1.z.number(),
        })
            .nullable(),
    }),
}));
function countToolUses(messages) {
    let count = 0;
    for (const m of messages) {
        if (m.type === 'assistant') {
            for (const block of m.message.content) {
                if (block.type === 'tool_use') {
                    count++;
                }
            }
        }
    }
    return count;
}
function finalizeAgentTool(agentMessages, agentId, metadata) {
    const { prompt, resolvedAgentModel, isBuiltInAgent, startTime, agentType, isAsync, } = metadata;
    const lastAssistantMessage = (0, messages_js_1.getLastAssistantMessage)(agentMessages);
    if (lastAssistantMessage === undefined) {
        throw new Error('No assistant messages found');
    }
    // Extract text content from the agent's response. If the final assistant
    // message is a pure tool_use block (loop exited mid-turn), fall back to
    // the most recent assistant message that has text content.
    let content = lastAssistantMessage.message.content.filter(_ => _.type === 'text');
    if (content.length === 0) {
        for (let i = agentMessages.length - 1; i >= 0; i--) {
            const m = agentMessages[i];
            if (m.type !== 'assistant')
                continue;
            const textBlocks = m.message.content.filter(_ => _.type === 'text');
            if (textBlocks.length > 0) {
                content = textBlocks;
                break;
            }
        }
    }
    const totalTokens = (0, tokens_js_1.getTokenCountFromUsage)(lastAssistantMessage.message.usage);
    const totalToolUseCount = countToolUses(agentMessages);
    (0, index_js_1.logEvent)('tengu_agent_tool_completed', {
        agent_type: agentType,
        model: resolvedAgentModel,
        prompt_char_count: prompt.length,
        response_char_count: content.length,
        assistant_message_count: agentMessages.length,
        total_tool_uses: totalToolUseCount,
        duration_ms: Date.now() - startTime,
        total_tokens: totalTokens,
        is_built_in_agent: isBuiltInAgent,
        is_async: isAsync,
    });
    // Signal to inference that this subagent's cache chain can be evicted.
    const lastRequestId = lastAssistantMessage.requestId;
    if (lastRequestId) {
        (0, index_js_1.logEvent)('tengu_cache_eviction_hint', {
            scope: 'subagent_end',
            last_request_id: lastRequestId,
        });
    }
    return {
        agentId,
        agentType,
        content,
        totalDurationMs: Date.now() - startTime,
        totalTokens,
        totalToolUseCount,
        usage: lastAssistantMessage.message.usage,
    };
}
/**
 * Returns the name of the last tool_use block in an assistant message,
 * or undefined if the message is not an assistant message with tool_use.
 */
function getLastToolUseName(message) {
    if (message.type !== 'assistant')
        return undefined;
    const block = message.message.content.findLast(b => b.type === 'tool_use');
    return block?.type === 'tool_use' ? block.name : undefined;
}
function emitTaskProgress(tracker, taskId, toolUseId, description, startTime, lastToolName) {
    const progress = (0, LocalAgentTask_js_1.getProgressUpdate)(tracker);
    (0, sdkProgress_js_1.emitTaskProgress)({
        taskId,
        toolUseId,
        description: progress.lastActivity?.activityDescription ?? description,
        startTime,
        totalTokens: progress.tokenCount,
        toolUses: progress.toolUseCount,
        lastToolName,
    });
}
async function classifyHandoffIfNeeded({ agentMessages, tools, toolPermissionContext, abortSignal, subagentType, totalToolUseCount, }) {
    if ((0, bun_bundle_1.feature)('TRANSCRIPT_CLASSIFIER')) {
        if (toolPermissionContext.mode !== 'auto')
            return null;
        const agentTranscript = (0, yoloClassifier_js_1.buildTranscriptForClassifier)(agentMessages, tools);
        if (!agentTranscript)
            return null;
        const classifierResult = await (0, yoloClassifier_js_1.classifyYoloAction)(agentMessages, {
            role: 'user',
            content: [
                {
                    type: 'text',
                    text: "Sub-agent has finished and is handing back control to the main agent. Review the sub-agent's work based on the block rules and let the main agent know if any file is dangerous (the main agent will see the reason).",
                },
            ],
        }, tools, toolPermissionContext, abortSignal);
        const handoffDecision = classifierResult.unavailable
            ? 'unavailable'
            : classifierResult.shouldBlock
                ? 'blocked'
                : 'allowed';
        (0, index_js_1.logEvent)('tengu_auto_mode_decision', {
            decision: handoffDecision,
            toolName: 
            // Use legacy name for analytics continuity across the Task→Agent rename
            constants_js_2.LEGACY_AGENT_TOOL_NAME,
            inProtectedNamespace: (0, envUtils_js_1.isInProtectedNamespace)(),
            classifierModel: classifierResult.model,
            agentType: subagentType,
            toolUseCount: totalToolUseCount,
            isHandoff: true,
            // For handoff, the relevant agent completion is the subagent's final
            // assistant message — the last thing the classifier transcript shows
            // before the handoff review prompt.
            agentMsgId: (0, messages_js_1.getLastAssistantMessage)(agentMessages)?.message
                .id,
            classifierStage: classifierResult.stage,
            classifierStage1RequestId: classifierResult.stage1RequestId,
            classifierStage1MsgId: classifierResult.stage1MsgId,
            classifierStage2RequestId: classifierResult.stage2RequestId,
            classifierStage2MsgId: classifierResult.stage2MsgId,
        });
        if (classifierResult.shouldBlock) {
            // When classifier is unavailable, still propagate the sub-agent's
            // results but with a warning so the parent agent can verify the work.
            if (classifierResult.unavailable) {
                (0, debug_js_1.logForDebugging)('Handoff classifier unavailable, allowing sub-agent output with warning', { level: 'warn' });
                return `Note: The safety classifier was unavailable when reviewing this sub-agent's work. Please carefully verify the sub-agent's actions and output before acting on them.`;
            }
            (0, debug_js_1.logForDebugging)(`Handoff classifier flagged sub-agent output: ${classifierResult.reason}`, { level: 'warn' });
            return `SECURITY WARNING: This sub-agent performed actions that may violate security policy. Reason: ${classifierResult.reason}. Review the sub-agent's actions carefully before acting on its output.`;
        }
    }
    return null;
}
/**
 * Extract a partial result string from an agent's accumulated messages.
 * Used when an async agent is killed to preserve what it accomplished.
 * Returns undefined if no text content is found.
 */
function extractPartialResult(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.type !== 'assistant')
            continue;
        const text = (0, messages_js_1.extractTextContent)(m.message.content, '\n');
        if (text) {
            return text;
        }
    }
    return undefined;
}
/**
 * Drives a background agent from spawn to terminal notification.
 * Shared between AgentTool's async-from-start path and resumeAgentBackground.
 */
async function runAsyncAgentLifecycle({ taskId, abortController, makeStream, metadata, description, toolUseContext, rootSetAppState, agentIdForCleanup, enableSummarization, getWorktreeResult, }) {
    let stopSummarization;
    const agentMessages = [];
    try {
        const tracker = (0, LocalAgentTask_js_1.createProgressTracker)();
        const resolveActivity = (0, LocalAgentTask_js_1.createActivityDescriptionResolver)(toolUseContext.options.tools);
        const onCacheSafeParams = enableSummarization
            ? (params) => {
                const { stop } = (0, agentSummary_js_1.startAgentSummarization)(taskId, (0, ids_js_1.asAgentId)(taskId), params, rootSetAppState);
                stopSummarization = stop;
            }
            : undefined;
        for await (const message of makeStream(onCacheSafeParams)) {
            agentMessages.push(message);
            // Append immediately when UI holds the task (retain). Bootstrap reads
            // disk in parallel and UUID-merges the prefix — disk-write-before-yield
            // means live is always a suffix of disk, so merge is order-correct.
            rootSetAppState(prev => {
                const t = prev.tasks[taskId];
                if (!(0, LocalAgentTask_js_1.isLocalAgentTask)(t) || !t.retain)
                    return prev;
                const base = t.messages ?? [];
                return {
                    ...prev,
                    tasks: {
                        ...prev.tasks,
                        [taskId]: { ...t, messages: [...base, message] },
                    },
                };
            });
            (0, LocalAgentTask_js_1.updateProgressFromMessage)(tracker, message, resolveActivity, toolUseContext.options.tools);
            (0, LocalAgentTask_js_1.updateAgentProgress)(taskId, (0, LocalAgentTask_js_1.getProgressUpdate)(tracker), rootSetAppState);
            const lastToolName = getLastToolUseName(message);
            if (lastToolName) {
                emitTaskProgress(tracker, taskId, toolUseContext.toolUseId, description, metadata.startTime, lastToolName);
            }
        }
        stopSummarization?.();
        const agentResult = finalizeAgentTool(agentMessages, taskId, metadata);
        // Mark task completed FIRST so TaskOutput(block=true) unblocks
        // immediately. classifyHandoffIfNeeded (API call) and getWorktreeResult
        // (git exec) are notification embellishments that can hang — they must
        // not gate the status transition (gh-20236).
        (0, LocalAgentTask_js_1.completeAgentTask)(agentResult, rootSetAppState);
        let finalMessage = (0, messages_js_1.extractTextContent)(agentResult.content, '\n');
        if ((0, bun_bundle_1.feature)('TRANSCRIPT_CLASSIFIER')) {
            const handoffWarning = await classifyHandoffIfNeeded({
                agentMessages,
                tools: toolUseContext.options.tools,
                toolPermissionContext: toolUseContext.getAppState().toolPermissionContext,
                abortSignal: abortController.signal,
                subagentType: metadata.agentType,
                totalToolUseCount: agentResult.totalToolUseCount,
            });
            if (handoffWarning) {
                finalMessage = `${handoffWarning}\n\n${finalMessage}`;
            }
        }
        const worktreeResult = await getWorktreeResult();
        (0, LocalAgentTask_js_1.enqueueAgentNotification)({
            taskId,
            description,
            status: 'completed',
            setAppState: rootSetAppState,
            finalMessage,
            usage: {
                totalTokens: (0, LocalAgentTask_js_1.getTokenCountFromTracker)(tracker),
                toolUses: agentResult.totalToolUseCount,
                durationMs: agentResult.totalDurationMs,
            },
            toolUseId: toolUseContext.toolUseId,
            ...worktreeResult,
        });
    }
    catch (error) {
        stopSummarization?.();
        if (error instanceof errors_js_1.AbortError) {
            // killAsyncAgent is a no-op if TaskStop already set status='killed' —
            // but only this catch handler has agentMessages, so the notification
            // must fire unconditionally. Transition status BEFORE worktree cleanup
            // so TaskOutput unblocks even if git hangs (gh-20236).
            (0, LocalAgentTask_js_1.killAsyncAgent)(taskId, rootSetAppState);
            (0, index_js_1.logEvent)('tengu_agent_tool_terminated', {
                agent_type: metadata.agentType,
                model: metadata.resolvedAgentModel,
                duration_ms: Date.now() - metadata.startTime,
                is_async: true,
                is_built_in_agent: metadata.isBuiltInAgent,
                reason: 'user_kill_async',
            });
            const worktreeResult = await getWorktreeResult();
            const partialResult = extractPartialResult(agentMessages);
            (0, LocalAgentTask_js_1.enqueueAgentNotification)({
                taskId,
                description,
                status: 'killed',
                setAppState: rootSetAppState,
                toolUseId: toolUseContext.toolUseId,
                finalMessage: partialResult,
                ...worktreeResult,
            });
            return;
        }
        const msg = (0, errors_js_1.errorMessage)(error);
        (0, LocalAgentTask_js_1.failAgentTask)(taskId, msg, rootSetAppState);
        const worktreeResult = await getWorktreeResult();
        (0, LocalAgentTask_js_1.enqueueAgentNotification)({
            taskId,
            description,
            status: 'failed',
            error: msg,
            setAppState: rootSetAppState,
            toolUseId: toolUseContext.toolUseId,
            ...worktreeResult,
        });
    }
    finally {
        (0, state_js_1.clearInvokedSkillsForAgent)(agentIdForCleanup);
        (0, dumpPrompts_js_1.clearDumpState)(agentIdForCleanup);
    }
}
