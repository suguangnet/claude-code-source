"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.execAgentHook = execAgentHook;
const crypto_1 = require("crypto");
const query_js_1 = require("../../query.js");
const index_js_1 = require("../../services/analytics/index.js");
const Tool_js_1 = require("../../Tool.js");
const SyntheticOutputTool_js_1 = require("../../tools/SyntheticOutputTool/SyntheticOutputTool.js");
const tools_js_1 = require("../../tools.js");
const ids_js_1 = require("../../types/ids.js");
const abortController_js_1 = require("../abortController.js");
const attachments_js_1 = require("../attachments.js");
const combinedAbortSignal_js_1 = require("../combinedAbortSignal.js");
const debug_js_1 = require("../debug.js");
const errors_js_1 = require("../errors.js");
const messages_js_1 = require("../messages.js");
const model_js_1 = require("../model/model.js");
const permissions_js_1 = require("../permissions/permissions.js");
const sessionStorage_js_1 = require("../sessionStorage.js");
const slowOperations_js_1 = require("../slowOperations.js");
const systemPromptType_js_1 = require("../systemPromptType.js");
const hookHelpers_js_1 = require("./hookHelpers.js");
const sessionHooks_js_1 = require("./sessionHooks.js");
/**
 * Execute an agent-based hook using a multi-turn LLM query
 */
