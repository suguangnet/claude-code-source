"use strict";
/**
 * Shared spawn module for teammate creation.
 * Extracted from TeammateTool to allow reuse by AgentTool.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTeammateModel = resolveTeammateModel;
exports.generateUniqueTeammateName = generateUniqueTeammateName;
exports.spawnTeammate = spawnTeammate;
const react_1 = __importDefault(require("react"));
const state_js_1 = require("../../bootstrap/state.js");
const Task_js_1 = require("../../Task.js");
const agentId_js_1 = require("../../utils/agentId.js");
const shellQuote_js_1 = require("../../utils/bash/shellQuote.js");
const bundledMode_js_1 = require("../../utils/bundledMode.js");
const config_js_1 = require("../../utils/config.js");
const cwd_js_1 = require("../../utils/cwd.js");
const debug_js_1 = require("../../utils/debug.js");
const errors_js_1 = require("../../utils/errors.js");
const execFileNoThrow_js_1 = require("../../utils/execFileNoThrow.js");
const model_js_1 = require("../../utils/model/model.js");
const detection_js_1 = require("../../utils/swarm/backends/detection.js");
const registry_js_1 = require("../../utils/swarm/backends/registry.js");
const teammateModeSnapshot_js_1 = require("../../utils/swarm/backends/teammateModeSnapshot.js");
const types_js_1 = require("../../utils/swarm/backends/types.js");
const constants_js_1 = require("../../utils/swarm/constants.js");
const It2SetupPrompt_js_1 = require("../../utils/swarm/It2SetupPrompt.js");
const inProcessRunner_js_1 = require("../../utils/swarm/inProcessRunner.js");
const spawnInProcess_js_1 = require("../../utils/swarm/spawnInProcess.js");
const spawnUtils_js_1 = require("../../utils/swarm/spawnUtils.js");
const teamHelpers_js_1 = require("../../utils/swarm/teamHelpers.js");
const teammateLayoutManager_js_1 = require("../../utils/swarm/teammateLayoutManager.js");
const teammateModel_js_1 = require("../../utils/swarm/teammateModel.js");
const framework_js_1 = require("../../utils/task/framework.js");
const teammateMailbox_js_1 = require("../../utils/teammateMailbox.js");
const loadAgentsDir_js_1 = require("../AgentTool/loadAgentsDir.js");
function getDefaultTeammateModel(leaderModel) {
    const configured = (0, config_js_1.getGlobalConfig)().teammateDefaultModel;
    if (configured === null) {
        // User picked "Default" in the /config picker — follow the leader.
        return leaderModel ?? (0, teammateModel_js_1.getHardcodedTeammateModelFallback)();
    }
    if (configured !== undefined) {
        return (0, model_js_1.parseUserSpecifiedModel)(configured);
    }
    return (0, teammateModel_js_1.getHardcodedTeammateModelFallback)();
}
/**
 * Resolve a teammate model value. Handles the 'inherit' alias (from agent
 * frontmatter) by substituting the leader's model. gh-31069: 'inherit' was
 * passed literally to --model, producing "It may not exist or you may not
 * have access". If leader model is null (not yet set), falls through to the
 * default.
 *
 * Exported for testing.
 */
function resolveTeammateModel(inputModel, leaderModel) {
    if (inputModel === 'inherit') {
        return leaderModel ?? getDefaultTeammateModel(leaderModel);
    }
    return inputModel ?? getDefaultTeammateModel(leaderModel);
}
// ============================================================================
// Helper Functions
// ============================================================================
/**
 * Checks if a tmux session exists
 */
async function hasSession(sessionName) {
    const result = await (0, execFileNoThrow_js_1.execFileNoThrow)(constants_js_1.TMUX_COMMAND, [
        'has-session',
        '-t',
        sessionName,
    ]);
    return result.code === 0;
}
/**
 * Creates a new tmux session if it doesn't exist
 */
async function ensureSession(sessionName) {
    const exists = await hasSession(sessionName);
    if (!exists) {
        const result = await (0, execFileNoThrow_js_1.execFileNoThrow)(constants_js_1.TMUX_COMMAND, [
            'new-session',
            '-d',
            '-s',
            sessionName,
        ]);
        if (result.code !== 0) {
            throw new Error(`Failed to create tmux session '${sessionName}': ${result.stderr || 'Unknown error'}`);
        }
    }
}
/**
 * Gets the command to spawn a teammate.
 * For native builds (compiled binaries), use process.execPath.
 * For non-native (node/bun running a script), use process.argv[1].
 */
