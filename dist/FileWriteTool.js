"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileWriteTool = void 0;
const path_1 = require("path");
const index_js_1 = require("src/services/analytics/index.js");
const v4_1 = require("zod/v4");
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
const fsOperations_js_1 = require("../../utils/fsOperations.js");
const gitDiff_js_1 = require("../../utils/gitDiff.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const log_js_1 = require("../../utils/log.js");
const path_js_1 = require("../../utils/path.js");
const filesystem_js_1 = require("../../utils/permissions/filesystem.js");
const shellRuleMatching_js_1 = require("../../utils/permissions/shellRuleMatching.js");
const constants_js_1 = require("../FileEditTool/constants.js");
const types_js_1 = require("../FileEditTool/types.js");
const prompt_js_1 = require("./prompt.js");
const UI_js_1 = require("./UI.js");
const inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.strictObject({
    file_path: v4_1.z
        .string()
        .describe('The absolute path to the file to write (must be absolute, not relative)'),
    content: v4_1.z.string().describe('The content to write to the file'),
}));
const outputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    type: v4_1.z
        .enum(['create', 'update'])
        .describe('Whether a new file was created or an existing file was updated'),
    filePath: v4_1.z.string().describe('The path to the file that was written'),
    content: v4_1.z.string().describe('The content that was written to the file'),
    structuredPatch: v4_1.z
        .array((0, types_js_1.hunkSchema)())
        .describe('Diff patch showing the changes'),
    originalFile: v4_1.z
        .string()
        .nullable()
        .describe('The original file content before the write (null for new files)'),
    gitDiff: (0, types_js_1.gitDiffSchema)().optional(),
}));
exports.FileWriteTool = (0, Tool_js_1.buildTool)({
    name: prompt_js_1.FILE_WRITE_TOOL_NAME,
    searchHint: 'create or overwrite files',
    maxResultSizeChars: 100000,
    strict: true,
    async description() {
        return 'Write a file to the local filesystem.';
    },
    userFacingName: UI_js_1.userFacingName,
    getToolUseSummary: UI_js_1.getToolUseSummary,
    getActivityDescription(input) {
        const summary = (0, UI_js_1.getToolUseSummary)(input);
        return summary ? `Writing ${summary}` : 'Writing file';
    },
    async prompt() {
        return (0, prompt_js_1.getWriteToolDescription)();
    },
    renderToolUseMessage: UI_js_1.renderToolUseMessage,
    isResultTruncated: UI_js_1.isResultTruncated,
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    toAutoClassifierInput(input) {
        return `${input.file_path}: ${input.content}`;
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
        return (0, filesystem_js_1.checkWritePermissionForTool)(exports.FileWriteTool, input, appState.toolPermissionContext);
    },
    renderToolUseRejectedMessage: UI_js_1.renderToolUseRejectedMessage,
    renderToolUseErrorMessage: UI_js_1.renderToolUseErrorMessage,
    renderToolResultMessage: UI_js_1.renderToolResultMessage,
    extractSearchText() {
        // Transcript render shows either content (create, via HighlightedCode)
        // or a structured diff (update). The heuristic's 'content' allowlist key
        // would index the raw content string even in update mode where it's NOT
        // shown — phantom. Under-count: tool_use already indexes file_path.
        return '';
    },
    async validateInput({ file_path, content }, toolUseContext) {
        const fullFilePath = (0, path_js_1.expandPath)(file_path);
        // Reject writes to team memory files that contain secrets
        const secretError = (0, teamMemSecretGuard_js_1.checkTeamMemSecrets)(fullFilePath, content);
        if (secretError) {
            return { result: false, message: secretError, errorCode: 0 };
        }
        // Check if path should be ignored based on permission settings
        const appState = toolUseContext.getAppState();
        const denyRule = (0, filesystem_js_1.matchingRuleForInput)(fullFilePath, appState.toolPermissionContext, 'edit', 'deny');
        if (denyRule !== null) {
            return {
                result: false,
                message: 'File is in a directory that is denied by your permission settings.',
                errorCode: 1,
            };
        }
        // SECURITY: Skip filesystem operations for UNC paths to prevent NTLM credential leaks.
        // On Windows, fs.existsSync() on UNC paths triggers SMB authentication which could
        // leak credentials to malicious servers. Let the permission check handle UNC paths.
        if (fullFilePath.startsWith('\\\\') || fullFilePath.startsWith('//')) {
            return { result: true };
        }
        const fs = (0, fsOperations_js_1.getFsImplementation)();
        let fileMtimeMs;
        try {
            const fileStat = await fs.stat(fullFilePath);
            fileMtimeMs = fileStat.mtimeMs;
        }
        catch (e) {
            if ((0, errors_js_1.isENOENT)(e)) {
                return { result: true };
            }
            throw e;
        }
        const readTimestamp = toolUseContext.readFileState.get(fullFilePath);
        if (!readTimestamp || readTimestamp.isPartialView) {
            return {
                result: false,
                message: 'File has not been read yet. Read it first before writing to it.',
                errorCode: 2,
            };
        }
        // Reuse mtime from the stat above — avoids a redundant statSync via
        // getFileModificationTime. The readTimestamp guard above ensures this
        // block is always reached when the file exists.
        const lastWriteTime = Math.floor(fileMtimeMs);
        if (lastWriteTime > readTimestamp.timestamp) {
            return {
                result: false,
                message: 'File has been modified since read, either by the user or by a linter. Read it again before attempting to write it.',
                errorCode: 3,
            };
        }
        return { result: true };
    },
    async call({ file_path, content }, { readFileState, updateFileHistoryState, dynamicSkillDirTriggers }, _, parentMessage) {
        const fullFilePath = (0, path_js_1.expandPath)(file_path);
        const dir = (0, path_1.dirname)(fullFilePath);
        // Discover skills from this file's path (fire-and-forget, non-blocking)
        const cwd = (0, cwd_js_1.getCwd)();
        const newSkillDirs = await (0, loadSkillsDir_js_1.discoverSkillDirsForPaths)([fullFilePath], cwd);
        if (newSkillDirs.length > 0) {
            // Store discovered dirs for attachment display
            for (const dir of newSkillDirs) {
                dynamicSkillDirTriggers?.add(dir);
            }
            // Don't await - let skill loading happen in the background
            (0, loadSkillsDir_js_1.addSkillDirectories)(newSkillDirs).catch(() => { });
        }
        // Activate conditional skills whose path patterns match this file
        (0, loadSkillsDir_js_1.activateConditionalSkillsForPaths)([fullFilePath], cwd);
        await diagnosticTracking_js_1.diagnosticTracker.beforeFileEdited(fullFilePath);
        // Ensure parent directory exists before the atomic read-modify-write section.
        // Must stay OUTSIDE the critical section below (a yield between the staleness
        // check and writeTextContent lets concurrent edits interleave), and BEFORE the
        // write (lazy-mkdir-on-ENOENT would fire a spurious tengu_atomic_write_error
        // inside writeFileSyncAndFlush_DEPRECATED before ENOENT propagates back).
        await (0, fsOperations_js_1.getFsImplementation)().mkdir(dir);
        if ((0, fileHistory_js_1.fileHistoryEnabled)()) {
            // Backup captures pre-edit content — safe to call before the staleness
            // check (idempotent v1 backup keyed on content hash; if staleness fails
            // later we just have an unused backup, not corrupt state).
            await (0, fileHistory_js_1.fileHistoryTrackEdit)(updateFileHistoryState, fullFilePath, parentMessage.uuid);
        }
        // Load current state and confirm no changes since last read.
        // Please avoid async operations between here and writing to disk to preserve atomicity.
        let meta;
        try {
            meta = (0, fileRead_js_1.readFileSyncWithMetadata)(fullFilePath);
        }
        catch (e) {
            if ((0, errors_js_1.isENOENT)(e)) {
                meta = null;
            }
            else {
                throw e;
            }
        }
        if (meta !== null) {
            const lastWriteTime = (0, file_js_1.getFileModificationTime)(fullFilePath);
            const lastRead = readFileState.get(fullFilePath);
            if (!lastRead || lastWriteTime > lastRead.timestamp) {
                // Timestamp indicates modification, but on Windows timestamps can change
                // without content changes (cloud sync, antivirus, etc.). For full reads,
                // compare content as a fallback to avoid false positives.
                const isFullRead = lastRead &&
                    lastRead.offset === undefined &&
                    lastRead.limit === undefined;
                // meta.content is CRLF-normalized — matches readFileState's normalized form.
                if (!isFullRead || meta.content !== lastRead.content) {
                    throw new Error(constants_js_1.FILE_UNEXPECTEDLY_MODIFIED_ERROR);
                }
            }
        }
        const enc = meta?.encoding ?? 'utf8';
        const oldContent = meta?.content ?? null;
        // Write is a full content replacement — the model sent explicit line endings
        // in `content` and meant them. Do not rewrite them. Previously we preserved
        // the old file's line endings (or sampled the repo via ripgrep for new
        // files), which silently corrupted e.g. bash scripts with \r on Linux when
        // overwriting a CRLF file or when binaries in cwd poisoned the repo sample.
        (0, file_js_1.writeTextContent)(fullFilePath, content, enc, 'LF');
        // Notify LSP servers about file modification (didChange) and save (didSave)
        const lspManager = (0, manager_js_1.getLspServerManager)();
        if (lspManager) {
            // Clear previously delivered diagnostics so new ones will be shown
            (0, LSPDiagnosticRegistry_js_1.clearDeliveredDiagnosticsForFile)(`file://${fullFilePath}`);
            // didChange: Content has been modified
            lspManager.changeFile(fullFilePath, content).catch((err) => {
                (0, debug_js_1.logForDebugging)(`LSP: Failed to notify server of file change for ${fullFilePath}: ${err.message}`);
                (0, log_js_1.logError)(err);
            });
            // didSave: File has been saved to disk (triggers diagnostics in TypeScript server)
            lspManager.saveFile(fullFilePath).catch((err) => {
                (0, debug_js_1.logForDebugging)(`LSP: Failed to notify server of file save for ${fullFilePath}: ${err.message}`);
                (0, log_js_1.logError)(err);
            });
        }
        // Notify VSCode about the file change for diff view
        (0, vscodeSdkMcp_js_1.notifyVscodeFileUpdated)(fullFilePath, oldContent, content);
        // Update read timestamp, to invalidate stale writes
        readFileState.set(fullFilePath, {
            content,
            timestamp: (0, file_js_1.getFileModificationTime)(fullFilePath),
            offset: undefined,
            limit: undefined,
        });
        // Log when writing to CLAUDE.md
        if (fullFilePath.endsWith(`${path_1.sep}CLAUDE.md`)) {
            (0, index_js_1.logEvent)('tengu_write_claudemd', {});
        }
        let gitDiff;
        if ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_REMOTE) &&
            (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_quartz_lantern', false)) {
            const startTime = Date.now();
            const diff = await (0, gitDiff_js_1.fetchSingleFileGitDiff)(fullFilePath);
            if (diff)
                gitDiff = diff;
            (0, index_js_1.logEvent)('tengu_tool_use_diff_computed', {
                isWriteTool: true,
                durationMs: Date.now() - startTime,
                hasDiff: !!diff,
            });
        }
        if (oldContent) {
            const patch = (0, diff_js_1.getPatchForDisplay)({
                filePath: file_path,
                fileContents: oldContent,
                edits: [
                    {
                        old_string: oldContent,
                        new_string: content,
                        replace_all: false,
                    },
                ],
            });
            const data = {
                type: 'update',
                filePath: file_path,
                content,
                structuredPatch: patch,
                originalFile: oldContent,
                ...(gitDiff && { gitDiff }),
            };
            // Track lines added and removed for file updates, right before yielding result
            (0, diff_js_1.countLinesChanged)(patch);
            (0, fileOperationAnalytics_js_1.logFileOperation)({
                operation: 'write',
                tool: 'FileWriteTool',
                filePath: fullFilePath,
                type: 'update',
            });
            return {
                data,
            };
        }
        const data = {
            type: 'create',
            filePath: file_path,
            content,
            structuredPatch: [],
            originalFile: null,
            ...(gitDiff && { gitDiff }),
        };
        // For creation of new files, count all lines as additions, right before yielding the result
        (0, diff_js_1.countLinesChanged)([], content);
        (0, fileOperationAnalytics_js_1.logFileOperation)({
            operation: 'write',
            tool: 'FileWriteTool',
            filePath: fullFilePath,
            type: 'create',
        });
        return {
            data,
        };
    },
    mapToolResultToToolResultBlockParam({ filePath, type }, toolUseID) {
        switch (type) {
            case 'create':
                return {
                    tool_use_id: toolUseID,
                    type: 'tool_result',
                    content: `File created successfully at: ${filePath}`,
                };
            case 'update':
                return {
                    tool_use_id: toolUseID,
                    type: 'tool_result',
                    content: `The file ${filePath} has been updated successfully.`,
                };
        }
    },
});
