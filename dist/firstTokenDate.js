"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchAndStoreClaudeCodeFirstTokenDate = fetchAndStoreClaudeCodeFirstTokenDate;
const axios_1 = __importDefault(require("axios"));
const oauth_js_1 = require("../../constants/oauth.js");
const config_js_1 = require("../../utils/config.js");
const http_js_1 = require("../../utils/http.js");
const log_js_1 = require("../../utils/log.js");
const userAgent_js_1 = require("../../utils/userAgent.js");
/**
 * Fetch the user's first Claude Code token date and store in config.
 * This is called after successful login to cache when they started using Claude Code.
 */
async function fetchAndStoreClaudeCodeFirstTokenDate() {
    try {
        const config = (0, config_js_1.getGlobalConfig)();
        if (config.claudeCodeFirstTokenDate !== undefined) {
            return;
        }
        const authHeaders = (0, http_js_1.getAuthHeaders)();
        if (authHeaders.error) {
            (0, log_js_1.logError)(new Error(`Failed to get auth headers: ${authHeaders.error}`));
            return;
        }
        const oauthConfig = (0, oauth_js_1.getOauthConfig)();
        const url = `${oauthConfig.BASE_API_URL}/api/organization/claude_code_first_token_date`;
        const response = await axios_1.default.get(url, {
            headers: {
                ...authHeaders.headers,
                'User-Agent': (0, userAgent_js_1.getClaudeCodeUserAgent)(),
            },
            timeout: 10000,
        });
        const firstTokenDate = response.data?.first_token_date ?? null;
        // Validate the date if it's not null
        if (firstTokenDate !== null) {
            const dateTime = new Date(firstTokenDate).getTime();
            if (isNaN(dateTime)) {
                (0, log_js_1.logError)(new Error(`Received invalid first_token_date from API: ${firstTokenDate}`));
                // Don't save invalid dates
                return;
            }
        }
        (0, config_js_1.saveGlobalConfig)(current => ({
            ...current,
            claudeCodeFirstTokenDate: firstTokenDate,
        }));
    }
    catch (error) {
        (0, log_js_1.logError)(error);
    }
}