function getTeammateCommand() {
    if (process.env[constants_js_1.TEAMMATE_COMMAND_ENV_VAR]) {
        return process.env[constants_js_1.TEAMMATE_COMMAND_ENV_VAR];
    }
    return (0, bundledMode_js_1.isInBundledMode)() ? process.execPath : process.argv[1];
}
/**
 * Builds CLI flags to propagate from the current session to spawned teammates.
 * This ensures teammates inherit important settings like permission mode,
 * model selection, and plugin configuration from their parent.
 *
 * @param options.planModeRequired - If true, don't inherit bypass permissions (plan mode takes precedence)
 * @param options.permissionMode - Permission mode to propagate
 */
function buildInheritedCliFlags(options) {
    const flags = [];
    const { planModeRequired, permissionMode } = options || {};
    // Propagate permission mode to teammates, but NOT if plan mode is required
    // Plan mode takes precedence over bypass permissions for safety
    if (planModeRequired) {
        // Don't inherit bypass permissions when plan mode is required
    }
    else if (permissionMode === 'bypassPermissions' ||
        (0, state_js_1.getSessionBypassPermissionsMode)()) {
        flags.push('--dangerously-skip-permissions');
    }
    else if (permissionMode === 'acceptEdits') {
        flags.push('--permission-mode acceptEdits');
    }
    else if (permissionMode === 'auto') {
        // Teammates inherit auto mode so the classifier auto-approves their tool
        // calls too. The teammate's own startup (permissionSetup.ts) handles
        // GrowthBook gate checks and setAutoModeActive(true) independently.
        flags.push('--permission-mode auto');
    }
    // Propagate --model if explicitly set via CLI
    const modelOverride = (0, state_js_1.getMainLoopModelOverride)();
    if (modelOverride) {
        flags.push(`--model ${(0, shellQuote_js_1.quote)([modelOverride])}`);
    }
    // Propagate --settings if set via CLI
    const settingsPath = (0, state_js_1.getFlagSettingsPath)();
    if (settingsPath) {
        flags.push(`--settings ${(0, shellQuote_js_1.quote)([settingsPath])}`);
    }
    // Propagate --plugin-dir for each inline plugin
    const inlinePlugins = (0, state_js_1.getInlinePlugins)();
    for (const pluginDir of inlinePlugins) {
        flags.push(`--plugin-dir ${(0, shellQuote_js_1.quote)([pluginDir])}`);
    }
    // Propagate --chrome / --no-chrome if explicitly set on the CLI
    const chromeFlagOverride = (0, state_js_1.getChromeFlagOverride)();
    if (chromeFlagOverride === true) {
        flags.push('--chrome');
    }
    else if (chromeFlagOverride === false) {
        flags.push('--no-chrome');
    }
    return flags.join(' ');
}
/**
 * Generates a unique teammate name by checking existing team members.
 * If the name already exists, appends a numeric suffix (e.g., tester-2, tester-3).
 * @internal Exported for testing
 */
async function generateUniqueTeammateName(baseName, teamName) {
    if (!teamName) {
        return baseName;
    }
    const teamFile = await (0, teamHelpers_js_1.readTeamFileAsync)(teamName);
    if (!teamFile) {
        return baseName;
    }
    const existingNames = new Set(teamFile.members.map(m => m.name.toLowerCase()));
    // If the base name doesn't exist, use it as-is
    if (!existingNames.has(baseName.toLowerCase())) {
        return baseName;
    }
    // Find the next available suffix
    let suffix = 2;
    while (existingNames.has(`${baseName}-${suffix}`.toLowerCase())) {
        suffix++;
    }
    return `${baseName}-${suffix}`;
}
// ============================================================================
// Spawn Handlers
// ============================================================================
/**
 * Handle spawn operation using split-pane view (default).
 * When inside tmux: Creates teammates in a shared window with leader on left, teammates on right.
 * When outside tmux: Creates a claude-swarm session with all teammates in a tiled layout.
 */
