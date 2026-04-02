"use strict";
/**
 * Protocol Handler
 *
 * Entry point for `claude --handle-uri <url>`. When the OS invokes claude
 * with a `claude-cli://` URL, this module:
 *   1. Parses the URI into a structured action
 *   2. Detects the user's terminal emulator
 *   3. Opens a new terminal window running claude with the appropriate args
 *
 * This runs in a headless context (no TTY) because the OS launches the binary
 * directly — there is no terminal attached.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleDeepLinkUri = handleDeepLinkUri;
exports.handleUrlSchemeLaunch = handleUrlSchemeLaunch;
const os_1 = require("os");
const debug_js_1 = require("../debug.js");
const githubRepoPathMapping_js_1 = require("../githubRepoPathMapping.js");
const slowOperations_js_1 = require("../slowOperations.js");
const banner_js_1 = require("./banner.js");
const parseDeepLink_js_1 = require("./parseDeepLink.js");
const registerProtocol_js_1 = require("./registerProtocol.js");
const terminalLauncher_js_1 = require("./terminalLauncher.js");
/**
 * Handle an incoming deep link URI.
 *
 * Called from the CLI entry point when `--handle-uri` is passed.
 * This function parses the URI, resolves the claude binary, and
 * launches it in the user's terminal.
 *
 * @param uri - The raw URI string (e.g., "claude-cli://prompt?q=hello+world")
 * @returns exit code (0 = success)
 */
async function handleDeepLinkUri(uri) {
    (0, debug_js_1.logForDebugging)(`Handling deep link URI: ${uri}`);
    let action;
    try {
        action = (0, parseDeepLink_js_1.parseDeepLink)(uri);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // biome-ignore lint/suspicious/noConsole: intentional error output
        console.error(`Deep link error: ${message}`);
        return 1;
    }
    (0, debug_js_1.logForDebugging)(`Parsed deep link action: ${(0, slowOperations_js_1.jsonStringify)(action)}`);
    // Always the running executable — no PATH lookup. The OS launched us via
    // an absolute path (bundle symlink / .desktop Exec= / registry command)
    // baked at registration time, and we want the terminal-launched Claude to
    // be the same binary. process.execPath is that binary.
    const { cwd, resolvedRepo } = await resolveCwd(action);
    // Resolve FETCH_HEAD age here, in the trampoline process, so main.tsx
    // stays await-free — the launched instance receives it as a precomputed
    // flag instead of statting the filesystem on its own startup path.
    const lastFetch = resolvedRepo ? await (0, banner_js_1.readLastFetchTime)(cwd) : undefined;
    const launched = await (0, terminalLauncher_js_1.launchInTerminal)(process.execPath, {
        query: action.query,
        cwd,
        repo: resolvedRepo,
        lastFetchMs: lastFetch?.getTime(),
    });
    if (!launched) {
        // biome-ignore lint/suspicious/noConsole: intentional error output
        console.error('Failed to open a terminal. Make sure a supported terminal emulator is installed.');
        return 1;
    }
    return 0;
}
/**
 * Handle the case where claude was launched as the app bundle's executable
 * by macOS (via URL scheme). Uses the NAPI module to receive the URL from
 * the Apple Event, then handles it normally.
 *
 * @returns exit code (0 = success, 1 = error, null = not a URL launch)
 */
async function handleUrlSchemeLaunch() {
    // LaunchServices overwrites __CFBundleIdentifier with the launching bundle's
    // ID. This is a precise positive signal — it's set to our exact bundle ID
    // if and only if macOS launched us via the URL handler .app bundle.
    // (`open` from a terminal passes the caller's env through, so negative
    // heuristics like !TERM don't work — the terminal's TERM leaks in.)
    if (process.env.__CFBundleIdentifier !== registerProtocol_js_1.MACOS_BUNDLE_ID) {
        return null;
    }
    try {
        const { waitForUrlEvent } = await Promise.resolve().then(() => __importStar(require('url-handler-napi')));
        const url = waitForUrlEvent(5000);
        if (!url) {
            return null;
        }
        return await handleDeepLinkUri(url);
    }
    catch {
        // NAPI module not available, or handleDeepLinkUri rejected — not a URL launch
        return null;
    }
}
/**
 * Resolve the working directory for the launched Claude instance.
 * Precedence: explicit cwd > repo lookup (MRU clone) > home.
 * A repo that isn't cloned locally is not an error — fall through to home
 * so a web link referencing a repo the user doesn't have still opens Claude.
 *
 * Returns the resolved cwd, and the repo slug if (and only if) the MRU
 * lookup hit — so the launched instance can show which clone was selected
 * and its git freshness.
 */
async function resolveCwd(action) {
    if (action.cwd) {
        return { cwd: action.cwd };
    }
    if (action.repo) {
        const known = (0, githubRepoPathMapping_js_1.getKnownPathsForRepo)(action.repo);
        const existing = await (0, githubRepoPathMapping_js_1.filterExistingPaths)(known);
        if (existing[0]) {
            (0, debug_js_1.logForDebugging)(`Resolved repo ${action.repo} → ${existing[0]}`);
            return { cwd: existing[0], resolvedRepo: action.repo };
        }
        (0, debug_js_1.logForDebugging)(`No local clone found for repo ${action.repo}, falling back to home`);
    }
    return { cwd: (0, os_1.homedir)() };
}
