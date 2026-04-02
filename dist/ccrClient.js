"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CCRClient = exports.CCRInitError = void 0;
exports.createStreamAccumulator = createStreamAccumulator;
exports.accumulateStreamEvents = accumulateStreamEvents;
exports.clearStreamAccumulatorForMessage = clearStreamAccumulatorForMessage;
const crypto_1 = require("crypto");
const jwtUtils_js_1 = require("../../bridge/jwtUtils.js");
const debug_js_1 = require("../../utils/debug.js");
const diagLogs_js_1 = require("../../utils/diagLogs.js");
const errors_js_1 = require("../../utils/errors.js");
const proxy_js_1 = require("../../utils/proxy.js");
const sessionActivity_js_1 = require("../../utils/sessionActivity.js");
const sessionIngressAuth_js_1 = require("../../utils/sessionIngressAuth.js");
const sleep_js_1 = require("../../utils/sleep.js");
const userAgent_js_1 = require("../../utils/userAgent.js");
const SerialBatchEventUploader_js_1 = require("./SerialBatchEventUploader.js");
const WorkerStateUploader_js_1 = require("./WorkerStateUploader.js");
/** Default interval between heartbeat events (20s; server TTL is 60s). */
const DEFAULT_HEARTBEAT_INTERVAL_MS = 20000;
/**
 * stream_event messages accumulate in a delay buffer for up to this many ms
 * before enqueue. Mirrors HybridTransport's batching window. text_delta
 * events for the same content block accumulate into a single full-so-far
 * snapshot per flush — each emitted event is self-contained so a client
 * connecting mid-stream sees complete text, not a fragment.
 */
const STREAM_EVENT_FLUSH_INTERVAL_MS = 100;
/** Hoisted axios validateStatus callback to avoid per-request closure allocation. */
function alwaysValidStatus() {
    return true;
}
/** Thrown by initialize(); carries a typed reason for the diag classifier. */
class CCRInitError extends Error {
    constructor(reason) {
        super(`CCRClient init failed: ${reason}`);
        this.reason = reason;
    }
}
exports.CCRInitError = CCRInitError;
/**
 * Consecutive 401/403 with a VALID-LOOKING token before giving up. An
 * expired JWT short-circuits this (exits immediately — deterministic,
 * retry is futile). This threshold is for the uncertain case: token's
 * exp is in the future but server says 401 (userauth down, KMS hiccup,
 * clock skew). 10 × 20s heartbeat ≈ 200s to ride it out.
 */
const MAX_CONSECUTIVE_AUTH_FAILURES = 10;
function createStreamAccumulator() {
    return { byMessage: new Map(), scopeToMessage: new Map() };
}
function scopeKey(m) {
    return `${m.session_id}:${m.parent_tool_use_id ?? ''}`;
}
/**
 * Accumulate text_delta stream_events into full-so-far snapshots per content
 * block. Each flush emits ONE event per touched block containing the FULL
 * accumulated text from the start of the block — a client connecting
 * mid-stream receives a self-contained snapshot, not a fragment.
 *
 * Non-text-delta events pass through unchanged. message_start records the
 * active message ID for the scope; content_block_delta appends chunks;
 * the snapshot event reuses the first text_delta UUID seen for that block in
 * this flush so server-side idempotency remains stable across retries.
 *
 * Cleanup happens in writeEvent when the complete assistant message arrives
 * (reliable), not here on stop events (abort/error paths skip those).
 */