async function handleSpawnSplitPane(input, context) {
    const { setAppState, getAppState } = context;
    const { name, prompt, agent_type, cwd, plan_mode_required } = input;
    // Resolve model: 'inherit' → leader's model; undefined → default Opus
    const model = resolveTeammateModel(input.model, getAppState().mainLoopModel);
    if (!name || !prompt) {
        throw new Error('name and prompt are required for spawn operation');
    }
    // Get team name from input or inherit from leader's team context
    const appState = getAppState();
    const teamName = input.team_name || appState.teamContext?.teamName;
    if (!teamName) {
        throw new Error('team_name is required for spawn operation. Either provide team_name in input or call spawnTeam first to establish team context.');
    }
    // Generate unique name if duplicate exists in team
    const uniqueName = await generateUniqueTeammateName(name, teamName);
    // Sanitize the name to prevent @ in agent IDs (would break agentName@teamName format)
    const sanitizedName = (0, teamHelpers_js_1.sanitizeAgentName)(uniqueName);
    // Generate deterministic agent ID from name and team
    const teammateId = (0, agentId_js_1.formatAgentId)(sanitizedName, teamName);
    const workingDir = cwd || (0, cwd_js_1.getCwd)();
    // Detect the appropriate backend and check if setup is needed
    let detectionResult = await (0, registry_js_1.detectAndGetBackend)();
    // If in iTerm2 but it2 isn't set up, prompt the user
    if (detectionResult.needsIt2Setup && context.setToolJSX) {
        const tmuxAvailable = await (0, detection_js_1.isTmuxAvailable)();
        // Show the setup prompt and wait for user decision
        const setupResult = await new Promise(resolve => {
            context.setToolJSX({
                jsx: react_1.default.createElement(It2SetupPrompt_js_1.It2SetupPrompt, {
                    onDone: resolve,
                    tmuxAvailable,
                }),
                shouldHidePromptInput: true,
            });
        });
        // Clear the JSX
        context.setToolJSX(null);
        if (setupResult === 'cancelled') {
            throw new Error('Teammate spawn cancelled - iTerm2 setup required');
        }
        // If they installed it2 or chose tmux, clear cached detection and re-fetch
        // so the local detectionResult matches the backend that will actually
        // spawn the pane.
        // - 'installed': re-detect to pick up the ITermBackend (it2 is now available)
        // - 'use-tmux': re-detect so needsIt2Setup is false (preferTmux is now saved)
        //   and subsequent spawns skip this prompt
        if (setupResult === 'installed' || setupResult === 'use-tmux') {
            (0, registry_js_1.resetBackendDetection)();
            detectionResult = await (0, registry_js_1.detectAndGetBackend)();
        }
    }
    // Check if we're inside tmux to determine session naming
    const insideTmux = await (0, teammateLayoutManager_js_1.isInsideTmux)();
    // Assign a unique color to this teammate
    const teammateColor = (0, teammateLayoutManager_js_1.assignTeammateColor)(teammateId);
    // Create a pane in the swarm view
    // - Inside tmux: splits current window (leader on left, teammates on right)
    // - In iTerm2 with it2: uses native iTerm2 split panes
    // - Outside both: creates claude-swarm session with tiled teammates
    const { paneId, isFirstTeammate } = await (0, teammateLayoutManager_js_1.createTeammatePaneInSwarmView)(sanitizedName, teammateColor);
    // Enable pane border status on first teammate when inside tmux
    // (outside tmux, this is handled in createTeammatePaneInSwarmView)
    if (isFirstTeammate && insideTmux) {
        await (0, teammateLayoutManager_js_1.enablePaneBorderStatus)();
    }
    // Build the command to spawn Claude Code with teammate identity
    // Note: We spawn without a prompt - initial instructions are sent via mailbox
    const binaryPath = getTeammateCommand();
    // Build teammate identity CLI args (replaces CLAUDE_CODE_* env vars)
    const teammateArgs = [
        `--agent-id ${(0, shellQuote_js_1.quote)([teammateId])}`,
        `--agent-name ${(0, shellQuote_js_1.quote)([sanitizedName])}`,
        `--team-name ${(0, shellQuote_js_1.quote)([teamName])}`,
        `--agent-color ${(0, shellQuote_js_1.quote)([teammateColor])}`,
        `--parent-session-id ${(0, shellQuote_js_1.quote)([(0, state_js_1.getSessionId)()])}`,
        plan_mode_required ? '--plan-mode-required' : '',
        agent_type ? `--agent-type ${(0, shellQuote_js_1.quote)([agent_type])}` : '',
    ]
        .filter(Boolean)
        .join(' ');
    // Build CLI flags to propagate to teammate
    // Pass plan_mode_required to prevent inheriting bypass permissions
    let inheritedFlags = buildInheritedCliFlags({
        planModeRequired: plan_mode_required,
        permissionMode: appState.toolPermissionContext.mode,
    });
    // If teammate has a custom model, add --model flag (or replace inherited one)
    if (model) {
        // Remove any inherited --model flag first
        inheritedFlags = inheritedFlags
            .split(' ')
            .filter((flag, i, arr) => flag !== '--model' && arr[i - 1] !== '--model')
            .join(' ');
        // Add the teammate's model
        inheritedFlags = inheritedFlags
            ? `${inheritedFlags} --model ${(0, shellQuote_js_1.quote)([model])}`
            : `--model ${(0, shellQuote_js_1.quote)([model])}`;
    }
    const flagsStr = inheritedFlags ? ` ${inheritedFlags}` : '';
    // Propagate env vars that teammates need but may not inherit from tmux split-window shells.
    // Includes CLAUDECODE, CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS, and API provider vars.
    const envStr = (0, spawnUtils_js_1.buildInheritedEnvVars)();
    const spawnCommand = `cd ${(0, shellQuote_js_1.quote)([workingDir])} && env ${envStr} ${(0, shellQuote_js_1.quote)([binaryPath])} ${teammateArgs}${flagsStr}`;
    // Send the command to the new pane
    // Use swarm socket when running outside tmux (external swarm session)
    await (0, teammateLayoutManager_js_1.sendCommandToPane)(paneId, spawnCommand, !insideTmux);
    // Determine session/window names for output
    const sessionName = insideTmux ? 'current' : constants_js_1.SWARM_SESSION_NAME;
    const windowName = insideTmux ? 'current' : 'swarm-view';
    // Track the teammate in AppState's teamContext with color
    // If spawning without spawnTeam, set up the leader as team lead
    setAppState(prev => ({
        ...prev,
        teamContext: {
            ...prev.teamContext,
            teamName: teamName ?? prev.teamContext?.teamName ?? 'default',
            teamFilePath: prev.teamContext?.teamFilePath ?? '',
            leadAgentId: prev.teamContext?.leadAgentId ?? '',
            teammates: {
                ...(prev.teamContext?.teammates || {}),
                [teammateId]: {
                    name: sanitizedName,
                    agentType: agent_type,
                    color: teammateColor,
                    tmuxSessionName: sessionName,
                    tmuxPaneId: paneId,
                    cwd: workingDir,
                    spawnedAt: Date.now(),
                },
            },
        },
    }));
    // Register background task so teammates appear in the tasks pill/dialog
    registerOutOfProcessTeammateTask(setAppState, {
        teammateId,
        sanitizedName,
        teamName,
        teammateColor,
        prompt,
        plan_mode_required,
        paneId,
        insideTmux,
        backendType: detectionResult.backend.type,
        toolUseId: context.toolUseId,
    });
    // Register agent in the team file
    const teamFile = await (0, teamHelpers_js_1.readTeamFileAsync)(teamName);
    if (!teamFile) {
        throw new Error(`Team "${teamName}" does not exist. Call spawnTeam first to create the team.`);
    }
    teamFile.members.push({
        agentId: teammateId,
        name: sanitizedName,
        agentType: agent_type,
        model,
        prompt,
        color: teammateColor,
        planModeRequired: plan_mode_required,
        joinedAt: Date.now(),
        tmuxPaneId: paneId,
        cwd: workingDir,
        subscriptions: [],
        backendType: detectionResult.backend.type,
    });
    await (0, teamHelpers_js_1.writeTeamFileAsync)(teamName, teamFile);
    // Send initial instructions to teammate via mailbox
    // The teammate's inbox poller will pick this up and submit it as their first turn
    await (0, teammateMailbox_js_1.writeToMailbox)(sanitizedName, {
        from: constants_js_1.TEAM_LEAD_NAME,
        text: prompt,
        timestamp: new Date().toISOString(),
    }, teamName);
    return {
        data: {
            teammate_id: teammateId,
            agent_id: teammateId,
            agent_type,
            model,
            name: sanitizedName,
            color: teammateColor,
            tmux_session_name: sessionName,
            tmux_window_name: windowName,
            tmux_pane_id: paneId,
            team_name: teamName,
            is_splitpane: true,
            plan_mode_required,
        },
    };
}
/**
 * Handle spawn operation using separate windows (legacy behavior).
 * Creates each teammate in its own tmux window.
 */
