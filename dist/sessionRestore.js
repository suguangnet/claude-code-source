"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.restoreSessionStateFromLog = restoreSessionStateFromLog;
exports.computeRestoredAttributionState = computeRestoredAttributionState;
exports.computeStandaloneAgentContext = computeStandaloneAgentContext;
exports.restoreAgentFromSession = restoreAgentFromSession;
exports.refreshAgentDefinitionsForModeSwitch = refreshAgentDefinitionsForModeSwitch;
exports.restoreWorktreeForResume = restoreWorktreeForResume;
exports.exitRestoredWorktree = exitRestoredWorktree;
exports.processResumedConversation = processResumedConversation;
const bun_bundle_1 = require("bun:bundle");
const path_1 = require("path");
const state_js_1 = require("../bootstrap/state.js");
const systemPromptSections_js_1 = require("../constants/systemPromptSections.js");
const cost_tracker_js_1 = require("../cost-tracker.js");
const loadAgentsDir_js_1 = require("../tools/AgentTool/loadAgentsDir.js");
const constants_js_1 = require("../tools/TodoWriteTool/constants.js");
const ids_js_1 = require("../types/ids.js");
const asciicast_js_1 = require("./asciicast.js");
const claudemd_js_1 = require("./claudemd.js");
const commitAttribution_js_1 = require("./commitAttribution.js");
const concurrentSessions_js_1 = require("./concurrentSessions.js");
const cwd_js_1 = require("./cwd.js");
const debug_js_1 = require("./debug.js");
const fileHistory_js_1 = require("./fileHistory.js");
const messages_js_1 = require("./messages.js");
const model_js_1 = require("./model/model.js");
const plans_js_1 = require("./plans.js");
const Shell_js_1 = require("./Shell.js");
const sessionStorage_js_1 = require("./sessionStorage.js");
const tasks_js_1 = require("./tasks.js");
const types_js_1 = require("./todo/types.js");
const worktree_js_1 = require("./worktree.js");
/**
 * Scan the transcript for the last TodoWrite tool_use block and return its todos.
 * Used to hydrate AppState.todos on SDK --resume so the model's todo list
 * survives session restarts without file persistence.
 */
function extractTodosFromTranscript(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg?.type !== 'assistant')
            continue;
        const toolUse = msg.message.content.find(block => block.type === 'tool_use' && block.name === constants_js_1.TODO_WRITE_TOOL_NAME);
        if (!toolUse || toolUse.type !== 'tool_use')
            continue;
        const input = toolUse.input;
        if (input === null || typeof input !== 'object')
            return [];
        const parsed = (0, types_js_1.TodoListSchema)().safeParse(input.todos);
        return parsed.success ? parsed.data : [];
    }
    return [];
}
/**
 * Restore session state (file history, attribution, todos) from log on resume.
 * Used by both SDK (print.ts) and interactive (REPL.tsx, main.tsx) resume paths.
 */
function restoreSessionStateFromLog(result, setAppState) {
    // Restore file history state
    if (result.fileHistorySnapshots && result.fileHistorySnapshots.length > 0) {
        (0, fileHistory_js_1.fileHistoryRestoreStateFromLog)(result.fileHistorySnapshots, newState => {
            setAppState(prev => ({ ...prev, fileHistory: newState }));
        });
    }
    // Restore attribution state (ant-only feature)
    if ((0, bun_bundle_1.feature)('COMMIT_ATTRIBUTION') &&
        result.attributionSnapshots &&
        result.attributionSnapshots.length > 0) {
        (0, commitAttribution_js_1.attributionRestoreStateFromLog)(result.attributionSnapshots, newState => {
            setAppState(prev => ({ ...prev, attribution: newState }));
        });
    }
    // Restore context-collapse commit log + staged snapshot. Must run before
    // the first query() so projectView() can rebuild the collapsed view from
    // the resumed Message[]. Called unconditionally (even with
    // undefined/empty entries) because restoreFromEntries resets the store
    // first — without that, an in-session /resume into a session with no
    // commits would leave the prior session's stale commit log intact.
    if ((0, bun_bundle_1.feature)('CONTEXT_COLLAPSE')) {
        /* eslint-disable @typescript-eslint/no-require-imports */
        ;
        require('../services/contextCollapse/persist.js').restoreFromEntries(result.contextCollapseCommits ?? [], result.contextCollapseSnapshot);
        /* eslint-enable @typescript-eslint/no-require-imports */
    }
    // Restore TodoWrite state from transcript (SDK/non-interactive only).
    // Interactive mode uses file-backed v2 tasks, so AppState.todos is unused there.
    if (!(0, tasks_js_1.isTodoV2Enabled)() && result.messages && result.messages.length > 0) {
        const todos = extractTodosFromTranscript(result.messages);
        if (todos.length > 0) {
            const agentId = (0, state_js_1.getSessionId)();
            setAppState(prev => ({
                ...prev,
                todos: { ...prev.todos, [agentId]: todos },
            }));
        }
    }
}
/**
 * Compute restored attribution state from log snapshots.
 * Used for computing initial state before render (e.g., main.tsx --continue).
 * Returns undefined if attribution feature is disabled or no snapshots exist.
 */
