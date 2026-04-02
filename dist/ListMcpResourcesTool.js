"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListMcpResourcesTool = void 0;
const v4_1 = require("zod/v4");
const client_js_1 = require("../../services/mcp/client.js");
const Tool_js_1 = require("../../Tool.js");
const errors_js_1 = require("../../utils/errors.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const log_js_1 = require("../../utils/log.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const terminal_js_1 = require("../../utils/terminal.js");
const prompt_js_1 = require("./prompt.js");
const UI_js_1 = require("./UI.js");
const inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    server: v4_1.z
        .string()
        .optional()
        .describe('Optional server name to filter resources by'),
}));
const outputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.array(v4_1.z.object({
    uri: v4_1.z.string().describe('Resource URI'),
    name: v4_1.z.string().describe('Resource name'),
    mimeType: v4_1.z.string().optional().describe('MIME type of the resource'),
    description: v4_1.z.string().optional().describe('Resource description'),
    server: v4_1.z.string().describe('Server that provides this resource'),
})));
exports.ListMcpResourcesTool = (0, Tool_js_1.buildTool)({
    isConcurrencySafe() {
        return true;
    },
    isReadOnly() {
        return true;
    },
    toAutoClassifierInput(input) {
        return input.server ?? '';
    },
    shouldDefer: true,
    name: prompt_js_1.LIST_MCP_RESOURCES_TOOL_NAME,
    searchHint: 'list resources from connected MCP servers',
    maxResultSizeChars: 100000,
    async description() {
        return prompt_js_1.DESCRIPTION;
    },
    async prompt() {
        return prompt_js_1.PROMPT;
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    async call(input, { options: { mcpClients } }) {
        const { server: targetServer } = input;
        const clientsToProcess = targetServer
            ? mcpClients.filter(client => client.name === targetServer)
            : mcpClients;
        if (targetServer && clientsToProcess.length === 0) {
            throw new Error(`Server "${targetServer}" not found. Available servers: ${mcpClients.map(c => c.name).join(', ')}`);
        }
        // fetchResourcesForClient is LRU-cached (by server name) and already
        // warm from startup prefetch. Cache is invalidated on onclose and on
        // resources/list_changed notifications, so results are never stale.
        // ensureConnectedClient is a no-op when healthy (memoize hit), but after
        // onclose it returns a fresh connection so the re-fetch succeeds.
        const results = await Promise.all(clientsToProcess.map(async (client) => {
            if (client.type !== 'connected')
                return [];
            try {
                const fresh = await (0, client_js_1.ensureConnectedClient)(client);
                return await (0, client_js_1.fetchResourcesForClient)(fresh);
            }
            catch (error) {
                // One server's reconnect failure shouldn't sink the whole result.
                (0, log_js_1.logMCPError)(client.name, (0, errors_js_1.errorMessage)(error));
                return [];
            }
        }));
        return {
            data: results.flat(),
        };
    },
    renderToolUseMessage: UI_js_1.renderToolUseMessage,
    userFacingName: () => 'listMcpResources',
    renderToolResultMessage: UI_js_1.renderToolResultMessage,
    isResultTruncated(output) {
        return (0, terminal_js_1.isOutputLineTruncated)((0, slowOperations_js_1.jsonStringify)(output));
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        if (!content || content.length === 0) {
            return {
                tool_use_id: toolUseID,
                type: 'tool_result',
                content: 'No resources found. MCP servers may still provide tools even if they have no resources.',
            };
        }
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: (0, slowOperations_js_1.jsonStringify)(content),
        };
    },
});