async function handleSpawnSeparateWindow(input, context) {
    const { setAppState, getAppState } = context;
    const { name, prompt, agent_type, cwd, plan_mode_required } = input;
    // Resolve model: 'inherit' → leader's model; undefined → default Opus
    const model = resolveTeammateModel(input.model, getAppState().mainLoopModel);
    if (!name || !prompt) {
        throw new Error('name and prompt are required for spawn operation');
    }
    // Get team name from input or inherit from leader's team context
    const appState = getAppState();
    const teamName = input.team_name || appState.teamContext?.teamName;
    if (!teamName) {
        throw new Error('team_name is required for spawn operation. Either provide team_name in input or call spawnTeam first to establish team context.');
    }
    // Generate unique name if duplicate exists in team
    const uniqueName = await generateUniqueTeammateName(name, teamName);
    // Sanitize the name to prevent @ in agent IDs (would break agentName@teamName format)
    const sanitizedName = (0, teamHelpers_js_1.sanitizeAgentName)(uniqueName);
    // Generate deterministic agent ID from name and team
    const teammateId = (0, agentId_js_1.formatAgentId)(sanitizedName, teamName);
    const windowName = `teammate-${(0, teamHelpers_js_1.sanitizeName)(sanitizedName)}`;
    const workingDir = cwd || (0, cwd_js_1.getCwd)();
    // Ensure the swarm session exists
    await ensureSession(constants_js_1.SWARM_SESSION_NAME);
    // Assign a unique color to this teammate
    const teammateColor = (0, teammateLayoutManager_js_1.assignTeammateColor)(teammateId);
    // Create a new window for this teammate
    const createWindowResult = await (0, execFileNoThrow_js_1.execFileNoThrow)(constants_js_1.TMUX_COMMAND, [
        'new-window',
        '-t',
        constants_js_1.SWARM_SESSION_NAME,
        '-n',
        windowName,
        '-P',
        '-F',
        '#{pane_id}',
    ]);
    if (createWindowResult.code !== 0) {
        throw new Error(`Failed to create tmux window: ${createWindowResult.stderr}`);
    }
    const paneId = createWindowResult.stdout.trim();
    // Build the command to spawn Claude Code with teammate identity
    // Note: We spawn without a prompt - initial instructions are sent via mailbox
    const binaryPath = getTeammateCommand();
    // Build teammate identity CLI args (replaces CLAUDE_CODE_* env vars)
    const teammateArgs = [
        `--agent-id ${(0, shellQuote_js_1.quote)([teammateId])}`,
        `--agent-name ${(0, shellQuote_js_1.quote)([sanitizedName])}`,
        `--team-name ${(0, shellQuote_js_1.quote)([teamName])}`,
        `--agent-color ${(0, shellQuote_js_1.quote)([teammateColor])}`,
        `--parent-session-id ${(0, shellQuote_js_1.quote)([(0, state_js_1.getSessionId)()])}`,
        plan_mode_required ? '--plan-mode-required' : '',
        agent_type ? `--agent-type ${(0, shellQuote_js_1.quote)([agent_type])}` : '',
    ]
        .filter(Boolean)
        .join(' ');
    // Build CLI flags to propagate to teammate
    // Pass plan_mode_required to prevent inheriting bypass permissions
    let inheritedFlags = buildInheritedCliFlags({
        planModeRequired: plan_mode_required,
        permissionMode: appState.toolPermissionContext.mode,
    });
    // If teammate has a custom model, add --model flag (or replace inherited one)
    if (model) {
        // Remove any inherited --model flag first
        inheritedFlags = inheritedFlags
            .split(' ')
            .filter((flag, i, arr) => flag !== '--model' && arr[i - 1] !== '--model')
            .join(' ');
        // Add the teammate's model
        inheritedFlags = inheritedFlags
            ? `${inheritedFlags} --model ${(0, shellQuote_js_1.quote)([model])}`
            : `--model ${(0, shellQuote_js_1.quote)([model])}`;
    }
    const flagsStr = inheritedFlags ? ` ${inheritedFlags}` : '';
    // Propagate env vars that teammates need but may not inherit from tmux split-window shells.
    // Includes CLAUDECODE, CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS, and API provider vars.
    const envStr = (0, spawnUtils_js_1.buildInheritedEnvVars)();
    const spawnCommand = `cd ${(0, shellQuote_js_1.quote)([workingDir])} && env ${envStr} ${(0, shellQuote_js_1.quote)([binaryPath])} ${teammateArgs}${flagsStr}`;
    // Send the command to the new window
    const sendKeysResult = await (0, execFileNoThrow_js_1.execFileNoThrow)(constants_js_1.TMUX_COMMAND, [
        'send-keys',
        '-t',
        `${constants_js_1.SWARM_SESSION_NAME}:${windowName}`,
        spawnCommand,
        'Enter',
    ]);
    if (sendKeysResult.code !== 0) {
        throw new Error(`Failed to send command to tmux window: ${sendKeysResult.stderr}`);
    }
    // Track the teammate in AppState's teamContext
    setAppState(prev => ({
        ...prev,
        teamContext: {
            ...prev.teamContext,
            teamName: teamName ?? prev.teamContext?.teamName ?? 'default',
            teamFilePath: prev.teamContext?.teamFilePath ?? '',
            leadAgentId: prev.teamContext?.leadAgentId ?? '',
            teammates: {
                ...(prev.teamContext?.teammates || {}),
                [teammateId]: {
                    name: sanitizedName,
                    agentType: agent_type,
                    color: teammateColor,
                    tmuxSessionName: constants_js_1.SWARM_SESSION_NAME,
                    tmuxPaneId: paneId,
                    cwd: workingDir,
                    spawnedAt: Date.now(),
                },
            },
        },
    }));
    // Register background task so tmux teammates appear in the tasks pill/dialog
    // Separate window spawns are always outside tmux (external swarm session)
    registerOutOfProcessTeammateTask(setAppState, {
        teammateId,
        sanitizedName,
        teamName,
        teammateColor,
        prompt,
        plan_mode_required,
        paneId,
        insideTmux: false,
        backendType: 'tmux',
        toolUseId: context.toolUseId,
    });
    // Register agent in the team file
    const teamFile = await (0, teamHelpers_js_1.readTeamFileAsync)(teamName);
    if (!teamFile) {
        throw new Error(`Team "${teamName}" does not exist. Call spawnTeam first to create the team.`);
    }
    teamFile.members.push({
        agentId: teammateId,
        name: sanitizedName,
        agentType: agent_type,
        model,
        prompt,
        color: teammateColor,
        planModeRequired: plan_mode_required,
        joinedAt: Date.now(),
        tmuxPaneId: paneId,
        cwd: workingDir,
        subscriptions: [],
        backendType: 'tmux', // This handler always uses tmux directly
    });
    await (0, teamHelpers_js_1.writeTeamFileAsync)(teamName, teamFile);
    // Send initial instructions to teammate via mailbox
    // The teammate's inbox poller will pick this up and submit it as their first turn
    await (0, teammateMailbox_js_1.writeToMailbox)(sanitizedName, {
        from: constants_js_1.TEAM_LEAD_NAME,
        text: prompt,
        timestamp: new Date().toISOString(),
    }, teamName);
    return {
        data: {
            teammate_id: teammateId,
            agent_id: teammateId,
            agent_type,
            model,
            name: sanitizedName,
            color: teammateColor,
            tmux_session_name: constants_js_1.SWARM_SESSION_NAME,
            tmux_window_name: windowName,
            tmux_pane_id: paneId,
            team_name: teamName,
            is_splitpane: false,
            plan_mode_required,
        },
    };
}
/**
 * Register a background task entry for an out-of-process (tmux/iTerm2) teammate.
 * This makes tmux teammates visible in the background tasks pill and dialog,
 * matching how in-process teammates are tracked.
 */
