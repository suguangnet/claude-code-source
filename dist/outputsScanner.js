"use strict";
/**
 * Outputs directory scanner for file persistence
 *
 * This module provides utilities to:
 * - Detect the session type from environment variables
 * - Capture turn start timestamp
 * - Find modified files by comparing file mtimes against turn start time
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.logDebug = logDebug;
exports.getEnvironmentKind = getEnvironmentKind;
exports.findModifiedFiles = findModifiedFiles;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const debug_js_1 = require("../debug.js");
/** Shared debug logger for file persistence modules */
function logDebug(message) {
    (0, debug_js_1.logForDebugging)(`[file-persistence] ${message}`);
}
/**
 * Get the environment kind from CLAUDE_CODE_ENVIRONMENT_KIND.
 * Returns null if not set or not a recognized value.
 */
function getEnvironmentKind() {
    const kind = process.env.CLAUDE_CODE_ENVIRONMENT_KIND;
    if (kind === 'byoc' || kind === 'anthropic_cloud') {
        return kind;
    }
    return null;
}
function hasParentPath(entry) {
    return 'parentPath' in entry && typeof entry.parentPath === 'string';
}
function hasPath(entry) {
    return 'path' in entry && typeof entry.path === 'string';
}
function getEntryParentPath(entry, fallback) {
    if (hasParentPath(entry)) {
        return entry.parentPath;
    }
    if (hasPath(entry)) {
        return entry.path;
    }
    return fallback;
}
/**
 * Find files that have been modified since the turn started.
 * Returns paths of files with mtime >= turnStartTime.
 *
 * Uses recursive directory listing and parallelized stat calls for efficiency.
 *
 * @param turnStartTime - The timestamp when the turn started
 * @param outputsDir - The directory to scan for modified files
 */
async function findModifiedFiles(turnStartTime, outputsDir) {
    // Use recursive flag to get all entries in one call
    let entries;
    try {
        entries = await fs.readdir(outputsDir, {
            withFileTypes: true,
            recursive: true,
        });
    }
    catch {
        // Directory doesn't exist or is not accessible
        return [];
    }
    // Filter to regular files only (skip symlinks for security) and build full paths
    const filePaths = [];
    for (const entry of entries) {
        if (entry.isSymbolicLink()) {
            continue;
        }
        if (entry.isFile()) {
            // entry.parentPath is available in Node 20+, fallback to entry.path for older versions
            const parentPath = getEntryParentPath(entry, outputsDir);
            filePaths.push(path.join(parentPath, entry.name));
        }
    }
    if (filePaths.length === 0) {
        logDebug('No files found in outputs directory');
        return [];
    }
    // Parallelize stat calls for all files
    const statResults = await Promise.all(filePaths.map(async (filePath) => {
        try {
            const stat = await fs.lstat(filePath);
            // Skip if it became a symlink between readdir and stat (race condition)
            if (stat.isSymbolicLink()) {
                return null;
            }
            return { filePath, mtimeMs: stat.mtimeMs };
        }
        catch {
            // File may have been deleted between readdir and stat
            return null;
        }
    }));
    // Filter to files modified since turn start
    const modifiedFiles = [];
    for (const result of statResults) {
        if (result && result.mtimeMs >= turnStartTime) {
            modifiedFiles.push(result.filePath);
        }
    }
    logDebug(`Found ${modifiedFiles.length} modified files since turn start (scanned ${filePaths.length} total)`);
    return modifiedFiles;
}
