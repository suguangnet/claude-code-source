"use strict";
/**
 * Session activity tracking with refcount-based heartbeat timer.
 *
 * The transport registers its keep-alive sender via registerSessionActivityCallback().
 * Callers (API streaming, tool execution) bracket their work with
 * startSessionActivity() / stopSessionActivity(). When the refcount is >0 a
 * periodic timer fires the registered callback every 30 seconds to keep the
 * container alive.
 *
 * Sending keep-alives is gated behind CLAUDE_CODE_REMOTE_SEND_KEEPALIVES.
 * Diagnostic logging always fires to help diagnose idle gaps.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSessionActivityCallback = registerSessionActivityCallback;
exports.unregisterSessionActivityCallback = unregisterSessionActivityCallback;
exports.sendSessionActivitySignal = sendSessionActivitySignal;
exports.isSessionActivityTrackingActive = isSessionActivityTrackingActive;
exports.startSessionActivity = startSessionActivity;
exports.stopSessionActivity = stopSessionActivity;
const cleanupRegistry_js_1 = require("./cleanupRegistry.js");
const diagLogs_js_1 = require("./diagLogs.js");
const envUtils_js_1 = require("./envUtils.js");
const SESSION_ACTIVITY_INTERVAL_MS = 30000;
let activityCallback = null;
let refcount = 0;
const activeReasons = new Map();
let oldestActivityStartedAt = null;
let heartbeatTimer = null;
let idleTimer = null;
let cleanupRegistered = false;
function startHeartbeatTimer() {
    clearIdleTimer();
    heartbeatTimer = setInterval(() => {
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('debug', 'session_keepalive_heartbeat', {
            refcount,
        });
        if ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_REMOTE_SEND_KEEPALIVES)) {
            activityCallback?.();
        }
    }, SESSION_ACTIVITY_INTERVAL_MS);
}
function startIdleTimer() {
    clearIdleTimer();
    if (activityCallback === null) {
        return;
    }
    idleTimer = setTimeout(() => {
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'session_idle_30s');
        idleTimer = null;
    }, SESSION_ACTIVITY_INTERVAL_MS);
}
function clearIdleTimer() {
    if (idleTimer !== null) {
        clearTimeout(idleTimer);
        idleTimer = null;
    }
}
function registerSessionActivityCallback(cb) {
    activityCallback = cb;
    // Restart timer if work is already in progress (e.g. reconnect during streaming)
    if (refcount > 0 && heartbeatTimer === null) {
        startHeartbeatTimer();
    }
}
function unregisterSessionActivityCallback() {
    activityCallback = null;
    // Stop timer if the callback is removed
    if (heartbeatTimer !== null) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
    clearIdleTimer();
}
function sendSessionActivitySignal() {
    if ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_REMOTE_SEND_KEEPALIVES)) {
        activityCallback?.();
    }
}
function isSessionActivityTrackingActive() {
    return activityCallback !== null;
}
/**
 * Increment the activity refcount. When it transitions from 0→1 and a callback
 * is registered, start a periodic heartbeat timer.
 */
function startSessionActivity(reason) {
    refcount++;
    activeReasons.set(reason, (activeReasons.get(reason) ?? 0) + 1);
    if (refcount === 1) {
        oldestActivityStartedAt = Date.now();
        if (activityCallback !== null && heartbeatTimer === null) {
            startHeartbeatTimer();
        }
    }
    if (!cleanupRegistered) {
        cleanupRegistered = true;
        (0, cleanupRegistry_js_1.registerCleanup)(async () => {
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'session_activity_at_shutdown', {
                refcount,
                active: Object.fromEntries(activeReasons),
                // Only meaningful while work is in-flight; stale otherwise.
                oldest_activity_ms: refcount > 0 && oldestActivityStartedAt !== null
                    ? Date.now() - oldestActivityStartedAt
                    : null,
            });
        });
    }
}
/**
 * Decrement the activity refcount. When it reaches 0, stop the heartbeat timer
 * and start an idle timer that logs after 30s of inactivity.
 */
function stopSessionActivity(reason) {
    if (refcount > 0) {
        refcount--;
    }
    const n = (activeReasons.get(reason) ?? 0) - 1;
    if (n > 0)
        activeReasons.set(reason, n);
    else
        activeReasons.delete(reason);
    if (refcount === 0 && heartbeatTimer !== null) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        startIdleTimer();
    }
}
