"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPastedText = hashPastedText;
exports.storePastedText = storePastedText;
exports.retrievePastedText = retrievePastedText;
exports.cleanupOldPastes = cleanupOldPastes;
const crypto_1 = require("crypto");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const debug_js_1 = require("./debug.js");
const envUtils_js_1 = require("./envUtils.js");
const errors_js_1 = require("./errors.js");
const PASTE_STORE_DIR = 'paste-cache';
/**
 * Get the paste store directory (persistent across sessions).
 */
function getPasteStoreDir() {
    return (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), PASTE_STORE_DIR);
}
/**
 * Generate a hash for paste content to use as filename.
 * Exported so callers can get the hash synchronously before async storage.
 */
function hashPastedText(content) {
    return (0, crypto_1.createHash)('sha256').update(content).digest('hex').slice(0, 16);
}
/**
 * Get the file path for a paste by its content hash.
 */
function getPastePath(hash) {
    return (0, path_1.join)(getPasteStoreDir(), `${hash}.txt`);
}
/**
 * Store pasted text content to disk.
 * The hash should be pre-computed with hashPastedText() so the caller
 * can use it immediately without waiting for the async disk write.
 */
async function storePastedText(hash, content) {
    try {
        const dir = getPasteStoreDir();
        await (0, promises_1.mkdir)(dir, { recursive: true });
        const pastePath = getPastePath(hash);
        // Content-addressable: same hash = same content, so overwriting is safe
        await (0, promises_1.writeFile)(pastePath, content, { encoding: 'utf8', mode: 0o600 });
        (0, debug_js_1.logForDebugging)(`Stored paste ${hash} to ${pastePath}`);
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`Failed to store paste: ${error}`);
    }
}
/**
 * Retrieve pasted text content by its hash.
 * Returns null if not found or on error.
 */
async function retrievePastedText(hash) {
    try {
        const pastePath = getPastePath(hash);
        return await (0, promises_1.readFile)(pastePath, { encoding: 'utf8' });
    }
    catch (error) {
        // ENOENT is expected when paste doesn't exist
        if (!(0, errors_js_1.isENOENT)(error)) {
            (0, debug_js_1.logForDebugging)(`Failed to retrieve paste ${hash}: ${error}`);
        }
        return null;
    }
}
/**
 * Clean up old paste files that are no longer referenced.
 * This is a simple time-based cleanup - removes files older than cutoffDate.
 */
async function cleanupOldPastes(cutoffDate) {
    const pasteDir = getPasteStoreDir();
    let files;
    try {
        files = await (0, promises_1.readdir)(pasteDir);
    }
    catch {
        // Directory doesn't exist or can't be read - nothing to clean up
        return;
    }
    const cutoffTime = cutoffDate.getTime();
    for (const file of files) {
        if (!file.endsWith('.txt')) {
            continue;
        }
        const filePath = (0, path_1.join)(pasteDir, file);
        try {
            const stats = await (0, promises_1.stat)(filePath);
            if (stats.mtimeMs < cutoffTime) {
                await (0, promises_1.unlink)(filePath);
                (0, debug_js_1.logForDebugging)(`Cleaned up old paste: ${filePath}`);
            }
        }
        catch {
            // Ignore errors for individual files
        }
    }
}
