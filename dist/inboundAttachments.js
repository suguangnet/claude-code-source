"use strict";
/**
 * Resolve file_uuid attachments on inbound bridge user messages.
 *
 * Web composer uploads via cookie-authed /api/{org}/upload, sends file_uuid
 * alongside the message. Here we fetch each via GET /api/oauth/files/{uuid}/content
 * (oauth-authed, same store), write to ~/.claude/uploads/{sessionId}/, and
 * return @path refs to prepend. Claude's Read tool takes it from there.
 *
 * Best-effort: any failure (no token, network, non-2xx, disk) logs debug and
 * skips that attachment. The message still reaches Claude, just without @path.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractInboundAttachments = extractInboundAttachments;
exports.resolveInboundAttachments = resolveInboundAttachments;
exports.prependPathRefs = prependPathRefs;
exports.resolveAndPrepend = resolveAndPrepend;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("crypto");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const v4_1 = require("zod/v4");
const state_js_1 = require("../bootstrap/state.js");
const debug_js_1 = require("../utils/debug.js");
const envUtils_js_1 = require("../utils/envUtils.js");
const lazySchema_js_1 = require("../utils/lazySchema.js");
const bridgeConfig_js_1 = require("./bridgeConfig.js");
const DOWNLOAD_TIMEOUT_MS = 30000;
function debug(msg) {
    (0, debug_js_1.logForDebugging)(`[bridge:inbound-attach] ${msg}`);
}
const attachmentSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    file_uuid: v4_1.z.string(),
    file_name: v4_1.z.string(),
}));
const attachmentsArraySchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.array(attachmentSchema()));
/** Pull file_attachments off a loosely-typed inbound message. */
function extractInboundAttachments(msg) {
    if (typeof msg !== 'object' || msg === null || !('file_attachments' in msg)) {
        return [];
    }
    const parsed = attachmentsArraySchema().safeParse(msg.file_attachments);
    return parsed.success ? parsed.data : [];
}
/**
 * Strip path components and keep only filename-safe chars. file_name comes
 * from the network (web composer), so treat it as untrusted even though the
 * composer controls it.
 */
function sanitizeFileName(name) {
    const base = (0, path_1.basename)(name).replace(/[^a-zA-Z0-9._-]/g, '_');
    return base || 'attachment';
}
function uploadsDir() {
    return (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), 'uploads', (0, state_js_1.getSessionId)());
}
/**
 * Fetch + write one attachment. Returns the absolute path on success,
 * undefined on any failure.
 */
async function resolveOne(att) {
    const token = (0, bridgeConfig_js_1.getBridgeAccessToken)();
    if (!token) {
        debug('skip: no oauth token');
        return undefined;
    }
    let data;
    try {
        // getOauthConfig() (via getBridgeBaseUrl) throws on a non-allowlisted
        // CLAUDE_CODE_CUSTOM_OAUTH_URL — keep it inside the try so a bad
        // FedStart URL degrades to "no @path" instead of crashing print.ts's
        // reader loop (which has no catch around the await).
        const url = `${(0, bridgeConfig_js_1.getBridgeBaseUrl)()}/api/oauth/files/${encodeURIComponent(att.file_uuid)}/content`;
        const response = await axios_1.default.get(url, {
            headers: { Authorization: `Bearer ${token}` },
            responseType: 'arraybuffer',
            timeout: DOWNLOAD_TIMEOUT_MS,
            validateStatus: () => true,
        });
        if (response.status !== 200) {
            debug(`fetch ${att.file_uuid} failed: status=${response.status}`);
            return undefined;
        }
        data = Buffer.from(response.data);
    }
    catch (e) {
        debug(`fetch ${att.file_uuid} threw: ${e}`);
        return undefined;
    }
    // uuid-prefix makes collisions impossible across messages and within one
    // (same filename, different files). 8 chars is enough — this isn't security.
    const safeName = sanitizeFileName(att.file_name);
    const prefix = (att.file_uuid.slice(0, 8) || (0, crypto_1.randomUUID)().slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, '_');
    const dir = uploadsDir();
    const outPath = (0, path_1.join)(dir, `${prefix}-${safeName}`);
    try {
        await (0, promises_1.mkdir)(dir, { recursive: true });
        await (0, promises_1.writeFile)(outPath, data);
    }
    catch (e) {
        debug(`write ${outPath} failed: ${e}`);
        return undefined;
    }
    debug(`resolved ${att.file_uuid} → ${outPath} (${data.length} bytes)`);
    return outPath;
}
/**
 * Resolve all attachments on an inbound message to a prefix string of
 * @path refs. Empty string if none resolved.
 */
async function resolveInboundAttachments(attachments) {
    if (attachments.length === 0)
        return '';
    debug(`resolving ${attachments.length} attachment(s)`);
    const paths = await Promise.all(attachments.map(resolveOne));
    const ok = paths.filter((p) => p !== undefined);
    if (ok.length === 0)
        return '';
    // Quoted form — extractAtMentionedFiles truncates unquoted @refs at the
    // first space, which breaks any home dir with spaces (/Users/John Smith/).
    return ok.map(p => `@"${p}"`).join(' ') + ' ';
}
/**
 * Prepend @path refs to content, whichever form it's in.
 * Targets the LAST text block — processUserInputBase reads inputString
 * from processedBlocks[processedBlocks.length - 1], so putting refs in
 * block[0] means they're silently ignored for [text, image] content.
 */
function prependPathRefs(content, prefix) {
    if (!prefix)
        return content;
    if (typeof content === 'string')
        return prefix + content;
    const i = content.findLastIndex(b => b.type === 'text');
    if (i !== -1) {
        const b = content[i];
        if (b.type === 'text') {
            return [
                ...content.slice(0, i),
                { ...b, text: prefix + b.text },
                ...content.slice(i + 1),
            ];
        }
    }
    // No text block — append one at the end so it's last.
    return [...content, { type: 'text', text: prefix.trimEnd() }];
}
/**
 * Convenience: extract + resolve + prepend. No-op when the message has no
 * file_attachments field (fast path — no network, returns same reference).
 */
async function resolveAndPrepend(msg, content) {
    const attachments = extractInboundAttachments(msg);
    if (attachments.length === 0)
        return content;
    const prefix = await resolveInboundAttachments(attachments);
    return prependPathRefs(content, prefix);
}
