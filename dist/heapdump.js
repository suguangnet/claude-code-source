"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.call = call;
const heapDumpService_js_1 = require("../../utils/heapDumpService.js");
async function call() {
    const result = await (0, heapDumpService_js_1.performHeapDump)();
    if (!result.success) {
        return {
            type: 'text',
            value: `Failed to create heap dump: ${result.error}`,
        };
    }
    return {
        type: 'text',
        value: `${result.heapPath}\n${result.diagPath}`,
    };
}
