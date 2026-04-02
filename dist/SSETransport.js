"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SSETransport = void 0;
exports.parseSSEFrames = parseSSEFrames;
const axios_1 = __importDefault(require("axios"));
const debug_js_1 = require("../../utils/debug.js");
const diagLogs_js_1 = require("../../utils/diagLogs.js");
const errors_js_1 = require("../../utils/errors.js");
const sessionIngressAuth_js_1 = require("../../utils/sessionIngressAuth.js");
const sleep_js_1 = require("../../utils/sleep.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const userAgent_js_1 = require("../../utils/userAgent.js");
// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
/** Time budget for reconnection attempts before giving up (10 minutes). */
const RECONNECT_GIVE_UP_MS = 600000;
/** Server sends keepalives every 15s; treat connection as dead after 45s of silence. */
const LIVENESS_TIMEOUT_MS = 45000;
/**
 * HTTP status codes that indicate a permanent server-side rejection.
 * The transport transitions to 'closed' immediately without retrying.
 */
const PERMANENT_HTTP_CODES = new Set([401, 403, 404]);
// POST retry configuration (matches HybridTransport)
const POST_MAX_RETRIES = 10;
const POST_BASE_DELAY_MS = 500;
const POST_MAX_DELAY_MS = 8000;
/** Hoisted TextDecoder options to avoid per-chunk allocation in readStream. */
const STREAM_DECODE_OPTS = { stream: true };
/** Hoisted axios validateStatus callback to avoid per-request closure allocation. */
function alwaysValidStatus() {
    return true;
}
/**
 * Incrementally parse SSE frames from a text buffer.
 * Returns parsed frames and the remaining (incomplete) buffer.
 *
 * @internal exported for testing
 */
function parseSSEFrames(buffer) {
    const frames = [];
    let pos = 0;
    // SSE frames are delimited by double newlines
    let idx;
    while ((idx = buffer.indexOf('\n\n', pos)) !== -1) {
        const rawFrame = buffer.slice(pos, idx);
        pos = idx + 2;
        // Skip empty frames
        if (!rawFrame.trim())
            continue;
        const frame = {};
        let isComment = false;
        for (const line of rawFrame.split('\n')) {
            if (line.startsWith(':')) {
                // SSE comment (e.g., `:keepalive`)
                isComment = true;
                continue;
            }
            const colonIdx = line.indexOf(':');
            if (colonIdx === -1)
                continue;
            const field = line.slice(0, colonIdx);
            // Per SSE spec, strip one leading space after colon if present
            const value = line[colonIdx + 1] === ' '
                ? line.slice(colonIdx + 2)
                : line.slice(colonIdx + 1);
            switch (field) {
                case 'event':
                    frame.event = value;
                    break;
                case 'id':
                    frame.id = value;
                    break;
                case 'data':
                    // Per SSE spec, multiple data: lines are concatenated with \n
                    frame.data = frame.data ? frame.data + '\n' + value : value;
                    break;
                // Ignore other fields (retry:, etc.)
            }
        }
        // Only emit frames that have data (or are pure comments which reset liveness)
        if (frame.data || isComment) {
            frames.push(frame);
        }
    }
    return { frames, remaining: buffer.slice(pos) };
}
// ---------------------------------------------------------------------------
// SSETransport
// ---------------------------------------------------------------------------
/**
 * Transport that uses SSE for reading and HTTP POST for writing.
 *
 * Reads events via Server-Sent Events from the CCR v2 event stream endpoint.
 * Writes events via HTTP POST with retry logic (same pattern as HybridTransport).
 *
 * Each `event: client_event` frame carries a StreamClientEvent proto JSON
 * directly in `data:`. The transport extracts `payload` and passes it to
 * `onData` as newline-delimited JSON for StructuredIO consumers.
 *
 * Supports automatic reconnection with exponential backoff and Last-Event-ID
 * for resumption after disconnection.
 */
class SSETransport {
    // Runtime epoch for CCR v2 event format
    constructor(url, headers = {}, sessionId, refreshHeaders, initialSequenceNum, 
    /**
     * Per-instance auth header source. Omit to read the process-wide
     * CLAUDE_CODE_SESSION_ACCESS_TOKEN (single-session callers). Required
     * for concurrent multi-session callers — the env-var path is a process
     * global and would stomp across sessions.
     */
    getAuthHeaders) {
        this.url = url;
        this.state = 'idle';
        // SSE connection state
        this.abortController = null;
        this.lastSequenceNum = 0;
        this.seenSequenceNums = new Set();
        // Reconnection state
        this.reconnectAttempts = 0;
        this.reconnectStartTime = null;
        this.reconnectTimer = null;
        // Liveness detection
        this.livenessTimer = null;
        /**
         * Bound timeout callback. Hoisted from an inline closure so that
         * resetLivenessTimer (called per-frame) does not allocate a new closure
         * on every SSE frame.
         */
        this.onLivenessTimeout = () => {
            this.livenessTimer = null;
            (0, debug_js_1.logForDebugging)('SSETransport: Liveness timeout, reconnecting', {
                level: 'error',
            });
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'cli_sse_liveness_timeout');
            this.abortController?.abort();
            this.handleConnectionError();
        };
        this.headers = headers;
        this.sessionId = sessionId;
        this.refreshHeaders = refreshHeaders;
        this.getAuthHeaders = getAuthHeaders ?? sessionIngressAuth_js_1.getSessionIngressAuthHeaders;
        this.postUrl = convertSSEUrlToPostUrl(url);
        // Seed with a caller-provided high-water mark so the first connect()
        // sends from_sequence_num / Last-Event-ID. Without this, a fresh
        // SSETransport always asks the server to replay from sequence 0 —
        // the entire session history on every transport swap.
        if (initialSequenceNum !== undefined && initialSequenceNum > 0) {
            this.lastSequenceNum = initialSequenceNum;
        }
        (0, debug_js_1.logForDebugging)(`SSETransport: SSE URL = ${url.href}`);
        (0, debug_js_1.logForDebugging)(`SSETransport: POST URL = ${this.postUrl}`);
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'cli_sse_transport_initialized');
    }
    /**
     * High-water mark of sequence numbers seen on this stream. Callers that
     * recreate the transport (e.g. replBridge onWorkReceived) read this before
     * close() and pass it as `initialSequenceNum` to the next instance so the
     * server resumes from the right point instead of replaying everything.
     */
    getLastSequenceNum() {
        return this.lastSequenceNum;
    }
    async connect() {
        if (this.state !== 'idle' && this.state !== 'reconnecting') {
            (0, debug_js_1.logForDebugging)(`SSETransport: Cannot connect, current state is ${this.state}`, { level: 'error' });
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'cli_sse_connect_failed');
            return;
        }
        this.state = 'reconnecting';
        const connectStartTime = Date.now();
        // Build SSE URL with sequence number for resumption
        const sseUrl = new URL(this.url.href);
        if (this.lastSequenceNum > 0) {
            sseUrl.searchParams.set('from_sequence_num', String(this.lastSequenceNum));
        }
        // Build headers -- use fresh auth headers (supports Cookie for session keys).
        // Remove stale Authorization header from this.headers when Cookie auth is used,
        // since sending both confuses the auth interceptor.
        const authHeaders = this.getAuthHeaders();
        const headers = {
            ...this.headers,
            ...authHeaders,
            Accept: 'text/event-stream',
            'anthropic-version': '2023-06-01',
            'User-Agent': (0, userAgent_js_1.getClaudeCodeUserAgent)(),
        };
        if (authHeaders['Cookie']) {
            delete headers['Authorization'];
        }
        if (this.lastSequenceNum > 0) {
            headers['Last-Event-ID'] = String(this.lastSequenceNum);
        }
        (0, debug_js_1.logForDebugging)(`SSETransport: Opening ${sseUrl.href}`);
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'cli_sse_connect_opening');
        this.abortController = new AbortController();
        try {
            // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
            const response = await fetch(sseUrl.href, {
                headers,
                signal: this.abortController.signal,
            });
            if (!response.ok) {
                const isPermanent = PERMANENT_HTTP_CODES.has(response.status);
                (0, debug_js_1.logForDebugging)(`SSETransport: HTTP ${response.status}${isPermanent ? ' (permanent)' : ''}`, { level: 'error' });
                (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'cli_sse_connect_http_error', {
                    status: response.status,
                });
                if (isPermanent) {
                    this.state = 'closed';
                    this.onCloseCallback?.(response.status);
                    return;
                }
                this.handleConnectionError();
                return;
            }
            if (!response.body) {
                (0, debug_js_1.logForDebugging)('SSETransport: No response body');
                this.handleConnectionError();
                return;
            }
            // Successfully connected
            const connectDuration = Date.now() - connectStartTime;
            (0, debug_js_1.logForDebugging)('SSETransport: Connected');
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'cli_sse_connect_connected', {
                duration_ms: connectDuration,
            });
            this.state = 'connected';
            this.reconnectAttempts = 0;
            this.reconnectStartTime = null;
            this.resetLivenessTimer();
            // Read the SSE stream
            await this.readStream(response.body);
        }
        catch (error) {
            if (this.abortController?.signal.aborted) {
                // Intentional close
                return;
            }
            (0, debug_js_1.logForDebugging)(`SSETransport: Connection error: ${(0, errors_js_1.errorMessage)(error)}`, { level: 'error' });
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'cli_sse_connect_error');
            this.handleConnectionError();
        }
    }
    /**
     * Read and process the SSE stream body.
     */
    // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
    async readStream(body) {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, STREAM_DECODE_OPTS);
                const { frames, remaining } = parseSSEFrames(buffer);
                buffer = remaining;
                for (const frame of frames) {
                    // Any frame (including keepalive comments) proves the connection is alive
                    this.resetLivenessTimer();
                    if (frame.id) {
                        const seqNum = parseInt(frame.id, 10);
                        if (!isNaN(seqNum)) {
                            if (this.seenSequenceNums.has(seqNum)) {
                                (0, debug_js_1.logForDebugging)(`SSETransport: DUPLICATE frame seq=${seqNum} (lastSequenceNum=${this.lastSequenceNum}, seenCount=${this.seenSequenceNums.size})`, { level: 'warn' });
                                (0, diagLogs_js_1.logForDiagnosticsNoPII)('warn', 'cli_sse_duplicate_sequence');
                            }
                            else {
                                this.seenSequenceNums.add(seqNum);
                                // Prevent unbounded growth: once we have many entries, prune
                                // old sequence numbers that are well below the high-water mark.
                                // Only sequence numbers near lastSequenceNum matter for dedup.
                                if (this.seenSequenceNums.size > 1000) {
                                    const threshold = this.lastSequenceNum - 200;
                                    for (const s of this.seenSequenceNums) {
                                        if (s < threshold) {
                                            this.seenSequenceNums.delete(s);
                                        }
                                    }
                                }
                            }
                            if (seqNum > this.lastSequenceNum) {
                                this.lastSequenceNum = seqNum;
                            }
                        }
                    }
                    if (frame.event && frame.data) {
                        this.handleSSEFrame(frame.event, frame.data);
                    }
                    else if (frame.data) {
                        // data: without event: — server is emitting the old envelope format
                        // or a bug. Log so incidents show as a signal instead of silent drops.
                        (0, debug_js_1.logForDebugging)('SSETransport: Frame has data: but no event: field — dropped', { level: 'warn' });
                        (0, diagLogs_js_1.logForDiagnosticsNoPII)('warn', 'cli_sse_frame_missing_event_field');
                    }
                }
            }
        }
        catch (error) {
            if (this.abortController?.signal.aborted)
                return;
            (0, debug_js_1.logForDebugging)(`SSETransport: Stream read error: ${(0, errors_js_1.errorMessage)(error)}`, { level: 'error' });
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'cli_sse_stream_read_error');
        }
        finally {
            reader.releaseLock();
        }
        // Stream ended — reconnect unless we're closing
        if (this.state !== 'closing' && this.state !== 'closed') {
            (0, debug_js_1.logForDebugging)('SSETransport: Stream ended, reconnecting');
            this.handleConnectionError();
        }
    }
    /**
     * Handle a single SSE frame. The event: field names the variant; data:
     * carries the inner proto JSON directly (no envelope).
     *
     * Worker subscribers only receive client_event frames (see notifier.go) —
     * any other event type indicates a server-side change that CC doesn't yet
     * understand. Log a diagnostic so we notice in telemetry.
     */
    handleSSEFrame(eventType, data) {
        if (eventType !== 'client_event') {
            (0, debug_js_1.logForDebugging)(`SSETransport: Unexpected SSE event type '${eventType}' on worker stream`, { level: 'warn' });
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('warn', 'cli_sse_unexpected_event_type', {
                event_type: eventType,
            });
            return;
        }
        let ev;
        try {
            ev = (0, slowOperations_js_1.jsonParse)(data);
        }
        catch (error) {
            (0, debug_js_1.logForDebugging)(`SSETransport: Failed to parse client_event data: ${(0, errors_js_1.errorMessage)(error)}`, { level: 'error' });
            return;
        }
        const payload = ev.payload;
        if (payload && typeof payload === 'object' && 'type' in payload) {
            const sessionLabel = this.sessionId ? ` session=${this.sessionId}` : '';
            (0, debug_js_1.logForDebugging)(`SSETransport: Event seq=${ev.sequence_num} event_id=${ev.event_id} event_type=${ev.event_type} payload_type=${String(payload.type)}${sessionLabel}`);
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'cli_sse_message_received');
            // Pass the unwrapped payload as newline-delimited JSON,
            // matching the format that StructuredIO/WebSocketTransport consumers expect
            this.onData?.((0, slowOperations_js_1.jsonStringify)(payload) + '\n');
        }
        else {
            (0, debug_js_1.logForDebugging)(`SSETransport: Ignoring client_event with no type in payload: event_id=${ev.event_id}`);
        }
        this.onEventCallback?.(ev);
    }
    /**
     * Handle connection errors with exponential backoff and time budget.
     */
    handleConnectionError() {
        this.clearLivenessTimer();
        if (this.state === 'closing' || this.state === 'closed')
            return;
        // Abort any in-flight SSE fetch
        this.abortController?.abort();
        this.abortController = null;
        const now = Date.now();
        if (!this.reconnectStartTime) {
            this.reconnectStartTime = now;
        }
        const elapsed = now - this.reconnectStartTime;
        if (elapsed < RECONNECT_GIVE_UP_MS) {
            // Clear any existing timer
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
            // Refresh headers before reconnecting
            if (this.refreshHeaders) {
                const freshHeaders = this.refreshHeaders();
                Object.assign(this.headers, freshHeaders);
                (0, debug_js_1.logForDebugging)('SSETransport: Refreshed headers for reconnect');
            }
            this.state = 'reconnecting';
            this.reconnectAttempts++;
            const baseDelay = Math.min(RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1), RECONNECT_MAX_DELAY_MS);
            // Add ±25% jitter
            const delay = Math.max(0, baseDelay + baseDelay * 0.25 * (2 * Math.random() - 1));
            (0, debug_js_1.logForDebugging)(`SSETransport: Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts}, ${Math.round(elapsed / 1000)}s elapsed)`);
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'cli_sse_reconnect_attempt', {
                reconnectAttempts: this.reconnectAttempts,
            });
            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                void this.connect();
            }, delay);
        }
        else {
            (0, debug_js_1.logForDebugging)(`SSETransport: Reconnection time budget exhausted after ${Math.round(elapsed / 1000)}s`, { level: 'error' });
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'cli_sse_reconnect_exhausted', {
                reconnectAttempts: this.reconnectAttempts,
                elapsedMs: elapsed,
            });
            this.state = 'closed';
            this.onCloseCallback?.();
        }
    }
    /**
     * Reset the liveness timer. If no SSE frame arrives within the timeout,
     * treat the connection as dead and reconnect.
     */
    resetLivenessTimer() {
        this.clearLivenessTimer();
        this.livenessTimer = setTimeout(this.onLivenessTimeout, LIVENESS_TIMEOUT_MS);
    }
    clearLivenessTimer() {
        if (this.livenessTimer) {
            clearTimeout(this.livenessTimer);
            this.livenessTimer = null;
        }
    }
    // -----------------------------------------------------------------------
    // Write (HTTP POST) — same pattern as HybridTransport
    // -----------------------------------------------------------------------
    async write(message) {
        const authHeaders = this.getAuthHeaders();
        if (Object.keys(authHeaders).length === 0) {
            (0, debug_js_1.logForDebugging)('SSETransport: No session token available for POST');
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('warn', 'cli_sse_post_no_token');
            return;
        }
        const headers = {
            ...authHeaders,
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
            'User-Agent': (0, userAgent_js_1.getClaudeCodeUserAgent)(),
        };
        (0, debug_js_1.logForDebugging)(`SSETransport: POST body keys=${Object.keys(message).join(',')}`);
        for (let attempt = 1; attempt <= POST_MAX_RETRIES; attempt++) {
            try {
                const response = await axios_1.default.post(this.postUrl, message, {
                    headers,
                    validateStatus: alwaysValidStatus,
                });
                if (response.status === 200 || response.status === 201) {
                    (0, debug_js_1.logForDebugging)(`SSETransport: POST success type=${message.type}`);
                    return;
                }
                (0, debug_js_1.logForDebugging)(`SSETransport: POST ${response.status} body=${(0, slowOperations_js_1.jsonStringify)(response.data).slice(0, 200)}`);
                // 4xx errors (except 429) are permanent - don't retry
                if (response.status >= 400 &&
                    response.status < 500 &&
                    response.status !== 429) {
                    (0, debug_js_1.logForDebugging)(`SSETransport: POST returned ${response.status} (client error), not retrying`);
                    (0, diagLogs_js_1.logForDiagnosticsNoPII)('warn', 'cli_sse_post_client_error', {
                        status: response.status,
                    });
                    return;
                }
                // 429 or 5xx - retry
                (0, debug_js_1.logForDebugging)(`SSETransport: POST returned ${response.status}, attempt ${attempt}/${POST_MAX_RETRIES}`);
                (0, diagLogs_js_1.logForDiagnosticsNoPII)('warn', 'cli_sse_post_retryable_error', {
                    status: response.status,
                    attempt,
                });
            }
            catch (error) {
                const axiosError = error;
                (0, debug_js_1.logForDebugging)(`SSETransport: POST error: ${axiosError.message}, attempt ${attempt}/${POST_MAX_RETRIES}`);
                (0, diagLogs_js_1.logForDiagnosticsNoPII)('warn', 'cli_sse_post_network_error', {
                    attempt,
                });
            }
            if (attempt === POST_MAX_RETRIES) {
                (0, debug_js_1.logForDebugging)(`SSETransport: POST failed after ${POST_MAX_RETRIES} attempts, continuing`);
                (0, diagLogs_js_1.logForDiagnosticsNoPII)('warn', 'cli_sse_post_retries_exhausted');
                return;
            }
            const delayMs = Math.min(POST_BASE_DELAY_MS * Math.pow(2, attempt - 1), POST_MAX_DELAY_MS);
            await (0, sleep_js_1.sleep)(delayMs);
        }
    }
    // -----------------------------------------------------------------------
    // Transport interface
    // -----------------------------------------------------------------------
    isConnectedStatus() {
        return this.state === 'connected';
    }
    isClosedStatus() {
        return this.state === 'closed';
    }
    setOnData(callback) {
        this.onData = callback;
    }
    setOnClose(callback) {
        this.onCloseCallback = callback;
    }
    setOnEvent(callback) {
        this.onEventCallback = callback;
    }
    close() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.clearLivenessTimer();
        this.state = 'closing';
        this.abortController?.abort();
        this.abortController = null;
    }
}
exports.SSETransport = SSETransport;
// ---------------------------------------------------------------------------
// URL Conversion
// ---------------------------------------------------------------------------
/**
 * Convert an SSE URL to the HTTP POST endpoint URL.
 * The SSE stream URL and POST URL share the same base; the POST endpoint
 * is at `/events` (without `/stream`).
 *
 * From: https://api.example.com/v2/session_ingress/session/<session_id>/events/stream
 * To:   https://api.example.com/v2/session_ingress/session/<session_id>/events
 */
function convertSSEUrlToPostUrl(sseUrl) {
    let pathname = sseUrl.pathname;
    // Remove /stream suffix to get the POST events endpoint
    if (pathname.endsWith('/stream')) {
        pathname = pathname.slice(0, -'/stream'.length);
    }
    return `${sseUrl.protocol}//${sseUrl.host}${pathname}`;
}
