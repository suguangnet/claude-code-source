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
exports.CYBER_RISK_MITIGATION_REMINDER = exports.FileReadTool = exports.MaxFileReadTokenExceededError = void 0;
exports.registerFileReadListener = registerFileReadListener;
exports.readImageWithTokenBudget = readImageWithTokenBudget;
const promises_1 = require("fs/promises");
const path = __importStar(require("path"));
const path_1 = require("path");
const v4_1 = require("zod/v4");
const apiLimits_js_1 = require("../../constants/apiLimits.js");
const files_js_1 = require("../../constants/files.js");
const memoryAge_js_1 = require("../../memdir/memoryAge.js");
const growthbook_js_1 = require("../../services/analytics/growthbook.js");
const index_js_1 = require("../../services/analytics/index.js");
const metadata_js_1 = require("../../services/analytics/metadata.js");
const tokenEstimation_js_1 = require("../../services/tokenEstimation.js");
const loadSkillsDir_js_1 = require("../../skills/loadSkillsDir.js");
const Tool_js_1 = require("../../Tool.js");
const cwd_js_1 = require("../../utils/cwd.js");
const envUtils_js_1 = require("../../utils/envUtils.js");
const errors_js_1 = require("../../utils/errors.js");
const file_js_1 = require("../../utils/file.js");
const fileOperationAnalytics_js_1 = require("../../utils/fileOperationAnalytics.js");
const format_js_1 = require("../../utils/format.js");
const fsOperations_js_1 = require("../../utils/fsOperations.js");
const imageResizer_js_1 = require("../../utils/imageResizer.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const log_js_1 = require("../../utils/log.js");
const memoryFileDetection_js_1 = require("../../utils/memoryFileDetection.js");
const messages_js_1 = require("../../utils/messages.js");
const model_js_1 = require("../../utils/model/model.js");
const notebook_js_1 = require("../../utils/notebook.js");
const path_js_1 = require("../../utils/path.js");
const pdf_js_1 = require("../../utils/pdf.js");
const pdfUtils_js_1 = require("../../utils/pdfUtils.js");
const filesystem_js_1 = require("../../utils/permissions/filesystem.js");
const shellRuleMatching_js_1 = require("../../utils/permissions/shellRuleMatching.js");
const readFileInRange_js_1 = require("../../utils/readFileInRange.js");
const semanticNumber_js_1 = require("../../utils/semanticNumber.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const toolName_js_1 = require("../BashTool/toolName.js");
const limits_js_1 = require("./limits.js");
const prompt_js_1 = require("./prompt.js");
const UI_js_1 = require("./UI.js");
// Device files that would hang the process: infinite output or blocking input.
// Checked by path only (no I/O). Safe devices like /dev/null are intentionally omitted.
const BLOCKED_DEVICE_PATHS = new Set([
    // Infinite output — never reach EOF
    '/dev/zero',
    '/dev/random',
    '/dev/urandom',
    '/dev/full',
    // Blocks waiting for input
    '/dev/stdin',
    '/dev/tty',
    '/dev/console',
    // Nonsensical to read
    '/dev/stdout',
    '/dev/stderr',
    // fd aliases for stdin/stdout/stderr
    '/dev/fd/0',
    '/dev/fd/1',
    '/dev/fd/2',
]);
function isBlockedDevicePath(filePath) {
    if (BLOCKED_DEVICE_PATHS.has(filePath))
        return true;
    // /proc/self/fd/0-2 and /proc/<pid>/fd/0-2 are Linux aliases for stdio
    if (filePath.startsWith('/proc/') &&
        (filePath.endsWith('/fd/0') ||
            filePath.endsWith('/fd/1') ||
            filePath.endsWith('/fd/2')))
        return true;
    return false;
}
// Narrow no-break space (U+202F) used by some macOS versions in screenshot filenames
const THIN_SPACE = String.fromCharCode(8239);
/**
 * Resolves macOS screenshot paths that may have different space characters.
 * macOS uses either regular space or thin space (U+202F) before AM/PM in screenshot
 * filenames depending on the macOS version. This function tries the alternate space
 * character if the file doesn't exist with the given path.
 *
 * @param filePath - The normalized file path to resolve
 * @returns The path to the actual file on disk (may differ in space character)
 */
/**
 * For macOS screenshot paths with AM/PM, the space before AM/PM may be a
 * regular space or a thin space depending on the macOS version.  Returns
 * the alternate path to try if the original doesn't exist, or undefined.
 */
function getAlternateScreenshotPath(filePath) {
    const filename = path.basename(filePath);
    const amPmPattern = /^(.+)([ \u202F])(AM|PM)(\.png)$/;
    const match = filename.match(amPmPattern);
    if (!match)
        return undefined;
    const currentSpace = match[2];
    const alternateSpace = currentSpace === ' ' ? THIN_SPACE : ' ';
    return filePath.replace(`${currentSpace}${match[3]}${match[4]}`, `${alternateSpace}${match[3]}${match[4]}`);
}
const fileReadListeners = [];
function registerFileReadListener(listener) {
    fileReadListeners.push(listener);
    return () => {
        const i = fileReadListeners.indexOf(listener);
        if (i >= 0)
            fileReadListeners.splice(i, 1);
    };
}
class MaxFileReadTokenExceededError extends Error {
    constructor(tokenCount, maxTokens) {
        super(`File content (${tokenCount} tokens) exceeds maximum allowed tokens (${maxTokens}). Use offset and limit parameters to read specific portions of the file, or search for specific content instead of reading the whole file.`);
        this.tokenCount = tokenCount;
        this.maxTokens = maxTokens;
        this.name = 'MaxFileReadTokenExceededError';
    }
}
exports.MaxFileReadTokenExceededError = MaxFileReadTokenExceededError;
// Common image extensions
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
/**
 * Detects if a file path is a session-related file for analytics logging.
 * Only matches files within the Claude config directory (e.g., ~/.claude).
 * Returns the type of session file or null if not a session file.
 */
function detectSessionFileType(filePath) {
    const configDir = (0, envUtils_js_1.getClaudeConfigHomeDir)();
    // Only match files within the Claude config directory
    if (!filePath.startsWith(configDir)) {
        return null;
    }
    // Normalize path to use forward slashes for consistent matching across platforms
    const normalizedPath = filePath.split(path_1.win32.sep).join(path_1.posix.sep);
    // Session memory files: ~/.claude/session-memory/*.md (including summary.md)
    if (normalizedPath.includes('/session-memory/') &&
        normalizedPath.endsWith('.md')) {
        return 'session_memory';
    }
    // Session JSONL transcript files: ~/.claude/projects/*/*.jsonl
    if (normalizedPath.includes('/projects/') &&
        normalizedPath.endsWith('.jsonl')) {
        return 'session_transcript';
    }
    return null;
}
const inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.strictObject({
    file_path: v4_1.z.string().describe('The absolute path to the file to read'),
    offset: (0, semanticNumber_js_1.semanticNumber)(v4_1.z.number().int().nonnegative().optional()).describe('The line number to start reading from. Only provide if the file is too large to read at once'),
    limit: (0, semanticNumber_js_1.semanticNumber)(v4_1.z.number().int().positive().optional()).describe('The number of lines to read. Only provide if the file is too large to read at once.'),
    pages: v4_1.z
        .string()
        .optional()
        .describe(`Page range for PDF files (e.g., "1-5", "3", "10-20"). Only applicable to PDF files. Maximum ${apiLimits_js_1.PDF_MAX_PAGES_PER_READ} pages per request.`),
}));
const outputSchema = (0, lazySchema_js_1.lazySchema)(() => {
    // Define the media types supported for images
    const imageMediaTypes = v4_1.z.enum([
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
    ]);
    return v4_1.z.discriminatedUnion('type', [
        v4_1.z.object({
            type: v4_1.z.literal('text'),
            file: v4_1.z.object({
                filePath: v4_1.z.string().describe('The path to the file that was read'),
                content: v4_1.z.string().describe('The content of the file'),
                numLines: v4_1.z
                    .number()
                    .describe('Number of lines in the returned content'),
                startLine: v4_1.z.number().describe('The starting line number'),
                totalLines: v4_1.z.number().describe('Total number of lines in the file'),
            }),
        }),
        v4_1.z.object({
            type: v4_1.z.literal('image'),
            file: v4_1.z.object({
                base64: v4_1.z.string().describe('Base64-encoded image data'),
                type: imageMediaTypes.describe('The MIME type of the image'),
                originalSize: v4_1.z.number().describe('Original file size in bytes'),
                dimensions: v4_1.z
                    .object({
                    originalWidth: v4_1.z
                        .number()
                        .optional()
                        .describe('Original image width in pixels'),
                    originalHeight: v4_1.z
                        .number()
                        .optional()
                        .describe('Original image height in pixels'),
                    displayWidth: v4_1.z
                        .number()
                        .optional()
                        .describe('Displayed image width in pixels (after resizing)'),
                    displayHeight: v4_1.z
                        .number()
                        .optional()
                        .describe('Displayed image height in pixels (after resizing)'),
                })
                    .optional()
                    .describe('Image dimension info for coordinate mapping'),
            }),
        }),
        v4_1.z.object({
            type: v4_1.z.literal('notebook'),
            file: v4_1.z.object({
                filePath: v4_1.z.string().describe('The path to the notebook file'),
                cells: v4_1.z.array(v4_1.z.any()).describe('Array of notebook cells'),
            }),
        }),
        v4_1.z.object({
            type: v4_1.z.literal('pdf'),
            file: v4_1.z.object({
                filePath: v4_1.z.string().describe('The path to the PDF file'),
                base64: v4_1.z.string().describe('Base64-encoded PDF data'),
                originalSize: v4_1.z.number().describe('Original file size in bytes'),
            }),
        }),
        v4_1.z.object({
            type: v4_1.z.literal('parts'),
            file: v4_1.z.object({
                filePath: v4_1.z.string().describe('The path to the PDF file'),
                originalSize: v4_1.z.number().describe('Original file size in bytes'),
                count: v4_1.z.number().describe('Number of pages extracted'),
                outputDir: v4_1.z
                    .string()
                    .describe('Directory containing extracted page images'),
            }),
        }),
        v4_1.z.object({
            type: v4_1.z.literal('file_unchanged'),
            file: v4_1.z.object({
                filePath: v4_1.z.string().describe('The path to the file'),
            }),
        }),
    ]);
});
exports.FileReadTool = (0, Tool_js_1.buildTool)({
    name: prompt_js_1.FILE_READ_TOOL_NAME,
    searchHint: 'read files, images, PDFs, notebooks',
    // Output is bounded by maxTokens (validateContentTokens). Persisting to a
    // file the model reads back with Read is circular — never persist.
    maxResultSizeChars: Infinity,
    strict: true,
    async description() {
        return prompt_js_1.DESCRIPTION;
    },
    async prompt() {
        const limits = (0, limits_js_1.getDefaultFileReadingLimits)();
        const maxSizeInstruction = limits.includeMaxSizeInPrompt
            ? `. Files larger than ${(0, format_js_1.formatFileSize)(limits.maxSizeBytes)} will return an error; use offset and limit for larger files`
            : '';
        const offsetInstruction = limits.targetedRangeNudge
            ? prompt_js_1.OFFSET_INSTRUCTION_TARGETED
            : prompt_js_1.OFFSET_INSTRUCTION_DEFAULT;
        return (0, prompt_js_1.renderPromptTemplate)(pickLineFormatInstruction(), maxSizeInstruction, offsetInstruction);
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    userFacingName: UI_js_1.userFacingName,
    getToolUseSummary: UI_js_1.getToolUseSummary,
    getActivityDescription(input) {
        const summary = (0, UI_js_1.getToolUseSummary)(input);
        return summary ? `Reading ${summary}` : 'Reading file';
    },
    isConcurrencySafe() {
        return true;
    },
    isReadOnly() {
        return true;
    },
    toAutoClassifierInput(input) {
        return input.file_path;
    },
    isSearchOrReadCommand() {
        return { isSearch: false, isRead: true };
    },
    getPath({ file_path }) {
        return file_path || (0, cwd_js_1.getCwd)();
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
        return (0, filesystem_js_1.checkReadPermissionForTool)(exports.FileReadTool, input, appState.toolPermissionContext);
    },
    renderToolUseMessage: UI_js_1.renderToolUseMessage,
    renderToolUseTag: UI_js_1.renderToolUseTag,
    renderToolResultMessage: UI_js_1.renderToolResultMessage,
    // UI.tsx:140 — ALL types render summary chrome only: "Read N lines",
    // "Read image (42KB)". Never the content itself. The model-facing
    // serialization (below) sends content + CYBER_RISK_MITIGATION_REMINDER
    // + line prefixes; UI shows none of it. Nothing to index. Caught by
    // the render-fidelity test when this initially claimed file.content.
    extractSearchText() {
        return '';
    },
    renderToolUseErrorMessage: UI_js_1.renderToolUseErrorMessage,
    async validateInput({ file_path, pages }, toolUseContext) {
        // Validate pages parameter (pure string parsing, no I/O)
        if (pages !== undefined) {
            const parsed = (0, pdfUtils_js_1.parsePDFPageRange)(pages);
            if (!parsed) {
                return {
                    result: false,
                    message: `Invalid pages parameter: "${pages}". Use formats like "1-5", "3", or "10-20". Pages are 1-indexed.`,
                    errorCode: 7,
                };
            }
            const rangeSize = parsed.lastPage === Infinity
                ? apiLimits_js_1.PDF_MAX_PAGES_PER_READ + 1
                : parsed.lastPage - parsed.firstPage + 1;
            if (rangeSize > apiLimits_js_1.PDF_MAX_PAGES_PER_READ) {
                return {
                    result: false,
                    message: `Page range "${pages}" exceeds maximum of ${apiLimits_js_1.PDF_MAX_PAGES_PER_READ} pages per request. Please use a smaller range.`,
                    errorCode: 8,
                };
            }
        }
        // Path expansion + deny rule check (no I/O)
        const fullFilePath = (0, path_js_1.expandPath)(file_path);
        const appState = toolUseContext.getAppState();
        const denyRule = (0, filesystem_js_1.matchingRuleForInput)(fullFilePath, appState.toolPermissionContext, 'read', 'deny');
        if (denyRule !== null) {
            return {
                result: false,
                message: 'File is in a directory that is denied by your permission settings.',
                errorCode: 1,
            };
        }
        // SECURITY: UNC path check (no I/O) — defer filesystem operations
        // until after user grants permission to prevent NTLM credential leaks
        const isUncPath = fullFilePath.startsWith('\\\\') || fullFilePath.startsWith('//');
        if (isUncPath) {
            return { result: true };
        }
        // Binary extension check (string check on extension only, no I/O).
        // PDF, images, and SVG are excluded - this tool renders them natively.
        const ext = path.extname(fullFilePath).toLowerCase();
        if ((0, files_js_1.hasBinaryExtension)(fullFilePath) &&
            !(0, pdfUtils_js_1.isPDFExtension)(ext) &&
            !IMAGE_EXTENSIONS.has(ext.slice(1))) {
            return {
                result: false,
                message: `This tool cannot read binary files. The file appears to be a binary ${ext} file. Please use appropriate tools for binary file analysis.`,
                errorCode: 4,
            };
        }
        // Block specific device files that would hang (infinite output or blocking input).
        // This is a path-based check with no I/O — safe special files like /dev/null are allowed.
        if (isBlockedDevicePath(fullFilePath)) {
            return {
                result: false,
                message: `Cannot read '${file_path}': this device file would block or produce infinite output.`,
                errorCode: 9,
            };
        }
        return { result: true };
    },
    async call({ file_path, offset = 1, limit = undefined, pages }, context, _canUseTool, parentMessage) {
        const { readFileState, fileReadingLimits } = context;
        const defaults = (0, limits_js_1.getDefaultFileReadingLimits)();
        const maxSizeBytes = fileReadingLimits?.maxSizeBytes ?? defaults.maxSizeBytes;
        const maxTokens = fileReadingLimits?.maxTokens ?? defaults.maxTokens;
        // Telemetry: track when callers override default read limits.
        // Only fires on override (low volume) — event count = override frequency.
        if (fileReadingLimits !== undefined) {
            (0, index_js_1.logEvent)('tengu_file_read_limits_override', {
                hasMaxTokens: fileReadingLimits.maxTokens !== undefined,
                hasMaxSizeBytes: fileReadingLimits.maxSizeBytes !== undefined,
            });
        }
        const ext = path.extname(file_path).toLowerCase().slice(1);
        // Use expandPath for consistent path normalization with FileEditTool/FileWriteTool
        // (especially handles whitespace trimming and Windows path separators)
        const fullFilePath = (0, path_js_1.expandPath)(file_path);
        // Dedup: if we've already read this exact range and the file hasn't
        // changed on disk, return a stub instead of re-sending the full content.
        // The earlier Read tool_result is still in context — two full copies
        // waste cache_creation tokens on every subsequent turn. BQ proxy shows
        // ~18% of Read calls are same-file collisions (up to 2.64% of fleet
        // cache_creation). Only applies to text/notebook reads — images/PDFs
        // aren't cached in readFileState so won't match here.
        //
        // Ant soak: 1,734 dedup hits in 2h, no Read error regression.
        // Killswitch pattern: GB can disable if the stub message confuses
        // the model externally.
        // 3P default: killswitch off = dedup enabled. Client-side only — no
        // server support needed, safe for Bedrock/Vertex/Foundry.
        const dedupKillswitch = (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_read_dedup_killswitch', false);
        const existingState = dedupKillswitch
            ? undefined
            : readFileState.get(fullFilePath);
        // Only dedup entries that came from a prior Read (offset is always set
        // by Read). Edit/Write store offset=undefined — their readFileState
        // entry reflects post-edit mtime, so deduping against it would wrongly
        // point the model at the pre-edit Read content.
        if (existingState &&
            !existingState.isPartialView &&
            existingState.offset !== undefined) {
            const rangeMatch = existingState.offset === offset && existingState.limit === limit;
            if (rangeMatch) {
                try {
                    const mtimeMs = await (0, file_js_1.getFileModificationTimeAsync)(fullFilePath);
                    if (mtimeMs === existingState.timestamp) {
                        const analyticsExt = (0, metadata_js_1.getFileExtensionForAnalytics)(fullFilePath);
                        (0, index_js_1.logEvent)('tengu_file_read_dedup', {
                            ...(analyticsExt !== undefined && { ext: analyticsExt }),
                        });
                        return {
                            data: {
                                type: 'file_unchanged',
                                file: { filePath: file_path },
                            },
                        };
                    }
                }
                catch {
                    // stat failed — fall through to full read
                }
            }
        }
        // Discover skills from this file's path (fire-and-forget, non-blocking)
        // Skip in simple mode - no skills available
        const cwd = (0, cwd_js_1.getCwd)();
        if (!(0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_SIMPLE)) {
            const newSkillDirs = await (0, loadSkillsDir_js_1.discoverSkillDirsForPaths)([fullFilePath], cwd);
            if (newSkillDirs.length > 0) {
                // Store discovered dirs for attachment display
                for (const dir of newSkillDirs) {
                    context.dynamicSkillDirTriggers?.add(dir);
                }
                // Don't await - let skill loading happen in the background
                (0, loadSkillsDir_js_1.addSkillDirectories)(newSkillDirs).catch(() => { });
            }
            // Activate conditional skills whose path patterns match this file
            (0, loadSkillsDir_js_1.activateConditionalSkillsForPaths)([fullFilePath], cwd);
        }
        try {
            return await callInner(file_path, fullFilePath, fullFilePath, ext, offset, limit, pages, maxSizeBytes, maxTokens, readFileState, context, parentMessage?.message.id);
        }
        catch (error) {
            // Handle file-not-found: suggest similar files
            const code = (0, errors_js_1.getErrnoCode)(error);
            if (code === 'ENOENT') {
                // macOS screenshots may use a thin space or regular space before
                // AM/PM — try the alternate before giving up.
                const altPath = getAlternateScreenshotPath(fullFilePath);
                if (altPath) {
                    try {
                        return await callInner(file_path, fullFilePath, altPath, ext, offset, limit, pages, maxSizeBytes, maxTokens, readFileState, context, parentMessage?.message.id);
                    }
                    catch (altError) {
                        if (!(0, errors_js_1.isENOENT)(altError)) {
                            throw altError;
                        }
                        // Alt path also missing — fall through to friendly error
                    }
                }
                const similarFilename = (0, file_js_1.findSimilarFile)(fullFilePath);
                const cwdSuggestion = await (0, file_js_1.suggestPathUnderCwd)(fullFilePath);
                let message = `File does not exist. ${file_js_1.FILE_NOT_FOUND_CWD_NOTE} ${(0, cwd_js_1.getCwd)()}.`;
                if (cwdSuggestion) {
                    message += ` Did you mean ${cwdSuggestion}?`;
                }
                else if (similarFilename) {
                    message += ` Did you mean ${similarFilename}?`;
                }
                throw new Error(message);
            }
            throw error;
        }
    },
    mapToolResultToToolResultBlockParam(data, toolUseID) {
        switch (data.type) {
            case 'image': {
                return {
                    tool_use_id: toolUseID,
                    type: 'tool_result',
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                data: data.file.base64,
                                media_type: data.file.type,
                            },
                        },
                    ],
                };
            }
            case 'notebook':
                return (0, notebook_js_1.mapNotebookCellsToToolResult)(data.file.cells, toolUseID);
            case 'pdf':
                // Return PDF metadata only - the actual content is sent as a supplemental DocumentBlockParam
                return {
                    tool_use_id: toolUseID,
                    type: 'tool_result',
                    content: `PDF file read: ${data.file.filePath} (${(0, format_js_1.formatFileSize)(data.file.originalSize)})`,
                };
            case 'parts':
                // Extracted page images are read and sent as image blocks in mapToolResultToAPIMessage
                return {
                    tool_use_id: toolUseID,
                    type: 'tool_result',
                    content: `PDF pages extracted: ${data.file.count} page(s) from ${data.file.filePath} (${(0, format_js_1.formatFileSize)(data.file.originalSize)})`,
                };
            case 'file_unchanged':
                return {
                    tool_use_id: toolUseID,
                    type: 'tool_result',
                    content: prompt_js_1.FILE_UNCHANGED_STUB,
                };
            case 'text': {
                let content;
                if (data.file.content) {
                    content =
                        memoryFileFreshnessPrefix(data) +
                            formatFileLines(data.file) +
                            (shouldIncludeFileReadMitigation()
                                ? exports.CYBER_RISK_MITIGATION_REMINDER
                                : '');
                }
                else {
                    // Determine the appropriate warning message
                    content =
                        data.file.totalLines === 0
                            ? '<system-reminder>Warning: the file exists but the contents are empty.</system-reminder>'
                            : `<system-reminder>Warning: the file exists but is shorter than the provided offset (${data.file.startLine}). The file has ${data.file.totalLines} lines.</system-reminder>`;
                }
                return {
                    tool_use_id: toolUseID,
                    type: 'tool_result',
                    content,
                };
            }
        }
    },
});
function pickLineFormatInstruction() {
    return prompt_js_1.LINE_FORMAT_INSTRUCTION;
}
/** Format file content with line numbers. */
function formatFileLines(file) {
    return (0, file_js_1.addLineNumbers)(file);
}
exports.CYBER_RISK_MITIGATION_REMINDER = '\n\n<system-reminder>\nWhenever you read a file, you should consider whether it would be considered malware. You CAN and SHOULD provide analysis of malware, what it is doing. But you MUST refuse to improve or augment the code. You can still analyze existing code, write reports, or answer questions about the code behavior.\n</system-reminder>\n';
// Models where cyber risk mitigation should be skipped
const MITIGATION_EXEMPT_MODELS = new Set(['claude-opus-4-6']);
function shouldIncludeFileReadMitigation() {
    const shortName = (0, model_js_1.getCanonicalName)((0, model_js_1.getMainLoopModel)());
    return !MITIGATION_EXEMPT_MODELS.has(shortName);
}
/**
 * Side-channel from call() to mapToolResultToToolResultBlockParam: mtime
 * of auto-memory files, keyed by the `data` object identity. Avoids
 * adding a presentation-only field to the output schema (which flows
 * into SDK types) and avoids sync fs in the mapper. WeakMap auto-GCs
 * when the data object becomes unreachable after rendering.
 */
