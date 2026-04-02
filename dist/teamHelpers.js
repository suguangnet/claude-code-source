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
exports.inputSchema = void 0;
exports.sanitizeName = sanitizeName;
exports.sanitizeAgentName = sanitizeAgentName;
exports.getTeamDir = getTeamDir;
exports.getTeamFilePath = getTeamFilePath;
exports.readTeamFile = readTeamFile;
exports.readTeamFileAsync = readTeamFileAsync;
exports.writeTeamFileAsync = writeTeamFileAsync;
exports.removeTeammateFromTeamFile = removeTeammateFromTeamFile;
exports.addHiddenPaneId = addHiddenPaneId;
exports.removeHiddenPaneId = removeHiddenPaneId;
exports.removeMemberFromTeam = removeMemberFromTeam;
exports.removeMemberByAgentId = removeMemberByAgentId;
exports.setMemberMode = setMemberMode;
exports.syncTeammateMode = syncTeammateMode;
exports.setMultipleMemberModes = setMultipleMemberModes;
exports.setMemberActive = setMemberActive;
exports.registerTeamForSessionCleanup = registerTeamForSessionCleanup;
exports.unregisterTeamForSessionCleanup = unregisterTeamForSessionCleanup;
exports.cleanupSessionTeams = cleanupSessionTeams;
exports.cleanupTeamDirectories = cleanupTeamDirectories;
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const v4_1 = require("zod/v4");
const state_js_1 = require("../../bootstrap/state.js");
const debug_js_1 = require("../debug.js");
const envUtils_js_1 = require("../envUtils.js");
const errors_js_1 = require("../errors.js");
const execFileNoThrow_js_1 = require("../execFileNoThrow.js");
const git_js_1 = require("../git.js");
const lazySchema_js_1 = require("../lazySchema.js");
const slowOperations_js_1 = require("../slowOperations.js");
const tasks_js_1 = require("../tasks.js");
const teammate_js_1 = require("../teammate.js");
const types_js_1 = require("./backends/types.js");
const constants_js_1 = require("./constants.js");
exports.inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.strictObject({
    operation: v4_1.z
        .enum(['spawnTeam', 'cleanup'])
        .describe('Operation: spawnTeam to create a team, cleanup to remove team and task directories.'),
    agent_type: v4_1.z
        .string()
        .optional()
        .describe('Type/role of the team lead (e.g., "researcher", "test-runner"). ' +
        'Used for team file and inter-agent coordination.'),
    team_name: v4_1.z
        .string()
        .optional()
        .describe('Name for the new team to create (required for spawnTeam).'),
    description: v4_1.z
        .string()
        .optional()
        .describe('Team description/purpose (only used with spawnTeam).'),
}));
/**
 * Sanitizes a name for use in tmux window names, worktree paths, and file paths.
 * Replaces all non-alphanumeric characters with hyphens and lowercases.
 */
function sanitizeName(name) {
    return name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
}
/**
 * Sanitizes an agent name for use in deterministic agent IDs.
 * Replaces @ with - to prevent ambiguity in the agentName@teamName format.
 */
function sanitizeAgentName(name) {
    return name.replace(/@/g, '-');
}
/**
 * Gets the path to a team's directory
 */
function getTeamDir(teamName) {
    return (0, path_1.join)((0, envUtils_js_1.getTeamsDir)(), sanitizeName(teamName));
}
/**
 * Gets the path to a team's config.json file
 */
function getTeamFilePath(teamName) {
    return (0, path_1.join)(getTeamDir(teamName), 'config.json');
}
/**
 * Reads a team file by name (sync — for sync contexts like React render paths)
 * @internal Exported for team discovery UI
 */
// sync IO: called from sync context
function readTeamFile(teamName) {
    try {
        const content = (0, fs_1.readFileSync)(getTeamFilePath(teamName), 'utf-8');
        return (0, slowOperations_js_1.jsonParse)(content);
    }
    catch (e) {
        if ((0, errors_js_1.getErrnoCode)(e) === 'ENOENT')
            return null;
        (0, debug_js_1.logForDebugging)(`[TeammateTool] Failed to read team file for ${teamName}: ${(0, errors_js_1.errorMessage)(e)}`);
        return null;
    }
}
/**
 * Reads a team file by name (async — for tool handlers and other async contexts)
 */