function registerOutOfProcessTeammateTask(setAppState, { teammateId, sanitizedName, teamName, teammateColor, prompt, plan_mode_required, paneId, insideTmux, backendType, toolUseId, }) {
    const taskId = (0, Task_js_1.generateTaskId)('in_process_teammate');
    const description = `${sanitizedName}: ${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`;
    const abortController = new AbortController();
    const taskState = {
        ...(0, Task_js_1.createTaskStateBase)(taskId, 'in_process_teammate', description, toolUseId),
        type: 'in_process_teammate',
        status: 'running',
        identity: {
            agentId: teammateId,
            agentName: sanitizedName,
            teamName,
            color: teammateColor,
            planModeRequired: plan_mode_required ?? false,
            parentSessionId: (0, state_js_1.getSessionId)(),
        },
        prompt,
        abortController,
        awaitingPlanApproval: false,
        permissionMode: plan_mode_required ? 'plan' : 'default',
        isIdle: false,
        shutdownRequested: false,
        lastReportedToolCount: 0,
        lastReportedTokenCount: 0,
        pendingUserMessages: [],
    };
    (0, framework_js_1.registerTask)(taskState, setAppState);
    // When abort is signaled, kill the pane using the backend that created it
    // (tmux kill-pane for tmux panes, it2 session close for iTerm2 native panes).
    // SDK task_notification bookend is emitted by killInProcessTeammate (the
    // sole abort trigger for this controller).
    abortController.signal.addEventListener('abort', () => {
        if ((0, types_js_1.isPaneBackend)(backendType)) {
            void (0, registry_js_1.getBackendByType)(backendType).killPane(paneId, !insideTmux);
        }
    }, { once: true });
}
/**
 * Handle spawn operation for in-process teammates.
 * In-process teammates run in the same Node.js process using AsyncLocalStorage.
 */
