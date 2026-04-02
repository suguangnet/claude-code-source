"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheImagePath = cacheImagePath;
exports.storeImage = storeImage;
exports.storeImages = storeImages;
exports.getStoredImagePath = getStoredImagePath;
exports.clearStoredImagePaths = clearStoredImagePaths;
exports.cleanupOldImageCaches = cleanupOldImageCaches;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const state_js_1 = require("../bootstrap/state.js");
const debug_js_1 = require("./debug.js");
const envUtils_js_1 = require("./envUtils.js");
const fsOperations_js_1 = require("./fsOperations.js");
const IMAGE_STORE_DIR = 'image-cache';
const MAX_STORED_IMAGE_PATHS = 200;
// In-memory cache of stored image paths
const storedImagePaths = new Map();
/**
 * Get the image store directory for the current session.
 */
function getImageStoreDir() {
    return (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), IMAGE_STORE_DIR, (0, state_js_1.getSessionId)());
}
/**
 * Ensure the image store directory exists.
 */
async function ensureImageStoreDir() {
    const dir = getImageStoreDir();
    await (0, promises_1.mkdir)(dir, { recursive: true });
}
/**
 * Get the file path for an image by ID.
 */
function getImagePath(imageId, mediaType) {
    const extension = mediaType.split('/')[1] || 'png';
    return (0, path_1.join)(getImageStoreDir(), `${imageId}.${extension}`);
}
/**
 * Cache the image path immediately (fast, no file I/O).
 */
function cacheImagePath(content) {
    if (content.type !== 'image') {
        return null;
    }
    const imagePath = getImagePath(content.id, content.mediaType || 'image/png');
    evictOldestIfAtCap();
    storedImagePaths.set(content.id, imagePath);
    return imagePath;
}
/**
 * Store an image from pastedContents to disk.
 */
async function storeImage(content) {
    if (content.type !== 'image') {
        return null;
    }
    try {
        await ensureImageStoreDir();
        const imagePath = getImagePath(content.id, content.mediaType || 'image/png');
        const fh = await (0, promises_1.open)(imagePath, 'w', 0o600);
        try {
            await fh.writeFile(content.content, { encoding: 'base64' });
            await fh.datasync();
        }
        finally {
            await fh.close();
        }
        evictOldestIfAtCap();
        storedImagePaths.set(content.id, imagePath);
        (0, debug_js_1.logForDebugging)(`Stored image ${content.id} to ${imagePath}`);
        return imagePath;
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`Failed to store image: ${error}`);
        return null;
    }
}
/**
 * Store all images from pastedContents to disk.
 */
async function storeImages(pastedContents) {
    const pathMap = new Map();
    for (const [id, content] of Object.entries(pastedContents)) {
        if (content.type === 'image') {
            const path = await storeImage(content);
            if (path) {
                pathMap.set(Number(id), path);
            }
        }
    }
    return pathMap;
}
/**
 * Get the file path for a stored image by ID.
 */
function getStoredImagePath(imageId) {
    return storedImagePaths.get(imageId) ?? null;
}
/**
 * Clear the in-memory cache of stored image paths.
 */
function clearStoredImagePaths() {
    storedImagePaths.clear();
}
function evictOldestIfAtCap() {
    while (storedImagePaths.size >= MAX_STORED_IMAGE_PATHS) {
        const oldest = storedImagePaths.keys().next().value;
        if (oldest !== undefined) {
            storedImagePaths.delete(oldest);
        }
        else {
            break;
        }
    }
}
/**
 * Clean up old image cache directories from previous sessions.
 */
async function cleanupOldImageCaches() {
    const fsImpl = (0, fsOperations_js_1.getFsImplementation)();
    const baseDir = (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), IMAGE_STORE_DIR);
    const currentSessionId = (0, state_js_1.getSessionId)();
    try {
        let sessionDirs;
        try {
            sessionDirs = await fsImpl.readdir(baseDir);
        }
        catch {
            return;
        }
        for (const sessionDir of sessionDirs) {
            if (sessionDir.name === currentSessionId) {
                continue;
            }
            const sessionPath = (0, path_1.join)(baseDir, sessionDir.name);
            try {
                await fsImpl.rm(sessionPath, { recursive: true, force: true });
                (0, debug_js_1.logForDebugging)(`Cleaned up old image cache: ${sessionPath}`);
            }
            catch {
                // Ignore errors for individual directories
            }
        }
        try {
            const remaining = await fsImpl.readdir(baseDir);
            if (remaining.length === 0) {
                await fsImpl.rmdir(baseDir);
            }
        }
        catch {
            // Ignore
        }
    }
    catch {
        // Ignore errors reading base directory
    }
}
