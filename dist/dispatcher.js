"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Dispatcher = void 0;
const constants_js_1 = require("react-reconciler/constants.js");
const log_js_1 = require("../../utils/log.js");
const event_handlers_js_1 = require("./event-handlers.js");
function getHandler(node, eventType, capture) {
    const handlers = node._eventHandlers;
    if (!handlers)
        return undefined;
    const mapping = event_handlers_js_1.HANDLER_FOR_EVENT[eventType];
    if (!mapping)
        return undefined;
    const propName = capture ? mapping.capture : mapping.bubble;
    if (!propName)
        return undefined;
    return handlers[propName];
}
/**
 * Collect all listeners for an event in dispatch order.
 *
 * Uses react-dom's two-phase accumulation pattern:
 * - Walk from target to root
 * - Capture handlers are prepended (unshift) → root-first
 * - Bubble handlers are appended (push) → target-first
 *
 * Result: [root-cap, ..., parent-cap, target-cap, target-bub, parent-bub, ..., root-bub]
 */
function collectListeners(target, event) {
    const listeners = [];
    let node = target;
    while (node) {
        const isTarget = node === target;
        const captureHandler = getHandler(node, event.type, true);
        const bubbleHandler = getHandler(node, event.type, false);
        if (captureHandler) {
            listeners.unshift({
                node,
                handler: captureHandler,
                phase: isTarget ? 'at_target' : 'capturing',
            });
        }
        if (bubbleHandler && (event.bubbles || isTarget)) {
            listeners.push({
                node,
                handler: bubbleHandler,
                phase: isTarget ? 'at_target' : 'bubbling',
            });
        }
        node = node.parentNode;
    }
    return listeners;
}
/**
 * Execute collected listeners with propagation control.
 *
 * Before each handler, calls event._prepareForTarget(node) so event
 * subclasses can do per-node setup.
 */
function processDispatchQueue(listeners, event) {
    let previousNode;
    for (const { node, handler, phase } of listeners) {
        if (event._isImmediatePropagationStopped()) {
            break;
        }
        if (event._isPropagationStopped() && node !== previousNode) {
            break;
        }
        event._setEventPhase(phase);
        event._setCurrentTarget(node);
        event._prepareForTarget(node);
        try {
            handler(event);
        }
        catch (error) {
            (0, log_js_1.logError)(error);
        }
        previousNode = node;
    }
}
// --
/**
 * Map terminal event types to React scheduling priorities.
 * Mirrors react-dom's getEventPriority() switch.
 */
function getEventPriority(eventType) {
    switch (eventType) {
        case 'keydown':
        case 'keyup':
        case 'click':
        case 'focus':
        case 'blur':
        case 'paste':
            return constants_js_1.DiscreteEventPriority;
        case 'resize':
        case 'scroll':
        case 'mousemove':
            return constants_js_1.ContinuousEventPriority;
        default:
            return constants_js_1.DefaultEventPriority;
    }
}
/**
 * Owns event dispatch state and the capture/bubble dispatch loop.
 *
 * The reconciler host config reads currentEvent and currentUpdatePriority
 * to implement resolveUpdatePriority, resolveEventType, and
 * resolveEventTimeStamp — mirroring how react-dom's host config reads
 * ReactDOMSharedInternals and window.event.
 *
 * discreteUpdates is injected after construction (by InkReconciler)
 * to break the import cycle.
 */
class Dispatcher {
    constructor() {
        this.currentEvent = null;
        this.currentUpdatePriority = constants_js_1.DefaultEventPriority;
        this.discreteUpdates = null;
    }
    /**
     * Infer event priority from the currently-dispatching event.
     * Called by the reconciler host config's resolveUpdatePriority
     * when no explicit priority has been set.
     */
    resolveEventPriority() {
        if (this.currentUpdatePriority !== constants_js_1.NoEventPriority) {
            return this.currentUpdatePriority;
        }
        if (this.currentEvent) {
            return getEventPriority(this.currentEvent.type);
        }
        return constants_js_1.DefaultEventPriority;
    }
    /**
     * Dispatch an event through capture and bubble phases.
     * Returns true if preventDefault() was NOT called.
     */
    dispatch(target, event) {
        const previousEvent = this.currentEvent;
        this.currentEvent = event;
        try {
            event._setTarget(target);
            const listeners = collectListeners(target, event);
            processDispatchQueue(listeners, event);
            event._setEventPhase('none');
            event._setCurrentTarget(null);
            return !event.defaultPrevented;
        }
        finally {
            this.currentEvent = previousEvent;
        }
    }
    /**
     * Dispatch with discrete (sync) priority.
     * For user-initiated events: keyboard, click, focus, paste.
     */
    dispatchDiscrete(target, event) {
        if (!this.discreteUpdates) {
            return this.dispatch(target, event);
        }
        return this.discreteUpdates((t, e) => this.dispatch(t, e), target, event, undefined, undefined);
    }
    /**
     * Dispatch with continuous priority.
     * For high-frequency events: resize, scroll, mouse move.
     */
    dispatchContinuous(target, event) {
        const previousPriority = this.currentUpdatePriority;
        try {
            this.currentUpdatePriority = constants_js_1.ContinuousEventPriority;
            return this.dispatch(target, event);
        }
        finally {
            this.currentUpdatePriority = previousPriority;
        }
    }
}
exports.Dispatcher = Dispatcher;
