"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hookResponseSchema = void 0;
exports.addArgumentsToPrompt = addArgumentsToPrompt;
exports.createStructuredOutputTool = createStructuredOutputTool;
exports.registerStructuredOutputEnforcement = registerStructuredOutputEnforcement;
const v4_1 = require("zod/v4");
const SyntheticOutputTool_js_1 = require("../../tools/SyntheticOutputTool/SyntheticOutputTool.js");
const argumentSubstitution_js_1 = require("../argumentSubstitution.js");
const lazySchema_js_1 = require("../lazySchema.js");
const messages_js_1 = require("../messages.js");
const sessionHooks_js_1 = require("./sessionHooks.js");
/**
 * Schema for hook responses (shared by prompt and agent hooks)
 */
exports.hookResponseSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    ok: v4_1.z.boolean().describe('Whether the condition was met'),
    reason: v4_1.z
        .string()
        .describe('Reason, if the condition was not met')
        .optional(),
}));
/**
 * Add hook input JSON to prompt, either replacing $ARGUMENTS placeholder or appending.
 * Also supports indexed arguments like $ARGUMENTS[0], $ARGUMENTS[1], or shorthand $0, $1, etc.
 */
function addArgumentsToPrompt(prompt, jsonInput) {
    return (0, argumentSubstitution_js_1.substituteArguments)(prompt, jsonInput);
}
/**
 * Create a StructuredOutput tool configured for hook responses.
 * Reusable by agent hooks and background verification.
 */
function createStructuredOutputTool() {
    return {
        ...SyntheticOutputTool_js_1.SyntheticOutputTool,
        inputSchema: (0, exports.hookResponseSchema)(),
        inputJSONSchema: {
            type: 'object',
            properties: {
                ok: {
                    type: 'boolean',
                    description: 'Whether the condition was met',
                },
                reason: {
                    type: 'string',
                    description: 'Reason, if the condition was not met',
                },
            },
            required: ['ok'],
            additionalProperties: false,
        },
        async prompt() {
            return `Use this tool to return your verification result. You MUST call this tool exactly once at the end of your response.`;
        },
    };
}
/**
 * Register a function hook that enforces structured output via SyntheticOutputTool.
 * Used by ask.tsx, execAgentHook.ts, and background verification.
 */
function registerStructuredOutputEnforcement(setAppState, sessionId) {
    (0, sessionHooks_js_1.addFunctionHook)(setAppState, sessionId, 'Stop', '', // No matcher - applies to all stops
    // No matcher - applies to all stops
    messages => (0, messages_js_1.hasSuccessfulToolCall)(messages, SyntheticOutputTool_js_1.SYNTHETIC_OUTPUT_TOOL_NAME), `You MUST call the ${SyntheticOutputTool_js_1.SYNTHETIC_OUTPUT_TOOL_NAME} tool to complete this request. Call this tool now.`, { timeout: 5000 });
}