async function readTeamFileAsync(teamName) {
    try {
        const content = await (0, promises_1.readFile)(getTeamFilePath(teamName), 'utf-8');
        return (0, slowOperations_js_1.jsonParse)(content);
    }
    catch (e) {
        if ((0, errors_js_1.getErrnoCode)(e) === 'ENOENT')
            return null;
        (0, debug_js_1.logForDebugging)(`[TeammateTool] Failed to read team file for ${teamName}: ${(0, errors_js_1.errorMessage)(e)}`);
        return null;
    }
}
/**
 * Writes a team file (sync — for sync contexts)
 */
// sync IO: called from sync context
function writeTeamFile(teamName, teamFile) {
    const teamDir = getTeamDir(teamName);
    (0, fs_1.mkdirSync)(teamDir, { recursive: true });
    (0, fs_1.writeFileSync)(getTeamFilePath(teamName), (0, slowOperations_js_1.jsonStringify)(teamFile, null, 2));
}
/**
 * Writes a team file (async — for tool handlers)
 */
async function writeTeamFileAsync(teamName, teamFile) {
    const teamDir = getTeamDir(teamName);
    await (0, promises_1.mkdir)(teamDir, { recursive: true });
    await (0, promises_1.writeFile)(getTeamFilePath(teamName), (0, slowOperations_js_1.jsonStringify)(teamFile, null, 2));
}
/**
 * Removes a teammate from the team file by agent ID or name.
 * Used by the leader when processing shutdown approvals.
 */
function removeTeammateFromTeamFile(teamName, identifier) {
    const identifierStr = identifier.agentId || identifier.name;
    if (!identifierStr) {
        (0, debug_js_1.logForDebugging)('[TeammateTool] removeTeammateFromTeamFile called with no identifier');
        return false;
    }
    const teamFile = readTeamFile(teamName);
    if (!teamFile) {
        (0, debug_js_1.logForDebugging)(`[TeammateTool] Cannot remove teammate ${identifierStr}: failed to read team file for "${teamName}"`);
        return false;
    }
    const originalLength = teamFile.members.length;
    teamFile.members = teamFile.members.filter(m => {
        if (identifier.agentId && m.agentId === identifier.agentId)
            return false;
        if (identifier.name && m.name === identifier.name)
            return false;
        return true;
    });
    if (teamFile.members.length === originalLength) {
        (0, debug_js_1.logForDebugging)(`[TeammateTool] Teammate ${identifierStr} not found in team file for "${teamName}"`);
        return false;
    }
    writeTeamFile(teamName, teamFile);
    (0, debug_js_1.logForDebugging)(`[TeammateTool] Removed teammate from team file: ${identifierStr}`);
    return true;
}
/**
 * Adds a pane ID to the hidden panes list in the team file.
 * @param teamName - The name of the team
 * @param paneId - The pane ID to hide
 * @returns true if the pane was added to hidden list, false if team doesn't exist
 */
function addHiddenPaneId(teamName, paneId) {
    const teamFile = readTeamFile(teamName);
    if (!teamFile) {
        return false;
    }
    const hiddenPaneIds = teamFile.hiddenPaneIds ?? [];
    if (!hiddenPaneIds.includes(paneId)) {
        hiddenPaneIds.push(paneId);
        teamFile.hiddenPaneIds = hiddenPaneIds;
        writeTeamFile(teamName, teamFile);
        (0, debug_js_1.logForDebugging)(`[TeammateTool] Added ${paneId} to hidden panes for team ${teamName}`);
    }
    return true;
}
/**
 * Removes a pane ID from the hidden panes list in the team file.
 * @param teamName - The name of the team
 * @param paneId - The pane ID to show (remove from hidden list)
 * @returns true if the pane was removed from hidden list, false if team doesn't exist
 */
function removeHiddenPaneId(teamName, paneId) {
    const teamFile = readTeamFile(teamName);
    if (!teamFile) {
        return false;
    }
    const hiddenPaneIds = teamFile.hiddenPaneIds ?? [];
    const index = hiddenPaneIds.indexOf(paneId);
    if (index !== -1) {
        hiddenPaneIds.splice(index, 1);
        teamFile.hiddenPaneIds = hiddenPaneIds;
        writeTeamFile(teamName, teamFile);
        (0, debug_js_1.logForDebugging)(`[TeammateTool] Removed ${paneId} from hidden panes for team ${teamName}`);
    }
    return true;
}
/**
 * Removes a teammate from the team config file by pane ID.
 * Also removes from hiddenPaneIds if present.
 * @param teamName - The name of the team
 * @param tmuxPaneId - The pane ID of the teammate to remove
 * @returns true if the member was removed, false if team or member doesn't exist
 */