const memoryFileMtimes = new WeakMap();
function memoryFileFreshnessPrefix(data) {
    const mtimeMs = memoryFileMtimes.get(data);
    if (mtimeMs === undefined)
        return '';
    return (0, memoryAge_js_1.memoryFreshnessNote)(mtimeMs);
}
async function validateContentTokens(content, ext, maxTokens) {
    const effectiveMaxTokens = maxTokens ?? (0, limits_js_1.getDefaultFileReadingLimits)().maxTokens;
    const tokenEstimate = (0, tokenEstimation_js_1.roughTokenCountEstimationForFileType)(content, ext);
    if (!tokenEstimate || tokenEstimate <= effectiveMaxTokens / 4)
        return;
    const tokenCount = await (0, tokenEstimation_js_1.countTokensWithAPI)(content);
    const effectiveCount = tokenCount ?? tokenEstimate;
    if (effectiveCount > effectiveMaxTokens) {
        throw new MaxFileReadTokenExceededError(effectiveCount, effectiveMaxTokens);
    }
}
function createImageResponse(buffer, mediaType, originalSize, dimensions) {
    return {
        type: 'image',
        file: {
            base64: buffer.toString('base64'),
            type: `image/${mediaType}`,
            originalSize,
            dimensions,
        },
    };
}
/**
 * Inner implementation of call, separated to allow ENOENT handling in the outer call.
 */
