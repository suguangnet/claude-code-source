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
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapTelemetry = bootstrapTelemetry;
exports.parseExporterTypes = parseExporterTypes;
exports.isTelemetryEnabled = isTelemetryEnabled;
exports.initializeTelemetry = initializeTelemetry;
exports.flushTelemetry = flushTelemetry;
const api_1 = require("@opentelemetry/api");
const api_logs_1 = require("@opentelemetry/api-logs");
// OTLP/Prometheus exporters are dynamically imported inside the protocol
// switch statements below. A process uses at most one protocol variant per
// signal, but static imports would load all 6 (~1.2MB) on every startup.
const resources_1 = require("@opentelemetry/resources");
const sdk_logs_1 = require("@opentelemetry/sdk-logs");
const sdk_metrics_1 = require("@opentelemetry/sdk-metrics");
const sdk_trace_base_1 = require("@opentelemetry/sdk-trace-base");
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
const https_proxy_agent_1 = require("https-proxy-agent");
const state_js_1 = require("src/bootstrap/state.js");
const auth_js_1 = require("src/utils/auth.js");
const platform_js_1 = require("src/utils/platform.js");
const caCerts_js_1 = require("../caCerts.js");
const cleanupRegistry_js_1 = require("../cleanupRegistry.js");
const debug_js_1 = require("../debug.js");
const envUtils_js_1 = require("../envUtils.js");
const errors_js_1 = require("../errors.js");
const mtls_js_1 = require("../mtls.js");
const proxy_js_1 = require("../proxy.js");
const settings_js_1 = require("../settings/settings.js");
const slowOperations_js_1 = require("../slowOperations.js");
const startupProfiler_js_1 = require("../startupProfiler.js");
const betaSessionTracing_js_1 = require("./betaSessionTracing.js");
const bigqueryExporter_js_1 = require("./bigqueryExporter.js");
const logger_js_1 = require("./logger.js");
const perfettoTracing_js_1 = require("./perfettoTracing.js");
const sessionTracing_js_1 = require("./sessionTracing.js");
const DEFAULT_METRICS_EXPORT_INTERVAL_MS = 60000;
const DEFAULT_LOGS_EXPORT_INTERVAL_MS = 5000;
const DEFAULT_TRACES_EXPORT_INTERVAL_MS = 5000;
class TelemetryTimeoutError extends Error {
}
function telemetryTimeout(ms, message) {
    return new Promise((_, reject) => {
        setTimeout((rej, msg) => rej(new TelemetryTimeoutError(msg)), ms, reject, message).unref();
    });
}
function bootstrapTelemetry() {
    if (process.env.USER_TYPE === 'ant') {
        // Read from ANT_ prefixed variables that are defined at build time
        if (process.env.ANT_OTEL_METRICS_EXPORTER) {
            process.env.OTEL_METRICS_EXPORTER = process.env.ANT_OTEL_METRICS_EXPORTER;
        }
        if (process.env.ANT_OTEL_LOGS_EXPORTER) {
            process.env.OTEL_LOGS_EXPORTER = process.env.ANT_OTEL_LOGS_EXPORTER;
        }
        if (process.env.ANT_OTEL_TRACES_EXPORTER) {
            process.env.OTEL_TRACES_EXPORTER = process.env.ANT_OTEL_TRACES_EXPORTER;
        }
        if (process.env.ANT_OTEL_EXPORTER_OTLP_PROTOCOL) {
            process.env.OTEL_EXPORTER_OTLP_PROTOCOL =
                process.env.ANT_OTEL_EXPORTER_OTLP_PROTOCOL;
        }
        if (process.env.ANT_OTEL_EXPORTER_OTLP_ENDPOINT) {
            process.env.OTEL_EXPORTER_OTLP_ENDPOINT =
                process.env.ANT_OTEL_EXPORTER_OTLP_ENDPOINT;
        }
        if (process.env.ANT_OTEL_EXPORTER_OTLP_HEADERS) {
            process.env.OTEL_EXPORTER_OTLP_HEADERS =
                process.env.ANT_OTEL_EXPORTER_OTLP_HEADERS;
        }
    }
    // Set default tempoality to 'delta' because it's the more sane default
    if (!process.env.OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE) {
        process.env.OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE = 'delta';
    }
}
// Per OTEL spec, "none" means "no automatically configured exporter for this signal".
// https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/#exporter-selection
function parseExporterTypes(value) {
    return (value || '')
        .trim()
        .split(',')
        .filter(Boolean)
        .map(t => t.trim())
        .filter(t => t !== 'none');
}
async function getOtlpReaders() {
    const exporterTypes = parseExporterTypes(process.env.OTEL_METRICS_EXPORTER);
    const exportInterval = parseInt(process.env.OTEL_METRIC_EXPORT_INTERVAL ||
        DEFAULT_METRICS_EXPORT_INTERVAL_MS.toString());
    const exporters = [];
    for (const exporterType of exporterTypes) {
        if (exporterType === 'console') {
            // Custom console exporter that shows resource attributes
            const consoleExporter = new sdk_metrics_1.ConsoleMetricExporter();
            const originalExport = consoleExporter.export.bind(consoleExporter);
            consoleExporter.export = (metrics, callback) => {
                // Log resource attributes once at the start
                if (metrics.resource && metrics.resource.attributes) {
                    // The console exporter is for debugging, so console output is intentional here
                    (0, debug_js_1.logForDebugging)('\n=== Resource Attributes ===');
                    (0, debug_js_1.logForDebugging)((0, slowOperations_js_1.jsonStringify)(metrics.resource.attributes));
                    (0, debug_js_1.logForDebugging)('===========================\n');
                }
                return originalExport(metrics, callback);
            };
            exporters.push(consoleExporter);
        }
        else if (exporterType === 'otlp') {
            const protocol = process.env.OTEL_EXPORTER_OTLP_METRICS_PROTOCOL?.trim() ||
                process.env.OTEL_EXPORTER_OTLP_PROTOCOL?.trim();
            const httpConfig = getOTLPExporterConfig();
            switch (protocol) {
                case 'grpc': {
                    // Lazy-import to keep @grpc/grpc-js (~700KB) out of the telemetry chunk
                    // when the protocol is http/protobuf (ant default) or http/json.
                    const { OTLPMetricExporter } = await Promise.resolve().then(() => __importStar(require('@opentelemetry/exporter-metrics-otlp-grpc')));
                    exporters.push(new OTLPMetricExporter());
                    break;
                }
                case 'http/json': {
                    const { OTLPMetricExporter } = await Promise.resolve().then(() => __importStar(require('@opentelemetry/exporter-metrics-otlp-http')));
                    exporters.push(new OTLPMetricExporter(httpConfig));
                    break;
                }
                case 'http/protobuf': {
                    const { OTLPMetricExporter } = await Promise.resolve().then(() => __importStar(require('@opentelemetry/exporter-metrics-otlp-proto')));
                    exporters.push(new OTLPMetricExporter(httpConfig));
                    break;
                }
                default:
                    throw new Error(`Unknown protocol set in OTEL_EXPORTER_OTLP_METRICS_PROTOCOL or OTEL_EXPORTER_OTLP_PROTOCOL env var: ${protocol}`);
            }
        }
        else if (exporterType === 'prometheus') {
            const { PrometheusExporter } = await Promise.resolve().then(() => __importStar(require('@opentelemetry/exporter-prometheus')));
            exporters.push(new PrometheusExporter());
        }
        else {
            throw new Error(`Unknown exporter type set in OTEL_EXPORTER_OTLP_METRICS_PROTOCOL or OTEL_EXPORTER_OTLP_PROTOCOL env var: ${exporterType}`);
        }
    }
    return exporters.map(exporter => {
        if ('export' in exporter) {
            return new sdk_metrics_1.PeriodicExportingMetricReader({
                exporter,
                exportIntervalMillis: exportInterval,
            });
        }
        return exporter;
    });
}
async function getOtlpLogExporters() {
    const exporterTypes = parseExporterTypes(process.env.OTEL_LOGS_EXPORTER);
    const protocol = process.env.OTEL_EXPORTER_OTLP_LOGS_PROTOCOL?.trim() ||
        process.env.OTEL_EXPORTER_OTLP_PROTOCOL?.trim();
    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    (0, debug_js_1.logForDebugging)(`[3P telemetry] getOtlpLogExporters: types=${(0, slowOperations_js_1.jsonStringify)(exporterTypes)}, protocol=${protocol}, endpoint=${endpoint}`);
    const exporters = [];
    for (const exporterType of exporterTypes) {
        if (exporterType === 'console') {
            exporters.push(new sdk_logs_1.ConsoleLogRecordExporter());
        }
        else if (exporterType === 'otlp') {
            const httpConfig = getOTLPExporterConfig();
            switch (protocol) {
                case 'grpc': {
                    const { OTLPLogExporter } = await Promise.resolve().then(() => __importStar(require('@opentelemetry/exporter-logs-otlp-grpc')));
                    exporters.push(new OTLPLogExporter());
                    break;
                }
                case 'http/json': {
                    const { OTLPLogExporter } = await Promise.resolve().then(() => __importStar(require('@opentelemetry/exporter-logs-otlp-http')));
                    exporters.push(new OTLPLogExporter(httpConfig));
                    break;
                }
                case 'http/protobuf': {
                    const { OTLPLogExporter } = await Promise.resolve().then(() => __importStar(require('@opentelemetry/exporter-logs-otlp-proto')));
                    exporters.push(new OTLPLogExporter(httpConfig));
                    break;
                }
                default:
                    throw new Error(`Unknown protocol set in OTEL_EXPORTER_OTLP_LOGS_PROTOCOL or OTEL_EXPORTER_OTLP_PROTOCOL env var: ${protocol}`);
            }
        }
        else {
            throw new Error(`Unknown exporter type set in OTEL_LOGS_EXPORTER env var: ${exporterType}`);
        }
    }
    return exporters;
}
async function getOtlpTraceExporters() {
    const exporterTypes = parseExporterTypes(process.env.OTEL_TRACES_EXPORTER);
    const exporters = [];
    for (const exporterType of exporterTypes) {
        if (exporterType === 'console') {
            exporters.push(new sdk_trace_base_1.ConsoleSpanExporter());
        }
        else if (exporterType === 'otlp') {
            const protocol = process.env.OTEL_EXPORTER_OTLP_TRACES_PROTOCOL?.trim() ||
                process.env.OTEL_EXPORTER_OTLP_PROTOCOL?.trim();
            const httpConfig = getOTLPExporterConfig();
            switch (protocol) {
                case 'grpc': {
                    const { OTLPTraceExporter } = await Promise.resolve().then(() => __importStar(require('@opentelemetry/exporter-trace-otlp-grpc')));
                    exporters.push(new OTLPTraceExporter());
                    break;
                }
                case 'http/json': {
                    const { OTLPTraceExporter } = await Promise.resolve().then(() => __importStar(require('@opentelemetry/exporter-trace-otlp-http')));
                    exporters.push(new OTLPTraceExporter(httpConfig));
                    break;
                }
                case 'http/protobuf': {
                    const { OTLPTraceExporter } = await Promise.resolve().then(() => __importStar(require('@opentelemetry/exporter-trace-otlp-proto')));
                    exporters.push(new OTLPTraceExporter(httpConfig));
                    break;
                }
                default:
                    throw new Error(`Unknown protocol set in OTEL_EXPORTER_OTLP_TRACES_PROTOCOL or OTEL_EXPORTER_OTLP_PROTOCOL env var: ${protocol}`);
            }
        }
        else {
            throw new Error(`Unknown exporter type set in OTEL_TRACES_EXPORTER env var: ${exporterType}`);
        }
    }
    return exporters;
}
function isTelemetryEnabled() {
    return (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_ENABLE_TELEMETRY);
}
function getBigQueryExportingReader() {
    const bigqueryExporter = new bigqueryExporter_js_1.BigQueryMetricsExporter();
    return new sdk_metrics_1.PeriodicExportingMetricReader({
        exporter: bigqueryExporter,
        exportIntervalMillis: 5 * 60 * 1000, // 5mins for BigQuery metrics exporter to reduce load
    });
}
function isBigQueryMetricsEnabled() {
    // BigQuery metrics are enabled for:
    // 1. API customers (excluding Claude.ai subscribers and Bedrock/Vertex)
    // 2. Claude for Enterprise (C4E) users
    // 3. Claude for Teams users
    const subscriptionType = (0, auth_js_1.getSubscriptionType)();
    const isC4EOrTeamUser = (0, auth_js_1.isClaudeAISubscriber)() &&
        (subscriptionType === 'enterprise' || subscriptionType === 'team');
    return (0, auth_js_1.is1PApiCustomer)() || isC4EOrTeamUser;
}
/**
 * Initialize beta tracing - a separate code path for detailed debugging.
 * Uses BETA_TRACING_ENDPOINT instead of OTEL_EXPORTER_OTLP_ENDPOINT.
 */
