"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemoteIO = void 0;
const stream_1 = require("stream");
const url_1 = require("url");
const state_js_1 = require("../bootstrap/state.js");
const pollConfig_js_1 = require("../bridge/pollConfig.js");
const cleanupRegistry_js_1 = require("../utils/cleanupRegistry.js");
const commandLifecycle_js_1 = require("../utils/commandLifecycle.js");
const debug_js_1 = require("../utils/debug.js");
const diagLogs_js_1 = require("../utils/diagLogs.js");
const envUtils_js_1 = require("../utils/envUtils.js");
const errors_js_1 = require("../utils/errors.js");
const gracefulShutdown_js_1 = require("../utils/gracefulShutdown.js");
const log_js_1 = require("../utils/log.js");
const process_js_1 = require("../utils/process.js");
const sessionIngressAuth_js_1 = require("../utils/sessionIngressAuth.js");
const sessionState_js_1 = require("../utils/sessionState.js");
const sessionStorage_js_1 = require("../utils/sessionStorage.js");
const ndjsonSafeStringify_js_1 = require("./ndjsonSafeStringify.js");
const structuredIO_js_1 = require("./structuredIO.js");
const ccrClient_js_1 = require("./transports/ccrClient.js");
const SSETransport_js_1 = require("./transports/SSETransport.js");
const transportUtils_js_1 = require("./transports/transportUtils.js");
/**
 * Bidirectional streaming for SDK mode with session tracking
 * Supports WebSocket transport
 */