async function handleSpawnInProcess(input, context) {
    const { setAppState, getAppState } = context;
    const { name, prompt, agent_type, plan_mode_required } = input;
    // Resolve model: 'inherit' → leader's model; undefined → default Opus
    const model = resolveTeammateModel(input.model, getAppState().mainLoopModel);
    if (!name || !prompt) {
        throw new Error('name and prompt are required for spawn operation');
    }
    // Get team name from input or inherit from leader's team context
    const appState = getAppState();
    const teamName = input.team_name || appState.teamContext?.teamName;
    if (!teamName) {
        throw new Error('team_name is required for spawn operation. Either provide team_name in input or call spawnTeam first to establish team context.');
    }
    // Generate unique name if duplicate exists in team
    const uniqueName = await generateUniqueTeammateName(name, teamName);
    // Sanitize the name to prevent @ in agent IDs
    const sanitizedName = (0, teamHelpers_js_1.sanitizeAgentName)(uniqueName);
    // Generate deterministic agent ID from name and team
    const teammateId = (0, agentId_js_1.formatAgentId)(sanitizedName, teamName);
    // Assign a unique color to this teammate
    const teammateColor = (0, teammateLayoutManager_js_1.assignTeammateColor)(teammateId);
    // Look up custom agent definition if agent_type is provided
    let agentDefinition;
    if (agent_type) {
        const allAgents = context.options.agentDefinitions.activeAgents;
        const foundAgent = allAgents.find(a => a.agentType === agent_type);
        if (foundAgent && (0, loadAgentsDir_js_1.isCustomAgent)(foundAgent)) {
            agentDefinition = foundAgent;
        }
        (0, debug_js_1.logForDebugging)(`[handleSpawnInProcess] agent_type=${agent_type}, found=${!!agentDefinition}`);
    }
    // Spawn in-process teammate
    const config = {
        name: sanitizedName,
        teamName,
        prompt,
        color: teammateColor,
        planModeRequired: plan_mode_required ?? false,
        model,
    };
    const result = await (0, spawnInProcess_js_1.spawnInProcessTeammate)(config, context);
    if (!result.success) {
        throw new Error(result.error ?? 'Failed to spawn in-process teammate');
    }
    // Debug: log what spawn returned
    (0, debug_js_1.logForDebugging)(`[handleSpawnInProcess] spawn result: taskId=${result.taskId}, hasContext=${!!result.teammateContext}, hasAbort=${!!result.abortController}`);
    // Start the agent execution loop (fire-and-forget)
    if (result.taskId && result.teammateContext && result.abortController) {
        (0, inProcessRunner_js_1.startInProcessTeammate)({
            identity: {
                agentId: teammateId,
                agentName: sanitizedName,
                teamName,
                color: teammateColor,
                planModeRequired: plan_mode_required ?? false,
                parentSessionId: result.teammateContext.parentSessionId,
            },
            taskId: result.taskId,
            prompt,
            description: input.description,
            model,
            agentDefinition,
            teammateContext: result.teammateContext,
            // Strip messages: the teammate never reads toolUseContext.messages
            // (it builds its own history via allMessages in inProcessRunner).
            // Passing the parent's full conversation here would pin it for the
            // teammate's lifetime, surviving /clear and auto-compact.
            toolUseContext: { ...context, messages: [] },
            abortController: result.abortController,
            invokingRequestId: input.invokingRequestId,
        });
        (0, debug_js_1.logForDebugging)(`[handleSpawnInProcess] Started agent execution for ${teammateId}`);
    }
    // Track the teammate in AppState's teamContext
    // Auto-register leader if spawning without prior spawnTeam call
    setAppState(prev => {
        const needsLeaderSetup = !prev.teamContext?.leadAgentId;
        const leadAgentId = needsLeaderSetup
            ? (0, agentId_js_1.formatAgentId)(constants_js_1.TEAM_LEAD_NAME, teamName)
            : prev.teamContext.leadAgentId;
        // Build teammates map, including leader if needed for inbox polling
        const existingTeammates = prev.teamContext?.teammates || {};
        const leadEntry = needsLeaderSetup
            ? {
                [leadAgentId]: {
                    name: constants_js_1.TEAM_LEAD_NAME,
                    agentType: constants_js_1.TEAM_LEAD_NAME,
                    color: (0, teammateLayoutManager_js_1.assignTeammateColor)(leadAgentId),
                    tmuxSessionName: 'in-process',
                    tmuxPaneId: 'leader',
                    cwd: (0, cwd_js_1.getCwd)(),
                    spawnedAt: Date.now(),
                },
            }
            : {};
        return {
            ...prev,
            teamContext: {
                ...prev.teamContext,
                teamName: teamName ?? prev.teamContext?.teamName ?? 'default',
                teamFilePath: prev.teamContext?.teamFilePath ?? '',
                leadAgentId,
                teammates: {
                    ...existingTeammates,
                    ...leadEntry,
                    [teammateId]: {
                        name: sanitizedName,
                        agentType: agent_type,
                        color: teammateColor,
                        tmuxSessionName: 'in-process',
                        tmuxPaneId: 'in-process',
                        cwd: (0, cwd_js_1.getCwd)(),
                        spawnedAt: Date.now(),
                    },
                },
            },
        };
    });
    // Register agent in the team file
    const teamFile = await (0, teamHelpers_js_1.readTeamFileAsync)(teamName);
    if (!teamFile) {
        throw new Error(`Team "${teamName}" does not exist. Call spawnTeam first to create the team.`);
    }
    teamFile.members.push({
        agentId: teammateId,
        name: sanitizedName,
        agentType: agent_type,
        model,
        prompt,
        color: teammateColor,
        planModeRequired: plan_mode_required,
        joinedAt: Date.now(),
        tmuxPaneId: 'in-process',
        cwd: (0, cwd_js_1.getCwd)(),
        subscriptions: [],
        backendType: 'in-process',
    });
    await (0, teamHelpers_js_1.writeTeamFileAsync)(teamName, teamFile);
    // Note: Do NOT send the prompt via mailbox for in-process teammates.
    // In-process teammates receive the prompt directly via startInProcessTeammate().
    // The mailbox is only needed for tmux-based teammates which poll for their initial message.
    // Sending via both paths would cause duplicate welcome messages.
    return {
        data: {
            teammate_id: teammateId,
            agent_id: teammateId,
            agent_type,
            model,
            name: sanitizedName,
            color: teammateColor,
            tmux_session_name: 'in-process',
            tmux_window_name: 'in-process',
            tmux_pane_id: 'in-process',
            team_name: teamName,
            is_splitpane: false,
            plan_mode_required,
        },
    };
}
/**
 * Handle spawn operation - creates a new Claude Code instance.
 * Uses in-process mode when enabled, otherwise uses tmux/iTerm2 split-pane view.
 * Falls back to in-process if pane backend detection fails (e.g., iTerm2 without
 * it2 CLI or tmux installed).
 */
