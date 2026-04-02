"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSessionName = generateSessionName;
const claude_js_1 = require("../../services/api/claude.js");
const debug_js_1 = require("../../utils/debug.js");
const errors_js_1 = require("../../utils/errors.js");
const json_js_1 = require("../../utils/json.js");
const messages_js_1 = require("../../utils/messages.js");
const sessionTitle_js_1 = require("../../utils/sessionTitle.js");
const systemPromptType_js_1 = require("../../utils/systemPromptType.js");
async function generateSessionName(messages, signal) {
    const conversationText = (0, sessionTitle_js_1.extractConversationText)(messages);
    if (!conversationText) {
        return null;
    }
    try {
        const result = await (0, claude_js_1.queryHaiku)({
            systemPrompt: (0, systemPromptType_js_1.asSystemPrompt)([
                'Generate a short kebab-case name (2-4 words) that captures the main topic of this conversation. Use lowercase words separated by hyphens. Examples: "fix-login-bug", "add-auth-feature", "refactor-api-client", "debug-test-failures". Return JSON with a "name" field.',
            ]),
            userPrompt: conversationText,
            outputFormat: {
                type: 'json_schema',
                schema: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                    },
                    required: ['name'],
                    additionalProperties: false,
                },
            },
            signal,
            options: {
                querySource: 'rename_generate_name',
                agents: [],
                isNonInteractiveSession: false,
                hasAppendSystemPrompt: false,
                mcpTools: [],
            },
        });
        const content = (0, messages_js_1.extractTextContent)(result.message.content);
        const response = (0, json_js_1.safeParseJSON)(content);
        if (response &&
            typeof response === 'object' &&
            'name' in response &&
            typeof response.name === 'string') {
            return response.name;
        }
        return null;
    }
    catch (error) {
        // Haiku timeout/rate-limit/network are expected operational failures —
        // logForDebugging, not logError. Called automatically on every 3rd bridge
        // message (initReplBridge.ts), so errors here would flood the error file.
        (0, debug_js_1.logForDebugging)(`generateSessionName failed: ${(0, errors_js_1.errorMessage)(error)}`, {
            level: 'error',
        });
        return null;
    }
}