class RemoteIO extends structuredIO_js_1.StructuredIO {
    constructor(streamUrl, initialPrompt, replayUserMessages) {
        const inputStream = new stream_1.PassThrough({ encoding: 'utf8' });
        super(inputStream, replayUserMessages);
        this.isBridge = false;
        this.isDebug = false;
        this.ccrClient = null;
        this.keepAliveTimer = null;
        this.inputStream = inputStream;
        this.url = new url_1.URL(streamUrl);
        // Prepare headers with session token if available
        const headers = {};
        const sessionToken = (0, sessionIngressAuth_js_1.getSessionIngressAuthToken)();
        if (sessionToken) {
            headers['Authorization'] = `Bearer ${sessionToken}`;
        }
        else {
            (0, debug_js_1.logForDebugging)('[remote-io] No session ingress token available', {
                level: 'error',
            });
        }
        // Add environment runner version if available (set by Environment Manager)
        const erVersion = process.env.CLAUDE_CODE_ENVIRONMENT_RUNNER_VERSION;
        if (erVersion) {
            headers['x-environment-runner-version'] = erVersion;
        }
        // Provide a callback that re-reads the session token dynamically.
        // When the parent process refreshes the token (via token file or env var),
        // the transport can pick it up on reconnection.
        const refreshHeaders = () => {
            const h = {};
            const freshToken = (0, sessionIngressAuth_js_1.getSessionIngressAuthToken)();
            if (freshToken) {
                h['Authorization'] = `Bearer ${freshToken}`;
            }
            const freshErVersion = process.env.CLAUDE_CODE_ENVIRONMENT_RUNNER_VERSION;
            if (freshErVersion) {
                h['x-environment-runner-version'] = freshErVersion;
            }
            return h;
        };
        // Get appropriate transport based on URL protocol
        this.transport = (0, transportUtils_js_1.getTransportForUrl)(this.url, headers, (0, state_js_1.getSessionId)(), refreshHeaders);
        // Set up data callback
        this.isBridge = process.env.CLAUDE_CODE_ENVIRONMENT_KIND === 'bridge';
        this.isDebug = (0, debug_js_1.isDebugMode)();
        this.transport.setOnData((data) => {
            this.inputStream.write(data);
            if (this.isBridge && this.isDebug) {
                (0, process_js_1.writeToStdout)(data.endsWith('\n') ? data : data + '\n');
            }
        });
        // Set up close callback to handle connection failures
        this.transport.setOnClose(() => {
            // End the input stream to trigger graceful shutdown
            this.inputStream.end();
        });
        // Initialize CCR v2 client (heartbeats, epoch, state reporting, event writes).
        // The CCRClient constructor wires the SSE received-ack handler
        // synchronously, so new CCRClient() MUST run before transport.connect() —
        // otherwise early SSE frames hit an unwired onEventCallback and their
        // 'received' delivery acks are silently dropped.
        if ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_USE_CCR_V2)) {
            // CCR v2 is SSE+POST by definition. getTransportForUrl returns
            // SSETransport under the same env var, but the two checks live in
            // different files — assert the invariant so a future decoupling
            // fails loudly here instead of confusingly inside CCRClient.
            if (!(this.transport instanceof SSETransport_js_1.SSETransport)) {
                throw new Error('CCR v2 requires SSETransport; check getTransportForUrl');
            }
            this.ccrClient = new ccrClient_js_1.CCRClient(this.transport, this.url);
            const init = this.ccrClient.initialize();
            this.restoredWorkerState = init.catch(() => null);
            init.catch((error) => {
                (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'cli_worker_lifecycle_init_failed', {
                    reason: error instanceof ccrClient_js_1.CCRInitError ? error.reason : 'unknown',
                });
                (0, log_js_1.logError)(new Error(`CCRClient initialization failed: ${(0, errors_js_1.errorMessage)(error)}`));
                void (0, gracefulShutdown_js_1.gracefulShutdown)(1, 'other');
            });
            (0, cleanupRegistry_js_1.registerCleanup)(async () => this.ccrClient?.close());
            // Register internal event writer for transcript persistence.
            // When set, sessionStorage writes transcript messages as CCR v2
            // internal events instead of v1 Session Ingress.
            (0, sessionStorage_js_1.setInternalEventWriter)((eventType, payload, options) => this.ccrClient.writeInternalEvent(eventType, payload, options));
            // Register internal event readers for session resume.
            // When set, hydrateFromCCRv2InternalEvents() can fetch foreground
            // and subagent internal events to reconstruct conversation state.
            (0, sessionStorage_js_1.setInternalEventReader)(() => this.ccrClient.readInternalEvents(), () => this.ccrClient.readSubagentInternalEvents());
            const LIFECYCLE_TO_DELIVERY = {
                started: 'processing',
                completed: 'processed',
            };
            (0, commandLifecycle_js_1.setCommandLifecycleListener)((uuid, state) => {
                this.ccrClient?.reportDelivery(uuid, LIFECYCLE_TO_DELIVERY[state]);
            });
            (0, sessionState_js_1.setSessionStateChangedListener)((state, details) => {
                this.ccrClient?.reportState(state, details);
            });
            (0, sessionState_js_1.setSessionMetadataChangedListener)(metadata => {
                this.ccrClient?.reportMetadata(metadata);
            });
        }
        // Start connection only after all callbacks are wired (setOnData above,
        // setOnEvent inside new CCRClient() when CCR v2 is enabled).
        void this.transport.connect();
        // Push a silent keep_alive frame on a fixed interval so upstream
        // proxies and the session-ingress layer don't GC an otherwise-idle
        // remote control session. The keep_alive type is filtered before
        // reaching any client UI (Query.ts drops it; structuredIO.ts drops it;
        // web/iOS/Android never see it in their message loop). Interval comes
        // from GrowthBook (tengu_bridge_poll_interval_config
        // session_keepalive_interval_v2_ms, default 120s); 0 = disabled.
        // Bridge-only: fixes Envoy idle timeout on bridge-topology sessions
        // (#21931). byoc workers ran without this before #21931 and do not
        // need it — different network path.
        const keepAliveIntervalMs = (0, pollConfig_js_1.getPollIntervalConfig)().session_keepalive_interval_v2_ms;
        if (this.isBridge && keepAliveIntervalMs > 0) {
            this.keepAliveTimer = setInterval(() => {
                (0, debug_js_1.logForDebugging)('[remote-io] keep_alive sent');
                void this.write({ type: 'keep_alive' }).catch(err => {
                    (0, debug_js_1.logForDebugging)(`[remote-io] keep_alive write failed: ${(0, errors_js_1.errorMessage)(err)}`);
                });
            }, keepAliveIntervalMs);
            this.keepAliveTimer.unref?.();
        }
        // Register for graceful shutdown cleanup
        (0, cleanupRegistry_js_1.registerCleanup)(async () => this.close());
        // If initial prompt is provided, send it through the input stream
        if (initialPrompt) {
            // Convert the initial prompt to the input stream format.
            // Chunks from stdin may already contain trailing newlines, so strip
            // them before appending our own to avoid double-newline issues that
            // cause structuredIO to parse empty lines. String() handles both
            // string chunks and Buffer objects from process.stdin.
            const stream = this.inputStream;
            void (async () => {
                for await (const chunk of initialPrompt) {
                    stream.write(String(chunk).replace(/\n$/, '') + '\n');
                }
            })();
        }
    }
    flushInternalEvents() {
        return this.ccrClient?.flushInternalEvents() ?? Promise.resolve();
    }
    get internalEventsPending() {
        return this.ccrClient?.internalEventsPending ?? 0;
    }
    /**
     * Send output to the transport.
     * In bridge mode, control_request messages are always echoed to stdout so the
     * bridge parent can detect permission requests. Other messages are echoed only
     * in debug mode.
     */
    async write(message) {
        if (this.ccrClient) {
            await this.ccrClient.writeEvent(message);
        }
        else {
            await this.transport.write(message);
        }
        if (this.isBridge) {
            if (message.type === 'control_request' || this.isDebug) {
                (0, process_js_1.writeToStdout)((0, ndjsonSafeStringify_js_1.ndjsonSafeStringify)(message) + '\n');
            }
        }
    }
    /**
     * Clean up connections gracefully
     */
    close() {
        if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = null;
        }
        this.transport.close();
        this.inputStream.end();
    }
}
exports.RemoteIO = RemoteIO;
