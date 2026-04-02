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
exports.IMAGE_EXTENSION_REGEX = exports.PASTE_THRESHOLD = void 0;
exports.hasImageInClipboard = hasImageInClipboard;
exports.getImageFromClipboard = getImageFromClipboard;
exports.getImagePathFromClipboard = getImagePathFromClipboard;
exports.isImageFilePath = isImageFilePath;
exports.asImageFilePath = asImageFilePath;
exports.tryReadImageFromPath = tryReadImageFromPath;
const bun_bundle_1 = require("bun:bundle");
const crypto_1 = require("crypto");
const execa_1 = require("execa");
const path_1 = require("path");
const apiLimits_js_1 = require("../constants/apiLimits.js");
const growthbook_js_1 = require("../services/analytics/growthbook.js");
const imageProcessor_js_1 = require("../tools/FileReadTool/imageProcessor.js");
const debug_js_1 = require("./debug.js");
const execFileNoThrow_js_1 = require("./execFileNoThrow.js");
const fsOperations_js_1 = require("./fsOperations.js");
const imageResizer_js_1 = require("./imageResizer.js");
const log_js_1 = require("./log.js");
// Threshold in characters for when to consider text a "large paste"
exports.PASTE_THRESHOLD = 800;
function getClipboardCommands() {
    const platform = process.platform;
    // Platform-specific temporary file paths
    // Use CLAUDE_CODE_TMPDIR if set, otherwise fall back to platform defaults
    const baseTmpDir = process.env.CLAUDE_CODE_TMPDIR ||
        (platform === 'win32' ? process.env.TEMP || 'C:\\Temp' : '/tmp');
    const screenshotFilename = 'claude_cli_latest_screenshot.png';
    const tempPaths = {
        darwin: (0, path_1.join)(baseTmpDir, screenshotFilename),
        linux: (0, path_1.join)(baseTmpDir, screenshotFilename),
        win32: (0, path_1.join)(baseTmpDir, screenshotFilename),
    };
    const screenshotPath = tempPaths[platform] || tempPaths.linux;
    // Platform-specific clipboard commands
    const commands = {
        darwin: {
            checkImage: `osascript -e 'the clipboard as «class PNGf»'`,
            saveImage: `osascript -e 'set png_data to (the clipboard as «class PNGf»)' -e 'set fp to open for access POSIX file "${screenshotPath}" with write permission' -e 'write png_data to fp' -e 'close access fp'`,
            getPath: `osascript -e 'get POSIX path of (the clipboard as «class furl»)'`,
            deleteFile: `rm -f "${screenshotPath}"`,
        },
        linux: {
            checkImage: 'xclip -selection clipboard -t TARGETS -o 2>/dev/null | grep -E "image/(png|jpeg|jpg|gif|webp|bmp)" || wl-paste -l 2>/dev/null | grep -E "image/(png|jpeg|jpg|gif|webp|bmp)"',
            saveImage: `xclip -selection clipboard -t image/png -o > "${screenshotPath}" 2>/dev/null || wl-paste --type image/png > "${screenshotPath}" 2>/dev/null || xclip -selection clipboard -t image/bmp -o > "${screenshotPath}" 2>/dev/null || wl-paste --type image/bmp > "${screenshotPath}"`,
            getPath: 'xclip -selection clipboard -t text/plain -o 2>/dev/null || wl-paste 2>/dev/null',
            deleteFile: `rm -f "${screenshotPath}"`,
        },
        win32: {
            checkImage: 'powershell -NoProfile -Command "(Get-Clipboard -Format Image) -ne $null"',
            saveImage: `powershell -NoProfile -Command "$img = Get-Clipboard -Format Image; if ($img) { $img.Save('${screenshotPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png) }"`,
            getPath: 'powershell -NoProfile -Command "Get-Clipboard"',
            deleteFile: `del /f "${screenshotPath}"`,
        },
    };
    return {
        commands: commands[platform] || commands.linux,
        screenshotPath,
    };
}
/**
 * Check if clipboard contains an image without retrieving it.
 */
