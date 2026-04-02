"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HOOK_TIMING_DISPLAY_THRESHOLD_MS = void 0;
exports.classifyToolError = classifyToolError;
exports.runToolUse = runToolUse;
exports.buildSchemaNotSentHint = buildSchemaNotSentHint;
const bun_bundle_1 = require("bun:bundle");
const index_js_1 = require("src/services/analytics/index.js");
const metadata_js_1 = require("src/services/analytics/metadata.js");
const state_js_1 = require("../../bootstrap/state.js");
const permissionLogging_js_1 = require("../../hooks/toolPermission/permissionLogging.js");
const Tool_js_1 = require("../../Tool.js");
const bashPermissions_js_1 = require("../../tools/BashTool/bashPermissions.js");
const toolName_js_1 = require("../../tools/BashTool/toolName.js");
const constants_js_1 = require("../../tools/FileEditTool/constants.js");
const prompt_js_1 = require("../../tools/FileReadTool/prompt.js");
const prompt_js_2 = require("../../tools/FileWriteTool/prompt.js");
const constants_js_2 = require("../../tools/NotebookEditTool/constants.js");
const toolName_js_2 = require("../../tools/PowerShellTool/toolName.js");
const gitOperationTracking_js_1 = require("../../tools/shared/gitOperationTracking.js");
const prompt_js_3 = require("../../tools/ToolSearchTool/prompt.js");
const tools_js_1 = require("../../tools.js");
const array_js_1 = require("../../utils/array.js");
const attachments_js_1 = require("../../utils/attachments.js");
const debug_js_1 = require("../../utils/debug.js");
const errors_js_1 = require("../../utils/errors.js");
const hooks_js_1 = require("../../utils/hooks.js");
const log_js_1 = require("../../utils/log.js");
const messages_js_1 = require("../../utils/messages.js");
const sessionActivity_js_1 = require("../../utils/sessionActivity.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const stream_js_1 = require("../../utils/stream.js");
const events_js_1 = require("../../utils/telemetry/events.js");
const sessionTracing_js_1 = require("../../utils/telemetry/sessionTracing.js");
const toolErrors_js_1 = require("../../utils/toolErrors.js");
const toolResultStorage_js_1 = require("../../utils/toolResultStorage.js");
const toolSearch_js_1 = require("../../utils/toolSearch.js");
const client_js_1 = require("../mcp/client.js");
const mcpStringUtils_js_1 = require("../mcp/mcpStringUtils.js");
const normalization_js_1 = require("../mcp/normalization.js");
const utils_js_1 = require("../mcp/utils.js");
const toolHooks_js_1 = require("./toolHooks.js");
/** Minimum total hook duration (ms) to show inline timing summary */
exports.HOOK_TIMING_DISPLAY_THRESHOLD_MS = 500;
/** Log a debug warning when hooks/permission-decision block for this long. Matches
 * BashTool's PROGRESS_THRESHOLD_MS — the collapsed view feels stuck past this. */
const SLOW_PHASE_LOG_THRESHOLD_MS = 2000;
/**
 * Classify a tool execution error into a telemetry-safe string.
 *
 * In minified/external builds, `error.constructor.name` is mangled into
 * short identifiers like "nJT" or "Chq" — useless for diagnostics.
 * This function extracts structured, telemetry-safe information instead:
 * - TelemetrySafeError: use its telemetryMessage (already vetted)
 * - Node.js fs errors: log the error code (ENOENT, EACCES, etc.)
 * - Known error types: use their unminified name
 * - Fallback: "Error" (better than a mangled 3-char identifier)
 */
function classifyToolError(error) {
    if (error instanceof errors_js_1.TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS) {
        return error.telemetryMessage.slice(0, 200);
    }
    if (error instanceof Error) {
        // Node.js filesystem errors have a `code` property (ENOENT, EACCES, etc.)
        // These are safe to log and much more useful than the constructor name.
        const errnoCode = (0, errors_js_1.getErrnoCode)(error);
        if (typeof errnoCode === 'string') {
            return `Error:${errnoCode}`;
        }
        // ShellError, ImageSizeError, etc. have stable `.name` properties
        // that survive minification (they're set in the constructor).
        if (error.name && error.name !== 'Error' && error.name.length > 3) {
            return error.name.slice(0, 60);
        }
        return 'Error';
    }
    return 'UnknownError';
}
/**
 * Map a rule's origin to the documented OTel `source` vocabulary, matching
 * the interactive path's semantics (permissionLogging.ts:81): session-scoped
 * grants are temporary, on-disk grants are permanent, and user-authored
 * denies are user_reject regardless of persistence. Everything the user
 * didn't write (cliArg, policySettings, projectSettings, flagSettings) is
 * config.
 */
function ruleSourceToOTelSource(ruleSource, behavior) {
    switch (ruleSource) {
        case 'session':
            return behavior === 'allow' ? 'user_temporary' : 'user_reject';
        case 'localSettings':
        case 'userSettings':
            return behavior === 'allow' ? 'user_permanent' : 'user_reject';
        default:
            return 'config';
    }
}
/**
 * Map a PermissionDecisionReason to the OTel `source` label for the
 * non-interactive tool_decision path, staying within the documented
 * vocabulary (config, hook, user_permanent, user_temporary, user_reject).
 *
 * For permissionPromptTool, the SDK host may set decisionClassification on
 * the PermissionResult to tell us exactly what happened (once vs always vs
 * cache hit — the host knows, we can't tell from {behavior:'allow'} alone).
 * Without it, we fall back conservatively: allow → user_temporary,
 * deny → user_reject.
 */
function decisionReasonToOTelSource(reason, behavior) {
    if (!reason) {
        return 'config';
    }
    switch (reason.type) {
        case 'permissionPromptTool': {
            // toolResult is typed `unknown` on PermissionDecisionReason but carries
            // the parsed Output from PermissionPromptToolResultSchema. Narrow at
            // runtime rather than widen the cross-file type.
            const toolResult = reason.toolResult;
            const classified = toolResult?.decisionClassification;
            if (classified === 'user_temporary' ||
                classified === 'user_permanent' ||
                classified === 'user_reject') {
                return classified;
            }
            return behavior === 'allow' ? 'user_temporary' : 'user_reject';
        }
        case 'rule':
            return ruleSourceToOTelSource(reason.rule.source, behavior);
        case 'hook':
            return 'hook';
        case 'mode':
        case 'classifier':
        case 'subcommandResults':
        case 'asyncAgent':
        case 'sandboxOverride':
        case 'workingDir':
        case 'safetyCheck':
        case 'other':
            return 'config';
        default: {
            const _exhaustive = reason;
            return 'config';
        }
    }
}
function getNextImagePasteId(messages) {
    let maxId = 0;
    for (const message of messages) {
        if (message.type === 'user' && message.imagePasteIds) {
            for (const id of message.imagePasteIds) {
                if (id > maxId)
                    maxId = id;
            }
        }
    }
    return maxId + 1;
}
function findMcpServerConnection(toolName, mcpClients) {
    if (!toolName.startsWith('mcp__')) {
        return undefined;
    }
    const mcpInfo = (0, mcpStringUtils_js_1.mcpInfoFromString)(toolName);
    if (!mcpInfo) {
        return undefined;
    }
    // mcpInfo.serverName is normalized (e.g., "claude_ai_Slack"), but client.name
    // is the original name (e.g., "claude.ai Slack"). Normalize both for comparison.
    return mcpClients.find(client => (0, normalization_js_1.normalizeNameForMCP)(client.name) === mcpInfo.serverName);
}
/**
 * Extracts the MCP server transport type from a tool name.
 * Returns the server type (stdio, sse, http, ws, sdk, etc.) for MCP tools,
 * or undefined for built-in tools.
 */
function getMcpServerType(toolName, mcpClients) {
    const serverConnection = findMcpServerConnection(toolName, mcpClients);
    if (serverConnection?.type === 'connected') {
        // Handle stdio configs where type field is optional (defaults to 'stdio')
        return serverConnection.config.type ?? 'stdio';
    }
    return undefined;
}
/**
 * Extracts the MCP server base URL for a tool by looking up its server connection.
 * Returns undefined for stdio servers, built-in tools, or if the server is not connected.
 */
function getMcpServerBaseUrlFromToolName(toolName, mcpClients) {
    const serverConnection = findMcpServerConnection(toolName, mcpClients);
    if (serverConnection?.type !== 'connected') {
        return undefined;
    }
    return (0, utils_js_1.getLoggingSafeMcpBaseUrl)(serverConnection.config);
}
async function* runToolUse(toolUse, assistantMessage, canUseTool, toolUseContext) {
    const toolName = toolUse.name;
    // First try to find in the available tools (what the model sees)
    let tool = (0, Tool_js_1.findToolByName)(toolUseContext.options.tools, toolName);
    // If not found, check if it's a deprecated tool being called by alias
    // (e.g., old transcripts calling "KillShell" which is now an alias for "TaskStop")
    // Only fall back for tools where the name matches an alias, not the primary name
    if (!tool) {
        const fallbackTool = (0, Tool_js_1.findToolByName)((0, tools_js_1.getAllBaseTools)(), toolName);
        // Only use fallback if the tool was found via alias (deprecated name)
        if (fallbackTool && fallbackTool.aliases?.includes(toolName)) {
            tool = fallbackTool;
        }
    }
    const messageId = assistantMessage.message.id;
    const requestId = assistantMessage.requestId;
    const mcpServerType = getMcpServerType(toolName, toolUseContext.options.mcpClients);
    const mcpServerBaseUrl = getMcpServerBaseUrlFromToolName(toolName, toolUseContext.options.mcpClients);
    // Check if the tool exists
    if (!tool) {
        const sanitizedToolName = (0, metadata_js_1.sanitizeToolNameForAnalytics)(toolName);
        (0, debug_js_1.logForDebugging)(`Unknown tool ${toolName}: ${toolUse.id}`);
        (0, index_js_1.logEvent)('tengu_tool_use_error', {
            error: `No such tool available: ${sanitizedToolName}`,
            toolName: sanitizedToolName,
            toolUseID: toolUse.id,
            isMcp: toolName.startsWith('mcp__'),
            queryChainId: toolUseContext.queryTracking
                ?.chainId,
            queryDepth: toolUseContext.queryTracking?.depth,
            ...(mcpServerType && {
                mcpServerType: mcpServerType,
            }),
            ...(mcpServerBaseUrl && {
                mcpServerBaseUrl: mcpServerBaseUrl,
            }),
            ...(requestId && {
                requestId: requestId,
            }),
            ...(0, metadata_js_1.mcpToolDetailsForAnalytics)(toolName, mcpServerType, mcpServerBaseUrl),
        });
        yield {
            message: (0, messages_js_1.createUserMessage)({
                content: [
                    {
                        type: 'tool_result',
                        content: `<tool_use_error>Error: No such tool available: ${toolName}</tool_use_error>`,
                        is_error: true,
                        tool_use_id: toolUse.id,
                    },
                ],
                toolUseResult: `Error: No such tool available: ${toolName}`,
                sourceToolAssistantUUID: assistantMessage.uuid,
            }),
        };
        return;
    }
    const toolInput = toolUse.input;
    try {
        if (toolUseContext.abortController.signal.aborted) {
            (0, index_js_1.logEvent)('tengu_tool_use_cancelled', {
                toolName: (0, metadata_js_1.sanitizeToolNameForAnalytics)(tool.name),
                toolUseID: toolUse.id,
                isMcp: tool.isMcp ?? false,
                queryChainId: toolUseContext.queryTracking
                    ?.chainId,
                queryDepth: toolUseContext.queryTracking?.depth,
                ...(mcpServerType && {
                    mcpServerType: mcpServerType,
                }),
                ...(mcpServerBaseUrl && {
                    mcpServerBaseUrl: mcpServerBaseUrl,
                }),
                ...(requestId && {
                    requestId: requestId,
                }),
                ...(0, metadata_js_1.mcpToolDetailsForAnalytics)(tool.name, mcpServerType, mcpServerBaseUrl),
            });
            const content = (0, messages_js_1.createToolResultStopMessage)(toolUse.id);
            content.content = (0, messages_js_1.withMemoryCorrectionHint)(messages_js_1.CANCEL_MESSAGE);
            yield {
                message: (0, messages_js_1.createUserMessage)({
                    content: [content],
                    toolUseResult: messages_js_1.CANCEL_MESSAGE,
                    sourceToolAssistantUUID: assistantMessage.uuid,
                }),
            };
            return;
        }
        for await (const update of streamedCheckPermissionsAndCallTool(tool, toolUse.id, toolInput, toolUseContext, canUseTool, assistantMessage, messageId, requestId, mcpServerType, mcpServerBaseUrl)) {
            yield update;
        }
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        const toolInfo = tool ? ` (${tool.name})` : '';
        const detailedError = `Error calling tool${toolInfo}: ${errorMessage}`;
        yield {
            message: (0, messages_js_1.createUserMessage)({
                content: [
                    {
                        type: 'tool_result',
                        content: `<tool_use_error>${detailedError}</tool_use_error>`,
                        is_error: true,
                        tool_use_id: toolUse.id,
                    },
                ],
                toolUseResult: detailedError,
                sourceToolAssistantUUID: assistantMessage.uuid,
            }),
        };
    }
}
function streamedCheckPermissionsAndCallTool(tool, toolUseID, input, toolUseContext, canUseTool, assistantMessage, messageId, requestId, mcpServerType, mcpServerBaseUrl) {
    // This is a bit of a hack to get progress events and final results
    // into a single async iterable.
    //
    // Ideally the progress reporting and tool call reporting would
    // be via separate mechanisms.
    const stream = new stream_js_1.Stream();
    checkPermissionsAndCallTool(tool, toolUseID, input, toolUseContext, canUseTool, assistantMessage, messageId, requestId, mcpServerType, mcpServerBaseUrl, progress => {
        (0, index_js_1.logEvent)('tengu_tool_use_progress', {
            messageID: messageId,
            toolName: (0, metadata_js_1.sanitizeToolNameForAnalytics)(tool.name),
            isMcp: tool.isMcp ?? false,
            queryChainId: toolUseContext.queryTracking
                ?.chainId,
            queryDepth: toolUseContext.queryTracking?.depth,
            ...(mcpServerType && {
                mcpServerType: mcpServerType,
            }),
            ...(mcpServerBaseUrl && {
                mcpServerBaseUrl: mcpServerBaseUrl,
            }),
            ...(requestId && {
                requestId: requestId,
            }),
            ...(0, metadata_js_1.mcpToolDetailsForAnalytics)(tool.name, mcpServerType, mcpServerBaseUrl),
        });
        stream.enqueue({
            message: (0, messages_js_1.createProgressMessage)({
                toolUseID: progress.toolUseID,
                parentToolUseID: toolUseID,
                data: progress.data,
            }),
        });
    })
        .then(results => {
        for (const result of results) {
            stream.enqueue(result);
        }
    })
        .catch(error => {
        stream.error(error);
    })
        .finally(() => {
        stream.done();
    });
    return stream;
}
/**
 * Appended to Zod errors when a deferred tool wasn't in the discovered-tool
 * set — re-runs the claude.ts schema-filter scan dispatch-time to detect the
 * mismatch. The raw Zod error ("expected array, got string") doesn't tell the
 * model to re-load the tool; this hint does. Null if the schema was sent.
 */
function buildSchemaNotSentHint(tool, messages, tools) {
    // Optimistic gating — reconstructing claude.ts's full useToolSearch
    // computation is fragile. These two gates prevent pointing at a ToolSearch
    // that isn't callable; occasional misfires (Haiku, tst-auto below threshold)
    // cost one extra round-trip on an already-failing path.
    if (!(0, toolSearch_js_1.isToolSearchEnabledOptimistic)())
        return null;
    if (!(0, toolSearch_js_1.isToolSearchToolAvailable)(tools))
        return null;
    if (!(0, prompt_js_3.isDeferredTool)(tool))
        return null;
    const discovered = (0, toolSearch_js_1.extractDiscoveredToolNames)(messages);
    if (discovered.has(tool.name))
        return null;
    return (`\n\nThis tool's schema was not sent to the API — it was not in the discovered-tool set derived from message history. ` +
        `Without the schema in your prompt, typed parameters (arrays, numbers, booleans) get emitted as strings and the client-side parser rejects them. ` +
        `Load the tool first: call ${prompt_js_3.TOOL_SEARCH_TOOL_NAME} with query "select:${tool.name}", then retry this call.`);
}
async function checkPermissionsAndCallTool(tool, toolUseID, input, toolUseContext, canUseTool, assistantMessage, messageId, requestId, mcpServerType, mcpServerBaseUrl, onToolProgress) {
    // Validate input types with zod (surprisingly, the model is not great at generating valid input)
    const parsedInput = tool.inputSchema.safeParse(input);
    if (!parsedInput.success) {
        let errorContent = (0, toolErrors_js_1.formatZodValidationError)(tool.name, parsedInput.error);
        const schemaHint = buildSchemaNotSentHint(tool, toolUseContext.messages, toolUseContext.options.tools);
        if (schemaHint) {
            (0, index_js_1.logEvent)('tengu_deferred_tool_schema_not_sent', {
                toolName: (0, metadata_js_1.sanitizeToolNameForAnalytics)(tool.name),
                isMcp: tool.isMcp ?? false,
            });
            errorContent += schemaHint;
        }
        (0, debug_js_1.logForDebugging)(`${tool.name} tool input error: ${errorContent.slice(0, 200)}`);
        (0, index_js_1.logEvent)('tengu_tool_use_error', {
            error: 'InputValidationError',
            errorDetails: errorContent.slice(0, 2000),
            messageID: messageId,
            toolName: (0, metadata_js_1.sanitizeToolNameForAnalytics)(tool.name),
            isMcp: tool.isMcp ?? false,
            queryChainId: toolUseContext.queryTracking
                ?.chainId,
            queryDepth: toolUseContext.queryTracking?.depth,
            ...(mcpServerType && {
                mcpServerType: mcpServerType,
            }),
            ...(mcpServerBaseUrl && {
                mcpServerBaseUrl: mcpServerBaseUrl,
            }),
            ...(requestId && {
                requestId: requestId,
            }),
            ...(0, metadata_js_1.mcpToolDetailsForAnalytics)(tool.name, mcpServerType, mcpServerBaseUrl),
        });
        return [
            {
                message: (0, messages_js_1.createUserMessage)({
                    content: [
                        {
                            type: 'tool_result',
                            content: `<tool_use_error>InputValidationError: ${errorContent}</tool_use_error>`,
                            is_error: true,
                            tool_use_id: toolUseID,
                        },
                    ],
                    toolUseResult: `InputValidationError: ${parsedInput.error.message}`,
                    sourceToolAssistantUUID: assistantMessage.uuid,
                }),
            },
        ];
    }
    // Validate input values. Each tool has its own validation logic
    const isValidCall = await tool.validateInput?.(parsedInput.data, toolUseContext);
    if (isValidCall?.result === false) {
        (0, debug_js_1.logForDebugging)(`${tool.name} tool validation error: ${isValidCall.message?.slice(0, 200)}`);
        (0, index_js_1.logEvent)('tengu_tool_use_error', {
            messageID: messageId,
            toolName: (0, metadata_js_1.sanitizeToolNameForAnalytics)(tool.name),
            error: isValidCall.message,
            errorCode: isValidCall.errorCode,
            isMcp: tool.isMcp ?? false,
            queryChainId: toolUseContext.queryTracking
                ?.chainId,
            queryDepth: toolUseContext.queryTracking?.depth,
            ...(mcpServerType && {
                mcpServerType: mcpServerType,
            }),
            ...(mcpServerBaseUrl && {
                mcpServerBaseUrl: mcpServerBaseUrl,
            }),
            ...(requestId && {
                requestId: requestId,
            }),
            ...(0, metadata_js_1.mcpToolDetailsForAnalytics)(tool.name, mcpServerType, mcpServerBaseUrl),
        });
        return [
            {
                message: (0, messages_js_1.createUserMessage)({
                    content: [
                        {
                            type: 'tool_result',
                            content: `<tool_use_error>${isValidCall.message}</tool_use_error>`,
                            is_error: true,
                            tool_use_id: toolUseID,
                        },
                    ],
                    toolUseResult: `Error: ${isValidCall.message}`,
                    sourceToolAssistantUUID: assistantMessage.uuid,
                }),
            },
        ];
    }
    // Speculatively start the bash allow classifier check early so it runs in
    // parallel with pre-tool hooks, deny/ask classifiers, and permission dialog
    // setup. The UI indicator (setClassifierChecking) is NOT set here — it's
    // set in interactiveHandler.ts only when the permission check returns `ask`
    // with a pendingClassifierCheck. This avoids flashing "classifier running"
    // for commands that auto-allow via prefix rules.
    if (tool.name === toolName_js_1.BASH_TOOL_NAME &&
        parsedInput.data &&
        'command' in parsedInput.data) {
        const appState = toolUseContext.getAppState();
        (0, bashPermissions_js_1.startSpeculativeClassifierCheck)(parsedInput.data.command, appState.toolPermissionContext, toolUseContext.abortController.signal, toolUseContext.options.isNonInteractiveSession);
    }
    const resultingMessages = [];
    // Defense-in-depth: strip _simulatedSedEdit from model-provided Bash input.
    // This field is internal-only — it must only be injected by the permission
    // system (SedEditPermissionRequest) after user approval. If the model supplies
    // it, the schema's strictObject should already reject it, but we strip here
    // as a safeguard against future regressions.
    let processedInput = parsedInput.data;
    if (tool.name === toolName_js_1.BASH_TOOL_NAME &&
        processedInput &&
        typeof processedInput === 'object' &&
        '_simulatedSedEdit' in processedInput) {
        const { _simulatedSedEdit: _, ...rest } = processedInput;
        processedInput = rest;
    }
    // Backfill legacy/derived fields on a shallow clone so hooks/canUseTool see
    // them without affecting tool.call(). SendMessageTool adds fields; file
    // tools overwrite file_path with expandPath — that mutation must not reach
    // call() because tool results embed the input path verbatim (e.g. "File
    // created successfully at: {path}"), and changing it alters the serialized
    // transcript and VCR fixture hashes. If a hook/permission later returns a
    // fresh updatedInput, callInput converges on it below — that replacement
    // is intentional and should reach call().
    let callInput = processedInput;
    const backfilledClone = tool.backfillObservableInput &&
        typeof processedInput === 'object' &&
        processedInput !== null
        ? { ...processedInput }
        : null;
    if (backfilledClone) {
        tool.backfillObservableInput(backfilledClone);
        processedInput = backfilledClone;
    }
    let shouldPreventContinuation = false;
    let stopReason;
    let hookPermissionResult;
    const preToolHookInfos = [];
    const preToolHookStart = Date.now();
    for await (const result of (0, toolHooks_js_1.runPreToolUseHooks)(toolUseContext, tool, processedInput, toolUseID, assistantMessage.message.id, requestId, mcpServerType, mcpServerBaseUrl)) {
        switch (result.type) {
            case 'message':
                if (result.message.message.type === 'progress') {
                    onToolProgress(result.message.message);
                }
                else {
                    resultingMessages.push(result.message);
                    const att = result.message.message.attachment;
                    if (att &&
                        'command' in att &&
                        att.command !== undefined &&
                        'durationMs' in att &&
                        att.durationMs !== undefined) {
                        preToolHookInfos.push({
                            command: att.command,
                            durationMs: att.durationMs,
                        });
                    }
                }
                break;
            case 'hookPermissionResult':
                hookPermissionResult = result.hookPermissionResult;
                break;
            case 'hookUpdatedInput':
                // Hook provided updatedInput without making a permission decision (passthrough)
                // Update processedInput so it's used in the normal permission flow
                processedInput = result.updatedInput;
                break;
            case 'preventContinuation':
                shouldPreventContinuation = result.shouldPreventContinuation;
                break;
            case 'stopReason':
                stopReason = result.stopReason;
                break;
            case 'additionalContext':
                resultingMessages.push(result.message);
                break;
            case 'stop':
                (0, state_js_1.getStatsStore)()?.observe('pre_tool_hook_duration_ms', Date.now() - preToolHookStart);
                resultingMessages.push({
                    message: (0, messages_js_1.createUserMessage)({
                        content: [(0, messages_js_1.createToolResultStopMessage)(toolUseID)],
                        toolUseResult: `Error: ${stopReason}`,
                        sourceToolAssistantUUID: assistantMessage.uuid,
                    }),
                });
                return resultingMessages;
        }
    }
    const preToolHookDurationMs = Date.now() - preToolHookStart;
    (0, state_js_1.getStatsStore)()?.observe('pre_tool_hook_duration_ms', preToolHookDurationMs);
    if (preToolHookDurationMs >= SLOW_PHASE_LOG_THRESHOLD_MS) {
        (0, debug_js_1.logForDebugging)(`Slow PreToolUse hooks: ${preToolHookDurationMs}ms for ${tool.name} (${preToolHookInfos.length} hooks)`, { level: 'info' });
    }
    // Emit PreToolUse summary immediately so it's visible while the tool executes.
    // Use wall-clock time (not sum of individual durations) since hooks run in parallel.
    if (process.env.USER_TYPE === 'ant' && preToolHookInfos.length > 0) {
        if (preToolHookDurationMs > exports.HOOK_TIMING_DISPLAY_THRESHOLD_MS) {
            resultingMessages.push({
                message: (0, messages_js_1.createStopHookSummaryMessage)(preToolHookInfos.length, preToolHookInfos, [], false, undefined, false, 'suggestion', undefined, 'PreToolUse', preToolHookDurationMs),
            });
        }
    }
    const toolAttributes = {};
    if (processedInput && typeof processedInput === 'object') {
        if (tool.name === prompt_js_1.FILE_READ_TOOL_NAME && 'file_path' in processedInput) {
            toolAttributes.file_path = String(processedInput.file_path);
        }
        else if ((tool.name === constants_js_1.FILE_EDIT_TOOL_NAME ||
            tool.name === prompt_js_2.FILE_WRITE_TOOL_NAME) &&
            'file_path' in processedInput) {
            toolAttributes.file_path = String(processedInput.file_path);
        }
        else if (tool.name === toolName_js_1.BASH_TOOL_NAME && 'command' in processedInput) {
            const bashInput = processedInput;
            toolAttributes.full_command = bashInput.command;
        }
    }
    (0, sessionTracing_js_1.startToolSpan)(tool.name, toolAttributes, (0, sessionTracing_js_1.isBetaTracingEnabled)() ? (0, slowOperations_js_1.jsonStringify)(processedInput) : undefined);
    (0, sessionTracing_js_1.startToolBlockedOnUserSpan)();
    // Check whether we have permission to use the tool,
    // and ask the user for permission if we don't
    const permissionMode = toolUseContext.getAppState().toolPermissionContext.mode;
    const permissionStart = Date.now();
    const resolved = await (0, toolHooks_js_1.resolveHookPermissionDecision)(hookPermissionResult, tool, processedInput, toolUseContext, canUseTool, assistantMessage, toolUseID);
    const permissionDecision = resolved.decision;
    processedInput = resolved.input;
    const permissionDurationMs = Date.now() - permissionStart;
    // In auto mode, canUseTool awaits the classifier (side_query) — if that's
    // slow the collapsed view shows "Running…" with no (Ns) tick since
    // bash_progress hasn't started yet. Auto-only: in default mode this timer
    // includes interactive-dialog wait (user think time), which is just noise.
    if (permissionDurationMs >= SLOW_PHASE_LOG_THRESHOLD_MS &&
        permissionMode === 'auto') {
        (0, debug_js_1.logForDebugging)(`Slow permission decision: ${permissionDurationMs}ms for ${tool.name} ` +
            `(mode=${permissionMode}, behavior=${permissionDecision.behavior})`, { level: 'info' });
    }
    // Emit tool_decision OTel event and code-edit counter if the interactive
    // permission path didn't already log it (headless mode bypasses permission
    // logging, so we need to emit both the generic event and the code-edit
    // counter here)
    if (permissionDecision.behavior !== 'ask' &&
        !toolUseContext.toolDecisions?.has(toolUseID)) {
        const decision = permissionDecision.behavior === 'allow' ? 'accept' : 'reject';
        const source = decisionReasonToOTelSource(permissionDecision.decisionReason, permissionDecision.behavior);
        void (0, events_js_1.logOTelEvent)('tool_decision', {
            decision,
            source,
            tool_name: (0, metadata_js_1.sanitizeToolNameForAnalytics)(tool.name),
        });
        // Increment code-edit tool decision counter for headless mode
        if ((0, permissionLogging_js_1.isCodeEditingTool)(tool.name)) {
            void (0, permissionLogging_js_1.buildCodeEditToolAttributes)(tool, processedInput, decision, source).then(attributes => (0, state_js_1.getCodeEditToolDecisionCounter)()?.add(1, attributes));
        }
    }
    // Add message if permission was granted/denied by PermissionRequest hook
    if (permissionDecision.decisionReason?.type === 'hook' &&
        permissionDecision.decisionReason.hookName === 'PermissionRequest' &&
        permissionDecision.behavior !== 'ask') {
        resultingMessages.push({
            message: (0, attachments_js_1.createAttachmentMessage)({
                type: 'hook_permission_decision',
                decision: permissionDecision.behavior,
                toolUseID,
                hookEvent: 'PermissionRequest',
            }),
        });
    }
    if (permissionDecision.behavior !== 'allow') {
        (0, debug_js_1.logForDebugging)(`${tool.name} tool permission denied`);
        const decisionInfo = toolUseContext.toolDecisions?.get(toolUseID);
        (0, sessionTracing_js_1.endToolBlockedOnUserSpan)('reject', decisionInfo?.source || 'unknown');
        (0, sessionTracing_js_1.endToolSpan)();
        (0, index_js_1.logEvent)('tengu_tool_use_can_use_tool_rejected', {
            messageID: messageId,
            toolName: (0, metadata_js_1.sanitizeToolNameForAnalytics)(tool.name),
            queryChainId: toolUseContext.queryTracking
                ?.chainId,
            queryDepth: toolUseContext.queryTracking?.depth,
            ...(mcpServerType && {
                mcpServerType: mcpServerType,
            }),
            ...(mcpServerBaseUrl && {
                mcpServerBaseUrl: mcpServerBaseUrl,
            }),
            ...(requestId && {
                requestId: requestId,
            }),
            ...(0, metadata_js_1.mcpToolDetailsForAnalytics)(tool.name, mcpServerType, mcpServerBaseUrl),
        });
        let errorMessage = permissionDecision.message;
        // Only use generic "Execution stopped" message if we don't have a detailed hook message
        if (shouldPreventContinuation && !errorMessage) {
            errorMessage = `Execution stopped by PreToolUse hook${stopReason ? `: ${stopReason}` : ''}`;
        }
        // Build top-level content: tool_result (text-only for is_error compatibility) + images alongside
        const messageContent = [
            {
                type: 'tool_result',
                content: errorMessage,
                is_error: true,
                tool_use_id: toolUseID,
            },
        ];
        // Add image blocks at top level (not inside tool_result, which rejects non-text with is_error)
        const rejectContentBlocks = permissionDecision.behavior === 'ask'
            ? permissionDecision.contentBlocks
            : undefined;
        if (rejectContentBlocks?.length) {
            messageContent.push(...rejectContentBlocks);
        }
        // Generate sequential imagePasteIds so each image renders with a distinct label
        let rejectImageIds;
        if (rejectContentBlocks?.length) {
            const imageCount = (0, array_js_1.count)(rejectContentBlocks, (b) => b.type === 'image');
            if (imageCount > 0) {
                const startId = getNextImagePasteId(toolUseContext.messages);
                rejectImageIds = Array.from({ length: imageCount }, (_, i) => startId + i);
            }
        }
        resultingMessages.push({
            message: (0, messages_js_1.createUserMessage)({
                content: messageContent,
                imagePasteIds: rejectImageIds,
                toolUseResult: `Error: ${errorMessage}`,
                sourceToolAssistantUUID: assistantMessage.uuid,
            }),
        });
        // Run PermissionDenied hooks for auto mode classifier denials.
        // If a hook returns {retry: true}, tell the model it may retry.
        if ((0, bun_bundle_1.feature)('TRANSCRIPT_CLASSIFIER') &&
            permissionDecision.decisionReason?.type === 'classifier' &&
            permissionDecision.decisionReason.classifier === 'auto-mode') {
            let hookSaysRetry = false;
            for await (const result of (0, hooks_js_1.executePermissionDeniedHooks)(tool.name, toolUseID, processedInput, permissionDecision.decisionReason.reason ?? 'Permission denied', toolUseContext, permissionMode, toolUseContext.abortController.signal)) {
                if (result.retry)
                    hookSaysRetry = true;
            }
            if (hookSaysRetry) {
                resultingMessages.push({
                    message: (0, messages_js_1.createUserMessage)({
                        content: 'The PermissionDenied hook indicated this command is now approved. You may retry it if you would like.',
                        isMeta: true,
                    }),
                });
            }
        }
        return resultingMessages;
    }
    (0, index_js_1.logEvent)('tengu_tool_use_can_use_tool_allowed', {
        messageID: messageId,
        toolName: (0, metadata_js_1.sanitizeToolNameForAnalytics)(tool.name),
        queryChainId: toolUseContext.queryTracking
            ?.chainId,
        queryDepth: toolUseContext.queryTracking?.depth,
        ...(mcpServerType && {
            mcpServerType: mcpServerType,
        }),
        ...(mcpServerBaseUrl && {
            mcpServerBaseUrl: mcpServerBaseUrl,
        }),
        ...(requestId && {
            requestId: requestId,
        }),
        ...(0, metadata_js_1.mcpToolDetailsForAnalytics)(tool.name, mcpServerType, mcpServerBaseUrl),
    });
    // Use the updated input from permissions if provided
    // (Don't overwrite if undefined - processedInput may have been modified by passthrough hooks)
    if (permissionDecision.updatedInput !== undefined) {
        processedInput = permissionDecision.updatedInput;
    }
    // Prepare tool parameters for logging in tool_result event.
    // Gated by OTEL_LOG_TOOL_DETAILS — tool parameters can contain sensitive
    // content (bash commands, MCP server names, etc.) so they're opt-in only.
    const telemetryToolInput = (0, metadata_js_1.extractToolInputForTelemetry)(processedInput);
    let toolParameters = {};
    if ((0, metadata_js_1.isToolDetailsLoggingEnabled)()) {
        if (tool.name === toolName_js_1.BASH_TOOL_NAME && 'command' in processedInput) {
            const bashInput = processedInput;
            const commandParts = bashInput.command.trim().split(/\s+/);
            const bashCommand = commandParts[0] || '';
            toolParameters = {
                bash_command: bashCommand,
                full_command: bashInput.command,
                ...(bashInput.timeout !== undefined && {
                    timeout: bashInput.timeout,
                }),
                ...(bashInput.description !== undefined && {
                    description: bashInput.description,
                }),
                ...('dangerouslyDisableSandbox' in bashInput && {
                    dangerouslyDisableSandbox: bashInput.dangerouslyDisableSandbox,
                }),
            };
        }
        const mcpDetails = (0, metadata_js_1.extractMcpToolDetails)(tool.name);
        if (mcpDetails) {
            toolParameters.mcp_server_name = mcpDetails.serverName;
            toolParameters.mcp_tool_name = mcpDetails.mcpToolName;
        }
        const skillName = (0, metadata_js_1.extractSkillName)(tool.name, processedInput);
        if (skillName) {
            toolParameters.skill_name = skillName;
        }
    }
    const decisionInfo = toolUseContext.toolDecisions?.get(toolUseID);
    (0, sessionTracing_js_1.endToolBlockedOnUserSpan)(decisionInfo?.decision || 'unknown', decisionInfo?.source || 'unknown');
    (0, sessionTracing_js_1.startToolExecutionSpan)();
    const startTime = Date.now();
    (0, sessionActivity_js_1.startSessionActivity)('tool_exec');
    // If processedInput still points at the backfill clone, no hook/permission
    // replaced it — pass the pre-backfill callInput so call() sees the model's
    // original field values. Otherwise converge on the hook-supplied input.
    // Permission/hook flows may return a fresh object derived from the
    // backfilled clone (e.g. via inputSchema.parse). If its file_path matches
    // the backfill-expanded value, restore the model's original so the tool
    // result string embeds the path the model emitted — keeps transcript/VCR
    // hashes stable. Other hook modifications flow through unchanged.
    if (backfilledClone &&
        processedInput !== callInput &&
        typeof processedInput === 'object' &&
        processedInput !== null &&
        'file_path' in processedInput &&
        'file_path' in callInput &&
        processedInput.file_path ===
            backfilledClone.file_path) {
        callInput = {
            ...processedInput,
            file_path: callInput.file_path,
        };
    }
    else if (processedInput !== backfilledClone) {
        callInput = processedInput;
    }
    try {
        const result = await tool.call(callInput, {
            ...toolUseContext,
            toolUseId: toolUseID,
            userModified: permissionDecision.userModified ?? false,
        }, canUseTool, assistantMessage, progress => {
            onToolProgress({
                toolUseID: progress.toolUseID,
                data: progress.data,
            });
        });
        const durationMs = Date.now() - startTime;
        (0, state_js_1.addToToolDuration)(durationMs);
        // Log tool content/output as span event if enabled
        if (result.data && typeof result.data === 'object') {
            const contentAttributes = {};
            // Read tool: capture file_path and content
            if (tool.name === prompt_js_1.FILE_READ_TOOL_NAME && 'content' in result.data) {
                if ('file_path' in processedInput) {
                    contentAttributes.file_path = String(processedInput.file_path);
                }
                contentAttributes.content = String(result.data.content);
            }
            // Edit/Write tools: capture file_path and diff
            if ((tool.name === constants_js_1.FILE_EDIT_TOOL_NAME ||
                tool.name === prompt_js_2.FILE_WRITE_TOOL_NAME) &&
                'file_path' in processedInput) {
                contentAttributes.file_path = String(processedInput.file_path);
                // For Edit, capture the actual changes made
                if (tool.name === constants_js_1.FILE_EDIT_TOOL_NAME && 'diff' in result.data) {
                    contentAttributes.diff = String(result.data.diff);
                }
                // For Write, capture the written content
                if (tool.name === prompt_js_2.FILE_WRITE_TOOL_NAME && 'content' in processedInput) {
                    contentAttributes.content = String(processedInput.content);
                }
            }
            // Bash tool: capture command
            if (tool.name === toolName_js_1.BASH_TOOL_NAME && 'command' in processedInput) {
                const bashInput = processedInput;
                contentAttributes.bash_command = bashInput.command;
                // Also capture output if available
                if ('output' in result.data) {
                    contentAttributes.output = String(result.data.output);
                }
            }
            if (Object.keys(contentAttributes).length > 0) {
                (0, sessionTracing_js_1.addToolContentEvent)('tool.output', contentAttributes);
            }
        }
        // Capture structured output from tool result if present
        if (typeof result === 'object' && 'structured_output' in result) {
            // Store the structured output in an attachment message
            resultingMessages.push({
                message: (0, attachments_js_1.createAttachmentMessage)({
                    type: 'structured_output',
                    data: result.structured_output,
                }),
            });
        }
        (0, sessionTracing_js_1.endToolExecutionSpan)({ success: true });
        // Pass tool result for new_context logging
        const toolResultStr = result.data && typeof result.data === 'object'
            ? (0, slowOperations_js_1.jsonStringify)(result.data)
            : String(result.data ?? '');
        (0, sessionTracing_js_1.endToolSpan)(toolResultStr);
        // Map the tool result to API format once and cache it. This block is reused
        // by addToolResult (skipping the remap) and measured here for analytics.
        const mappedToolResultBlock = tool.mapToolResultToToolResultBlockParam(result.data, toolUseID);
        const mappedContent = mappedToolResultBlock.content;
        const toolResultSizeBytes = !mappedContent
            ? 0
            : typeof mappedContent === 'string'
                ? mappedContent.length
                : (0, slowOperations_js_1.jsonStringify)(mappedContent).length;
        // Extract file extension for file-related tools
        let fileExtension;
        if (processedInput && typeof processedInput === 'object') {
            if ((tool.name === prompt_js_1.FILE_READ_TOOL_NAME ||
                tool.name === constants_js_1.FILE_EDIT_TOOL_NAME ||
                tool.name === prompt_js_2.FILE_WRITE_TOOL_NAME) &&
                'file_path' in processedInput) {
                fileExtension = (0, metadata_js_1.getFileExtensionForAnalytics)(String(processedInput.file_path));
            }
            else if (tool.name === constants_js_2.NOTEBOOK_EDIT_TOOL_NAME &&
                'notebook_path' in processedInput) {
                fileExtension = (0, metadata_js_1.getFileExtensionForAnalytics)(String(processedInput.notebook_path));
            }
            else if (tool.name === toolName_js_1.BASH_TOOL_NAME && 'command' in processedInput) {
                const bashInput = processedInput;
                fileExtension = (0, metadata_js_1.getFileExtensionsFromBashCommand)(bashInput.command, bashInput._simulatedSedEdit?.filePath);
            }
        }
        (0, index_js_1.logEvent)('tengu_tool_use_success', {
            messageID: messageId,
            toolName: (0, metadata_js_1.sanitizeToolNameForAnalytics)(tool.name),
            isMcp: tool.isMcp ?? false,
            durationMs,
            preToolHookDurationMs,
            toolResultSizeBytes,
            ...(fileExtension !== undefined && { fileExtension }),
            queryChainId: toolUseContext.queryTracking
                ?.chainId,
            queryDepth: toolUseContext.queryTracking?.depth,
            ...(mcpServerType && {
                mcpServerType: mcpServerType,
            }),
            ...(mcpServerBaseUrl && {
                mcpServerBaseUrl: mcpServerBaseUrl,
            }),
            ...(requestId && {
                requestId: requestId,
            }),
            ...(0, metadata_js_1.mcpToolDetailsForAnalytics)(tool.name, mcpServerType, mcpServerBaseUrl),
        });
        // Enrich tool parameters with git commit ID from successful git commit output
        if ((0, metadata_js_1.isToolDetailsLoggingEnabled)() &&
            (tool.name === toolName_js_1.BASH_TOOL_NAME || tool.name === toolName_js_2.POWERSHELL_TOOL_NAME) &&
            'command' in processedInput &&
            typeof processedInput.command === 'string' &&
            processedInput.command.match(/\bgit\s+commit\b/) &&
            result.data &&
            typeof result.data === 'object' &&
            'stdout' in result.data) {
            const gitCommitId = (0, gitOperationTracking_js_1.parseGitCommitId)(String(result.data.stdout));
            if (gitCommitId) {
                toolParameters.git_commit_id = gitCommitId;
            }
        }
        // Log tool result event for OTLP with tool parameters and decision context
        const mcpServerScope = (0, utils_js_1.isMcpTool)(tool)
            ? (0, utils_js_1.getMcpServerScopeFromToolName)(tool.name)
            : null;
        void (0, events_js_1.logOTelEvent)('tool_result', {
            tool_name: (0, metadata_js_1.sanitizeToolNameForAnalytics)(tool.name),
            success: 'true',
            duration_ms: String(durationMs),
            ...(Object.keys(toolParameters).length > 0 && {
                tool_parameters: (0, slowOperations_js_1.jsonStringify)(toolParameters),
            }),
            ...(telemetryToolInput && { tool_input: telemetryToolInput }),
            tool_result_size_bytes: String(toolResultSizeBytes),
            ...(decisionInfo && {
                decision_source: decisionInfo.source,
                decision_type: decisionInfo.decision,
            }),
            ...(mcpServerScope && { mcp_server_scope: mcpServerScope }),
        });
        // Run PostToolUse hooks
        let toolOutput = result.data;
        const hookResults = [];
        const toolContextModifier = result.contextModifier;
        const mcpMeta = result.mcpMeta;
        async function addToolResult(toolUseResult, preMappedBlock) {
            // Use the pre-mapped block when available (non-MCP tools where hooks
            // don't modify the output), otherwise map from scratch.
            const toolResultBlock = preMappedBlock
                ? await (0, toolResultStorage_js_1.processPreMappedToolResultBlock)(preMappedBlock, tool.name, tool.maxResultSizeChars)
                : await (0, toolResultStorage_js_1.processToolResultBlock)(tool, toolUseResult, toolUseID);
            // Build content blocks - tool result first, then optional feedback
            const contentBlocks = [toolResultBlock];
            // Add accept feedback if user provided feedback when approving
            // (acceptFeedback only exists on PermissionAllowDecision, which is guaranteed here)
            if ('acceptFeedback' in permissionDecision &&
                permissionDecision.acceptFeedback) {
                contentBlocks.push({
                    type: 'text',
                    text: permissionDecision.acceptFeedback,
                });
            }
            // Add content blocks (e.g., pasted images) from the permission decision
            const allowContentBlocks = 'contentBlocks' in permissionDecision
                ? permissionDecision.contentBlocks
                : undefined;
            if (allowContentBlocks?.length) {
                contentBlocks.push(...allowContentBlocks);
            }
            // Generate sequential imagePasteIds so each image renders with a distinct label
            let allowImageIds;
            if (allowContentBlocks?.length) {
                const imageCount = (0, array_js_1.count)(allowContentBlocks, (b) => b.type === 'image');
                if (imageCount > 0) {
                    const startId = getNextImagePasteId(toolUseContext.messages);
                    allowImageIds = Array.from({ length: imageCount }, (_, i) => startId + i);
                }
            }
            resultingMessages.push({
                message: (0, messages_js_1.createUserMessage)({
                    content: contentBlocks,
                    imagePasteIds: allowImageIds,
                    toolUseResult: toolUseContext.agentId && !toolUseContext.preserveToolUseResults
                        ? undefined
                        : toolUseResult,
                    mcpMeta: toolUseContext.agentId ? undefined : mcpMeta,
                    sourceToolAssistantUUID: assistantMessage.uuid,
                }),
                contextModifier: toolContextModifier
                    ? {
                        toolUseID: toolUseID,
                        modifyContext: toolContextModifier,
                    }
                    : undefined,
            });
        }
        // TOOD(hackyon): refactor so we don't have different experiences for MCP tools
        if (!(0, utils_js_1.isMcpTool)(tool)) {
            await addToolResult(toolOutput, mappedToolResultBlock);
        }
        const postToolHookInfos = [];
        const postToolHookStart = Date.now();
        for await (const hookResult of (0, toolHooks_js_1.runPostToolUseHooks)(toolUseContext, tool, toolUseID, assistantMessage.message.id, processedInput, toolOutput, requestId, mcpServerType, mcpServerBaseUrl)) {
            if ('updatedMCPToolOutput' in hookResult) {
                if ((0, utils_js_1.isMcpTool)(tool)) {
                    toolOutput = hookResult.updatedMCPToolOutput;
                }
            }
            else if ((0, utils_js_1.isMcpTool)(tool)) {
                hookResults.push(hookResult);
                if (hookResult.message.type === 'attachment') {
                    const att = hookResult.message.attachment;
                    if ('command' in att &&
                        att.command !== undefined &&
                        'durationMs' in att &&
                        att.durationMs !== undefined) {
                        postToolHookInfos.push({
                            command: att.command,
                            durationMs: att.durationMs,
                        });
                    }
                }
            }
            else {
                resultingMessages.push(hookResult);
                if (hookResult.message.type === 'attachment') {
                    const att = hookResult.message.attachment;
                    if ('command' in att &&
                        att.command !== undefined &&
                        'durationMs' in att &&
                        att.durationMs !== undefined) {
                        postToolHookInfos.push({
                            command: att.command,
                            durationMs: att.durationMs,
                        });
                    }
                }
            }
        }
        const postToolHookDurationMs = Date.now() - postToolHookStart;
        if (postToolHookDurationMs >= SLOW_PHASE_LOG_THRESHOLD_MS) {
            (0, debug_js_1.logForDebugging)(`Slow PostToolUse hooks: ${postToolHookDurationMs}ms for ${tool.name} (${postToolHookInfos.length} hooks)`, { level: 'info' });
        }
        if ((0, utils_js_1.isMcpTool)(tool)) {
            await addToolResult(toolOutput);
        }
        // Show PostToolUse hook timing inline below tool result when > 500ms.
        // Use wall-clock time (not sum of individual durations) since hooks run in parallel.
        if (process.env.USER_TYPE === 'ant' && postToolHookInfos.length > 0) {
            if (postToolHookDurationMs > exports.HOOK_TIMING_DISPLAY_THRESHOLD_MS) {
                resultingMessages.push({
                    message: (0, messages_js_1.createStopHookSummaryMessage)(postToolHookInfos.length, postToolHookInfos, [], false, undefined, false, 'suggestion', undefined, 'PostToolUse', postToolHookDurationMs),
                });
            }
        }
        // If the tool provided new messages, add them to the list to return.
        if (result.newMessages && result.newMessages.length > 0) {
            for (const message of result.newMessages) {
                resultingMessages.push({ message });
            }
        }
        // If hook indicated to prevent continuation after successful execution, yield a stop reason message
        if (shouldPreventContinuation) {
            resultingMessages.push({
                message: (0, attachments_js_1.createAttachmentMessage)({
                    type: 'hook_stopped_continuation',
                    message: stopReason || 'Execution stopped by hook',
                    hookName: `PreToolUse:${tool.name}`,
                    toolUseID: toolUseID,
                    hookEvent: 'PreToolUse',
                }),
            });
        }
        // Yield the remaining hook results after the other messages are sent
        for (const hookResult of hookResults) {
            resultingMessages.push(hookResult);
        }
        return resultingMessages;
    }
    catch (error) {
        const durationMs = Date.now() - startTime;
        (0, state_js_1.addToToolDuration)(durationMs);
        (0, sessionTracing_js_1.endToolExecutionSpan)({
            success: false,
            error: (0, errors_js_1.errorMessage)(error),
        });
        (0, sessionTracing_js_1.endToolSpan)();
        // Handle MCP auth errors by updating the client status to 'needs-auth'
        // This updates the /mcp display to show the server needs re-authorization
        if (error instanceof client_js_1.McpAuthError) {
            toolUseContext.setAppState(prevState => {
                const serverName = error.serverName;
                const existingClientIndex = prevState.mcp.clients.findIndex(c => c.name === serverName);
                if (existingClientIndex === -1) {
                    return prevState;
                }
                const existingClient = prevState.mcp.clients[existingClientIndex];
                // Only update if client was connected (don't overwrite other states)
                if (!existingClient || existingClient.type !== 'connected') {
                    return prevState;
                }
                const updatedClients = [...prevState.mcp.clients];
                updatedClients[existingClientIndex] = {
                    name: serverName,
                    type: 'needs-auth',
                    config: existingClient.config,
                };
                return {
                    ...prevState,
                    mcp: {
                        ...prevState.mcp,
                        clients: updatedClients,
                    },
                };
            });
        }
        if (!(error instanceof errors_js_1.AbortError)) {
            const errorMsg = (0, errors_js_1.errorMessage)(error);
            (0, debug_js_1.logForDebugging)(`${tool.name} tool error (${durationMs}ms): ${errorMsg.slice(0, 200)}`);
            if (!(error instanceof errors_js_1.ShellError)) {
                (0, log_js_1.logError)(error);
            }
            (0, index_js_1.logEvent)('tengu_tool_use_error', {
                messageID: messageId,
                toolName: (0, metadata_js_1.sanitizeToolNameForAnalytics)(tool.name),
                error: classifyToolError(error),
                isMcp: tool.isMcp ?? false,
                queryChainId: toolUseContext.queryTracking
                    ?.chainId,
                queryDepth: toolUseContext.queryTracking?.depth,
                ...(mcpServerType && {
                    mcpServerType: mcpServerType,
                }),
                ...(mcpServerBaseUrl && {
                    mcpServerBaseUrl: mcpServerBaseUrl,
                }),
                ...(requestId && {
                    requestId: requestId,
                }),
                ...(0, metadata_js_1.mcpToolDetailsForAnalytics)(tool.name, mcpServerType, mcpServerBaseUrl),
            });
            // Log tool result error event for OTLP with tool parameters and decision context
            const mcpServerScope = (0, utils_js_1.isMcpTool)(tool)
                ? (0, utils_js_1.getMcpServerScopeFromToolName)(tool.name)
                : null;
            void (0, events_js_1.logOTelEvent)('tool_result', {
                tool_name: (0, metadata_js_1.sanitizeToolNameForAnalytics)(tool.name),
                use_id: toolUseID,
                success: 'false',
                duration_ms: String(durationMs),
                error: (0, errors_js_1.errorMessage)(error),
                ...(Object.keys(toolParameters).length > 0 && {
                    tool_parameters: (0, slowOperations_js_1.jsonStringify)(toolParameters),
                }),
                ...(telemetryToolInput && { tool_input: telemetryToolInput }),
                ...(decisionInfo && {
                    decision_source: decisionInfo.source,
                    decision_type: decisionInfo.decision,
                }),
                ...(mcpServerScope && { mcp_server_scope: mcpServerScope }),
            });
        }
        const content = (0, toolErrors_js_1.formatError)(error);
        // Determine if this was a user interrupt
        const isInterrupt = error instanceof errors_js_1.AbortError;
        // Run PostToolUseFailure hooks
        const hookMessages = [];
        for await (const hookResult of (0, toolHooks_js_1.runPostToolUseFailureHooks)(toolUseContext, tool, toolUseID, messageId, processedInput, content, isInterrupt, requestId, mcpServerType, mcpServerBaseUrl)) {
            hookMessages.push(hookResult);
        }
        return [
            {
                message: (0, messages_js_1.createUserMessage)({
                    content: [
                        {
                            type: 'tool_result',
                            content,
                            is_error: true,
                            tool_use_id: toolUseID,
                        },
                    ],
                    toolUseResult: `Error: ${content}`,
                    mcpMeta: toolUseContext.agentId
                        ? undefined
                        : error instanceof
                            client_js_1.McpToolCallError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
                            ? error.mcpMeta
                            : undefined,
                    sourceToolAssistantUUID: assistantMessage.uuid,
                }),
            },
            ...hookMessages,
        ];
    }
    finally {
        (0, sessionActivity_js_1.stopSessionActivity)('tool_exec');
        // Clean up decision info after logging
        if (decisionInfo) {
            toolUseContext.toolDecisions?.delete(toolUseID);
        }
    }
}
