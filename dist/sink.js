"use strict";
/**
 * Analytics sink implementation
 *
 * This module contains the actual analytics routing logic and should be
 * initialized during app startup. It routes events to Datadog and 1P event
 * logging.
 *
 * Usage: Call initializeAnalyticsSink() during app startup to attach the sink.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeAnalyticsGates = initializeAnalyticsGates;
exports.initializeAnalyticsSink = initializeAnalyticsSink;
const datadog_js_1 = require("./datadog.js");
const firstPartyEventLogger_js_1 = require("./firstPartyEventLogger.js");
const growthbook_js_1 = require("./growthbook.js");
const index_js_1 = require("./index.js");
const sinkKillswitch_js_1 = require("./sinkKillswitch.js");
const DATADOG_GATE_NAME = 'tengu_log_datadog_events';
// Module-level gate state - starts undefined, initialized during startup
let isDatadogGateEnabled = undefined;
/**
 * Check if Datadog tracking is enabled.
 * Falls back to cached value from previous session if not yet initialized.
 */
function shouldTrackDatadog() {
    if ((0, sinkKillswitch_js_1.isSinkKilled)('datadog')) {
        return false;
    }
    if (isDatadogGateEnabled !== undefined) {
        return isDatadogGateEnabled;
    }
    // Fallback to cached value from previous session
    try {
        return (0, growthbook_js_1.checkStatsigFeatureGate_CACHED_MAY_BE_STALE)(DATADOG_GATE_NAME);
    }
    catch {
        return false;
    }
}
/**
 * Log an event (synchronous implementation)
 */
function logEventImpl(eventName, metadata) {
    // Check if this event should be sampled
    const sampleResult = (0, firstPartyEventLogger_js_1.shouldSampleEvent)(eventName);
    // If sample result is 0, the event was not selected for logging
    if (sampleResult === 0) {
        return;
    }
    // If sample result is a positive number, add it to metadata
    const metadataWithSampleRate = sampleResult !== null
        ? { ...metadata, sample_rate: sampleResult }
        : metadata;
    if (shouldTrackDatadog()) {
        // Datadog is a general-access backend — strip _PROTO_* keys
        // (unredacted PII-tagged values meant only for the 1P privileged column).
        void (0, datadog_js_1.trackDatadogEvent)(eventName, (0, index_js_1.stripProtoFields)(metadataWithSampleRate));
    }
    // 1P receives the full payload including _PROTO_* — the exporter
    // destructures and routes those keys to proto fields itself.
    (0, firstPartyEventLogger_js_1.logEventTo1P)(eventName, metadataWithSampleRate);
}
/**
 * Log an event (asynchronous implementation)
 *
 * With Segment removed the two remaining sinks are fire-and-forget, so this
 * just wraps the sync impl — kept to preserve the sink interface contract.
 */
function logEventAsyncImpl(eventName, metadata) {
    logEventImpl(eventName, metadata);
    return Promise.resolve();
}
/**
 * Initialize analytics gates during startup.
 *
 * Updates gate values from server. Early events use cached values from previous
 * session to avoid data loss during initialization.
 *
 * Called from main.tsx during setupBackend().
 */
function initializeAnalyticsGates() {
    isDatadogGateEnabled =
        (0, growthbook_js_1.checkStatsigFeatureGate_CACHED_MAY_BE_STALE)(DATADOG_GATE_NAME);
}
/**
 * Initialize the analytics sink.
 *
 * Call this during app startup to attach the analytics backend.
 * Any events logged before this is called will be queued and drained.
 *
 * Idempotent: safe to call multiple times (subsequent calls are no-ops).
 */
function initializeAnalyticsSink() {
    (0, index_js_1.attachAnalyticsSink)({
        logEvent: logEventImpl,
        logEventAsync: logEventAsyncImpl,
    });
}
