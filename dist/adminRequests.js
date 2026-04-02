"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAdminRequest = createAdminRequest;
exports.getMyAdminRequests = getMyAdminRequests;
exports.checkAdminRequestEligibility = checkAdminRequestEligibility;
const axios_1 = __importDefault(require("axios"));
const oauth_js_1 = require("../../constants/oauth.js");
const api_js_1 = require("../../utils/teleport/api.js");
/**
 * Create an admin request (limit increase or seat upgrade).
 *
 * For Team/Enterprise users who don't have billing/admin permissions,
 * this creates a request that their admin can act on.
 *
 * If a pending request of the same type already exists for this user,
 * returns the existing request instead of creating a new one.
 */
async function createAdminRequest(params) {
    const { accessToken, orgUUID } = await (0, api_js_1.prepareApiRequest)();
    const headers = {
        ...(0, api_js_1.getOAuthHeaders)(accessToken),
        'x-organization-uuid': orgUUID,
    };
    const url = `${(0, oauth_js_1.getOauthConfig)().BASE_API_URL}/api/oauth/organizations/${orgUUID}/admin_requests`;
    const response = await axios_1.default.post(url, params, { headers });
    return response.data;
}
/**
 * Get pending admin request of a specific type for the current user.
 *
 * Returns the pending request if one exists, otherwise null.
 */
async function getMyAdminRequests(requestType, statuses) {
    const { accessToken, orgUUID } = await (0, api_js_1.prepareApiRequest)();
    const headers = {
        ...(0, api_js_1.getOAuthHeaders)(accessToken),
        'x-organization-uuid': orgUUID,
    };
    let url = `${(0, oauth_js_1.getOauthConfig)().BASE_API_URL}/api/oauth/organizations/${orgUUID}/admin_requests/me?request_type=${requestType}`;
    for (const status of statuses) {
        url += `&statuses=${status}`;
    }
    const response = await axios_1.default.get(url, {
        headers,
    });
    return response.data;
}
/**
 * Check if a specific admin request type is allowed for this org.
 */
async function checkAdminRequestEligibility(requestType) {
    const { accessToken, orgUUID } = await (0, api_js_1.prepareApiRequest)();
    const headers = {
        ...(0, api_js_1.getOAuthHeaders)(accessToken),
        'x-organization-uuid': orgUUID,
    };
    const url = `${(0, oauth_js_1.getOauthConfig)().BASE_API_URL}/api/oauth/organizations/${orgUUID}/admin_requests/eligibility?request_type=${requestType}`;
    const response = await axios_1.default.get(url, {
        headers,
    });
    return response.data;
}
