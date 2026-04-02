"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTerminalTitle = useTerminalTitle;
const react_1 = require("react");
const strip_ansi_1 = __importDefault(require("strip-ansi"));
const osc_js_1 = require("../termio/osc.js");
const useTerminalNotification_js_1 = require("../useTerminalNotification.js");
/**
 * Declaratively set the terminal tab/window title.
 *
 * Pass a string to set the title. ANSI escape sequences are stripped
 * automatically so callers don't need to know about terminal encoding.
 * Pass `null` to opt out — the hook becomes a no-op and leaves the
 * terminal title untouched.
 *
 * On Windows, uses `process.title` (classic conhost doesn't support OSC).
 * Elsewhere, writes OSC 0 (set title+icon) via Ink's stdout.
 */
function useTerminalTitle(title) {
    const writeRaw = (0, react_1.useContext)(useTerminalNotification_js_1.TerminalWriteContext);
    (0, react_1.useEffect)(() => {
        if (title === null || !writeRaw)
            return;
        const clean = (0, strip_ansi_1.default)(title);
        if (process.platform === 'win32') {
            process.title = clean;
        }
        else {
            writeRaw((0, osc_js_1.osc)(osc_js_1.OSC.SET_TITLE_AND_ICON, clean));
        }
    }, [title, writeRaw]);
}
