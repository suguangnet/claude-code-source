"use strict";
/**
 * Files API client for managing files
 *
 * This module provides functionality to download and upload files to Anthropic Public Files API.
 * Used by the Claude Code agent to download file attachments at session startup.
 *
 * API Reference: https://docs.anthropic.com/en/api/files-content
 */
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadFile = downloadFile;
exports.buildDownloadPath = buildDownloadPath;
exports.downloadAndSaveFile = downloadAndSaveFile;
exports.downloadSessionFiles = downloadSessionFiles;
exports.uploadFile = uploadFile;
exports.uploadSessionFiles = uploadSessionFiles;
exports.listFilesCreatedAfter = listFilesCreatedAfter;
exports.parseFileSpecs = parseFileSpecs;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("crypto");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const array_js_1 = require("../../utils/array.js");
const cwd_js_1 = require("../../utils/cwd.js");
const debug_js_1 = require("../../utils/debug.js");
const errors_js_1 = require("../../utils/errors.js");
const log_js_1 = require("../../utils/log.js");
const sleep_js_1 = require("../../utils/sleep.js");
const index_js_1 = require("../analytics/index.js");
// Files API is currently in beta. oauth-2025-04-20 enables Bearer OAuth
// on public-api routes (auth.py: "oauth_auth" not in beta_versions → 404).
const FILES_API_BETA_HEADER = 'files-api-2025-04-14,oauth-2025-04-20';
const ANTHROPIC_VERSION = '2023-06-01';
// API base URL - uses ANTHROPIC_BASE_URL set by env-manager for the appropriate environment
// Falls back to public API for standalone usage
function getDefaultApiBaseUrl() {
    return (process.env.ANTHROPIC_BASE_URL ||
        process.env.CLAUDE_CODE_API_BASE_URL ||
        'https://api.anthropic.com');
}
function logDebugError(message) {
    (0, debug_js_1.logForDebugging)(`[files-api] ${message}`, { level: 'error' });
}
function logDebug(message) {
    (0, debug_js_1.logForDebugging)(`[files-api] ${message}`);
}
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB
/**
 * Executes an operation with exponential backoff retry logic
 *
 * @param operation - Operation name for logging
 * @param attemptFn - Function to execute on each attempt, returns RetryResult
 * @returns The successful result value
 * @throws Error if all retries exhausted
 */
async function retryWithBackoff(operation, attemptFn) {
    let lastError = '';
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const result = await attemptFn(attempt);
        if (result.done) {
            return result.value;
        }
        lastError = result.error || `${operation} failed`;
        logDebug(`${operation} attempt ${attempt}/${MAX_RETRIES} failed: ${lastError}`);
        if (attempt < MAX_RETRIES) {
            const delayMs = BASE_DELAY_MS * Math.pow(2, attempt - 1);
            logDebug(`Retrying ${operation} in ${delayMs}ms...`);
            await (0, sleep_js_1.sleep)(delayMs);
        }
    }
    throw new Error(`${lastError} after ${MAX_RETRIES} attempts`);
}
/**
 * Downloads a single file from the Anthropic Public Files API
 *
 * @param fileId - The file ID (e.g., "file_011CNha8iCJcU1wXNR6q4V8w")
 * @param config - Files API configuration
 * @returns The file content as a Buffer
 */
async function downloadFile(fileId, config) {
    const baseUrl = config.baseUrl || getDefaultApiBaseUrl();
    const url = `${baseUrl}/v1/files/${fileId}/content`;
    const headers = {
        Authorization: `Bearer ${config.oauthToken}`,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-beta': FILES_API_BETA_HEADER,
    };
    logDebug(`Downloading file ${fileId} from ${url}`);
    return retryWithBackoff(`Download file ${fileId}`, async () => {
        try {
            const response = await axios_1.default.get(url, {
                headers,
                responseType: 'arraybuffer',
                timeout: 60000, // 60 second timeout for large files
                validateStatus: status => status < 500,
            });
            if (response.status === 200) {
                logDebug(`Downloaded file ${fileId} (${response.data.length} bytes)`);
                return { done: true, value: Buffer.from(response.data) };
            }
            // Non-retriable errors - throw immediately
            if (response.status === 404) {
                throw new Error(`File not found: ${fileId}`);
            }
            if (response.status === 401) {
                throw new Error('Authentication failed: invalid or missing API key');
            }
            if (response.status === 403) {
                throw new Error(`Access denied to file: ${fileId}`);
            }
            return { done: false, error: `status ${response.status}` };
        }
        catch (error) {
            if (!axios_1.default.isAxiosError(error)) {
                throw error;
            }
            return { done: false, error: error.message };
        }
    });
}
/**
 * Normalizes a relative path, strips redundant prefixes, and builds the full
 * download path under {basePath}/{session_id}/uploads/.
 * Returns null if the path is invalid (e.g., path traversal).
 */
