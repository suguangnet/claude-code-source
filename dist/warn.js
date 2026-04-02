"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ifNotInteger = ifNotInteger;
const debug_js_1 = require("../utils/debug.js");
function ifNotInteger(value, name) {
    if (value === undefined)
        return;
    if (Number.isInteger(value))
        return;
    (0, debug_js_1.logForDebugging)(`${name} should be an integer, got ${value}`, {
        level: 'warn',
    });
}
