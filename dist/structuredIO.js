"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StructuredIO = exports.SANDBOX_NETWORK_ACCESS_TOOL_NAME = void 0;
const bun_bundle_1 = require("bun:bundle");
const crypto_1 = require("crypto");
const controlSchemas_js_1 = require("src/entrypoints/sdk/controlSchemas.js");
const hooks_js_1 = require("src/types/hooks.js");
const debug_js_1 = require("src/utils/debug.js");
const diagLogs_js_1 = require("src/utils/diagLogs.js");
const errors_js_1 = require("src/utils/errors.js");
const PermissionPromptToolResultSchema_js_1 = require("src/utils/permissions/PermissionPromptToolResultSchema.js");
const permissions_js_1 = require("src/utils/permissions/permissions.js");
const process_js_1 = require("src/utils/process.js");
const slowOperations_js_1 = require("src/utils/slowOperations.js");
const v4_1 = require("zod/v4");
const commandLifecycle_js_1 = require("../utils/commandLifecycle.js");
const controlMessageCompat_js_1 = require("../utils/controlMessageCompat.js");
const hooks_js_2 = require("../utils/hooks.js");
const PermissionUpdate_js_1 = require("../utils/permissions/PermissionUpdate.js");
const sessionState_js_1 = require("../utils/sessionState.js");
const slowOperations_js_2 = require("../utils/slowOperations.js");
const stream_js_1 = require("../utils/stream.js");
const ndjsonSafeStringify_js_1 = require("./ndjsonSafeStringify.js");
/**
 * Synthetic tool name used when forwarding sandbox network permission
 * requests via the can_use_tool control_request protocol. SDK hosts
 * see this as a normal tool permission prompt.
 */
exports.SANDBOX_NETWORK_ACCESS_TOOL_NAME = 'SandboxNetworkAccess';
function serializeDecisionReason(reason) {
    if (!reason) {
        return undefined;
    }
    if (((0, bun_bundle_1.feature)('BASH_CLASSIFIER') || (0, bun_bundle_1.feature)('TRANSCRIPT_CLASSIFIER')) &&
        reason.type === 'classifier') {
        return reason.reason;
    }
    switch (reason.type) {
        case 'rule':
        case 'mode':
        case 'subcommandResults':
        case 'permissionPromptTool':
            return undefined;
        case 'hook':
        case 'asyncAgent':
        case 'sandboxOverride':
        case 'workingDir':
        case 'safetyCheck':
        case 'other':
            return reason.reason;
    }
}
function buildRequiresActionDetails(tool, input, toolUseID, requestId) {
    // Per-tool summary methods may throw on malformed input; permission
    // handling must not break because of a bad description.
    let description;
    try {
        description =
            tool.getActivityDescription?.(input) ??
                tool.getToolUseSummary?.(input) ??
                tool.userFacingName(input);
    }
    catch {
        description = tool.name;
    }
    return {
        tool_name: tool.name,
        action_description: description,
        tool_use_id: toolUseID,
        request_id: requestId,
        input,
    };
}
/**
 * Provides a structured way to read and write SDK messages from stdio,
 * capturing the SDK protocol.
 */
