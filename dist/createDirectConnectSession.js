"use strict";
/* eslint-disable eslint-plugin-n/no-unsupported-features/node-builtins */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DirectConnectError = void 0;
exports.createDirectConnectSession = createDirectConnectSession;
const errors_js_1 = require("../utils/errors.js");
const slowOperations_js_1 = require("../utils/slowOperations.js");
const types_js_1 = require("./types.js");
/**
 * Errors thrown by createDirectConnectSession when the connection fails.
 */
class DirectConnectError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DirectConnectError';
    }
}
exports.DirectConnectError = DirectConnectError;
/**
 * Create a session on a direct-connect server.
 *
 * Posts to `${serverUrl}/sessions`, validates the response, and returns
 * a DirectConnectConfig ready for use by the REPL or headless runner.
 *
 * Throws DirectConnectError on network, HTTP, or response-parsing failures.
 */
async function createDirectConnectSession({ serverUrl, authToken, cwd, dangerouslySkipPermissions, }) {
    const headers = {
        'content-type': 'application/json',
    };
    if (authToken) {
        headers['authorization'] = `Bearer ${authToken}`;
    }
    let resp;
    try {
        resp = await fetch(`${serverUrl}/sessions`, {
            method: 'POST',
            headers,
            body: (0, slowOperations_js_1.jsonStringify)({
                cwd,
                ...(dangerouslySkipPermissions && {
                    dangerously_skip_permissions: true,
                }),
            }),
        });
    }
    catch (err) {
        throw new DirectConnectError(`Failed to connect to server at ${serverUrl}: ${(0, errors_js_1.errorMessage)(err)}`);
    }
    if (!resp.ok) {
        throw new DirectConnectError(`Failed to create session: ${resp.status} ${resp.statusText}`);
    }
    const result = (0, types_js_1.connectResponseSchema)().safeParse(await resp.json());
    if (!result.success) {
        throw new DirectConnectError(`Invalid session response: ${result.error.message}`);
    }
    const data = result.data;
    return {
        config: {
            serverUrl,
            sessionId: data.session_id,
            wsUrl: data.ws_url,
            authToken,
        },
        workDir: data.work_dir,
    };
}
