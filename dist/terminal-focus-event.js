"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalFocusEvent = void 0;
const event_js_1 = require("./event.js");
/**
 * Event fired when the terminal window gains or loses focus.
 *
 * Uses DECSET 1004 focus reporting - the terminal sends:
 * - CSI I (\x1b[I) when the terminal gains focus
 * - CSI O (\x1b[O) when the terminal loses focus
 */
class TerminalFocusEvent extends event_js_1.Event {
    constructor(type) {
        super();
        this.type = type;
    }
}
exports.TerminalFocusEvent = TerminalFocusEvent;
