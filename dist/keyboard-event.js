"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeyboardEvent = void 0;
const terminal_event_js_1 = require("./terminal-event.js");
/**
 * Keyboard event dispatched through the DOM tree via capture/bubble.
 *
 * Follows browser KeyboardEvent semantics: `key` is the literal character
 * for printable keys ('a', '3', ' ', '/') and a multi-char name for
 * special keys ('down', 'return', 'escape', 'f1'). The idiomatic
 * printable-char check is `e.key.length === 1`.
 */
class KeyboardEvent extends terminal_event_js_1.TerminalEvent {
    constructor(parsedKey) {
        super('keydown', { bubbles: true, cancelable: true });
        this.key = keyFromParsed(parsedKey);
        this.ctrl = parsedKey.ctrl;
        this.shift = parsedKey.shift;
        this.meta = parsedKey.meta || parsedKey.option;
        this.superKey = parsedKey.super;
        this.fn = parsedKey.fn;
    }
}
exports.KeyboardEvent = KeyboardEvent;
function keyFromParsed(parsed) {
    const seq = parsed.sequence ?? '';
    const name = parsed.name ?? '';
    // Ctrl combos: sequence is a control byte (\x03 for ctrl+c), name is the
    // letter. Browsers report e.key === 'c' with e.ctrlKey === true.
    if (parsed.ctrl)
        return name;
    // Single printable char (space through ~, plus anything above ASCII):
    // use the literal char. Browsers report e.key === '3', not 'Digit3'.
    if (seq.length === 1) {
        const code = seq.charCodeAt(0);
        if (code >= 0x20 && code !== 0x7f)
            return seq;
    }
    // Special keys (arrows, F-keys, return, tab, escape, etc.): sequence is
    // either an escape sequence (\x1b[B) or a control byte (\r, \t), so use
    // the parsed name. Browsers report e.key === 'ArrowDown'.
    return name || seq;
}
