"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OSC8_END = exports.OSC8_START = void 0;
exports.createHyperlink = createHyperlink;
const chalk_1 = __importDefault(require("chalk"));
const supports_hyperlinks_js_1 = require("../ink/supports-hyperlinks.js");
// OSC 8 hyperlink escape sequences
// Format: \e]8;;URL\e\\TEXT\e]8;;\e\\
// Using \x07 (BEL) as terminator which is more widely supported
exports.OSC8_START = '\x1b]8;;';
exports.OSC8_END = '\x07';
/**
 * Create a clickable hyperlink using OSC 8 escape sequences.
 * Falls back to plain text if the terminal doesn't support hyperlinks.
 *
 * @param url - The URL to link to
 * @param content - Optional content to display as the link text (only when hyperlinks are supported).
 *                  If provided and hyperlinks are supported, this text is shown as a clickable link.
 *                  If hyperlinks are not supported, content is ignored and only the URL is shown.
 * @param options - Optional overrides for testing (supportsHyperlinks)
 */
function createHyperlink(url, content, options) {
    const hasSupport = options?.supportsHyperlinks ?? (0, supports_hyperlinks_js_1.supportsHyperlinks)();
    if (!hasSupport) {
        return url;
    }
    // Apply basic ANSI blue color - wrap-ansi preserves this across line breaks
    // RGB colors (like theme colors) are NOT preserved by wrap-ansi with OSC 8
    const displayText = content ?? url;
    const coloredText = chalk_1.default.blue(displayText);
    return `${exports.OSC8_START}${url}${exports.OSC8_END}${coloredText}${exports.OSC8_START}${exports.OSC8_END}`;
}
