"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.execHttpHook = execHttpHook;
const axios_1 = __importDefault(require("axios"));
const combinedAbortSignal_js_1 = require("../combinedAbortSignal.js");
const debug_js_1 = require("../debug.js");
const errors_js_1 = require("../errors.js");
const proxy_js_1 = require("../proxy.js");
// Import as namespace so spyOn works in tests (direct imports bypass spies)
const settingsModule = __importStar(require("../settings/settings.js"));
const ssrfGuard_js_1 = require("./ssrfGuard.js");
const DEFAULT_HTTP_HOOK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes (matches TOOL_HOOK_EXECUTION_TIMEOUT_MS)
/**
 * Get the sandbox proxy config for routing HTTP hook requests through the
 * sandbox network proxy when sandboxing is enabled.
 *
 * Uses dynamic import to avoid a static import cycle
 * (sandbox-adapter -> settings -> ... -> hooks -> execHttpHook).
 */
async function getSandboxProxyConfig() {
    const { SandboxManager } = await Promise.resolve().then(() => __importStar(require('../sandbox/sandbox-adapter.js')));
    if (!SandboxManager.isSandboxingEnabled()) {
        return undefined;
    }
    // Wait for the sandbox network proxy to finish initializing. In REPL mode,
    // SandboxManager.initialize() is fire-and-forget so the proxy may not be
    // ready yet when the first hook fires.
    await SandboxManager.waitForNetworkInitialization();
    const proxyPort = SandboxManager.getProxyPort();
    if (!proxyPort) {
        return undefined;
    }
    return { host: '127.0.0.1', port: proxyPort, protocol: 'http' };
}
/**
 * Read HTTP hook allowlist restrictions from merged settings (all sources).
 * Follows the allowedMcpServers precedent: arrays concatenate across sources.
 * When allowManagedHooksOnly is set in managed settings, only admin-defined
 * hooks run anyway, so no separate lock-down boolean is needed here.
 */
function getHttpHookPolicy() {
    const settings = settingsModule.getInitialSettings();
    return {
        allowedUrls: settings.allowedHttpHookUrls,
        allowedEnvVars: settings.httpHookAllowedEnvVars,
    };
}
/**
 * Match a URL against a pattern with * as a wildcard (any characters).
 * Same semantics as the MCP server allowlist patterns.
 */
function urlMatchesPattern(url, pattern) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    const regexStr = escaped.replace(/\*/g, '.*');
    return new RegExp(`^${regexStr}$`).test(url);
}
/**
 * Strip CR, LF, and NUL bytes from a header value to prevent HTTP header
 * injection (CRLF injection) via env var values or hook-configured header
 * templates. A malicious env var like "token\r\nX-Evil: 1" would otherwise
 * inject a second header into the request.
 */
function sanitizeHeaderValue(value) {
    // eslint-disable-next-line no-control-regex
    return value.replace(/[\r\n\x00]/g, '');
}
/**
 * Interpolate $VAR_NAME and ${VAR_NAME} patterns in a string using process.env,
 * but only for variable names present in the allowlist. References to variables
 * not in the allowlist are replaced with empty strings to prevent exfiltration
 * of secrets via project-configured HTTP hooks.
 *
 * The result is sanitized to strip CR/LF/NUL bytes to prevent header injection.
 */
function interpolateEnvVars(value, allowedEnvVars) {
    const interpolated = value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}|\$([A-Z_][A-Z0-9_]*)/g, (_, braced, unbraced) => {
        const varName = braced ?? unbraced;
        if (!allowedEnvVars.has(varName)) {
            (0, debug_js_1.logForDebugging)(`Hooks: env var $${varName} not in allowedEnvVars, skipping interpolation`, { level: 'warn' });
            return '';
        }
        return process.env[varName] ?? '';
    });
    return sanitizeHeaderValue(interpolated);
}
/**
 * Execute an HTTP hook by POSTing the hook input JSON to the configured URL.
 * Returns the raw response for the caller to interpret.
 *
 * When sandboxing is enabled, requests are routed through the sandbox network
 * proxy which enforces the domain allowlist. The proxy returns HTTP 403 for
 * blocked domains.
 *
 * Header values support $VAR_NAME and ${VAR_NAME} env var interpolation so that
 * secrets (e.g. "Authorization: Bearer $MY_TOKEN") are not stored in settings.json.
 * Only env vars explicitly listed in the hook's `allowedEnvVars` array are resolved;
 * all other references are replaced with empty strings.
 */