// Maximum number of resolved tool_use IDs to track. Once exceeded, the oldest
// entry is evicted. This bounds memory in very long sessions while keeping
// enough history to catch duplicate control_response deliveries.
const MAX_RESOLVED_TOOL_USE_IDS = 1000;
class StructuredIO {
    constructor(input, replayUserMessages) {
        this.input = input;
        this.replayUserMessages = replayUserMessages;
        this.pendingRequests = new Map();
        // CCR external_metadata read back on worker start; null when the
        // transport doesn't restore. Assigned by RemoteIO.
        this.restoredWorkerState = Promise.resolve(null);
        this.inputClosed = false;
        // Tracks tool_use IDs that have been resolved through the normal permission
        // flow (or aborted by a hook). When a duplicate control_response arrives
        // after the original was already handled, this Set prevents the orphan
        // handler from re-processing it — which would push duplicate assistant
        // messages into mutableMessages and cause a 400 "tool_use ids must be unique"
        // error from the API.
        this.resolvedToolUseIds = new Set();
        this.prependedLines = [];
        // sendRequest() and print.ts both enqueue here; the drain loop is the
        // only writer. Prevents control_request from overtaking queued stream_events.
        this.outbound = new stream_js_1.Stream();
        this.input = input;
        this.structuredInput = this.read();
    }
    /**
     * Records a tool_use ID as resolved so that late/duplicate control_response
     * messages for the same tool are ignored by the orphan handler.
     */
    trackResolvedToolUseId(request) {
        if (request.request.subtype === 'can_use_tool') {
            this.resolvedToolUseIds.add(request.request.tool_use_id);
            if (this.resolvedToolUseIds.size > MAX_RESOLVED_TOOL_USE_IDS) {
                // Evict the oldest entry (Sets iterate in insertion order)
                const first = this.resolvedToolUseIds.values().next().value;
                if (first !== undefined) {
                    this.resolvedToolUseIds.delete(first);
                }
            }
        }
    }
    /** Flush pending internal events. No-op for non-remote IO. Overridden by RemoteIO. */
    flushInternalEvents() {
        return Promise.resolve();
    }
    /** Internal-event queue depth. Overridden by RemoteIO; zero otherwise. */
    get internalEventsPending() {
        return 0;
    }
    /**
     * Queue a user turn to be yielded before the next message from this.input.
     * Works before iteration starts and mid-stream — read() re-checks
     * prependedLines between each yielded message.
     */
    prependUserMessage(content) {
        this.prependedLines.push((0, slowOperations_js_1.jsonStringify)({
            type: 'user',
            session_id: '',
            message: { role: 'user', content },
            parent_tool_use_id: null,
        }) + '\n');
    }
    async *read() {
        let content = '';
        // Called once before for-await (an empty this.input otherwise skips the
        // loop body entirely), then again per block. prependedLines re-check is
        // inside the while so a prepend pushed between two messages in the SAME
        // block still lands first.
        const splitAndProcess = async function* () {
            for (;;) {
                if (this.prependedLines.length > 0) {
                    content = this.prependedLines.join('') + content;
                    this.prependedLines = [];
                }
                const newline = content.indexOf('\n');
                if (newline === -1)
                    break;
                const line = content.slice(0, newline);
                content = content.slice(newline + 1);
                const message = await this.processLine(line);
                if (message) {
                    (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'cli_stdin_message_parsed', {
                        type: message.type,
                    });
                    yield message;
                }
            }
        }.bind(this);
        yield* splitAndProcess();
        for await (const block of this.input) {
            content += block;
            yield* splitAndProcess();
        }
        if (content) {
            const message = await this.processLine(content);
            if (message) {
                yield message;
            }
        }
        this.inputClosed = true;
        for (const request of this.pendingRequests.values()) {
            // Reject all pending requests if the input stream
            request.reject(new Error('Tool permission stream closed before response received'));
        }
    }
    getPendingPermissionRequests() {
        return Array.from(this.pendingRequests.values())
            .map(entry => entry.request)
            .filter(pr => pr.request.subtype === 'can_use_tool');
    }
    setUnexpectedResponseCallback(callback) {
        this.unexpectedResponseCallback = callback;
    }
    /**
     * Inject a control_response message to resolve a pending permission request.
     * Used by the bridge to feed permission responses from claude.ai into the
     * SDK permission flow.
     *
     * Also sends a control_cancel_request to the SDK consumer so its canUseTool
     * callback is aborted via the signal — otherwise the callback hangs.
     */
    injectControlResponse(response) {
        const requestId = response.response?.request_id;
        if (!requestId)
            return;
        const request = this.pendingRequests.get(requestId);
        if (!request)
            return;
        this.trackResolvedToolUseId(request.request);
        this.pendingRequests.delete(requestId);
        // Cancel the SDK consumer's canUseTool callback — the bridge won.
        void this.write({
            type: 'control_cancel_request',
            request_id: requestId,
        });
        if (response.response.subtype === 'error') {
            request.reject(new Error(response.response.error));
        }
        else {
            const result = response.response.response;
            if (request.schema) {
                try {
                    request.resolve(request.schema.parse(result));
                }
                catch (error) {
                    request.reject(error);
                }
            }
            else {
                request.resolve({});
            }
        }
    }
    /**
     * Register a callback invoked whenever a can_use_tool control_request
     * is written to stdout. Used by the bridge to forward permission
     * requests to claude.ai.
     */
    setOnControlRequestSent(callback) {
        this.onControlRequestSent = callback;
    }
    /**
     * Register a callback invoked when a can_use_tool control_response arrives
     * from the SDK consumer (via stdin). Used by the bridge to cancel the
     * stale permission prompt on claude.ai when the SDK consumer wins the race.
     */
    setOnControlRequestResolved(callback) {
        this.onControlRequestResolved = callback;
    }
    async processLine(line) {
        // Skip empty lines (e.g. from double newlines in piped stdin)
        if (!line) {
            return undefined;
        }
        try {
            const message = (0, controlMessageCompat_js_1.normalizeControlMessageKeys)((0, slowOperations_js_2.jsonParse)(line));
            if (message.type === 'keep_alive') {
                // Silently ignore keep-alive messages
                return undefined;
            }
            if (message.type === 'update_environment_variables') {
                // Apply environment variable updates directly to process.env.
                // Used by bridge session runner for auth token refresh
                // (CLAUDE_CODE_SESSION_ACCESS_TOKEN) which must be readable
                // by the REPL process itself, not just child Bash commands.
                const keys = Object.keys(message.variables);
                for (const [key, value] of Object.entries(message.variables)) {
                    process.env[key] = value;
                }
                (0, debug_js_1.logForDebugging)(`[structuredIO] applied update_environment_variables: ${keys.join(', ')}`);
                return undefined;
            }
            if (message.type === 'control_response') {
                // Close lifecycle for every control_response, including duplicates
                // and orphans — orphans don't yield to print.ts's main loop, so this
                // is the only path that sees them. uuid is server-injected into the
                // payload.
                const uuid = 'uuid' in message && typeof message.uuid === 'string'
                    ? message.uuid
                    : undefined;
                if (uuid) {
                    (0, commandLifecycle_js_1.notifyCommandLifecycle)(uuid, 'completed');
                }
                const request = this.pendingRequests.get(message.response.request_id);
                if (!request) {
                    // Check if this tool_use was already resolved through the normal
                    // permission flow. Duplicate control_response deliveries (e.g. from
                    // WebSocket reconnects) arrive after the original was handled, and
                    // re-processing them would push duplicate assistant messages into
                    // the conversation, causing API 400 errors.
                    const responsePayload = message.response.subtype === 'success'
                        ? message.response.response
                        : undefined;
                    const toolUseID = responsePayload?.toolUseID;
                    if (typeof toolUseID === 'string' &&
                        this.resolvedToolUseIds.has(toolUseID)) {
                        (0, debug_js_1.logForDebugging)(`Ignoring duplicate control_response for already-resolved toolUseID=${toolUseID} request_id=${message.response.request_id}`);
                        return undefined;
                    }
                    if (this.unexpectedResponseCallback) {
                        await this.unexpectedResponseCallback(message);
                    }
                    return undefined; // Ignore responses for requests we don't know about
                }
                this.trackResolvedToolUseId(request.request);
                this.pendingRequests.delete(message.response.request_id);
                // Notify the bridge when the SDK consumer resolves a can_use_tool
                // request, so it can cancel the stale permission prompt on claude.ai.
                if (request.request.request.subtype === 'can_use_tool' &&
                    this.onControlRequestResolved) {
                    this.onControlRequestResolved(message.response.request_id);
                }
                if (message.response.subtype === 'error') {
                    request.reject(new Error(message.response.error));
                    return undefined;
                }
                const result = message.response.response;
                if (request.schema) {
                    try {
                        request.resolve(request.schema.parse(result));
                    }
                    catch (error) {
                        request.reject(error);
                    }
                }
                else {
                    request.resolve({});
                }
                // Propagate control responses when replay is enabled
                if (this.replayUserMessages) {
                    return message;
                }
                return undefined;
            }
            if (message.type !== 'user' &&
                message.type !== 'control_request' &&
                message.type !== 'assistant' &&
                message.type !== 'system') {
                (0, debug_js_1.logForDebugging)(`Ignoring unknown message type: ${message.type}`, {
                    level: 'warn',
                });
                return undefined;
            }
            if (message.type === 'control_request') {
                if (!message.request) {
                    exitWithMessage(`Error: Missing request on control_request`);
                }
                return message;
            }
            if (message.type === 'assistant' || message.type === 'system') {
                return message;
            }
            if (message.message.role !== 'user') {
                exitWithMessage(`Error: Expected message role 'user', got '${message.message.role}'`);
            }
            return message;
        }
        catch (error) {
            // biome-ignore lint/suspicious/noConsole:: intentional console output
            console.error(`Error parsing streaming input line: ${line}: ${error}`);
            // eslint-disable-next-line custom-rules/no-process-exit
            process.exit(1);
        }
    }
    async write(message) {
        (0, process_js_1.writeToStdout)((0, ndjsonSafeStringify_js_1.ndjsonSafeStringify)(message) + '\n');
    }
    async sendRequest(request, schema, signal, requestId = (0, crypto_1.randomUUID)()) {
        const message = {
            type: 'control_request',
            request_id: requestId,
            request,
        };
        if (this.inputClosed) {
            throw new Error('Stream closed');
        }
        if (signal?.aborted) {
            throw new Error('Request aborted');
        }
        this.outbound.enqueue(message);
        if (request.subtype === 'can_use_tool' && this.onControlRequestSent) {
            this.onControlRequestSent(message);
        }
        const aborted = () => {
            this.outbound.enqueue({
                type: 'control_cancel_request',
                request_id: requestId,
            });
            // Immediately reject the outstanding promise, without
            // waiting for the host to acknowledge the cancellation.
            const request = this.pendingRequests.get(requestId);
            if (request) {
                // Track the tool_use ID as resolved before rejecting, so that a
                // late response from the host is ignored by the orphan handler.
                this.trackResolvedToolUseId(request.request);
                request.reject(new errors_js_1.AbortError());
            }
        };
        if (signal) {
            signal.addEventListener('abort', aborted, {
                once: true,
            });
        }
        try {
            return await new Promise((resolve, reject) => {
                this.pendingRequests.set(requestId, {
                    request: {
                        type: 'control_request',
                        request_id: requestId,
                        request,
                    },
                    resolve: result => {
                        resolve(result);
                    },
                    reject,
                    schema,
                });
            });
        }
        finally {
            if (signal) {
                signal.removeEventListener('abort', aborted);
            }
            this.pendingRequests.delete(requestId);
        }
    }
    createCanUseTool(onPermissionPrompt) {
        return async (tool, input, toolUseContext, assistantMessage, toolUseID, forceDecision) => {
            const mainPermissionResult = forceDecision ??
                (await (0, permissions_js_1.hasPermissionsToUseTool)(tool, input, toolUseContext, assistantMessage, toolUseID));
            // If the tool is allowed or denied, return the result
            if (mainPermissionResult.behavior === 'allow' ||
                mainPermissionResult.behavior === 'deny') {
                return mainPermissionResult;
            }
            // Run PermissionRequest hooks in parallel with the SDK permission
            // prompt.  In the terminal CLI, hooks race against the interactive
            // prompt so that e.g. a hook with --delay 20 doesn't block the UI.
            // We need the same behavior here: the SDK host (VS Code, etc.) shows
            // its permission dialog immediately while hooks run in the background.
            // Whichever resolves first wins; the loser is cancelled/ignored.
            // AbortController used to cancel the SDK request if a hook decides first
            const hookAbortController = new AbortController();
            const parentSignal = toolUseContext.abortController.signal;
            // Forward parent abort to our local controller
            const onParentAbort = () => hookAbortController.abort();
            parentSignal.addEventListener('abort', onParentAbort, { once: true });
            try {
                // Start the hook evaluation (runs in background)
                const hookPromise = executePermissionRequestHooksForSDK(tool.name, toolUseID, input, toolUseContext, mainPermissionResult.suggestions).then(decision => ({ source: 'hook', decision }));
                // Start the SDK permission prompt immediately (don't wait for hooks)
                const requestId = (0, crypto_1.randomUUID)();
                onPermissionPrompt?.(buildRequiresActionDetails(tool, input, toolUseID, requestId));
                const sdkPromise = this.sendRequest({
                    subtype: 'can_use_tool',
                    tool_name: tool.name,
                    input,
                    permission_suggestions: mainPermissionResult.suggestions,
                    blocked_path: mainPermissionResult.blockedPath,
                    decision_reason: serializeDecisionReason(mainPermissionResult.decisionReason),
                    tool_use_id: toolUseID,
                    agent_id: toolUseContext.agentId,
                }, (0, PermissionPromptToolResultSchema_js_1.outputSchema)(), hookAbortController.signal, requestId).then(result => ({ source: 'sdk', result }));
                // Race: hook completion vs SDK prompt response.
                // The hook promise always resolves (never rejects), returning
                // undefined if no hook made a decision.
                const winner = await Promise.race([hookPromise, sdkPromise]);
                if (winner.source === 'hook') {
                    if (winner.decision) {
                        // Hook decided — abort the pending SDK request.
                        // Suppress the expected AbortError rejection from sdkPromise.
                        sdkPromise.catch(() => { });
                        hookAbortController.abort();
                        return winner.decision;
                    }
                    // Hook passed through (no decision) — wait for the SDK prompt
                    const sdkResult = await sdkPromise;
                    return (0, PermissionPromptToolResultSchema_js_1.permissionPromptToolResultToPermissionDecision)(sdkResult.result, tool, input, toolUseContext);
                }
                // SDK prompt responded first — use its result (hook still running
                // in background but its result will be ignored)
                return (0, PermissionPromptToolResultSchema_js_1.permissionPromptToolResultToPermissionDecision)(winner.result, tool, input, toolUseContext);
            }
            catch (error) {
                return (0, PermissionPromptToolResultSchema_js_1.permissionPromptToolResultToPermissionDecision)({
                    behavior: 'deny',
                    message: `Tool permission request failed: ${error}`,
                    toolUseID,
                }, tool, input, toolUseContext);
            }
            finally {
                // Only transition back to 'running' if no other permission prompts
                // are pending (concurrent tool execution can have multiple in-flight).
                if (this.getPendingPermissionRequests().length === 0) {
                    (0, sessionState_js_1.notifySessionStateChanged)('running');
                }
                parentSignal.removeEventListener('abort', onParentAbort);
            }
        };
    }
    createHookCallback(callbackId, timeout) {
        return {
            type: 'callback',
            timeout,
            callback: async (input, toolUseID, abort) => {
                try {
                    const result = await this.sendRequest({
                        subtype: 'hook_callback',
                        callback_id: callbackId,
                        input,
                        tool_use_id: toolUseID || undefined,
                    }, (0, hooks_js_1.hookJSONOutputSchema)(), abort);
                    return result;
                }
                catch (error) {
                    // biome-ignore lint/suspicious/noConsole:: intentional console output
                    console.error(`Error in hook callback ${callbackId}:`, error);
                    return {};
                }
            },
        };
    }
    /**
     * Sends an elicitation request to the SDK consumer and returns the response.
     */
    async handleElicitation(serverName, message, requestedSchema, signal, mode, url, elicitationId) {
        try {
            const result = await this.sendRequest({
                subtype: 'elicitation',
                mcp_server_name: serverName,
                message,
                mode,
                url,
                elicitation_id: elicitationId,
                requested_schema: requestedSchema,
            }, (0, controlSchemas_js_1.SDKControlElicitationResponseSchema)(), signal);
            return result;
        }
        catch {
            return { action: 'cancel' };
        }
    }
    /**
     * Creates a SandboxAskCallback that forwards sandbox network permission
     * requests to the SDK host as can_use_tool control_requests.
     *
     * This piggybacks on the existing can_use_tool protocol with a synthetic
     * tool name so that SDK hosts (VS Code, CCR, etc.) can prompt the user
     * for network access without requiring a new protocol subtype.
     */
    createSandboxAskCallback() {
        return async (hostPattern) => {
            try {
                const result = await this.sendRequest({
                    subtype: 'can_use_tool',
                    tool_name: exports.SANDBOX_NETWORK_ACCESS_TOOL_NAME,
                    input: { host: hostPattern.host },
                    tool_use_id: (0, crypto_1.randomUUID)(),
                    description: `Allow network connection to ${hostPattern.host}?`,
                }, (0, PermissionPromptToolResultSchema_js_1.outputSchema)());
                return result.behavior === 'allow';
            }
            catch {
                // If the request fails (stream closed, abort, etc.), deny the connection
                return false;
            }
        };
    }
    /**
     * Sends an MCP message to an SDK server and waits for the response
     */
    async sendMcpMessage(serverName, message) {
        const response = await this.sendRequest({
            subtype: 'mcp_message',
            server_name: serverName,
            message,
        }, v4_1.z.object({
            mcp_response: v4_1.z.any(),
        }));
        return response.mcp_response;
    }
}
exports.StructuredIO = StructuredIO;
function exitWithMessage(message) {
    // biome-ignore lint/suspicious/noConsole:: intentional console output
    console.error(message);
    // eslint-disable-next-line custom-rules/no-process-exit
    process.exit(1);
}
/**
 * Execute PermissionRequest hooks and return a decision if one is made.
 * Returns undefined if no hook made a decision.
 */
