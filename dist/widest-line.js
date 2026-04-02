"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.widestLine = widestLine;
const line_width_cache_js_1 = require("./line-width-cache.js");
function widestLine(string) {
    let maxWidth = 0;
    let start = 0;
    while (start <= string.length) {
        const end = string.indexOf('\n', start);
        const line = end === -1 ? string.substring(start) : string.substring(start, end);
        maxWidth = Math.max(maxWidth, (0, line_width_cache_js_1.lineWidth)(line));
        if (end === -1)
            break;
        start = end + 1;
    }
    return maxWidth;
}
