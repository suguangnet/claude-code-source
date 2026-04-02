"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redactIfDisabled = redactIfDisabled;
exports.logOTelEvent = logOTelEvent;
const state_js_1 = require("src/bootstrap/state.js");
const debug_js_1 = require("../debug.js");
const envUtils_js_1 = require("../envUtils.js");
const telemetryAttributes_js_1 = require("../telemetryAttributes.js");
// Monotonically increasing counter for ordering events within a session
let eventSequence = 0;
// Track whether we've already warned about a null event logger to avoid spamming
let hasWarnedNoEventLogger = false;
function isUserPromptLoggingEnabled() {
    return (0, envUtils_js_1.isEnvTruthy)(process.env.OTEL_LOG_USER_PROMPTS);
}
function redactIfDisabled(content) {
    return isUserPromptLoggingEnabled() ? content : '<REDACTED>';
}
async function logOTelEvent(eventName, metadata = {}) {
    const eventLogger = (0, state_js_1.getEventLogger)();
    if (!eventLogger) {
        if (!hasWarnedNoEventLogger) {
            hasWarnedNoEventLogger = true;
            (0, debug_js_1.logForDebugging)(`[3P telemetry] Event dropped (no event logger initialized): ${eventName}`, { level: 'warn' });
        }
        return;
    }
    // Skip logging in test environment
    if (process.env.NODE_ENV === 'test') {
        return;
    }
    const attributes = {
        ...(0, telemetryAttributes_js_1.getTelemetryAttributes)(),
        'event.name': eventName,
        'event.timestamp': new Date().toISOString(),
        'event.sequence': eventSequence++,
    };
    // Add prompt ID to events (but not metrics, where it would cause unbounded cardinality)
    const promptId = (0, state_js_1.getPromptId)();
    if (promptId) {
        attributes['prompt.id'] = promptId;
    }
    // Workspace directory from the desktop app (host path). Events only —
    // filesystem paths are too high-cardinality for metric dimensions, and
    // the BQ metrics pipeline must never see them.
    const workspaceDir = process.env.CLAUDE_CODE_WORKSPACE_HOST_PATHS;
    if (workspaceDir) {
        attributes['workspace.host_paths'] = workspaceDir.split('|');
    }
    // Add metadata as attributes - all values are already strings
    for (const [key, value] of Object.entries(metadata)) {
        if (value !== undefined) {
            attributes[key] = value;
        }
    }
    // Emit log record as an event
    eventLogger.emit({
        body: `claude_code.${eventName}`,
        attributes,
    });
}
