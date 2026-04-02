"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareMessagesForInjection = prepareMessagesForInjection;
exports.isSpeculationEnabled = isSpeculationEnabled;
exports.startSpeculation = startSpeculation;
exports.acceptSpeculation = acceptSpeculation;
exports.abortSpeculation = abortSpeculation;
exports.handleSpeculationAccept = handleSpeculationAccept;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const state_js_1 = require("../../bootstrap/state.js");
const AppStateStore_js_1 = require("../../state/AppStateStore.js");
const bashPermissions_js_1 = require("../../tools/BashTool/bashPermissions.js");
const readOnlyValidation_js_1 = require("../../tools/BashTool/readOnlyValidation.js");
const abortController_js_1 = require("../../utils/abortController.js");
const array_js_1 = require("../../utils/array.js");
const config_js_1 = require("../../utils/config.js");
const debug_js_1 = require("../../utils/debug.js");
const errors_js_1 = require("../../utils/errors.js");
const fileStateCache_js_1 = require("../../utils/fileStateCache.js");
const forkedAgent_js_1 = require("../../utils/forkedAgent.js");
const format_js_1 = require("../../utils/format.js");
const log_js_1 = require("../../utils/log.js");
const messages_js_1 = require("../../utils/messages.js");
const filesystem_js_1 = require("../../utils/permissions/filesystem.js");
const queryHelpers_js_1 = require("../../utils/queryHelpers.js");
const sessionStorage_js_1 = require("../../utils/sessionStorage.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const index_js_1 = require("../analytics/index.js");
const promptSuggestion_js_1 = require("./promptSuggestion.js");
const MAX_SPECULATION_TURNS = 20;
const MAX_SPECULATION_MESSAGES = 100;
const WRITE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);
const SAFE_READ_ONLY_TOOLS = new Set([
    'Read',
    'Glob',
    'Grep',
    'ToolSearch',
    'LSP',
    'TaskGet',
    'TaskList',
]);
function safeRemoveOverlay(overlayPath) {
    (0, fs_1.rm)(overlayPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }, () => { });
}
function getOverlayPath(id) {
    return (0, path_1.join)((0, filesystem_js_1.getClaudeTempDir)(), 'speculation', String(process.pid), id);
}
function denySpeculation(message, reason) {
    return {
        behavior: 'deny',
        message,
        decisionReason: { type: 'other', reason },
    };
}
async function copyOverlayToMain(overlayPath, writtenPaths, cwd) {
    let allCopied = true;
    for (const rel of writtenPaths) {
        const src = (0, path_1.join)(overlayPath, rel);
        const dest = (0, path_1.join)(cwd, rel);
        try {
            await (0, promises_1.mkdir)((0, path_1.dirname)(dest), { recursive: true });
            await (0, promises_1.copyFile)(src, dest);
        }
        catch {
            allCopied = false;
            (0, debug_js_1.logForDebugging)(`[Speculation] Failed to copy ${rel} to main`);
        }
    }
    return allCopied;
}
function logSpeculation(id, outcome, startTime, suggestionLength, messages, boundary, extras) {
    (0, index_js_1.logEvent)('tengu_speculation', {
        speculation_id: id,
        outcome: outcome,
        duration_ms: Date.now() - startTime,
        suggestion_length: suggestionLength,
        tools_executed: countToolsInMessages(messages),
        completed: boundary !== null,
        boundary_type: boundary?.type,
        boundary_tool: getBoundaryTool(boundary),
        boundary_detail: getBoundaryDetail(boundary),
        ...extras,
    });
}
function countToolsInMessages(messages) {
    const blocks = messages
        .filter(isUserMessageWithArrayContent)
        .flatMap(m => m.message.content)
        .filter((b) => typeof b === 'object' && b !== null && 'type' in b);
    return (0, array_js_1.count)(blocks, b => b.type === 'tool_result' && !b.is_error);
}
function getBoundaryTool(boundary) {
    if (!boundary)
        return undefined;
    switch (boundary.type) {
        case 'bash':
            return 'Bash';
        case 'edit':
        case 'denied_tool':
            return boundary.toolName;
        case 'complete':
            return undefined;
    }
}
function getBoundaryDetail(boundary) {
    if (!boundary)
        return undefined;
    switch (boundary.type) {
        case 'bash':
            return boundary.command.slice(0, 200);
        case 'edit':
            return boundary.filePath;
        case 'denied_tool':
            return boundary.detail;
        case 'complete':
            return undefined;
    }
}
function isUserMessageWithArrayContent(m) {
    return m.type === 'user' && 'message' in m && Array.isArray(m.message.content);
}
function prepareMessagesForInjection(messages) {
    const isToolResult = (b) => typeof b === 'object' &&
        b !== null &&
        b.type === 'tool_result' &&
        typeof b.tool_use_id === 'string';
    const isSuccessful = (b) => !b.is_error &&
        !(typeof b.content === 'string' &&
            b.content.includes(messages_js_1.INTERRUPT_MESSAGE_FOR_TOOL_USE));
    const toolIdsWithSuccessfulResults = new Set(messages
        .filter(isUserMessageWithArrayContent)
        .flatMap(m => m.message.content)
        .filter(isToolResult)
        .filter(isSuccessful)
        .map(b => b.tool_use_id));
    const keep = (b) => b.type !== 'thinking' &&
        b.type !== 'redacted_thinking' &&
        !(b.type === 'tool_use' && !toolIdsWithSuccessfulResults.has(b.id)) &&
        !(b.type === 'tool_result' &&
            !toolIdsWithSuccessfulResults.has(b.tool_use_id)) &&
        // Abort during speculation yields a standalone interrupt user message
        // (query.ts createUserInterruptionMessage). Strip it so it isn't surfaced
        // to the model as real user input.
        !(b.type === 'text' &&
            (b.text === messages_js_1.INTERRUPT_MESSAGE ||
                b.text === messages_js_1.INTERRUPT_MESSAGE_FOR_TOOL_USE));
    return messages
        .map(msg => {
        if (!('message' in msg) || !Array.isArray(msg.message.content))
            return msg;
        const content = msg.message.content.filter(keep);
        if (content.length === msg.message.content.length)
            return msg;
        if (content.length === 0)
            return null;
        // Drop messages where all remaining blocks are whitespace-only text
        // (API rejects these with 400: "text content blocks must contain non-whitespace text")
        const hasNonWhitespaceContent = content.some((b) => b.type !== 'text' || (b.text !== undefined && b.text.trim() !== ''));
        if (!hasNonWhitespaceContent)
            return null;
        return { ...msg, message: { ...msg.message, content } };
    })
        .filter((m) => m !== null);
}
function createSpeculationFeedbackMessage(messages, boundary, timeSavedMs, sessionTotalMs) {
    if (process.env.USER_TYPE !== 'ant')
        return null;
    if (messages.length === 0 || timeSavedMs === 0)
        return null;
    const toolUses = countToolsInMessages(messages);
    const tokens = boundary?.type === 'complete' ? boundary.outputTokens : null;
    const parts = [];
    if (toolUses > 0) {
        parts.push(`Speculated ${toolUses} tool ${toolUses === 1 ? 'use' : 'uses'}`);
    }
    else {
        const turns = messages.length;
        parts.push(`Speculated ${turns} ${turns === 1 ? 'turn' : 'turns'}`);
    }
    if (tokens !== null) {
        parts.push(`${(0, format_js_1.formatNumber)(tokens)} tokens`);
    }
    const savedText = `+${(0, format_js_1.formatDuration)(timeSavedMs)} saved`;
    const sessionSuffix = sessionTotalMs !== timeSavedMs
        ? ` (${(0, format_js_1.formatDuration)(sessionTotalMs)} this session)`
        : '';
    return (0, messages_js_1.createSystemMessage)(`[ANT-ONLY] ${parts.join(' · ')} · ${savedText}${sessionSuffix}`, 'warning');
}
function updateActiveSpeculationState(setAppState, updater) {
    setAppState(prev => {
        if (prev.speculation.status !== 'active')
            return prev;
        const current = prev.speculation;
        const updates = updater(current);
        // Check if any values actually changed to avoid unnecessary re-renders
        const hasChanges = Object.entries(updates).some(([key, value]) => current[key] !== value);
        if (!hasChanges)
            return prev;
        return {
            ...prev,
            speculation: { ...current, ...updates },
        };
    });
}
function resetSpeculationState(setAppState) {
    setAppState(prev => {
        if (prev.speculation.status === 'idle')
            return prev;
        return { ...prev, speculation: AppStateStore_js_1.IDLE_SPECULATION_STATE };
    });
}
function isSpeculationEnabled() {
    const enabled = process.env.USER_TYPE === 'ant' &&
        ((0, config_js_1.getGlobalConfig)().speculationEnabled ?? true);
    (0, debug_js_1.logForDebugging)(`[Speculation] enabled=${enabled}`);
    return enabled;
}
async function generatePipelinedSuggestion(context, suggestionText, speculatedMessages, setAppState, parentAbortController) {
    try {
        const appState = context.toolUseContext.getAppState();
        const suppressReason = (0, promptSuggestion_js_1.getSuggestionSuppressReason)(appState);
        if (suppressReason) {
            (0, promptSuggestion_js_1.logSuggestionSuppressed)(`pipeline_${suppressReason}`);
            return;
        }
        const augmentedContext = {
            ...context,
            messages: [
                ...context.messages,
                (0, messages_js_1.createUserMessage)({ content: suggestionText }),
                ...speculatedMessages,
            ],
        };
        const pipelineAbortController = (0, abortController_js_1.createChildAbortController)(parentAbortController);
        if (pipelineAbortController.signal.aborted)
            return;
        const promptId = (0, promptSuggestion_js_1.getPromptVariant)();
        const { suggestion, generationRequestId } = await (0, promptSuggestion_js_1.generateSuggestion)(pipelineAbortController, promptId, (0, forkedAgent_js_1.createCacheSafeParams)(augmentedContext));
        if (pipelineAbortController.signal.aborted)
            return;
        if ((0, promptSuggestion_js_1.shouldFilterSuggestion)(suggestion, promptId))
            return;
        (0, debug_js_1.logForDebugging)(`[Speculation] Pipelined suggestion: "${suggestion.slice(0, 50)}..."`);
        updateActiveSpeculationState(setAppState, () => ({
            pipelinedSuggestion: {
                text: suggestion,
                promptId,
                generationRequestId,
            },
        }));
    }
    catch (error) {
        if (error instanceof Error && error.name === 'AbortError')
            return;
        (0, debug_js_1.logForDebugging)(`[Speculation] Pipelined suggestion failed: ${(0, errors_js_1.errorMessage)(error)}`);
    }
}
async function startSpeculation(suggestionText, context, setAppState, isPipelined = false, cacheSafeParams) {
    if (!isSpeculationEnabled())
        return;
    // Abort any existing speculation before starting a new one
    abortSpeculation(setAppState);
    const id = (0, crypto_1.randomUUID)().slice(0, 8);
    const abortController = (0, abortController_js_1.createChildAbortController)(context.toolUseContext.abortController);
    if (abortController.signal.aborted)
        return;
    const startTime = Date.now();
    const messagesRef = { current: [] };
    const writtenPathsRef = { current: new Set() };
    const overlayPath = getOverlayPath(id);
    const cwd = (0, state_js_1.getCwdState)();
    try {
        await (0, promises_1.mkdir)(overlayPath, { recursive: true });
    }
    catch {
        (0, debug_js_1.logForDebugging)('[Speculation] Failed to create overlay directory');
        return;
    }
    const contextRef = { current: context };
    setAppState(prev => ({
        ...prev,
        speculation: {
            status: 'active',
            id,
            abort: () => abortController.abort(),
            startTime,
            messagesRef,
            writtenPathsRef,
            boundary: null,
            suggestionLength: suggestionText.length,
            toolUseCount: 0,
            isPipelined,
            contextRef,
        },
    }));
    (0, debug_js_1.logForDebugging)(`[Speculation] Starting speculation ${id}`);
    try {
        const result = await (0, forkedAgent_js_1.runForkedAgent)({
            promptMessages: [(0, messages_js_1.createUserMessage)({ content: suggestionText })],
            cacheSafeParams: cacheSafeParams ?? (0, forkedAgent_js_1.createCacheSafeParams)(context),
            skipTranscript: true,
            canUseTool: async (tool, input) => {
                const isWriteTool = WRITE_TOOLS.has(tool.name);
                const isSafeReadOnlyTool = SAFE_READ_ONLY_TOOLS.has(tool.name);
                // Check permission mode BEFORE allowing file edits
                if (isWriteTool) {
                    const appState = context.toolUseContext.getAppState();
                    const { mode, isBypassPermissionsModeAvailable } = appState.toolPermissionContext;
                    const canAutoAcceptEdits = mode === 'acceptEdits' ||
                        mode === 'bypassPermissions' ||
                        (mode === 'plan' && isBypassPermissionsModeAvailable);
                    if (!canAutoAcceptEdits) {
                        (0, debug_js_1.logForDebugging)(`[Speculation] Stopping at file edit: ${tool.name}`);
                        const editPath = ('file_path' in input ? input.file_path : undefined);
                        updateActiveSpeculationState(setAppState, () => ({
                            boundary: {
                                type: 'edit',
                                toolName: tool.name,
                                filePath: editPath ?? '',
                                completedAt: Date.now(),
                            },
                        }));
                        abortController.abort();
                        return denySpeculation('Speculation paused: file edit requires permission', 'speculation_edit_boundary');
                    }
                }
                // Handle file path rewriting for overlay isolation
                if (isWriteTool || isSafeReadOnlyTool) {
                    const pathKey = 'notebook_path' in input
                        ? 'notebook_path'
                        : 'path' in input
                            ? 'path'
                            : 'file_path';
                    const filePath = input[pathKey];
                    if (filePath) {
                        const rel = (0, path_1.relative)(cwd, filePath);
                        if ((0, path_1.isAbsolute)(rel) || rel.startsWith('..')) {
                            if (isWriteTool) {
                                (0, debug_js_1.logForDebugging)(`[Speculation] Denied ${tool.name}: path outside cwd: ${filePath}`);
                                return denySpeculation('Write outside cwd not allowed during speculation', 'speculation_write_outside_root');
                            }
                            return {
                                behavior: 'allow',
                                updatedInput: input,
                                decisionReason: {
                                    type: 'other',
                                    reason: 'speculation_read_outside_root',
                                },
                            };
                        }
                        if (isWriteTool) {
                            // Copy-on-write: copy original to overlay if not yet there
                            if (!writtenPathsRef.current.has(rel)) {
                                const overlayFile = (0, path_1.join)(overlayPath, rel);
                                await (0, promises_1.mkdir)((0, path_1.dirname)(overlayFile), { recursive: true });
                                try {
                                    await (0, promises_1.copyFile)((0, path_1.join)(cwd, rel), overlayFile);
                                }
                                catch {
                                    // Original may not exist (new file creation) - that's fine
                                }
                                writtenPathsRef.current.add(rel);
                            }
                            input = { ...input, [pathKey]: (0, path_1.join)(overlayPath, rel) };
                        }
                        else {
                            // Read: redirect to overlay if file was previously written
                            if (writtenPathsRef.current.has(rel)) {
                                input = { ...input, [pathKey]: (0, path_1.join)(overlayPath, rel) };
                            }
                            // Otherwise read from main (no rewrite)
                        }
                        (0, debug_js_1.logForDebugging)(`[Speculation] ${isWriteTool ? 'Write' : 'Read'} ${filePath} -> ${input[pathKey]}`);
                        return {
                            behavior: 'allow',
                            updatedInput: input,
                            decisionReason: {
                                type: 'other',
                                reason: 'speculation_file_access',
                            },
                        };
                    }
                    // Read tools without explicit path (e.g. Glob/Grep defaulting to CWD) are safe
                    if (isSafeReadOnlyTool) {
                        return {
                            behavior: 'allow',
                            updatedInput: input,
                            decisionReason: {
                                type: 'other',
                                reason: 'speculation_read_default_cwd',
                            },
                        };
                    }
                    // Write tools with undefined path → fall through to default deny
                }
                // Stop at non-read-only bash commands
                if (tool.name === 'Bash') {
                    const command = 'command' in input && typeof input.command === 'string'
                        ? input.command
                        : '';
                    if (!command ||
                        (0, readOnlyValidation_js_1.checkReadOnlyConstraints)({ command }, (0, bashPermissions_js_1.commandHasAnyCd)(command))
                            .behavior !== 'allow') {
                        (0, debug_js_1.logForDebugging)(`[Speculation] Stopping at bash: ${command.slice(0, 50) || 'missing command'}`);
                        updateActiveSpeculationState(setAppState, () => ({
                            boundary: { type: 'bash', command, completedAt: Date.now() },
                        }));
                        abortController.abort();
                        return denySpeculation('Speculation paused: bash boundary', 'speculation_bash_boundary');
                    }
                    // Read-only bash command — allow during speculation
                    return {
                        behavior: 'allow',
                        updatedInput: input,
                        decisionReason: {
                            type: 'other',
                            reason: 'speculation_readonly_bash',
                        },
                    };
                }
                // Deny all other tools by default
                (0, debug_js_1.logForDebugging)(`[Speculation] Stopping at denied tool: ${tool.name}`);
                const detail = String(('url' in input && input.url) ||
                    ('file_path' in input && input.file_path) ||
                    ('path' in input && input.path) ||
                    ('command' in input && input.command) ||
                    '').slice(0, 200);
                updateActiveSpeculationState(setAppState, () => ({
                    boundary: {
                        type: 'denied_tool',
                        toolName: tool.name,
                        detail,
                        completedAt: Date.now(),
                    },
                }));
                abortController.abort();
                return denySpeculation(`Tool ${tool.name} not allowed during speculation`, 'speculation_unknown_tool');
            },
            querySource: 'speculation',
            forkLabel: 'speculation',
            maxTurns: MAX_SPECULATION_TURNS,
            overrides: { abortController, requireCanUseTool: true },
            onMessage: msg => {
                if (msg.type === 'assistant' || msg.type === 'user') {
                    messagesRef.current.push(msg);
                    if (messagesRef.current.length >= MAX_SPECULATION_MESSAGES) {
                        abortController.abort();
                    }
                    if (isUserMessageWithArrayContent(msg)) {
                        const newTools = (0, array_js_1.count)(msg.message.content, b => b.type === 'tool_result' && !b.is_error);
                        if (newTools > 0) {
                            updateActiveSpeculationState(setAppState, prev => ({
                                toolUseCount: prev.toolUseCount + newTools,
                            }));
                        }
                    }
                }
            },
        });
        if (abortController.signal.aborted)
            return;
        updateActiveSpeculationState(setAppState, () => ({
            boundary: {
                type: 'complete',
                completedAt: Date.now(),
                outputTokens: result.totalUsage.output_tokens,
            },
        }));
        (0, debug_js_1.logForDebugging)(`[Speculation] Complete: ${countToolsInMessages(messagesRef.current)} tools`);
        // Pipeline: generate the next suggestion while we wait for the user to accept
        void generatePipelinedSuggestion(contextRef.current, suggestionText, messagesRef.current, setAppState, abortController);
    }
    catch (error) {
        abortController.abort();
        if (error instanceof Error && error.name === 'AbortError') {
            safeRemoveOverlay(overlayPath);
            resetSpeculationState(setAppState);
            return;
        }
        safeRemoveOverlay(overlayPath);
        // eslint-disable-next-line no-restricted-syntax -- custom fallback message, not toError(e)
        (0, log_js_1.logError)(error instanceof Error ? error : new Error('Speculation failed'));
        logSpeculation(id, 'error', startTime, suggestionText.length, messagesRef.current, null, {
            error_type: error instanceof Error ? error.name : 'Unknown',
            error_message: (0, errors_js_1.errorMessage)(error).slice(0, 200),
            error_phase: 'start',
            is_pipelined: isPipelined,
        });
        resetSpeculationState(setAppState);
    }
}
async function acceptSpeculation(state, setAppState, cleanMessageCount) {
    if (state.status !== 'active')
        return null;
    const { id, messagesRef, writtenPathsRef, abort, startTime, suggestionLength, isPipelined, } = state;
    const messages = messagesRef.current;
    const overlayPath = getOverlayPath(id);
    const acceptedAt = Date.now();
    abort();
    if (cleanMessageCount > 0) {
        await copyOverlayToMain(overlayPath, writtenPathsRef.current, (0, state_js_1.getCwdState)());
    }
    safeRemoveOverlay(overlayPath);
    // Use snapshot boundary as default (available since state.status === 'active' was checked above)
    let boundary = state.boundary;
    let timeSavedMs = Math.min(acceptedAt, boundary?.completedAt ?? Infinity) - startTime;
    setAppState(prev => {
        // Refine with latest React state if speculation is still active
        if (prev.speculation.status === 'active' && prev.speculation.boundary) {
            boundary = prev.speculation.boundary;
            const endTime = Math.min(acceptedAt, boundary.completedAt ?? Infinity);
            timeSavedMs = endTime - startTime;
        }
        return {
            ...prev,
            speculation: AppStateStore_js_1.IDLE_SPECULATION_STATE,
            speculationSessionTimeSavedMs: prev.speculationSessionTimeSavedMs + timeSavedMs,
        };
    });
    (0, debug_js_1.logForDebugging)(boundary === null
        ? `[Speculation] Accept ${id}: still running, using ${messages.length} messages`
        : `[Speculation] Accept ${id}: already complete`);
    logSpeculation(id, 'accepted', startTime, suggestionLength, messages, boundary, {
        message_count: messages.length,
        time_saved_ms: timeSavedMs,
        is_pipelined: isPipelined,
    });
    if (timeSavedMs > 0) {
        const entry = {
            type: 'speculation-accept',
            timestamp: new Date().toISOString(),
            timeSavedMs,
        };
        void (0, promises_1.appendFile)((0, sessionStorage_js_1.getTranscriptPath)(), (0, slowOperations_js_1.jsonStringify)(entry) + '\n', {
            mode: 0o600,
        }).catch(() => {
            (0, debug_js_1.logForDebugging)('[Speculation] Failed to write speculation-accept to transcript');
        });
    }
    return { messages, boundary, timeSavedMs };
}
function abortSpeculation(setAppState) {
    setAppState(prev => {
        if (prev.speculation.status !== 'active')
            return prev;
        const { id, abort, startTime, boundary, suggestionLength, messagesRef, isPipelined, } = prev.speculation;
        (0, debug_js_1.logForDebugging)(`[Speculation] Aborting ${id}`);
        logSpeculation(id, 'aborted', startTime, suggestionLength, messagesRef.current, boundary, { abort_reason: 'user_typed', is_pipelined: isPipelined });
        abort();
        safeRemoveOverlay(getOverlayPath(id));
        return { ...prev, speculation: AppStateStore_js_1.IDLE_SPECULATION_STATE };
    });
}
async function handleSpeculationAccept(speculationState, speculationSessionTimeSavedMs, setAppState, input, deps) {
    try {
        const { setMessages, readFileState, cwd } = deps;
        // Clear prompt suggestion state. logOutcomeAtSubmission logged the accept
        // but was called with skipReset to avoid aborting speculation before we use it.
        setAppState(prev => {
            if (prev.promptSuggestion.text === null &&
                prev.promptSuggestion.promptId === null) {
                return prev;
            }
            return {
                ...prev,
                promptSuggestion: {
                    text: null,
                    promptId: null,
                    shownAt: 0,
                    acceptedAt: 0,
                    generationRequestId: null,
                },
            };
        });
        // Capture speculation messages before any state updates - must be stable reference
        const speculationMessages = speculationState.messagesRef.current;
        let cleanMessages = prepareMessagesForInjection(speculationMessages);
        // Inject user message first for instant visual feedback before any async work
        const userMessage = (0, messages_js_1.createUserMessage)({ content: input });
        setMessages(prev => [...prev, userMessage]);
        const result = await acceptSpeculation(speculationState, setAppState, cleanMessages.length);
        const isComplete = result?.boundary?.type === 'complete';
        // When speculation didn't complete, the follow-up query needs the
        // conversation to end with a user message. Drop trailing assistant
        // messages — models that don't support prefill
        // reject conversations ending with an assistant turn. The model will
        // regenerate this content in the follow-up query.
        if (!isComplete) {
            const lastNonAssistant = cleanMessages.findLastIndex(m => m.type !== 'assistant');
            cleanMessages = cleanMessages.slice(0, lastNonAssistant + 1);
        }
        const timeSavedMs = result?.timeSavedMs ?? 0;
        const newSessionTotal = speculationSessionTimeSavedMs + timeSavedMs;
        const feedbackMessage = createSpeculationFeedbackMessage(cleanMessages, result?.boundary ?? null, timeSavedMs, newSessionTotal);
        // Inject speculated messages
        setMessages(prev => [...prev, ...cleanMessages]);
        const extracted = (0, queryHelpers_js_1.extractReadFilesFromMessages)(cleanMessages, cwd, fileStateCache_js_1.READ_FILE_STATE_CACHE_SIZE);
        readFileState.current = (0, fileStateCache_js_1.mergeFileStateCaches)(readFileState.current, extracted);
        if (feedbackMessage) {
            setMessages(prev => [...prev, feedbackMessage]);
        }
        (0, debug_js_1.logForDebugging)(`[Speculation] ${result?.boundary?.type ?? 'incomplete'}, injected ${cleanMessages.length} messages`);
        // Promote pipelined suggestion if speculation completed fully
        if (isComplete && speculationState.pipelinedSuggestion) {
            const { text, promptId, generationRequestId } = speculationState.pipelinedSuggestion;
            (0, debug_js_1.logForDebugging)(`[Speculation] Promoting pipelined suggestion: "${text.slice(0, 50)}..."`);
            setAppState(prev => ({
                ...prev,
                promptSuggestion: {
                    text,
                    promptId,
                    shownAt: Date.now(),
                    acceptedAt: 0,
                    generationRequestId,
                },
            }));
            // Start speculation on the pipelined suggestion
            const augmentedContext = {
                ...speculationState.contextRef.current,
                messages: [
                    ...speculationState.contextRef.current.messages,
                    (0, messages_js_1.createUserMessage)({ content: input }),
                    ...cleanMessages,
                ],
            };
            void startSpeculation(text, augmentedContext, setAppState, true);
        }
        return { queryRequired: !isComplete };
    }
    catch (error) {
        // Fail open: log error and fall back to normal query flow
        /* eslint-disable no-restricted-syntax -- custom fallback message, not toError(e) */
        (0, log_js_1.logError)(error instanceof Error
            ? error
            : new Error('handleSpeculationAccept failed'));
        /* eslint-enable no-restricted-syntax */
        logSpeculation(speculationState.id, 'error', speculationState.startTime, speculationState.suggestionLength, speculationState.messagesRef.current, speculationState.boundary, {
            error_type: error instanceof Error ? error.name : 'Unknown',
            error_message: (0, errors_js_1.errorMessage)(error).slice(0, 200),
            error_phase: 'accept',
            is_pipelined: speculationState.isPipelined,
        });
        safeRemoveOverlay(getOverlayPath(speculationState.id));
        resetSpeculationState(setAppState);
        // Query required so user's message is processed normally (without speculated work)
        return { queryRequired: true };
    }
}
