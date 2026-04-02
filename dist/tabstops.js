"use strict";
// Tab expansion, inspired by Ghostty's Tabstops.zig
// Uses 8-column intervals (POSIX default, hardcoded in terminals like Ghostty)
Object.defineProperty(exports, "__esModule", { value: true });
exports.expandTabs = expandTabs;
const stringWidth_js_1 = require("./stringWidth.js");
const tokenize_js_1 = require("./termio/tokenize.js");
const DEFAULT_TAB_INTERVAL = 8;
function expandTabs(text, interval = DEFAULT_TAB_INTERVAL) {
    if (!text.includes('\t')) {
        return text;
    }
    const tokenizer = (0, tokenize_js_1.createTokenizer)();
    const tokens = tokenizer.feed(text);
    tokens.push(...tokenizer.flush());
    let result = '';
    let column = 0;
    for (const token of tokens) {
        if (token.type === 'sequence') {
            result += token.value;
        }
        else {
            const parts = token.value.split(/(\t|\n)/);
            for (const part of parts) {
                if (part === '\t') {
                    const spaces = interval - (column % interval);
                    result += ' '.repeat(spaces);
                    column += spaces;
                }
                else if (part === '\n') {
                    result += part;
                    column = 0;
                }
                else {
                    result += part;
                    column += (0, stringWidth_js_1.stringWidth)(part);
                }
            }
        }
    }
    return result;
}
