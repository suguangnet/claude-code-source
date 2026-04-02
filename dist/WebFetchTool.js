"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebFetchTool = void 0;
const v4_1 = require("zod/v4");
const Tool_js_1 = require("../../Tool.js");
const format_js_1 = require("../../utils/format.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const permissions_js_1 = require("../../utils/permissions/permissions.js");
const preapproved_js_1 = require("./preapproved.js");
const prompt_js_1 = require("./prompt.js");
const UI_js_1 = require("./UI.js");
const utils_js_1 = require("./utils.js");
const inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.strictObject({
    url: v4_1.z.string().url().describe('The URL to fetch content from'),
    prompt: v4_1.z.string().describe('The prompt to run on the fetched content'),
}));
const outputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    bytes: v4_1.z.number().describe('Size of the fetched content in bytes'),
    code: v4_1.z.number().describe('HTTP response code'),
    codeText: v4_1.z.string().describe('HTTP response code text'),
    result: v4_1.z
        .string()
        .describe('Processed result from applying the prompt to the content'),
    durationMs: v4_1.z
        .number()
        .describe('Time taken to fetch and process the content'),
    url: v4_1.z.string().describe('The URL that was fetched'),
}));
function webFetchToolInputToPermissionRuleContent(input) {
    try {
        const parsedInput = exports.WebFetchTool.inputSchema.safeParse(input);
        if (!parsedInput.success) {
            return `input:${input.toString()}`;
        }
        const { url } = parsedInput.data;
        const hostname = new URL(url).hostname;
        return `domain:${hostname}`;
    }
    catch {
        return `input:${input.toString()}`;
    }
}
exports.WebFetchTool = (0, Tool_js_1.buildTool)({
    name: prompt_js_1.WEB_FETCH_TOOL_NAME,
    searchHint: 'fetch and extract content from a URL',
    // 100K chars - tool result persistence threshold
    maxResultSizeChars: 100000,
    shouldDefer: true,
    async description(input) {
        const { url } = input;
        try {
            const hostname = new URL(url).hostname;
            return `Claude wants to fetch content from ${hostname}`;
        }
        catch {
            return `Claude wants to fetch content from this URL`;
        }
    },
    userFacingName() {
        return 'Fetch';
    },
    getToolUseSummary: UI_js_1.getToolUseSummary,
    getActivityDescription(input) {
        const summary = (0, UI_js_1.getToolUseSummary)(input);
        return summary ? `Fetching ${summary}` : 'Fetching web page';
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    isConcurrencySafe() {
        return true;
    },
    isReadOnly() {
        return true;
    },
    toAutoClassifierInput(input) {
        return input.prompt ? `${input.url}: ${input.prompt}` : input.url;
    },
    async checkPermissions(input, context) {
        const appState = context.getAppState();
        const permissionContext = appState.toolPermissionContext;
        // Check if the hostname is in the preapproved list
        try {
            const { url } = input;
            const parsedUrl = new URL(url);
            if ((0, preapproved_js_1.isPreapprovedHost)(parsedUrl.hostname, parsedUrl.pathname)) {
                return {
                    behavior: 'allow',
                    updatedInput: input,
                    decisionReason: { type: 'other', reason: 'Preapproved host' },
                };
            }
        }
        catch {
            // If URL parsing fails, continue with normal permission checks
        }
        // Check for a rule specific to the tool input (matching hostname)
        const ruleContent = webFetchToolInputToPermissionRuleContent(input);
        const denyRule = (0, permissions_js_1.getRuleByContentsForTool)(permissionContext, exports.WebFetchTool, 'deny').get(ruleContent);
        if (denyRule) {
            return {
                behavior: 'deny',
                message: `${exports.WebFetchTool.name} denied access to ${ruleContent}.`,
                decisionReason: {
                    type: 'rule',
                    rule: denyRule,
                },
            };
        }
        const askRule = (0, permissions_js_1.getRuleByContentsForTool)(permissionContext, exports.WebFetchTool, 'ask').get(ruleContent);
        if (askRule) {
            return {
                behavior: 'ask',
                message: `Claude requested permissions to use ${exports.WebFetchTool.name}, but you haven't granted it yet.`,
                decisionReason: {
                    type: 'rule',
                    rule: askRule,
                },
                suggestions: buildSuggestions(ruleContent),
            };
        }
        const allowRule = (0, permissions_js_1.getRuleByContentsForTool)(permissionContext, exports.WebFetchTool, 'allow').get(ruleContent);
        if (allowRule) {
            return {
                behavior: 'allow',
                updatedInput: input,
                decisionReason: {
                    type: 'rule',
                    rule: allowRule,
                },
            };
        }
        return {
            behavior: 'ask',
            message: `Claude requested permissions to use ${exports.WebFetchTool.name}, but you haven't granted it yet.`,
            suggestions: buildSuggestions(ruleContent),
        };
    },
    async prompt(_options) {
        // Always include the auth warning regardless of whether ToolSearch is
        // currently in the tools list. Conditionally toggling this prefix based
        // on ToolSearch availability caused the tool description to flicker
        // between SDK query() calls (when ToolSearch enablement varies due to
        // MCP tool count thresholds), invalidating the Anthropic API prompt
        // cache on each toggle — two consecutive cache misses per flicker event.
        return `IMPORTANT: WebFetch WILL FAIL for authenticated or private URLs. Before using this tool, check if the URL points to an authenticated service (e.g. Google Docs, Confluence, Jira, GitHub). If so, look for a specialized MCP tool that provides authenticated access.
${prompt_js_1.DESCRIPTION}`;
    },
    async validateInput(input) {
        const { url } = input;
        try {
            new URL(url);
        }
        catch {
            return {
                result: false,
                message: `Error: Invalid URL "${url}". The URL provided could not be parsed.`,
                meta: { reason: 'invalid_url' },
                errorCode: 1,
            };
        }
        return { result: true };
    },
    renderToolUseMessage: UI_js_1.renderToolUseMessage,
    renderToolUseProgressMessage: UI_js_1.renderToolUseProgressMessage,
    renderToolResultMessage: UI_js_1.renderToolResultMessage,
    async call({ url, prompt }, { abortController, options: { isNonInteractiveSession } }) {
        const start = Date.now();
        const response = await (0, utils_js_1.getURLMarkdownContent)(url, abortController);
        // Check if we got a redirect to a different host
        if ('type' in response && response.type === 'redirect') {
            const statusText = response.statusCode === 301
                ? 'Moved Permanently'
                : response.statusCode === 308
                    ? 'Permanent Redirect'
                    : response.statusCode === 307
                        ? 'Temporary Redirect'
                        : 'Found';
            const message = `REDIRECT DETECTED: The URL redirects to a different host.

Original URL: ${response.originalUrl}
Redirect URL: ${response.redirectUrl}
Status: ${response.statusCode} ${statusText}

To complete your request, I need to fetch content from the redirected URL. Please use WebFetch again with these parameters:
- url: "${response.redirectUrl}"
- prompt: "${prompt}"`;
            const output = {
                bytes: Buffer.byteLength(message),
                code: response.statusCode,
                codeText: statusText,
                result: message,
                durationMs: Date.now() - start,
                url,
            };
            return {
                data: output,
            };
        }
        const { content, bytes, code, codeText, contentType, persistedPath, persistedSize, } = response;
        const isPreapproved = (0, utils_js_1.isPreapprovedUrl)(url);
        let result;
        if (isPreapproved &&
            contentType.includes('text/markdown') &&
            content.length < utils_js_1.MAX_MARKDOWN_LENGTH) {
            result = content;
        }
        else {
            result = await (0, utils_js_1.applyPromptToMarkdown)(prompt, content, abortController.signal, isNonInteractiveSession, isPreapproved);
        }
        // Binary content (PDFs, etc.) was additionally saved to disk with a
        // mime-derived extension. Note it so Claude can inspect the raw file
        // if the Haiku summary above isn't enough.
        if (persistedPath) {
            result += `\n\n[Binary content (${contentType}, ${(0, format_js_1.formatFileSize)(persistedSize ?? bytes)}) also saved to ${persistedPath}]`;
        }
        const output = {
            bytes,
            code,
            codeText,
            result,
            durationMs: Date.now() - start,
            url,
        };
        return {
            data: output,
        };
    },
    mapToolResultToToolResultBlockParam({ result }, toolUseID) {
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: result,
        };
    },
});
function buildSuggestions(ruleContent) {
    return [
        {
            type: 'addRules',
            destination: 'localSettings',
            rules: [{ toolName: prompt_js_1.WEB_FETCH_TOOL_NAME, ruleContent }],
            behavior: 'allow',
        },
    ];
}
