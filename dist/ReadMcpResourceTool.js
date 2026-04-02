"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadMcpResourceTool = exports.outputSchema = exports.inputSchema = void 0;
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const v4_1 = require("zod/v4");
const client_js_1 = require("../../services/mcp/client.js");
const Tool_js_1 = require("../../Tool.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const mcpOutputStorage_js_1 = require("../../utils/mcpOutputStorage.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const terminal_js_1 = require("../../utils/terminal.js");
const prompt_js_1 = require("./prompt.js");
const UI_js_1 = require("./UI.js");
exports.inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    server: v4_1.z.string().describe('The MCP server name'),
    uri: v4_1.z.string().describe('The resource URI to read'),
}));
exports.outputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    contents: v4_1.z.array(v4_1.z.object({
        uri: v4_1.z.string().describe('Resource URI'),
        mimeType: v4_1.z.string().optional().describe('MIME type of the content'),
        text: v4_1.z.string().optional().describe('Text content of the resource'),
        blobSavedTo: v4_1.z
            .string()
            .optional()
            .describe('Path where binary blob content was saved'),
    })),
}));
exports.ReadMcpResourceTool = (0, Tool_js_1.buildTool)({
    isConcurrencySafe() {
        return true;
    },
    isReadOnly() {
        return true;
    },
    toAutoClassifierInput(input) {
        return `${input.server} ${input.uri}`;
    },
    shouldDefer: true,
    name: 'ReadMcpResourceTool',
    searchHint: 'read a specific MCP resource by URI',
    maxResultSizeChars: 100000,
    async description() {
        return prompt_js_1.DESCRIPTION;
    },
    async prompt() {
        return prompt_js_1.PROMPT;
    },
    get inputSchema() {
        return (0, exports.inputSchema)();
    },
    get outputSchema() {
        return (0, exports.outputSchema)();
    },
    async call(input, { options: { mcpClients } }) {
        const { server: serverName, uri } = input;
        const client = mcpClients.find(client => client.name === serverName);
        if (!client) {
            throw new Error(`Server "${serverName}" not found. Available servers: ${mcpClients.map(c => c.name).join(', ')}`);
        }
        if (client.type !== 'connected') {
            throw new Error(`Server "${serverName}" is not connected`);
        }
        if (!client.capabilities?.resources) {
            throw new Error(`Server "${serverName}" does not support resources`);
        }
        const connectedClient = await (0, client_js_1.ensureConnectedClient)(client);
        const result = (await connectedClient.client.request({
            method: 'resources/read',
            params: { uri },
        }, types_js_1.ReadResourceResultSchema));
        // Intercept any blob fields: decode, write raw bytes to disk with a
        // mime-derived extension, and replace with a path. Otherwise the base64
        // would be stringified straight into the context.
        const contents = await Promise.all(result.contents.map(async (c, i) => {
            if ('text' in c) {
                return { uri: c.uri, mimeType: c.mimeType, text: c.text };
            }
            if (!('blob' in c) || typeof c.blob !== 'string') {
                return { uri: c.uri, mimeType: c.mimeType };
            }
            const persistId = `mcp-resource-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`;
            const persisted = await (0, mcpOutputStorage_js_1.persistBinaryContent)(Buffer.from(c.blob, 'base64'), c.mimeType, persistId);
            if ('error' in persisted) {
                return {
                    uri: c.uri,
                    mimeType: c.mimeType,
                    text: `Binary content could not be saved to disk: ${persisted.error}`,
                };
            }
            return {
                uri: c.uri,
                mimeType: c.mimeType,
                blobSavedTo: persisted.filepath,
                text: (0, mcpOutputStorage_js_1.getBinaryBlobSavedMessage)(persisted.filepath, c.mimeType, persisted.size, `[Resource from ${serverName} at ${c.uri}] `),
            };
        }));
        return {
            data: { contents },
        };
    },
    renderToolUseMessage: UI_js_1.renderToolUseMessage,
    userFacingName: UI_js_1.userFacingName,
    renderToolResultMessage: UI_js_1.renderToolResultMessage,
    isResultTruncated(output) {
        return (0, terminal_js_1.isOutputLineTruncated)((0, slowOperations_js_1.jsonStringify)(output));
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: (0, slowOperations_js_1.jsonStringify)(content),
        };
    },
});
