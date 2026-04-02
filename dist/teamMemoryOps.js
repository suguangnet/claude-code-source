"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTeamMemFile = void 0;
exports.isTeamMemorySearch = isTeamMemorySearch;
exports.isTeamMemoryWriteOrEdit = isTeamMemoryWriteOrEdit;
exports.appendTeamMemorySummaryParts = appendTeamMemorySummaryParts;
const teamMemPaths_js_1 = require("../memdir/teamMemPaths.js");
Object.defineProperty(exports, "isTeamMemFile", { enumerable: true, get: function () { return teamMemPaths_js_1.isTeamMemFile; } });
const constants_js_1 = require("../tools/FileEditTool/constants.js");
const prompt_js_1 = require("../tools/FileWriteTool/prompt.js");
/**
 * Check if a search tool use targets team memory files by examining its path.
 */
function isTeamMemorySearch(toolInput) {
    const input = toolInput;
    if (!input) {
        return false;
    }
    if (input.path && (0, teamMemPaths_js_1.isTeamMemFile)(input.path)) {
        return true;
    }
    return false;
}
/**
 * Check if a Write or Edit tool use targets a team memory file.
 */
function isTeamMemoryWriteOrEdit(toolName, toolInput) {
    if (toolName !== prompt_js_1.FILE_WRITE_TOOL_NAME && toolName !== constants_js_1.FILE_EDIT_TOOL_NAME) {
        return false;
    }
    const input = toolInput;
    const filePath = input?.file_path ?? input?.path;
    return filePath !== undefined && (0, teamMemPaths_js_1.isTeamMemFile)(filePath);
}
/**
 * Append team memory summary parts to the parts array.
 * Encapsulates all team memory verb/string logic for getSearchReadSummaryText.
 */
function appendTeamMemorySummaryParts(memoryCounts, isActive, parts) {
    const teamReadCount = memoryCounts.teamMemoryReadCount ?? 0;
    const teamSearchCount = memoryCounts.teamMemorySearchCount ?? 0;
    const teamWriteCount = memoryCounts.teamMemoryWriteCount ?? 0;
    if (teamReadCount > 0) {
        const verb = isActive
            ? parts.length === 0
                ? 'Recalling'
                : 'recalling'
            : parts.length === 0
                ? 'Recalled'
                : 'recalled';
        parts.push(`${verb} ${teamReadCount} team ${teamReadCount === 1 ? 'memory' : 'memories'}`);
    }
    if (teamSearchCount > 0) {
        const verb = isActive
            ? parts.length === 0
                ? 'Searching'
                : 'searching'
            : parts.length === 0
                ? 'Searched'
                : 'searched';
        parts.push(`${verb} team memories`);
    }
    if (teamWriteCount > 0) {
        const verb = isActive
            ? parts.length === 0
                ? 'Writing'
                : 'writing'
            : parts.length === 0
                ? 'Wrote'
                : 'wrote';
        parts.push(`${verb} ${teamWriteCount} team ${teamWriteCount === 1 ? 'memory' : 'memories'}`);
    }
}
