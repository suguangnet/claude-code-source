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
exports.getProxyAgent = void 0;
exports.disableKeepAlive = disableKeepAlive;
exports._resetKeepAliveForTesting = _resetKeepAliveForTesting;
exports.getAddressFamily = getAddressFamily;
exports.getProxyUrl = getProxyUrl;
exports.getNoProxy = getNoProxy;
exports.shouldBypassProxy = shouldBypassProxy;
exports.createAxiosInstance = createAxiosInstance;
exports.getWebSocketProxyAgent = getWebSocketProxyAgent;
exports.getWebSocketProxyUrl = getWebSocketProxyUrl;
exports.getProxyFetchOptions = getProxyFetchOptions;
exports.configureGlobalAgents = configureGlobalAgents;
exports.getAWSClientProxyConfig = getAWSClientProxyConfig;
exports.clearProxyCache = clearProxyCache;
// @aws-sdk/credential-provider-node and @smithy/node-http-handler are imported
// dynamically in getAWSClientProxyConfig() to defer ~929KB of AWS SDK.
// undici is lazy-required inside getProxyAgent/configureGlobalAgents to defer
// ~1.5MB when no HTTPS_PROXY/mTLS env vars are set (the common case).
const axios_1 = __importDefault(require("axios"));
const https_proxy_agent_1 = require("https-proxy-agent");
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const caCerts_js_1 = require("./caCerts.js");
const debug_js_1 = require("./debug.js");
const envUtils_js_1 = require("./envUtils.js");
const mtls_js_1 = require("./mtls.js");
// Disable fetch keep-alive after a stale-pool ECONNRESET so retries open a
// fresh TCP connection instead of reusing the dead pooled socket. Sticky for
// the process lifetime — once the pool is known-bad, don't trust it again.
// Works under Bun (native fetch respects keepalive:false for pooling).
// Under Node/undici, keepalive is a no-op for pooling, but undici
// naturally evicts dead sockets from the pool on ECONNRESET.
let keepAliveDisabled = false;
function disableKeepAlive() {
    keepAliveDisabled = true;
}
function _resetKeepAliveForTesting() {
    keepAliveDisabled = false;
}
/**
 * Convert dns.LookupOptions.family to a numeric address family value
 * Handles: 0 | 4 | 6 | 'IPv4' | 'IPv6' | undefined
 */
function getAddressFamily(options) {
    switch (options.family) {
        case 0:
        case 4:
        case 6:
            return options.family;
        case 'IPv6':
            return 6;
        case 'IPv4':
        case undefined:
            return 4;
        default:
            throw new Error(`Unsupported address family: ${options.family}`);
    }
}
/**
 * Get the active proxy URL if one is configured
 * Prefers lowercase variants over uppercase (https_proxy > HTTPS_PROXY > http_proxy > HTTP_PROXY)
 * @param env Environment variables to check (defaults to process.env for production use)
 */
function getProxyUrl(env = process.env) {
    return env.https_proxy || env.HTTPS_PROXY || env.http_proxy || env.HTTP_PROXY;
}
/**
 * Get the NO_PROXY environment variable value
 * Prefers lowercase over uppercase (no_proxy > NO_PROXY)
 * @param env Environment variables to check (defaults to process.env for production use)
 */
function getNoProxy(env = process.env) {
    return env.no_proxy || env.NO_PROXY;
}
/**
 * Check if a URL should bypass the proxy based on NO_PROXY environment variable
 * Supports:
 * - Exact hostname matches (e.g., "localhost")
 * - Domain suffix matches with leading dot (e.g., ".example.com")
 * - Wildcard "*" to bypass all
 * - Port-specific matches (e.g., "example.com:8080")
 * - IP addresses (e.g., "127.0.0.1")
 * @param urlString URL to check
 * @param noProxy NO_PROXY value (defaults to getNoProxy() for production use)
 */
function shouldBypassProxy(urlString, noProxy = getNoProxy()) {
    if (!noProxy)
        return false;
    // Handle wildcard
    if (noProxy === '*')
        return true;
    try {
        const url = new URL(urlString);
        const hostname = url.hostname.toLowerCase();
        const port = url.port || (url.protocol === 'https:' ? '443' : '80');
        const hostWithPort = `${hostname}:${port}`;
        // Split by comma or space and trim each entry
        const noProxyList = noProxy.split(/[,\s]+/).filter(Boolean);
        return noProxyList.some(pattern => {
            pattern = pattern.toLowerCase().trim();
            // Check for port-specific match
            if (pattern.includes(':')) {
                return hostWithPort === pattern;
            }
            // Check for domain suffix match (with or without leading dot)
            if (pattern.startsWith('.')) {
                // Pattern ".example.com" should match "sub.example.com" and "example.com"
                // but NOT "notexample.com"
                const suffix = pattern;
                return hostname === pattern.substring(1) || hostname.endsWith(suffix);
            }
            // Check for exact hostname match or IP address
            return hostname === pattern;
        });
    }
    catch {
        // If URL parsing fails, don't bypass proxy
        return false;
    }
}
/**
 * Create an HttpsProxyAgent with optional mTLS configuration
 * Skips local DNS resolution to let the proxy handle it
 */
