"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setTerminalFocused = setTerminalFocused;
exports.getTerminalFocused = getTerminalFocused;
exports.getTerminalFocusState = getTerminalFocusState;
exports.subscribeTerminalFocus = subscribeTerminalFocus;
exports.resetTerminalFocusState = resetTerminalFocusState;
let focusState = 'unknown';
const resolvers = new Set();
const subscribers = new Set();
function setTerminalFocused(v) {
    focusState = v ? 'focused' : 'blurred';
    // Notify useSyncExternalStore subscribers
    for (const cb of subscribers) {
        cb();
    }
    if (!v) {
        for (const resolve of resolvers) {
            resolve();
        }
        resolvers.clear();
    }
}
function getTerminalFocused() {
    return focusState !== 'blurred';
}
function getTerminalFocusState() {
    return focusState;
}
// For useSyncExternalStore
function subscribeTerminalFocus(cb) {
    subscribers.add(cb);
    return () => {
        subscribers.delete(cb);
    };
}
function resetTerminalFocusState() {
    focusState = 'unknown';
    for (const cb of subscribers) {
        cb();
    }
}
