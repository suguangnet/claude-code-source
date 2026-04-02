"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthCodeListener = void 0;
const http_1 = require("http");
const index_js_1 = require("src/services/analytics/index.js");
const oauth_js_1 = require("../../constants/oauth.js");
const log_js_1 = require("../../utils/log.js");
const client_js_1 = require("./client.js");
/**
 * Temporary localhost HTTP server that listens for OAuth authorization code redirects.
 *
 * When the user authorizes in their browser, the OAuth provider redirects to:
 * http://localhost:[port]/callback?code=AUTH_CODE&state=STATE
 *
 * This server captures that redirect and extracts the auth code.
 * Note: This is NOT an OAuth server - it's just a redirect capture mechanism.
 */
class AuthCodeListener {
    constructor(callbackPath = '/callback') {
        this.port = 0;
        this.promiseResolver = null;
        this.promiseRejecter = null;
        this.expectedState = null; // State parameter for CSRF protection
        this.pendingResponse = null; // Response object for final redirect
        this.localServer = (0, http_1.createServer)();
        this.callbackPath = callbackPath;
    }
    /**
     * Starts listening on an OS-assigned port and returns the port number.
     * This avoids race conditions by keeping the server open until it's used.
     * @param port Optional specific port to use. If not provided, uses OS-assigned port.
     */
    async start(port) {
        return new Promise((resolve, reject) => {
            this.localServer.once('error', err => {
                reject(new Error(`Failed to start OAuth callback server: ${err.message}`));
            });
            // Listen on specified port or 0 to let the OS assign an available port
            this.localServer.listen(port ?? 0, 'localhost', () => {
                const address = this.localServer.address();
                this.port = address.port;
                resolve(this.port);
            });
        });
    }
    getPort() {
        return this.port;
    }
    hasPendingResponse() {
        return this.pendingResponse !== null;
    }
    async waitForAuthorization(state, onReady) {
        return new Promise((resolve, reject) => {
            this.promiseResolver = resolve;
            this.promiseRejecter = reject;
            this.expectedState = state;
            this.startLocalListener(onReady);
        });
    }
    /**
     * Completes the OAuth flow by redirecting the user's browser to a success page.
     * Different success pages are shown based on the granted scopes.
     * @param scopes The OAuth scopes that were granted
     * @param customHandler Optional custom handler to serve response instead of redirecting
     */
    handleSuccessRedirect(scopes, customHandler) {
        if (!this.pendingResponse)
            return;
        // If custom handler provided, use it instead of default redirect
        if (customHandler) {
            customHandler(this.pendingResponse, scopes);
            this.pendingResponse = null;
            (0, index_js_1.logEvent)('tengu_oauth_automatic_redirect', { custom_handler: true });
            return;
        }
        // Default behavior: Choose success page based on granted permissions
        const successUrl = (0, client_js_1.shouldUseClaudeAIAuth)(scopes)
            ? (0, oauth_js_1.getOauthConfig)().CLAUDEAI_SUCCESS_URL
            : (0, oauth_js_1.getOauthConfig)().CONSOLE_SUCCESS_URL;
        // Send browser to success page
        this.pendingResponse.writeHead(302, { Location: successUrl });
        this.pendingResponse.end();
        this.pendingResponse = null;
        (0, index_js_1.logEvent)('tengu_oauth_automatic_redirect', {});
    }
    /**
     * Handles error case by sending a redirect to the appropriate success page with an error indicator,
     * ensuring the browser flow is completed properly.
     */
    handleErrorRedirect() {
        if (!this.pendingResponse)
            return;
        // TODO: swap to a different url once we have an error page
        const errorUrl = (0, oauth_js_1.getOauthConfig)().CLAUDEAI_SUCCESS_URL;
        // Send browser to error page
        this.pendingResponse.writeHead(302, { Location: errorUrl });
        this.pendingResponse.end();
        this.pendingResponse = null;
        (0, index_js_1.logEvent)('tengu_oauth_automatic_redirect_error', {});
    }
    startLocalListener(onReady) {
        // Server is already created and listening, just set up handlers
        this.localServer.on('request', this.handleRedirect.bind(this));
        this.localServer.on('error', this.handleError.bind(this));
        // Server is already listening, so we can call onReady immediately
        void onReady();
    }
    handleRedirect(req, res) {
        const parsedUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
        if (parsedUrl.pathname !== this.callbackPath) {
            res.writeHead(404);
            res.end();
            return;
        }
        const authCode = parsedUrl.searchParams.get('code') ?? undefined;
        const state = parsedUrl.searchParams.get('state') ?? undefined;
        this.validateAndRespond(authCode, state, res);
    }
    validateAndRespond(authCode, state, res) {
        if (!authCode) {
            res.writeHead(400);
            res.end('Authorization code not found');
            this.reject(new Error('No authorization code received'));
            return;
        }
        if (state !== this.expectedState) {
            res.writeHead(400);
            res.end('Invalid state parameter');
            this.reject(new Error('Invalid state parameter'));
            return;
        }
        // Store the response for later redirect
        this.pendingResponse = res;
        this.resolve(authCode);
    }
    handleError(err) {
        (0, log_js_1.logError)(err);
        this.close();
        this.reject(err);
    }
    resolve(authorizationCode) {
        if (this.promiseResolver) {
            this.promiseResolver(authorizationCode);
            this.promiseResolver = null;
            this.promiseRejecter = null;
        }
    }
    reject(error) {
        if (this.promiseRejecter) {
            this.promiseRejecter(error);
            this.promiseResolver = null;
            this.promiseRejecter = null;
        }
    }
    close() {
        // If we have a pending response, send a redirect before closing
        if (this.pendingResponse) {
            this.handleErrorRedirect();
        }
        if (this.localServer) {
            // Remove all listeners to prevent memory leaks
            this.localServer.removeAllListeners();
            this.localServer.close();
        }
    }
}
exports.AuthCodeListener = AuthCodeListener;