async function executePermissionRequestHooksForSDK(toolName, toolUseID, input, toolUseContext, suggestions) {
    const appState = toolUseContext.getAppState();
    const permissionMode = appState.toolPermissionContext.mode;
    // Iterate directly over the generator instead of using `all`
    const hookGenerator = (0, hooks_js_2.executePermissionRequestHooks)(toolName, toolUseID, input, toolUseContext, permissionMode, suggestions, toolUseContext.abortController.signal);
    for await (const hookResult of hookGenerator) {
        if (hookResult.permissionRequestResult &&
            (hookResult.permissionRequestResult.behavior === 'allow' ||
                hookResult.permissionRequestResult.behavior === 'deny')) {
            const decision = hookResult.permissionRequestResult;
            if (decision.behavior === 'allow') {
                const finalInput = decision.updatedInput || input;
                // Apply permission updates if provided by hook ("always allow")
                const permissionUpdates = decision.updatedPermissions ?? [];
                if (permissionUpdates.length > 0) {
                    (0, PermissionUpdate_js_1.persistPermissionUpdates)(permissionUpdates);
                    const currentAppState = toolUseContext.getAppState();
                    const updatedContext = (0, PermissionUpdate_js_1.applyPermissionUpdates)(currentAppState.toolPermissionContext, permissionUpdates);
                    // Update permission context via setAppState
                    toolUseContext.setAppState(prev => {
                        if (prev.toolPermissionContext === updatedContext)
                            return prev;
                        return { ...prev, toolPermissionContext: updatedContext };
                    });
                }
                return {
                    behavior: 'allow',
                    updatedInput: finalInput,
                    userModified: false,
                    decisionReason: {
                        type: 'hook',
                        hookName: 'PermissionRequest',
                    },
                };
            }
            else {
                // Hook denied the permission
                return {
                    behavior: 'deny',
                    message: decision.message || 'Permission denied by PermissionRequest hook',
                    decisionReason: {
                        type: 'hook',
                        hookName: 'PermissionRequest',
                    },
                };
            }
        }
    }
    return undefined;
}
