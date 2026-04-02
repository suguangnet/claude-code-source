"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOauthProfileFromApiKey = getOauthProfileFromApiKey;
exports.getOauthProfileFromOauthToken = getOauthProfileFromOauthToken;
const axios_1 = __importDefault(require("axios"));
const oauth_js_1 = require("src/constants/oauth.js");
const auth_js_1 = require("src/utils/auth.js");
const config_js_1 = require("src/utils/config.js");
const log_js_1 = require("src/utils/log.js");
async function getOauthProfileFromApiKey() {
    // Assumes interactive session
    const config = (0, config_js_1.getGlobalConfig)();
    const accountUuid = config.oauthAccount?.accountUuid;
    const apiKey = (0, auth_js_1.getAnthropicApiKey)();
    // Need both account UUID and API key to check
    if (!accountUuid || !apiKey) {
        return;
    }
    const endpoint = `${(0, oauth_js_1.getOauthConfig)().BASE_API_URL}/api/claude_cli_profile`;
    try {
        const response = await axios_1.default.get(endpoint, {
            headers: {
                'x-api-key': apiKey,
                'anthropic-beta': oauth_js_1.OAUTH_BETA_HEADER,
            },
            params: {
                account_uuid: accountUuid,
            },
            timeout: 10000,
        });
        return response.data;
    }
    catch (error) {
        (0, log_js_1.logError)(error);
    }
}
async function getOauthProfileFromOauthToken(accessToken) {
    const endpoint = `${(0, oauth_js_1.getOauthConfig)().BASE_API_URL}/api/oauth/profile`;
    try {
        const response = await axios_1.default.get(endpoint, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            timeout: 10000,
        });
        return response.data;
    }
    catch (error) {
        (0, log_js_1.logError)(error);
    }
}