async function initializeBetaTracing(resource) {
    const endpoint = process.env.BETA_TRACING_ENDPOINT;
    if (!endpoint) {
        return;
    }
    const [{ OTLPTraceExporter }, { OTLPLogExporter }] = await Promise.all([
        Promise.resolve().then(() => __importStar(require('@opentelemetry/exporter-trace-otlp-http'))),
        Promise.resolve().then(() => __importStar(require('@opentelemetry/exporter-logs-otlp-http'))),
    ]);
    const httpConfig = {
        url: `${endpoint}/v1/traces`,
    };
    const logHttpConfig = {
        url: `${endpoint}/v1/logs`,
    };
    // Initialize trace exporter
    const traceExporter = new OTLPTraceExporter(httpConfig);
    const spanProcessor = new sdk_trace_base_1.BatchSpanProcessor(traceExporter, {
        scheduledDelayMillis: DEFAULT_TRACES_EXPORT_INTERVAL_MS,
    });
    const tracerProvider = new sdk_trace_base_1.BasicTracerProvider({
        resource,
        spanProcessors: [spanProcessor],
    });
    api_1.trace.setGlobalTracerProvider(tracerProvider);
    (0, state_js_1.setTracerProvider)(tracerProvider);
    // Initialize log exporter
    const logExporter = new OTLPLogExporter(logHttpConfig);
    const loggerProvider = new sdk_logs_1.LoggerProvider({
        resource,
        processors: [
            new sdk_logs_1.BatchLogRecordProcessor(logExporter, {
                scheduledDelayMillis: DEFAULT_LOGS_EXPORT_INTERVAL_MS,
            }),
        ],
    });
    api_logs_1.logs.setGlobalLoggerProvider(loggerProvider);
    (0, state_js_1.setLoggerProvider)(loggerProvider);
    // Initialize event logger
    const eventLogger = api_logs_1.logs.getLogger('com.anthropic.claude_code.events', MACRO.VERSION);
    (0, state_js_1.setEventLogger)(eventLogger);
    // Setup flush handlers - flush both logs AND traces
    process.on('beforeExit', async () => {
        await loggerProvider?.forceFlush();
        await tracerProvider?.forceFlush();
    });
    process.on('exit', () => {
        void loggerProvider?.forceFlush();
        void tracerProvider?.forceFlush();
    });
}
async function initializeTelemetry() {
    (0, startupProfiler_js_1.profileCheckpoint)('telemetry_init_start');
    bootstrapTelemetry();
    // Console exporters call console.dir on a timer (5s logs/traces, 60s
    // metrics), writing pretty-printed objects to stdout. In stream-json
    // mode stdout is the SDK message channel; the first line (`{`) breaks
    // the SDK's line reader. Stripped here (not main.tsx) because init.ts
    // re-runs applyConfigEnvironmentVariables() inside initializeTelemetry-
    // AfterTrust for remote-managed-settings users, and bootstrapTelemetry
    // above copies ANT_OTEL_* for ant users — both would undo an earlier strip.
    if ((0, debug_js_1.getHasFormattedOutput)()) {
        for (const key of [
            'OTEL_METRICS_EXPORTER',
            'OTEL_LOGS_EXPORTER',
            'OTEL_TRACES_EXPORTER',
        ]) {
            const v = process.env[key];
            if (v?.includes('console')) {
                process.env[key] = v
                    .split(',')
                    .map(s => s.trim())
                    .filter(s => s !== 'console')
                    .join(',');
            }
        }
    }
    api_1.diag.setLogger(new logger_js_1.ClaudeCodeDiagLogger(), api_1.DiagLogLevel.ERROR);
    // Initialize Perfetto tracing (independent of OTEL)
    // Enable via CLAUDE_CODE_PERFETTO_TRACE=1 or CLAUDE_CODE_PERFETTO_TRACE=<path>
    (0, perfettoTracing_js_1.initializePerfettoTracing)();
    const readers = [];
    // Add customer exporters (if enabled)
    const telemetryEnabled = isTelemetryEnabled();
    (0, debug_js_1.logForDebugging)(`[3P telemetry] isTelemetryEnabled=${telemetryEnabled} (CLAUDE_CODE_ENABLE_TELEMETRY=${process.env.CLAUDE_CODE_ENABLE_TELEMETRY})`);
    if (telemetryEnabled) {
        readers.push(...(await getOtlpReaders()));
    }
    // Add BigQuery exporter (for API customers, C4E users, and internal users)
    if (isBigQueryMetricsEnabled()) {
        readers.push(getBigQueryExportingReader());
    }
    // Create base resource with service attributes
    const platform = (0, platform_js_1.getPlatform)();
    const baseAttributes = {
        [semantic_conventions_1.ATTR_SERVICE_NAME]: 'claude-code',
        [semantic_conventions_1.ATTR_SERVICE_VERSION]: MACRO.VERSION,
    };
    // Add WSL-specific attributes if running on WSL
    if (platform === 'wsl') {
        const wslVersion = (0, platform_js_1.getWslVersion)();
        if (wslVersion) {
            baseAttributes['wsl.version'] = wslVersion;
        }
    }
    const baseResource = (0, resources_1.resourceFromAttributes)(baseAttributes);
    // Use OpenTelemetry detectors
    const osResource = (0, resources_1.resourceFromAttributes)(resources_1.osDetector.detect().attributes || {});
    // Extract only host.arch from hostDetector
    const hostDetected = resources_1.hostDetector.detect();
    const hostArchAttributes = hostDetected.attributes?.[semantic_conventions_1.SEMRESATTRS_HOST_ARCH]
        ? {
            [semantic_conventions_1.SEMRESATTRS_HOST_ARCH]: hostDetected.attributes[semantic_conventions_1.SEMRESATTRS_HOST_ARCH],
        }
        : {};
    const hostArchResource = (0, resources_1.resourceFromAttributes)(hostArchAttributes);
    const envResource = (0, resources_1.resourceFromAttributes)(resources_1.envDetector.detect().attributes || {});
    // Merge resources - later resources take precedence
    const resource = baseResource
        .merge(osResource)
        .merge(hostArchResource)
        .merge(envResource);
    // Check if beta tracing is enabled - this is a separate code path
    // Available to all users who set ENABLE_BETA_TRACING_DETAILED=1 and BETA_TRACING_ENDPOINT
    if ((0, betaSessionTracing_js_1.isBetaTracingEnabled)()) {
        void initializeBetaTracing(resource).catch(e => (0, debug_js_1.logForDebugging)(`Beta tracing init failed: ${e}`, { level: 'error' }));
        // Still set up meter provider for metrics (but skip regular logs/traces setup)
        const meterProvider = new sdk_metrics_1.MeterProvider({
            resource,
            views: [],
            readers,
        });
        (0, state_js_1.setMeterProvider)(meterProvider);
        // Register shutdown for beta tracing
        const shutdownTelemetry = async () => {
            const timeoutMs = parseInt(process.env.CLAUDE_CODE_OTEL_SHUTDOWN_TIMEOUT_MS || '2000');
            try {
                (0, sessionTracing_js_1.endInteractionSpan)();
                // Force flush + shutdown together inside the timeout. Previously forceFlush
                // was awaited unbounded BEFORE the race, blocking exit on slow OTLP endpoints.
                // Each provider's flush→shutdown is chained independently so a slow logger
                // flush doesn't delay meterProvider/tracerProvider shutdown (no waterfall).
                const loggerProvider = (0, state_js_1.getLoggerProvider)();
                const tracerProvider = (0, state_js_1.getTracerProvider)();
                const chains = [meterProvider.shutdown()];
                if (loggerProvider) {
                    chains.push(loggerProvider.forceFlush().then(() => loggerProvider.shutdown()));
                }
                if (tracerProvider) {
                    chains.push(tracerProvider.forceFlush().then(() => tracerProvider.shutdown()));
                }
                await Promise.race([
                    Promise.all(chains),
                    telemetryTimeout(timeoutMs, 'OpenTelemetry shutdown timeout'),
                ]);
            }
            catch {
                // Ignore shutdown errors
            }
        };
        (0, cleanupRegistry_js_1.registerCleanup)(shutdownTelemetry);
        return meterProvider.getMeter('com.anthropic.claude_code', MACRO.VERSION);
    }
    const meterProvider = new sdk_metrics_1.MeterProvider({
        resource,
        views: [],
        readers,
    });
    // Store reference in state for flushing
    (0, state_js_1.setMeterProvider)(meterProvider);
    // Initialize logs if telemetry is enabled
    if (telemetryEnabled) {
        const logExporters = await getOtlpLogExporters();
        (0, debug_js_1.logForDebugging)(`[3P telemetry] Created ${logExporters.length} log exporter(s)`);
        if (logExporters.length > 0) {
            const loggerProvider = new sdk_logs_1.LoggerProvider({
                resource,
                // Add batch processors for each exporter
                processors: logExporters.map(exporter => new sdk_logs_1.BatchLogRecordProcessor(exporter, {
                    scheduledDelayMillis: parseInt(process.env.OTEL_LOGS_EXPORT_INTERVAL ||
                        DEFAULT_LOGS_EXPORT_INTERVAL_MS.toString()),
                })),
            });
            // Register the logger provider globally
            api_logs_1.logs.setGlobalLoggerProvider(loggerProvider);
            (0, state_js_1.setLoggerProvider)(loggerProvider);
            // Initialize event logger
            const eventLogger = api_logs_1.logs.getLogger('com.anthropic.claude_code.events', MACRO.VERSION);
            (0, state_js_1.setEventLogger)(eventLogger);
            (0, debug_js_1.logForDebugging)('[3P telemetry] Event logger set successfully');
            // 'beforeExit' is emitted when Node.js empties its event loop and has no additional work to schedule.
            // Unlike 'exit', it allows us to perform async operations, so it works well for letting
            // network requests complete before the process exits naturally.
            process.on('beforeExit', async () => {
                await loggerProvider?.forceFlush();
                // Also flush traces - they use BatchSpanProcessor which needs explicit flush
                const tracerProvider = (0, state_js_1.getTracerProvider)();
                await tracerProvider?.forceFlush();
            });
            process.on('exit', () => {
                // Final attempt to flush logs and traces
                void loggerProvider?.forceFlush();
                void (0, state_js_1.getTracerProvider)()?.forceFlush();
            });
        }
    }
    // Initialize tracing if enhanced telemetry is enabled (BETA)
    if (telemetryEnabled && (0, sessionTracing_js_1.isEnhancedTelemetryEnabled)()) {
        const traceExporters = await getOtlpTraceExporters();
        if (traceExporters.length > 0) {
            // Create span processors for each exporter
            const spanProcessors = traceExporters.map(exporter => new sdk_trace_base_1.BatchSpanProcessor(exporter, {
                scheduledDelayMillis: parseInt(process.env.OTEL_TRACES_EXPORT_INTERVAL ||
                    DEFAULT_TRACES_EXPORT_INTERVAL_MS.toString()),
            }));
            const tracerProvider = new sdk_trace_base_1.BasicTracerProvider({
                resource,
                spanProcessors,
            });
            // Register the tracer provider globally
            api_1.trace.setGlobalTracerProvider(tracerProvider);
            (0, state_js_1.setTracerProvider)(tracerProvider);
        }
    }
    // Shutdown metrics and logs on exit (flushes and closes exporters)
    const shutdownTelemetry = async () => {
        const timeoutMs = parseInt(process.env.CLAUDE_CODE_OTEL_SHUTDOWN_TIMEOUT_MS || '2000');
        try {
            // End any active interaction span before shutdown
            (0, sessionTracing_js_1.endInteractionSpan)();
            const shutdownPromises = [meterProvider.shutdown()];
            const loggerProvider = (0, state_js_1.getLoggerProvider)();
            if (loggerProvider) {
                shutdownPromises.push(loggerProvider.shutdown());
            }
            const tracerProvider = (0, state_js_1.getTracerProvider)();
            if (tracerProvider) {
                shutdownPromises.push(tracerProvider.shutdown());
            }
            await Promise.race([
                Promise.all(shutdownPromises),
                telemetryTimeout(timeoutMs, 'OpenTelemetry shutdown timeout'),
            ]);
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('timeout')) {
                (0, debug_js_1.logForDebugging)(`
OpenTelemetry telemetry flush timed out after ${timeoutMs}ms

To resolve this issue, you can:
1. Increase the timeout by setting CLAUDE_CODE_OTEL_SHUTDOWN_TIMEOUT_MS env var (e.g., 5000 for 5 seconds)
2. Check if your OpenTelemetry backend is experiencing scalability issues
3. Disable OpenTelemetry by unsetting CLAUDE_CODE_ENABLE_TELEMETRY env var

Current timeout: ${timeoutMs}ms
`, { level: 'error' });
            }
            throw error;
        }
    };
    // Always register shutdown (internal metrics are always enabled)
    (0, cleanupRegistry_js_1.registerCleanup)(shutdownTelemetry);
    return meterProvider.getMeter('com.anthropic.claude_code', MACRO.VERSION);
}
/**
 * Flush all pending telemetry data immediately.
 * This should be called before logout or org switching to prevent data leakage.
 */
