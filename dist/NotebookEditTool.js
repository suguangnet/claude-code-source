"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotebookEditTool = exports.outputSchema = exports.inputSchema = void 0;
const bun_bundle_1 = require("bun:bundle");
const path_1 = require("path");
const fileHistory_js_1 = require("src/utils/fileHistory.js");
const v4_1 = require("zod/v4");
const Tool_js_1 = require("../../Tool.js");
const cwd_js_1 = require("../../utils/cwd.js");
const errors_js_1 = require("../../utils/errors.js");
const file_js_1 = require("../../utils/file.js");
const fileRead_js_1 = require("../../utils/fileRead.js");
const json_js_1 = require("../../utils/json.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const notebook_js_1 = require("../../utils/notebook.js");
const filesystem_js_1 = require("../../utils/permissions/filesystem.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const constants_js_1 = require("./constants.js");
const prompt_js_1 = require("./prompt.js");
const UI_js_1 = require("./UI.js");
exports.inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.strictObject({
    notebook_path: v4_1.z
        .string()
        .describe('The absolute path to the Jupyter notebook file to edit (must be absolute, not relative)'),
    cell_id: v4_1.z
        .string()
        .optional()
        .describe('The ID of the cell to edit. When inserting a new cell, the new cell will be inserted after the cell with this ID, or at the beginning if not specified.'),
    new_source: v4_1.z.string().describe('The new source for the cell'),
    cell_type: v4_1.z
        .enum(['code', 'markdown'])
        .optional()
        .describe('The type of the cell (code or markdown). If not specified, it defaults to the current cell type. If using edit_mode=insert, this is required.'),
    edit_mode: v4_1.z
        .enum(['replace', 'insert', 'delete'])
        .optional()
        .describe('The type of edit to make (replace, insert, delete). Defaults to replace.'),
}));
exports.outputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    new_source: v4_1.z
        .string()
        .describe('The new source code that was written to the cell'),
    cell_id: v4_1.z
        .string()
        .optional()
        .describe('The ID of the cell that was edited'),
    cell_type: v4_1.z.enum(['code', 'markdown']).describe('The type of the cell'),
    language: v4_1.z.string().describe('The programming language of the notebook'),
    edit_mode: v4_1.z.string().describe('The edit mode that was used'),
    error: v4_1.z
        .string()
        .optional()
        .describe('Error message if the operation failed'),
    // Fields for attribution tracking
    notebook_path: v4_1.z.string().describe('The path to the notebook file'),
    original_file: v4_1.z
        .string()
        .describe('The original notebook content before modification'),
    updated_file: v4_1.z
        .string()
        .describe('The updated notebook content after modification'),
}));
exports.NotebookEditTool = (0, Tool_js_1.buildTool)({
    name: constants_js_1.NOTEBOOK_EDIT_TOOL_NAME,
    searchHint: 'edit Jupyter notebook cells (.ipynb)',
    maxResultSizeChars: 100000,
    shouldDefer: true,
    async description() {
        return prompt_js_1.DESCRIPTION;
    },
    async prompt() {
        return prompt_js_1.PROMPT;
    },
    userFacingName() {
        return 'Edit Notebook';
    },
    getToolUseSummary: UI_js_1.getToolUseSummary,
    getActivityDescription(input) {
        const summary = (0, UI_js_1.getToolUseSummary)(input);
        return summary ? `Editing notebook ${summary}` : 'Editing notebook';
    },
    get inputSchema() {
        return (0, exports.inputSchema)();
    },
    get outputSchema() {
        return (0, exports.outputSchema)();
    },
    toAutoClassifierInput(input) {
        if ((0, bun_bundle_1.feature)('TRANSCRIPT_CLASSIFIER')) {
            const mode = input.edit_mode ?? 'replace';
            return `${input.notebook_path} ${mode}: ${input.new_source}`;
        }
        return '';
    },
    getPath(input) {
        return input.notebook_path;
    },
    async checkPermissions(input, context) {
        const appState = context.getAppState();
        return (0, filesystem_js_1.checkWritePermissionForTool)(exports.NotebookEditTool, input, appState.toolPermissionContext);
    },
    mapToolResultToToolResultBlockParam({ cell_id, edit_mode, new_source, error }, toolUseID) {
        if (error) {
            return {
                tool_use_id: toolUseID,
                type: 'tool_result',
                content: error,
                is_error: true,
            };
        }
        switch (edit_mode) {
            case 'replace':
                return {
                    tool_use_id: toolUseID,
                    type: 'tool_result',
                    content: `Updated cell ${cell_id} with ${new_source}`,
                };
            case 'insert':
                return {
                    tool_use_id: toolUseID,
                    type: 'tool_result',
                    content: `Inserted cell ${cell_id} with ${new_source}`,
                };
            case 'delete':
                return {
                    tool_use_id: toolUseID,
                    type: 'tool_result',
                    content: `Deleted cell ${cell_id}`,
                };
            default:
                return {
                    tool_use_id: toolUseID,
                    type: 'tool_result',
                    content: 'Unknown edit mode',
                };
        }
    },
    renderToolUseMessage: UI_js_1.renderToolUseMessage,
    renderToolUseRejectedMessage: UI_js_1.renderToolUseRejectedMessage,
    renderToolUseErrorMessage: UI_js_1.renderToolUseErrorMessage,
    renderToolResultMessage: UI_js_1.renderToolResultMessage,
    async validateInput({ notebook_path, cell_type, cell_id, edit_mode = 'replace' }, toolUseContext) {
        const fullPath = (0, path_1.isAbsolute)(notebook_path)
            ? notebook_path
            : (0, path_1.resolve)((0, cwd_js_1.getCwd)(), notebook_path);
        // SECURITY: Skip filesystem operations for UNC paths to prevent NTLM credential leaks.
        if (fullPath.startsWith('\\\\') || fullPath.startsWith('//')) {
            return { result: true };
        }
        if ((0, path_1.extname)(fullPath) !== '.ipynb') {
            return {
                result: false,
                message: 'File must be a Jupyter notebook (.ipynb file). For editing other file types, use the FileEdit tool.',
                errorCode: 2,
            };
        }
        if (edit_mode !== 'replace' &&
            edit_mode !== 'insert' &&
            edit_mode !== 'delete') {
            return {
                result: false,
                message: 'Edit mode must be replace, insert, or delete.',
                errorCode: 4,
            };
        }
        if (edit_mode === 'insert' && !cell_type) {
            return {
                result: false,
                message: 'Cell type is required when using edit_mode=insert.',
                errorCode: 5,
            };
        }
        // Require Read-before-Edit (matches FileEditTool/FileWriteTool). Without
        // this, the model could edit a notebook it never saw, or edit against a
        // stale view after an external change — silent data loss.
        const readTimestamp = toolUseContext.readFileState.get(fullPath);
        if (!readTimestamp) {
            return {
                result: false,
                message: 'File has not been read yet. Read it first before writing to it.',
                errorCode: 9,
            };
        }
        if ((0, file_js_1.getFileModificationTime)(fullPath) > readTimestamp.timestamp) {
            return {
                result: false,
                message: 'File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.',
                errorCode: 10,
            };
        }
        let content;
        try {
            content = (0, fileRead_js_1.readFileSyncWithMetadata)(fullPath).content;
        }
        catch (e) {
            if ((0, errors_js_1.isENOENT)(e)) {
                return {
                    result: false,
                    message: 'Notebook file does not exist.',
                    errorCode: 1,
                };
            }
            throw e;
        }
        const notebook = (0, json_js_1.safeParseJSON)(content);
        if (!notebook) {
            return {
                result: false,
                message: 'Notebook is not valid JSON.',
                errorCode: 6,
            };
        }
        if (!cell_id) {
            if (edit_mode !== 'insert') {
                return {
                    result: false,
                    message: 'Cell ID must be specified when not inserting a new cell.',
                    errorCode: 7,
                };
            }
        }
        else {
            // First try to find the cell by its actual ID
            const cellIndex = notebook.cells.findIndex(cell => cell.id === cell_id);
            if (cellIndex === -1) {
                // If not found, try to parse as a numeric index (cell-N format)
                const parsedCellIndex = (0, notebook_js_1.parseCellId)(cell_id);
                if (parsedCellIndex !== undefined) {
                    if (!notebook.cells[parsedCellIndex]) {
                        return {
                            result: false,
                            message: `Cell with index ${parsedCellIndex} does not exist in notebook.`,
                            errorCode: 7,
                        };
                    }
                }
                else {
                    return {
                        result: false,
                        message: `Cell with ID "${cell_id}" not found in notebook.`,
                        errorCode: 8,
                    };
                }
            }
        }
        return { result: true };
    },
    async call({ notebook_path, new_source, cell_id, cell_type, edit_mode: originalEditMode, }, { readFileState, updateFileHistoryState }, _, parentMessage) {
        const fullPath = (0, path_1.isAbsolute)(notebook_path)
            ? notebook_path
            : (0, path_1.resolve)((0, cwd_js_1.getCwd)(), notebook_path);
        if ((0, fileHistory_js_1.fileHistoryEnabled)()) {
            await (0, fileHistory_js_1.fileHistoryTrackEdit)(updateFileHistoryState, fullPath, parentMessage.uuid);
        }
        try {
            // readFileSyncWithMetadata gives content + encoding + line endings in
            // one safeResolvePath + readFileSync pass, replacing the previous
            // detectFileEncoding + readFile + detectLineEndings chain (each of
            // which redid safeResolvePath and/or a 4KB readSync).
            const { content, encoding, lineEndings } = (0, fileRead_js_1.readFileSyncWithMetadata)(fullPath);
            // Must use non-memoized jsonParse here: safeParseJSON caches by content
            // string and returns a shared object reference, but we mutate the
            // notebook in place below (cells.splice, targetCell.source = ...).
            // Using the memoized version poisons the cache for validateInput() and
            // any subsequent call() with the same file content.
            let notebook;
            try {
                notebook = (0, slowOperations_js_1.jsonParse)(content);
            }
            catch {
                return {
                    data: {
                        new_source,
                        cell_type: cell_type ?? 'code',
                        language: 'python',
                        edit_mode: 'replace',
                        error: 'Notebook is not valid JSON.',
                        cell_id,
                        notebook_path: fullPath,
                        original_file: '',
                        updated_file: '',
                    },
                };
            }
            let cellIndex;
            if (!cell_id) {
                cellIndex = 0; // Default to inserting at the beginning if no cell_id is provided
            }
            else {
                // First try to find the cell by its actual ID
                cellIndex = notebook.cells.findIndex(cell => cell.id === cell_id);
                // If not found, try to parse as a numeric index (cell-N format)
                if (cellIndex === -1) {
                    const parsedCellIndex = (0, notebook_js_1.parseCellId)(cell_id);
                    if (parsedCellIndex !== undefined) {
                        cellIndex = parsedCellIndex;
                    }
                }
                if (originalEditMode === 'insert') {
                    cellIndex += 1; // Insert after the cell with this ID
                }
            }
            // Convert replace to insert if trying to replace one past the end
            let edit_mode = originalEditMode;
            if (edit_mode === 'replace' && cellIndex === notebook.cells.length) {
                edit_mode = 'insert';
                if (!cell_type) {
                    cell_type = 'code'; // Default to code if no cell_type specified
                }
            }
            const language = notebook.metadata.language_info?.name ?? 'python';
            let new_cell_id = undefined;
            if (notebook.nbformat > 4 ||
                (notebook.nbformat === 4 && notebook.nbformat_minor >= 5)) {
                if (edit_mode === 'insert') {
                    new_cell_id = Math.random().toString(36).substring(2, 15);
                }
                else if (cell_id !== null) {
                    new_cell_id = cell_id;
                }
            }
            if (edit_mode === 'delete') {
                // Delete the specified cell
                notebook.cells.splice(cellIndex, 1);
            }
            else if (edit_mode === 'insert') {
                let new_cell;
                if (cell_type === 'markdown') {
                    new_cell = {
                        cell_type: 'markdown',
                        id: new_cell_id,
                        source: new_source,
                        metadata: {},
                    };
                }
                else {
                    new_cell = {
                        cell_type: 'code',
                        id: new_cell_id,
                        source: new_source,
                        metadata: {},
                        execution_count: null,
                        outputs: [],
                    };
                }
                // Insert the new cell
                notebook.cells.splice(cellIndex, 0, new_cell);
            }
            else {
                // Find the specified cell
                const targetCell = notebook.cells[cellIndex]; // validateInput ensures cell_number is in bounds
                targetCell.source = new_source;
                if (targetCell.cell_type === 'code') {
                    // Reset execution count and clear outputs since cell was modified
                    targetCell.execution_count = null;
                    targetCell.outputs = [];
                }
                if (cell_type && cell_type !== targetCell.cell_type) {
                    targetCell.cell_type = cell_type;
                }
            }
            // Write back to file
            const IPYNB_INDENT = 1;
            const updatedContent = (0, slowOperations_js_1.jsonStringify)(notebook, null, IPYNB_INDENT);
            (0, file_js_1.writeTextContent)(fullPath, updatedContent, encoding, lineEndings);
            // Update readFileState with post-write mtime (matches FileEditTool/
            // FileWriteTool). offset:undefined breaks FileReadTool's dedup match —
            // without this, Read→NotebookEdit→Read in the same millisecond would
            // return the file_unchanged stub against stale in-context content.
            readFileState.set(fullPath, {
                content: updatedContent,
                timestamp: (0, file_js_1.getFileModificationTime)(fullPath),
                offset: undefined,
                limit: undefined,
            });
            const data = {
                new_source,
                cell_type: cell_type ?? 'code',
                language,
                edit_mode: edit_mode ?? 'replace',
                cell_id: new_cell_id || undefined,
                error: '',
                notebook_path: fullPath,
                original_file: content,
                updated_file: updatedContent,
            };
            return {
                data,
            };
        }
        catch (error) {
            if (error instanceof Error) {
                const data = {
                    new_source,
                    cell_type: cell_type ?? 'code',
                    language: 'python',
                    edit_mode: 'replace',
                    error: error.message,
                    cell_id,
                    notebook_path: fullPath,
                    original_file: '',
                    updated_file: '',
                };
                return {
                    data,
                };
            }
            const data = {
                new_source,
                cell_type: cell_type ?? 'code',
                language: 'python',
                edit_mode: 'replace',
                error: 'Unknown error occurred while editing notebook',
                cell_id,
                notebook_path: fullPath,
                original_file: '',
                updated_file: '',
            };
            return {
                data,
            };
        }
    },
});