function computeRestoredAttributionState(result) {
    if ((0, bun_bundle_1.feature)('COMMIT_ATTRIBUTION') &&
        result.attributionSnapshots &&
        result.attributionSnapshots.length > 0) {
        return (0, commitAttribution_js_1.restoreAttributionStateFromSnapshots)(result.attributionSnapshots);
    }
    return undefined;
}
/**
 * Compute standalone agent context (name/color) for session resume.
 * Used for computing initial state before render (per CLAUDE.md guidelines).
 * Returns undefined if no name/color is set on the session.
 */
function computeStandaloneAgentContext(agentName, agentColor) {
    if (!agentName && !agentColor) {
        return undefined;
    }
    return {
        name: agentName ?? '',
        color: (agentColor === 'default' ? undefined : agentColor),
    };
}
/**
 * Restore agent setting from a resumed session.
 *
 * When resuming a conversation that used a custom agent, this re-applies the
 * agent type and model override (unless the user specified --agent on the CLI).
 * Mutates bootstrap state via setMainThreadAgentType / setMainLoopModelOverride.
 *
 * Returns the restored agent definition and its agentType string, or undefined
 * if no agent was restored.
 */
function restoreAgentFromSession(agentSetting, currentAgentDefinition, agentDefinitions) {
    // If user already specified --agent on CLI, keep that definition
    if (currentAgentDefinition) {
        return { agentDefinition: currentAgentDefinition, agentType: undefined };
    }
    // If session had no agent, clear any stale bootstrap state
    if (!agentSetting) {
        (0, state_js_1.setMainThreadAgentType)(undefined);
        return { agentDefinition: undefined, agentType: undefined };
    }
    const resumedAgent = agentDefinitions.activeAgents.find(agent => agent.agentType === agentSetting);
    if (!resumedAgent) {
        (0, debug_js_1.logForDebugging)(`Resumed session had agent "${agentSetting}" but it is no longer available. Using default behavior.`);
        (0, state_js_1.setMainThreadAgentType)(undefined);
        return { agentDefinition: undefined, agentType: undefined };
    }
    (0, state_js_1.setMainThreadAgentType)(resumedAgent.agentType);
    // Apply agent's model if user didn't specify one
    if (!(0, state_js_1.getMainLoopModelOverride)() &&
        resumedAgent.model &&
        resumedAgent.model !== 'inherit') {
        (0, state_js_1.setMainLoopModelOverride)((0, model_js_1.parseUserSpecifiedModel)(resumedAgent.model));
    }
    return { agentDefinition: resumedAgent, agentType: resumedAgent.agentType };
}
/**
 * Refresh agent definitions after a coordinator/normal mode switch.
 *
 * When resuming a session that was in a different mode (coordinator vs normal),
 * the built-in agents need to be re-derived to match the new mode. CLI-provided
 * agents (from --agents flag) are merged back in.
 */
async function refreshAgentDefinitionsForModeSwitch(modeWasSwitched, currentCwd, cliAgents, currentAgentDefinitions) {
    if (!(0, bun_bundle_1.feature)('COORDINATOR_MODE') || !modeWasSwitched) {
        return currentAgentDefinitions;
    }
    // Re-derive agent definitions after mode switch so built-in agents
    // reflect the new coordinator/normal mode
    loadAgentsDir_js_1.getAgentDefinitionsWithOverrides.cache.clear?.();
    const freshAgentDefs = await (0, loadAgentsDir_js_1.getAgentDefinitionsWithOverrides)(currentCwd);
    const freshAllAgents = [...freshAgentDefs.allAgents, ...cliAgents];
    return {
        ...freshAgentDefs,
        allAgents: freshAllAgents,
        activeAgents: (0, loadAgentsDir_js_1.getActiveAgentsFromList)(freshAllAgents),
    };
}
/**
 * Restore the worktree working directory on resume. The transcript records
 * the last worktree enter/exit; if the session crashed while inside a
 * worktree (last entry = session object, not null), cd back into it.
 *
 * process.chdir is the TOCTOU-safe existence check — it throws ENOENT if
 * the /exit dialog removed the directory, or if the user deleted it
 * manually between sessions.
 *
 * When --worktree already created a fresh worktree, that takes precedence
 * over the resumed session's state. restoreSessionMetadata just overwrote
 * project.currentSessionWorktree with the stale transcript value, so
 * re-assert the fresh worktree here before adoptResumedSessionFile writes
 * it back to disk.
 */
