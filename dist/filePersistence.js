"use strict";
/**
 * File persistence orchestrator
 *
 * This module provides the main orchestration logic for persisting files
 * at the end of each turn:
 * - BYOC mode: Upload files to Files API and collect file IDs
 * - 1P/Cloud mode: Query Files API listDirectory for file IDs (rclone handles sync)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFilePersistence = runFilePersistence;
exports.executeFilePersistence = executeFilePersistence;
exports.isFilePersistenceEnabled = isFilePersistenceEnabled;
const bun_bundle_1 = require("bun:bundle");
const path_1 = require("path");
const index_js_1 = require("../../services/analytics/index.js");
const filesApi_js_1 = require("../../services/api/filesApi.js");
const cwd_js_1 = require("../cwd.js");
const errors_js_1 = require("../errors.js");
const log_js_1 = require("../log.js");
const sessionIngressAuth_js_1 = require("../sessionIngressAuth.js");
const outputsScanner_js_1 = require("./outputsScanner.js");
const types_js_1 = require("./types.js");
/**
 * Execute file persistence for modified files in the outputs directory.
 *
 * Assembles all config internally:
 * - Checks environment kind (CLAUDE_CODE_ENVIRONMENT_KIND)
 * - Retrieves session access token
 * - Requires CLAUDE_CODE_REMOTE_SESSION_ID for session ID
 *
 * @param turnStartTime - The timestamp when the turn started
 * @param signal - Optional abort signal for cancellation
 * @returns Event data, or null if not enabled or no files to persist
 */
async function runFilePersistence(turnStartTime, signal) {
    const environmentKind = (0, outputsScanner_js_1.getEnvironmentKind)();
    if (environmentKind !== 'byoc') {
        return null;
    }
    const sessionAccessToken = (0, sessionIngressAuth_js_1.getSessionIngressAuthToken)();
    if (!sessionAccessToken) {
        return null;
    }
    const sessionId = process.env.CLAUDE_CODE_REMOTE_SESSION_ID;
    if (!sessionId) {
        (0, log_js_1.logError)(new Error('File persistence enabled but CLAUDE_CODE_REMOTE_SESSION_ID is not set'));
        return null;
    }
    const config = {
        oauthToken: sessionAccessToken,
        sessionId,
    };
    const outputsDir = (0, path_1.join)((0, cwd_js_1.getCwd)(), sessionId, types_js_1.OUTPUTS_SUBDIR);
    // Check if aborted
    if (signal?.aborted) {
        (0, outputsScanner_js_1.logDebug)('Persistence aborted before processing');
        return null;
    }
    const startTime = Date.now();
    (0, index_js_1.logEvent)('tengu_file_persistence_started', {
        mode: environmentKind,
    });
    try {
        let result;
        if (environmentKind === 'byoc') {
            result = await executeBYOCPersistence(turnStartTime, config, outputsDir, signal);
        }
        else {
            result = await executeCloudPersistence();
        }
        // Nothing to report
        if (result.files.length === 0 && result.failed.length === 0) {
            return null;
        }
        const durationMs = Date.now() - startTime;
        (0, index_js_1.logEvent)('tengu_file_persistence_completed', {
            success_count: result.files.length,
            failure_count: result.failed.length,
            duration_ms: durationMs,
            mode: environmentKind,
        });
        return result;
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        (0, outputsScanner_js_1.logDebug)(`File persistence failed: ${error}`);
        const durationMs = Date.now() - startTime;
        (0, index_js_1.logEvent)('tengu_file_persistence_completed', {
            success_count: 0,
            failure_count: 0,
            duration_ms: durationMs,
            mode: environmentKind,
            error: 'exception',
        });
        return {
            files: [],
            failed: [
                {
                    filename: outputsDir,
                    error: (0, errors_js_1.errorMessage)(error),
                },
            ],
        };
    }
}
/**
 * Execute BYOC mode persistence: scan local filesystem for modified files,
 * then upload to Files API.
 */