function removeMemberFromTeam(teamName, tmuxPaneId) {
    const teamFile = readTeamFile(teamName);
    if (!teamFile) {
        return false;
    }
    const memberIndex = teamFile.members.findIndex(m => m.tmuxPaneId === tmuxPaneId);
    if (memberIndex === -1) {
        return false;
    }
    // Remove from members array
    teamFile.members.splice(memberIndex, 1);
    // Also remove from hiddenPaneIds if present
    if (teamFile.hiddenPaneIds) {
        const hiddenIndex = teamFile.hiddenPaneIds.indexOf(tmuxPaneId);
        if (hiddenIndex !== -1) {
            teamFile.hiddenPaneIds.splice(hiddenIndex, 1);
        }
    }
    writeTeamFile(teamName, teamFile);
    (0, debug_js_1.logForDebugging)(`[TeammateTool] Removed member with pane ${tmuxPaneId} from team ${teamName}`);
    return true;
}
/**
 * Removes a teammate from a team's member list by agent ID.
 * Use this for in-process teammates which all share the same tmuxPaneId.
 * @param teamName - The name of the team
 * @param agentId - The agent ID of the teammate to remove (e.g., "researcher@my-team")
 * @returns true if the member was removed, false if team or member doesn't exist
 */
function removeMemberByAgentId(teamName, agentId) {
    const teamFile = readTeamFile(teamName);
    if (!teamFile) {
        return false;
    }
    const memberIndex = teamFile.members.findIndex(m => m.agentId === agentId);
    if (memberIndex === -1) {
        return false;
    }
    // Remove from members array
    teamFile.members.splice(memberIndex, 1);
    writeTeamFile(teamName, teamFile);
    (0, debug_js_1.logForDebugging)(`[TeammateTool] Removed member ${agentId} from team ${teamName}`);
    return true;
}
/**
 * Sets a team member's permission mode.
 * Called when the team leader changes a teammate's mode via the TeamsDialog.
 * @param teamName - The name of the team
 * @param memberName - The name of the member to update
 * @param mode - The new permission mode
 */
function setMemberMode(teamName, memberName, mode) {
    const teamFile = readTeamFile(teamName);
    if (!teamFile) {
        return false;
    }
    const member = teamFile.members.find(m => m.name === memberName);
    if (!member) {
        (0, debug_js_1.logForDebugging)(`[TeammateTool] Cannot set member mode: member ${memberName} not found in team ${teamName}`);
        return false;
    }
    // Only write if the value is actually changing
    if (member.mode === mode) {
        return true;
    }
    // Create updated members array immutably
    const updatedMembers = teamFile.members.map(m => m.name === memberName ? { ...m, mode } : m);
    writeTeamFile(teamName, { ...teamFile, members: updatedMembers });
    (0, debug_js_1.logForDebugging)(`[TeammateTool] Set member ${memberName} in team ${teamName} to mode: ${mode}`);
    return true;
}
/**
 * Sync the current teammate's mode to config.json so team lead sees it.
 * No-op if not running as a teammate.
 * @param mode - The permission mode to sync
 * @param teamNameOverride - Optional team name override (uses env var if not provided)
 */
function syncTeammateMode(mode, teamNameOverride) {
    if (!(0, teammate_js_1.isTeammate)())
        return;
    const teamName = teamNameOverride ?? (0, teammate_js_1.getTeamName)();
    const agentName = (0, teammate_js_1.getAgentName)();
    if (teamName && agentName) {
        setMemberMode(teamName, agentName, mode);
    }
}
/**
 * Sets multiple team members' permission modes in a single atomic operation.
 * Avoids race conditions when updating multiple teammates at once.
 * @param teamName - The name of the team
 * @param modeUpdates - Array of {memberName, mode} to update
 */
function setMultipleMemberModes(teamName, modeUpdates) {
    const teamFile = readTeamFile(teamName);
    if (!teamFile) {
        return false;
    }
    // Build a map of updates for efficient lookup
    const updateMap = new Map(modeUpdates.map(u => [u.memberName, u.mode]));
    // Create updated members array immutably
    let anyChanged = false;
    const updatedMembers = teamFile.members.map(member => {
        const newMode = updateMap.get(member.name);
        if (newMode !== undefined && member.mode !== newMode) {
            anyChanged = true;
            return { ...member, mode: newMode };
        }
        return member;
    });
    if (anyChanged) {
        writeTeamFile(teamName, { ...teamFile, members: updatedMembers });
        (0, debug_js_1.logForDebugging)(`[TeammateTool] Set ${modeUpdates.length} member modes in team ${teamName}`);
    }
    return true;
}
/**
 * Sets a team member's active status.
 * Called when a teammate becomes idle (isActive=false) or starts a new turn (isActive=true).
 * @param teamName - The name of the team
 * @param memberName - The name of the member to update
 * @param isActive - Whether the member is active (true) or idle (false)
 */