async function hasImageInClipboard() {
    if (process.platform !== 'darwin') {
        return false;
    }
    if ((0, bun_bundle_1.feature)('NATIVE_CLIPBOARD_IMAGE') &&
        (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_collage_kaleidoscope', true)) {
        // Native NSPasteboard check (~0.03ms warm). Fall through to osascript
        // when the module/export is missing. Catch a throw too: it would surface
        // as an unhandled rejection in useClipboardImageHint's setTimeout.
        try {
            const { getNativeModule } = await Promise.resolve().then(() => __importStar(require('image-processor-napi')));
            const hasImage = getNativeModule()?.hasClipboardImage;
            if (hasImage) {
                return hasImage();
            }
        }
        catch (e) {
            (0, log_js_1.logError)(e);
        }
    }
    const result = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)('osascript', [
        '-e',
        'the clipboard as «class PNGf»',
    ]);
    return result.code === 0;
}
async function getImageFromClipboard() {
    // Fast path: native NSPasteboard reader (macOS only). Reads PNG bytes
    // directly in-process and downsamples via CoreGraphics if over the
    // dimension cap. ~5ms cold, sub-ms warm — vs. ~1.5s for the osascript
    // path below. Throws if the native module is unavailable, in which case
    // the catch block falls through to osascript. A `null` return from the
    // native call is authoritative (clipboard has no image).
    if ((0, bun_bundle_1.feature)('NATIVE_CLIPBOARD_IMAGE') &&
        process.platform === 'darwin' &&
        (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_collage_kaleidoscope', true)) {
        try {
            const { getNativeModule } = await Promise.resolve().then(() => __importStar(require('image-processor-napi')));
            const readClipboard = getNativeModule()?.readClipboardImage;
            if (!readClipboard) {
                throw new Error('native clipboard reader unavailable');
            }
            const native = readClipboard(apiLimits_js_1.IMAGE_MAX_WIDTH, apiLimits_js_1.IMAGE_MAX_HEIGHT);
            if (!native) {
                return null;
            }
            // The native path caps dimensions but not file size. A complex
            // 2000×2000 PNG can still exceed the 3.75MB raw / 5MB base64 API
            // limit — for that edge case, run through the same size-cap that
            // the osascript path uses (degrades to JPEG if needed). Cheap if
            // already under: just a sharp metadata read.
            const buffer = native.png;
            if (buffer.length > apiLimits_js_1.IMAGE_TARGET_RAW_SIZE) {
                const resized = await (0, imageResizer_js_1.maybeResizeAndDownsampleImageBuffer)(buffer, buffer.length, 'png');
                return {
                    base64: resized.buffer.toString('base64'),
                    mediaType: `image/${resized.mediaType}`,
                    // resized.dimensions sees the already-downsampled buffer; native knows the true originals.
                    dimensions: {
                        originalWidth: native.originalWidth,
                        originalHeight: native.originalHeight,
                        displayWidth: resized.dimensions?.displayWidth ?? native.width,
                        displayHeight: resized.dimensions?.displayHeight ?? native.height,
                    },
                };
            }
            return {
                base64: buffer.toString('base64'),
                mediaType: 'image/png',
                dimensions: {
                    originalWidth: native.originalWidth,
                    originalHeight: native.originalHeight,
                    displayWidth: native.width,
                    displayHeight: native.height,
                },
            };
        }
        catch (e) {
            (0, log_js_1.logError)(e);
            // Fall through to osascript fallback.
        }
    }
    const { commands, screenshotPath } = getClipboardCommands();
    try {
        // Check if clipboard has image
        const checkResult = await (0, execa_1.execa)(commands.checkImage, {
            shell: true,
            reject: false,
        });
        if (checkResult.exitCode !== 0) {
            return null;
        }
        // Save the image
        const saveResult = await (0, execa_1.execa)(commands.saveImage, {
            shell: true,
            reject: false,
        });
        if (saveResult.exitCode !== 0) {
            return null;
        }
        // Read the image and convert to base64
        let imageBuffer = (0, fsOperations_js_1.getFsImplementation)().readFileBytesSync(screenshotPath);
        // BMP is not supported by the API — convert to PNG via Sharp.
        // This handles WSL2 where Windows copies images as BMP by default.
        if (imageBuffer.length >= 2 &&
            imageBuffer[0] === 0x42 &&
            imageBuffer[1] === 0x4d) {
            const sharp = await (0, imageProcessor_js_1.getImageProcessor)();
            imageBuffer = await sharp(imageBuffer).png().toBuffer();
        }
        // Resize if needed to stay under 5MB API limit
        const resized = await (0, imageResizer_js_1.maybeResizeAndDownsampleImageBuffer)(imageBuffer, imageBuffer.length, 'png');
        const base64Image = resized.buffer.toString('base64');
        // Detect format from magic bytes
        const mediaType = (0, imageResizer_js_1.detectImageFormatFromBase64)(base64Image);
        // Cleanup (fire-and-forget, don't await)
        void (0, execa_1.execa)(commands.deleteFile, { shell: true, reject: false });
        return {
            base64: base64Image,
            mediaType,
            dimensions: resized.dimensions,
        };
    }
    catch {
        return null;
    }
}
async function getImagePathFromClipboard() {
    const { commands } = getClipboardCommands();
    try {
        // Try to get text from clipboard
        const result = await (0, execa_1.execa)(commands.getPath, {
            shell: true,
            reject: false,
        });
        if (result.exitCode !== 0 || !result.stdout) {
            return null;
        }
        return result.stdout.trim();
    }
    catch (e) {
        (0, log_js_1.logError)(e);
        return null;
    }
}
/**
 * Regex pattern to match supported image file extensions. Kept in sync with
 * MIME_BY_EXT in BriefTool/upload.ts — attachments.ts uses this to set isImage
 * on the wire, and remote viewers fetch /preview iff isImage is true. An ext
 * here but not in MIME_BY_EXT (e.g. bmp) uploads as octet-stream and has no
 * /preview variant → broken thumbnail.
 */
exports.IMAGE_EXTENSION_REGEX = /\.(png|jpe?g|gif|webp)$/i;
/**
 * Remove outer single or double quotes from a string
 * @param text Text to clean
 * @returns Text without outer quotes
 */
function removeOuterQuotes(text) {
    if ((text.startsWith('"') && text.endsWith('"')) ||
        (text.startsWith("'") && text.endsWith("'"))) {
        return text.slice(1, -1);
    }
    return text;
}
/**
 * Remove shell escape backslashes from a path (for macOS/Linux/WSL)
 * On Windows systems, this function returns the path unchanged
 * @param path Path that might contain shell-escaped characters
 * @returns Path with escape backslashes removed (on macOS/Linux/WSL only)
 */
function stripBackslashEscapes(path) {
    const platform = process.platform;
    // On Windows, don't remove backslashes as they're part of the path
    if (platform === 'win32') {
        return path;
    }
    // On macOS/Linux/WSL, handle shell-escaped paths
    // Double-backslashes (\\) represent actual backslashes in the filename
    // Single backslashes followed by special chars are shell escapes
    // First, temporarily replace double backslashes with a placeholder
    // Use random salt to prevent injection attacks where path contains literal placeholder
    const salt = (0, crypto_1.randomBytes)(8).toString('hex');
    const placeholder = `__DOUBLE_BACKSLASH_${salt}__`;
    const withPlaceholder = path.replace(/\\\\/g, placeholder);
    // Remove single backslashes that are shell escapes
    // This handles cases like "name\ \(15\).png" -> "name (15).png"
    const withoutEscapes = withPlaceholder.replace(/\\(.)/g, '$1');
    // Replace placeholders back to single backslashes
    return withoutEscapes.replace(new RegExp(placeholder, 'g'), '\\');
}
/**
 * Check if a given text represents an image file path
 * @param text Text to check
 * @returns Boolean indicating if text is an image path
 */
function isImageFilePath(text) {
    const cleaned = removeOuterQuotes(text.trim());
    const unescaped = stripBackslashEscapes(cleaned);
    return exports.IMAGE_EXTENSION_REGEX.test(unescaped);
}
/**
 * Clean and normalize a text string that might be an image file path
 * @param text Text to process
 * @returns Cleaned text with quotes removed, whitespace trimmed, and shell escapes removed, or null if not an image path
 */
function asImageFilePath(text) {
    const cleaned = removeOuterQuotes(text.trim());
    const unescaped = stripBackslashEscapes(cleaned);
    if (exports.IMAGE_EXTENSION_REGEX.test(unescaped)) {
        return unescaped;
    }
    return null;
}
/**
 * Try to find and read an image file, falling back to clipboard search
 * @param text Pasted text that might be an image filename or path
 * @returns Object containing the image path and base64 data, or null if not found
 */
async function tryReadImageFromPath(text) {
    // Strip terminal added spaces or quotes to dragged in paths
    const cleanedPath = asImageFilePath(text);
    if (!cleanedPath) {
        return null;
    }
    const imagePath = cleanedPath;
    let imageBuffer;
    try {
        if ((0, path_1.isAbsolute)(imagePath)) {
            imageBuffer = (0, fsOperations_js_1.getFsImplementation)().readFileBytesSync(imagePath);
        }
        else {
            // VSCode Terminal just grabs the text content which is the filename
            // instead of getting the full path of the file pasted with cmd-v. So
            // we check if it matches the filename of the image in the clipboard.
            const clipboardPath = await getImagePathFromClipboard();
            if (clipboardPath && imagePath === (0, path_1.basename)(clipboardPath)) {
                imageBuffer = (0, fsOperations_js_1.getFsImplementation)().readFileBytesSync(clipboardPath);
            }
        }
    }
    catch (e) {
        (0, log_js_1.logError)(e);
        return null;
    }
    if (!imageBuffer) {
        return null;
    }
    if (imageBuffer.length === 0) {
        (0, debug_js_1.logForDebugging)(`Image file is empty: ${imagePath}`, { level: 'warn' });
        return null;
    }
    // BMP is not supported by the API — convert to PNG via Sharp.
    if (imageBuffer.length >= 2 &&
        imageBuffer[0] === 0x42 &&
        imageBuffer[1] === 0x4d) {
        const sharp = await (0, imageProcessor_js_1.getImageProcessor)();
        imageBuffer = await sharp(imageBuffer).png().toBuffer();
    }
    // Resize if needed to stay under 5MB API limit
    // Extract extension from path for format hint
    const ext = (0, path_1.extname)(imagePath).slice(1).toLowerCase() || 'png';
    const resized = await (0, imageResizer_js_1.maybeResizeAndDownsampleImageBuffer)(imageBuffer, imageBuffer.length, ext);
    const base64Image = resized.buffer.toString('base64');
    // Detect format from the actual file contents using magic bytes
    const mediaType = (0, imageResizer_js_1.detectImageFormatFromBase64)(base64Image);
    return {
        path: imagePath,
        base64: base64Image,
        mediaType,
        dimensions: resized.dimensions,
    };
}
