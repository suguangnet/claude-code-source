"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.call = call;
const browser_js_1 = require("../../utils/browser.js");
async function call() {
    const url = 'https://www.stickermule.com/claudecode';
    const success = await (0, browser_js_1.openBrowser)(url);
    if (success) {
        return { type: 'text', value: 'Opening sticker page in browser…' };
    }
    else {
        return {
            type: 'text',
            value: `Failed to open browser. Visit: ${url}`,
        };
    }
}