function restoreWorktreeForResume(worktreeSession) {
    const fresh = (0, worktree_js_1.getCurrentWorktreeSession)();
    if (fresh) {
        (0, sessionStorage_js_1.saveWorktreeState)(fresh);
        return;
    }
    if (!worktreeSession)
        return;
    try {
        process.chdir(worktreeSession.worktreePath);
    }
    catch {
        // Directory is gone. Override the stale cache so the next
        // reAppendSessionMetadata records "exited" instead of re-persisting
        // a path that no longer exists.
        (0, sessionStorage_js_1.saveWorktreeState)(null);
        return;
    }
    (0, Shell_js_1.setCwd)(worktreeSession.worktreePath);
    (0, state_js_1.setOriginalCwd)((0, cwd_js_1.getCwd)());
    // projectRoot is intentionally NOT set here. The transcript doesn't record
    // whether the worktree was entered via --worktree (which sets projectRoot)
    // or EnterWorktreeTool (which doesn't). Leaving projectRoot stable matches
    // EnterWorktreeTool's behavior — skills/history stay anchored to the
    // original project.
    (0, worktree_js_1.restoreWorktreeSession)(worktreeSession);
    // The /resume slash command calls this mid-session after caches have been
    // populated against the old cwd. Cheap no-ops for the CLI-flag path
    // (caches aren't populated yet there).
    (0, claudemd_js_1.clearMemoryFileCaches)();
    (0, systemPromptSections_js_1.clearSystemPromptSections)();
    plans_js_1.getPlansDirectory.cache.clear?.();
}
/**
 * Undo restoreWorktreeForResume before a mid-session /resume switches to
 * another session. Without this, /resume from a worktree session to a
 * non-worktree session leaves the user in the old worktree directory with
 * currentWorktreeSession still pointing at the prior session. /resume to a
 * *different* worktree fails entirely — the getCurrentWorktreeSession()
 * guard above blocks the switch.
 *
 * Not needed by CLI --resume/--continue: those run once at startup where
 * getCurrentWorktreeSession() is only truthy if --worktree was used (fresh
 * worktree that should take precedence, handled by the re-assert above).
 */
function exitRestoredWorktree() {
    const current = (0, worktree_js_1.getCurrentWorktreeSession)();
    if (!current)
        return;
    (0, worktree_js_1.restoreWorktreeSession)(null);
    // Worktree state changed, so cached prompt sections that reference it are
    // stale whether or not chdir succeeds below.
    (0, claudemd_js_1.clearMemoryFileCaches)();
    (0, systemPromptSections_js_1.clearSystemPromptSections)();
    plans_js_1.getPlansDirectory.cache.clear?.();
    try {
        process.chdir(current.originalCwd);
    }
    catch {
        // Original dir is gone (rare). Stay put — restoreWorktreeForResume
        // will cd into the target worktree next if there is one.
        return;
    }
    (0, Shell_js_1.setCwd)(current.originalCwd);
    (0, state_js_1.setOriginalCwd)((0, cwd_js_1.getCwd)());
}
/**
 * Process a loaded conversation for resume/continue.
 *
 * Handles coordinator mode matching, session ID setup, agent restoration,
 * mode persistence, and initial state computation. Called by both --continue
 * and --resume paths in main.tsx.
 */
