"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMCPServer = startMCPServer;
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const AppStateStore_js_1 = require("src/state/AppStateStore.js");
const review_js_1 = __importDefault(require("../commands/review.js"));
const Tool_js_1 = require("../Tool.js");
const tools_js_1 = require("../tools.js");
const abortController_js_1 = require("../utils/abortController.js");
const fileStateCache_js_1 = require("../utils/fileStateCache.js");
const log_js_1 = require("../utils/log.js");
const messages_js_1 = require("../utils/messages.js");
const model_js_1 = require("../utils/model/model.js");
const permissions_js_1 = require("../utils/permissions/permissions.js");
const Shell_js_1 = require("../utils/Shell.js");
const slowOperations_js_1 = require("../utils/slowOperations.js");
const toolErrors_js_1 = require("../utils/toolErrors.js");
const zodToJsonSchema_js_1 = require("../utils/zodToJsonSchema.js");
const MCP_COMMANDS = [review_js_1.default];
async function startMCPServer(cwd, debug, verbose) {
    // Use size-limited LRU cache for readFileState to prevent unbounded memory growth
    // 100 files and 25MB limit should be sufficient for MCP server operations
    const READ_FILE_STATE_CACHE_SIZE = 100;
    const readFileStateCache = (0, fileStateCache_js_1.createFileStateCacheWithSizeLimit)(READ_FILE_STATE_CACHE_SIZE);
    (0, Shell_js_1.setCwd)(cwd);
    const server = new index_js_1.Server({
        name: 'claude/tengu',
        version: MACRO.VERSION,
    }, {
        capabilities: {
            tools: {},
        },
    });
    server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
        // TODO: Also re-expose any MCP tools
        const toolPermissionContext = (0, Tool_js_1.getEmptyToolPermissionContext)();
        const tools = (0, tools_js_1.getTools)(toolPermissionContext);
        return {
            tools: await Promise.all(tools.map(async (tool) => {
                let outputSchema;
                if (tool.outputSchema) {
                    const convertedSchema = (0, zodToJsonSchema_js_1.zodToJsonSchema)(tool.outputSchema);
                    // MCP SDK requires outputSchema to have type: "object" at root level
                    // Skip schemas with anyOf/oneOf at root (from z.union, z.discriminatedUnion, etc.)
                    // See: https://github.com/anthropics/claude-code/issues/8014
                    if (typeof convertedSchema === 'object' &&
                        convertedSchema !== null &&
                        'type' in convertedSchema &&
                        convertedSchema.type === 'object') {
                        outputSchema = convertedSchema;
                    }
                }
                return {
                    ...tool,
                    description: await tool.prompt({
                        getToolPermissionContext: async () => toolPermissionContext,
                        tools,
                        agents: [],
                    }),
                    inputSchema: (0, zodToJsonSchema_js_1.zodToJsonSchema)(tool.inputSchema),
                    outputSchema,
                };
            })),
        };
    });
    server.setRequestHandler(types_js_1.CallToolRequestSchema, async ({ params: { name, arguments: args } }) => {
        const toolPermissionContext = (0, Tool_js_1.getEmptyToolPermissionContext)();
        // TODO: Also re-expose any MCP tools
        const tools = (0, tools_js_1.getTools)(toolPermissionContext);
        const tool = (0, Tool_js_1.findToolByName)(tools, name);
        if (!tool) {
            throw new Error(`Tool ${name} not found`);
        }
        // Assume MCP servers do not read messages separately from the tool
        // call arguments.
        const toolUseContext = {
            abortController: (0, abortController_js_1.createAbortController)(),
            options: {
                commands: MCP_COMMANDS,
                tools,
                mainLoopModel: (0, model_js_1.getMainLoopModel)(),
                thinkingConfig: { type: 'disabled' },
                mcpClients: [],
                mcpResources: {},
                isNonInteractiveSession: true,
                debug,
                verbose,
                agentDefinitions: { activeAgents: [], allAgents: [] },
            },
            getAppState: () => (0, AppStateStore_js_1.getDefaultAppState)(),
            setAppState: () => { },
            messages: [],
            readFileState: readFileStateCache,
            setInProgressToolUseIDs: () => { },
            setResponseLength: () => { },
            updateFileHistoryState: () => { },
            updateAttributionState: () => { },
        };
        // TODO: validate input types with zod
        try {
            if (!tool.isEnabled()) {
                throw new Error(`Tool ${name} is not enabled`);
            }
            const validationResult = await tool.validateInput?.(args ?? {}, toolUseContext);
            if (validationResult && !validationResult.result) {
                throw new Error(`Tool ${name} input is invalid: ${validationResult.message}`);
            }
            const finalResult = await tool.call((args ?? {}), toolUseContext, permissions_js_1.hasPermissionsToUseTool, (0, messages_js_1.createAssistantMessage)({
                content: [],
            }));
            return {
                content: [
                    {
                        type: 'text',
                        text: typeof finalResult === 'string'
                            ? finalResult
                            : (0, slowOperations_js_1.jsonStringify)(finalResult.data),
                    },
                ],
            };
        }
        catch (error) {
            (0, log_js_1.logError)(error);
            const parts = error instanceof Error ? (0, toolErrors_js_1.getErrorParts)(error) : [String(error)];
            const errorText = parts.filter(Boolean).join('\n').trim() || 'Error';
            return {
                isError: true,
                content: [
                    {
                        type: 'text',
                        text: errorText,
                    },
                ],
            };
        }
    });
    async function runServer() {
        const transport = new stdio_js_1.StdioServerTransport();
        await server.connect(transport);
    }
    return await runServer();
}