async function flushTelemetry() {
    const meterProvider = (0, state_js_1.getMeterProvider)();
    if (!meterProvider) {
        return;
    }
    const timeoutMs = parseInt(process.env.CLAUDE_CODE_OTEL_FLUSH_TIMEOUT_MS || '5000');
    try {
        const flushPromises = [meterProvider.forceFlush()];
        const loggerProvider = (0, state_js_1.getLoggerProvider)();
        if (loggerProvider) {
            flushPromises.push(loggerProvider.forceFlush());
        }
        const tracerProvider = (0, state_js_1.getTracerProvider)();
        if (tracerProvider) {
            flushPromises.push(tracerProvider.forceFlush());
        }
        await Promise.race([
            Promise.all(flushPromises),
            telemetryTimeout(timeoutMs, 'OpenTelemetry flush timeout'),
        ]);
        (0, debug_js_1.logForDebugging)('Telemetry flushed successfully');
    }
    catch (error) {
        if (error instanceof TelemetryTimeoutError) {
            (0, debug_js_1.logForDebugging)(`Telemetry flush timed out after ${timeoutMs}ms. Some metrics may not be exported.`, { level: 'warn' });
        }
        else {
            (0, debug_js_1.logForDebugging)(`Telemetry flush failed: ${(0, errors_js_1.errorMessage)(error)}`, {
                level: 'error',
            });
        }
        // Don't throw - allow logout to continue even if flush fails
    }
}
function parseOtelHeadersEnvVar() {
    const headers = {};
    const envHeaders = process.env.OTEL_EXPORTER_OTLP_HEADERS;
    if (envHeaders) {
        for (const pair of envHeaders.split(',')) {
            const [key, ...valueParts] = pair.split('=');
            if (key && valueParts.length > 0) {
                headers[key.trim()] = valueParts.join('=').trim();
            }
        }
    }
    return headers;
}
/**
 * Get configuration for OTLP exporters including:
 * - HTTP agent options (proxy, mTLS)
 * - Dynamic headers via otelHeadersHelper or static headers from env var
 */
