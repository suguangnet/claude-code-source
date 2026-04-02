"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FocusEvent = void 0;
const terminal_event_js_1 = require("./terminal-event.js");
/**
 * Focus event for component focus changes.
 *
 * Dispatched when focus moves between elements. 'focus' fires on the
 * newly focused element, 'blur' fires on the previously focused one.
 * Both bubble, matching react-dom's use of focusin/focusout semantics
 * so parent components can observe descendant focus changes.
 */
class FocusEvent extends terminal_event_js_1.TerminalEvent {
    constructor(type, relatedTarget = null) {
        super(type, { bubbles: true, cancelable: false });
        this.relatedTarget = relatedTarget;
    }
}
exports.FocusEvent = FocusEvent;
