"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.call = call;
const path_1 = require("path");
const cwd_js_1 = require("../../utils/cwd.js");
const fileStateCache_js_1 = require("../../utils/fileStateCache.js");
async function call(_args, context) {
    const files = context.readFileState ? (0, fileStateCache_js_1.cacheKeys)(context.readFileState) : [];
    if (files.length === 0) {
        return { type: 'text', value: 'No files in context' };
    }
    const fileList = files.map(file => (0, path_1.relative)((0, cwd_js_1.getCwd)(), file)).join('\n');
    return { type: 'text', value: `Files in context:\n${fileList}` };
}
