"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchEnvironments = fetchEnvironments;
exports.createDefaultCloudEnvironment = createDefaultCloudEnvironment;
const axios_1 = __importDefault(require("axios"));
const oauth_js_1 = require("src/constants/oauth.js");
const client_js_1 = require("src/services/oauth/client.js");
const auth_js_1 = require("../auth.js");
const errors_js_1 = require("../errors.js");
const log_js_1 = require("../log.js");
const api_js_1 = require("./api.js");
/**
 * Fetches the list of available environments from the Environment API
 * @returns Promise<EnvironmentResource[]> Array of available environments
 * @throws Error if the API request fails or no access token is available
 */
async function fetchEnvironments() {
    const accessToken = (0, auth_js_1.getClaudeAIOAuthTokens)()?.accessToken;
    if (!accessToken) {
        throw new Error('Claude Code web sessions require authentication with a Claude.ai account. API key authentication is not sufficient. Please run /login to authenticate, or check your authentication status with /status.');
    }
    const orgUUID = await (0, client_js_1.getOrganizationUUID)();
    if (!orgUUID) {
        throw new Error('Unable to get organization UUID');
    }
    const url = `${(0, oauth_js_1.getOauthConfig)().BASE_API_URL}/v1/environment_providers`;
    try {
        const headers = {
            ...(0, api_js_1.getOAuthHeaders)(accessToken),
            'x-organization-uuid': orgUUID,
        };
        const response = await axios_1.default.get(url, {
            headers,
            timeout: 15000,
        });
        if (response.status !== 200) {
            throw new Error(`Failed to fetch environments: ${response.status} ${response.statusText}`);
        }
        return response.data.environments;
    }
    catch (error) {
        const err = (0, errors_js_1.toError)(error);
        (0, log_js_1.logError)(err);
        throw new Error(`Failed to fetch environments: ${err.message}`);
    }
}
/**
 * Creates a default anthropic_cloud environment for users who have none.
 * Uses the public environment_providers route (same auth as fetchEnvironments).
 */
async function createDefaultCloudEnvironment(name) {
    const accessToken = (0, auth_js_1.getClaudeAIOAuthTokens)()?.accessToken;
    if (!accessToken) {
        throw new Error('No access token available');
    }
    const orgUUID = await (0, client_js_1.getOrganizationUUID)();
    if (!orgUUID) {
        throw new Error('Unable to get organization UUID');
    }
    const url = `${(0, oauth_js_1.getOauthConfig)().BASE_API_URL}/v1/environment_providers/cloud/create`;
    const response = await axios_1.default.post(url, {
        name,
        kind: 'anthropic_cloud',
        description: '',
        config: {
            environment_type: 'anthropic',
            cwd: '/home/user',
            init_script: null,
            environment: {},
            languages: [
                { name: 'python', version: '3.11' },
                { name: 'node', version: '20' },
            ],
            network_config: {
                allowed_hosts: [],
                allow_default_hosts: true,
            },
        },
    }, {
        headers: {
            ...(0, api_js_1.getOAuthHeaders)(accessToken),
            'anthropic-beta': 'ccr-byoc-2025-07-29',
            'x-organization-uuid': orgUUID,
        },
        timeout: 15000,
    });
    return response.data;
}
