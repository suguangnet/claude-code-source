"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = wrapText;
const sliceAnsi_js_1 = __importDefault(require("../utils/sliceAnsi.js"));
const stringWidth_js_1 = require("./stringWidth.js");
const wrapAnsi_js_1 = require("./wrapAnsi.js");
const ELLIPSIS = '…';
// sliceAnsi may include a boundary-spanning wide char (e.g. CJK at position
// end-1 with width 2 overshoots by 1). Retry with a tighter bound once.
function sliceFit(text, start, end) {
    const s = (0, sliceAnsi_js_1.default)(text, start, end);
    return (0, stringWidth_js_1.stringWidth)(s) > end - start ? (0, sliceAnsi_js_1.default)(text, start, end - 1) : s;
}
function truncate(text, columns, position) {
    if (columns < 1)
        return '';
    if (columns === 1)
        return ELLIPSIS;
    const length = (0, stringWidth_js_1.stringWidth)(text);
    if (length <= columns)
        return text;
    if (position === 'start') {
        return ELLIPSIS + sliceFit(text, length - columns + 1, length);
    }
    if (position === 'middle') {
        const half = Math.floor(columns / 2);
        return (sliceFit(text, 0, half) +
            ELLIPSIS +
            sliceFit(text, length - (columns - half) + 1, length));
    }
    return sliceFit(text, 0, columns - 1) + ELLIPSIS;
}
function wrapText(text, maxWidth, wrapType) {
    if (wrapType === 'wrap') {
        return (0, wrapAnsi_js_1.wrapAnsi)(text, maxWidth, {
            trim: false,
            hard: true,
        });
    }
    if (wrapType === 'wrap-trim') {
        return (0, wrapAnsi_js_1.wrapAnsi)(text, maxWidth, {
            trim: true,
            hard: true,
        });
    }
    if (wrapType.startsWith('truncate')) {
        let position = 'end';
        if (wrapType === 'truncate-middle') {
            position = 'middle';
        }
        if (wrapType === 'truncate-start') {
            position = 'start';
        }
        return truncate(text, maxWidth, position);
    }
    return text;
}
