"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendSessionLog = appendSessionLog;
exports.getSessionLogs = getSessionLogs;
exports.getSessionLogsViaOAuth = getSessionLogsViaOAuth;
exports.getTeleportEvents = getTeleportEvents;
exports.clearSession = clearSession;
exports.clearAllSessions = clearAllSessions;
const axios_1 = __importDefault(require("axios"));
const oauth_js_1 = require("../../constants/oauth.js");
const debug_js_1 = require("../../utils/debug.js");
const diagLogs_js_1 = require("../../utils/diagLogs.js");
const envUtils_js_1 = require("../../utils/envUtils.js");
const log_js_1 = require("../../utils/log.js");
const sequential_js_1 = require("../../utils/sequential.js");
const sessionIngressAuth_js_1 = require("../../utils/sessionIngressAuth.js");
const sleep_js_1 = require("../../utils/sleep.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const api_js_1 = require("../../utils/teleport/api.js");
// Module-level state
const lastUuidMap = new Map();
const MAX_RETRIES = 10;
const BASE_DELAY_MS = 500;
// Per-session sequential wrappers to prevent concurrent log writes
const sequentialAppendBySession = new Map();
/**
 * Gets or creates a sequential wrapper for a session
 * This ensures that log appends for a session are processed one at a time
 */
function getOrCreateSequentialAppend(sessionId) {
    let sequentialAppend = sequentialAppendBySession.get(sessionId);
    if (!sequentialAppend) {
        sequentialAppend = (0, sequential_js_1.sequential)(async (entry, url, headers) => await appendSessionLogImpl(sessionId, entry, url, headers));
        sequentialAppendBySession.set(sessionId, sequentialAppend);
    }
    return sequentialAppend;
}
/**
 * Internal implementation of appendSessionLog with retry logic
 * Retries on transient errors (network, 5xx, 429). On 409, adopts the server's
 * last UUID and retries (handles stale state from killed process's in-flight
 * requests). Fails immediately on 401.
 */
async function appendSessionLogImpl(sessionId, entry, url, headers) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const lastUuid = lastUuidMap.get(sessionId);
            const requestHeaders = { ...headers };
            if (lastUuid) {
                requestHeaders['Last-Uuid'] = lastUuid;
            }
            const response = await axios_1.default.put(url, entry, {
                headers: requestHeaders,
                validateStatus: status => status < 500,
            });
            if (response.status === 200 || response.status === 201) {
                lastUuidMap.set(sessionId, entry.uuid);
                (0, debug_js_1.logForDebugging)(`Successfully persisted session log entry for session ${sessionId}`);
                return true;
            }
            if (response.status === 409) {
                // Check if our entry was actually stored (server returned 409 but entry exists)
                // This handles the scenario where entry was stored but client received an error
                // response, causing lastUuidMap to be stale
                const serverLastUuid = response.headers['x-last-uuid'];
                if (serverLastUuid === entry.uuid) {
                    // Our entry IS the last entry on server - it was stored successfully previously
                    lastUuidMap.set(sessionId, entry.uuid);
                    (0, debug_js_1.logForDebugging)(`Session entry ${entry.uuid} already present on server, recovering from stale state`);
                    (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'session_persist_recovered_from_409');
                    return true;
                }
                // Another writer (e.g. in-flight request from a killed process)
                // advanced the server's chain. Try to adopt the server's last UUID
                // from the response header, or re-fetch the session to discover it.
                if (serverLastUuid) {
                    lastUuidMap.set(sessionId, serverLastUuid);
                    (0, debug_js_1.logForDebugging)(`Session 409: adopting server lastUuid=${serverLastUuid} from header, retrying entry ${entry.uuid}`);
                }
                else {
                    // Server didn't return x-last-uuid (e.g. v1 endpoint). Re-fetch
                    // the session to discover the current head of the append chain.
                    const logs = await fetchSessionLogsFromUrl(sessionId, url, headers);
                    const adoptedUuid = findLastUuid(logs);
                    if (adoptedUuid) {
                        lastUuidMap.set(sessionId, adoptedUuid);
                        (0, debug_js_1.logForDebugging)(`Session 409: re-fetched ${logs.length} entries, adopting lastUuid=${adoptedUuid}, retrying entry ${entry.uuid}`);
                    }
                    else {
                        // Can't determine server state — give up
                        const errorData = response.data;
                        const errorMessage = errorData.error?.message || 'Concurrent modification detected';
                        (0, log_js_1.logError)(new Error(`Session persistence conflict: UUID mismatch for session ${sessionId}, entry ${entry.uuid}. ${errorMessage}`));
                        (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'session_persist_fail_concurrent_modification');
                        return false;
                    }
                }
                (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'session_persist_409_adopt_server_uuid');
                continue; // retry with updated lastUuid
            }
            if (response.status === 401) {
                (0, debug_js_1.logForDebugging)('Session token expired or invalid');
                (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'session_persist_fail_bad_token');
                return false; // Non-retryable
            }
            // Other 4xx (429, etc.) - retryable
            (0, debug_js_1.logForDebugging)(`Failed to persist session log: ${response.status} ${response.statusText}`);
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'session_persist_fail_status', {
                status: response.status,
                attempt,
            });
        }
        catch (error) {
            // Network errors, 5xx - retryable
            const axiosError = error;
            (0, log_js_1.logError)(new Error(`Error persisting session log: ${axiosError.message}`));
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'session_persist_fail_status', {
                status: axiosError.status,
                attempt,
            });
        }
        if (attempt === MAX_RETRIES) {
            (0, debug_js_1.logForDebugging)(`Remote persistence failed after ${MAX_RETRIES} attempts`);
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'session_persist_error_retries_exhausted', { attempt });
            return false;
        }
        const delayMs = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), 8000);
        (0, debug_js_1.logForDebugging)(`Remote persistence attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${delayMs}ms…`);
        await (0, sleep_js_1.sleep)(delayMs);
    }
    return false;
}
/**
 * Append a log entry to the session using JWT token
 * Uses optimistic concurrency control with Last-Uuid header
 * Ensures sequential execution per session to prevent race conditions
 */