function createHttpsProxyAgent(proxyUrl, extra = {}) {
    const mtlsConfig = (0, mtls_js_1.getMTLSConfig)();
    const caCerts = (0, caCerts_js_1.getCACertificates)();
    const agentOptions = {
        ...(mtlsConfig && {
            cert: mtlsConfig.cert,
            key: mtlsConfig.key,
            passphrase: mtlsConfig.passphrase,
        }),
        ...(caCerts && { ca: caCerts }),
    };
    if ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_PROXY_RESOLVES_HOSTS)) {
        // Skip local DNS resolution - let the proxy resolve hostnames
        // This is needed for environments where DNS is not configured locally
        // and instead handled by the proxy (as in sandboxes)
        agentOptions.lookup = (hostname, options, callback) => {
            callback(null, hostname, getAddressFamily(options));
        };
    }
    return new https_proxy_agent_1.HttpsProxyAgent(proxyUrl, { ...agentOptions, ...extra });
}
/**
 * Axios instance with its own proxy agent. Same NO_PROXY/mTLS/CA
 * resolution as the global interceptor, but agent options stay
 * scoped to this instance.
 */
function createAxiosInstance(extra = {}) {
    const proxyUrl = getProxyUrl();
    const mtlsAgent = (0, mtls_js_1.getMTLSAgent)();
    const instance = axios_1.default.create({ proxy: false });
    if (!proxyUrl) {
        if (mtlsAgent)
            instance.defaults.httpsAgent = mtlsAgent;
        return instance;
    }
    const proxyAgent = createHttpsProxyAgent(proxyUrl, extra);
    instance.interceptors.request.use(config => {
        if (config.url && shouldBypassProxy(config.url)) {
            config.httpsAgent = mtlsAgent;
            config.httpAgent = mtlsAgent;
        }
        else {
            config.httpsAgent = proxyAgent;
            config.httpAgent = proxyAgent;
        }
        return config;
    });
    return instance;
}
/**
 * Get or create a memoized proxy agent for the given URI
 * Now respects NO_PROXY environment variable
 */
exports.getProxyAgent = (0, memoize_js_1.default)((uri) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const undiciMod = require('undici');
    const mtlsConfig = (0, mtls_js_1.getMTLSConfig)();
    const caCerts = (0, caCerts_js_1.getCACertificates)();
    // Use EnvHttpProxyAgent to respect NO_PROXY
    // This agent automatically checks NO_PROXY for each request
    const proxyOptions = {
        // Override both HTTP and HTTPS proxy with the provided URI
        httpProxy: uri,
        httpsProxy: uri,
        noProxy: process.env.NO_PROXY || process.env.no_proxy,
    };
    // Set both connect and requestTls so TLS options apply to both paths:
    // - requestTls: used by ProxyAgent for the TLS connection through CONNECT tunnels
    // - connect: used by Agent for direct (no-proxy) connections
    if (mtlsConfig || caCerts) {
        const tlsOpts = {
            ...(mtlsConfig && {
                cert: mtlsConfig.cert,
                key: mtlsConfig.key,
                passphrase: mtlsConfig.passphrase,
            }),
            ...(caCerts && { ca: caCerts }),
        };
        proxyOptions.connect = tlsOpts;
        proxyOptions.requestTls = tlsOpts;
    }
    return new undiciMod.EnvHttpProxyAgent(proxyOptions);
});
/**
 * Get an HTTP agent configured for WebSocket proxy support
 * Returns undefined if no proxy is configured or URL should bypass proxy
 */
function getWebSocketProxyAgent(url) {
    const proxyUrl = getProxyUrl();
    if (!proxyUrl) {
        return undefined;
    }
    // Check if URL should bypass proxy
    if (shouldBypassProxy(url)) {
        return undefined;
    }
    return createHttpsProxyAgent(proxyUrl);
}
/**
 * Get the proxy URL for WebSocket connections under Bun.
 * Bun's native WebSocket supports a `proxy` string option instead of Node's `agent`.
 * Returns undefined if no proxy is configured or URL should bypass proxy.
 */
function getWebSocketProxyUrl(url) {
    const proxyUrl = getProxyUrl();
    if (!proxyUrl) {
        return undefined;
    }
    if (shouldBypassProxy(url)) {
        return undefined;
    }
    return proxyUrl;
}
/**
 * Get fetch options for the Anthropic SDK with proxy and mTLS configuration
 * Returns fetch options with appropriate dispatcher for proxy and/or mTLS
 *
 * @param opts.forAnthropicAPI - Enables ANTHROPIC_UNIX_SOCKET tunneling. This
 *   env var is set by `claude ssh` on the remote CLI to route API calls through
 *   an ssh -R forwarded unix socket to a local auth proxy. It MUST NOT leak
 *   into non-Anthropic-API fetch paths (MCP HTTP/SSE transports, etc.) or those
 *   requests get misrouted to api.anthropic.com. Only the Anthropic SDK client
 *   should pass `true` here.
 */
