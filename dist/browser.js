"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openPath = openPath;
exports.openBrowser = openBrowser;
const execFileNoThrow_js_1 = require("./execFileNoThrow.js");
function validateUrl(url) {
    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    }
    catch (_error) {
        throw new Error(`Invalid URL format: ${url}`);
    }
    // Validate URL protocol for security
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error(`Invalid URL protocol: must use http:// or https://, got ${parsedUrl.protocol}`);
    }
}
/**
 * Open a file or folder path using the system's default handler.
 * Uses `open` on macOS, `explorer` on Windows, `xdg-open` on Linux.
 */
async function openPath(path) {
    try {
        const platform = process.platform;
        if (platform === 'win32') {
            const { code } = await (0, execFileNoThrow_js_1.execFileNoThrow)('explorer', [path]);
            return code === 0;
        }
        const command = platform === 'darwin' ? 'open' : 'xdg-open';
        const { code } = await (0, execFileNoThrow_js_1.execFileNoThrow)(command, [path]);
        return code === 0;
    }
    catch (_) {
        return false;
    }
}
async function openBrowser(url) {
    try {
        // Parse and validate the URL
        validateUrl(url);
        const browserEnv = process.env.BROWSER;
        const platform = process.platform;
        if (platform === 'win32') {
            if (browserEnv) {
                // browsers require shell, else they will treat this as a file:/// handle
                const { code } = await (0, execFileNoThrow_js_1.execFileNoThrow)(browserEnv, [`"${url}"`]);
                return code === 0;
            }
            const { code } = await (0, execFileNoThrow_js_1.execFileNoThrow)('rundll32', ['url,OpenURL', url], {});
            return code === 0;
        }
        else {
            const command = browserEnv || (platform === 'darwin' ? 'open' : 'xdg-open');
            const { code } = await (0, execFileNoThrow_js_1.execFileNoThrow)(command, [url]);
            return code === 0;
        }
    }
    catch (_) {
        return false;
    }
}