function buildDownloadPath(basePath, sessionId, relativePath) {
    const normalized = path.normalize(relativePath);
    if (normalized.startsWith('..')) {
        logDebugError(`Invalid file path: ${relativePath}. Path must not traverse above workspace`);
        return null;
    }
    const uploadsBase = path.join(basePath, sessionId, 'uploads');
    const redundantPrefixes = [
        path.join(basePath, sessionId, 'uploads') + path.sep,
        path.sep + 'uploads' + path.sep,
    ];
    const matchedPrefix = redundantPrefixes.find(p => normalized.startsWith(p));
    const cleanPath = matchedPrefix
        ? normalized.slice(matchedPrefix.length)
        : normalized;
    return path.join(uploadsBase, cleanPath);
}
/**
 * Downloads a file and saves it to the session-specific workspace directory
 *
 * @param attachment - The file attachment to download
 * @param config - Files API configuration
 * @returns Download result with success/failure status
 */
async function downloadAndSaveFile(attachment, config) {
    const { fileId, relativePath } = attachment;
    const fullPath = buildDownloadPath((0, cwd_js_1.getCwd)(), config.sessionId, relativePath);
    if (!fullPath) {
        return {
            fileId,
            path: '',
            success: false,
            error: `Invalid file path: ${relativePath}`,
        };
    }
    try {
        // Download the file content
        const content = await downloadFile(fileId, config);
        // Ensure the parent directory exists
        const parentDir = path.dirname(fullPath);
        await fs.mkdir(parentDir, { recursive: true });
        // Write the file
        await fs.writeFile(fullPath, content);
        logDebug(`Saved file ${fileId} to ${fullPath} (${content.length} bytes)`);
        return {
            fileId,
            path: fullPath,
            success: true,
            bytesWritten: content.length,
        };
    }
    catch (error) {
        logDebugError(`Failed to download file ${fileId}: ${(0, errors_js_1.errorMessage)(error)}`);
        if (error instanceof Error) {
            (0, log_js_1.logError)(error);
        }
        return {
            fileId,
            path: fullPath,
            success: false,
            error: (0, errors_js_1.errorMessage)(error),
        };
    }
}
// Default concurrency limit for parallel downloads
const DEFAULT_CONCURRENCY = 5;
/**
 * Execute promises with limited concurrency
 *
 * @param items - Items to process
 * @param fn - Async function to apply to each item
 * @param concurrency - Maximum concurrent operations
 * @returns Results in the same order as input items
 */
async function parallelWithLimit(items, fn, concurrency) {
    const results = new Array(items.length);
    let currentIndex = 0;
    async function worker() {
        while (currentIndex < items.length) {
            const index = currentIndex++;
            const item = items[index];
            if (item !== undefined) {
                results[index] = await fn(item, index);
            }
        }
    }
    // Start workers up to the concurrency limit
    const workers = [];
    const workerCount = Math.min(concurrency, items.length);
    for (let i = 0; i < workerCount; i++) {
        workers.push(worker());
    }
    await Promise.all(workers);
    return results;
}
/**
 * Downloads all file attachments for a session in parallel
 *
 * @param attachments - List of file attachments to download
 * @param config - Files API configuration
 * @param concurrency - Maximum concurrent downloads (default: 5)
 * @returns Array of download results in the same order as input
 */
async function downloadSessionFiles(files, config, concurrency = DEFAULT_CONCURRENCY) {
    if (files.length === 0) {
        return [];
    }
    logDebug(`Downloading ${files.length} file(s) for session ${config.sessionId}`);
    const startTime = Date.now();
    // Download files in parallel with concurrency limit
    const results = await parallelWithLimit(files, file => downloadAndSaveFile(file, config), concurrency);
    const elapsedMs = Date.now() - startTime;
    const successCount = (0, array_js_1.count)(results, r => r.success);
    logDebug(`Downloaded ${successCount}/${files.length} file(s) in ${elapsedMs}ms`);
    return results;
}
/**
 * Upload a single file to the Files API (BYOC mode)
 *
 * Size validation is performed after reading the file to avoid TOCTOU race
 * conditions where the file size could change between initial check and upload.
 *
 * @param filePath - Absolute path to the file to upload
 * @param relativePath - Relative path for the file (used as filename in API)
 * @param config - Files API configuration
 * @returns Upload result with success/failure status
 */
