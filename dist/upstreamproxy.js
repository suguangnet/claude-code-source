"use strict";
/**
 * CCR upstreamproxy — container-side wiring.
 *
 * When running inside a CCR session container with upstreamproxy configured,
 * this module:
 *   1. Reads the session token from /run/ccr/session_token
 *   2. Sets prctl(PR_SET_DUMPABLE, 0) to block same-UID ptrace of the heap
 *   3. Downloads the upstreamproxy CA cert and concatenates it with the
 *      system bundle so curl/gh/python trust the MITM proxy
 *   4. Starts a local CONNECT→WebSocket relay (see relay.ts)
 *   5. Unlinks the token file (token stays heap-only; file is gone before
 *      the agent loop can see it, but only after the relay is confirmed up
 *      so a supervisor restart can retry)
 *   6. Exposes HTTPS_PROXY / SSL_CERT_FILE env vars for all agent subprocesses
 *
 * Every step fails open: any error logs a warning and disables the proxy.
 * A broken proxy setup must never break an otherwise-working session.
 *
 * Design doc: api-go/ccr/docs/plans/CCR_AUTH_DESIGN.md § "Week-1 pilot scope".
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_TOKEN_PATH = void 0;
exports.initUpstreamProxy = initUpstreamProxy;
exports.getUpstreamProxyEnv = getUpstreamProxyEnv;
exports.resetUpstreamProxyForTests = resetUpstreamProxyForTests;
const promises_1 = require("fs/promises");
const os_1 = require("os");
const path_1 = require("path");
const cleanupRegistry_js_1 = require("../utils/cleanupRegistry.js");
const debug_js_1 = require("../utils/debug.js");
const envUtils_js_1 = require("../utils/envUtils.js");
const errors_js_1 = require("../utils/errors.js");
const relay_js_1 = require("./relay.js");
exports.SESSION_TOKEN_PATH = '/run/ccr/session_token';
const SYSTEM_CA_BUNDLE = '/etc/ssl/certs/ca-certificates.crt';
// Hosts the proxy must NOT intercept. Covers loopback, RFC1918, the IMDS
// range, and the package registries + GitHub that CCR containers already
// reach directly. Mirrors airlock/scripts/sandbox-shell-ccr.sh.
const NO_PROXY_LIST = [
    'localhost',
    '127.0.0.1',
    '::1',
    '169.254.0.0/16',
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    // Anthropic API: no upstream route will ever match, and the MITM breaks
    // non-Bun runtimes (Python httpx/certifi doesn't trust the forged CA).
    // Three forms because NO_PROXY parsing differs across runtimes:
    //   *.anthropic.com  — Bun, curl, Go (glob match)
    //   .anthropic.com   — Python urllib/httpx (suffix match, strips leading dot)
    //   anthropic.com    — apex domain fallback
    'anthropic.com',
    '.anthropic.com',
    '*.anthropic.com',
    'github.com',
    'api.github.com',
    '*.github.com',
    '*.githubusercontent.com',
    'registry.npmjs.org',
    'pypi.org',
    'files.pythonhosted.org',
    'index.crates.io',
    'proxy.golang.org',
].join(',');
let state = { enabled: false };
/**
 * Initialize upstreamproxy. Called once from init.ts. Safe to call when the
 * feature is off or the token file is absent — returns {enabled: false}.
 *
 * Overridable paths are for tests; production uses the defaults.
 */
async function initUpstreamProxy(opts) {
    if (!(0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_REMOTE)) {
        return state;
    }
    // CCR evaluates ccr_upstream_proxy_enabled server-side (where GrowthBook is
    // warm) and injects this env var via StartupContext.EnvironmentVariables.
    // Every CCR session is a fresh container with no GB cache, so a client-side
    // GB check here always returned the default (false).
    if (!(0, envUtils_js_1.isEnvTruthy)(process.env.CCR_UPSTREAM_PROXY_ENABLED)) {
        return state;
    }
    const sessionId = process.env.CLAUDE_CODE_REMOTE_SESSION_ID;
    if (!sessionId) {
        (0, debug_js_1.logForDebugging)('[upstreamproxy] CLAUDE_CODE_REMOTE_SESSION_ID unset; proxy disabled', { level: 'warn' });
        return state;
    }
    const tokenPath = opts?.tokenPath ?? exports.SESSION_TOKEN_PATH;
    const token = await readToken(tokenPath);
    if (!token) {
        (0, debug_js_1.logForDebugging)('[upstreamproxy] no session token file; proxy disabled');
        return state;
    }
    setNonDumpable();
    // CCR injects ANTHROPIC_BASE_URL via StartupContext (sessionExecutor.ts /
    // sessionHandler.ts). getOauthConfig() is wrong here: it keys off
    // USER_TYPE + USE_{LOCAL,STAGING}_OAUTH, none of which the container sets,
    // so it always returned the prod URL and the CA fetch 404'd.
    const baseUrl = opts?.ccrBaseUrl ??
        process.env.ANTHROPIC_BASE_URL ??
        'https://api.anthropic.com';
    const caBundlePath = opts?.caBundlePath ?? (0, path_1.join)((0, os_1.homedir)(), '.ccr', 'ca-bundle.crt');
    const caOk = await downloadCaBundle(baseUrl, opts?.systemCaPath ?? SYSTEM_CA_BUNDLE, caBundlePath);
    if (!caOk)
        return state;
    try {
        const wsUrl = baseUrl.replace(/^http/, 'ws') + '/v1/code/upstreamproxy/ws';
        const relay = await (0, relay_js_1.startUpstreamProxyRelay)({ wsUrl, sessionId, token });
        (0, cleanupRegistry_js_1.registerCleanup)(async () => relay.stop());
        state = { enabled: true, port: relay.port, caBundlePath };
        (0, debug_js_1.logForDebugging)(`[upstreamproxy] enabled on 127.0.0.1:${relay.port}`);
        // Only unlink after the listener is up: if CA download or listen()
        // fails, a supervisor restart can retry with the token still on disk.
        await (0, promises_1.unlink)(tokenPath).catch(() => {
            (0, debug_js_1.logForDebugging)('[upstreamproxy] token file unlink failed', {
                level: 'warn',
            });
        });
    }
    catch (err) {
        (0, debug_js_1.logForDebugging)(`[upstreamproxy] relay start failed: ${err instanceof Error ? err.message : String(err)}; proxy disabled`, { level: 'warn' });
    }
    return state;
}
/**
 * Env vars to merge into every agent subprocess. Empty when the proxy is
 * disabled. Called from subprocessEnv() so Bash/MCP/LSP/hooks all inherit
 * the same recipe.
 */
