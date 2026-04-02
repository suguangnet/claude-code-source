"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchUtilization = fetchUtilization;
const axios_1 = __importDefault(require("axios"));
const oauth_js_1 = require("../../constants/oauth.js");
const auth_js_1 = require("../../utils/auth.js");
const http_js_1 = require("../../utils/http.js");
const userAgent_js_1 = require("../../utils/userAgent.js");
const client_js_1 = require("../oauth/client.js");
async function fetchUtilization() {
    if (!(0, auth_js_1.isClaudeAISubscriber)() || !(0, auth_js_1.hasProfileScope)()) {
        return {};
    }
    // Skip API call if OAuth token is expired to avoid 401 errors
    const tokens = (0, auth_js_1.getClaudeAIOAuthTokens)();
    if (tokens && (0, client_js_1.isOAuthTokenExpired)(tokens.expiresAt)) {
        return null;
    }
    const authResult = (0, http_js_1.getAuthHeaders)();
    if (authResult.error) {
        throw new Error(`Auth error: ${authResult.error}`);
    }
    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': (0, userAgent_js_1.getClaudeCodeUserAgent)(),
        ...authResult.headers,
    };
    const url = `${(0, oauth_js_1.getOauthConfig)().BASE_API_URL}/api/oauth/usage`;
    const response = await axios_1.default.get(url, {
        headers,
        timeout: 5000, // 5 second timeout
    });
    return response.data;
}
