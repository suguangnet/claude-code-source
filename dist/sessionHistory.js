"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HISTORY_PAGE_SIZE = void 0;
exports.createHistoryAuthCtx = createHistoryAuthCtx;
exports.fetchLatestEvents = fetchLatestEvents;
exports.fetchOlderEvents = fetchOlderEvents;
const axios_1 = __importDefault(require("axios"));
const oauth_js_1 = require("../constants/oauth.js");
const debug_js_1 = require("../utils/debug.js");
const api_js_1 = require("../utils/teleport/api.js");
exports.HISTORY_PAGE_SIZE = 100;
/** Prepare auth + headers + base URL once, reuse across pages. */
async function createHistoryAuthCtx(sessionId) {
    const { accessToken, orgUUID } = await (0, api_js_1.prepareApiRequest)();
    return {
        baseUrl: `${(0, oauth_js_1.getOauthConfig)().BASE_API_URL}/v1/sessions/${sessionId}/events`,
        headers: {
            ...(0, api_js_1.getOAuthHeaders)(accessToken),
            'anthropic-beta': 'ccr-byoc-2025-07-29',
            'x-organization-uuid': orgUUID,
        },
    };
}
async function fetchPage(ctx, params, label) {
    const resp = await axios_1.default
        .get(ctx.baseUrl, {
        headers: ctx.headers,
        params,
        timeout: 15000,
        validateStatus: () => true,
    })
        .catch(() => null);
    if (!resp || resp.status !== 200) {
        (0, debug_js_1.logForDebugging)(`[${label}] HTTP ${resp?.status ?? 'error'}`);
        return null;
    }
    return {
        events: Array.isArray(resp.data.data) ? resp.data.data : [],
        firstId: resp.data.first_id,
        hasMore: resp.data.has_more,
    };
}
/**
 * Newest page: last `limit` events, chronological, via anchor_to_latest.
 * has_more=true means older events exist.
 */
async function fetchLatestEvents(ctx, limit = exports.HISTORY_PAGE_SIZE) {
    return fetchPage(ctx, { limit, anchor_to_latest: true }, 'fetchLatestEvents');
}
/** Older page: events immediately before `beforeId` cursor. */
async function fetchOlderEvents(ctx, beforeId, limit = exports.HISTORY_PAGE_SIZE) {
    return fetchPage(ctx, { limit, before_id: beforeId }, 'fetchOlderEvents');
}
