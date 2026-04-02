"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFormatDescription = getFormatDescription;
exports.getLargeOutputInstructions = getLargeOutputInstructions;
exports.extensionForMimeType = extensionForMimeType;
exports.isBinaryContentType = isBinaryContentType;
exports.persistBinaryContent = persistBinaryContent;
exports.getBinaryBlobSavedMessage = getBinaryBlobSavedMessage;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const index_js_1 = require("../services/analytics/index.js");
const errors_js_1 = require("./errors.js");
const format_js_1 = require("./format.js");
const log_js_1 = require("./log.js");
const toolResultStorage_js_1 = require("./toolResultStorage.js");
/**
 * Generates a format description string based on the MCP result type and schema.
 */
function getFormatDescription(type, schema) {
    switch (type) {
        case 'toolResult':
            return 'Plain text';
        case 'structuredContent':
            return schema ? `JSON with schema: ${schema}` : 'JSON';
        case 'contentArray':
            return schema ? `JSON array with schema: ${schema}` : 'JSON array';
    }
}
/**
 * Generates instruction text for Claude to read from a saved output file.
 *
 * @param rawOutputPath - Path to the saved output file
 * @param contentLength - Length of the content in characters
 * @param formatDescription - Description of the content format
 * @param maxReadLength - Optional max chars for Read tool (for Bash output context)
 * @returns Instruction text to include in the tool result
 */
function getLargeOutputInstructions(rawOutputPath, contentLength, formatDescription, maxReadLength) {
    const baseInstructions = `Error: result (${contentLength.toLocaleString()} characters) exceeds maximum allowed tokens. Output has been saved to ${rawOutputPath}.\n` +
        `Format: ${formatDescription}\n` +
        `Use offset and limit parameters to read specific portions of the file, search within it for specific content, and jq to make structured queries.\n` +
        `REQUIREMENTS FOR SUMMARIZATION/ANALYSIS/REVIEW:\n` +
        `- You MUST read the content from the file at ${rawOutputPath} in sequential chunks until 100% of the content has been read.\n`;
    const truncationWarning = maxReadLength
        ? `- If you receive truncation warnings when reading the file ("[N lines truncated]"), reduce the chunk size until you have read 100% of the content without truncation ***DO NOT PROCEED UNTIL YOU HAVE DONE THIS***. Bash output is limited to ${maxReadLength.toLocaleString()} chars.\n`
        : `- If you receive truncation warnings when reading the file, reduce the chunk size until you have read 100% of the content without truncation.\n`;
    const completionRequirement = `- Before producing ANY summary or analysis, you MUST explicitly describe what portion of the content you have read. ***If you did not read the entire content, you MUST explicitly state this.***\n`;
    return baseInstructions + truncationWarning + completionRequirement;
}
/**
 * Map a mime type to a file extension. Conservative: known types get their
 * proper extension; unknown types get 'bin'. The extension matters because
 * the Read tool dispatches on it (PDFs, images, etc. need the right ext).
 */
function extensionForMimeType(mimeType) {
    if (!mimeType)
        return 'bin';
    // Strip any charset/boundary parameter
    const mt = (mimeType.split(';')[0] ?? '').trim().toLowerCase();
    switch (mt) {
        case 'application/pdf':
            return 'pdf';
        case 'application/json':
            return 'json';
        case 'text/csv':
            return 'csv';
        case 'text/plain':
            return 'txt';
        case 'text/html':
            return 'html';
        case 'text/markdown':
            return 'md';
        case 'application/zip':
            return 'zip';
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
            return 'docx';
        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
            return 'xlsx';
        case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
            return 'pptx';
        case 'application/msword':
            return 'doc';
        case 'application/vnd.ms-excel':
            return 'xls';
        case 'audio/mpeg':
            return 'mp3';
        case 'audio/wav':
            return 'wav';
        case 'audio/ogg':
            return 'ogg';
        case 'video/mp4':
            return 'mp4';
        case 'video/webm':
            return 'webm';
        case 'image/png':
            return 'png';
        case 'image/jpeg':
            return 'jpg';
        case 'image/gif':
            return 'gif';
        case 'image/webp':
            return 'webp';
        case 'image/svg+xml':
            return 'svg';
        default:
            return 'bin';
    }
}
/**
 * Heuristic for whether a content-type header indicates binary content that
 * should be saved to disk rather than put into the model context.
 * Text-ish types (text/*, json, xml, form data) are treated as non-binary.
 */
function isBinaryContentType(contentType) {
    if (!contentType)
        return false;
    const mt = (contentType.split(';')[0] ?? '').trim().toLowerCase();
    if (mt.startsWith('text/'))
        return false;
    // Structured text formats delivered with an application/ type. Use suffix
    // or exact match rather than substring so 'openxmlformats' (docx/xlsx) stays binary.
    if (mt.endsWith('+json') || mt === 'application/json')
        return false;
    if (mt.endsWith('+xml') || mt === 'application/xml')
        return false;
    if (mt.startsWith('application/javascript'))
        return false;
    if (mt === 'application/x-www-form-urlencoded')
        return false;
    return true;
}
/**
 * Write raw binary bytes to the tool-results directory with a mime-derived
 * extension. Unlike persistToolResult (which stringifies), this writes the
 * bytes as-is so the resulting file can be opened with native tools (Read
 * for PDFs, pandas for xlsx, etc.).
 */
async function persistBinaryContent(bytes, mimeType, persistId) {
    await (0, toolResultStorage_js_1.ensureToolResultsDir)();
    const ext = extensionForMimeType(mimeType);
    const filepath = (0, path_1.join)((0, toolResultStorage_js_1.getToolResultsDir)(), `${persistId}.${ext}`);
    try {
        await (0, promises_1.writeFile)(filepath, bytes);
    }
    catch (error) {
        const err = (0, errors_js_1.toError)(error);
        (0, log_js_1.logError)(err);
        return { error: err.message };
    }
    // mime type and extension are safe fixed-vocabulary strings (not paths/code)
    (0, index_js_1.logEvent)('tengu_binary_content_persisted', {
        mimeType: (mimeType ??
            'unknown'),
        sizeBytes: bytes.length,
        ext: ext,
    });
    return { filepath, size: bytes.length, ext };
}
/**
 * Build a short message telling Claude where binary content was saved.
 * Just states the path — no prescriptive hint, since what the model can
 * actually do with the file depends on provider/tooling.
 */
function getBinaryBlobSavedMessage(filepath, mimeType, size, sourceDescription) {
    const mt = mimeType || 'unknown type';
    return `${sourceDescription}Binary content (${mt}, ${(0, format_js_1.formatFileSize)(size)}) saved to ${filepath}`;
}
