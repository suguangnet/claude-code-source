"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Event = void 0;
class Event {
    constructor() {
        this._didStopImmediatePropagation = false;
    }
    didStopImmediatePropagation() {
        return this._didStopImmediatePropagation;
    }
    stopImmediatePropagation() {
        this._didStopImmediatePropagation = true;
    }
}
exports.Event = Event;