async function setMemberActive(teamName, memberName, isActive) {
    const teamFile = await readTeamFileAsync(teamName);
    if (!teamFile) {
        (0, debug_js_1.logForDebugging)(`[TeammateTool] Cannot set member active: team ${teamName} not found`);
        return;
    }
    const member = teamFile.members.find(m => m.name === memberName);
    if (!member) {
        (0, debug_js_1.logForDebugging)(`[TeammateTool] Cannot set member active: member ${memberName} not found in team ${teamName}`);
        return;
    }
    // Only write if the value is actually changing
    if (member.isActive === isActive) {
        return;
    }
    member.isActive = isActive;
    await writeTeamFileAsync(teamName, teamFile);
    (0, debug_js_1.logForDebugging)(`[TeammateTool] Set member ${memberName} in team ${teamName} to ${isActive ? 'active' : 'idle'}`);
}
/**
 * Destroys a git worktree at the given path.
 * First attempts to use `git worktree remove`, then falls back to rm -rf.
 * Safe to call on non-existent paths.
 */
async function destroyWorktree(worktreePath) {
    // Read the .git file in the worktree to find the main repo
    const gitFilePath = (0, path_1.join)(worktreePath, '.git');
    let mainRepoPath = null;
    try {
        const gitFileContent = (await (0, promises_1.readFile)(gitFilePath, 'utf-8')).trim();
        // The .git file contains something like: gitdir: /path/to/repo/.git/worktrees/worktree-name
        const match = gitFileContent.match(/^gitdir:\s*(.+)$/);
        if (match && match[1]) {
            // Extract the main repo .git directory (go up from .git/worktrees/name to .git)
            const worktreeGitDir = match[1];
            // Go up 2 levels from .git/worktrees/name to get to .git, then get parent for repo root
            const mainGitDir = (0, path_1.join)(worktreeGitDir, '..', '..');
            mainRepoPath = (0, path_1.join)(mainGitDir, '..');
        }
    }
    catch {
        // Ignore errors reading .git file (path doesn't exist, not a file, etc.)
    }
    // Try to remove using git worktree remove command
    if (mainRepoPath) {
        const result = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['worktree', 'remove', '--force', worktreePath], { cwd: mainRepoPath });
        if (result.code === 0) {
            (0, debug_js_1.logForDebugging)(`[TeammateTool] Removed worktree via git: ${worktreePath}`);
            return;
        }
        // Check if the error is "not a working tree" (already removed)
        if (result.stderr?.includes('not a working tree')) {
            (0, debug_js_1.logForDebugging)(`[TeammateTool] Worktree already removed: ${worktreePath}`);
            return;
        }
        (0, debug_js_1.logForDebugging)(`[TeammateTool] git worktree remove failed, falling back to rm: ${result.stderr}`);
    }
    // Fallback: manually remove the directory
    try {
        await (0, promises_1.rm)(worktreePath, { recursive: true, force: true });
        (0, debug_js_1.logForDebugging)(`[TeammateTool] Removed worktree directory manually: ${worktreePath}`);
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`[TeammateTool] Failed to remove worktree ${worktreePath}: ${(0, errors_js_1.errorMessage)(error)}`);
    }
}
/**
 * Mark a team as created this session so it gets cleaned up on exit.
 * Call this right after the initial writeTeamFile. TeamDelete should
 * call unregisterTeamForSessionCleanup to prevent double-cleanup.
 * Backing Set lives in bootstrap/state.ts so resetStateForTests()
 * clears it between tests (avoids the PR #17615 cross-shard leak class).
 */
function registerTeamForSessionCleanup(teamName) {
    (0, state_js_1.getSessionCreatedTeams)().add(teamName);
}
/**
 * Remove a team from session cleanup tracking (e.g., after explicit
 * TeamDelete — already cleaned, don't try again on shutdown).
 */
function unregisterTeamForSessionCleanup(teamName) {
    (0, state_js_1.getSessionCreatedTeams)().delete(teamName);
}
/**
 * Clean up all teams created this session that weren't explicitly deleted.
 * Registered with gracefulShutdown from init.ts.
 */
