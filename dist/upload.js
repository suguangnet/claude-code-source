"use strict";
/**
 * Upload BriefTool attachments to private_api so web viewers can preview them.
 *
 * When the repl bridge is active, attachment paths are meaningless to a web
 * viewer (they're on Claude's machine). We upload to /api/oauth/file_upload —
 * the same store MessageComposer/SpaceMessage render from — and stash the
 * returned file_uuid alongside the path. Web resolves file_uuid → preview;
 * desktop/local try path first.
 *
 * Best-effort: any failure (no token, bridge off, network error, 4xx) logs
 * debug and returns undefined. The attachment still carries {path, size,
 * isImage}, so local-terminal and same-machine-desktop render unaffected.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadBriefAttachment = uploadBriefAttachment;
const bun_bundle_1 = require("bun:bundle");
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("crypto");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const v4_1 = require("zod/v4");
const bridgeConfig_js_1 = require("../../bridge/bridgeConfig.js");
const oauth_js_1 = require("../../constants/oauth.js");
const debug_js_1 = require("../../utils/debug.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
// Matches the private_api backend limit
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 30000;
// Backend dispatches on mime: image/* → upload_image_wrapped (writes
// PREVIEW/THUMBNAIL, no ORIGINAL), everything else → upload_generic_file
// (ORIGINAL only, no preview). Only whitelist raster formats the
// transcoder reliably handles — svg/bmp/ico risk a 400, and pdf routes
// to upload_pdf_file_wrapped which also skips ORIGINAL. Dispatch
// viewers use /preview for images and /contents for everything else,
// so images go image/* and the rest go octet-stream.
const MIME_BY_EXT = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
};
function guessMimeType(filename) {
    const ext = (0, path_1.extname)(filename).toLowerCase();
    return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}
function debug(msg) {
    (0, debug_js_1.logForDebugging)(`[brief:upload] ${msg}`);
}
/**
 * Base URL for uploads. Must match the host the token is valid for.
 *
 * Subprocess hosts (cowork) pass ANTHROPIC_BASE_URL alongside
 * CLAUDE_CODE_OAUTH_TOKEN — prefer that since getOauthConfig() only
 * returns staging when USE_STAGING_OAUTH is set, which such hosts don't
 * set. Without this a staging token hits api.anthropic.com → 401 → silent
 * skip → web viewer sees inert cards with no file_uuid.
 */
function getBridgeBaseUrl() {
    return ((0, bridgeConfig_js_1.getBridgeBaseUrlOverride)() ??
        process.env.ANTHROPIC_BASE_URL ??
        (0, oauth_js_1.getOauthConfig)().BASE_API_URL);
}
// /api/oauth/file_upload returns one of ChatMessage{Image,Blob,Document}FileSchema.
// All share file_uuid; that's the only field we need.
const uploadResponseSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({ file_uuid: v4_1.z.string() }));
/**
 * Upload a single attachment. Returns file_uuid on success, undefined otherwise.
 * Every early-return is intentional graceful degradation.
 */
async function uploadBriefAttachment(fullPath, size, ctx) {
    // Positive pattern so bun:bundle eliminates the entire body from
    // non-BRIDGE_MODE builds (negative `if (!feature(...)) return` does not).
    if ((0, bun_bundle_1.feature)('BRIDGE_MODE')) {
        if (!ctx.replBridgeEnabled)
            return undefined;
        if (size > MAX_UPLOAD_BYTES) {
            debug(`skip ${fullPath}: ${size} bytes exceeds ${MAX_UPLOAD_BYTES} limit`);
            return undefined;
        }
        const token = (0, bridgeConfig_js_1.getBridgeAccessToken)();
        if (!token) {
            debug('skip: no oauth token');
            return undefined;
        }
        let content;
        try {
            content = await (0, promises_1.readFile)(fullPath);
        }
        catch (e) {
            debug(`read failed for ${fullPath}: ${e}`);
            return undefined;
        }
        const baseUrl = getBridgeBaseUrl();
        const url = `${baseUrl}/api/oauth/file_upload`;
        const filename = (0, path_1.basename)(fullPath);
        const mimeType = guessMimeType(filename);
        const boundary = `----FormBoundary${(0, crypto_1.randomUUID)()}`;
        // Manual multipart — same pattern as filesApi.ts. The oauth endpoint takes
        // a single "file" part (no "purpose" field like the public Files API).
        const body = Buffer.concat([
            Buffer.from(`--${boundary}\r\n` +
                `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
                `Content-Type: ${mimeType}\r\n\r\n`),
            content,
            Buffer.from(`\r\n--${boundary}--\r\n`),
        ]);
        try {
            const response = await axios_1.default.post(url, body, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': body.length.toString(),
                },
                timeout: UPLOAD_TIMEOUT_MS,
                signal: ctx.signal,
                validateStatus: () => true,
            });
            if (response.status !== 201) {
                debug(`upload failed for ${fullPath}: status=${response.status} body=${(0, slowOperations_js_1.jsonStringify)(response.data).slice(0, 200)}`);
                return undefined;
            }
            const parsed = uploadResponseSchema().safeParse(response.data);
            if (!parsed.success) {
                debug(`unexpected response shape for ${fullPath}: ${parsed.error.message}`);
                return undefined;
            }
            debug(`uploaded ${fullPath} → ${parsed.data.file_uuid} (${size} bytes)`);
            return parsed.data.file_uuid;
        }
        catch (e) {
            debug(`upload threw for ${fullPath}: ${e}`);
            return undefined;
        }
    }
    return undefined;
}