async function handleSpawn(input, context) {
    // Check if in-process mode is enabled via feature flag
    if ((0, registry_js_1.isInProcessEnabled)()) {
        return handleSpawnInProcess(input, context);
    }
    // Pre-flight: ensure a pane backend is available before attempting pane-based spawn.
    // This handles auto-mode cases like iTerm2 without it2 or tmux installed, where
    // isInProcessEnabled() returns false but detectAndGetBackend() has no viable backend.
    // Narrowly scoped so user cancellation and other spawn errors propagate normally.
    try {
        await (0, registry_js_1.detectAndGetBackend)();
    }
    catch (error) {
        // Only fall back silently in auto mode. If the user explicitly configured
        // teammateMode: 'tmux', let the error propagate so they see the actionable
        // install instructions from getTmuxInstallInstructions().
        if ((0, teammateModeSnapshot_js_1.getTeammateModeFromSnapshot)() !== 'auto') {
            throw error;
        }
        (0, debug_js_1.logForDebugging)(`[handleSpawn] No pane backend available, falling back to in-process: ${(0, errors_js_1.errorMessage)(error)}`);
        // Record the fallback so isInProcessEnabled() reflects the actual mode
        // (fixes banner and other UI that would otherwise show tmux attach commands).
        (0, registry_js_1.markInProcessFallback)();
        return handleSpawnInProcess(input, context);
    }
    // Backend is available (and now cached) - proceed with pane spawning.
    // Any errors here (user cancellation, validation, etc.) propagate to the caller.
    const useSplitPane = input.use_splitpane !== false;
    if (useSplitPane) {
        return handleSpawnSplitPane(input, context);
    }
    return handleSpawnSeparateWindow(input, context);
}
// ============================================================================
// Main Export
// ============================================================================
/**
 * Spawns a new teammate with the given configuration.
 * This is the main entry point for teammate spawning, used by both TeammateTool and AgentTool.
 */
async function spawnTeammate(config, context) {
    return handleSpawn(config, context);
}