async function callInner(file_path, fullFilePath, resolvedFilePath, ext, offset, limit, pages, maxSizeBytes, maxTokens, readFileState, context, messageId) {
    // --- Notebook ---
    if (ext === 'ipynb') {
        const cells = await (0, notebook_js_1.readNotebook)(resolvedFilePath);
        const cellsJson = (0, slowOperations_js_1.jsonStringify)(cells);
        const cellsJsonBytes = Buffer.byteLength(cellsJson);
        if (cellsJsonBytes > maxSizeBytes) {
            throw new Error(`Notebook content (${(0, format_js_1.formatFileSize)(cellsJsonBytes)}) exceeds maximum allowed size (${(0, format_js_1.formatFileSize)(maxSizeBytes)}). ` +
                `Use ${toolName_js_1.BASH_TOOL_NAME} with jq to read specific portions:\n` +
                `  cat "${file_path}" | jq '.cells[:20]' # First 20 cells\n` +
                `  cat "${file_path}" | jq '.cells[100:120]' # Cells 100-120\n` +
                `  cat "${file_path}" | jq '.cells | length' # Count total cells\n` +
                `  cat "${file_path}" | jq '.cells[] | select(.cell_type=="code") | .source' # All code sources`);
        }
        await validateContentTokens(cellsJson, ext, maxTokens);
        // Get mtime via async stat (single call, no prior existence check)
        const stats = await (0, fsOperations_js_1.getFsImplementation)().stat(resolvedFilePath);
        readFileState.set(fullFilePath, {
            content: cellsJson,
            timestamp: Math.floor(stats.mtimeMs),
            offset,
            limit,
        });
        context.nestedMemoryAttachmentTriggers?.add(fullFilePath);
        const data = {
            type: 'notebook',
            file: { filePath: file_path, cells },
        };
        (0, fileOperationAnalytics_js_1.logFileOperation)({
            operation: 'read',
            tool: 'FileReadTool',
            filePath: fullFilePath,
            content: cellsJson,
        });
        return { data };
    }
    // --- Image (single read, no double-read) ---
    if (IMAGE_EXTENSIONS.has(ext)) {
        // Images have their own size limits (token budget + compression) —
        // don't apply the text maxSizeBytes cap.
        const data = await readImageWithTokenBudget(resolvedFilePath, maxTokens);
        context.nestedMemoryAttachmentTriggers?.add(fullFilePath);
        (0, fileOperationAnalytics_js_1.logFileOperation)({
            operation: 'read',
            tool: 'FileReadTool',
            filePath: fullFilePath,
            content: data.file.base64,
        });
        const metadataText = data.file.dimensions
            ? (0, imageResizer_js_1.createImageMetadataText)(data.file.dimensions)
            : null;
        return {
            data,
            ...(metadataText && {
                newMessages: [
                    (0, messages_js_1.createUserMessage)({ content: metadataText, isMeta: true }),
                ],
            }),
        };
    }
    // --- PDF ---
    if ((0, pdfUtils_js_1.isPDFExtension)(ext)) {
        if (pages) {
            const parsedRange = (0, pdfUtils_js_1.parsePDFPageRange)(pages);
            const extractResult = await (0, pdf_js_1.extractPDFPages)(resolvedFilePath, parsedRange ?? undefined);
            if (!extractResult.success) {
                throw new Error(extractResult.error.message);
            }
            (0, index_js_1.logEvent)('tengu_pdf_page_extraction', {
                success: true,
                pageCount: extractResult.data.file.count,
                fileSize: extractResult.data.file.originalSize,
                hasPageRange: true,
            });
            (0, fileOperationAnalytics_js_1.logFileOperation)({
                operation: 'read',
                tool: 'FileReadTool',
                filePath: fullFilePath,
                content: `PDF pages ${pages}`,
            });
            const entries = await (0, promises_1.readdir)(extractResult.data.file.outputDir);
            const imageFiles = entries.filter(f => f.endsWith('.jpg')).sort();
            const imageBlocks = await Promise.all(imageFiles.map(async (f) => {
                const imgPath = path.join(extractResult.data.file.outputDir, f);
                const imgBuffer = await (0, promises_1.readFile)(imgPath);
                const resized = await (0, imageResizer_js_1.maybeResizeAndDownsampleImageBuffer)(imgBuffer, imgBuffer.length, 'jpeg');
                return {
                    type: 'image',
                    source: {
                        type: 'base64',
                        media_type: `image/${resized.mediaType}`,
                        data: resized.buffer.toString('base64'),
                    },
                };
            }));
            return {
                data: extractResult.data,
                ...(imageBlocks.length > 0 && {
                    newMessages: [
                        (0, messages_js_1.createUserMessage)({ content: imageBlocks, isMeta: true }),
                    ],
                }),
            };
        }
        const pageCount = await (0, pdf_js_1.getPDFPageCount)(resolvedFilePath);
        if (pageCount !== null && pageCount > apiLimits_js_1.PDF_AT_MENTION_INLINE_THRESHOLD) {
            throw new Error(`This PDF has ${pageCount} pages, which is too many to read at once. ` +
                `Use the pages parameter to read specific page ranges (e.g., pages: "1-5"). ` +
                `Maximum ${apiLimits_js_1.PDF_MAX_PAGES_PER_READ} pages per request.`);
        }
        const fs = (0, fsOperations_js_1.getFsImplementation)();
        const stats = await fs.stat(resolvedFilePath);
        const shouldExtractPages = !(0, pdfUtils_js_1.isPDFSupported)() || stats.size > apiLimits_js_1.PDF_EXTRACT_SIZE_THRESHOLD;
        if (shouldExtractPages) {
            const extractResult = await (0, pdf_js_1.extractPDFPages)(resolvedFilePath);
            if (extractResult.success) {
                (0, index_js_1.logEvent)('tengu_pdf_page_extraction', {
                    success: true,
                    pageCount: extractResult.data.file.count,
                    fileSize: extractResult.data.file.originalSize,
                });
            }
            else {
                (0, index_js_1.logEvent)('tengu_pdf_page_extraction', {
                    success: false,
                    available: extractResult.error.reason !== 'unavailable',
                    fileSize: stats.size,
                });
            }
        }
        if (!(0, pdfUtils_js_1.isPDFSupported)()) {
            throw new Error('Reading full PDFs is not supported with this model. Use a newer model (Sonnet 3.5 v2 or later), ' +
                `or use the pages parameter to read specific page ranges (e.g., pages: "1-5", maximum ${apiLimits_js_1.PDF_MAX_PAGES_PER_READ} pages per request). ` +
                'Page extraction requires poppler-utils: install with `brew install poppler` on macOS or `apt-get install poppler-utils` on Debian/Ubuntu.');
        }
        const readResult = await (0, pdf_js_1.readPDF)(resolvedFilePath);
        if (!readResult.success) {
            throw new Error(readResult.error.message);
        }
        const pdfData = readResult.data;
        (0, fileOperationAnalytics_js_1.logFileOperation)({
            operation: 'read',
            tool: 'FileReadTool',
            filePath: fullFilePath,
            content: pdfData.file.base64,
        });
        return {
            data: pdfData,
            newMessages: [
                (0, messages_js_1.createUserMessage)({
                    content: [
                        {
                            type: 'document',
                            source: {
                                type: 'base64',
                                media_type: 'application/pdf',
                                data: pdfData.file.base64,
                            },
                        },
                    ],
                    isMeta: true,
                }),
            ],
        };
    }
    // --- Text file (single async read via readFileInRange) ---
    const lineOffset = offset === 0 ? 0 : offset - 1;
    const { content, lineCount, totalLines, totalBytes, readBytes, mtimeMs } = await (0, readFileInRange_js_1.readFileInRange)(resolvedFilePath, lineOffset, limit, limit === undefined ? maxSizeBytes : undefined, context.abortController.signal);
    await validateContentTokens(content, ext, maxTokens);
    readFileState.set(fullFilePath, {
        content,
        timestamp: Math.floor(mtimeMs),
        offset,
        limit,
    });
    context.nestedMemoryAttachmentTriggers?.add(fullFilePath);
    // Snapshot before iterating — a listener that unsubscribes mid-callback
    // would splice the live array and skip the next listener.
    for (const listener of fileReadListeners.slice()) {
        listener(resolvedFilePath, content);
    }
    const data = {
        type: 'text',
        file: {
            filePath: file_path,
            content,
            numLines: lineCount,
            startLine: offset,
            totalLines,
        },
    };
    if ((0, memoryFileDetection_js_1.isAutoMemFile)(fullFilePath)) {
        memoryFileMtimes.set(data, mtimeMs);
    }
    (0, fileOperationAnalytics_js_1.logFileOperation)({
        operation: 'read',
        tool: 'FileReadTool',
        filePath: fullFilePath,
        content,
    });
    const sessionFileType = detectSessionFileType(fullFilePath);
    const analyticsExt = (0, metadata_js_1.getFileExtensionForAnalytics)(fullFilePath);
    (0, index_js_1.logEvent)('tengu_session_file_read', {
        totalLines,
        readLines: lineCount,
        totalBytes,
        readBytes,
        offset,
        ...(limit !== undefined && { limit }),
        ...(analyticsExt !== undefined && { ext: analyticsExt }),
        ...(messageId !== undefined && {
            messageID: messageId,
        }),
        is_session_memory: sessionFileType === 'session_memory',
        is_session_transcript: sessionFileType === 'session_transcript',
    });
    return { data };
}
/**
 * Reads an image file and applies token-based compression if needed.
 * Reads the file ONCE, then applies standard resize. If the result exceeds
 * the token limit, applies aggressive compression from the same buffer.
 *
 * @param filePath - Path to the image file
 * @param maxTokens - Maximum token budget for the image
 * @returns Image data with appropriate compression applied
 */
