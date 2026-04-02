"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSessionIngressAuthToken = getSessionIngressAuthToken;
exports.getSessionIngressAuthHeaders = getSessionIngressAuthHeaders;
exports.updateSessionIngressAuthToken = updateSessionIngressAuthToken;
const state_js_1 = require("../bootstrap/state.js");
const authFileDescriptor_js_1 = require("./authFileDescriptor.js");
const debug_js_1 = require("./debug.js");
const errors_js_1 = require("./errors.js");
const fsOperations_js_1 = require("./fsOperations.js");
/**
 * Read token via file descriptor, falling back to well-known file.
 * Uses global state to cache the result since file descriptors can only be read once.
 */
function getTokenFromFileDescriptor() {
    // Check if we've already attempted to read the token
    const cachedToken = (0, state_js_1.getSessionIngressToken)();
    if (cachedToken !== undefined) {
        return cachedToken;
    }
    const fdEnv = process.env.CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR;
    if (!fdEnv) {
        // No FD env var — either we're not in CCR, or we're a subprocess whose
        // parent stripped the (useless) FD env var. Try the well-known file.
        const path = process.env.CLAUDE_SESSION_INGRESS_TOKEN_FILE ??
            authFileDescriptor_js_1.CCR_SESSION_INGRESS_TOKEN_PATH;
        const fromFile = (0, authFileDescriptor_js_1.readTokenFromWellKnownFile)(path, 'session ingress token');
        (0, state_js_1.setSessionIngressToken)(fromFile);
        return fromFile;
    }
    const fd = parseInt(fdEnv, 10);
    if (Number.isNaN(fd)) {
        (0, debug_js_1.logForDebugging)(`CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR must be a valid file descriptor number, got: ${fdEnv}`, { level: 'error' });
        (0, state_js_1.setSessionIngressToken)(null);
        return null;
    }
    try {
        // Read from the file descriptor
        // Use /dev/fd on macOS/BSD, /proc/self/fd on Linux
        const fsOps = (0, fsOperations_js_1.getFsImplementation)();
        const fdPath = process.platform === 'darwin' || process.platform === 'freebsd'
            ? `/dev/fd/${fd}`
            : `/proc/self/fd/${fd}`;
        const token = fsOps.readFileSync(fdPath, { encoding: 'utf8' }).trim();
        if (!token) {
            (0, debug_js_1.logForDebugging)('File descriptor contained empty token', {
                level: 'error',
            });
            (0, state_js_1.setSessionIngressToken)(null);
            return null;
        }
        (0, debug_js_1.logForDebugging)(`Successfully read token from file descriptor ${fd}`);
        (0, state_js_1.setSessionIngressToken)(token);
        (0, authFileDescriptor_js_1.maybePersistTokenForSubprocesses)(authFileDescriptor_js_1.CCR_SESSION_INGRESS_TOKEN_PATH, token, 'session ingress token');
        return token;
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`Failed to read token from file descriptor ${fd}: ${(0, errors_js_1.errorMessage)(error)}`, { level: 'error' });
        // FD env var was set but read failed — typically a subprocess that
        // inherited the env var but not the FD (ENXIO). Try the well-known file.
        const path = process.env.CLAUDE_SESSION_INGRESS_TOKEN_FILE ??
            authFileDescriptor_js_1.CCR_SESSION_INGRESS_TOKEN_PATH;
        const fromFile = (0, authFileDescriptor_js_1.readTokenFromWellKnownFile)(path, 'session ingress token');
        (0, state_js_1.setSessionIngressToken)(fromFile);
        return fromFile;
    }
}
/**
 * Get session ingress authentication token.
 *
 * Priority order:
 *  1. Environment variable (CLAUDE_CODE_SESSION_ACCESS_TOKEN) — set at spawn time,
 *     updated in-process via updateSessionIngressAuthToken or
 *     update_environment_variables stdin message from the parent bridge process.
 *  2. File descriptor (legacy path) — CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR,
 *     read once and cached.
 *  3. Well-known file — CLAUDE_SESSION_INGRESS_TOKEN_FILE env var path, or
 *     /home/claude/.claude/remote/.session_ingress_token. Covers subprocesses
 *     that can't inherit the FD.
 */
function getSessionIngressAuthToken() {
    // 1. Check environment variable
    const envToken = process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN;
    if (envToken) {
        return envToken;
    }
    // 2. Check file descriptor (legacy path), with file fallback
    return getTokenFromFileDescriptor();
}
/**
 * Build auth headers for the current session token.
 * Session keys (sk-ant-sid) use Cookie auth + X-Organization-Uuid;
 * JWTs use Bearer auth.
 */
function getSessionIngressAuthHeaders() {
    const token = getSessionIngressAuthToken();
    if (!token)
        return {};
    if (token.startsWith('sk-ant-sid')) {
        const headers = {
            Cookie: `sessionKey=${token}`,
        };
        const orgUuid = process.env.CLAUDE_CODE_ORGANIZATION_UUID;
        if (orgUuid) {
            headers['X-Organization-Uuid'] = orgUuid;
        }
        return headers;
    }
    return { Authorization: `Bearer ${token}` };
}
/**
 * Update the session ingress auth token in-process by setting the env var.
 * Used by the REPL bridge to inject a fresh token after reconnection
 * without restarting the process.
 */
function updateSessionIngressAuthToken(token) {
    process.env.CLAUDE_CODE_SESSION_ACCESS_TOKEN = token;
}
