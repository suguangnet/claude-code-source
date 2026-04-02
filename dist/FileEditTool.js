"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileEditTool = void 0;
const path_1 = require("path");
const index_js_1 = require("src/services/analytics/index.js");
const growthbook_js_1 = require("../../services/analytics/growthbook.js");
const diagnosticTracking_js_1 = require("../../services/diagnosticTracking.js");
const LSPDiagnosticRegistry_js_1 = require("../../services/lsp/LSPDiagnosticRegistry.js");
const manager_js_1 = require("../../services/lsp/manager.js");
const vscodeSdkMcp_js_1 = require("../../services/mcp/vscodeSdkMcp.js");
const teamMemSecretGuard_js_1 = require("../../services/teamMemorySync/teamMemSecretGuard.js");
const loadSkillsDir_js_1 = require("../../skills/loadSkillsDir.js");
const Tool_js_1 = require("../../Tool.js");
const cwd_js_1 = require("../../utils/cwd.js");
const debug_js_1 = require("../../utils/debug.js");
const diff_js_1 = require("../../utils/diff.js");
const envUtils_js_1 = require("../../utils/envUtils.js");
const errors_js_1 = require("../../utils/errors.js");
const file_js_1 = require("../../utils/file.js");
const fileHistory_js_1 = require("../../utils/fileHistory.js");
const fileOperationAnalytics_js_1 = require("../../utils/fileOperationAnalytics.js");
const fileRead_js_1 = require("../../utils/fileRead.js");
const format_js_1 = require("../../utils/format.js");
const fsOperations_js_1 = require("../../utils/fsOperations.js");
const gitDiff_js_1 = require("../../utils/gitDiff.js");
const log_js_1 = require("../../utils/log.js");
const path_js_1 = require("../../utils/path.js");
const filesystem_js_1 = require("../../utils/permissions/filesystem.js");
const shellRuleMatching_js_1 = require("../../utils/permissions/shellRuleMatching.js");
const validateEditTool_js_1 = require("../../utils/settings/validateEditTool.js");
const constants_js_1 = require("../NotebookEditTool/constants.js");
const constants_js_2 = require("./constants.js");
const prompt_js_1 = require("./prompt.js");
const types_js_1 = require("./types.js");
const UI_js_1 = require("./UI.js");
const utils_js_1 = require("./utils.js");
// V8/Bun string length limit is ~2^30 characters (~1 billion). For typical
// ASCII/Latin-1 files, 1 byte on disk = 1 character, so 1 GiB in stat bytes
// ≈ 1 billion characters ≈ the runtime string limit. Multi-byte UTF-8 files
// can be larger on disk per character, but 1 GiB is a safe byte-level guard
// that prevents OOM without being unnecessarily restrictive.
const MAX_EDIT_FILE_SIZE = 1024 * 1024 * 1024; // 1 GiB (stat bytes)
exports.FileEditTool = (0, Tool_js_1.buildTool)({
    name: constants_js_2.FILE_EDIT_TOOL_NAME,
    searchHint: 'modify file contents in place',
    maxResultSizeChars: 100000,
    strict: true,
    async description() {
        return 'A tool for editing files';
    },
    async prompt() {
        return (0, prompt_js_1.getEditToolDescription)();
    },
    userFacingName: UI_js_1.userFacingName,
    getToolUseSummary: UI_js_1.getToolUseSummary,
    getActivityDescription(input) {
        const summary = (0, UI_js_1.getToolUseSummary)(input);
        return summary ? `Editing ${summary}` : 'Editing file';
    },
    get inputSchema() {
        return (0, types_js_1.inputSchema)();
    },
    get outputSchema() {
        return (0, types_js_1.outputSchema)();
    },
    toAutoClassifierInput(input) {
        return `${input.file_path}: ${input.new_string}`;
    },
    getPath(input) {
        return input.file_path;
    },
    backfillObservableInput(input) {
        // hooks.mdx documents file_path as absolute; expand so hook allowlists
        // can't be bypassed via ~ or relative paths.
        if (typeof input.file_path === 'string') {
            input.file_path = (0, path_js_1.expandPath)(input.file_path);
        }
    },
    async preparePermissionMatcher({ file_path }) {
        return pattern => (0, shellRuleMatching_js_1.matchWildcardPattern)(pattern, file_path);
    },
    async checkPermissions(input, context) {
        const appState = context.getAppState();
        return (0, filesystem_js_1.checkWritePermissionForTool)(exports.FileEditTool, input, appState.toolPermissionContext);
    },
    renderToolUseMessage: UI_js_1.renderToolUseMessage,
    renderToolResultMessage: UI_js_1.renderToolResultMessage,
    renderToolUseRejectedMessage: UI_js_1.renderToolUseRejectedMessage,
    renderToolUseErrorMessage: UI_js_1.renderToolUseErrorMessage,
    async validateInput(input, toolUseContext) {
        const { file_path, old_string, new_string, replace_all = false } = input;
        // Use expandPath for consistent path normalization (especially on Windows
        // where "/" vs "\" can cause readFileState lookup mismatches)
        const fullFilePath = (0, path_js_1.expandPath)(file_path);
        // Reject edits to team memory files that introduce secrets
        const secretError = (0, teamMemSecretGuard_js_1.checkTeamMemSecrets)(fullFilePath, new_string);
        if (secretError) {
            return { result: false, message: secretError, errorCode: 0 };
        }
        if (old_string === new_string) {
            return {
                result: false,
                behavior: 'ask',
                message: 'No changes to make: old_string and new_string are exactly the same.',
                errorCode: 1,
            };
        }
        // Check if path should be ignored based on permission settings
        const appState = toolUseContext.getAppState();
        const denyRule = (0, filesystem_js_1.matchingRuleForInput)(fullFilePath, appState.toolPermissionContext, 'edit', 'deny');
        if (denyRule !== null) {
            return {
                result: false,
                behavior: 'ask',
                message: 'File is in a directory that is denied by your permission settings.',
                errorCode: 2,
            };
        }
        // SECURITY: Skip filesystem operations for UNC paths to prevent NTLM credential leaks.
        // On Windows, fs.existsSync() on UNC paths triggers SMB authentication which could
        // leak credentials to malicious servers. Let the permission check handle UNC paths.
        if (fullFilePath.startsWith('\\\\') || fullFilePath.startsWith('//')) {
            return { result: true };
        }
        const fs = (0, fsOperations_js_1.getFsImplementation)();
        // Prevent OOM on multi-GB files.
        try {
            const { size } = await fs.stat(fullFilePath);
            if (size > MAX_EDIT_FILE_SIZE) {
                return {
                    result: false,
                    behavior: 'ask',
                    message: `File is too large to edit (${(0, format_js_1.formatFileSize)(size)}). Maximum editable file size is ${(0, format_js_1.formatFileSize)(MAX_EDIT_FILE_SIZE)}.`,
                    errorCode: 10,
                };
            }
        }
        catch (e) {
            if (!(0, errors_js_1.isENOENT)(e)) {
                throw e;
            }
        }
        // Read the file as bytes first so we can detect encoding from the buffer
        // instead of calling detectFileEncoding (which does its own sync readSync
        // and would fail with a wasted ENOENT when the file doesn't exist).
        let fileContent;
        try {
            const fileBuffer = await fs.readFileBytes(fullFilePath);
            const encoding = fileBuffer.length >= 2 &&
                fileBuffer[0] === 0xff &&
                fileBuffer[1] === 0xfe
                ? 'utf16le'
                : 'utf8';
            fileContent = fileBuffer.toString(encoding).replaceAll('\r\n', '\n');
        }
        catch (e) {
            if ((0, errors_js_1.isENOENT)(e)) {
                fileContent = null;
            }
            else {
                throw e;
            }
        }
        // File doesn't exist
        if (fileContent === null) {
            // Empty old_string on nonexistent file means new file creation — valid
            if (old_string === '') {
                return { result: true };
            }
            // Try to find a similar file with a different extension
            const similarFilename = (0, file_js_1.findSimilarFile)(fullFilePath);
            const cwdSuggestion = await (0, file_js_1.suggestPathUnderCwd)(fullFilePath);
            let message = `File does not exist. ${file_js_1.FILE_NOT_FOUND_CWD_NOTE} ${(0, cwd_js_1.getCwd)()}.`;
            if (cwdSuggestion) {
                message += ` Did you mean ${cwdSuggestion}?`;
            }
            else if (similarFilename) {
                message += ` Did you mean ${similarFilename}?`;
            }
            return {
                result: false,
                behavior: 'ask',
                message,
                errorCode: 4,
            };
        }
        // File exists with empty old_string — only valid if file is empty
        if (old_string === '') {
            // Only reject if the file has content (for file creation attempt)
            if (fileContent.trim() !== '') {
                return {
                    result: false,
                    behavior: 'ask',
                    message: 'Cannot create new file - file already exists.',
                    errorCode: 3,
                };
            }
            // Empty file with empty old_string is valid - we're replacing empty with content
            return {
                result: true,
            };
        }
        if (fullFilePath.endsWith('.ipynb')) {
            return {
                result: false,
                behavior: 'ask',
                message: `File is a Jupyter Notebook. Use the ${constants_js_1.NOTEBOOK_EDIT_TOOL_NAME} to edit this file.`,
                errorCode: 5,
            };
        }
        const readTimestamp = toolUseContext.readFileState.get(fullFilePath);
        if (!readTimestamp || readTimestamp.isPartialView) {
            return {
                result: false,
                behavior: 'ask',
                message: 'File has not been read yet. Read it first before writing to it.',
                meta: {
                    isFilePathAbsolute: String((0, path_1.isAbsolute)(file_path)),
                },
                errorCode: 6,
            };
        }
        // Check if file exists and get its last modified time
        if (readTimestamp) {
            const lastWriteTime = (0, file_js_1.getFileModificationTime)(fullFilePath);
            if (lastWriteTime > readTimestamp.timestamp) {
                // Timestamp indicates modification, but on Windows timestamps can change
                // without content changes (cloud sync, antivirus, etc.). For full reads,
                // compare content as a fallback to avoid false positives.
                const isFullRead = readTimestamp.offset === undefined &&
                    readTimestamp.limit === undefined;
                if (isFullRead && fileContent === readTimestamp.content) {
                    // Content unchanged, safe to proceed
                }
                else {
                    return {
                        result: false,
                        behavior: 'ask',
                        message: 'File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.',
                        errorCode: 7,
                    };
                }
            }
        }
        const file = fileContent;
        // Use findActualString to handle quote normalization
        const actualOldString = (0, utils_js_1.findActualString)(file, old_string);
        if (!actualOldString) {
            return {
                result: false,
                behavior: 'ask',
                message: `String to replace not found in file.\nString: ${old_string}`,
                meta: {
                    isFilePathAbsolute: String((0, path_1.isAbsolute)(file_path)),
                },
                errorCode: 8,
            };
        }
        const matches = file.split(actualOldString).length - 1;
        // Check if we have multiple matches but replace_all is false
        if (matches > 1 && !replace_all) {
            return {
                result: false,
                behavior: 'ask',
                message: `Found ${matches} matches of the string to replace, but replace_all is false. To replace all occurrences, set replace_all to true. To replace only one occurrence, please provide more context to uniquely identify the instance.\nString: ${old_string}`,
                meta: {
                    isFilePathAbsolute: String((0, path_1.isAbsolute)(file_path)),
                    actualOldString,
                },
                errorCode: 9,
            };
        }
        // Additional validation for Claude settings files
        const settingsValidationResult = (0, validateEditTool_js_1.validateInputForSettingsFileEdit)(fullFilePath, file, () => {
            // Simulate the edit to get the final content using the exact same logic as the tool
            return replace_all
                ? file.replaceAll(actualOldString, new_string)
                : file.replace(actualOldString, new_string);
        });
        if (settingsValidationResult !== null) {
            return settingsValidationResult;
        }
        return { result: true, meta: { actualOldString } };
    },
    inputsEquivalent(input1, input2) {
        return (0, utils_js_1.areFileEditsInputsEquivalent)({
            file_path: input1.file_path,
            edits: [
                {
                    old_string: input1.old_string,
                    new_string: input1.new_string,
                    replace_all: input1.replace_all ?? false,
                },
            ],
        }, {
            file_path: input2.file_path,
            edits: [
                {
                    old_string: input2.old_string,
                    new_string: input2.new_string,
                    replace_all: input2.replace_all ?? false,
                },
            ],
        });
    },
    async call(input, { readFileState, userModified, updateFileHistoryState, dynamicSkillDirTriggers, }, _, parentMessage) {
        const { file_path, old_string, new_string, replace_all = false } = input;
        // 1. Get current state
        const fs = (0, fsOperations_js_1.getFsImplementation)();
        const absoluteFilePath = (0, path_js_1.expandPath)(file_path);
        // Discover skills from this file's path (fire-and-forget, non-blocking)
        // Skip in simple mode - no skills available
        const cwd = (0, cwd_js_1.getCwd)();
        if (!(0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_SIMPLE)) {
            const newSkillDirs = await (0, loadSkillsDir_js_1.discoverSkillDirsForPaths)([absoluteFilePath], cwd);
            if (newSkillDirs.length > 0) {
                // Store discovered dirs for attachment display
                for (const dir of newSkillDirs) {
                    dynamicSkillDirTriggers?.add(dir);
                }
                // Don't await - let skill loading happen in the background
                (0, loadSkillsDir_js_1.addSkillDirectories)(newSkillDirs).catch(() => { });
            }
            // Activate conditional skills whose path patterns match this file
            (0, loadSkillsDir_js_1.activateConditionalSkillsForPaths)([absoluteFilePath], cwd);
        }
        await diagnosticTracking_js_1.diagnosticTracker.beforeFileEdited(absoluteFilePath);
        // Ensure parent directory exists before the atomic read-modify-write section.
        // These awaits must stay OUTSIDE the critical section below — a yield between
        // the staleness check and writeTextContent lets concurrent edits interleave.
        await fs.mkdir((0, path_1.dirname)(absoluteFilePath));
        if ((0, fileHistory_js_1.fileHistoryEnabled)()) {
            // Backup captures pre-edit content — safe to call before the staleness
            // check (idempotent v1 backup keyed on content hash; if staleness fails
            // later we just have an unused backup, not corrupt state).
            await (0, fileHistory_js_1.fileHistoryTrackEdit)(updateFileHistoryState, absoluteFilePath, parentMessage.uuid);
        }
        // 2. Load current state and confirm no changes since last read
        // Please avoid async operations between here and writing to disk to preserve atomicity
        const { content: originalFileContents, fileExists, encoding, lineEndings: endings, } = readFileForEdit(absoluteFilePath);
        if (fileExists) {
            const lastWriteTime = (0, file_js_1.getFileModificationTime)(absoluteFilePath);
            const lastRead = readFileState.get(absoluteFilePath);
            if (!lastRead || lastWriteTime > lastRead.timestamp) {
                // Timestamp indicates modification, but on Windows timestamps can change
                // without content changes (cloud sync, antivirus, etc.). For full reads,
                // compare content as a fallback to avoid false positives.
                const isFullRead = lastRead &&
                    lastRead.offset === undefined &&
                    lastRead.limit === undefined;
                const contentUnchanged = isFullRead && originalFileContents === lastRead.content;
                if (!contentUnchanged) {
                    throw new Error(constants_js_2.FILE_UNEXPECTEDLY_MODIFIED_ERROR);
                }
            }
        }
        // 3. Use findActualString to handle quote normalization
        const actualOldString = (0, utils_js_1.findActualString)(originalFileContents, old_string) || old_string;
        // Preserve curly quotes in new_string when the file uses them
        const actualNewString = (0, utils_js_1.preserveQuoteStyle)(old_string, actualOldString, new_string);
        // 4. Generate patch
        const { patch, updatedFile } = (0, utils_js_1.getPatchForEdit)({
            filePath: absoluteFilePath,
            fileContents: originalFileContents,
            oldString: actualOldString,
            newString: actualNewString,
            replaceAll: replace_all,
        });
        // 5. Write to disk
        (0, file_js_1.writeTextContent)(absoluteFilePath, updatedFile, encoding, endings);
        // Notify LSP servers about file modification (didChange) and save (didSave)
        const lspManager = (0, manager_js_1.getLspServerManager)();
        if (lspManager) {
            // Clear previously delivered diagnostics so new ones will be shown
            (0, LSPDiagnosticRegistry_js_1.clearDeliveredDiagnosticsForFile)(`file://${absoluteFilePath}`);
            // didChange: Content has been modified
            lspManager
                .changeFile(absoluteFilePath, updatedFile)
                .catch((err) => {
                (0, debug_js_1.logForDebugging)(`LSP: Failed to notify server of file change for ${absoluteFilePath}: ${err.message}`);
                (0, log_js_1.logError)(err);
            });
            // didSave: File has been saved to disk (triggers diagnostics in TypeScript server)
            lspManager.saveFile(absoluteFilePath).catch((err) => {
                (0, debug_js_1.logForDebugging)(`LSP: Failed to notify server of file save for ${absoluteFilePath}: ${err.message}`);
                (0, log_js_1.logError)(err);
            });
        }
        // Notify VSCode about the file change for diff view
        (0, vscodeSdkMcp_js_1.notifyVscodeFileUpdated)(absoluteFilePath, originalFileContents, updatedFile);
        // 6. Update read timestamp, to invalidate stale writes
        readFileState.set(absoluteFilePath, {
            content: updatedFile,
            timestamp: (0, file_js_1.getFileModificationTime)(absoluteFilePath),
            offset: undefined,
            limit: undefined,
        });
        // 7. Log events
        if (absoluteFilePath.endsWith(`${path_1.sep}CLAUDE.md`)) {
            (0, index_js_1.logEvent)('tengu_write_claudemd', {});
        }
        (0, diff_js_1.countLinesChanged)(patch);
        (0, fileOperationAnalytics_js_1.logFileOperation)({
            operation: 'edit',
            tool: 'FileEditTool',
            filePath: absoluteFilePath,
        });
        (0, index_js_1.logEvent)('tengu_edit_string_lengths', {
            oldStringBytes: Buffer.byteLength(old_string, 'utf8'),
            newStringBytes: Buffer.byteLength(new_string, 'utf8'),
            replaceAll: replace_all,
        });
        let gitDiff;
        if ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_REMOTE) &&
            (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_quartz_lantern', false)) {
            const startTime = Date.now();
            const diff = await (0, gitDiff_js_1.fetchSingleFileGitDiff)(absoluteFilePath);
            if (diff)
                gitDiff = diff;
            (0, index_js_1.logEvent)('tengu_tool_use_diff_computed', {
                isEditTool: true,
                durationMs: Date.now() - startTime,
                hasDiff: !!diff,
            });
        }
        // 8. Yield result
        const data = {
            filePath: file_path,
            oldString: actualOldString,
            newString: new_string,
            originalFile: originalFileContents,
            structuredPatch: patch,
            userModified: userModified ?? false,
            replaceAll: replace_all,
            ...(gitDiff && { gitDiff }),
        };
        return {
            data,
        };
    },
    mapToolResultToToolResultBlockParam(data, toolUseID) {
        const { filePath, userModified, replaceAll } = data;
        const modifiedNote = userModified
            ? '.  The user modified your proposed changes before accepting them. '
            : '';
        if (replaceAll) {
            return {
                tool_use_id: toolUseID,
                type: 'tool_result',
                content: `The file ${filePath} has been updated${modifiedNote}. All occurrences were successfully replaced.`,
            };
        }
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: `The file ${filePath} has been updated successfully${modifiedNote}.`,
        };
    },
});
// --
function readFileForEdit(absoluteFilePath) {
    try {
        // eslint-disable-next-line custom-rules/no-sync-fs
        const meta = (0, fileRead_js_1.readFileSyncWithMetadata)(absoluteFilePath);
        return {
            content: meta.content,
            fileExists: true,
            encoding: meta.encoding,
            lineEndings: meta.lineEndings,
        };
    }
    catch (e) {
        if ((0, errors_js_1.isENOENT)(e)) {
            return {
                content: '',
                fileExists: false,
                encoding: 'utf8',
                lineEndings: 'LF',
            };
        }
        throw e;
    }
}
