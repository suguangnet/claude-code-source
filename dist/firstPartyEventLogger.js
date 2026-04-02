"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEventSamplingConfig = getEventSamplingConfig;
exports.shouldSampleEvent = shouldSampleEvent;
exports.shutdown1PEventLogging = shutdown1PEventLogging;
exports.is1PEventLoggingEnabled = is1PEventLoggingEnabled;
exports.logEventTo1P = logEventTo1P;
exports.logGrowthBookExperimentTo1P = logGrowthBookExperimentTo1P;
exports.initialize1PEventLogging = initialize1PEventLogging;
exports.reinitialize1PEventLoggingIfConfigChanged = reinitialize1PEventLoggingIfConfigChanged;
const resources_1 = require("@opentelemetry/resources");
const sdk_logs_1 = require("@opentelemetry/sdk-logs");
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
const crypto_1 = require("crypto");
const lodash_es_1 = require("lodash-es");
const config_js_1 = require("../../utils/config.js");
const debug_js_1 = require("../../utils/debug.js");
const log_js_1 = require("../../utils/log.js");
const platform_js_1 = require("../../utils/platform.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const startupProfiler_js_1 = require("../../utils/startupProfiler.js");
const user_js_1 = require("../../utils/user.js");
const config_js_2 = require("./config.js");
const firstPartyEventLoggingExporter_js_1 = require("./firstPartyEventLoggingExporter.js");
const growthbook_js_1 = require("./growthbook.js");
const metadata_js_1 = require("./metadata.js");
const sinkKillswitch_js_1 = require("./sinkKillswitch.js");
const EVENT_SAMPLING_CONFIG_NAME = 'tengu_event_sampling_config';
/**
 * Get the event sampling configuration from GrowthBook.
 * Uses cached value if available, updates cache in background.
 */
function getEventSamplingConfig() {
    return (0, growthbook_js_1.getDynamicConfig_CACHED_MAY_BE_STALE)(EVENT_SAMPLING_CONFIG_NAME, {});
}
/**
 * Determine if an event should be sampled based on its sample rate.
 * Returns the sample rate if sampled, null if not sampled.
 *
 * @param eventName - Name of the event to check
 * @returns The sample_rate if event should be logged, null if it should be dropped
 */
function shouldSampleEvent(eventName) {
    const config = getEventSamplingConfig();
    const eventConfig = config[eventName];
    // If no config for this event, log at 100% rate (no sampling)
    if (!eventConfig) {
        return null;
    }
    const sampleRate = eventConfig.sample_rate;
    // Validate sample rate is in valid range
    if (typeof sampleRate !== 'number' || sampleRate < 0 || sampleRate > 1) {
        return null;
    }
    // Sample rate of 1 means log everything (no need to add metadata)
    if (sampleRate >= 1) {
        return null;
    }
    // Sample rate of 0 means drop everything
    if (sampleRate <= 0) {
        return 0;
    }
    // Randomly decide whether to sample this event
    return Math.random() < sampleRate ? sampleRate : 0;
}
const BATCH_CONFIG_NAME = 'tengu_1p_event_batch_config';
function getBatchConfig() {
    return (0, growthbook_js_1.getDynamicConfig_CACHED_MAY_BE_STALE)(BATCH_CONFIG_NAME, {});
}
// Module-local state for event logging (not exposed globally)
let firstPartyEventLogger = null;
let firstPartyEventLoggerProvider = null;
// Last batch config used to construct the provider — used by
// reinitialize1PEventLoggingIfConfigChanged to decide whether a rebuild is
// needed when GrowthBook refreshes.
let lastBatchConfig = null;
/**
 * Flush and shutdown the 1P event logger.
 * This should be called as the final step before process exit to ensure
 * all events (including late ones from API responses) are exported.
 */
async function shutdown1PEventLogging() {
    if (!firstPartyEventLoggerProvider) {
        return;
    }
    try {
        await firstPartyEventLoggerProvider.shutdown();
        if (process.env.USER_TYPE === 'ant') {
            (0, debug_js_1.logForDebugging)('1P event logging: final shutdown complete');
        }
    }
    catch {
        // Ignore shutdown errors
    }
}
/**
 * Check if 1P event logging is enabled.
 * Respects the same opt-outs as other analytics sinks:
 * - Test environment
 * - Third-party cloud providers (Bedrock/Vertex)
 * - Global telemetry opt-outs
 * - Non-essential traffic disabled
 *
 * Note: Unlike BigQuery metrics, event logging does NOT check organization-level
 * metrics opt-out via API. It follows the same pattern as Statsig event logging.
 */
function is1PEventLoggingEnabled() {
    // Respect standard analytics opt-outs
    return !(0, config_js_2.isAnalyticsDisabled)();
}
/**
 * Log a 1st-party event for internal analytics (async version).
 * Events are batched and exported to /api/event_logging/batch
 *
 * This enriches the event with core metadata (model, session, env context, etc.)
 * at log time, similar to logEventToStatsig.
 *
 * @param eventName - Name of the event (e.g., 'tengu_api_query')
 * @param metadata - Additional metadata for the event (intentionally no strings, to avoid accidentally logging code/filepaths)
 */
async function logEventTo1PAsync(firstPartyEventLogger, eventName, metadata = {}) {
    try {
        // Enrich with core metadata at log time (similar to Statsig pattern)
        const coreMetadata = await (0, metadata_js_1.getEventMetadata)({
            model: metadata.model,
            betas: metadata.betas,
        });
        // Build attributes - OTel supports nested objects natively via AnyValueMap
        // Cast through unknown since our nested objects are structurally compatible
        // with AnyValue but TS doesn't recognize it due to missing index signatures
        const attributes = {
            event_name: eventName,
            event_id: (0, crypto_1.randomUUID)(),
            // Pass objects directly - no JSON serialization needed
            core_metadata: coreMetadata,
            user_metadata: (0, user_js_1.getCoreUserData)(true),
            event_metadata: metadata,
        };
        // Add user_id if available
        const userId = (0, config_js_1.getOrCreateUserID)();
        if (userId) {
            attributes.user_id = userId;
        }
        // Debug logging when debug mode is enabled
        if (process.env.USER_TYPE === 'ant') {
            (0, debug_js_1.logForDebugging)(`[ANT-ONLY] 1P event: ${eventName} ${(0, slowOperations_js_1.jsonStringify)(metadata, null, 0)}`);
        }
        // Emit log record
        firstPartyEventLogger.emit({
            body: eventName,
            attributes,
        });
    }
    catch (e) {
        if (process.env.NODE_ENV === 'development') {
            throw e;
        }
        if (process.env.USER_TYPE === 'ant') {
            (0, log_js_1.logError)(e);
        }
        // swallow
    }
}
/**
 * Log a 1st-party event for internal analytics.
 * Events are batched and exported to /api/event_logging/batch
 *
 * @param eventName - Name of the event (e.g., 'tengu_api_query')
 * @param metadata - Additional metadata for the event (intentionally no strings, to avoid accidentally logging code/filepaths)
 */
function logEventTo1P(eventName, metadata = {}) {
    if (!is1PEventLoggingEnabled()) {
        return;
    }
    if (!firstPartyEventLogger || (0, sinkKillswitch_js_1.isSinkKilled)('firstParty')) {
        return;
    }
    // Fire and forget - don't block on metadata enrichment
    void logEventTo1PAsync(firstPartyEventLogger, eventName, metadata);
}
// api.anthropic.com only serves the "production" GrowthBook environment
// (see starling/starling/cli/cli.py DEFAULT_ENVIRONMENTS). Staging and
// development environments are not exported to the prod API.
function getEnvironmentForGrowthBook() {
    return 'production';
}
/**
 * Log a GrowthBook experiment assignment event to 1P.
 * Events are batched and exported to /api/event_logging/batch
 *
 * @param data - GrowthBook experiment assignment data
 */
function logGrowthBookExperimentTo1P(data) {
    if (!is1PEventLoggingEnabled()) {
        return;
    }
    if (!firstPartyEventLogger || (0, sinkKillswitch_js_1.isSinkKilled)('firstParty')) {
        return;
    }
    const userId = (0, config_js_1.getOrCreateUserID)();
    const { accountUuid, organizationUuid } = (0, user_js_1.getCoreUserData)(true);
    // Build attributes for GrowthbookExperimentEvent
    const attributes = {
        event_type: 'GrowthbookExperimentEvent',
        event_id: (0, crypto_1.randomUUID)(),
        experiment_id: data.experimentId,
        variation_id: data.variationId,
        ...(userId && { device_id: userId }),
        ...(accountUuid && { account_uuid: accountUuid }),
        ...(organizationUuid && { organization_uuid: organizationUuid }),
        ...(data.userAttributes && {
            session_id: data.userAttributes.sessionId,
            user_attributes: (0, slowOperations_js_1.jsonStringify)(data.userAttributes),
        }),
        ...(data.experimentMetadata && {
            experiment_metadata: (0, slowOperations_js_1.jsonStringify)(data.experimentMetadata),
        }),
        environment: getEnvironmentForGrowthBook(),
    };
    if (process.env.USER_TYPE === 'ant') {
        (0, debug_js_1.logForDebugging)(`[ANT-ONLY] 1P GrowthBook experiment: ${data.experimentId} variation=${data.variationId}`);
    }
    firstPartyEventLogger.emit({
        body: 'growthbook_experiment',
        attributes,
    });
}
const DEFAULT_LOGS_EXPORT_INTERVAL_MS = 10000;
const DEFAULT_MAX_EXPORT_BATCH_SIZE = 200;
const DEFAULT_MAX_QUEUE_SIZE = 8192;
/**
 * Initialize 1P event logging infrastructure.
 * This creates a separate LoggerProvider for internal event logging,
 * independent of customer OTLP telemetry.
 *
 * This uses its own minimal resource configuration with just the attributes
 * we need for internal analytics (service name, version, platform info).
 */
function initialize1PEventLogging() {
    (0, startupProfiler_js_1.profileCheckpoint)('1p_event_logging_start');
    const enabled = is1PEventLoggingEnabled();
    if (!enabled) {
        if (process.env.USER_TYPE === 'ant') {
            (0, debug_js_1.logForDebugging)('1P event logging not enabled');
        }
        return;
    }
    // Fetch batch processor configuration from GrowthBook dynamic config
    // Uses cached value if available, refreshes in background
    const batchConfig = getBatchConfig();
    lastBatchConfig = batchConfig;
    (0, startupProfiler_js_1.profileCheckpoint)('1p_event_after_growthbook_config');
    const scheduledDelayMillis = batchConfig.scheduledDelayMillis ||
        parseInt(process.env.OTEL_LOGS_EXPORT_INTERVAL ||
            DEFAULT_LOGS_EXPORT_INTERVAL_MS.toString());
    const maxExportBatchSize = batchConfig.maxExportBatchSize || DEFAULT_MAX_EXPORT_BATCH_SIZE;
    const maxQueueSize = batchConfig.maxQueueSize || DEFAULT_MAX_QUEUE_SIZE;
    // Build our own resource for 1P event logging with minimal attributes
    const platform = (0, platform_js_1.getPlatform)();
    const attributes = {
        [semantic_conventions_1.ATTR_SERVICE_NAME]: 'claude-code',
        [semantic_conventions_1.ATTR_SERVICE_VERSION]: MACRO.VERSION,
    };
    // Add WSL-specific attributes if running on WSL
    if (platform === 'wsl') {
        const wslVersion = (0, platform_js_1.getWslVersion)();
        if (wslVersion) {
            attributes['wsl.version'] = wslVersion;
        }
    }
    const resource = (0, resources_1.resourceFromAttributes)(attributes);
    // Create a new LoggerProvider with the EventLoggingExporter
    // NOTE: This is kept separate from customer telemetry logs to ensure
    // internal events don't leak to customer endpoints and vice versa.
    // We don't register this globally - it's only used for internal event logging.
    const eventLoggingExporter = new firstPartyEventLoggingExporter_js_1.FirstPartyEventLoggingExporter({
        maxBatchSize: maxExportBatchSize,
        skipAuth: batchConfig.skipAuth,
        maxAttempts: batchConfig.maxAttempts,
        path: batchConfig.path,
        baseUrl: batchConfig.baseUrl,
        isKilled: () => (0, sinkKillswitch_js_1.isSinkKilled)('firstParty'),
    });
    firstPartyEventLoggerProvider = new sdk_logs_1.LoggerProvider({
        resource,
        processors: [
            new sdk_logs_1.BatchLogRecordProcessor(eventLoggingExporter, {
                scheduledDelayMillis,
                maxExportBatchSize,
                maxQueueSize,
            }),
        ],
    });
    // Initialize event logger from our internal provider (NOT from global API)
    // IMPORTANT: We must get the logger from our local provider, not logs.getLogger()
    // because logs.getLogger() returns a logger from the global provider, which is
    // separate and used for customer telemetry.
    firstPartyEventLogger = firstPartyEventLoggerProvider.getLogger('com.anthropic.claude_code.events', MACRO.VERSION);
}
/**
 * Rebuild the 1P event logging pipeline if the batch config changed.
 * Register this with onGrowthBookRefresh so long-running sessions pick up
 * changes to batch size, delay, endpoint, etc.
 *
 * Event-loss safety:
 * 1. Null the logger first — concurrent logEventTo1P() calls hit the
 *    !firstPartyEventLogger guard and bail during the swap window. This drops
 *    a handful of events but prevents emitting to a draining provider.
 * 2. forceFlush() drains the old BatchLogRecordProcessor buffer to the
 *    exporter. Export failures go to disk at getCurrentBatchFilePath() which
 *    is keyed by module-level BATCH_UUID + sessionId — unchanged across
 *    reinit — so the NEW exporter's disk-backed retry picks them up.
 * 3. Swap to new provider/logger; old provider shutdown runs in background
 *    (buffer already drained, just cleanup).
 */
async function reinitialize1PEventLoggingIfConfigChanged() {
    if (!is1PEventLoggingEnabled() || !firstPartyEventLoggerProvider) {
        return;
    }
    const newConfig = getBatchConfig();
    if ((0, lodash_es_1.isEqual)(newConfig, lastBatchConfig)) {
        return;
    }
    if (process.env.USER_TYPE === 'ant') {
        (0, debug_js_1.logForDebugging)(`1P event logging: ${BATCH_CONFIG_NAME} changed, reinitializing`);
    }
    const oldProvider = firstPartyEventLoggerProvider;
    const oldLogger = firstPartyEventLogger;
    firstPartyEventLogger = null;
    try {
        await oldProvider.forceFlush();
    }
    catch {
        // Export failures are already on disk; new exporter will retry them.
    }
    firstPartyEventLoggerProvider = null;
    try {
        initialize1PEventLogging();
    }
    catch (e) {
        // Restore so the next GrowthBook refresh can retry. oldProvider was
        // only forceFlush()'d, not shut down — it's still functional. Without
        // this, both stay null and the !firstPartyEventLoggerProvider gate at
        // the top makes recovery impossible.
        firstPartyEventLoggerProvider = oldProvider;
        firstPartyEventLogger = oldLogger;
        (0, log_js_1.logError)(e);
        return;
    }
    void oldProvider.shutdown().catch(() => { });
}
