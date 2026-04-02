"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resumeAgentBackground = resumeAgentBackground;
const fs_1 = require("fs");
const state_js_1 = require("../../bootstrap/state.js");
const prompts_js_1 = require("../../constants/prompts.js");
const coordinatorMode_js_1 = require("../../coordinator/coordinatorMode.js");
const LocalAgentTask_js_1 = require("../../tasks/LocalAgentTask/LocalAgentTask.js");
const tools_js_1 = require("../../tools.js");
const ids_js_1 = require("../../types/ids.js");
const agentContext_js_1 = require("../../utils/agentContext.js");
const cwd_js_1 = require("../../utils/cwd.js");
const debug_js_1 = require("../../utils/debug.js");
const messages_js_1 = require("../../utils/messages.js");
const agent_js_1 = require("../../utils/model/agent.js");
const promptCategory_js_1 = require("../../utils/promptCategory.js");
const sessionStorage_js_1 = require("../../utils/sessionStorage.js");
const systemPrompt_js_1 = require("../../utils/systemPrompt.js");
const diskOutput_js_1 = require("../../utils/task/diskOutput.js");
const teammate_js_1 = require("../../utils/teammate.js");
const toolResultStorage_js_1 = require("../../utils/toolResultStorage.js");
const agentToolUtils_js_1 = require("./agentToolUtils.js");
const generalPurposeAgent_js_1 = require("./built-in/generalPurposeAgent.js");
const forkSubagent_js_1 = require("./forkSubagent.js");
const loadAgentsDir_js_1 = require("./loadAgentsDir.js");
const runAgent_js_1 = require("./runAgent.js");
async function resumeAgentBackground({ agentId, prompt, toolUseContext, canUseTool, invokingRequestId, }) {
    const startTime = Date.now();
    const appState = toolUseContext.getAppState();
    // In-process teammates get a no-op setAppState; setAppStateForTasks
    // reaches the root store so task registration/progress/kill stay visible.
    const rootSetAppState = toolUseContext.setAppStateForTasks ?? toolUseContext.setAppState;
    const permissionMode = appState.toolPermissionContext.mode;
    const [transcript, meta] = await Promise.all([
        (0, sessionStorage_js_1.getAgentTranscript)((0, ids_js_1.asAgentId)(agentId)),
        (0, sessionStorage_js_1.readAgentMetadata)((0, ids_js_1.asAgentId)(agentId)),
    ]);
    if (!transcript) {
        throw new Error(`No transcript found for agent ID: ${agentId}`);
    }
    const resumedMessages = (0, messages_js_1.filterWhitespaceOnlyAssistantMessages)((0, messages_js_1.filterOrphanedThinkingOnlyMessages)((0, messages_js_1.filterUnresolvedToolUses)(transcript.messages)));
    const resumedReplacementState = (0, toolResultStorage_js_1.reconstructForSubagentResume)(toolUseContext.contentReplacementState, resumedMessages, transcript.contentReplacements);
    // Best-effort: if the original worktree was removed externally, fall back
    // to parent cwd rather than crashing on chdir later.
    const resumedWorktreePath = meta?.worktreePath
        ? await fs_1.promises.stat(meta.worktreePath).then(s => (s.isDirectory() ? meta.worktreePath : undefined), () => {
            (0, debug_js_1.logForDebugging)(`Resumed worktree ${meta.worktreePath} no longer exists; falling back to parent cwd`);
            return undefined;
        })
        : undefined;
    if (resumedWorktreePath) {
        // Bump mtime so stale-worktree cleanup doesn't delete a just-resumed worktree (#22355)
        const now = new Date();
        await fs_1.promises.utimes(resumedWorktreePath, now, now);
    }
    // Skip filterDeniedAgents re-gating — original spawn already passed permission checks
    let selectedAgent;
    let isResumedFork = false;
    if (meta?.agentType === forkSubagent_js_1.FORK_AGENT.agentType) {
        selectedAgent = forkSubagent_js_1.FORK_AGENT;
        isResumedFork = true;
    }
    else if (meta?.agentType) {
        const found = toolUseContext.options.agentDefinitions.activeAgents.find(a => a.agentType === meta.agentType);
        selectedAgent = found ?? generalPurposeAgent_js_1.GENERAL_PURPOSE_AGENT;
    }
    else {
        selectedAgent = generalPurposeAgent_js_1.GENERAL_PURPOSE_AGENT;
    }
    const uiDescription = meta?.description ?? '(resumed)';
    let forkParentSystemPrompt;
    if (isResumedFork) {
        if (toolUseContext.renderedSystemPrompt) {
            forkParentSystemPrompt = toolUseContext.renderedSystemPrompt;
        }
        else {
            const mainThreadAgentDefinition = appState.agent
                ? appState.agentDefinitions.activeAgents.find(a => a.agentType === appState.agent)
                : undefined;
            const additionalWorkingDirectories = Array.from(appState.toolPermissionContext.additionalWorkingDirectories.keys());
            const defaultSystemPrompt = await (0, prompts_js_1.getSystemPrompt)(toolUseContext.options.tools, toolUseContext.options.mainLoopModel, additionalWorkingDirectories, toolUseContext.options.mcpClients);
            forkParentSystemPrompt = (0, systemPrompt_js_1.buildEffectiveSystemPrompt)({
                mainThreadAgentDefinition,
                toolUseContext,
                customSystemPrompt: toolUseContext.options.customSystemPrompt,
                defaultSystemPrompt,
                appendSystemPrompt: toolUseContext.options.appendSystemPrompt,
            });
        }
        if (!forkParentSystemPrompt) {
            throw new Error('Cannot resume fork agent: unable to reconstruct parent system prompt');
        }
    }
    // Resolve model for analytics metadata (runAgent resolves its own internally)
    const resolvedAgentModel = (0, agent_js_1.getAgentModel)(selectedAgent.model, toolUseContext.options.mainLoopModel, undefined, permissionMode);
    const workerPermissionContext = {
        ...appState.toolPermissionContext,
        mode: selectedAgent.permissionMode ?? 'acceptEdits',
    };
    const workerTools = isResumedFork
        ? toolUseContext.options.tools
        : (0, tools_js_1.assembleToolPool)(workerPermissionContext, appState.mcp.tools);
    const runAgentParams = {
        agentDefinition: selectedAgent,
        promptMessages: [
            ...resumedMessages,
            (0, messages_js_1.createUserMessage)({ content: prompt }),
        ],
        toolUseContext,
        canUseTool,
        isAsync: true,
        querySource: (0, promptCategory_js_1.getQuerySourceForAgent)(selectedAgent.agentType, (0, loadAgentsDir_js_1.isBuiltInAgent)(selectedAgent)),
        model: undefined,
        // Fork resume: pass parent's system prompt (cache-identical prefix).
        // Non-fork: undefined → runAgent recomputes under wrapWithCwd so
        // getCwd() sees resumedWorktreePath.
        override: isResumedFork
            ? { systemPrompt: forkParentSystemPrompt }
            : undefined,
        availableTools: workerTools,
        // Transcript already contains the parent context slice from the
        // original fork. Re-supplying it would cause duplicate tool_use IDs.
        forkContextMessages: undefined,
        ...(isResumedFork && { useExactTools: true }),
        // Re-persist so metadata survives runAgent's writeAgentMetadata overwrite
        worktreePath: resumedWorktreePath,
        description: meta?.description,
        contentReplacementState: resumedReplacementState,
    };
    // Skip name-registry write — original entry persists from the initial spawn
    const agentBackgroundTask = (0, LocalAgentTask_js_1.registerAsyncAgent)({
        agentId,
        description: uiDescription,
        prompt,
        selectedAgent,
        setAppState: rootSetAppState,
        toolUseId: toolUseContext.toolUseId,
    });
    const metadata = {
        prompt,
        resolvedAgentModel,
        isBuiltInAgent: (0, loadAgentsDir_js_1.isBuiltInAgent)(selectedAgent),
        startTime,
        agentType: selectedAgent.agentType,
        isAsync: true,
    };
    const asyncAgentContext = {
        agentId,
        parentSessionId: (0, teammate_js_1.getParentSessionId)(),
        agentType: 'subagent',
        subagentName: selectedAgent.agentType,
        isBuiltIn: (0, loadAgentsDir_js_1.isBuiltInAgent)(selectedAgent),
        invokingRequestId,
        invocationKind: 'resume',
        invocationEmitted: false,
    };
    const wrapWithCwd = (fn) => resumedWorktreePath ? (0, cwd_js_1.runWithCwdOverride)(resumedWorktreePath, fn) : fn();
    void (0, agentContext_js_1.runWithAgentContext)(asyncAgentContext, () => wrapWithCwd(() => (0, agentToolUtils_js_1.runAsyncAgentLifecycle)({
        taskId: agentBackgroundTask.agentId,
        abortController: agentBackgroundTask.abortController,
        makeStream: onCacheSafeParams => (0, runAgent_js_1.runAgent)({
            ...runAgentParams,
            override: {
                ...runAgentParams.override,
                agentId: (0, ids_js_1.asAgentId)(agentBackgroundTask.agentId),
                abortController: agentBackgroundTask.abortController,
            },
            onCacheSafeParams,
        }),
        metadata,
        description: uiDescription,
        toolUseContext,
        rootSetAppState,
        agentIdForCleanup: agentId,
        enableSummarization: (0, coordinatorMode_js_1.isCoordinatorMode)() ||
            (0, forkSubagent_js_1.isForkSubagentEnabled)() ||
            (0, state_js_1.getSdkAgentProgressSummariesEnabled)(),
        getWorktreeResult: async () => resumedWorktreePath ? { worktreePath: resumedWorktreePath } : {},
    })));
    return {
        agentId,
        description: uiDescription,
        outputFile: (0, diskOutput_js_1.getTaskOutputPath)(agentId),
    };
}
