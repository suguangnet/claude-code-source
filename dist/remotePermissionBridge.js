"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSyntheticAssistantMessage = createSyntheticAssistantMessage;
exports.createToolStub = createToolStub;
const crypto_1 = require("crypto");
const slowOperations_js_1 = require("../utils/slowOperations.js");
/**
 * Create a synthetic AssistantMessage for remote permission requests.
 * The ToolUseConfirm type requires an AssistantMessage, but in remote mode
 * we don't have a real one — the tool use runs on the CCR container.
 */
function createSyntheticAssistantMessage(request, requestId) {
    return {
        type: 'assistant',
        uuid: (0, crypto_1.randomUUID)(),
        message: {
            id: `remote-${requestId}`,
            type: 'message',
            role: 'assistant',
            content: [
                {
                    type: 'tool_use',
                    id: request.tool_use_id,
                    name: request.tool_name,
                    input: request.input,
                },
            ],
            model: '',
            stop_reason: null,
            stop_sequence: null,
            container: null,
            context_management: null,
            usage: {
                input_tokens: 0,
                output_tokens: 0,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
            },
        },
        requestId: undefined,
        timestamp: new Date().toISOString(),
    };
}
/**
 * Create a minimal Tool stub for tools that aren't loaded locally.
 * This happens when the remote CCR has tools (e.g., MCP tools) that the
 * local CLI doesn't know about. The stub routes to FallbackPermissionRequest.
 */
function createToolStub(toolName) {
    return {
        name: toolName,
        inputSchema: {},
        isEnabled: () => true,
        userFacingName: () => toolName,
        renderToolUseMessage: (input) => {
            const entries = Object.entries(input);
            if (entries.length === 0)
                return '';
            return entries
                .slice(0, 3)
                .map(([key, value]) => {
                const valueStr = typeof value === 'string' ? value : (0, slowOperations_js_1.jsonStringify)(value);
                return `${key}: ${valueStr}`;
            })
                .join(', ');
        },
        call: async () => ({ data: '' }),
        description: async () => '',
        prompt: () => '',
        isReadOnly: () => false,
        isMcp: false,
        needsPermissions: () => true,
    };
}