function getOTLPExporterConfig() {
    const proxyUrl = (0, proxy_js_1.getProxyUrl)();
    const mtlsConfig = (0, mtls_js_1.getMTLSConfig)();
    const settings = (0, settings_js_1.getSettings_DEPRECATED)();
    // Build base config
    const config = {};
    // Parse static headers from env var once (doesn't change at runtime)
    const staticHeaders = parseOtelHeadersEnvVar();
    // If otelHeadersHelper is configured, use async headers function for dynamic refresh
    // Otherwise just return static headers if any exist
    if (settings?.otelHeadersHelper) {
        config.headers = async () => {
            const dynamicHeaders = (0, auth_js_1.getOtelHeadersFromHelper)();
            return { ...staticHeaders, ...dynamicHeaders };
        };
    }
    else if (Object.keys(staticHeaders).length > 0) {
        config.headers = async () => staticHeaders;
    }
    // Check if we should bypass proxy for OTEL endpoint
    const otelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    if (!proxyUrl || (otelEndpoint && (0, proxy_js_1.shouldBypassProxy)(otelEndpoint))) {
        // No proxy configured or OTEL endpoint should bypass proxy
        const caCerts = (0, caCerts_js_1.getCACertificates)();
        if (mtlsConfig || caCerts) {
            config.httpAgentOptions = {
                ...mtlsConfig,
                ...(caCerts && { ca: caCerts }),
            };
        }
        return config;
    }
    // Return an HttpAgentFactory function that creates our proxy agent
    const caCerts = (0, caCerts_js_1.getCACertificates)();
    const agentFactory = (_protocol) => {
        // Create and return the proxy agent with mTLS and CA cert config
        const proxyAgent = mtlsConfig || caCerts
            ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl, {
                ...(mtlsConfig && {
                    cert: mtlsConfig.cert,
                    key: mtlsConfig.key,
                    passphrase: mtlsConfig.passphrase,
                }),
                ...(caCerts && { ca: caCerts }),
            })
            : new https_proxy_agent_1.HttpsProxyAgent(proxyUrl);
        return proxyAgent;
    };
    config.httpAgentOptions = agentFactory;
    return config;
}