async function executeBYOCPersistence(turnStartTime, config, outputsDir, signal) {
    // Find modified files via local filesystem scan
    // Uses same directory structure as downloads: {cwd}/{sessionId}/outputs
    const modifiedFiles = await (0, outputsScanner_js_1.findModifiedFiles)(turnStartTime, outputsDir);
    if (modifiedFiles.length === 0) {
        (0, outputsScanner_js_1.logDebug)('No modified files to persist');
        return { files: [], failed: [] };
    }
    (0, outputsScanner_js_1.logDebug)(`Found ${modifiedFiles.length} modified files`);
    if (signal?.aborted) {
        return { files: [], failed: [] };
    }
    // Enforce file count limit
    if (modifiedFiles.length > types_js_1.FILE_COUNT_LIMIT) {
        (0, outputsScanner_js_1.logDebug)(`File count limit exceeded: ${modifiedFiles.length} > ${types_js_1.FILE_COUNT_LIMIT}`);
        (0, index_js_1.logEvent)('tengu_file_persistence_limit_exceeded', {
            file_count: modifiedFiles.length,
            limit: types_js_1.FILE_COUNT_LIMIT,
        });
        return {
            files: [],
            failed: [
                {
                    filename: outputsDir,
                    error: `Too many files modified (${modifiedFiles.length}). Maximum: ${types_js_1.FILE_COUNT_LIMIT}.`,
                },
            ],
        };
    }
    const filesToProcess = modifiedFiles
        .map(filePath => ({
        path: filePath,
        relativePath: (0, path_1.relative)(outputsDir, filePath),
    }))
        .filter(({ relativePath }) => {
        // Security: skip files that resolve outside the outputs directory
        if (relativePath.startsWith('..')) {
            (0, outputsScanner_js_1.logDebug)(`Skipping file outside outputs directory: ${relativePath}`);
            return false;
        }
        return true;
    });
    (0, outputsScanner_js_1.logDebug)(`BYOC mode: uploading ${filesToProcess.length} files`);
    // Upload files in parallel
    const results = await (0, filesApi_js_1.uploadSessionFiles)(filesToProcess, config, types_js_1.DEFAULT_UPLOAD_CONCURRENCY);
    // Separate successful and failed uploads
    const persistedFiles = [];
    const failedFiles = [];
    for (const result of results) {
        if (result.success) {
            persistedFiles.push({
                filename: result.path,
                file_id: result.fileId,
            });
        }
        else {
            failedFiles.push({
                filename: result.path,
                error: result.error,
            });
        }
    }
    (0, outputsScanner_js_1.logDebug)(`BYOC persistence complete: ${persistedFiles.length} uploaded, ${failedFiles.length} failed`);
    return {
        files: persistedFiles,
        failed: failedFiles,
    };
}
/**
 * Execute Cloud (1P) mode persistence.
 * TODO: Read file_id from xattr on output files. xattr-based file IDs are
 * currently being added for 1P environments.
 */
function executeCloudPersistence() {
    (0, outputsScanner_js_1.logDebug)('Cloud mode: xattr-based file ID reading not yet implemented');
    return { files: [], failed: [] };
}
/**
 * Execute file persistence and emit result via callback.
 * Handles errors internally.
 */
async function executeFilePersistence(turnStartTime, signal, onResult) {
    try {
        const result = await runFilePersistence(turnStartTime, signal);
        if (result) {
            onResult(result);
        }
    }
    catch (error) {
        (0, log_js_1.logError)(error);
    }
}
/**
 * Check if file persistence is enabled.
 * Requires: feature flag ON, valid environment kind, session access token,
 * and CLAUDE_CODE_REMOTE_SESSION_ID.
 * This ensures only public-api/sessions users trigger file persistence,
 * not normal Claude Code CLI users.
 */
function isFilePersistenceEnabled() {
    if ((0, bun_bundle_1.feature)('FILE_PERSISTENCE')) {
        return ((0, outputsScanner_js_1.getEnvironmentKind)() === 'byoc' &&
            !!(0, sessionIngressAuth_js_1.getSessionIngressAuthToken)() &&
            !!process.env.CLAUDE_CODE_REMOTE_SESSION_ID);
    }
    return false;
}
