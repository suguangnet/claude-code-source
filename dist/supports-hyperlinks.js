"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADDITIONAL_HYPERLINK_TERMINALS = void 0;
exports.supportsHyperlinks = supportsHyperlinks;
const supports_hyperlinks_1 = __importDefault(require("supports-hyperlinks"));
// Additional terminals that support OSC 8 hyperlinks but aren't detected by supports-hyperlinks.
// Checked against both TERM_PROGRAM and LC_TERMINAL (the latter is preserved inside tmux).
exports.ADDITIONAL_HYPERLINK_TERMINALS = [
    'ghostty',
    'Hyper',
    'kitty',
    'alacritty',
    'iTerm.app',
    'iTerm2',
];
/**
 * Returns whether stdout supports OSC 8 hyperlinks.
 * Extends the supports-hyperlinks library with additional terminal detection.
 * @param options Optional overrides for testing (env, stdoutSupported)
 */
function supportsHyperlinks(options) {
    const stdoutSupported = options?.stdoutSupported ?? supports_hyperlinks_1.default.stdout;
    if (stdoutSupported) {
        return true;
    }
    const env = options?.env ?? process.env;
    // Check for additional terminals not detected by supports-hyperlinks
    const termProgram = env['TERM_PROGRAM'];
    if (termProgram && exports.ADDITIONAL_HYPERLINK_TERMINALS.includes(termProgram)) {
        return true;
    }
    // LC_TERMINAL is set by some terminals (e.g. iTerm2) and preserved inside tmux,
    // where TERM_PROGRAM is overwritten to 'tmux'.
    const lcTerminal = env['LC_TERMINAL'];
    if (lcTerminal && exports.ADDITIONAL_HYPERLINK_TERMINALS.includes(lcTerminal)) {
        return true;
    }
    // Kitty sets TERM=xterm-kitty
    const term = env['TERM'];
    if (term?.includes('kitty')) {
        return true;
    }
    return false;
}
