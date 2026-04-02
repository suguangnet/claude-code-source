"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createIdleTimeoutManager = createIdleTimeoutManager;
const debug_js_1 = require("./debug.js");
const gracefulShutdown_js_1 = require("./gracefulShutdown.js");
/**
 * Creates an idle timeout manager for SDK mode.
 * Automatically exits the process after the specified idle duration.
 *
 * @param isIdle Function that returns true if the system is currently idle
 * @returns Object with start/stop methods to control the idle timer
 */
function createIdleTimeoutManager(isIdle) {
    // Parse CLAUDE_CODE_EXIT_AFTER_STOP_DELAY environment variable
    const exitAfterStopDelay = process.env.CLAUDE_CODE_EXIT_AFTER_STOP_DELAY;
    const delayMs = exitAfterStopDelay ? parseInt(exitAfterStopDelay, 10) : null;
    const isValidDelay = delayMs && !isNaN(delayMs) && delayMs > 0;
    let timer = null;
    let lastIdleTime = 0;
    return {
        start() {
            // Clear any existing timer
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            // Only start timer if delay is configured and valid
            if (isValidDelay) {
                lastIdleTime = Date.now();
                timer = setTimeout(() => {
                    // Check if we've been continuously idle for the full duration
                    const idleDuration = Date.now() - lastIdleTime;
                    if (isIdle() && idleDuration >= delayMs) {
                        (0, debug_js_1.logForDebugging)(`Exiting after ${delayMs}ms of idle time`);
                        (0, gracefulShutdown_js_1.gracefulShutdownSync)();
                    }
                }, delayMs);
            }
        },
        stop() {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
        },
    };
}