async function execAgentHook(hook, hookName, hookEvent, jsonInput, signal, toolUseContext, toolUseID, 
// Kept for signature stability with the other exec*Hook functions.
// Was used by hook.prompt(messages) before the .transform() was removed
// (CC-79) — the only consumer of that was ExitPlanModeV2Tool's
// programmatic construction, since refactored into VerifyPlanExecutionTool.
_messages, agentName) {
    const effectiveToolUseID = toolUseID || `hook-${(0, crypto_1.randomUUID)()}`;
    // Get transcript path from context
    const transcriptPath = toolUseContext.agentId
        ? (0, sessionStorage_js_1.getAgentTranscriptPath)(toolUseContext.agentId)
        : (0, sessionStorage_js_1.getTranscriptPath)();
    const hookStartTime = Date.now();
    try {
        // Replace $ARGUMENTS with the JSON input
        const processedPrompt = (0, hookHelpers_js_1.addArgumentsToPrompt)(hook.prompt, jsonInput);
        (0, debug_js_1.logForDebugging)(`Hooks: Processing agent hook with prompt: ${processedPrompt}`);
        // Create user message directly - no need for processUserInput which would
        // trigger UserPromptSubmit hooks and cause infinite recursion
        const userMessage = (0, messages_js_1.createUserMessage)({ content: processedPrompt });
        const agentMessages = [userMessage];
        (0, debug_js_1.logForDebugging)(`Hooks: Starting agent query with ${agentMessages.length} messages`);
        // Setup timeout and combine with parent signal
        const hookTimeoutMs = hook.timeout ? hook.timeout * 1000 : 60000;
        const hookAbortController = (0, abortController_js_1.createAbortController)();
        // Combine parent signal with timeout, and have it abort our controller
        const { signal: parentTimeoutSignal, cleanup: cleanupCombinedSignal } = (0, combinedAbortSignal_js_1.createCombinedAbortSignal)(signal, { timeoutMs: hookTimeoutMs });
        const onParentTimeout = () => hookAbortController.abort();
        parentTimeoutSignal.addEventListener('abort', onParentTimeout);
        // Combined signal is just our controller's signal now
        const combinedSignal = hookAbortController.signal;
        try {
            // Create StructuredOutput tool with our schema
            const structuredOutputTool = (0, hookHelpers_js_1.createStructuredOutputTool)();
            // Filter out any existing StructuredOutput tool to avoid duplicates with different schemas
            // (e.g., when parent context has a StructuredOutput tool from --json-schema flag)
            const filteredTools = toolUseContext.options.tools.filter(tool => !(0, Tool_js_1.toolMatchesName)(tool, SyntheticOutputTool_js_1.SYNTHETIC_OUTPUT_TOOL_NAME));
            // Use all available tools plus our structured output tool
            // Filter out disallowed agent tools to prevent stop hook agents from spawning subagents
            // or entering plan mode, and filter out duplicate StructuredOutput tools
            const tools = [
                ...filteredTools.filter(tool => !tools_js_1.ALL_AGENT_DISALLOWED_TOOLS.has(tool.name)),
                structuredOutputTool,
            ];
            const systemPrompt = (0, systemPromptType_js_1.asSystemPrompt)([
                `You are verifying a stop condition in Claude Code. Your task is to verify that the agent completed the given plan. The conversation transcript is available at: ${transcriptPath}\nYou can read this file to analyze the conversation history if needed.

Use the available tools to inspect the codebase and verify the condition.
Use as few steps as possible - be efficient and direct.

When done, return your result using the ${SyntheticOutputTool_js_1.SYNTHETIC_OUTPUT_TOOL_NAME} tool with:
- ok: true if the condition is met
- ok: false with reason if the condition is not met`,
            ]);
            const model = hook.model ?? (0, model_js_1.getSmallFastModel)();
            const MAX_AGENT_TURNS = 50;
            // Create unique agentId for this hook agent
            const hookAgentId = (0, ids_js_1.asAgentId)(`hook-agent-${(0, crypto_1.randomUUID)()}`);
            // Create a modified toolUseContext for the agent
            const agentToolUseContext = {
                ...toolUseContext,
                agentId: hookAgentId,
                abortController: hookAbortController,
                options: {
                    ...toolUseContext.options,
                    tools,
                    mainLoopModel: model,
                    isNonInteractiveSession: true,
                    thinkingConfig: { type: 'disabled' },
                },
                setInProgressToolUseIDs: () => { },
                getAppState() {
                    const appState = toolUseContext.getAppState();
                    // Add session rule to allow reading transcript file
                    const existingSessionRules = appState.toolPermissionContext.alwaysAllowRules.session ?? [];
                    return {
                        ...appState,
                        toolPermissionContext: {
                            ...appState.toolPermissionContext,
                            mode: 'dontAsk',
                            alwaysAllowRules: {
                                ...appState.toolPermissionContext.alwaysAllowRules,
                                session: [...existingSessionRules, `Read(/${transcriptPath})`],
                            },
                        },
                    };
                },
            };
            // Register a session-level stop hook to enforce structured output
            (0, hookHelpers_js_1.registerStructuredOutputEnforcement)(toolUseContext.setAppState, hookAgentId);
            let structuredOutputResult = null;
            let turnCount = 0;
            let hitMaxTurns = false;
            // Use query() for multi-turn execution
            for await (const message of (0, query_js_1.query)({
                messages: agentMessages,
                systemPrompt,
                userContext: {},
                systemContext: {},
                canUseTool: permissions_js_1.hasPermissionsToUseTool,
                toolUseContext: agentToolUseContext,
                querySource: 'hook_agent',
            })) {
                // Process stream events to update response length in the spinner
                (0, messages_js_1.handleMessageFromStream)(message, () => { }, // onMessage - we handle messages below
                // onMessage - we handle messages below
                newContent => toolUseContext.setResponseLength(length => length + newContent.length), toolUseContext.setStreamMode ?? (() => { }), () => { });
                // Skip streaming events for further processing
                if (message.type === 'stream_event' ||
                    message.type === 'stream_request_start') {
                    continue;
                }
                // Count assistant turns
                if (message.type === 'assistant') {
                    turnCount++;
                    // Check if we've hit the turn limit
                    if (turnCount >= MAX_AGENT_TURNS) {
                        hitMaxTurns = true;
                        (0, debug_js_1.logForDebugging)(`Hooks: Agent turn ${turnCount} hit max turns, aborting`);
                        hookAbortController.abort();
                        break;
                    }
                }
                // Check for structured output in attachments
                if (message.type === 'attachment' &&
                    message.attachment.type === 'structured_output') {
                    const parsed = (0, hookHelpers_js_1.hookResponseSchema)().safeParse(message.attachment.data);
                    if (parsed.success) {
                        structuredOutputResult = parsed.data;
                        (0, debug_js_1.logForDebugging)(`Hooks: Got structured output: ${(0, slowOperations_js_1.jsonStringify)(structuredOutputResult)}`);
                        // Got structured output, abort and exit
                        hookAbortController.abort();
                        break;
                    }
                }
            }
            parentTimeoutSignal.removeEventListener('abort', onParentTimeout);
            cleanupCombinedSignal();
            // Clean up the session hook we registered for this agent
            (0, sessionHooks_js_1.clearSessionHooks)(toolUseContext.setAppState, hookAgentId);
            // Check if we got a result
            if (!structuredOutputResult) {
                // If we hit max turns, just log and return cancelled (no UI message)
                if (hitMaxTurns) {
                    (0, debug_js_1.logForDebugging)(`Hooks: Agent hook did not complete within ${MAX_AGENT_TURNS} turns`);
                    (0, index_js_1.logEvent)('tengu_agent_stop_hook_max_turns', {
                        durationMs: Date.now() - hookStartTime,
                        turnCount,
                        agentName: agentName,
                    });
                    return {
                        hook,
                        outcome: 'cancelled',
                    };
                }
                // For other cases (e.g., agent finished without calling structured output tool),
                // just log and return cancelled (don't show error to user)
                (0, debug_js_1.logForDebugging)(`Hooks: Agent hook did not return structured output`);
                (0, index_js_1.logEvent)('tengu_agent_stop_hook_error', {
                    durationMs: Date.now() - hookStartTime,
                    turnCount,
                    errorType: 1, // 1 = no structured output
                    agentName: agentName,
                });
                return {
                    hook,
                    outcome: 'cancelled',
                };
            }
            // Return result based on structured output
            if (!structuredOutputResult.ok) {
                (0, debug_js_1.logForDebugging)(`Hooks: Agent hook condition was not met: ${structuredOutputResult.reason}`);
                return {
                    hook,
                    outcome: 'blocking',
                    blockingError: {
                        blockingError: `Agent hook condition was not met: ${structuredOutputResult.reason}`,
                        command: hook.prompt,
                    },
                };
            }
            // Condition was met
            (0, debug_js_1.logForDebugging)(`Hooks: Agent hook condition was met`);
            (0, index_js_1.logEvent)('tengu_agent_stop_hook_success', {
                durationMs: Date.now() - hookStartTime,
                turnCount,
                agentName: agentName,
            });
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
            parentTimeoutSignal.removeEventListener('abort', onParentTimeout);
            cleanupCombinedSignal();
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
        (0, debug_js_1.logForDebugging)(`Hooks: Agent hook error: ${errorMsg}`);
        (0, index_js_1.logEvent)('tengu_agent_stop_hook_error', {
            durationMs: Date.now() - hookStartTime,
            errorType: 2, // 2 = general error
            agentName: agentName,
        });
        return {
            hook,
            outcome: 'non_blocking_error',
            message: (0, attachments_js_1.createAttachmentMessage)({
                type: 'hook_non_blocking_error',
                hookName,
                toolUseID: effectiveToolUseID,
                hookEvent,
                stderr: `Error executing agent hook: ${errorMsg}`,
                stdout: '',
                exitCode: 1,
            }),
        };
    }
}
