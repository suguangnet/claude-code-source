"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeamCreateTool = void 0;
const v4_1 = require("zod/v4");
const state_js_1 = require("../../bootstrap/state.js");
const index_js_1 = require("../../services/analytics/index.js");
const Tool_js_1 = require("../../Tool.js");
const agentId_js_1 = require("../../utils/agentId.js");
const agentSwarmsEnabled_js_1 = require("../../utils/agentSwarmsEnabled.js");
const cwd_js_1 = require("../../utils/cwd.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const model_js_1 = require("../../utils/model/model.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const registry_js_1 = require("../../utils/swarm/backends/registry.js");
const constants_js_1 = require("../../utils/swarm/constants.js");
const teamHelpers_js_1 = require("../../utils/swarm/teamHelpers.js");
const teammateLayoutManager_js_1 = require("../../utils/swarm/teammateLayoutManager.js");
const tasks_js_1 = require("../../utils/tasks.js");
const words_js_1 = require("../../utils/words.js");
const constants_js_2 = require("./constants.js");
const prompt_js_1 = require("./prompt.js");
const UI_js_1 = require("./UI.js");
const inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.strictObject({
    team_name: v4_1.z.string().describe('Name for the new team to create.'),
    description: v4_1.z.string().optional().describe('Team description/purpose.'),
    agent_type: v4_1.z
        .string()
        .optional()
        .describe('Type/role of the team lead (e.g., "researcher", "test-runner"). ' +
        'Used for team file and inter-agent coordination.'),
}));
/**
 * Generates a unique team name by checking if the provided name already exists.
 * If the name already exists, generates a new word slug.
 */
function generateUniqueTeamName(providedName) {
    // If the team doesn't exist, use the provided name
    if (!(0, teamHelpers_js_1.readTeamFile)(providedName)) {
        return providedName;
    }
    // Team exists, generate a new unique name
    return (0, words_js_1.generateWordSlug)();
}
exports.TeamCreateTool = (0, Tool_js_1.buildTool)({
    name: constants_js_2.TEAM_CREATE_TOOL_NAME,
    searchHint: 'create a multi-agent swarm team',
    maxResultSizeChars: 100000,
    shouldDefer: true,
    userFacingName() {
        return '';
    },
    get inputSchema() {
        return inputSchema();
    },
    isEnabled() {
        return (0, agentSwarmsEnabled_js_1.isAgentSwarmsEnabled)();
    },
    toAutoClassifierInput(input) {
        return input.team_name;
    },
    async validateInput(input, _context) {
        if (!input.team_name || input.team_name.trim().length === 0) {
            return {
                result: false,
                message: 'team_name is required for TeamCreate',
                errorCode: 9,
            };
        }
        return { result: true };
    },
    async description() {
        return 'Create a new team for coordinating multiple agents';
    },
    async prompt() {
        return (0, prompt_js_1.getPrompt)();
    },
    mapToolResultToToolResultBlockParam(data, toolUseID) {
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: [
                {
                    type: 'text',
                    text: (0, slowOperations_js_1.jsonStringify)(data),
                },
            ],
        };
    },
    async call(input, context) {
        const { setAppState, getAppState } = context;
        const { team_name, description: _description, agent_type } = input;
        // Check if already in a team - restrict to one team per leader
        const appState = getAppState();
        const existingTeam = appState.teamContext?.teamName;
        if (existingTeam) {
            throw new Error(`Already leading team "${existingTeam}". A leader can only manage one team at a time. Use TeamDelete to end the current team before creating a new one.`);
        }
        // If team already exists, generate a unique name instead of failing
        const finalTeamName = generateUniqueTeamName(team_name);
        // Generate a deterministic agent ID for the team lead
        const leadAgentId = (0, agentId_js_1.formatAgentId)(constants_js_1.TEAM_LEAD_NAME, finalTeamName);
        const leadAgentType = agent_type || constants_js_1.TEAM_LEAD_NAME;
        // Get the team lead's current model from AppState (handles session model, settings, CLI override)
        const leadModel = (0, model_js_1.parseUserSpecifiedModel)(appState.mainLoopModelForSession ??
            appState.mainLoopModel ??
            (0, model_js_1.getDefaultMainLoopModel)());
        const teamFilePath = (0, teamHelpers_js_1.getTeamFilePath)(finalTeamName);
        const teamFile = {
            name: finalTeamName,
            description: _description,
            createdAt: Date.now(),
            leadAgentId,
            leadSessionId: (0, state_js_1.getSessionId)(), // Store actual session ID for team discovery
            members: [
                {
                    agentId: leadAgentId,
                    name: constants_js_1.TEAM_LEAD_NAME,
                    agentType: leadAgentType,
                    model: leadModel,
                    joinedAt: Date.now(),
                    tmuxPaneId: '',
                    cwd: (0, cwd_js_1.getCwd)(),
                    subscriptions: [],
                },
            ],
        };
        await (0, teamHelpers_js_1.writeTeamFileAsync)(finalTeamName, teamFile);
        // Track for session-end cleanup — teams were left on disk forever
        // unless explicitly TeamDelete'd (gh-32730).
        (0, teamHelpers_js_1.registerTeamForSessionCleanup)(finalTeamName);
        // Reset and create the corresponding task list directory (Team = Project = TaskList)
        // This ensures task numbering starts fresh at 1 for each new swarm
        const taskListId = (0, teamHelpers_js_1.sanitizeName)(finalTeamName);
        await (0, tasks_js_1.resetTaskList)(taskListId);
        await (0, tasks_js_1.ensureTasksDir)(taskListId);
        // Register the team name so getTaskListId() returns it for the leader.
        // Without this, the leader falls through to getSessionId() and writes tasks
        // to a different directory than tmux/iTerm2 teammates expect.
        (0, tasks_js_1.setLeaderTeamName)((0, teamHelpers_js_1.sanitizeName)(finalTeamName));
        // Update AppState with team context
        setAppState(prev => ({
            ...prev,
            teamContext: {
                teamName: finalTeamName,
                teamFilePath,
                leadAgentId,
                teammates: {
                    [leadAgentId]: {
                        name: constants_js_1.TEAM_LEAD_NAME,
                        agentType: leadAgentType,
                        color: (0, teammateLayoutManager_js_1.assignTeammateColor)(leadAgentId),
                        tmuxSessionName: '',
                        tmuxPaneId: '',
                        cwd: (0, cwd_js_1.getCwd)(),
                        spawnedAt: Date.now(),
                    },
                },
            },
        }));
        (0, index_js_1.logEvent)('tengu_team_created', {
            team_name: finalTeamName,
            teammate_count: 1,
            lead_agent_type: leadAgentType,
            teammate_mode: (0, registry_js_1.getResolvedTeammateMode)(),
        });
        // Note: We intentionally don't set CLAUDE_CODE_AGENT_ID for the team lead because:
        // 1. The lead is not a "teammate" - isTeammate() should return false for them
        // 2. Their ID is deterministic (team-lead@teamName) and can be derived when needed
        // 3. Setting it would cause isTeammate() to return true, breaking inbox polling
        // Team name is stored in AppState.teamContext, not process.env
        return {
            data: {
                team_name: finalTeamName,
                team_file_path: teamFilePath,
                lead_agent_id: leadAgentId,
            },
        };
    },
    renderToolUseMessage: UI_js_1.renderToolUseMessage,
});
