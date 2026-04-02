"use strict";
/**
 * Hook event system for broadcasting hook execution events.
 *
 * This module provides a generic event system that is separate from the
 * main message stream. Handlers can register to receive events and decide
 * what to do with them (e.g., convert to SDK messages, log, etc.).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerHookEventHandler = registerHookEventHandler;
exports.emitHookStarted = emitHookStarted;
exports.emitHookProgress = emitHookProgress;
exports.startHookProgressInterval = startHookProgressInterval;
exports.emitHookResponse = emitHookResponse;
exports.setAllHookEventsEnabled = setAllHookEventsEnabled;
exports.clearHookEventState = clearHookEventState;
const coreTypes_js_1 = require("src/entrypoints/sdk/coreTypes.js");
const debug_js_1 = require("../debug.js");
/**
 * Hook events that are always emitted regardless of the includeHookEvents
 * option. These are low-noise lifecycle events that were in the original
 * allowlist and are backwards-compatible.
 */
const ALWAYS_EMITTED_HOOK_EVENTS = ['SessionStart', 'Setup'];
const MAX_PENDING_EVENTS = 100;
const pendingEvents = [];
let eventHandler = null;
let allHookEventsEnabled = false;
function registerHookEventHandler(handler) {
    eventHandler = handler;
    if (handler && pendingEvents.length > 0) {
        for (const event of pendingEvents.splice(0)) {
            handler(event);
        }
    }
}
function emit(event) {
    if (eventHandler) {
        eventHandler(event);
    }
    else {
        pendingEvents.push(event);
        if (pendingEvents.length > MAX_PENDING_EVENTS) {
            pendingEvents.shift();
        }
    }
}
function shouldEmit(hookEvent) {
    if (ALWAYS_EMITTED_HOOK_EVENTS.includes(hookEvent)) {
        return true;
    }
    return (allHookEventsEnabled &&
        coreTypes_js_1.HOOK_EVENTS.includes(hookEvent));
}
function emitHookStarted(hookId, hookName, hookEvent) {
    if (!shouldEmit(hookEvent))
        return;
    emit({
        type: 'started',
        hookId,
        hookName,
        hookEvent,
    });
}
function emitHookProgress(data) {
    if (!shouldEmit(data.hookEvent))
        return;
    emit({
        type: 'progress',
        ...data,
    });
}
function startHookProgressInterval(params) {
    if (!shouldEmit(params.hookEvent))
        return () => { };
    let lastEmittedOutput = '';
    const interval = setInterval(() => {
        void params.getOutput().then(({ stdout, stderr, output }) => {
            if (output === lastEmittedOutput)
                return;
            lastEmittedOutput = output;
            emitHookProgress({
                hookId: params.hookId,
                hookName: params.hookName,
                hookEvent: params.hookEvent,
                stdout,
                stderr,
                output,
            });
        });
    }, params.intervalMs ?? 1000);
    interval.unref();
    return () => clearInterval(interval);
}
function emitHookResponse(data) {
    // Always log full hook output to debug log for verbose mode debugging
    const outputToLog = data.stdout || data.stderr || data.output;
    if (outputToLog) {
        (0, debug_js_1.logForDebugging)(`Hook ${data.hookName} (${data.hookEvent}) ${data.outcome}:\n${outputToLog}`);
    }
    if (!shouldEmit(data.hookEvent))
        return;
    emit({
        type: 'response',
        ...data,
    });
}
/**
 * Enable emission of all hook event types (beyond SessionStart and Setup).
 * Called when the SDK `includeHookEvents` option is set or when running
 * in CLAUDE_CODE_REMOTE mode.
 */
function setAllHookEventsEnabled(enabled) {
    allHookEventsEnabled = enabled;
}
function clearHookEventState() {
    eventHandler = null;
    pendingEvents.length = 0;
    allHookEventsEnabled = false;
}
