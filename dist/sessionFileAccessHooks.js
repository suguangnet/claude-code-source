"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMemoryFileAccess = isMemoryFileAccess;
exports.registerSessionFileAccessHooks = registerSessionFileAccessHooks;
/**
 * Session file access analytics hooks.
 * Tracks access to session memory and transcript files via Read, Grep, Glob tools.
 * Also tracks memdir file access via Read, Grep, Glob, Edit, and Write tools.
 */
const bun_bundle_1 = require("bun:bundle");
const state_js_1 = require("../bootstrap/state.js");
const index_js_1 = require("../services/analytics/index.js");
const constants_js_1 = require("../tools/FileEditTool/constants.js");
const types_js_1 = require("../tools/FileEditTool/types.js");
const FileReadTool_js_1 = require("../tools/FileReadTool/FileReadTool.js");
const prompt_js_1 = require("../tools/FileReadTool/prompt.js");
const FileWriteTool_js_1 = require("../tools/FileWriteTool/FileWriteTool.js");
const prompt_js_2 = require("../tools/FileWriteTool/prompt.js");
const GlobTool_js_1 = require("../tools/GlobTool/GlobTool.js");
const prompt_js_3 = require("../tools/GlobTool/prompt.js");
const GrepTool_js_1 = require("../tools/GrepTool/GrepTool.js");
const prompt_js_4 = require("../tools/GrepTool/prompt.js");
const memoryFileDetection_js_1 = require("./memoryFileDetection.js");
/* eslint-disable @typescript-eslint/no-require-imports */
const teamMemPaths = (0, bun_bundle_1.feature)('TEAMMEM')
    ? require('../memdir/teamMemPaths.js')
    : null;
const teamMemWatcher = (0, bun_bundle_1.feature)('TEAMMEM')
    ? require('../services/teamMemorySync/watcher.js')
    : null;
const memoryShapeTelemetry = (0, bun_bundle_1.feature)('MEMORY_SHAPE_TELEMETRY')
    ? require('../memdir/memoryShapeTelemetry.js')
    : null;
/* eslint-enable @typescript-eslint/no-require-imports */
const agentContext_js_1 = require("./agentContext.js");
/**
 * Extract the file path from a tool input for memdir detection.
 * Covers Read (file_path), Edit (file_path), and Write (file_path).
 */
function getFilePathFromInput(toolName, toolInput) {
    switch (toolName) {
        case prompt_js_1.FILE_READ_TOOL_NAME: {
            const parsed = FileReadTool_js_1.FileReadTool.inputSchema.safeParse(toolInput);
            return parsed.success ? parsed.data.file_path : null;
        }
        case constants_js_1.FILE_EDIT_TOOL_NAME: {
            const parsed = (0, types_js_1.inputSchema)().safeParse(toolInput);
            return parsed.success ? parsed.data.file_path : null;
        }
        case prompt_js_2.FILE_WRITE_TOOL_NAME: {
            const parsed = FileWriteTool_js_1.FileWriteTool.inputSchema.safeParse(toolInput);
            return parsed.success ? parsed.data.file_path : null;
        }
        default:
            return null;
    }
}
/**
 * Extract file type from tool input.
 * Returns the detected session file type or null.
 */
function getSessionFileTypeFromInput(toolName, toolInput) {
    switch (toolName) {
        case prompt_js_1.FILE_READ_TOOL_NAME: {
            const parsed = FileReadTool_js_1.FileReadTool.inputSchema.safeParse(toolInput);
            if (!parsed.success)
                return null;
            return (0, memoryFileDetection_js_1.detectSessionFileType)(parsed.data.file_path);
        }
        case prompt_js_4.GREP_TOOL_NAME: {
            const parsed = GrepTool_js_1.GrepTool.inputSchema.safeParse(toolInput);
            if (!parsed.success)
                return null;
            // Check path if provided
            if (parsed.data.path) {
                const pathType = (0, memoryFileDetection_js_1.detectSessionFileType)(parsed.data.path);
                if (pathType)
                    return pathType;
            }
            // Check glob pattern
            if (parsed.data.glob) {
                const globType = (0, memoryFileDetection_js_1.detectSessionPatternType)(parsed.data.glob);
                if (globType)
                    return globType;
            }
            return null;
        }
        case prompt_js_3.GLOB_TOOL_NAME: {
            const parsed = GlobTool_js_1.GlobTool.inputSchema.safeParse(toolInput);
            if (!parsed.success)
                return null;
            // Check path if provided
            if (parsed.data.path) {
                const pathType = (0, memoryFileDetection_js_1.detectSessionFileType)(parsed.data.path);
                if (pathType)
                    return pathType;
            }
            // Check pattern
            const patternType = (0, memoryFileDetection_js_1.detectSessionPatternType)(parsed.data.pattern);
            if (patternType)
                return patternType;
            return null;
        }
        default:
            return null;
    }
}
/**
 * Check if a tool use constitutes a memory file access.
 * Detects session memory (via Read/Grep/Glob) and memdir access (via Read/Edit/Write).
 * Uses the same conditions as the PostToolUse session file access hooks.
 */