function getProxyFetchOptions(opts) {
    const base = keepAliveDisabled ? { keepalive: false } : {};
    // ANTHROPIC_UNIX_SOCKET tunnels through the `claude ssh` auth proxy, which
    // hardcodes the upstream to the Anthropic API. Scope to the Anthropic API
    // client so MCP/SSE/other callers don't get their requests misrouted.
    if (opts?.forAnthropicAPI) {
        const unixSocket = process.env.ANTHROPIC_UNIX_SOCKET;
        if (unixSocket && typeof Bun !== 'undefined') {
            return { ...base, unix: unixSocket };
        }
    }
    const proxyUrl = getProxyUrl();
    // If we have a proxy, use the proxy agent (which includes mTLS config)
    if (proxyUrl) {
        if (typeof Bun !== 'undefined') {
            return { ...base, proxy: proxyUrl, ...(0, mtls_js_1.getTLSFetchOptions)() };
        }
        return { ...base, dispatcher: (0, exports.getProxyAgent)(proxyUrl) };
    }
    // Otherwise, use TLS options directly if available
    return { ...base, ...(0, mtls_js_1.getTLSFetchOptions)() };
}
/**
 * Configure global HTTP agents for both axios and undici
 * This ensures all HTTP requests use the proxy and/or mTLS if configured
 */
let proxyInterceptorId;
function configureGlobalAgents() {
    const proxyUrl = getProxyUrl();
    const mtlsAgent = (0, mtls_js_1.getMTLSAgent)();
    // Eject previous interceptor to avoid stacking on repeated calls
    if (proxyInterceptorId !== undefined) {
        axios_1.default.interceptors.request.eject(proxyInterceptorId);
        proxyInterceptorId = undefined;
    }
    // Reset proxy-related defaults so reconfiguration is clean
    axios_1.default.defaults.proxy = undefined;
    axios_1.default.defaults.httpAgent = undefined;
    axios_1.default.defaults.httpsAgent = undefined;
    if (proxyUrl) {
        // workaround for https://github.com/axios/axios/issues/4531
        axios_1.default.defaults.proxy = false;
        // Create proxy agent with mTLS options if available
        const proxyAgent = createHttpsProxyAgent(proxyUrl);
        // Add axios request interceptor to handle NO_PROXY
        proxyInterceptorId = axios_1.default.interceptors.request.use(config => {
            // Check if URL should bypass proxy based on NO_PROXY
            if (config.url && shouldBypassProxy(config.url)) {
                // Bypass proxy - use mTLS agent if configured, otherwise undefined
                if (mtlsAgent) {
                    config.httpsAgent = mtlsAgent;
                    config.httpAgent = mtlsAgent;
                }
                else {
                    // Remove any proxy agents to use direct connection
                    delete config.httpsAgent;
                    delete config.httpAgent;
                }
            }
            else {
                // Use proxy agent
                config.httpsAgent = proxyAgent;
                config.httpAgent = proxyAgent;
            }
            return config;
        });
        require('undici').setGlobalDispatcher((0, exports.getProxyAgent)(proxyUrl));
    }
    else if (mtlsAgent) {
        // No proxy but mTLS is configured
        axios_1.default.defaults.httpsAgent = mtlsAgent;
        // Set undici global dispatcher with mTLS
        const mtlsOptions = (0, mtls_js_1.getTLSFetchOptions)();
        if (mtlsOptions.dispatcher) {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            ;
            require('undici').setGlobalDispatcher(mtlsOptions.dispatcher);
        }
    }
}
/**
 * Get AWS SDK client configuration with proxy support
 * Returns configuration object that can be spread into AWS service client constructors
 */
async function getAWSClientProxyConfig() {
    const proxyUrl = getProxyUrl();
    if (!proxyUrl) {
        return {};
    }
    const [{ NodeHttpHandler }, { defaultProvider }] = await Promise.all([
        Promise.resolve().then(() => __importStar(require('@smithy/node-http-handler'))),
        Promise.resolve().then(() => __importStar(require('@aws-sdk/credential-provider-node'))),
    ]);
    const agent = createHttpsProxyAgent(proxyUrl);
    const requestHandler = new NodeHttpHandler({
        httpAgent: agent,
        httpsAgent: agent,
    });
    return {
        requestHandler,
        credentials: defaultProvider({
            clientConfig: { requestHandler },
        }),
    };
}
/**
 * Clear proxy agent cache.
 */
function clearProxyCache() {
    exports.getProxyAgent.cache.clear?.();
    (0, debug_js_1.logForDebugging)('Cleared proxy agent cache');
}
