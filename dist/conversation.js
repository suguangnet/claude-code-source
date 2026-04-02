"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearConversation = clearConversation;
/**
 * Conversation clearing utility.
 * This module has heavier dependencies and should be lazy-loaded when possible.
 */
const bun_bundle_1 = require("bun:bundle");
const crypto_1 = require("crypto");
const state_js_1 = require("../../bootstrap/state.js");
const index_js_1 = require("../../services/analytics/index.js");
const types_js_1 = require("../../tasks/InProcessTeammateTask/types.js");
const LocalAgentTask_js_1 = require("../../tasks/LocalAgentTask/LocalAgentTask.js");
const guards_js_1 = require("../../tasks/LocalShellTask/guards.js");
const ids_js_1 = require("../../types/ids.js");
const commitAttribution_js_1 = require("../../utils/commitAttribution.js");
const hooks_js_1 = require("../../utils/hooks.js");
const log_js_1 = require("../../utils/log.js");
const plans_js_1 = require("../../utils/plans.js");
const Shell_js_1 = require("../../utils/Shell.js");
const sessionStart_js_1 = require("../../utils/sessionStart.js");
const sessionStorage_js_1 = require("../../utils/sessionStorage.js");
const diskOutput_js_1 = require("../../utils/task/diskOutput.js");
const worktree_js_1 = require("../../utils/worktree.js");
const caches_js_1 = require("./caches.js");
async function clearConversation({ setMessages, readFileState, discoveredSkillNames, loadedNestedMemoryPaths, getAppState, setAppState, setConversationId, }) {
    // Execute SessionEnd hooks before clearing (bounded by
    // CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS, default 1.5s)
    const sessionEndTimeoutMs = (0, hooks_js_1.getSessionEndHookTimeoutMs)();
    await (0, hooks_js_1.executeSessionEndHooks)('clear', {
        getAppState,
        setAppState,
        signal: AbortSignal.timeout(sessionEndTimeoutMs),
        timeoutMs: sessionEndTimeoutMs,
    });
    // Signal to inference that this conversation's cache can be evicted.
    const lastRequestId = (0, state_js_1.getLastMainRequestId)();
    if (lastRequestId) {
        (0, index_js_1.logEvent)('tengu_cache_eviction_hint', {
            scope: 'conversation_clear',
            last_request_id: lastRequestId,
        });
    }
    // Compute preserved tasks up front so their per-agent state survives the
    // cache wipe below. A task is preserved unless it explicitly has
    // isBackgrounded === false. Main-session tasks (Ctrl+B) are preserved —
    // they write to an isolated per-task transcript and run under an agent
    // context, so they're safe across session ID regeneration. See
    // LocalMainSessionTask.ts startBackgroundSession.
    const preservedAgentIds = new Set();
    const preservedLocalAgents = [];
    const shouldKillTask = (task) => 'isBackgrounded' in task && task.isBackgrounded === false;
    if (getAppState) {
        for (const task of Object.values(getAppState().tasks)) {
            if (shouldKillTask(task))
                continue;
            if ((0, LocalAgentTask_js_1.isLocalAgentTask)(task)) {
                preservedAgentIds.add(task.agentId);
                preservedLocalAgents.push(task);
            }
            else if ((0, types_js_1.isInProcessTeammateTask)(task)) {
                preservedAgentIds.add(task.identity.agentId);
            }
        }
    }
    setMessages(() => []);
    // Clear context-blocked flag so proactive ticks resume after /clear
    if ((0, bun_bundle_1.feature)('PROACTIVE') || (0, bun_bundle_1.feature)('KAIROS')) {
        /* eslint-disable @typescript-eslint/no-require-imports */
        const { setContextBlocked } = require('../../proactive/index.js');
        /* eslint-enable @typescript-eslint/no-require-imports */
        setContextBlocked(false);
    }
    // Force logo re-render by updating conversationId
    if (setConversationId) {
        setConversationId((0, crypto_1.randomUUID)());
    }
    // Clear all session-related caches. Per-agent state for preserved background
    // tasks (invoked skills, pending permission callbacks, dump state, cache-break
    // tracking) is retained so those agents keep functioning.
    (0, caches_js_1.clearSessionCaches)(preservedAgentIds);
    (0, Shell_js_1.setCwd)((0, state_js_1.getOriginalCwd)());
    readFileState.clear();
    discoveredSkillNames?.clear();
    loadedNestedMemoryPaths?.clear();
    // Clean out necessary items from App State
    if (setAppState) {
        setAppState(prev => {
            // Partition tasks using the same predicate computed above:
            // kill+remove foreground tasks, preserve everything else.
            const nextTasks = {};
            for (const [taskId, task] of Object.entries(prev.tasks)) {
                if (!shouldKillTask(task)) {
                    nextTasks[taskId] = task;
                    continue;
                }
                // Foreground task: kill it and drop from state
                try {
                    if (task.status === 'running') {
                        if ((0, guards_js_1.isLocalShellTask)(task)) {
                            task.shellCommand?.kill();
                            task.shellCommand?.cleanup();
                            if (task.cleanupTimeoutId) {
                                clearTimeout(task.cleanupTimeoutId);
                            }
                        }
                        if ('abortController' in task) {
                            task.abortController?.abort();
                        }
                        if ('unregisterCleanup' in task) {
                            task.unregisterCleanup?.();
                        }
                    }
                }
                catch (error) {
                    (0, log_js_1.logError)(error);
                }
                void (0, diskOutput_js_1.evictTaskOutput)(taskId);
            }
            return {
                ...prev,
                tasks: nextTasks,
                attribution: (0, commitAttribution_js_1.createEmptyAttributionState)(),
                // Clear standalone agent context (name/color set by /rename, /color)
                // so the new session doesn't display the old session's identity badge
                standaloneAgentContext: undefined,
                fileHistory: {
                    snapshots: [],
                    trackedFiles: new Set(),
                    snapshotSequence: 0,
                },
                // Reset MCP state to default to trigger re-initialization.
                // Preserve pluginReconnectKey so /clear doesn't cause a no-op
                // (it's only bumped by /reload-plugins).
                mcp: {
                    clients: [],
                    tools: [],
                    commands: [],
                    resources: {},
                    pluginReconnectKey: prev.mcp.pluginReconnectKey,
                },
            };
        });
    }
    // Clear plan slug cache so a new plan file is used after /clear
    (0, plans_js_1.clearAllPlanSlugs)();
    // Clear cached session metadata (title, tag, agent name/color)
    // so the new session doesn't inherit the previous session's identity
    (0, sessionStorage_js_1.clearSessionMetadata)();
    // Generate new session ID to provide fresh state
    // Set the old session as parent for analytics lineage tracking
    (0, state_js_1.regenerateSessionId)({ setCurrentAsParent: true });
    // Update the environment variable so subprocesses use the new session ID
    if (process.env.USER_TYPE === 'ant' && process.env.CLAUDE_CODE_SESSION_ID) {
        process.env.CLAUDE_CODE_SESSION_ID = (0, state_js_1.getSessionId)();
    }
    await (0, sessionStorage_js_1.resetSessionFilePointer)();
    // Preserved local_agent tasks had their TaskOutput symlink baked against the
    // old session ID at spawn time, but post-clear transcript writes land under
    // the new session directory (appendEntry re-reads getSessionId()). Re-point
    // the symlinks so TaskOutput reads the live file instead of a frozen pre-clear
    // snapshot. Only re-point running tasks — finished tasks will never write
    // again, so re-pointing would replace a valid symlink with a dangling one.
    // Main-session tasks use the same per-agent path (they write via
    // recordSidechainTranscript to getAgentTranscriptPath), so no special case.
    for (const task of preservedLocalAgents) {
        if (task.status !== 'running')
            continue;
        void (0, diskOutput_js_1.initTaskOutputAsSymlink)(task.id, (0, sessionStorage_js_1.getAgentTranscriptPath)((0, ids_js_1.asAgentId)(task.agentId)));
    }
    // Re-persist mode and worktree state after the clear so future --resume
    // knows what the new post-clear session was in. clearSessionMetadata
    // wiped both from the cache, but the process is still in the same mode
    // and (if applicable) the same worktree directory.
    if ((0, bun_bundle_1.feature)('COORDINATOR_MODE')) {
        /* eslint-disable @typescript-eslint/no-require-imports */
        const { saveMode } = require('../../utils/sessionStorage.js');
        const { isCoordinatorMode, } = require('../../coordinator/coordinatorMode.js');
        /* eslint-enable @typescript-eslint/no-require-imports */
        saveMode(isCoordinatorMode() ? 'coordinator' : 'normal');
    }
    const worktreeSession = (0, worktree_js_1.getCurrentWorktreeSession)();
    if (worktreeSession) {
        (0, sessionStorage_js_1.saveWorktreeState)(worktreeSession);
    }
    // Execute SessionStart hooks after clearing
    const hookMessages = await (0, sessionStart_js_1.processSessionStartHooks)('clear');
    // Update messages with hook results
    if (hookMessages.length > 0) {
        setMessages(() => hookMessages);
    }
}
