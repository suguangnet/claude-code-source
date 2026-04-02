"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.execPromptHook = execPromptHook;
const crypto_1 = require("crypto");
const claude_js_1 = require("../../services/api/claude.js");
const attachments_js_1 = require("../attachments.js");
const combinedAbortSignal_js_1 = require("../combinedAbortSignal.js");
const debug_js_1 = require("../debug.js");
const errors_js_1 = require("../errors.js");
const json_js_1 = require("../json.js");
const messages_js_1 = require("../messages.js");
const model_js_1 = require("../model/model.js");
const systemPromptType_js_1 = require("../systemPromptType.js");
const hookHelpers_js_1 = require("./hookHelpers.js");
/**
 * Execute a prompt-based hook using an LLM
 */
async function execPromptHook(hook, hookName, hookEvent, jsonInput, signal, toolUseContext, messages, toolUseID) {
    // Use provided toolUseID or generate a new one
    const effectiveToolUseID = toolUseID || `hook-${(0, crypto_1.randomUUID)()}`;
    try {
        // Replace $ARGUMENTS with the JSON input
        const processedPrompt = (0, hookHelpers_js_1.addArgumentsToPrompt)(hook.prompt, jsonInput);
        (0, debug_js_1.logForDebugging)(`Hooks: Processing prompt hook with prompt: ${processedPrompt}`);
        // Create user message directly - no need for processUserInput which would
        // trigger UserPromptSubmit hooks and cause infinite recursion
        const userMessage = (0, messages_js_1.createUserMessage)({ content: processedPrompt });
        // Prepend conversation history if provided
        const messagesToQuery = messages && messages.length > 0
            ? [...messages, userMessage]
            : [userMessage];
        (0, debug_js_1.logForDebugging)(`Hooks: Querying model with ${messagesToQuery.length} messages`);
        // Query the model with Haiku
        const hookTimeoutMs = hook.timeout ? hook.timeout * 1000 : 30000;
        // Combined signal: aborts if either the hook signal or timeout triggers
        const { signal: combinedSignal, cleanup: cleanupSignal } = (0, combinedAbortSignal_js_1.createCombinedAbortSignal)(signal, { timeoutMs: hookTimeoutMs });
        try {
            const response = await (0, claude_js_1.queryModelWithoutStreaming)({
                messages: messagesToQuery,
                systemPrompt: (0, systemPromptType_js_1.asSystemPrompt)([
                    `You are evaluating a hook in Claude Code.

Your response must be a JSON object matching one of the following schemas:
1. If the condition is met, return: {"ok": true}
2. If the condition is not met, return: {"ok": false, "reason": "Reason for why it is not met"}`,
                ]),
                thinkingConfig: { type: 'disabled' },
                tools: toolUseContext.options.tools,
                signal: combinedSignal,
                options: {
                    async getToolPermissionContext() {
                        const appState = toolUseContext.getAppState();
                        return appState.toolPermissionContext;
                    },
                    model: hook.model ?? (0, model_js_1.getSmallFastModel)(),
                    toolChoice: undefined,
                    isNonInteractiveSession: true,
                    hasAppendSystemPrompt: false,
                    agents: [],
                    querySource: 'hook_prompt',
                    mcpTools: [],
                    agentId: toolUseContext.agentId,
                    outputFormat: {
                        type: 'json_schema',
                        schema: {
                            type: 'object',
                            properties: {
                                ok: { type: 'boolean' },
                                reason: { type: 'string' },
                            },
                            required: ['ok'],
                            additionalProperties: false,
                        },
                    },
                },
            });
            cleanupSignal();
            // Extract text content from response
            const content = (0, messages_js_1.extractTextContent)(response.message.content);
            // Update response length for spinner display
            toolUseContext.setResponseLength(length => length + content.length);
            const fullResponse = content.trim();
            (0, debug_js_1.logForDebugging)(`Hooks: Model response: ${fullResponse}`);
            const json = (0, json_js_1.safeParseJSON)(fullResponse);
            if (!json) {
                (0, debug_js_1.logForDebugging)(`Hooks: error parsing response as JSON: ${fullResponse}`);
                return {
                    hook,
                    outcome: 'non_blocking_error',
                    message: (0, attachments_js_1.createAttachmentMessage)({
                        type: 'hook_non_blocking_error',
                        hookName,
                        toolUseID: effectiveToolUseID,
                        hookEvent,
                        stderr: 'JSON validation failed',
                        stdout: fullResponse,
                        exitCode: 1,
                    }),
                };
            }
            const parsed = (0, hookHelpers_js_1.hookResponseSchema)().safeParse(json);
            if (!parsed.success) {
                (0, debug_js_1.logForDebugging)(`Hooks: model response does not conform to expected schema: ${parsed.error.message}`);
                return {
                    hook,
                    outcome: 'non_blocking_error',
                    message: (0, attachments_js_1.createAttachmentMessage)({
                        type: 'hook_non_blocking_error',
                        hookName,
                        toolUseID: effectiveToolUseID,
                        hookEvent,
                        stderr: `Schema validation failed: ${parsed.error.message}`,
                        stdout: fullResponse,
                        exitCode: 1,
                    }),
                };
            }
            // Failed to meet condition
            if (!parsed.data.ok) {
                (0, debug_js_1.logForDebugging)(`Hooks: Prompt hook condition was not met: ${parsed.data.reason}`);
                return {
                    hook,
                    outcome: 'blocking',
                    blockingError: {
                        blockingError: `Prompt hook condition was not met: ${parsed.data.reason}`,
                        command: hook.prompt,
                    },
                    preventContinuation: true,
                    stopReason: parsed.data.reason,
                };
            }
            // Condition was met
            (0, debug_js_1.logForDebugging)(`Hooks: Prompt hook condition was met`);
            return {
                hook,
                outcome: 'success',
                message: (0, attachments_js_1.createAttachmentMessage)({
                    type: 'hook_success',
                    hookName,
                    toolUseID: effectiveToolUseID,
                    hookEvent,
                    content: '',
                }),
            };
        }
        catch (error) {
            cleanupSignal();
            if (combinedSignal.aborted) {
                return {
                    hook,
                    outcome: 'cancelled',
                };
            }
            throw error;
        }
    }
    catch (error) {
        const errorMsg = (0, errors_js_1.errorMessage)(error);
        (0, debug_js_1.logForDebugging)(`Hooks: Prompt hook error: ${errorMsg}`);
        return {
            hook,
            outcome: 'non_blocking_error',
            message: (0, attachments_js_1.createAttachmentMessage)({
                type: 'hook_non_blocking_error',
                hookName,
                toolUseID: effectiveToolUseID,
                hookEvent,
                stderr: `Error executing prompt hook: ${errorMsg}`,
                stdout: '',
                exitCode: 1,
            }),
        };
    }
}
