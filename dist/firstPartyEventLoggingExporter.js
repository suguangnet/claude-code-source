"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirstPartyEventLoggingExporter = void 0;
const core_1 = require("@opentelemetry/core");
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("crypto");
const promises_1 = require("fs/promises");
const path = __importStar(require("path"));
const state_js_1 = require("../../bootstrap/state.js");
const claude_code_internal_event_js_1 = require("../../types/generated/events_mono/claude_code/v1/claude_code_internal_event.js");
const growthbook_experiment_event_js_1 = require("../../types/generated/events_mono/growthbook/v1/growthbook_experiment_event.js");
const auth_js_1 = require("../../utils/auth.js");
const config_js_1 = require("../../utils/config.js");
const debug_js_1 = require("../../utils/debug.js");
const envUtils_js_1 = require("../../utils/envUtils.js");
const errors_js_1 = require("../../utils/errors.js");
const http_js_1 = require("../../utils/http.js");
const json_js_1 = require("../../utils/json.js");
const log_js_1 = require("../../utils/log.js");
const sleep_js_1 = require("../../utils/sleep.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const userAgent_js_1 = require("../../utils/userAgent.js");
const client_js_1 = require("../oauth/client.js");
const index_js_1 = require("./index.js");
const metadata_js_1 = require("./metadata.js");
// Unique ID for this process run - used to isolate failed event files between runs
const BATCH_UUID = (0, crypto_1.randomUUID)();
// File prefix for failed event storage
const FILE_PREFIX = '1p_failed_events.';
// Storage directory for failed events - evaluated at runtime to respect CLAUDE_CONFIG_DIR in tests
function getStorageDir() {
    return path.join((0, envUtils_js_1.getClaudeConfigHomeDir)(), 'telemetry');
}
/**
 * Exporter for 1st-party event logging to /api/event_logging/batch.
 *
 * Export cycles are controlled by OpenTelemetry's BatchLogRecordProcessor, which
 * triggers export() when either:
 * - Time interval elapses (default: 5 seconds via scheduledDelayMillis)
 * - Batch size is reached (default: 200 events via maxExportBatchSize)
 *
 * This exporter adds resilience on top:
 * - Append-only log for failed events (concurrency-safe)
 * - Quadratic backoff retry for failed events, dropped after maxAttempts
 * - Immediate retry of queued events when any export succeeds (endpoint is healthy)
 * - Chunking large event sets into smaller batches
 * - Auth fallback: retries without auth on 401 errors
 */
class FirstPartyEventLoggingExporter {
    constructor(options = {}) {
        this.pendingExports = [];
        this.isShutdown = false;
        this.cancelBackoff = null;
        this.attempts = 0;
        this.isRetrying = false;
        // Default: prod, except when ANTHROPIC_BASE_URL is explicitly staging.
        // Overridable via tengu_1p_event_batch_config.baseUrl.
        const baseUrl = options.baseUrl ||
            (process.env.ANTHROPIC_BASE_URL === 'https://api-staging.anthropic.com'
                ? 'https://api-staging.anthropic.com'
                : 'https://api.anthropic.com');
        this.endpoint = `${baseUrl}${options.path || '/api/event_logging/batch'}`;
        this.timeout = options.timeout || 10000;
        this.maxBatchSize = options.maxBatchSize || 200;
        this.skipAuth = options.skipAuth ?? false;
        this.batchDelayMs = options.batchDelayMs || 100;
        this.baseBackoffDelayMs = options.baseBackoffDelayMs || 500;
        this.maxBackoffDelayMs = options.maxBackoffDelayMs || 30000;
        this.maxAttempts = options.maxAttempts ?? 8;
        this.isKilled = options.isKilled ?? (() => false);
        this.schedule =
            options.schedule ??
                ((fn, ms) => {
                    const t = setTimeout(fn, ms);
                    return () => clearTimeout(t);
                });
        // Retry any failed events from previous runs of this session (in background)
        void this.retryPreviousBatches();
    }
    // Expose for testing
    async getQueuedEventCount() {
        return (await this.loadEventsFromCurrentBatch()).length;
    }
    // --- Storage helpers ---
    getCurrentBatchFilePath() {
        return path.join(getStorageDir(), `${FILE_PREFIX}${(0, state_js_1.getSessionId)()}.${BATCH_UUID}.json`);
    }
    async loadEventsFromFile(filePath) {
        try {
            return await (0, json_js_1.readJSONLFile)(filePath);
        }
        catch {
            return [];
        }
    }
    async loadEventsFromCurrentBatch() {
        return this.loadEventsFromFile(this.getCurrentBatchFilePath());
    }
    async saveEventsToFile(filePath, events) {
        try {
            if (events.length === 0) {
                try {
                    await (0, promises_1.unlink)(filePath);
                }
                catch {
                    // File doesn't exist, nothing to delete
                }
            }
            else {
                // Ensure storage directory exists
                await (0, promises_1.mkdir)(getStorageDir(), { recursive: true });
                // Write as JSON lines (one event per line)
                const content = events.map(e => (0, slowOperations_js_1.jsonStringify)(e)).join('\n') + '\n';
                await (0, promises_1.writeFile)(filePath, content, 'utf8');
            }
        }
        catch (error) {
            (0, log_js_1.logError)(error);
        }
    }
    async appendEventsToFile(filePath, events) {
        if (events.length === 0)
            return;
        try {
            // Ensure storage directory exists
            await (0, promises_1.mkdir)(getStorageDir(), { recursive: true });
            // Append as JSON lines (one event per line) - atomic on most filesystems
            const content = events.map(e => (0, slowOperations_js_1.jsonStringify)(e)).join('\n') + '\n';
            await (0, promises_1.appendFile)(filePath, content, 'utf8');
        }
        catch (error) {
            (0, log_js_1.logError)(error);
        }
    }
    async deleteFile(filePath) {
        try {
            await (0, promises_1.unlink)(filePath);
        }
        catch {
            // File doesn't exist or can't be deleted, ignore
        }
    }
    // --- Previous batch retry (startup) ---
    async retryPreviousBatches() {
        try {
            const prefix = `${FILE_PREFIX}${(0, state_js_1.getSessionId)()}.`;
            let files;
            try {
                files = (await (0, promises_1.readdir)(getStorageDir()))
                    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
                    .filter((f) => !f.includes(BATCH_UUID)); // Exclude current batch
            }
            catch (e) {
                if ((0, errors_js_1.isFsInaccessible)(e))
                    return;
                throw e;
            }
            for (const file of files) {
                const filePath = path.join(getStorageDir(), file);
                void this.retryFileInBackground(filePath);
            }
        }
        catch (error) {
            (0, log_js_1.logError)(error);
        }
    }
    async retryFileInBackground(filePath) {
        if (this.attempts >= this.maxAttempts) {
            await this.deleteFile(filePath);
            return;
        }
        const events = await this.loadEventsFromFile(filePath);
        if (events.length === 0) {
            await this.deleteFile(filePath);
            return;
        }
        if (process.env.USER_TYPE === 'ant') {
            (0, debug_js_1.logForDebugging)(`1P event logging: retrying ${events.length} events from previous batch`);
        }
        const failedEvents = await this.sendEventsInBatches(events);
        if (failedEvents.length === 0) {
            await this.deleteFile(filePath);
            if (process.env.USER_TYPE === 'ant') {
                (0, debug_js_1.logForDebugging)('1P event logging: previous batch retry succeeded');
            }
        }
        else {
            // Save only the failed events back (not all original events)
            await this.saveEventsToFile(filePath, failedEvents);
            if (process.env.USER_TYPE === 'ant') {
                (0, debug_js_1.logForDebugging)(`1P event logging: previous batch retry failed, ${failedEvents.length} events remain`);
            }
        }
    }
    async export(logs, resultCallback) {
        if (this.isShutdown) {
            if (process.env.USER_TYPE === 'ant') {
                (0, debug_js_1.logForDebugging)('1P event logging export failed: Exporter has been shutdown');
            }
            resultCallback({
                code: core_1.ExportResultCode.FAILED,
                error: new Error('Exporter has been shutdown'),
            });
            return;
        }
        const exportPromise = this.doExport(logs, resultCallback);
        this.pendingExports.push(exportPromise);
        // Clean up completed exports
        void exportPromise.finally(() => {
            const index = this.pendingExports.indexOf(exportPromise);
            if (index > -1) {
                void this.pendingExports.splice(index, 1);
            }
        });
    }
    async doExport(logs, resultCallback) {
        try {
            // Filter for event logs only (by scope name)
            const eventLogs = logs.filter(log => log.instrumentationScope?.name === 'com.anthropic.claude_code.events');
            if (eventLogs.length === 0) {
                resultCallback({ code: core_1.ExportResultCode.SUCCESS });
                return;
            }
            // Transform new logs (failed events are retried independently via backoff)
            const events = this.transformLogsToEvents(eventLogs).events;
            if (events.length === 0) {
                resultCallback({ code: core_1.ExportResultCode.SUCCESS });
                return;
            }
            if (this.attempts >= this.maxAttempts) {
                resultCallback({
                    code: core_1.ExportResultCode.FAILED,
                    error: new Error(`Dropped ${events.length} events: max attempts (${this.maxAttempts}) reached`),
                });
                return;
            }
            // Send events
            const failedEvents = await this.sendEventsInBatches(events);
            this.attempts++;
            if (failedEvents.length > 0) {
                await this.queueFailedEvents(failedEvents);
                this.scheduleBackoffRetry();
                const context = this.lastExportErrorContext
                    ? ` (${this.lastExportErrorContext})`
                    : '';
                resultCallback({
                    code: core_1.ExportResultCode.FAILED,
                    error: new Error(`Failed to export ${failedEvents.length} events${context}`),
                });
                return;
            }
            // Success - reset backoff and immediately retry any queued events
            this.resetBackoff();
            if ((await this.getQueuedEventCount()) > 0 && !this.isRetrying) {
                void this.retryFailedEvents();
            }
            resultCallback({ code: core_1.ExportResultCode.SUCCESS });
        }
        catch (error) {
            if (process.env.USER_TYPE === 'ant') {
                (0, debug_js_1.logForDebugging)(`1P event logging export failed: ${(0, errors_js_1.errorMessage)(error)}`);
            }
            (0, log_js_1.logError)(error);
            resultCallback({
                code: core_1.ExportResultCode.FAILED,
                error: (0, errors_js_1.toError)(error),
            });
        }
    }
    async sendEventsInBatches(events) {
        // Chunk events into batches
        const batches = [];
        for (let i = 0; i < events.length; i += this.maxBatchSize) {
            batches.push(events.slice(i, i + this.maxBatchSize));
        }
        if (process.env.USER_TYPE === 'ant') {
            (0, debug_js_1.logForDebugging)(`1P event logging: exporting ${events.length} events in ${batches.length} batch(es)`);
        }
        // Send each batch with delay between them. On first failure, assume the
        // endpoint is down and short-circuit: queue the failed batch plus all
        // remaining unsent batches without POSTing them. The backoff retry will
        // probe again with a single batch next tick.
        const failedBatchEvents = [];
        let lastErrorContext;
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            try {
                await this.sendBatchWithRetry({ events: batch });
            }
            catch (error) {
                lastErrorContext = getAxiosErrorContext(error);
                for (let j = i; j < batches.length; j++) {
                    failedBatchEvents.push(...batches[j]);
                }
                if (process.env.USER_TYPE === 'ant') {
                    const skipped = batches.length - 1 - i;
                    (0, debug_js_1.logForDebugging)(`1P event logging: batch ${i + 1}/${batches.length} failed (${lastErrorContext}); short-circuiting ${skipped} remaining batch(es)`);
                }
                break;
            }
            if (i < batches.length - 1 && this.batchDelayMs > 0) {
                await (0, sleep_js_1.sleep)(this.batchDelayMs);
            }
        }
        if (failedBatchEvents.length > 0 && lastErrorContext) {
            this.lastExportErrorContext = lastErrorContext;
        }
        return failedBatchEvents;
    }
    async queueFailedEvents(events) {
        const filePath = this.getCurrentBatchFilePath();
        // Append-only: just add new events to file (atomic on most filesystems)
        await this.appendEventsToFile(filePath, events);
        const context = this.lastExportErrorContext
            ? ` (${this.lastExportErrorContext})`
            : '';
        const message = `1P event logging: ${events.length} events failed to export${context}`;
        (0, log_js_1.logError)(new Error(message));
    }
    scheduleBackoffRetry() {
        // Don't schedule if already retrying or shutdown
        if (this.cancelBackoff || this.isRetrying || this.isShutdown) {
            return;
        }
        // Quadratic backoff (matching Statsig SDK): base * attempts²
        const delay = Math.min(this.baseBackoffDelayMs * this.attempts * this.attempts, this.maxBackoffDelayMs);
        if (process.env.USER_TYPE === 'ant') {
            (0, debug_js_1.logForDebugging)(`1P event logging: scheduling backoff retry in ${delay}ms (attempt ${this.attempts})`);
        }
        this.cancelBackoff = this.schedule(async () => {
            this.cancelBackoff = null;
            await this.retryFailedEvents();
        }, delay);
    }
    async retryFailedEvents() {
        const filePath = this.getCurrentBatchFilePath();
        // Keep retrying while there are events and endpoint is healthy
        while (!this.isShutdown) {
            const events = await this.loadEventsFromFile(filePath);
            if (events.length === 0)
                break;
            if (this.attempts >= this.maxAttempts) {
                if (process.env.USER_TYPE === 'ant') {
                    (0, debug_js_1.logForDebugging)(`1P event logging: max attempts (${this.maxAttempts}) reached, dropping ${events.length} events`);
                }
                await this.deleteFile(filePath);
                this.resetBackoff();
                return;
            }
            this.isRetrying = true;
            // Clear file before retry (we have events in memory now)
            await this.deleteFile(filePath);
            if (process.env.USER_TYPE === 'ant') {
                (0, debug_js_1.logForDebugging)(`1P event logging: retrying ${events.length} failed events (attempt ${this.attempts + 1})`);
            }
            const failedEvents = await this.sendEventsInBatches(events);
            this.attempts++;
            this.isRetrying = false;
            if (failedEvents.length > 0) {
                // Write failures back to disk
                await this.saveEventsToFile(filePath, failedEvents);
                this.scheduleBackoffRetry();
                return; // Failed - wait for backoff
            }
            // Success - reset backoff and continue loop to drain any newly queued events
            this.resetBackoff();
            if (process.env.USER_TYPE === 'ant') {
                (0, debug_js_1.logForDebugging)('1P event logging: backoff retry succeeded');
            }
        }
    }
    resetBackoff() {
        this.attempts = 0;
        if (this.cancelBackoff) {
            this.cancelBackoff();
            this.cancelBackoff = null;
        }
    }
    async sendBatchWithRetry(payload) {
        if (this.isKilled()) {
            // Throw so the caller short-circuits remaining batches and queues
            // everything to disk. Zero network traffic while killed; the backoff
            // timer keeps ticking and will resume POSTs as soon as the GrowthBook
            // cache picks up the cleared flag.
            throw new Error('firstParty sink killswitch active');
        }
        const baseHeaders = {
            'Content-Type': 'application/json',
            'User-Agent': (0, userAgent_js_1.getClaudeCodeUserAgent)(),
            'x-service-name': 'claude-code',
        };
        // Skip auth if trust hasn't been established yet
        // This prevents executing apiKeyHelper commands before the trust dialog
        // Non-interactive sessions implicitly have workspace trust
        const hasTrust = (0, config_js_1.checkHasTrustDialogAccepted)() || (0, state_js_1.getIsNonInteractiveSession)();
        if (process.env.USER_TYPE === 'ant' && !hasTrust) {
            (0, debug_js_1.logForDebugging)('1P event logging: Trust not accepted');
        }
        // Skip auth when the OAuth token is expired or lacks user:profile
        // scope (service key sessions). Falls through to unauthenticated send.
        let shouldSkipAuth = this.skipAuth || !hasTrust;
        if (!shouldSkipAuth && (0, auth_js_1.isClaudeAISubscriber)()) {
            const tokens = (0, auth_js_1.getClaudeAIOAuthTokens)();
            if (!(0, auth_js_1.hasProfileScope)()) {
                shouldSkipAuth = true;
            }
            else if (tokens && (0, client_js_1.isOAuthTokenExpired)(tokens.expiresAt)) {
                shouldSkipAuth = true;
                if (process.env.USER_TYPE === 'ant') {
                    (0, debug_js_1.logForDebugging)('1P event logging: OAuth token expired, skipping auth to avoid 401');
                }
            }
        }
        // Try with auth headers first (unless trust not established or token is known to be expired)
        const authResult = shouldSkipAuth
            ? { headers: {}, error: 'trust not established or Oauth token expired' }
            : (0, http_js_1.getAuthHeaders)();
        const useAuth = !authResult.error;
        if (!useAuth && process.env.USER_TYPE === 'ant') {
            (0, debug_js_1.logForDebugging)(`1P event logging: auth not available, sending without auth`);
        }
        const headers = useAuth
            ? { ...baseHeaders, ...authResult.headers }
            : baseHeaders;
        try {
            const response = await axios_1.default.post(this.endpoint, payload, {
                timeout: this.timeout,
                headers,
            });
            this.logSuccess(payload.events.length, useAuth, response.data);
            return;
        }
        catch (error) {
            // Handle 401 by retrying without auth
            if (useAuth &&
                axios_1.default.isAxiosError(error) &&
                error.response?.status === 401) {
                if (process.env.USER_TYPE === 'ant') {
                    (0, debug_js_1.logForDebugging)('1P event logging: 401 auth error, retrying without auth');
                }
                const response = await axios_1.default.post(this.endpoint, payload, {
                    timeout: this.timeout,
                    headers: baseHeaders,
                });
                this.logSuccess(payload.events.length, false, response.data);
                return;
            }
            throw error;
        }
    }
    logSuccess(eventCount, withAuth, responseData) {
        if (process.env.USER_TYPE === 'ant') {
            (0, debug_js_1.logForDebugging)(`1P event logging: ${eventCount} events exported successfully${withAuth ? ' (with auth)' : ' (without auth)'}`);
            (0, debug_js_1.logForDebugging)(`API Response: ${(0, slowOperations_js_1.jsonStringify)(responseData, null, 2)}`);
        }
    }
    hrTimeToDate(hrTime) {
        const [seconds, nanoseconds] = hrTime;
        return new Date(seconds * 1000 + nanoseconds / 1000000);
    }
    transformLogsToEvents(logs) {
        const events = [];
        for (const log of logs) {
            const attributes = log.attributes || {};
            // Check if this is a GrowthBook experiment event
            if (attributes.event_type === 'GrowthbookExperimentEvent') {
                const timestamp = this.hrTimeToDate(log.hrTime);
                const account_uuid = attributes.account_uuid;
                const organization_uuid = attributes.organization_uuid;
                events.push({
                    event_type: 'GrowthbookExperimentEvent',
                    event_data: growthbook_experiment_event_js_1.GrowthbookExperimentEvent.toJSON({
                        event_id: attributes.event_id,
                        timestamp,
                        experiment_id: attributes.experiment_id,
                        variation_id: attributes.variation_id,
                        environment: attributes.environment,
                        user_attributes: attributes.user_attributes,
                        experiment_metadata: attributes.experiment_metadata,
                        device_id: attributes.device_id,
                        session_id: attributes.session_id,
                        auth: account_uuid || organization_uuid
                            ? { account_uuid, organization_uuid }
                            : undefined,
                    }),
                });
                continue;
            }
            // Extract event name
            const eventName = attributes.event_name || log.body || 'unknown';
            // Extract metadata objects directly (no JSON parsing needed)
            const coreMetadata = attributes.core_metadata;
            const userMetadata = attributes.user_metadata;
            const eventMetadata = (attributes.event_metadata || {});
            if (!coreMetadata) {
                // Emit partial event if core metadata is missing
                if (process.env.USER_TYPE === 'ant') {
                    (0, debug_js_1.logForDebugging)(`1P event logging: core_metadata missing for event ${eventName}`);
                }
                events.push({
                    event_type: 'ClaudeCodeInternalEvent',
                    event_data: claude_code_internal_event_js_1.ClaudeCodeInternalEvent.toJSON({
                        event_id: attributes.event_id,
                        event_name: eventName,
                        client_timestamp: this.hrTimeToDate(log.hrTime),
                        session_id: (0, state_js_1.getSessionId)(),
                        additional_metadata: Buffer.from((0, slowOperations_js_1.jsonStringify)({
                            transform_error: 'core_metadata attribute is missing',
                        })).toString('base64'),
                    }),
                });
                continue;
            }
            // Transform to 1P format
            const formatted = (0, metadata_js_1.to1PEventFormat)(coreMetadata, userMetadata, eventMetadata);
            // _PROTO_* keys are PII-tagged values meant only for privileged BQ
            // columns. Hoist known keys to proto fields, then defensively strip any
            // remaining _PROTO_* so an unrecognized future key can't silently land
            // in the general-access additional_metadata blob. sink.ts applies the
            // same strip before Datadog; this closes the 1P side.
            const { _PROTO_skill_name, _PROTO_plugin_name, _PROTO_marketplace_name, ...rest } = formatted.additional;
            const additionalMetadata = (0, index_js_1.stripProtoFields)(rest);
            events.push({
                event_type: 'ClaudeCodeInternalEvent',
                event_data: claude_code_internal_event_js_1.ClaudeCodeInternalEvent.toJSON({
                    event_id: attributes.event_id,
                    event_name: eventName,
                    client_timestamp: this.hrTimeToDate(log.hrTime),
                    device_id: attributes.user_id,
                    email: userMetadata?.email,
                    auth: formatted.auth,
                    ...formatted.core,
                    env: formatted.env,
                    process: formatted.process,
                    skill_name: typeof _PROTO_skill_name === 'string'
                        ? _PROTO_skill_name
                        : undefined,
                    plugin_name: typeof _PROTO_plugin_name === 'string'
                        ? _PROTO_plugin_name
                        : undefined,
                    marketplace_name: typeof _PROTO_marketplace_name === 'string'
                        ? _PROTO_marketplace_name
                        : undefined,
                    additional_metadata: Object.keys(additionalMetadata).length > 0
                        ? Buffer.from((0, slowOperations_js_1.jsonStringify)(additionalMetadata)).toString('base64')
                        : undefined,
                }),
            });
        }
        return { events };
    }
    async shutdown() {
        this.isShutdown = true;
        this.resetBackoff();
        await this.forceFlush();
        if (process.env.USER_TYPE === 'ant') {
            (0, debug_js_1.logForDebugging)('1P event logging exporter shutdown complete');
        }
    }
    async forceFlush() {
        await Promise.all(this.pendingExports);
        if (process.env.USER_TYPE === 'ant') {
            (0, debug_js_1.logForDebugging)('1P event logging exporter flush complete');
        }
    }
}
exports.FirstPartyEventLoggingExporter = FirstPartyEventLoggingExporter;
function getAxiosErrorContext(error) {
    if (!axios_1.default.isAxiosError(error)) {
        return (0, errors_js_1.errorMessage)(error);
    }
    const parts = [];
    const requestId = error.response?.headers?.['request-id'];
    if (requestId) {
        parts.push(`request-id=${requestId}`);
    }
    if (error.response?.status) {
        parts.push(`status=${error.response.status}`);
    }
    if (error.code) {
        parts.push(`code=${error.code}`);
    }
    if (error.message) {
        parts.push(error.message);
    }
    return parts.join(', ');
}