function getUpstreamProxyEnv() {
    if (!state.enabled || !state.port || !state.caBundlePath) {
        // Child CLI processes can't re-initialize the relay (token file was
        // unlinked by the parent), but the parent's relay is still running and
        // reachable at 127.0.0.1:<port>. If we inherited proxy vars from the
        // parent (HTTPS_PROXY + SSL_CERT_FILE both set), pass them through so
        // our subprocesses also route through the parent's relay.
        if (process.env.HTTPS_PROXY && process.env.SSL_CERT_FILE) {
            const inherited = {};
            for (const key of [
                'HTTPS_PROXY',
                'https_proxy',
                'NO_PROXY',
                'no_proxy',
                'SSL_CERT_FILE',
                'NODE_EXTRA_CA_CERTS',
                'REQUESTS_CA_BUNDLE',
                'CURL_CA_BUNDLE',
            ]) {
                if (process.env[key])
                    inherited[key] = process.env[key];
            }
            return inherited;
        }
        return {};
    }
    const proxyUrl = `http://127.0.0.1:${state.port}`;
    // HTTPS only: the relay handles CONNECT and nothing else. Plain HTTP has
    // no credentials to inject, so routing it through the relay would just
    // break the request with a 405.
    return {
        HTTPS_PROXY: proxyUrl,
        https_proxy: proxyUrl,
        NO_PROXY: NO_PROXY_LIST,
        no_proxy: NO_PROXY_LIST,
        SSL_CERT_FILE: state.caBundlePath,
        NODE_EXTRA_CA_CERTS: state.caBundlePath,
        REQUESTS_CA_BUNDLE: state.caBundlePath,
        CURL_CA_BUNDLE: state.caBundlePath,
    };
}
/** Test-only: reset module state between test cases. */
function resetUpstreamProxyForTests() {
    state = { enabled: false };
}
async function readToken(path) {
    try {
        const raw = await (0, promises_1.readFile)(path, 'utf8');
        return raw.trim() || null;
    }
    catch (err) {
        if ((0, errors_js_1.isENOENT)(err))
            return null;
        (0, debug_js_1.logForDebugging)(`[upstreamproxy] token read failed: ${err instanceof Error ? err.message : String(err)}`, { level: 'warn' });
        return null;
    }
}
/**
 * prctl(PR_SET_DUMPABLE, 0) via libc FFI. Blocks same-UID ptrace of this
 * process, so a prompt-injected `gdb -p $PPID` can't scrape the token from
 * the heap. Linux-only; silently no-ops elsewhere.
 */
function setNonDumpable() {
    if (process.platform !== 'linux' || typeof Bun === 'undefined')
        return;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const ffi = require('bun:ffi');
        const lib = ffi.dlopen('libc.so.6', {
            prctl: {
                args: ['int', 'u64', 'u64', 'u64', 'u64'],
                returns: 'int',
            },
        });
        const PR_SET_DUMPABLE = 4;
        const rc = lib.symbols.prctl(PR_SET_DUMPABLE, 0n, 0n, 0n, 0n);
        if (rc !== 0) {
            (0, debug_js_1.logForDebugging)('[upstreamproxy] prctl(PR_SET_DUMPABLE,0) returned nonzero', {
                level: 'warn',
            });
        }
    }
    catch (err) {
        (0, debug_js_1.logForDebugging)(`[upstreamproxy] prctl unavailable: ${err instanceof Error ? err.message : String(err)}`, { level: 'warn' });
    }
}
async function downloadCaBundle(baseUrl, systemCaPath, outPath) {
    try {
        // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
        const resp = await fetch(`${baseUrl}/v1/code/upstreamproxy/ca-cert`, {
            // Bun has no default fetch timeout — a hung endpoint would block CLI
            // startup forever. 5s is generous for a small PEM.
            signal: AbortSignal.timeout(5000),
        });
        if (!resp.ok) {
            (0, debug_js_1.logForDebugging)(`[upstreamproxy] ca-cert fetch ${resp.status}; proxy disabled`, { level: 'warn' });
            return false;
        }
        const ccrCa = await resp.text();
        const systemCa = await (0, promises_1.readFile)(systemCaPath, 'utf8').catch(() => '');
        await (0, promises_1.mkdir)((0, path_1.join)(outPath, '..'), { recursive: true });
        await (0, promises_1.writeFile)(outPath, systemCa + '\n' + ccrCa, 'utf8');
        return true;
    }
    catch (err) {
        (0, debug_js_1.logForDebugging)(`[upstreamproxy] ca-cert download failed: ${err instanceof Error ? err.message : String(err)}; proxy disabled`, { level: 'warn' });
        return false;
    }
}