function accumulateStreamEvents(buffer, state) {
    var _a;
    const out = [];
    // chunks[] → snapshot already in `out` this flush. Keyed by the chunks
    // array reference (stable per {messageId, index}) so subsequent deltas
    // rewrite the same entry instead of emitting one event per delta.
    const touched = new Map();
    for (const msg of buffer) {
        switch (msg.event.type) {
            case 'message_start': {
                const id = msg.event.message.id;
                const prevId = state.scopeToMessage.get(scopeKey(msg));
                if (prevId)
                    state.byMessage.delete(prevId);
                state.scopeToMessage.set(scopeKey(msg), id);
                state.byMessage.set(id, []);
                out.push(msg);
                break;
            }
            case 'content_block_delta': {
                if (msg.event.delta.type !== 'text_delta') {
                    out.push(msg);
                    break;
                }
                const messageId = state.scopeToMessage.get(scopeKey(msg));
                const blocks = messageId ? state.byMessage.get(messageId) : undefined;
                if (!blocks) {
                    // Delta without a preceding message_start (reconnect mid-stream,
                    // or message_start was in a prior buffer that got dropped). Pass
                    // through raw — can't produce a full-so-far snapshot without the
                    // prior chunks anyway.
                    out.push(msg);
                    break;
                }
                const chunks = (blocks[_a = msg.event.index] ?? (blocks[_a] = []));
                chunks.push(msg.event.delta.text);
                const existing = touched.get(chunks);
                if (existing) {
                    existing.event.delta.text = chunks.join('');
                    break;
                }
                const snapshot = {
                    type: 'stream_event',
                    uuid: msg.uuid,
                    session_id: msg.session_id,
                    parent_tool_use_id: msg.parent_tool_use_id,
                    event: {
                        type: 'content_block_delta',
                        index: msg.event.index,
                        delta: { type: 'text_delta', text: chunks.join('') },
                    },
                };
                touched.set(chunks, snapshot);
                out.push(snapshot);
                break;
            }
            default:
                out.push(msg);
        }
    }
    return out;
}
/**
 * Clear accumulator entries for a completed assistant message. Called from
 * writeEvent when the SDKAssistantMessage arrives — the reliable end-of-stream
 * signal that fires even when abort/interrupt/error skip SSE stop events.
 */
function clearStreamAccumulatorForMessage(state, assistant) {
    state.byMessage.delete(assistant.message.id);
    const scope = scopeKey(assistant);
    if (state.scopeToMessage.get(scope) === assistant.message.id) {
        state.scopeToMessage.delete(scope);
    }
}
/**
 * Manages the worker lifecycle protocol with CCR v2:
 * - Epoch management: reads worker_epoch from CLAUDE_CODE_WORKER_EPOCH env var
 * - Runtime state reporting: PUT /sessions/{id}/worker
 * - Heartbeat: POST /sessions/{id}/worker/heartbeat for liveness detection
 *
 * All writes go through this.request().
 */
