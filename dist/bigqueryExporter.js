"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BigQueryMetricsExporter = void 0;
const core_1 = require("@opentelemetry/core");
const sdk_metrics_1 = require("@opentelemetry/sdk-metrics");
const axios_1 = __importDefault(require("axios"));
const metricsOptOut_js_1 = require("src/services/api/metricsOptOut.js");
const state_js_1 = require("../../bootstrap/state.js");
const auth_js_1 = require("../auth.js");
const config_js_1 = require("../config.js");
const debug_js_1 = require("../debug.js");
const errors_js_1 = require("../errors.js");
const http_js_1 = require("../http.js");
const log_js_1 = require("../log.js");
const slowOperations_js_1 = require("../slowOperations.js");
const userAgent_js_1 = require("../userAgent.js");
class BigQueryMetricsExporter {
    constructor(options = {}) {
        this.pendingExports = [];
        this.isShutdown = false;
        const defaultEndpoint = 'https://api.anthropic.com/api/claude_code/metrics';
        if (process.env.USER_TYPE === 'ant' &&
            process.env.ANT_CLAUDE_CODE_METRICS_ENDPOINT) {
            this.endpoint =
                process.env.ANT_CLAUDE_CODE_METRICS_ENDPOINT +
                    '/api/claude_code/metrics';
        }
        else {
            this.endpoint = defaultEndpoint;
        }
        this.timeout = options.timeout || 5000;
    }
    async export(metrics, resultCallback) {
        if (this.isShutdown) {
            resultCallback({
                code: core_1.ExportResultCode.FAILED,
                error: new Error('Exporter has been shutdown'),
            });
            return;
        }
        const exportPromise = this.doExport(metrics, resultCallback);
        this.pendingExports.push(exportPromise);
        // Clean up completed exports
        void exportPromise.finally(() => {
            const index = this.pendingExports.indexOf(exportPromise);
            if (index > -1) {
                void this.pendingExports.splice(index, 1);
            }
        });
    }
    async doExport(metrics, resultCallback) {
        try {
            // Skip if trust not established in interactive mode
            // This prevents triggering apiKeyHelper before trust dialog
            const hasTrust = (0, config_js_1.checkHasTrustDialogAccepted)() || (0, state_js_1.getIsNonInteractiveSession)();
            if (!hasTrust) {
                (0, debug_js_1.logForDebugging)('BigQuery metrics export: trust not established, skipping');
                resultCallback({ code: core_1.ExportResultCode.SUCCESS });
                return;
            }
            // Check organization-level metrics opt-out
            const metricsStatus = await (0, metricsOptOut_js_1.checkMetricsEnabled)();
            if (!metricsStatus.enabled) {
                (0, debug_js_1.logForDebugging)('Metrics export disabled by organization setting');
                resultCallback({ code: core_1.ExportResultCode.SUCCESS });
                return;
            }
            const payload = this.transformMetricsForInternal(metrics);
            const authResult = (0, http_js_1.getAuthHeaders)();
            if (authResult.error) {
                (0, debug_js_1.logForDebugging)(`Metrics export failed: ${authResult.error}`);
                resultCallback({
                    code: core_1.ExportResultCode.FAILED,
                    error: new Error(authResult.error),
                });
                return;
            }
            const headers = {
                'Content-Type': 'application/json',
                'User-Agent': (0, userAgent_js_1.getClaudeCodeUserAgent)(),
                ...authResult.headers,
            };
            const response = await axios_1.default.post(this.endpoint, payload, {
                timeout: this.timeout,
                headers,
            });
            (0, debug_js_1.logForDebugging)('BigQuery metrics exported successfully');
            (0, debug_js_1.logForDebugging)(`BigQuery API Response: ${(0, slowOperations_js_1.jsonStringify)(response.data, null, 2)}`);
            resultCallback({ code: core_1.ExportResultCode.SUCCESS });
        }
        catch (error) {
            (0, debug_js_1.logForDebugging)(`BigQuery metrics export failed: ${(0, errors_js_1.errorMessage)(error)}`);
            (0, log_js_1.logError)(error);
            resultCallback({
                code: core_1.ExportResultCode.FAILED,
                error: (0, errors_js_1.toError)(error),
            });
        }
    }
    transformMetricsForInternal(metrics) {
        const attrs = metrics.resource.attributes;
        const resourceAttributes = {
            'service.name': attrs['service.name'] || 'claude-code',
            'service.version': attrs['service.version'] || 'unknown',
            'os.type': attrs['os.type'] || 'unknown',
            'os.version': attrs['os.version'] || 'unknown',
            'host.arch': attrs['host.arch'] || 'unknown',
            'aggregation.temporality': this.selectAggregationTemporality() === sdk_metrics_1.AggregationTemporality.DELTA
                ? 'delta'
                : 'cumulative',
        };
        // Only add wsl.version if it exists (omit instead of default)
        if (attrs['wsl.version']) {
            resourceAttributes['wsl.version'] = attrs['wsl.version'];
        }
        // Add customer type and subscription type
        if ((0, auth_js_1.isClaudeAISubscriber)()) {
            resourceAttributes['user.customer_type'] = 'claude_ai';
            const subscriptionType = (0, auth_js_1.getSubscriptionType)();
            if (subscriptionType) {
                resourceAttributes['user.subscription_type'] = subscriptionType;
            }
        }
        else {
            resourceAttributes['user.customer_type'] = 'api';
        }
        const transformed = {
            resource_attributes: resourceAttributes,
            metrics: metrics.scopeMetrics.flatMap(scopeMetric => scopeMetric.metrics.map(metric => ({
                name: metric.descriptor.name,
                description: metric.descriptor.description,
                unit: metric.descriptor.unit,
                data_points: this.extractDataPoints(metric),
            }))),
        };
        return transformed;
    }
    extractDataPoints(metric) {
        const dataPoints = metric.dataPoints || [];
        return dataPoints
            .filter((point) => typeof point.value === 'number')
            .map(point => ({
            attributes: this.convertAttributes(point.attributes),
            value: point.value,
            timestamp: this.hrTimeToISOString(point.endTime || point.startTime || [Date.now() / 1000, 0]),
        }));
    }
    async shutdown() {
        this.isShutdown = true;
        await this.forceFlush();
        (0, debug_js_1.logForDebugging)('BigQuery metrics exporter shutdown complete');
    }
    async forceFlush() {
        await Promise.all(this.pendingExports);
        (0, debug_js_1.logForDebugging)('BigQuery metrics exporter flush complete');
    }
    convertAttributes(attributes) {
        const result = {};
        if (attributes) {
            for (const [key, value] of Object.entries(attributes)) {
                if (value !== undefined && value !== null) {
                    result[key] = String(value);
                }
            }
        }
        return result;
    }
    hrTimeToISOString(hrTime) {
        const [seconds, nanoseconds] = hrTime;
        const date = new Date(seconds * 1000 + nanoseconds / 1000000);
        return date.toISOString();
    }
    selectAggregationTemporality() {
        // DO NOT CHANGE THIS TO CUMULATIVE
        // It would mess up the aggregation of metrics
        // for CC Productivity metrics dashboard
        return sdk_metrics_1.AggregationTemporality.DELTA;
    }
}
exports.BigQueryMetricsExporter = BigQueryMetricsExporter;