async function appendSessionLog(sessionId, entry, url) {
    const sessionToken = (0, sessionIngressAuth_js_1.getSessionIngressAuthToken)();
    if (!sessionToken) {
        (0, debug_js_1.logForDebugging)('No session token available for session persistence');
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'session_persist_fail_jwt_no_token');
        return false;
    }
    const headers = {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
    };
    const sequentialAppend = getOrCreateSequentialAppend(sessionId);
    return sequentialAppend(entry, url, headers);
}
/**
 * Get all session logs for hydration
 */
async function getSessionLogs(sessionId, url) {
    const sessionToken = (0, sessionIngressAuth_js_1.getSessionIngressAuthToken)();
    if (!sessionToken) {
        (0, debug_js_1.logForDebugging)('No session token available for fetching session logs');
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'session_get_fail_no_token');
        return null;
    }
    const headers = { Authorization: `Bearer ${sessionToken}` };
    const logs = await fetchSessionLogsFromUrl(sessionId, url, headers);
    if (logs && logs.length > 0) {
        // Update our lastUuid to the last entry's UUID
        const lastEntry = logs.at(-1);
        if (lastEntry && 'uuid' in lastEntry && lastEntry.uuid) {
            lastUuidMap.set(sessionId, lastEntry.uuid);
        }
    }
    return logs;
}
/**
 * Get all session logs for hydration via OAuth
 * Used for teleporting sessions from the Sessions API
 */
async function getSessionLogsViaOAuth(sessionId, accessToken, orgUUID) {
    const url = `${(0, oauth_js_1.getOauthConfig)().BASE_API_URL}/v1/session_ingress/session/${sessionId}`;
    (0, debug_js_1.logForDebugging)(`[session-ingress] Fetching session logs from: ${url}`);
    const headers = {
        ...(0, api_js_1.getOAuthHeaders)(accessToken),
        'x-organization-uuid': orgUUID,
    };
    const result = await fetchSessionLogsFromUrl(sessionId, url, headers);
    return result;
}
/**
 * Get worker events (transcript) via the CCR v2 Sessions API. Replaces
 * getSessionLogsViaOAuth once session-ingress is retired.
 *
 * The server dispatches per-session: Spanner for v2-native sessions,
 * threadstore for pre-backfill session_* IDs. The cursor is opaque to us —
 * echo it back until next_cursor is unset.
 *
 * Paginated (500/page default, server max 1000). session-ingress's one-shot
 * 50k is gone; we loop.
 */
