"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSwarmBanner = useSwarmBanner;
const React = __importStar(require("react"));
const AppState_js_1 = require("../../state/AppState.js");
const selectors_js_1 = require("../../state/selectors.js");
const agentColorManager_js_1 = require("../../tools/AgentTool/agentColorManager.js");
const standaloneAgent_js_1 = require("../../utils/standaloneAgent.js");
const detection_js_1 = require("../../utils/swarm/backends/detection.js");
const registry_js_1 = require("../../utils/swarm/backends/registry.js");
const constants_js_1 = require("../../utils/swarm/constants.js");
const teammate_js_1 = require("../../utils/teammate.js");
const teammateContext_js_1 = require("../../utils/teammateContext.js");
/**
 * Hook that returns banner information for swarm, standalone agent, or --agent CLI context.
 * - Leader (not in tmux): Returns "tmux -L ... attach" command with cyan background
 * - Leader (in tmux / in-process): Falls through to standalone-agent check — shows
 *   /rename name + /color background if set, else null
 * - Teammate: Returns "teammate@team" format with their assigned color background
 * - Viewing a background agent (CoordinatorTaskPanel): Returns agent name with its color
 * - Standalone agent: Returns agent name with their color background (no @team)
 * - --agent CLI flag: Returns "@agentName" with cyan background
 */
function useSwarmBanner() {
    const teamContext = (0, AppState_js_1.useAppState)(s => s.teamContext);
    const standaloneAgentContext = (0, AppState_js_1.useAppState)(s => s.standaloneAgentContext);
    const agent = (0, AppState_js_1.useAppState)(s => s.agent);
    // Subscribe so the banner updates on enter/exit teammate view even though
    // getActiveAgentForInput reads it from store.getState().
    (0, AppState_js_1.useAppState)(s => s.viewingAgentTaskId);
    const store = (0, AppState_js_1.useAppStateStore)();
    const [insideTmux, setInsideTmux] = React.useState(null);
    React.useEffect(() => {
        void (0, detection_js_1.isInsideTmux)().then(setInsideTmux);
    }, []);
    const state = store.getState();
    // Teammate process: show @agentName with assigned color.
    // In-process teammates run headless — their banner shows in the leader UI instead.
    if ((0, teammate_js_1.isTeammate)() && !(0, teammateContext_js_1.isInProcessTeammate)()) {
        const agentName = (0, teammate_js_1.getAgentName)();
        if (agentName && (0, teammate_js_1.getTeamName)()) {
            return {
                text: `@${agentName}`,
                bgColor: toThemeColor(teamContext?.selfAgentColor ?? (0, teammate_js_1.getTeammateColor)()),
            };
        }
    }
    // Leader with spawned teammates: tmux-attach hint when external, else show
    // the viewed teammate's name when inside tmux / native panes / in-process.
    const hasTeammates = teamContext?.teamName &&
        teamContext.teammates &&
        Object.keys(teamContext.teammates).length > 0;
    if (hasTeammates) {
        const viewedTeammate = (0, selectors_js_1.getViewedTeammateTask)(state);
        const viewedColor = toThemeColor(viewedTeammate?.identity.color);
        const inProcessMode = (0, registry_js_1.isInProcessEnabled)();
        const nativePanes = (0, registry_js_1.getCachedDetectionResult)()?.isNative ?? false;
        if (insideTmux === false && !inProcessMode && !nativePanes) {
            return {
                text: `View teammates: \`tmux -L ${(0, constants_js_1.getSwarmSocketName)()} a\``,
                bgColor: viewedColor,
            };
        }
        if ((insideTmux === true || inProcessMode || nativePanes) &&
            viewedTeammate) {
            return {
                text: `@${viewedTeammate.identity.agentName}`,
                bgColor: viewedColor,
            };
        }
        // insideTmux === null: still loading — fall through.
        // Not viewing a teammate: fall through so /rename and /color are honored.
    }
    // Viewing a background agent (CoordinatorTaskPanel): local_agent tasks aren't
    // InProcessTeammates, so getViewedTeammateTask misses them. Reverse-lookup the
    // name from agentNameRegistry the same way CoordinatorAgentStatus does.
    const active = (0, selectors_js_1.getActiveAgentForInput)(state);
    if (active.type === 'named_agent') {
        const task = active.task;
        let name;
        for (const [n, id] of state.agentNameRegistry) {
            if (id === task.id) {
                name = n;
                break;
            }
        }
        return {
            text: name ? `@${name}` : task.description,
            bgColor: (0, agentColorManager_js_1.getAgentColor)(task.agentType) ?? 'cyan_FOR_SUBAGENTS_ONLY',
        };
    }
    // Standalone agent (/rename, /color): name and/or custom color, no @team.
    const standaloneName = (0, standaloneAgent_js_1.getStandaloneAgentName)(state);
    const standaloneColor = standaloneAgentContext?.color;
    if (standaloneName || standaloneColor) {
        return {
            text: standaloneName ?? '',
            bgColor: toThemeColor(standaloneColor),
        };
    }
    // --agent CLI flag (when not handled above).
    if (agent) {
        const agentDef = state.agentDefinitions.activeAgents.find(a => a.agentType === agent);
        return {
            text: agent,
            bgColor: toThemeColor(agentDef?.color, 'promptBorder'),
        };
    }
    return null;
}
function toThemeColor(colorName, fallback = 'cyan_FOR_SUBAGENTS_ONLY') {
    return colorName && agentColorManager_js_1.AGENT_COLORS.includes(colorName)
        ? agentColorManager_js_1.AGENT_COLOR_TO_THEME_COLOR[colorName]
        : fallback;
}