async function execHttpHook(hook, _hookEvent, jsonInput, signal) {
    // Enforce URL allowlist before any I/O. Follows allowedMcpServers semantics:
    // undefined → no restriction; [] → block all; non-empty → must match a pattern.
    const policy = getHttpHookPolicy();
    if (policy.allowedUrls !== undefined) {
        const matched = policy.allowedUrls.some(p => urlMatchesPattern(hook.url, p));
        if (!matched) {
            const msg = `HTTP hook blocked: ${hook.url} does not match any pattern in allowedHttpHookUrls`;
            (0, debug_js_1.logForDebugging)(msg, { level: 'warn' });
            return { ok: false, body: '', error: msg };
        }
    }
    const timeoutMs = hook.timeout
        ? hook.timeout * 1000
        : DEFAULT_HTTP_HOOK_TIMEOUT_MS;
    const { signal: combinedSignal, cleanup } = (0, combinedAbortSignal_js_1.createCombinedAbortSignal)(signal, { timeoutMs });
    try {
        // Build headers with env var interpolation in values
        const headers = {
            'Content-Type': 'application/json',
        };
        if (hook.headers) {
            // Intersect hook's allowedEnvVars with policy allowlist when policy is set
            const hookVars = hook.allowedEnvVars ?? [];
            const effectiveVars = policy.allowedEnvVars !== undefined
                ? hookVars.filter(v => policy.allowedEnvVars.includes(v))
                : hookVars;
            const allowedEnvVars = new Set(effectiveVars);
            for (const [name, value] of Object.entries(hook.headers)) {
                headers[name] = interpolateEnvVars(value, allowedEnvVars);
            }
        }
        // Route through sandbox network proxy when available. The proxy enforces
        // the domain allowlist and returns 403 for blocked domains.
        const sandboxProxy = await getSandboxProxyConfig();
        // Detect env var proxy (HTTP_PROXY / HTTPS_PROXY, respecting NO_PROXY).
        // When set, configureGlobalAgents() has already installed a request
        // interceptor that sets httpsAgent to an HttpsProxyAgent — the proxy
        // handles DNS for the target. Skip the SSRF guard in that case, same
        // as we do for the sandbox proxy, so that we don't accidentally block
        // a corporate proxy sitting on a private IP (e.g. 10.0.0.1:3128).
        const envProxyActive = !sandboxProxy &&
            (0, proxy_js_1.getProxyUrl)() !== undefined &&
            !(0, proxy_js_1.shouldBypassProxy)(hook.url);
        if (sandboxProxy) {
            (0, debug_js_1.logForDebugging)(`Hooks: HTTP hook POST to ${hook.url} (via sandbox proxy :${sandboxProxy.port})`);
        }
        else if (envProxyActive) {
            (0, debug_js_1.logForDebugging)(`Hooks: HTTP hook POST to ${hook.url} (via env-var proxy)`);
        }
        else {
            (0, debug_js_1.logForDebugging)(`Hooks: HTTP hook POST to ${hook.url}`);
        }
        const response = await axios_1.default.post(hook.url, jsonInput, {
            headers,
            signal: combinedSignal,
            responseType: 'text',
            validateStatus: () => true,
            maxRedirects: 0,
            // Explicit false prevents axios's own env-var proxy detection; when an
            // env-var proxy is configured, the global axios interceptor installed
            // by configureGlobalAgents() handles it via httpsAgent instead.
            proxy: sandboxProxy ?? false,
            // SSRF guard: validate resolved IPs, block private/link-local ranges
            // (but allow loopback for local dev). Skipped when any proxy is in
            // use — the proxy performs DNS for the target, and applying the
            // guard would instead validate the proxy's own IP, breaking
            // connections to corporate proxies on private networks.
            lookup: sandboxProxy || envProxyActive ? undefined : ssrfGuard_js_1.ssrfGuardedLookup,
        });
        cleanup();
        const body = response.data ?? '';
        (0, debug_js_1.logForDebugging)(`Hooks: HTTP hook response status ${response.status}, body length ${body.length}`);
        return {
            ok: response.status >= 200 && response.status < 300,
            statusCode: response.status,
            body,
        };
    }
    catch (error) {
        cleanup();
        if (combinedSignal.aborted) {
            return { ok: false, body: '', aborted: true };
        }
        const errorMsg = (0, errors_js_1.errorMessage)(error);
        (0, debug_js_1.logForDebugging)(`Hooks: HTTP hook error: ${errorMsg}`, { level: 'error' });
        return { ok: false, body: '', error: errorMsg };
    }
}