function isMemoryFileAccess(toolName, toolInput) {
    if (getSessionFileTypeFromInput(toolName, toolInput) === 'session_memory') {
        return true;
    }
    const filePath = getFilePathFromInput(toolName, toolInput);
    if (filePath &&
        ((0, memoryFileDetection_js_1.isAutoMemFile)(filePath) ||
            ((0, bun_bundle_1.feature)('TEAMMEM') && teamMemPaths.isTeamMemFile(filePath)))) {
        return true;
    }
    return false;
}
/**
 * PostToolUse callback to log session file access events.
 */
async function handleSessionFileAccess(input, _toolUseID, _signal) {
    if (input.hook_event_name !== 'PostToolUse')
        return {};
    const fileType = getSessionFileTypeFromInput(input.tool_name, input.tool_input);
    const subagentName = (0, agentContext_js_1.getSubagentLogName)();
    const subagentProps = subagentName ? { subagent_name: subagentName } : {};
    if (fileType === 'session_memory') {
        (0, index_js_1.logEvent)('tengu_session_memory_accessed', { ...subagentProps });
    }
    else if (fileType === 'session_transcript') {
        (0, index_js_1.logEvent)('tengu_transcript_accessed', { ...subagentProps });
    }
    // Memdir access tracking
    const filePath = getFilePathFromInput(input.tool_name, input.tool_input);
    if (filePath && (0, memoryFileDetection_js_1.isAutoMemFile)(filePath)) {
        (0, index_js_1.logEvent)('tengu_memdir_accessed', {
            tool: input.tool_name,
            ...subagentProps,
        });
        switch (input.tool_name) {
            case prompt_js_1.FILE_READ_TOOL_NAME:
                (0, index_js_1.logEvent)('tengu_memdir_file_read', { ...subagentProps });
                break;
            case constants_js_1.FILE_EDIT_TOOL_NAME:
                (0, index_js_1.logEvent)('tengu_memdir_file_edit', { ...subagentProps });
                break;
            case prompt_js_2.FILE_WRITE_TOOL_NAME:
                (0, index_js_1.logEvent)('tengu_memdir_file_write', { ...subagentProps });
                break;
        }
    }
    // Team memory access tracking
    if ((0, bun_bundle_1.feature)('TEAMMEM') && filePath && teamMemPaths.isTeamMemFile(filePath)) {
        (0, index_js_1.logEvent)('tengu_team_mem_accessed', {
            tool: input.tool_name,
            ...subagentProps,
        });
        switch (input.tool_name) {
            case prompt_js_1.FILE_READ_TOOL_NAME:
                (0, index_js_1.logEvent)('tengu_team_mem_file_read', { ...subagentProps });
                break;
            case constants_js_1.FILE_EDIT_TOOL_NAME:
                (0, index_js_1.logEvent)('tengu_team_mem_file_edit', { ...subagentProps });
                teamMemWatcher?.notifyTeamMemoryWrite();
                break;
            case prompt_js_2.FILE_WRITE_TOOL_NAME:
                (0, index_js_1.logEvent)('tengu_team_mem_file_write', { ...subagentProps });
                teamMemWatcher?.notifyTeamMemoryWrite();
                break;
        }
    }
    if ((0, bun_bundle_1.feature)('MEMORY_SHAPE_TELEMETRY') && filePath) {
        const scope = (0, memoryFileDetection_js_1.memoryScopeForPath)(filePath);
        if (scope !== null &&
            (input.tool_name === constants_js_1.FILE_EDIT_TOOL_NAME ||
                input.tool_name === prompt_js_2.FILE_WRITE_TOOL_NAME)) {
            memoryShapeTelemetry.logMemoryWriteShape(input.tool_name, input.tool_input, filePath, scope);
        }
    }
    return {};
}
/**
 * Register session file access tracking hooks.
 * Called during CLI initialization.
 */
function registerSessionFileAccessHooks() {
    const hook = {
        type: 'callback',
        callback: handleSessionFileAccess,
        timeout: 1, // Very short timeout - just logging
        internal: true,
    };
    (0, state_js_1.registerHookCallbacks)({
        PostToolUse: [
            { matcher: prompt_js_1.FILE_READ_TOOL_NAME, hooks: [hook] },
            { matcher: prompt_js_4.GREP_TOOL_NAME, hooks: [hook] },
            { matcher: prompt_js_3.GLOB_TOOL_NAME, hooks: [hook] },
            { matcher: constants_js_1.FILE_EDIT_TOOL_NAME, hooks: [hook] },
            { matcher: prompt_js_2.FILE_WRITE_TOOL_NAME, hooks: [hook] },
        ],
    });
}
