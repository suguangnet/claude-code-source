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
exports.isPathSafe = isPathSafe;
exports.validateZipFile = validateZipFile;
exports.unzipFile = unzipFile;
exports.parseZipModes = parseZipModes;
exports.readAndUnzipFile = readAndUnzipFile;
const path_1 = require("path");
const debug_js_1 = require("../debug.js");
const errors_js_1 = require("../errors.js");
const fsOperations_js_1 = require("../fsOperations.js");
const path_js_1 = require("../path.js");
const LIMITS = {
    MAX_FILE_SIZE: 512 * 1024 * 1024, // 512MB per file
    MAX_TOTAL_SIZE: 1024 * 1024 * 1024, // 1024MB total uncompressed
    MAX_FILE_COUNT: 100000, // Maximum number of files
    MAX_COMPRESSION_RATIO: 50, // Anything above 50:1 is suspicious
    MIN_COMPRESSION_RATIO: 0.5, // Below 0.5:1 might indicate already compressed malicious content
};
/**
 * Validates a file path to prevent path traversal attacks
 */
function isPathSafe(filePath) {
    if ((0, path_js_1.containsPathTraversal)(filePath)) {
        return false;
    }
    // Normalize the path to resolve any '.' segments
    const normalized = (0, path_1.normalize)(filePath);
    // Check for absolute paths (we only want relative paths in archives)
    if ((0, path_1.isAbsolute)(normalized)) {
        return false;
    }
    return true;
}
/**
 * Validates a single file during zip extraction
 */
function validateZipFile(file, state) {
    state.fileCount++;
    let error;
    // Check file count
    if (state.fileCount > LIMITS.MAX_FILE_COUNT) {
        error = `Archive contains too many files: ${state.fileCount} (max: ${LIMITS.MAX_FILE_COUNT})`;
    }
    // Validate path safety
    if (!isPathSafe(file.name)) {
        error = `Unsafe file path detected: "${file.name}". Path traversal or absolute paths are not allowed.`;
    }
    // Check individual file size
    const fileSize = file.originalSize || 0;
    if (fileSize > LIMITS.MAX_FILE_SIZE) {
        error = `File "${file.name}" is too large: ${Math.round(fileSize / 1024 / 1024)}MB (max: ${Math.round(LIMITS.MAX_FILE_SIZE / 1024 / 1024)}MB)`;
    }
    // Track total uncompressed size
    state.totalUncompressedSize += fileSize;
    // Check total size
    if (state.totalUncompressedSize > LIMITS.MAX_TOTAL_SIZE) {
        error = `Archive total size is too large: ${Math.round(state.totalUncompressedSize / 1024 / 1024)}MB (max: ${Math.round(LIMITS.MAX_TOTAL_SIZE / 1024 / 1024)}MB)`;
    }
    // Check compression ratio for zip bomb detection
    const currentRatio = state.totalUncompressedSize / state.compressedSize;
    if (currentRatio > LIMITS.MAX_COMPRESSION_RATIO) {
        error = `Suspicious compression ratio detected: ${currentRatio.toFixed(1)}:1 (max: ${LIMITS.MAX_COMPRESSION_RATIO}:1). This may be a zip bomb.`;
    }
    return error ? { isValid: false, error } : { isValid: true };
}
/**
 * Unzips data from a Buffer and returns its contents as a record of file paths to Uint8Array data.
 * Uses unzipSync to avoid fflate worker termination crashes in bun.
 * Accepts raw zip bytes so that the caller can read the file asynchronously.
 *
 * fflate is lazy-imported to avoid its ~196KB of top-level lookup tables (revfd
 * Int32Array(32769), rev Uint16Array(32768), etc.) being allocated at startup
 * when this module is reached via the plugin loader chain.
 */
async function unzipFile(zipData) {
    const { unzipSync } = await Promise.resolve().then(() => __importStar(require('fflate')));
    const compressedSize = zipData.length;
    const state = {
        fileCount: 0,
        totalUncompressedSize: 0,
        compressedSize: compressedSize,
        errors: [],
    };
    const result = unzipSync(new Uint8Array(zipData), {
        filter: file => {
            const validationResult = validateZipFile(file, state);
            if (!validationResult.isValid) {
                throw new Error(validationResult.error);
            }
            return true;
        },
    });
    (0, debug_js_1.logForDebugging)(`Zip extraction completed: ${state.fileCount} files, ${Math.round(state.totalUncompressedSize / 1024)}KB uncompressed`);
    return result;
}
/**
 * Parse Unix file modes from a zip's central directory.
 *
 * fflate's `unzipSync` returns only `Record<string, Uint8Array>` — it does not
 * surface the external file attributes stored in the central directory. This
 * means executable bits are lost during extraction (everything becomes 0644).
 * The git-clone path preserves +x natively, but the GCS/zip path needs this
 * helper to keep parity.
 *
 * Returns `name → mode` for entries created on a Unix host (`versionMadeBy`
 * high byte === 3). Entries from other hosts, or with no mode bits set, are
 * omitted. Callers should treat a missing key as "use default mode".
 *
 * Format per PKZIP APPNOTE.TXT §4.3.12 (central directory) and §4.3.16 (EOCD).
 * ZIP64 is not handled — returns `{}` on archives >4GB or >65535 entries,
 * which is fine for marketplace zips (~3.5MB) and MCPB bundles.
 */
function parseZipModes(data) {
    // Buffer view for readUInt* methods — shares memory, no copy.
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const modes = {};
    // 1. Find the End of Central Directory record (sig 0x06054b50). It lives in
    //    the trailing 22 + 65535 bytes (fixed EOCD size + max comment length).
    //    Scan backwards — the EOCD is typically the last 22 bytes.
    const minEocd = Math.max(0, buf.length - 22 - 0xffff);
    let eocd = -1;
    for (let i = buf.length - 22; i >= minEocd; i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0)
        return modes; // malformed — let fflate's error surface elsewhere
    const entryCount = buf.readUInt16LE(eocd + 10);
    let off = buf.readUInt32LE(eocd + 16); // central directory start offset
    // 2. Walk central directory entries (sig 0x02014b50). Each entry has a
    //    46-byte fixed header followed by variable-length name/extra/comment.
    for (let i = 0; i < entryCount; i++) {
        if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50)
            break;
        const versionMadeBy = buf.readUInt16LE(off + 4);
        const nameLen = buf.readUInt16LE(off + 28);
        const extraLen = buf.readUInt16LE(off + 30);
        const commentLen = buf.readUInt16LE(off + 32);
        const externalAttr = buf.readUInt32LE(off + 38);
        const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
        // versionMadeBy high byte = host OS. 3 = Unix. For Unix zips, the high
        // 16 bits of externalAttr hold st_mode (file type + permission bits).
        if (versionMadeBy >> 8 === 3) {
            const mode = (externalAttr >>> 16) & 0xffff;
            if (mode)
                modes[name] = mode;
        }
        off += 46 + nameLen + extraLen + commentLen;
    }
    return modes;
}
/**
 * Reads a zip file from disk asynchronously and unzips it.
 * Returns its contents as a record of file paths to Uint8Array data.
 */
async function readAndUnzipFile(filePath) {
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    try {
        const zipData = await fs.readFileBytes(filePath);
        // await is required here: without it, rejections from the now-async
        // unzipFile() escape the try/catch and bypass the error wrapping below.
        return await unzipFile(zipData);
    }
    catch (error) {
        if ((0, errors_js_1.isENOENT)(error)) {
            throw error;
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to read or unzip file: ${errorMessage}`);
    }
}
