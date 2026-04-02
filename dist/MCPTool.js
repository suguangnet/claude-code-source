"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCPTool = exports.outputSchema = exports.inputSchema = void 0;
const v4_1 = require("zod/v4");
const Tool_js_1 = require("../../Tool.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const terminal_js_1 = require("../../utils/terminal.js");
const prompt_js_1 = require("./prompt.js");
const UI_js_1 = require("./UI.js");
// Allow any input object since MCP tools define their own schemas
exports.inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({}).passthrough());
exports.outputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.string().describe('MCP tool execution result'));
exports.MCPTool = (0, Tool_js_1.buildTool)({
    isMcp: true,
    // Overridden in mcpClient.ts with the real MCP tool name + args
    isOpenWorld() {
        return false;
    },
    // Overridden in mcpClient.ts
    name: 'mcp',
    maxResultSizeChars: 100000,
    // Overridden in mcpClient.ts
    async description() {
        return prompt_js_1.DESCRIPTION;
    },
    // Overridden in mcpClient.ts
    async prompt() {
        return prompt_js_1.PROMPT;
    },
    get inputSchema() {
        return (0, exports.inputSchema)();
    },
    get outputSchema() {
        return (0, exports.outputSchema)();
    },
    // Overridden in mcpClient.ts
    async call() {
        return {
            data: '',
        };
    },
    async checkPermissions() {
        return {
            behavior: 'passthrough',
            message: 'MCPTool requires permission.',
        };
    },
    renderToolUseMessage: UI_js_1.renderToolUseMessage,
    // Overridden in mcpClient.ts
    userFacingName: () => 'mcp',
    renderToolUseProgressMessage: UI_js_1.renderToolUseProgressMessage,
    renderToolResultMessage: UI_js_1.renderToolResultMessage,
    isResultTruncated(output) {
        return (0, terminal_js_1.isOutputLineTruncated)(output);
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content,
        };
    },
});
