"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemoteTriggerTool = void 0;
const axios_1 = __importDefault(require("axios"));
const v4_1 = require("zod/v4");
const oauth_js_1 = require("../../constants/oauth.js");
const growthbook_js_1 = require("../../services/analytics/growthbook.js");
const client_js_1 = require("../../services/oauth/client.js");
const index_js_1 = require("../../services/policyLimits/index.js");
const Tool_js_1 = require("../../Tool.js");
const auth_js_1 = require("../../utils/auth.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const prompt_js_1 = require("./prompt.js");
const UI_js_1 = require("./UI.js");
const inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.strictObject({
    action: v4_1.z.enum(['list', 'get', 'create', 'update', 'run']),
    trigger_id: v4_1.z
        .string()
        .regex(/^[\w-]+$/)
        .optional()
        .describe('Required for get, update, and run'),
    body: v4_1.z
        .record(v4_1.z.string(), v4_1.z.unknown())
        .optional()
        .describe('JSON body for create and update'),
}));
const outputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    status: v4_1.z.number(),
    json: v4_1.z.string(),
}));
const TRIGGERS_BETA = 'ccr-triggers-2026-01-30';
exports.RemoteTriggerTool = (0, Tool_js_1.buildTool)({
    name: prompt_js_1.REMOTE_TRIGGER_TOOL_NAME,
    searchHint: 'manage scheduled remote agent triggers',
    maxResultSizeChars: 100000,
    shouldDefer: true,
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    isEnabled() {
        return ((0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_surreal_dali', false) &&
            (0, index_js_1.isPolicyAllowed)('allow_remote_sessions'));
    },
    isConcurrencySafe() {
        return true;
    },
    isReadOnly(input) {
        return input.action === 'list' || input.action === 'get';
    },
    toAutoClassifierInput(input) {
        return `RemoteTrigger ${input.action}${input.trigger_id ? ` ${input.trigger_id}` : ''}`;
    },
    async description() {
        return prompt_js_1.DESCRIPTION;
    },
    async prompt() {
        return prompt_js_1.PROMPT;
    },
    async call(input, context) {
        await (0, auth_js_1.checkAndRefreshOAuthTokenIfNeeded)();
        const accessToken = (0, auth_js_1.getClaudeAIOAuthTokens)()?.accessToken;
        if (!accessToken) {
            throw new Error('Not authenticated with a claude.ai account. Run /login and try again.');
        }
        const orgUUID = await (0, client_js_1.getOrganizationUUID)();
        if (!orgUUID) {
            throw new Error('Unable to resolve organization UUID.');
        }
        const base = `${(0, oauth_js_1.getOauthConfig)().BASE_API_URL}/v1/code/triggers`;
        const headers = {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
            'anthropic-beta': TRIGGERS_BETA,
            'x-organization-uuid': orgUUID,
        };
        const { action, trigger_id, body } = input;
        let method;
        let url;
        let data;
        switch (action) {
            case 'list':
                method = 'GET';
                url = base;
                break;
            case 'get':
                if (!trigger_id)
                    throw new Error('get requires trigger_id');
                method = 'GET';
                url = `${base}/${trigger_id}`;
                break;
            case 'create':
                if (!body)
                    throw new Error('create requires body');
                method = 'POST';
                url = base;
                data = body;
                break;
            case 'update':
                if (!trigger_id)
                    throw new Error('update requires trigger_id');
                if (!body)
                    throw new Error('update requires body');
                method = 'POST';
                url = `${base}/${trigger_id}`;
                data = body;
                break;
            case 'run':
                if (!trigger_id)
                    throw new Error('run requires trigger_id');
                method = 'POST';
                url = `${base}/${trigger_id}/run`;
                data = {};
                break;
        }
        const res = await axios_1.default.request({
            method,
            url,
            headers,
            data,
            timeout: 20000,
            signal: context.abortController.signal,
            validateStatus: () => true,
        });
        return {
            data: {
                status: res.status,
                json: (0, slowOperations_js_1.jsonStringify)(res.data),
            },
        };
    },
    mapToolResultToToolResultBlockParam(output, toolUseID) {
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: `HTTP ${output.status}\n${output.json}`,
        };
    },
    renderToolUseMessage: UI_js_1.renderToolUseMessage,
    renderToolResultMessage: UI_js_1.renderToolResultMessage,
});
