"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeamDeleteTool = void 0;
const v4_1 = require("zod/v4");
const index_js_1 = require("../../services/analytics/index.js");
const Tool_js_1 = require("../../Tool.js");
const agentSwarmsEnabled_js_1 = require("../../utils/agentSwarmsEnabled.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const constants_js_1 = require("../../utils/swarm/constants.js");
const teamHelpers_js_1 = require("../../utils/swarm/teamHelpers.js");
const teammateLayoutManager_js_1 = require("../../utils/swarm/teammateLayoutManager.js");
const tasks_js_1 = require("../../utils/tasks.js");
const constants_js_2 = require("./constants.js");
const prompt_js_1 = require("./prompt.js");
const UI_js_1 = require("./UI.js");
const inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.strictObject({}));
exports.TeamDeleteTool = (0, Tool_js_1.buildTool)({
    name: constants_js_2.TEAM_DELETE_TOOL_NAME,
    searchHint: 'disband a swarm team and clean up',
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
    async description() {
        return 'Clean up team and task directories when the swarm is complete';
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
    async call(_input, context) {
        const { setAppState, getAppState } = context;
        const appState = getAppState();
        const teamName = appState.teamContext?.teamName;
        if (teamName) {
            // Read team config to check for active members
            const teamFile = (0, teamHelpers_js_1.readTeamFile)(teamName);
            if (teamFile) {
                // Filter out the team lead - only count non-lead members
                const nonLeadMembers = teamFile.members.filter(m => m.name !== constants_js_1.TEAM_LEAD_NAME);
                // Separate truly active members from idle/dead ones
                // Members with isActive === false are idle (finished their turn or crashed)
                const activeMembers = nonLeadMembers.filter(m => m.isActive !== false);
                if (activeMembers.length > 0) {
                    const memberNames = activeMembers.map(m => m.name).join(', ');
                    return {
                        data: {
                            success: false,
                            message: `Cannot cleanup team with ${activeMembers.length} active member(s): ${memberNames}. Use requestShutdown to gracefully terminate teammates first.`,
                            team_name: teamName,
                        },
                    };
                }
            }
            await (0, teamHelpers_js_1.cleanupTeamDirectories)(teamName);
            // Already cleaned — don't try again on gracefulShutdown.
            (0, teamHelpers_js_1.unregisterTeamForSessionCleanup)(teamName);
            // Clear color assignments so new teams start fresh
            (0, teammateLayoutManager_js_1.clearTeammateColors)();
            // Clear leader team name so getTaskListId() falls back to session ID
            (0, tasks_js_1.clearLeaderTeamName)();
            (0, index_js_1.logEvent)('tengu_team_deleted', {
                team_name: teamName,
            });
        }
        // Clear team context and inbox from app state
        setAppState(prev => ({
            ...prev,
            teamContext: undefined,
            inbox: {
                messages: [], // Clear any queued messages
            },
        }));
        return {
            data: {
                success: true,
                message: teamName
                    ? `Cleaned up directories and worktrees for team "${teamName}"`
                    : 'No team name found, nothing to clean up',
                team_name: teamName,
            },
        };
    },
    renderToolUseMessage: UI_js_1.renderToolUseMessage,
    renderToolResultMessage: UI_js_1.renderToolResultMessage,
});
