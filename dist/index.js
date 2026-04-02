"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.waitForUrlEvent = waitForUrlEvent;
const module_1 = require("module");
const url_1 = require("url");
const path_1 = require("path");
let cachedModule = null;
function loadModule() {
    if (cachedModule) {
        return cachedModule;
    }
    // Only works on macOS
    if (process.platform !== 'darwin') {
        return null;
    }
    try {
        if (process.env.URL_HANDLER_NODE_PATH) {
            // Bundled mode - use the env var path
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            cachedModule = require(process.env.URL_HANDLER_NODE_PATH);
        }
        else {
            // Dev mode - load from vendor directory
            const modulePath = (0, path_1.join)((0, path_1.dirname)((0, url_1.fileURLToPath)(import.meta.url)), '..', 'url-handler', `${process.arch}-darwin`, 'url-handler.node');
            cachedModule = (0, module_1.createRequire)(import.meta.url)(modulePath);
        }
        return cachedModule;
    }
    catch {
        return null;
    }
}
/**
 * Wait for a macOS URL event (Apple Event kAEGetURL).
 *
 * Initializes NSApplication, registers for the URL event, and pumps
 * the event loop for up to `timeoutMs` milliseconds.
 *
 * Returns the URL string if one was received, or null.
 * Only functional on macOS — returns null on other platforms.
 */
function waitForUrlEvent(timeoutMs) {
    const mod = loadModule();
    if (!mod) {
        return null;
    }
    return mod.waitForUrlEvent(timeoutMs);
}
