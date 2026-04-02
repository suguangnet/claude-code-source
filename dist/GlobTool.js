"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobTool = void 0;
const v4_1 = require("zod/v4");
const Tool_js_1 = require("../../Tool.js");
const cwd_js_1 = require("../../utils/cwd.js");
const errors_js_1 = require("../../utils/errors.js");
const file_js_1 = require("../../utils/file.js");
const fsOperations_js_1 = require("../../utils/fsOperations.js");
const glob_js_1 = require("../../utils/glob.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const path_js_1 = require("../../utils/path.js");
const filesystem_js_1 = require("../../utils/permissions/filesystem.js");
const shellRuleMatching_js_1 = require("../../utils/permissions/shellRuleMatching.js");
const prompt_js_1 = require("./prompt.js");
const UI_js_1 = require("./UI.js");
const inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.strictObject({
    pattern: v4_1.z.string().describe('The glob pattern to match files against'),
    path: v4_1.z
        .string()
        .optional()
        .describe('The directory to search in. If not specified, the current working directory will be used. IMPORTANT: Omit this field to use the default directory. DO NOT enter "undefined" or "null" - simply omit it for the default behavior. Must be a valid directory path if provided.'),
}));
const outputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    durationMs: v4_1.z
        .number()
        .describe('Time taken to execute the search in milliseconds'),
    numFiles: v4_1.z.number().describe('Total number of files found'),
    filenames: v4_1.z
        .array(v4_1.z.string())
        .describe('Array of file paths that match the pattern'),
    truncated: v4_1.z
        .boolean()
        .describe('Whether results were truncated (limited to 100 files)'),
}));
exports.GlobTool = (0, Tool_js_1.buildTool)({
    name: prompt_js_1.GLOB_TOOL_NAME,
    searchHint: 'find files by name pattern or wildcard',
    maxResultSizeChars: 100000,
    async description() {
        return prompt_js_1.DESCRIPTION;
    },
    userFacingName: UI_js_1.userFacingName,
    getToolUseSummary: UI_js_1.getToolUseSummary,
    getActivityDescription(input) {
        const summary = (0, UI_js_1.getToolUseSummary)(input);
        return summary ? `Finding ${summary}` : 'Finding files';
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    isConcurrencySafe() {
        return true;
    },
    isReadOnly() {
        return true;
    },
    toAutoClassifierInput(input) {
        return input.pattern;
    },
    isSearchOrReadCommand() {
        return { isSearch: true, isRead: false };
    },
    getPath({ path }) {
        return path ? (0, path_js_1.expandPath)(path) : (0, cwd_js_1.getCwd)();
    },
    async preparePermissionMatcher({ pattern }) {
        return rulePattern => (0, shellRuleMatching_js_1.matchWildcardPattern)(rulePattern, pattern);
    },
    async validateInput({ path }) {
        // If path is provided, validate that it exists and is a directory
        if (path) {
            const fs = (0, fsOperations_js_1.getFsImplementation)();
            const absolutePath = (0, path_js_1.expandPath)(path);
            // SECURITY: Skip filesystem operations for UNC paths to prevent NTLM credential leaks.
            if (absolutePath.startsWith('\\\\') || absolutePath.startsWith('//')) {
                return { result: true };
            }
            let stats;
            try {
                stats = await fs.stat(absolutePath);
            }
            catch (e) {
                if ((0, errors_js_1.isENOENT)(e)) {
                    const cwdSuggestion = await (0, file_js_1.suggestPathUnderCwd)(absolutePath);
                    let message = `Directory does not exist: ${path}. ${file_js_1.FILE_NOT_FOUND_CWD_NOTE} ${(0, cwd_js_1.getCwd)()}.`;
                    if (cwdSuggestion) {
                        message += ` Did you mean ${cwdSuggestion}?`;
                    }
                    return {
                        result: false,
                        message,
                        errorCode: 1,
                    };
                }
                throw e;
            }
            if (!stats.isDirectory()) {
                return {
                    result: false,
                    message: `Path is not a directory: ${path}`,
                    errorCode: 2,
                };
            }
        }
        return { result: true };
    },
    async checkPermissions(input, context) {
        const appState = context.getAppState();
        return (0, filesystem_js_1.checkReadPermissionForTool)(exports.GlobTool, input, appState.toolPermissionContext);
    },
    async prompt() {
        return prompt_js_1.DESCRIPTION;
    },
    renderToolUseMessage: UI_js_1.renderToolUseMessage,
    renderToolUseErrorMessage: UI_js_1.renderToolUseErrorMessage,
    renderToolResultMessage: UI_js_1.renderToolResultMessage,
    // Reuses Grep's render (UI.tsx:65) — shows filenames.join. durationMs/
    // numFiles are "Found 3 files in 12ms" chrome (under-count, fine).
    extractSearchText({ filenames }) {
        return filenames.join('\n');
    },
    async call(input, { abortController, getAppState, globLimits }) {
        const start = Date.now();
        const appState = getAppState();
        const limit = globLimits?.maxResults ?? 100;
        const { files, truncated } = await (0, glob_js_1.glob)(input.pattern, exports.GlobTool.getPath(input), { limit, offset: 0 }, abortController.signal, appState.toolPermissionContext);
        // Relativize paths under cwd to save tokens (same as GrepTool)
        const filenames = files.map(path_js_1.toRelativePath);
        const output = {
            filenames,
            durationMs: Date.now() - start,
            numFiles: filenames.length,
            truncated,
        };
        return {
            data: output,
        };
    },
    mapToolResultToToolResultBlockParam(output, toolUseID) {
        if (output.filenames.length === 0) {
            return {
                tool_use_id: toolUseID,
                type: 'tool_result',
                content: 'No files found',
            };
        }
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: [
                ...output.filenames,
                ...(output.truncated
                    ? [
                        '(Results are truncated. Consider using a more specific path or pattern.)',
                    ]
                    : []),
            ].join('\n'),
        };
    },
});
