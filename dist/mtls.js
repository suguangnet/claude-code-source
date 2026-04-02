"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMTLSAgent = exports.getMTLSConfig = void 0;
exports.getWebSocketTLSOptions = getWebSocketTLSOptions;
exports.getTLSFetchOptions = getTLSFetchOptions;
exports.clearMTLSCache = clearMTLSCache;
exports.configureGlobalMTLS = configureGlobalMTLS;
const https_1 = require("https");
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const caCerts_js_1 = require("./caCerts.js");
const debug_js_1 = require("./debug.js");
const fsOperations_js_1 = require("./fsOperations.js");
/**
 * Get mTLS configuration from environment variables
 */
exports.getMTLSConfig = (0, memoize_js_1.default)(() => {
    const config = {};
    // Note: NODE_EXTRA_CA_CERTS is automatically handled by Node.js at runtime
    // We don't need to manually load it - Node.js appends it to the built-in CAs automatically
    // Client certificate
    if (process.env.CLAUDE_CODE_CLIENT_CERT) {
        try {
            config.cert = (0, fsOperations_js_1.getFsImplementation)().readFileSync(process.env.CLAUDE_CODE_CLIENT_CERT, { encoding: 'utf8' });
            (0, debug_js_1.logForDebugging)('mTLS: Loaded client certificate from CLAUDE_CODE_CLIENT_CERT');
        }
        catch (error) {
            (0, debug_js_1.logForDebugging)(`mTLS: Failed to load client certificate: ${error}`, {
                level: 'error',
            });
        }
    }
    // Client key
    if (process.env.CLAUDE_CODE_CLIENT_KEY) {
        try {
            config.key = (0, fsOperations_js_1.getFsImplementation)().readFileSync(process.env.CLAUDE_CODE_CLIENT_KEY, { encoding: 'utf8' });
            (0, debug_js_1.logForDebugging)('mTLS: Loaded client key from CLAUDE_CODE_CLIENT_KEY');
        }
        catch (error) {
            (0, debug_js_1.logForDebugging)(`mTLS: Failed to load client key: ${error}`, {
                level: 'error',
            });
        }
    }
    // Key passphrase
    if (process.env.CLAUDE_CODE_CLIENT_KEY_PASSPHRASE) {
        config.passphrase = process.env.CLAUDE_CODE_CLIENT_KEY_PASSPHRASE;
        (0, debug_js_1.logForDebugging)('mTLS: Using client key passphrase');
    }
    // Only return config if at least one option is set
    if (Object.keys(config).length === 0) {
        return undefined;
    }
    return config;
});
/**
 * Create an HTTPS agent with mTLS configuration
 */
exports.getMTLSAgent = (0, memoize_js_1.default)(() => {
    const mtlsConfig = (0, exports.getMTLSConfig)();
    const caCerts = (0, caCerts_js_1.getCACertificates)();
    if (!mtlsConfig && !caCerts) {
        return undefined;
    }
    const agentOptions = {
        ...mtlsConfig,
        ...(caCerts && { ca: caCerts }),
        // Enable keep-alive for better performance
        keepAlive: true,
    };
    (0, debug_js_1.logForDebugging)('mTLS: Creating HTTPS agent with custom certificates');
    return new https_1.Agent(agentOptions);
});
/**
 * Get TLS options for WebSocket connections
 */
function getWebSocketTLSOptions() {
    const mtlsConfig = (0, exports.getMTLSConfig)();
    const caCerts = (0, caCerts_js_1.getCACertificates)();
    if (!mtlsConfig && !caCerts) {
        return undefined;
    }
    return {
        ...mtlsConfig,
        ...(caCerts && { ca: caCerts }),
    };
}
/**
 * Get fetch options with TLS configuration (mTLS + CA certs) for undici
 */
function getTLSFetchOptions() {
    const mtlsConfig = (0, exports.getMTLSConfig)();
    const caCerts = (0, caCerts_js_1.getCACertificates)();
    if (!mtlsConfig && !caCerts) {
        return {};
    }
    const tlsConfig = {
        ...mtlsConfig,
        ...(caCerts && { ca: caCerts }),
    };
    if (typeof Bun !== 'undefined') {
        return { tls: tlsConfig };
    }
    (0, debug_js_1.logForDebugging)('TLS: Created undici agent with custom certificates');
    // Create a custom undici Agent with TLS options. Lazy-required so that
    // the ~1.5MB undici package is only loaded when mTLS/CA certs are configured.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const undiciMod = require('undici');
    const agent = new undiciMod.Agent({
        connect: {
            cert: tlsConfig.cert,
            key: tlsConfig.key,
            passphrase: tlsConfig.passphrase,
            ...(tlsConfig.ca && { ca: tlsConfig.ca }),
        },
        pipelining: 1,
    });
    return { dispatcher: agent };
}
/**
 * Clear the mTLS configuration cache.
 */
function clearMTLSCache() {
    exports.getMTLSConfig.cache.clear?.();
    exports.getMTLSAgent.cache.clear?.();
    (0, debug_js_1.logForDebugging)('Cleared mTLS configuration cache');
}
/**
 * Configure global Node.js TLS settings
 */
function configureGlobalMTLS() {
    const mtlsConfig = (0, exports.getMTLSConfig)();
    if (!mtlsConfig) {
        return;
    }
    // NODE_EXTRA_CA_CERTS is automatically handled by Node.js at runtime
    if (process.env.NODE_EXTRA_CA_CERTS) {
        (0, debug_js_1.logForDebugging)('NODE_EXTRA_CA_CERTS detected - Node.js will automatically append to built-in CAs');
    }
}
