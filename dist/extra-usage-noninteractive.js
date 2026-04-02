"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.call = call;
const extra_usage_core_js_1 = require("./extra-usage-core.js");
async function call() {
    const result = await (0, extra_usage_core_js_1.runExtraUsage)();
    if (result.type === 'message') {
        return { type: 'text', value: result.value };
    }
    return {
        type: 'text',
        value: result.opened
            ? `Browser opened to manage extra usage. If it didn't open, visit: ${result.url}`
            : `Please visit ${result.url} to manage extra usage.`,
    };
}
