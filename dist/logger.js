"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeCodeDiagLogger = void 0;
const debug_js_1 = require("../debug.js");
const log_js_1 = require("../log.js");
class ClaudeCodeDiagLogger {
    error(message, ..._) {
        (0, log_js_1.logError)(new Error(message));
        (0, debug_js_1.logForDebugging)(`[3P telemetry] OTEL diag error: ${message}`, {
            level: 'error',
        });
    }
    warn(message, ..._) {
        (0, log_js_1.logError)(new Error(message));
        (0, debug_js_1.logForDebugging)(`[3P telemetry] OTEL diag warn: ${message}`, {
            level: 'warn',
        });
    }
    info(_message, ..._args) {
        return;
    }
    debug(_message, ..._args) {
        return;
    }
    verbose(_message, ..._args) {
        return;
    }
}
exports.ClaudeCodeDiagLogger = ClaudeCodeDiagLogger;