async function uploadFile(filePath, relativePath, config, opts) {
    const baseUrl = config.baseUrl || getDefaultApiBaseUrl();
    const url = `${baseUrl}/v1/files`;
    const headers = {
        Authorization: `Bearer ${config.oauthToken}`,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-beta': FILES_API_BETA_HEADER,
    };
    logDebug(`Uploading file ${filePath} as ${relativePath}`);
    // Read file content first (outside retry loop since it's not a network operation)
    let content;
    try {
        content = await fs.readFile(filePath);
    }
    catch (error) {
        (0, index_js_1.logEvent)('tengu_file_upload_failed', {
            error_type: 'file_read',
        });
        return {
            path: relativePath,
            error: (0, errors_js_1.errorMessage)(error),
            success: false,
        };
    }
    const fileSize = content.length;
    if (fileSize > MAX_FILE_SIZE_BYTES) {
        (0, index_js_1.logEvent)('tengu_file_upload_failed', {
            error_type: 'file_too_large',
        });
        return {
            path: relativePath,
            error: `File exceeds maximum size of ${MAX_FILE_SIZE_BYTES} bytes (actual: ${fileSize})`,
            success: false,
        };
    }
    // Use crypto.randomUUID for boundary to avoid collisions when uploads start same millisecond
    const boundary = `----FormBoundary${(0, crypto_1.randomUUID)()}`;
    const filename = path.basename(relativePath);
    // Build the multipart body
    const bodyParts = [];
    // File part
    bodyParts.push(Buffer.from(`--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`));
    bodyParts.push(content);
    bodyParts.push(Buffer.from('\r\n'));
    // Purpose part
    bodyParts.push(Buffer.from(`--${boundary}\r\n` +
        `Content-Disposition: form-data; name="purpose"\r\n\r\n` +
        `user_data\r\n`));
    // End boundary
    bodyParts.push(Buffer.from(`--${boundary}--\r\n`));
    const body = Buffer.concat(bodyParts);
    try {
        return await retryWithBackoff(`Upload file ${relativePath}`, async () => {
            try {
                const response = await axios_1.default.post(url, body, {
                    headers: {
                        ...headers,
                        'Content-Type': `multipart/form-data; boundary=${boundary}`,
                        'Content-Length': body.length.toString(),
                    },
                    timeout: 120000, // 2 minute timeout for uploads
                    signal: opts?.signal,
                    validateStatus: status => status < 500,
                });
                if (response.status === 200 || response.status === 201) {
                    const fileId = response.data?.id;
                    if (!fileId) {
                        return {
                            done: false,
                            error: 'Upload succeeded but no file ID returned',
                        };
                    }
                    logDebug(`Uploaded file ${filePath} -> ${fileId} (${fileSize} bytes)`);
                    return {
                        done: true,
                        value: {
                            path: relativePath,
                            fileId,
                            size: fileSize,
                            success: true,
                        },
                    };
                }
                // Non-retriable errors - throw to exit retry loop
                if (response.status === 401) {
                    (0, index_js_1.logEvent)('tengu_file_upload_failed', {
                        error_type: 'auth',
                    });
                    throw new UploadNonRetriableError('Authentication failed: invalid or missing API key');
                }
                if (response.status === 403) {
                    (0, index_js_1.logEvent)('tengu_file_upload_failed', {
                        error_type: 'forbidden',
                    });
                    throw new UploadNonRetriableError('Access denied for upload');
                }
                if (response.status === 413) {
                    (0, index_js_1.logEvent)('tengu_file_upload_failed', {
                        error_type: 'size',
                    });
                    throw new UploadNonRetriableError('File too large for upload');
                }
                return { done: false, error: `status ${response.status}` };
            }
            catch (error) {
                // Non-retriable errors propagate up
                if (error instanceof UploadNonRetriableError) {
                    throw error;
                }
                if (axios_1.default.isCancel(error)) {
                    throw new UploadNonRetriableError('Upload canceled');
                }
                // Network errors are retriable
                if (axios_1.default.isAxiosError(error)) {
                    return { done: false, error: error.message };
                }
                throw error;
            }
        });
    }
    catch (error) {
        if (error instanceof UploadNonRetriableError) {
            return {
                path: relativePath,
                error: error.message,
                success: false,
            };
        }
        (0, index_js_1.logEvent)('tengu_file_upload_failed', {
            error_type: 'network',
        });
        return {
            path: relativePath,
            error: (0, errors_js_1.errorMessage)(error),
            success: false,
        };
    }
}
/** Error class for non-retriable upload failures */
class UploadNonRetriableError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UploadNonRetriableError';
    }
}
/**
 * Upload multiple files in parallel with concurrency limit (BYOC mode)
 *
 * @param files - Array of files to upload (path and relativePath)
 * @param config - Files API configuration
 * @param concurrency - Maximum concurrent uploads (default: 5)
 * @returns Array of upload results in the same order as input
 */
