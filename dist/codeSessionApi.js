"use strict";
/**
 * Thin HTTP wrappers for the CCR v2 code-session API.
 *
 * Separate file from remoteBridgeCore.ts so the SDK /bridge subpath can
 * export createCodeSession + fetchRemoteCredentials without bundling the
 * heavy CLI tree (analytics, transport, etc.). Callers supply explicit
 * accessToken + baseUrl — no implicit auth or config reads.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCodeSession = createCodeSession;
exports.fetchRemoteCredentials = fetchRemoteCredentials;
const axios_1 = __importDefault(require("axios"));
const debug_js_1 = require("../utils/debug.js");
const errors_js_1 = require("../utils/errors.js");
const slowOperations_js_1 = require("../utils/slowOperations.js");
const debugUtils_js_1 = require("./debugUtils.js");
const ANTHROPIC_VERSION = '2023-06-01';
function oauthHeaders(accessToken) {
    return {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'anthropic-version': ANTHROPIC_VERSION,
    };
}
async function createCodeSession(baseUrl, accessToken, title, timeoutMs, tags) {
    const url = `${baseUrl}/v1/code/sessions`;
    let response;
    try {
        response = await axios_1.default.post(url, 
        // bridge: {} is the positive signal for the oneof runner — omitting it
        // (or sending environment_id: "") now 400s. BridgeRunner is an empty
        // message today; it's a placeholder for future bridge-specific options.
        { title, bridge: {}, ...(tags?.length ? { tags } : {}) }, {
            headers: oauthHeaders(accessToken),
            timeout: timeoutMs,
            validateStatus: s => s < 500,
        });
    }
    catch (err) {
        (0, debug_js_1.logForDebugging)(`[code-session] Session create request failed: ${(0, errors_js_1.errorMessage)(err)}`);
        return null;
    }
    if (response.status !== 200 && response.status !== 201) {
        const detail = (0, debugUtils_js_1.extractErrorDetail)(response.data);
        (0, debug_js_1.logForDebugging)(`[code-session] Session create failed ${response.status}${detail ? `: ${detail}` : ''}`);
        return null;
    }
    const data = response.data;
    if (!data ||
        typeof data !== 'object' ||
        !('session' in data) ||
        !data.session ||
        typeof data.session !== 'object' ||
        !('id' in data.session) ||
        typeof data.session.id !== 'string' ||
        !data.session.id.startsWith('cse_')) {
        (0, debug_js_1.logForDebugging)(`[code-session] No session.id (cse_*) in response: ${(0, slowOperations_js_1.jsonStringify)(data).slice(0, 200)}`);
        return null;
    }
    return data.session.id;
}
async function fetchRemoteCredentials(sessionId, baseUrl, accessToken, timeoutMs, trustedDeviceToken) {
    const url = `${baseUrl}/v1/code/sessions/${sessionId}/bridge`;
    const headers = oauthHeaders(accessToken);
    if (trustedDeviceToken) {
        headers['X-Trusted-Device-Token'] = trustedDeviceToken;
    }
    let response;
    try {
        response = await axios_1.default.post(url, {}, {
            headers,
            timeout: timeoutMs,
            validateStatus: s => s < 500,
        });
    }
    catch (err) {
        (0, debug_js_1.logForDebugging)(`[code-session] /bridge request failed: ${(0, errors_js_1.errorMessage)(err)}`);
        return null;
    }
    if (response.status !== 200) {
        const detail = (0, debugUtils_js_1.extractErrorDetail)(response.data);
        (0, debug_js_1.logForDebugging)(`[code-session] /bridge failed ${response.status}${detail ? `: ${detail}` : ''}`);
        return null;
    }
    const data = response.data;
    if (data === null ||
        typeof data !== 'object' ||
        !('worker_jwt' in data) ||
        typeof data.worker_jwt !== 'string' ||
        !('expires_in' in data) ||
        typeof data.expires_in !== 'number' ||
        !('api_base_url' in data) ||
        typeof data.api_base_url !== 'string' ||
        !('worker_epoch' in data)) {
        (0, debug_js_1.logForDebugging)(`[code-session] /bridge response malformed (need worker_jwt, expires_in, api_base_url, worker_epoch): ${(0, slowOperations_js_1.jsonStringify)(data).slice(0, 200)}`);
        return null;
    }
    // protojson serializes int64 as a string to avoid JS precision loss;
    // Go may also return a number depending on encoder settings.
    const rawEpoch = data.worker_epoch;
    const epoch = typeof rawEpoch === 'string' ? Number(rawEpoch) : rawEpoch;
    if (typeof epoch !== 'number' ||
        !Number.isFinite(epoch) ||
        !Number.isSafeInteger(epoch)) {
        (0, debug_js_1.logForDebugging)(`[code-session] /bridge worker_epoch invalid: ${(0, slowOperations_js_1.jsonStringify)(rawEpoch)}`);
        return null;
    }
    return {
        worker_jwt: data.worker_jwt,
        api_base_url: data.api_base_url,
        expires_in: data.expires_in,
        worker_epoch: epoch,
    };
}
