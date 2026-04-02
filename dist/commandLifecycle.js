"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setCommandLifecycleListener = setCommandLifecycleListener;
exports.notifyCommandLifecycle = notifyCommandLifecycle;
let listener = null;
function setCommandLifecycleListener(cb) {
    listener = cb;
}
function notifyCommandLifecycle(uuid, state) {
    listener?.(uuid, state);
}