async function uploadSessionFiles(files, config, concurrency = DEFAULT_CONCURRENCY) {
    if (files.length === 0) {
        return [];
    }
    logDebug(`Uploading ${files.length} file(s) for session ${config.sessionId}`);
    const startTime = Date.now();
    const results = await parallelWithLimit(files, file => uploadFile(file.path, file.relativePath, config), concurrency);
    const elapsedMs = Date.now() - startTime;
    const successCount = (0, array_js_1.count)(results, r => r.success);
    logDebug(`Uploaded ${successCount}/${files.length} file(s) in ${elapsedMs}ms`);
    return results;
}
/**
 * List files created after a given timestamp (1P/Cloud mode).
 * Uses the public GET /v1/files endpoint with after_created_at query param.
 * Handles pagination via after_id cursor when has_more is true.
 *
 * @param afterCreatedAt - ISO 8601 timestamp to filter files created after
 * @param config - Files API configuration
 * @returns Array of file metadata for files created after the timestamp
 */
async function listFilesCreatedAfter(afterCreatedAt, config) {
    const baseUrl = config.baseUrl || getDefaultApiBaseUrl();
    const headers = {
        Authorization: `Bearer ${config.oauthToken}`,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-beta': FILES_API_BETA_HEADER,
    };
    logDebug(`Listing files created after ${afterCreatedAt}`);
    const allFiles = [];
    let afterId;
    // Paginate through results
    while (true) {
        const params = {
            after_created_at: afterCreatedAt,
        };
        if (afterId) {
            params.after_id = afterId;
        }
        const page = await retryWithBackoff(`List files after ${afterCreatedAt}`, async () => {
            try {
                const response = await axios_1.default.get(`${baseUrl}/v1/files`, {
                    headers,
                    params,
                    timeout: 60000,
                    validateStatus: status => status < 500,
                });
                if (response.status === 200) {
                    return { done: true, value: response.data };
                }
                if (response.status === 401) {
                    (0, index_js_1.logEvent)('tengu_file_list_failed', {
                        error_type: 'auth',
                    });
                    throw new Error('Authentication failed: invalid or missing API key');
                }
                if (response.status === 403) {
                    (0, index_js_1.logEvent)('tengu_file_list_failed', {
                        error_type: 'forbidden',
                    });
                    throw new Error('Access denied to list files');
                }
                return { done: false, error: `status ${response.status}` };
            }
            catch (error) {
                if (!axios_1.default.isAxiosError(error)) {
                    throw error;
                }
                (0, index_js_1.logEvent)('tengu_file_list_failed', {
                    error_type: 'network',
                });
                return { done: false, error: error.message };
            }
        });
        const files = page.data || [];
        for (const f of files) {
            allFiles.push({
                filename: f.filename,
                fileId: f.id,
                size: f.size_bytes,
            });
        }
        if (!page.has_more) {
            break;
        }
        // Use the last file's ID as cursor for next page
        const lastFile = files.at(-1);
        if (!lastFile?.id) {
            break;
        }
        afterId = lastFile.id;
    }
    logDebug(`Listed ${allFiles.length} files created after ${afterCreatedAt}`);
    return allFiles;
}
// ============================================================================
// Parse Functions
// ============================================================================
/**
 * Parse file attachment specs from CLI arguments
 * Format: <file_id>:<relative_path>
 *
 * @param fileSpecs - Array of file spec strings
 * @returns Parsed file attachments
 */
function parseFileSpecs(fileSpecs) {
    const files = [];
    // Sandbox-gateway may pass multiple specs as a single space-separated string
    const expandedSpecs = fileSpecs.flatMap(s => s.split(' ').filter(Boolean));
    for (const spec of expandedSpecs) {
        const colonIndex = spec.indexOf(':');
        if (colonIndex === -1) {
            continue;
        }
        const fileId = spec.substring(0, colonIndex);
        const relativePath = spec.substring(colonIndex + 1);
        if (!fileId || !relativePath) {
            logDebugError(`Invalid file spec: ${spec}. Both file_id and path are required`);
            continue;
        }
        files.push({ fileId, relativePath });
    }
    return files;
}