async function cleanupSessionTeams() {
    const sessionCreatedTeams = (0, state_js_1.getSessionCreatedTeams)();
    if (sessionCreatedTeams.size === 0)
        return;
    const teams = Array.from(sessionCreatedTeams);
    (0, debug_js_1.logForDebugging)(`cleanupSessionTeams: removing ${teams.length} orphan team dir(s): ${teams.join(', ')}`);
    // Kill panes first — on SIGINT the teammate processes are still running;
    // deleting directories alone would orphan them in open tmux/iTerm2 panes.
    // (TeamDeleteTool's path doesn't need this — by then teammates have
    // gracefully exited and useInboxPoller has already closed their panes.)
    await Promise.allSettled(teams.map(name => killOrphanedTeammatePanes(name)));
    await Promise.allSettled(teams.map(name => cleanupTeamDirectories(name)));
    sessionCreatedTeams.clear();
}
/**
 * Best-effort kill of all pane-backed teammate panes for a team.
 * Called from cleanupSessionTeams on ungraceful leader exit (SIGINT/SIGTERM).
 * Dynamic imports avoid adding registry/detection to this module's static
 * dep graph — this only runs at shutdown, so the import cost is irrelevant.
 */
async function killOrphanedTeammatePanes(teamName) {
    const teamFile = readTeamFile(teamName);
    if (!teamFile)
        return;
    const paneMembers = teamFile.members.filter(m => m.name !== constants_js_1.TEAM_LEAD_NAME &&
        m.tmuxPaneId &&
        m.backendType &&
        (0, types_js_1.isPaneBackend)(m.backendType));
    if (paneMembers.length === 0)
        return;
    const [{ ensureBackendsRegistered, getBackendByType }, { isInsideTmux }] = await Promise.all([
        Promise.resolve().then(() => __importStar(require('./backends/registry.js'))),
        Promise.resolve().then(() => __importStar(require('./backends/detection.js'))),
    ]);
    await ensureBackendsRegistered();
    const useExternalSession = !(await isInsideTmux());
    await Promise.allSettled(paneMembers.map(async (m) => {
        // filter above guarantees these; narrow for the type system
        if (!m.tmuxPaneId || !m.backendType || !(0, types_js_1.isPaneBackend)(m.backendType)) {
            return;
        }
        const ok = await getBackendByType(m.backendType).killPane(m.tmuxPaneId, useExternalSession);
        (0, debug_js_1.logForDebugging)(`cleanupSessionTeams: killPane ${m.name} (${m.backendType} ${m.tmuxPaneId}) → ${ok}`);
    }));
}
/**
 * Cleans up team and task directories for a given team name.
 * Also cleans up git worktrees created for teammates.
 * Called when a swarm session is terminated.
 */
async function cleanupTeamDirectories(teamName) {
    const sanitizedName = sanitizeName(teamName);
    // Read team file to get worktree paths BEFORE deleting the team directory
    const teamFile = readTeamFile(teamName);
    const worktreePaths = [];
    if (teamFile) {
        for (const member of teamFile.members) {
            if (member.worktreePath) {
                worktreePaths.push(member.worktreePath);
            }
        }
    }
    // Clean up worktrees first
    for (const worktreePath of worktreePaths) {
        await destroyWorktree(worktreePath);
    }
    // Clean up team directory (~/.claude/teams/{team-name}/)
    const teamDir = getTeamDir(teamName);
    try {
        await (0, promises_1.rm)(teamDir, { recursive: true, force: true });
        (0, debug_js_1.logForDebugging)(`[TeammateTool] Cleaned up team directory: ${teamDir}`);
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`[TeammateTool] Failed to clean up team directory ${teamDir}: ${(0, errors_js_1.errorMessage)(error)}`);
    }
    // Clean up tasks directory (~/.claude/tasks/{taskListId}/)
    // The leader and teammates all store tasks under the sanitized team name.
    const tasksDir = (0, tasks_js_1.getTasksDir)(sanitizedName);
    try {
        await (0, promises_1.rm)(tasksDir, { recursive: true, force: true });
        (0, debug_js_1.logForDebugging)(`[TeammateTool] Cleaned up tasks directory: ${tasksDir}`);
        (0, tasks_js_1.notifyTasksUpdated)();
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`[TeammateTool] Failed to clean up tasks directory ${tasksDir}: ${(0, errors_js_1.errorMessage)(error)}`);
    }
}
