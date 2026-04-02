"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageSizeError = void 0;
exports.validateImagesForAPI = validateImagesForAPI;
const apiLimits_js_1 = require("../constants/apiLimits.js");
const index_js_1 = require("../services/analytics/index.js");
const format_js_1 = require("./format.js");
/**
 * Error thrown when one or more images exceed the API size limit.
 */
class ImageSizeError extends Error {
    constructor(oversizedImages, maxSize) {
        let message;
        const firstImage = oversizedImages[0];
        if (oversizedImages.length === 1 && firstImage) {
            message =
                `Image base64 size (${(0, format_js_1.formatFileSize)(firstImage.size)}) exceeds API limit (${(0, format_js_1.formatFileSize)(maxSize)}). ` +
                    `Please resize the image before sending.`;
        }
        else {
            message =
                `${oversizedImages.length} images exceed the API limit (${(0, format_js_1.formatFileSize)(maxSize)}): ` +
                    oversizedImages
                        .map(img => `Image ${img.index}: ${(0, format_js_1.formatFileSize)(img.size)}`)
                        .join(', ') +
                    `. Please resize these images before sending.`;
        }
        super(message);
        this.name = 'ImageSizeError';
    }
}
exports.ImageSizeError = ImageSizeError;
/**
 * Type guard to check if a block is a base64 image block
 */
function isBase64ImageBlock(block) {
    if (typeof block !== 'object' || block === null)
        return false;
    const b = block;
    if (b.type !== 'image')
        return false;
    if (typeof b.source !== 'object' || b.source === null)
        return false;
    const source = b.source;
    return source.type === 'base64' && typeof source.data === 'string';
}
/**
 * Validates that all images in messages are within the API size limit.
 * This is a safety net at the API boundary to catch any oversized images
 * that may have slipped through upstream processing.
 *
 * Note: The API's 5MB limit applies to the base64-encoded string length,
 * not the decoded raw bytes.
 *
 * Works with both UserMessage/AssistantMessage types (which have { type, message })
 * and raw MessageParam types (which have { role, content }).
 *
 * @param messages - Array of messages to validate
 * @throws ImageSizeError if any image exceeds the API limit
 */
function validateImagesForAPI(messages) {
    const oversizedImages = [];
    let imageIndex = 0;
    for (const msg of messages) {
        if (typeof msg !== 'object' || msg === null)
            continue;
        const m = msg;
        // Handle wrapped message format { type: 'user', message: { role, content } }
        // Only check user messages
        if (m.type !== 'user')
            continue;
        const innerMessage = m.message;
        if (!innerMessage)
            continue;
        const content = innerMessage.content;
        if (typeof content === 'string' || !Array.isArray(content))
            continue;
        for (const block of content) {
            if (isBase64ImageBlock(block)) {
                imageIndex++;
                // Check the base64-encoded string length directly (not decoded bytes)
                // The API limit applies to the base64 payload size
                const base64Size = block.source.data.length;
                if (base64Size > apiLimits_js_1.API_IMAGE_MAX_BASE64_SIZE) {
                    (0, index_js_1.logEvent)('tengu_image_api_validation_failed', {
                        base64_size_bytes: base64Size,
                        max_bytes: apiLimits_js_1.API_IMAGE_MAX_BASE64_SIZE,
                    });
                    oversizedImages.push({ index: imageIndex, size: base64Size });
                }
            }
        }
    }
    if (oversizedImages.length > 0) {
        throw new ImageSizeError(oversizedImages, apiLimits_js_1.API_IMAGE_MAX_BASE64_SIZE);
    }
}
