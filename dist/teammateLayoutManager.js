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
exports.assignTeammateColor = assignTeammateColor;
exports.getTeammateColor = getTeammateColor;
exports.clearTeammateColors = clearTeammateColors;
exports.isInsideTmux = isInsideTmux;
exports.createTeammatePaneInSwarmView = createTeammatePaneInSwarmView;
exports.enablePaneBorderStatus = enablePaneBorderStatus;
exports.sendCommandToPane = sendCommandToPane;
const agentColorManager_js_1 = require("../../tools/AgentTool/agentColorManager.js");
const registry_js_1 = require("./backends/registry.js");
// Track color assignments for teammates (persisted per session)
const teammateColorAssignments = new Map();
let colorIndex = 0;
/**
 * Gets the appropriate backend for the current environment.
 * detectAndGetBackend() caches internally — no need for a second cache here.
 */
async function getBackend() {
    return (await (0, registry_js_1.detectAndGetBackend)()).backend;
}
/**
 * Assigns a unique color to a teammate from the available palette.
 * Colors are assigned in round-robin order.
 */
function assignTeammateColor(teammateId) {
    const existing = teammateColorAssignments.get(teammateId);
    if (existing) {
        return existing;
    }
    const color = agentColorManager_js_1.AGENT_COLORS[colorIndex % agentColorManager_js_1.AGENT_COLORS.length];
    teammateColorAssignments.set(teammateId, color);
    colorIndex++;
    return color;
}
/**
 * Gets the assigned color for a teammate, if any.
 */
function getTeammateColor(teammateId) {
    return teammateColorAssignments.get(teammateId);
}
/**
 * Clears all teammate color assignments.
 * Called during team cleanup to reset state for potential new teams.
 */
function clearTeammateColors() {
    teammateColorAssignments.clear();
    colorIndex = 0;
}
/**
 * Checks if we're currently running inside a tmux session.
 * Uses the detection module directly for this check.
 */
async function isInsideTmux() {
    const { isInsideTmux: checkTmux } = await Promise.resolve().then(() => __importStar(require('./backends/detection.js')));
    return checkTmux();
}
/**
 * Creates a new teammate pane in the swarm view.
 * Automatically selects the appropriate backend (tmux or iTerm2) based on environment.
 *
 * When running INSIDE tmux:
 * - Uses TmuxBackend to split the current window
 * - Leader stays on left (30%), teammates on right (70%)
 *
 * When running in iTerm2 (not in tmux) with it2 CLI:
 * - Uses ITermBackend for native iTerm2 split panes
 *
 * When running OUTSIDE tmux/iTerm2:
 * - Falls back to TmuxBackend with external claude-swarm session
 */
async function createTeammatePaneInSwarmView(teammateName, teammateColor) {
    const backend = await getBackend();
    return backend.createTeammatePaneInSwarmView(teammateName, teammateColor);
}
/**
 * Enables pane border status for a window (shows pane titles).
 * Delegates to the detected backend.
 */
async function enablePaneBorderStatus(windowTarget, useSwarmSocket = false) {
    const backend = await getBackend();
    return backend.enablePaneBorderStatus(windowTarget, useSwarmSocket);
}
/**
 * Sends a command to a specific pane.
 * Delegates to the detected backend.
 */
async function sendCommandToPane(paneId, command, useSwarmSocket = false) {
    const backend = await getBackend();
    return backend.sendCommandToPane(paneId, command, useSwarmSocket);
}