class CCRClient {
    constructor(transport, sessionUrl, opts) {
        this.workerEpoch = 0;
        this.heartbeatTimer = null;
        this.heartbeatInFlight = false;
        this.closed = false;
        this.consecutiveAuthFailures = 0;
        this.currentState = null;
        this.http = (0, proxy_js_1.createAxiosInstance)({ keepAlive: true });
        // stream_event delay buffer — accumulates content deltas for up to
        // STREAM_EVENT_FLUSH_INTERVAL_MS before enqueueing (reduces POST count
        // and enables text_delta coalescing). Mirrors HybridTransport's pattern.
        this.streamEventBuffer = [];
        this.streamEventTimer = null;
        // Full-so-far text accumulator. Persists across flushes so each emitted
        // text_delta event carries the complete text from the start of the block —
        // mid-stream reconnects see a self-contained snapshot. Keyed by API message
        // ID; cleared in writeEvent when the complete assistant message arrives.
        this.streamTextAccumulator = createStreamAccumulator();
        this.onEpochMismatch =
            opts?.onEpochMismatch ??
                (() => {
                    // eslint-disable-next-line custom-rules/no-process-exit
                    process.exit(1);
                });
        this.heartbeatIntervalMs =
            opts?.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
        this.heartbeatJitterFraction = opts?.heartbeatJitterFraction ?? 0;
        this.getAuthHeaders = opts?.getAuthHeaders ?? sessionIngressAuth_js_1.getSessionIngressAuthHeaders;
        // Session URL: https://host/v1/code/sessions/{id}
        if (sessionUrl.protocol !== 'http:' && sessionUrl.protocol !== 'https:') {
            throw new Error(`CCRClient: Expected http(s) URL, got ${sessionUrl.protocol}`);
        }
        const pathname = sessionUrl.pathname.replace(/\/$/, '');
        this.sessionBaseUrl = `${sessionUrl.protocol}//${sessionUrl.host}${pathname}`;
        // Extract session ID from the URL path (last segment)
        this.sessionId = pathname.split('/').pop() || '';
        this.workerState = new WorkerStateUploader_js_1.WorkerStateUploader({
            send: body => this.request('put', '/worker', { worker_epoch: this.workerEpoch, ...body }, 'PUT worker').then(r => r.ok),
            baseDelayMs: 500,
            maxDelayMs: 30000,
            jitterMs: 500,
        });
        this.eventUploader = new SerialBatchEventUploader_js_1.SerialBatchEventUploader({
            maxBatchSize: 100,
            maxBatchBytes: 10 * 1024 * 1024,
            // flushStreamEventBuffer() enqueues a full 100ms window of accumulated
            // stream_events in one call. A burst of mixed delta types that don't
            // fold into a single snapshot could exceed the old cap (50) and deadlock
            // on the SerialBatchEventUploader backpressure check. Match
            // HybridTransport's bound — high enough to be memory-only.
            maxQueueSize: 100000,
            send: async (batch) => {
                const result = await this.request('post', '/worker/events', { worker_epoch: this.workerEpoch, events: batch }, 'client events');
                if (!result.ok) {
                    throw new SerialBatchEventUploader_js_1.RetryableError('client event POST failed', result.retryAfterMs);
                }
            },
            baseDelayMs: 500,
            maxDelayMs: 30000,
            jitterMs: 500,
        });
        this.internalEventUploader = new SerialBatchEventUploader_js_1.SerialBatchEventUploader({
            maxBatchSize: 100,
            maxBatchBytes: 10 * 1024 * 1024,
            maxQueueSize: 200,
            send: async (batch) => {
                const result = await this.request('post', '/worker/internal-events', { worker_epoch: this.workerEpoch, events: batch }, 'internal events');
                if (!result.ok) {
                    throw new SerialBatchEventUploader_js_1.RetryableError('internal event POST failed', result.retryAfterMs);
                }
            },
            baseDelayMs: 500,
            maxDelayMs: 30000,
            jitterMs: 500,
        });
        this.deliveryUploader = new SerialBatchEventUploader_js_1.SerialBatchEventUploader({
            maxBatchSize: 64,
            maxQueueSize: 64,
            send: async (batch) => {
                const result = await this.request('post', '/worker/events/delivery', {
                    worker_epoch: this.workerEpoch,
                    updates: batch.map(d => ({
                        event_id: d.eventId,
                        status: d.status,
                    })),
                }, 'delivery batch');
                if (!result.ok) {
                    throw new SerialBatchEventUploader_js_1.RetryableError('delivery POST failed', result.retryAfterMs);
                }
            },
            baseDelayMs: 500,
            maxDelayMs: 30000,
            jitterMs: 500,
        });
        // Ack each received client_event so CCR can track delivery status.
        // Wired here (not in initialize()) so the callback is registered the
        // moment new CCRClient() returns — remoteIO must be free to call
        // transport.connect() immediately after without racing the first
        // SSE catch-up frame against an unwired onEventCallback.
        transport.setOnEvent((event) => {
            this.reportDelivery(event.event_id, 'received');
        });
    }
    /**
     * Initialize the session worker:
     * 1. Take worker_epoch from the argument, or fall back to
     *    CLAUDE_CODE_WORKER_EPOCH (set by env-manager / bridge spawner)
     * 2. Report state as 'idle'
     * 3. Start heartbeat timer
     *
     * In-process callers (replBridge) pass the epoch directly — they
     * registered the worker themselves and there is no parent process
     * setting env vars.
     */
    async initialize(epoch) {
        const startMs = Date.now();
        if (Object.keys(this.getAuthHeaders()).length === 0) {
            throw new CCRInitError('no_auth_headers');
        }
        if (epoch === undefined) {
            const rawEpoch = process.env.CLAUDE_CODE_WORKER_EPOCH;
            epoch = rawEpoch ? parseInt(rawEpoch, 10) : NaN;
        }
        if (isNaN(epoch)) {
            throw new CCRInitError('missing_epoch');
        }
        this.workerEpoch = epoch;
        // Concurrent with the init PUT — neither depends on the other.
        const restoredPromise = this.getWorkerState();
        const result = await this.request('put', '/worker', {
            worker_status: 'idle',
            worker_epoch: this.workerEpoch,
            // Clear stale pending_action/task_summary left by a prior
            // worker crash — the in-session clears don't survive process restart.
            external_metadata: {
                pending_action: null,
                task_summary: null,
            },
        }, 'PUT worker (init)');
        if (!result.ok) {
            // 409 → onEpochMismatch may throw, but request() catches it and returns
            // false. Without this check we'd continue to startHeartbeat(), leaking a
            // 20s timer against a dead epoch. Throw so connect()'s rejection handler
            // fires instead of the success path.
            throw new CCRInitError('worker_register_failed');
        }
        this.currentState = 'idle';
        this.startHeartbeat();
        // sessionActivity's refcount-gated timer fires while an API call or tool
        // is in-flight; without a write the container lease can expire mid-wait.
        // v1 wires this in WebSocketTransport per-connection.
        (0, sessionActivity_js_1.registerSessionActivityCallback)(() => {
            void this.writeEvent({ type: 'keep_alive' });
        });
        (0, debug_js_1.logForDebugging)(`CCRClient: initialized, epoch=${this.workerEpoch}`);
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'cli_worker_lifecycle_initialized', {
            epoch: this.workerEpoch,
            duration_ms: Date.now() - startMs,
        });
        // Await the concurrent GET and log state_restored here, after the PUT
        // has succeeded — logging inside getWorkerState() raced: if the GET
        // resolved before the PUT failed, diagnostics showed both init_failed
        // and state_restored for the same session.
        const { metadata, durationMs } = await restoredPromise;
        if (!this.closed) {
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'cli_worker_state_restored', {
                duration_ms: durationMs,
                had_state: metadata !== null,
            });
        }
        return metadata;
    }
    // Control_requests are marked processed and not re-delivered on
    // restart, so read back what the prior worker wrote.
    async getWorkerState() {
        const startMs = Date.now();
        const authHeaders = this.getAuthHeaders();
        if (Object.keys(authHeaders).length === 0) {
            return { metadata: null, durationMs: 0 };
        }
        const data = await this.getWithRetry(`${this.sessionBaseUrl}/worker`, authHeaders, 'worker_state');
        return {
            metadata: data?.worker?.external_metadata ?? null,
            durationMs: Date.now() - startMs,
        };
    }
    /**
     * Send an authenticated HTTP request to CCR. Handles auth headers,
     * 409 epoch mismatch, and error logging. Returns { ok: true } on 2xx.
     * On 429, reads Retry-After (integer seconds) so the uploader can honor
     * the server's backoff hint instead of blindly exponentiating.
     */
    async request(method, path, body, label, { timeout = 10000 } = {}) {
        const authHeaders = this.getAuthHeaders();
        if (Object.keys(authHeaders).length === 0)
            return { ok: false };
        try {
            const response = await this.http[method](`${this.sessionBaseUrl}${path}`, body, {
                headers: {
                    ...authHeaders,
                    'Content-Type': 'application/json',
                    'anthropic-version': '2023-06-01',
                    'User-Agent': (0, userAgent_js_1.getClaudeCodeUserAgent)(),
                },
                validateStatus: alwaysValidStatus,
                timeout,
            });
            if (response.status >= 200 && response.status < 300) {
                this.consecutiveAuthFailures = 0;
                return { ok: true };
            }
            if (response.status === 409) {
                this.handleEpochMismatch();
            }
            if (response.status === 401 || response.status === 403) {
                // A 401 with an expired JWT is deterministic — no retry will
                // ever succeed. Check the token's own exp before burning
                // wall-clock on the threshold loop.
                const tok = (0, sessionIngressAuth_js_1.getSessionIngressAuthToken)();
                const exp = tok ? (0, jwtUtils_js_1.decodeJwtExpiry)(tok) : null;
                if (exp !== null && exp * 1000 < Date.now()) {
                    (0, debug_js_1.logForDebugging)(`CCRClient: session_token expired (exp=${new Date(exp * 1000).toISOString()}) — no refresh was delivered, exiting`, { level: 'error' });
                    (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'cli_worker_token_expired_no_refresh');
                    this.onEpochMismatch();
                }
                // Token looks valid but server says 401 — possible server-side
                // blip (userauth down, KMS hiccup). Count toward threshold.
                this.consecutiveAuthFailures++;
                if (this.consecutiveAuthFailures >= MAX_CONSECUTIVE_AUTH_FAILURES) {
                    (0, debug_js_1.logForDebugging)(`CCRClient: ${this.consecutiveAuthFailures} consecutive auth failures with a valid-looking token — server-side auth unrecoverable, exiting`, { level: 'error' });
                    (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'cli_worker_auth_failures_exhausted');
                    this.onEpochMismatch();
                }
            }
            (0, debug_js_1.logForDebugging)(`CCRClient: ${label} returned ${response.status}`, {
                level: 'warn',
            });
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('warn', 'cli_worker_request_failed', {
                method,
                path,
                status: response.status,
            });
            if (response.status === 429) {
                const raw = response.headers?.['retry-after'];
                const seconds = typeof raw === 'string' ? parseInt(raw, 10) : NaN;
                if (!isNaN(seconds) && seconds >= 0) {
                    return { ok: false, retryAfterMs: seconds * 1000 };
                }
            }
            return { ok: false };
        }
        catch (error) {
            (0, debug_js_1.logForDebugging)(`CCRClient: ${label} failed: ${(0, errors_js_1.errorMessage)(error)}`, {
                level: 'warn',
            });
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('warn', 'cli_worker_request_error', {
                method,
                path,
                error_code: (0, errors_js_1.getErrnoCode)(error),
            });
            return { ok: false };
        }
    }
    /** Report worker state to CCR via PUT /sessions/{id}/worker. */
    reportState(state, details) {
        if (state === this.currentState && !details)
            return;
        this.currentState = state;
        this.workerState.enqueue({
            worker_status: state,
            requires_action_details: details
                ? {
                    tool_name: details.tool_name,
                    action_description: details.action_description,
                    request_id: details.request_id,
                }
                : null,
        });
    }
    /** Report external metadata to CCR via PUT /worker. */
    reportMetadata(metadata) {
        this.workerState.enqueue({ external_metadata: metadata });
    }
    /**
     * Handle epoch mismatch (409 Conflict). A newer CC instance has replaced
     * this one — exit immediately.
     */
    handleEpochMismatch() {
        (0, debug_js_1.logForDebugging)('CCRClient: Epoch mismatch (409), shutting down', {
            level: 'error',
        });
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'cli_worker_epoch_mismatch');
        this.onEpochMismatch();
    }
    /** Start periodic heartbeat. */
    startHeartbeat() {
        this.stopHeartbeat();
        const schedule = () => {
            const jitter = this.heartbeatIntervalMs *
                this.heartbeatJitterFraction *
                (2 * Math.random() - 1);
            this.heartbeatTimer = setTimeout(tick, this.heartbeatIntervalMs + jitter);
        };
        const tick = () => {
            void this.sendHeartbeat();
            // stopHeartbeat nulls the timer; check after the fire-and-forget send
            // but before rescheduling so close() during sendHeartbeat is honored.
            if (this.heartbeatTimer === null)
                return;
            schedule();
        };
        schedule();
    }
    /** Stop heartbeat timer. */
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearTimeout(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }
    /** Send a heartbeat via POST /sessions/{id}/worker/heartbeat. */
    async sendHeartbeat() {
        if (this.heartbeatInFlight)
            return;
        this.heartbeatInFlight = true;
        try {
            const result = await this.request('post', '/worker/heartbeat', { session_id: this.sessionId, worker_epoch: this.workerEpoch }, 'Heartbeat', { timeout: 5000 });
            if (result.ok) {
                (0, debug_js_1.logForDebugging)('CCRClient: Heartbeat sent');
            }
        }
        finally {
            this.heartbeatInFlight = false;
        }
    }
    /**
     * Write a StdoutMessage as a client event via POST /sessions/{id}/worker/events.
     * These events are visible to frontend clients via the SSE stream.
     * Injects a UUID if missing to ensure server-side idempotency on retry.
     *
     * stream_event messages are held in a 100ms delay buffer and accumulated
     * (text_deltas for the same content block emit a full-so-far snapshot per
     * flush). A non-stream_event write flushes the buffer first so downstream
     * ordering is preserved.
     */
    async writeEvent(message) {
        if (message.type === 'stream_event') {
            this.streamEventBuffer.push(message);
            if (!this.streamEventTimer) {
                this.streamEventTimer = setTimeout(() => void this.flushStreamEventBuffer(), STREAM_EVENT_FLUSH_INTERVAL_MS);
            }
            return;
        }
        await this.flushStreamEventBuffer();
        if (message.type === 'assistant') {
            clearStreamAccumulatorForMessage(this.streamTextAccumulator, message);
        }
        await this.eventUploader.enqueue(this.toClientEvent(message));
    }
    /** Wrap a StdoutMessage as a ClientEvent, injecting a UUID if missing. */
    toClientEvent(message) {
        const msg = message;
        return {
            payload: {
                ...msg,
                uuid: typeof msg.uuid === 'string' ? msg.uuid : (0, crypto_1.randomUUID)(),
            },
        };
    }
    /**
     * Drain the stream_event delay buffer: accumulate text_deltas into
     * full-so-far snapshots, clear the timer, enqueue the resulting events.
     * Called from the timer, from writeEvent on a non-stream message, and from
     * flush(). close() drops the buffer — call flush() first if you need
     * delivery.
     */
    async flushStreamEventBuffer() {
        if (this.streamEventTimer) {
            clearTimeout(this.streamEventTimer);
            this.streamEventTimer = null;
        }
        if (this.streamEventBuffer.length === 0)
            return;
        const buffered = this.streamEventBuffer;
        this.streamEventBuffer = [];
        const payloads = accumulateStreamEvents(buffered, this.streamTextAccumulator);
        await this.eventUploader.enqueue(payloads.map(payload => ({ payload, ephemeral: true })));
    }
    /**
     * Write an internal worker event via POST /sessions/{id}/worker/internal-events.
     * These events are NOT visible to frontend clients — they store worker-internal
     * state (transcript messages, compaction markers) needed for session resume.
     */
    async writeInternalEvent(eventType, payload, { isCompaction = false, agentId, } = {}) {
        const event = {
            payload: {
                type: eventType,
                ...payload,
                uuid: typeof payload.uuid === 'string' ? payload.uuid : (0, crypto_1.randomUUID)(),
            },
            ...(isCompaction && { is_compaction: true }),
            ...(agentId && { agent_id: agentId }),
        };
        await this.internalEventUploader.enqueue(event);
    }
    /**
     * Flush pending internal events. Call between turns and on shutdown
     * to ensure transcript entries are persisted.
     */
    flushInternalEvents() {
        return this.internalEventUploader.flush();
    }
    /**
     * Flush pending client events (writeEvent queue). Call before close()
     * when the caller needs delivery confirmation — close() abandons the
     * queue. Resolves once the uploader drains or rejects; returns
     * regardless of whether individual POSTs succeeded (check server state
     * separately if that matters).
     */
    async flush() {
        await this.flushStreamEventBuffer();
        return this.eventUploader.flush();
    }
    /**
     * Read foreground agent internal events from
     * GET /sessions/{id}/worker/internal-events.
     * Returns transcript entries from the last compaction boundary, or null on failure.
     * Used for session resume.
     */
    async readInternalEvents() {
        return this.paginatedGet('/worker/internal-events', {}, 'internal_events');
    }
    /**
     * Read all subagent internal events from
     * GET /sessions/{id}/worker/internal-events?subagents=true.
     * Returns a merged stream across all non-foreground agents, each from its
     * compaction point. Used for session resume.
     */
    async readSubagentInternalEvents() {
        return this.paginatedGet('/worker/internal-events', { subagents: 'true' }, 'subagent_events');
    }
    /**
     * Paginated GET with retry. Fetches all pages from a list endpoint,
     * retrying each page on failure with exponential backoff + jitter.
     */
    async paginatedGet(path, params, context) {
        const authHeaders = this.getAuthHeaders();
        if (Object.keys(authHeaders).length === 0)
            return null;
        const allEvents = [];
        let cursor;
        do {
            const url = new URL(`${this.sessionBaseUrl}${path}`);
            for (const [k, v] of Object.entries(params)) {
                url.searchParams.set(k, v);
            }
            if (cursor) {
                url.searchParams.set('cursor', cursor);
            }
            const page = await this.getWithRetry(url.toString(), authHeaders, context);
            if (!page)
                return null;
            allEvents.push(...(page.data ?? []));
            cursor = page.next_cursor;
        } while (cursor);
        (0, debug_js_1.logForDebugging)(`CCRClient: Read ${allEvents.length} internal events from ${path}${params.subagents ? ' (subagents)' : ''}`);
        return allEvents;
    }
    /**
     * Single GET request with retry. Returns the parsed response body
     * on success, null if all retries are exhausted.
     */
    async getWithRetry(url, authHeaders, context) {
        for (let attempt = 1; attempt <= 10; attempt++) {
            let response;
            try {
                response = await this.http.get(url, {
                    headers: {
                        ...authHeaders,
                        'anthropic-version': '2023-06-01',
                        'User-Agent': (0, userAgent_js_1.getClaudeCodeUserAgent)(),
                    },
                    validateStatus: alwaysValidStatus,
                    timeout: 30000,
                });
            }
            catch (error) {
                (0, debug_js_1.logForDebugging)(`CCRClient: GET ${url} failed (attempt ${attempt}/10): ${(0, errors_js_1.errorMessage)(error)}`, { level: 'warn' });
                if (attempt < 10) {
                    const delay = Math.min(500 * 2 ** (attempt - 1), 30000) + Math.random() * 500;
                    await (0, sleep_js_1.sleep)(delay);
                }
                continue;
            }
            if (response.status >= 200 && response.status < 300) {
                return response.data;
            }
            if (response.status === 409) {
                this.handleEpochMismatch();
            }
            (0, debug_js_1.logForDebugging)(`CCRClient: GET ${url} returned ${response.status} (attempt ${attempt}/10)`, { level: 'warn' });
            if (attempt < 10) {
                const delay = Math.min(500 * 2 ** (attempt - 1), 30000) + Math.random() * 500;
                await (0, sleep_js_1.sleep)(delay);
            }
        }
        (0, debug_js_1.logForDebugging)('CCRClient: GET retries exhausted', { level: 'error' });
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'cli_worker_get_retries_exhausted', {
            context,
        });
        return null;
    }
    /**
     * Report delivery status for a client-to-worker event.
     * POST /v1/code/sessions/{id}/worker/events/delivery (batch endpoint)
     */
    reportDelivery(eventId, status) {
        void this.deliveryUploader.enqueue({ eventId, status });
    }
    /** Get the current epoch (for external use). */
    getWorkerEpoch() {
        return this.workerEpoch;
    }
    /** Internal-event queue depth — shutdown-snapshot backpressure signal. */
    get internalEventsPending() {
        return this.internalEventUploader.pendingCount;
    }
    /** Clean up uploaders and timers. */
    close() {
        this.closed = true;
        this.stopHeartbeat();
        (0, sessionActivity_js_1.unregisterSessionActivityCallback)();
        if (this.streamEventTimer) {
            clearTimeout(this.streamEventTimer);
            this.streamEventTimer = null;
        }
        this.streamEventBuffer = [];
        this.streamTextAccumulator.byMessage.clear();
        this.streamTextAccumulator.scopeToMessage.clear();
        this.workerState.close();
        this.eventUploader.close();
        this.internalEventUploader.close();
        this.deliveryUploader.close();
    }
}
exports.CCRClient = CCRClient;
