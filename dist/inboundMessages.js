"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractInboundMessageFields = extractInboundMessageFields;
exports.normalizeImageBlocks = normalizeImageBlocks;
const imageResizer_js_1 = require("../utils/imageResizer.js");
/**
 * Process an inbound user message from the bridge, extracting content
 * and UUID for enqueueing. Supports both string content and
 * ContentBlockParam[] (e.g. messages containing images).
 *
 * Normalizes image blocks from bridge clients that may use camelCase
 * `mediaType` instead of snake_case `media_type` (mobile-apps#5825).
 *
 * Returns the extracted fields, or undefined if the message should be
 * skipped (non-user type, missing/empty content).
 */
function extractInboundMessageFields(msg) {
    if (msg.type !== 'user')
        return undefined;
    const content = msg.message?.content;
    if (!content)
        return undefined;
    if (Array.isArray(content) && content.length === 0)
        return undefined;
    const uuid = 'uuid' in msg && typeof msg.uuid === 'string'
        ? msg.uuid
        : undefined;
    return {
        content: Array.isArray(content) ? normalizeImageBlocks(content) : content,
        uuid,
    };
}
/**
 * Normalize image content blocks from bridge clients. iOS/web clients may
 * send `mediaType` (camelCase) instead of `media_type` (snake_case), or
 * omit the field entirely. Without normalization, the bad block poisons
 * the session — every subsequent API call fails with
 * "media_type: Field required".
 *
 * Fast-path scan returns the original array reference when no
 * normalization is needed (zero allocation on the happy path).
 */
function normalizeImageBlocks(blocks) {
    if (!blocks.some(isMalformedBase64Image))
        return blocks;
    return blocks.map(block => {
        if (!isMalformedBase64Image(block))
            return block;
        const src = block.source;
        const mediaType = typeof src.mediaType === 'string' && src.mediaType
            ? src.mediaType
            : (0, imageResizer_js_1.detectImageFormatFromBase64)(block.source.data);
        return {
            ...block,
            source: {
                type: 'base64',
                media_type: mediaType,
                data: block.source.data,
            },
        };
    });
}
function isMalformedBase64Image(block) {
    if (block.type !== 'image' || block.source?.type !== 'base64')
        return false;
    return !block.source.media_type;
}
