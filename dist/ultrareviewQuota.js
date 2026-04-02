"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchUltrareviewQuota = fetchUltrareviewQuota;
const axios_1 = __importDefault(require("axios"));
const oauth_js_1 = require("../../constants/oauth.js");
const auth_js_1 = require("../../utils/auth.js");
const debug_js_1 = require("../../utils/debug.js");
const api_js_1 = require("../../utils/teleport/api.js");
/**
 * Peek the ultrareview quota for display and nudge decisions. Consume
 * happens server-side at session creation. Null when not a subscriber or
 * the endpoint errors.
 */
async function fetchUltrareviewQuota() {
    if (!(0, auth_js_1.isClaudeAISubscriber)())
        return null;
    try {
        const { accessToken, orgUUID } = await (0, api_js_1.prepareApiRequest)();
        const response = await axios_1.default.get(`${(0, oauth_js_1.getOauthConfig)().BASE_API_URL}/v1/ultrareview/quota`, {
            headers: {
                ...(0, api_js_1.getOAuthHeaders)(accessToken),
                'x-organization-uuid': orgUUID,
            },
            timeout: 5000,
        });
        return response.data;
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`fetchUltrareviewQuota failed: ${error}`);
        return null;
    }
}