async function getTeleportEvents(sessionId, accessToken, orgUUID) {
    const baseUrl = `${(0, oauth_js_1.getOauthConfig)().BASE_API_URL}/v1/code/sessions/${sessionId}/teleport-events`;
    const headers = {
        ...(0, api_js_1.getOAuthHeaders)(accessToken),
        'x-organization-uuid': orgUUID,
    };
    (0, debug_js_1.logForDebugging)(`[teleport] Fetching events from: ${baseUrl}`);
    const all = [];
    let cursor;
    let pages = 0;
    // Infinite-loop guard: 1000/page × 100 pages = 100k events. Larger than
    // session-ingress's 50k one-shot. If we hit this, something's wrong
    // (server not advancing cursor) — bail rather than hang.
    const maxPages = 100;
    while (pages < maxPages) {
        const params = { limit: 1000 };
        if (cursor !== undefined) {
            params.cursor = cursor;
        }
        let response;
        try {
            response = await axios_1.default.get(baseUrl, {
                headers,
                params,
                timeout: 20000,
                validateStatus: status => status < 500,
            });
        }
        catch (e) {
            const err = e;
            (0, log_js_1.logError)(new Error(`Teleport events fetch failed: ${err.message}`));
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'teleport_events_fetch_fail');
            return null;
        }
        if (response.status === 404) {
            // 404 on page 0 is ambiguous during the migration window:
            //   (a) Session genuinely not found (not in Spanner AND not in
            //       threadstore) — nothing to fetch.
            //   (b) Route-level 404: endpoint not deployed yet, or session is
            //       a threadstore session not yet backfilled into Spanner.
            // We can't tell them apart from the response alone. Returning null
            // lets the caller fall back to session-ingress, which will correctly
            // return empty for case (a) and data for case (b). Once the backfill
            // is complete and session-ingress is gone, the fallback also returns
            // null → same "Failed to fetch session logs" error as today.
            //
            // 404 mid-pagination (pages > 0) means session was deleted between
            // pages — return what we have.
            (0, debug_js_1.logForDebugging)(`[teleport] Session ${sessionId} not found (page ${pages})`);
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('warn', 'teleport_events_not_found');
            return pages === 0 ? null : all;
        }
        if (response.status === 401) {
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'teleport_events_bad_token');
            throw new Error('Your session has expired. Please run /login to sign in again.');
        }
        if (response.status !== 200) {
            (0, log_js_1.logError)(new Error(`Teleport events returned ${response.status}: ${(0, slowOperations_js_1.jsonStringify)(response.data)}`));
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'teleport_events_bad_status');
            return null;
        }
        const { data, next_cursor } = response.data;
        if (!Array.isArray(data)) {
            (0, log_js_1.logError)(new Error(`Teleport events invalid response shape: ${(0, slowOperations_js_1.jsonStringify)(response.data)}`));
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'teleport_events_invalid_shape');
            return null;
        }
        // payload IS the Entry. null payload happens for threadstore non-generic
        // events (server skips them) or encryption failures — skip here too.
        for (const ev of data) {
            if (ev.payload !== null) {
                all.push(ev.payload);
            }
        }
        pages++;
        // == null covers both `null` and `undefined` — the proto omits the
        // field at end-of-stream, but some serializers emit `null`. Strict
        // `=== undefined` would loop forever on `null` (cursor=null in query
        // params stringifies to "null", which the server rejects or echoes).
        if (next_cursor == null) {
            break;
        }
        cursor = next_cursor;
    }
    if (pages >= maxPages) {
        // Don't fail — return what we have. Better to teleport with a
        // truncated transcript than not at all.
        (0, log_js_1.logError)(new Error(`Teleport events hit page cap (${maxPages}) for ${sessionId}`));
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('warn', 'teleport_events_page_cap');
    }
    (0, debug_js_1.logForDebugging)(`[teleport] Fetched ${all.length} events over ${pages} page(s) for ${sessionId}`);
    return all;
}
/**
 * Shared implementation for fetching session logs from a URL
 */
async function fetchSessionLogsFromUrl(sessionId, url, headers) {
    try {
        const response = await axios_1.default.get(url, {
            headers,
            timeout: 20000,
            validateStatus: status => status < 500,
            params: (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_AFTER_LAST_COMPACT)
                ? { after_last_compact: true }
                : undefined,
        });
        if (response.status === 200) {
            const data = response.data;
            // Validate the response structure
            if (!data || typeof data !== 'object' || !Array.isArray(data.loglines)) {
                (0, log_js_1.logError)(new Error(`Invalid session logs response format: ${(0, slowOperations_js_1.jsonStringify)(data)}`));
                (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'session_get_fail_invalid_response');
                return null;
            }
            const logs = data.loglines;
            (0, debug_js_1.logForDebugging)(`Fetched ${logs.length} session logs for session ${sessionId}`);
            return logs;
        }
        if (response.status === 404) {
            (0, debug_js_1.logForDebugging)(`No existing logs for session ${sessionId}`);
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('warn', 'session_get_no_logs_for_session');
            return [];
        }
        if (response.status === 401) {
            (0, debug_js_1.logForDebugging)('Auth token expired or invalid');
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'session_get_fail_bad_token');
            throw new Error('Your session has expired. Please run /login to sign in again.');
        }
        (0, debug_js_1.logForDebugging)(`Failed to fetch session logs: ${response.status} ${response.statusText}`);
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'session_get_fail_status', {
            status: response.status,
        });
        return null;
    }
    catch (error) {
        const axiosError = error;
        (0, log_js_1.logError)(new Error(`Error fetching session logs: ${axiosError.message}`));
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'session_get_fail_status', {
            status: axiosError.status,
        });
        return null;
    }
}
/**
 * Walk backward through entries to find the last one with a uuid.
 * Some entry types (SummaryMessage, TagMessage) don't have one.
 */
function findLastUuid(logs) {
    if (!logs) {
        return undefined;
    }
    const entry = logs.findLast(e => 'uuid' in e && e.uuid);
    return entry && 'uuid' in entry ? entry.uuid : undefined;
}
/**
 * Clear cached state for a session
 */
function clearSession(sessionId) {
    lastUuidMap.delete(sessionId);
    sequentialAppendBySession.delete(sessionId);
}
/**
 * Clear all cached session state (all sessions).
 * Use this on /clear to free sub-agent session entries.
 */
function clearAllSessions() {
    lastUuidMap.clear();
    sequentialAppendBySession.clear();
}