async function readImageWithTokenBudget(filePath, maxTokens = (0, limits_js_1.getDefaultFileReadingLimits)().maxTokens, maxBytes) {
    // Read file ONCE — capped to maxBytes to avoid OOM on huge files
    const imageBuffer = await (0, fsOperations_js_1.getFsImplementation)().readFileBytes(filePath, maxBytes);
    const originalSize = imageBuffer.length;
    if (originalSize === 0) {
        throw new Error(`Image file is empty: ${filePath}`);
    }
    const detectedMediaType = (0, imageResizer_js_1.detectImageFormatFromBuffer)(imageBuffer);
    const detectedFormat = detectedMediaType.split('/')[1] || 'png';
    // Try standard resize
    let result;
    try {
        const resized = await (0, imageResizer_js_1.maybeResizeAndDownsampleImageBuffer)(imageBuffer, originalSize, detectedFormat);
        result = createImageResponse(resized.buffer, resized.mediaType, originalSize, resized.dimensions);
    }
    catch (e) {
        if (e instanceof imageResizer_js_1.ImageResizeError)
            throw e;
        (0, log_js_1.logError)(e);
        result = createImageResponse(imageBuffer, detectedFormat, originalSize);
    }
    // Check if it fits in token budget
    const estimatedTokens = Math.ceil(result.file.base64.length * 0.125);
    if (estimatedTokens > maxTokens) {
        // Aggressive compression from the SAME buffer (no re-read)
        try {
            const compressed = await (0, imageResizer_js_1.compressImageBufferWithTokenLimit)(imageBuffer, maxTokens, detectedMediaType);
            return {
                type: 'image',
                file: {
                    base64: compressed.base64,
                    type: compressed.mediaType,
                    originalSize,
                },
            };
        }
        catch (e) {
            (0, log_js_1.logError)(e);
            // Fallback: heavily compressed version from the SAME buffer
            try {
                const sharpModule = await Promise.resolve().then(() => __importStar(require('sharp')));
                const sharp = sharpModule.default || sharpModule;
                const fallbackBuffer = await sharp(imageBuffer)
                    .resize(400, 400, {
                    fit: 'inside',
                    withoutEnlargement: true,
                })
                    .jpeg({ quality: 20 })
                    .toBuffer();
                return createImageResponse(fallbackBuffer, 'jpeg', originalSize);
            }
            catch (error) {
                (0, log_js_1.logError)(error);
                return createImageResponse(imageBuffer, detectedFormat, originalSize);
            }
        }
    }
    return result;
}