async function processResumedConversation(result, opts, context) {
    // Match coordinator/normal mode to the resumed session
    let modeWarning;
    if ((0, bun_bundle_1.feature)('COORDINATOR_MODE')) {
        modeWarning = context.modeApi?.matchSessionMode(result.mode);
        if (modeWarning) {
            result.messages.push((0, messages_js_1.createSystemMessage)(modeWarning, 'warning'));
        }
    }
    // Reuse the resumed session's ID unless --fork-session is specified
    if (!opts.forkSession) {
        const sid = opts.sessionIdOverride ?? result.sessionId;
        if (sid) {
            // When resuming from a different project directory (git worktrees,
            // cross-project), transcriptPath points to the actual file; its dirname
            // is the project dir. Otherwise the session lives in the current project.
            (0, state_js_1.switchSession)((0, ids_js_1.asSessionId)(sid), opts.transcriptPath ? (0, path_1.dirname)(opts.transcriptPath) : null);
            // Rename asciicast recording to match the resumed session ID so
            // getSessionRecordingPaths() can discover it during /share
            await (0, asciicast_js_1.renameRecordingForSession)();
            await (0, sessionStorage_js_1.resetSessionFilePointer)();
            (0, cost_tracker_js_1.restoreCostStateForSession)(sid);
        }
    }
    else if (result.contentReplacements?.length) {
        // --fork-session keeps the fresh startup session ID. useLogMessages will
        // copy source messages into the new JSONL via recordTranscript, but
        // content-replacement entries are a separate entry type only written by
        // recordContentReplacement (which query.ts calls for newlyReplaced, never
        // the pre-loaded records). Without this seed, `claude -r {newSessionId}`
        // finds source tool_use_ids in messages but no matching replacement records
        // → they're classified as FROZEN → full content sent (cache miss, permanent
        // overage). insertContentReplacement stamps sessionId = getSessionId() =
        // the fresh ID, so loadTranscriptFile's keyed lookup will match.
        await (0, sessionStorage_js_1.recordContentReplacement)(result.contentReplacements);
    }
    // Restore session metadata so /status shows the saved name and metadata
    // is re-appended on session exit. Fork doesn't take ownership of the
    // original session's worktree — a "Remove" on the fork's exit dialog
    // would delete a worktree the original session still references — so
    // strip worktreeSession from the fork path so the cache stays unset.
    (0, sessionStorage_js_1.restoreSessionMetadata)(opts.forkSession ? { ...result, worktreeSession: undefined } : result);
    if (!opts.forkSession) {
        // Cd back into the worktree the session was in when it last exited.
        // Done after restoreSessionMetadata (which caches the worktree state
        // from the transcript) so if the directory is gone we can override
        // the cache before adoptResumedSessionFile writes it.
        restoreWorktreeForResume(result.worktreeSession);
        // Point sessionFile at the resumed transcript and re-append metadata
        // now. resetSessionFilePointer above nulled it (so the old fresh-session
        // path doesn't leak), but that blocks reAppendSessionMetadata — which
        // bails on null — from running in the exit cleanup handler. For fork,
        // useLogMessages populates a *new* file via recordTranscript on REPL
        // mount; the normal lazy-materialize path is correct there.
        (0, sessionStorage_js_1.adoptResumedSessionFile)();
    }
    // Restore context-collapse commit log + staged snapshot. The interactive
    // /resume path goes through restoreSessionStateFromLog (REPL.tsx); CLI
    // --continue/--resume goes through here instead. Called unconditionally
    // — see the restoreSessionStateFromLog callsite above for why.
    if ((0, bun_bundle_1.feature)('CONTEXT_COLLAPSE')) {
        /* eslint-disable @typescript-eslint/no-require-imports */
        ;
        require('../services/contextCollapse/persist.js').restoreFromEntries(result.contextCollapseCommits ?? [], result.contextCollapseSnapshot);
        /* eslint-enable @typescript-eslint/no-require-imports */
    }
    // Restore agent setting from resumed session
    const { agentDefinition: restoredAgent, agentType: resumedAgentType } = restoreAgentFromSession(result.agentSetting, context.mainThreadAgentDefinition, context.agentDefinitions);
    // Persist the current mode so future resumes know what mode this session was in
    if ((0, bun_bundle_1.feature)('COORDINATOR_MODE')) {
        (0, sessionStorage_js_1.saveMode)(context.modeApi?.isCoordinatorMode() ? 'coordinator' : 'normal');
    }
    // Compute initial state before render (per CLAUDE.md guidelines)
    const restoredAttribution = opts.includeAttribution
        ? computeRestoredAttributionState(result)
        : undefined;
    const standaloneAgentContext = computeStandaloneAgentContext(result.agentName, result.agentColor);
    void (0, concurrentSessions_js_1.updateSessionName)(result.agentName);
    const refreshedAgentDefs = await refreshAgentDefinitionsForModeSwitch(!!modeWarning, context.currentCwd, context.cliAgents, context.agentDefinitions);
    return {
        messages: result.messages,
        fileHistorySnapshots: result.fileHistorySnapshots,
        contentReplacements: result.contentReplacements,
        agentName: result.agentName,
        agentColor: (result.agentColor === 'default'
            ? undefined
            : result.agentColor),
        restoredAgentDef: restoredAgent,
        initialState: {
            ...context.initialState,
            ...(resumedAgentType && { agent: resumedAgentType }),
            ...(restoredAttribution && { attribution: restoredAttribution }),
            ...(standaloneAgentContext && { standaloneAgentContext }),
            agentDefinitions: refreshedAgentDefs,
        },
    };
}
