"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventEmitter = void 0;
const events_1 = require("events");
const event_js_1 = require("./event.js");
// Similar to node's builtin EventEmitter, but is also aware of our `Event`
// class, and so `emit` respects `stopImmediatePropagation()`.
class EventEmitter extends events_1.EventEmitter {
    constructor() {
        super();
        // Disable the default maxListeners warning. In React, many components
        // can legitimately listen to the same event (e.g., useInput hooks).
        // The default limit of 10 causes spurious warnings.
        this.setMaxListeners(0);
    }
    emit(type, ...args) {
        // Delegate to node for `error`, since it's not treated like a normal event
        if (type === 'error') {
            return super.emit(type, ...args);
        }
        const listeners = this.rawListeners(type);
        if (listeners.length === 0) {
            return false;
        }
        const ccEvent = args[0] instanceof event_js_1.Event ? args[0] : null;
        for (const listener of listeners) {
            listener.apply(this, args);
            if (ccEvent?.didStopImmediatePropagation()) {
                break;
            }
        }
        return true;
    }
}
exports.EventEmitter = EventEmitter;
