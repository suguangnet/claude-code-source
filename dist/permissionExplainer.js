"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPermissionExplainerEnabled = isPermissionExplainerEnabled;
exports.generatePermissionExplanation = generatePermissionExplanation;
const v4_1 = require("zod/v4");
const index_js_1 = require("../../services/analytics/index.js");
const metadata_js_1 = require("../../services/analytics/metadata.js");
const config_js_1 = require("../config.js");
const debug_js_1 = require("../debug.js");
const errors_js_1 = require("../errors.js");
const lazySchema_js_1 = require("../lazySchema.js");
const log_js_1 = require("../log.js");
const model_js_1 = require("../model/model.js");
const sideQuery_js_1 = require("../sideQuery.js");
const slowOperations_js_1 = require("../slowOperations.js");
// Map risk levels to numeric values for analytics
const RISK_LEVEL_NUMERIC = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
};
// Error type codes for analytics
const ERROR_TYPE_PARSE = 1;
const ERROR_TYPE_NETWORK = 2;
const ERROR_TYPE_UNKNOWN = 3;
const SYSTEM_PROMPT = `Analyze shell commands and explain what they do, why you're running them, and potential risks.`;
// Tool definition for forced structured output (no beta required)
const EXPLAIN_COMMAND_TOOL = {
    name: 'explain_command',
    description: 'Provide an explanation of a shell command',
    input_schema: {
        type: 'object',
        properties: {
            explanation: {
                type: 'string',
                description: 'What this command does (1-2 sentences)',
            },
            reasoning: {
                type: 'string',
                description: 'Why YOU are running this command. Start with "I" - e.g. "I need to check the file contents"',
            },
            risk: {
                type: 'string',
                description: 'What could go wrong, under 15 words',
            },
            riskLevel: {
                type: 'string',
                enum: ['LOW', 'MEDIUM', 'HIGH'],
                description: 'LOW (safe dev workflows), MEDIUM (recoverable changes), HIGH (dangerous/irreversible)',
            },
        },
        required: ['explanation', 'reasoning', 'risk', 'riskLevel'],
    },
};
// Zod schema for parsing and validating the response
const RiskAssessmentSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    riskLevel: v4_1.z.enum(['LOW', 'MEDIUM', 'HIGH']),
    explanation: v4_1.z.string(),
    reasoning: v4_1.z.string(),
    risk: v4_1.z.string(),
}));
function formatToolInput(input) {
    if (typeof input === 'string') {
        return input;
    }
    try {
        return (0, slowOperations_js_1.jsonStringify)(input, null, 2);
    }
    catch {
        return String(input);
    }
}
/**
 * Extract recent conversation context from messages for the explainer.
 * Returns a summary of recent assistant messages to provide context
 * for "why" this command is being run.
 */
function extractConversationContext(messages, maxChars = 1000) {
    // Get recent assistant messages (they contain Claude's reasoning)
    const assistantMessages = messages
        .filter((m) => m.type === 'assistant')
        .slice(-3); // Last 3 assistant messages
    const contextParts = [];
    let totalChars = 0;
    for (const msg of assistantMessages.reverse()) {
        // Extract text content from assistant message
        const textBlocks = msg.message.content
            .filter(c => c.type === 'text')
            .map(c => ('text' in c ? c.text : ''))
            .join(' ');
        if (textBlocks && totalChars < maxChars) {
            const remaining = maxChars - totalChars;
            const truncated = textBlocks.length > remaining
                ? textBlocks.slice(0, remaining) + '...'
                : textBlocks;
            contextParts.unshift(truncated);
            totalChars += truncated.length;
        }
    }
    return contextParts.join('\n\n');
}
/**
 * Check if the permission explainer feature is enabled.
 * Enabled by default; users can opt out via config.
 */
function isPermissionExplainerEnabled() {
    return (0, config_js_1.getGlobalConfig)().permissionExplainerEnabled !== false;
}
/**
 * Generate a permission explanation using Haiku with structured output.
 * Returns null if the feature is disabled, request is aborted, or an error occurs.
 */
async function generatePermissionExplanation({ toolName, toolInput, toolDescription, messages, signal, }) {
    // Check if feature is enabled
    if (!isPermissionExplainerEnabled()) {
        return null;
    }
    const startTime = Date.now();
    try {
        const formattedInput = formatToolInput(toolInput);
        const conversationContext = messages?.length
            ? extractConversationContext(messages)
            : '';
        const userPrompt = `Tool: ${toolName}
${toolDescription ? `Description: ${toolDescription}\n` : ''}
Input:
${formattedInput}
${conversationContext ? `\nRecent conversation context:\n${conversationContext}` : ''}

Explain this command in context.`;
        const model = (0, model_js_1.getMainLoopModel)();
        // Use sideQuery with forced tool choice for guaranteed structured output
        const response = await (0, sideQuery_js_1.sideQuery)({
            model,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userPrompt }],
            tools: [EXPLAIN_COMMAND_TOOL],
            tool_choice: { type: 'tool', name: 'explain_command' },
            signal,
            querySource: 'permission_explainer',
        });
        const latencyMs = Date.now() - startTime;
        (0, debug_js_1.logForDebugging)(`Permission explainer: API returned in ${latencyMs}ms, stop_reason=${response.stop_reason}`);
        // Extract structured data from tool use block
        const toolUseBlock = response.content.find(c => c.type === 'tool_use');
        if (toolUseBlock && toolUseBlock.type === 'tool_use') {
            (0, debug_js_1.logForDebugging)(`Permission explainer: tool input: ${(0, slowOperations_js_1.jsonStringify)(toolUseBlock.input).slice(0, 500)}`);
            const result = RiskAssessmentSchema().safeParse(toolUseBlock.input);
            if (result.success) {
                const explanation = {
                    riskLevel: result.data.riskLevel,
                    explanation: result.data.explanation,
                    reasoning: result.data.reasoning,
                    risk: result.data.risk,
                };
                (0, index_js_1.logEvent)('tengu_permission_explainer_generated', {
                    tool_name: (0, metadata_js_1.sanitizeToolNameForAnalytics)(toolName),
                    risk_level: RISK_LEVEL_NUMERIC[explanation.riskLevel],
                    latency_ms: latencyMs,
                });
                (0, debug_js_1.logForDebugging)(`Permission explainer: ${explanation.riskLevel} risk for ${toolName} (${latencyMs}ms)`);
                return explanation;
            }
        }
        // No valid JSON in response
        (0, index_js_1.logEvent)('tengu_permission_explainer_error', {
            tool_name: (0, metadata_js_1.sanitizeToolNameForAnalytics)(toolName),
            error_type: ERROR_TYPE_PARSE,
            latency_ms: latencyMs,
        });
        (0, debug_js_1.logForDebugging)(`Permission explainer: no parsed output in response`);
        return null;
    }
    catch (error) {
        const latencyMs = Date.now() - startTime;
        // Don't log aborted requests as errors
        if (signal.aborted) {
            (0, debug_js_1.logForDebugging)(`Permission explainer: request aborted for ${toolName}`);
            return null;
        }
        (0, debug_js_1.logForDebugging)(`Permission explainer error: ${(0, errors_js_1.errorMessage)(error)}`);
        (0, log_js_1.logError)(error);
        (0, index_js_1.logEvent)('tengu_permission_explainer_error', {
            tool_name: (0, metadata_js_1.sanitizeToolNameForAnalytics)(toolName),
            error_type: error instanceof Error && error.name === 'AbortError'
                ? ERROR_TYPE_NETWORK
                : ERROR_TYPE_UNKNOWN,
            latency_ms: latencyMs,
        });
        return null;
    }
}
