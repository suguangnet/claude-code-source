"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePromptSubmit = handlePromptSubmit;
const index_js_1 = require("src/services/analytics/index.js");
const commands_js_1 = require("../commands.js");
const MessageSelector_js_1 = require("../components/MessageSelector.js");
const history_js_1 = require("../history.js");
const textInputTypes_js_1 = require("../types/textInputTypes.js");
const abortController_js_1 = require("./abortController.js");
const debug_js_1 = require("./debug.js");
const fileHistory_js_1 = require("./fileHistory.js");
const gracefulShutdown_js_1 = require("./gracefulShutdown.js");
const messageQueueManager_js_1 = require("./messageQueueManager.js");
const model_js_1 = require("./model/model.js");
const processUserInput_js_1 = require("./processUserInput/processUserInput.js");
const queryProfiler_js_1 = require("./queryProfiler.js");
const workloadContext_js_1 = require("./workloadContext.js");
function exit() {
    (0, gracefulShutdown_js_1.gracefulShutdownSync)(0);
}
async function handlePromptSubmit(params) {
    const { helpers, queryGuard, isExternalLoading = false, commands, onInputChange, setPastedContents, setToolJSX, getToolUseContext, messages, mainLoopModel, ideSelection, setUserInputOnProcessing, setAbortController, onQuery, setAppState, onBeforeQuery, canUseTool, queuedCommands, uuid, skipSlashCommands, } = params;
    const { setCursorOffset, clearBuffer, resetHistory } = helpers;
    // Queue processor path: commands are pre-validated and ready to execute.
    // Skip all input validation, reference parsing, and queuing logic.
    if (queuedCommands?.length) {
        (0, queryProfiler_js_1.startQueryProfile)();
        await executeUserInput({
            queuedCommands,
            messages,
            mainLoopModel,
            ideSelection,
            querySource: params.querySource,
            commands,
            queryGuard,
            setToolJSX,
            getToolUseContext,
            setUserInputOnProcessing,
            setAbortController,
            onQuery,
            setAppState,
            onBeforeQuery,
            resetHistory,
            canUseTool,
            onInputChange,
        });
        return;
    }
    const input = params.input ?? '';
    const mode = params.mode ?? 'prompt';
    const rawPastedContents = params.pastedContents ?? {};
    // Images are only sent if their [Image #N] placeholder is still in the text.
    // Deleting the inline pill drops the image; orphaned entries are filtered here.
    const referencedIds = new Set((0, history_js_1.parseReferences)(input).map(r => r.id));
    const pastedContents = Object.fromEntries(Object.entries(rawPastedContents).filter(([, c]) => c.type !== 'image' || referencedIds.has(c.id)));
    const hasImages = Object.values(pastedContents).some(textInputTypes_js_1.isValidImagePaste);
    if (input.trim() === '') {
        return;
    }
    // Handle exit commands by triggering the exit command instead of direct process.exit
    // Skip for remote bridge messages — "exit" typed on iOS shouldn't kill the local session
    if (!skipSlashCommands &&
        ['exit', 'quit', ':q', ':q!', ':wq', ':wq!'].includes(input.trim())) {
        // Trigger the exit command which will show the feedback dialog
        const exitCommand = commands.find(cmd => cmd.name === 'exit');
        if (exitCommand) {
            // Submit the /exit command instead - recursive call needs to be handled
            void handlePromptSubmit({
                ...params,
                input: '/exit',
            });
        }
        else {
            // Fallback to direct exit if exit command not found
            exit();
        }
        return;
    }
    // Parse references and replace with actual content early, before queueing
    // or immediate-command dispatch, so queued commands and immediate commands
    // both receive the expanded text from when it was submitted.
    const finalInput = (0, history_js_1.expandPastedTextRefs)(input, pastedContents);
    const pastedTextRefs = (0, history_js_1.parseReferences)(input).filter(r => pastedContents[r.id]?.type === 'text');
    const pastedTextCount = pastedTextRefs.length;
    const pastedTextBytes = pastedTextRefs.reduce((sum, r) => sum + (pastedContents[r.id]?.content.length ?? 0), 0);
    (0, index_js_1.logEvent)('tengu_paste_text', { pastedTextCount, pastedTextBytes });
    // Handle local-jsx immediate commands (e.g., /config, /doctor)
    // Skip for remote bridge messages — slash commands from CCR clients are plain text
    if (!skipSlashCommands && finalInput.trim().startsWith('/')) {
        const trimmedInput = finalInput.trim();
        const spaceIndex = trimmedInput.indexOf(' ');
        const commandName = spaceIndex === -1
            ? trimmedInput.slice(1)
            : trimmedInput.slice(1, spaceIndex);
        const commandArgs = spaceIndex === -1 ? '' : trimmedInput.slice(spaceIndex + 1).trim();
        const immediateCommand = commands.find(cmd => cmd.immediate &&
            (0, commands_js_1.isCommandEnabled)(cmd) &&
            (cmd.name === commandName ||
                cmd.aliases?.includes(commandName) ||
                (0, commands_js_1.getCommandName)(cmd) === commandName));
        if (immediateCommand &&
            immediateCommand.type === 'local-jsx' &&
            (queryGuard.isActive || isExternalLoading)) {
            (0, index_js_1.logEvent)('tengu_immediate_command_executed', {
                commandName: immediateCommand.name,
            });
            // Clear input
            onInputChange('');
            setCursorOffset(0);
            setPastedContents({});
            clearBuffer();
            const context = getToolUseContext(messages, [], (0, abortController_js_1.createAbortController)(), mainLoopModel);
            let doneWasCalled = false;
            const onDone = (result, options) => {
                doneWasCalled = true;
                // Use clearLocalJSX to explicitly clear the local JSX command
                setToolJSX({
                    jsx: null,
                    shouldHidePromptInput: false,
                    clearLocalJSX: true,
                });
                if (result && options?.display !== 'skip' && params.addNotification) {
                    params.addNotification({
                        key: `immediate-${immediateCommand.name}`,
                        text: result,
                        priority: 'immediate',
                    });
                }
                if (options?.nextInput) {
                    if (options.submitNextInput) {
                        (0, messageQueueManager_js_1.enqueue)({ value: options.nextInput, mode: 'prompt' });
                    }
                    else {
                        onInputChange(options.nextInput);
                    }
                }
            };
            const impl = await immediateCommand.load();
            const jsx = await impl.call(onDone, context, commandArgs);
            // Skip if onDone already fired — prevents stuck isLocalJSXCommand
            // (see processSlashCommand.tsx local-jsx case for full mechanism).
            if (jsx && !doneWasCalled) {
                setToolJSX({
                    jsx,
                    shouldHidePromptInput: false,
                    isLocalJSXCommand: true,
                    isImmediate: true,
                });
            }
            return;
        }
    }
    if (queryGuard.isActive || isExternalLoading) {
        // Only allow prompt and bash mode commands to be queued
        if (mode !== 'prompt' && mode !== 'bash') {
            return;
        }
        // Interrupt the current turn when all executing tools have
        // interruptBehavior 'cancel' (e.g. SleepTool).
        if (params.hasInterruptibleToolInProgress) {
            (0, debug_js_1.logForDebugging)(`[interrupt] Aborting current turn: streamMode=${params.streamMode}`);
            (0, index_js_1.logEvent)('tengu_cancel', {
                source: 'interrupt_on_submit',
                streamMode: params.streamMode,
            });
            params.abortController?.abort('interrupt');
        }
        // Enqueue with string value + raw pastedContents. Images will be resized
        // at execution time when processUserInput runs (not baked in here).
        (0, messageQueueManager_js_1.enqueue)({
            value: finalInput.trim(),
            preExpansionValue: input.trim(),
            mode,
            pastedContents: hasImages ? pastedContents : undefined,
            skipSlashCommands,
            uuid,
        });
        onInputChange('');
        setCursorOffset(0);
        setPastedContents({});
        resetHistory();
        clearBuffer();
        return;
    }
    // Start query profiling for this query
    (0, queryProfiler_js_1.startQueryProfile)();
    // Construct a QueuedCommand from the direct user input so both paths
    // go through the same executeUserInput loop. This ensures images get
    // resized via processUserInput regardless of how the command arrives.
    const cmd = {
        value: finalInput,
        preExpansionValue: input,
        mode,
        pastedContents: hasImages ? pastedContents : undefined,
        skipSlashCommands,
        uuid,
    };
    await executeUserInput({
        queuedCommands: [cmd],
        messages,
        mainLoopModel,
        ideSelection,
        querySource: params.querySource,
        commands,
        queryGuard,
        setToolJSX,
        getToolUseContext,
        setUserInputOnProcessing,
        setAbortController,
        onQuery,
        setAppState,
        onBeforeQuery,
        resetHistory,
        canUseTool,
        onInputChange,
    });
}
/**
 * Core logic for executing user input without UI side effects.
 *
 * All commands arrive as `queuedCommands`. First command gets full treatment
 * (attachments, ideSelection, pastedContents with image resizing). Commands 2-N
 * get `skipAttachments` to avoid duplicating turn-level context.
 */
async function executeUserInput(params) {
    const { messages, mainLoopModel, ideSelection, querySource, queryGuard, setToolJSX, getToolUseContext, setUserInputOnProcessing, setAbortController, onQuery, setAppState, onBeforeQuery, resetHistory, canUseTool, queuedCommands, } = params;
    // Note: paste references are already processed before calling this function
    // (either in handlePromptSubmit before queuing, or before initial execution).
    // Always create a fresh abort controller — queryGuard guarantees no concurrent
    // executeUserInput call, so there's no prior controller to inherit.
    const abortController = (0, abortController_js_1.createAbortController)();
    setAbortController(abortController);
    function makeContext() {
        return getToolUseContext(messages, [], abortController, mainLoopModel);
    }
    // Wrap in try-finally so the guard is released even if processUserInput
    // throws or onQuery is skipped. onQuery's finally calls queryGuard.end(),
    // which transitions running→idle; cancelReservation() below is a no-op in
    // that case (only acts on dispatching state).
    try {
        // Reserve the guard BEFORE processUserInput — processBashCommand awaits
        // BashTool.call() and processSlashCommand awaits getMessagesForSlashCommand,
        // so the guard must be active during those awaits to ensure concurrent
        // handlePromptSubmit calls queue (via the isActive check above) instead
        // of starting a second executeUserInput. This call is a no-op if the
        // guard is already in dispatching (legacy queue-processor path).
        queryGuard.reserve();
        (0, queryProfiler_js_1.queryCheckpoint)('query_process_user_input_start');
        const newMessages = [];
        let shouldQuery = false;
        let allowedTools;
        let model;
        let effort;
        let nextInput;
        let submitNextInput;
        // Iterate all commands uniformly. First command gets attachments +
        // ideSelection + pastedContents, rest skip attachments to avoid
        // duplicating turn-level context (IDE selection, todos, diffs).
        const commands = queuedCommands ?? [];
        // Compute the workload tag for this turn. queueProcessor can batch a
        // cron prompt with a same-tick human prompt; only tag when EVERY
        // command agrees on the same non-undefined workload — a human in the
        // mix is actively waiting.
        const firstWorkload = commands[0]?.workload;
        const turnWorkload = firstWorkload !== undefined &&
            commands.every(c => c.workload === firstWorkload)
            ? firstWorkload
            : undefined;
        // Wrap the entire turn (processUserInput loop + onQuery) in an
        // AsyncLocalStorage context. This is the ONLY way to correctly
        // propagate workload across await boundaries: void-detached bg agents
        // (executeForkedSlashCommand, AgentTool) capture the ALS context at
        // invocation time, and every await inside them resumes in that
        // context — isolated from the parent's continuation. A process-global
        // mutable slot would be clobbered at the detached closure's first
        // await by this function's synchronous return path. See state.ts.
        await (0, workloadContext_js_1.runWithWorkload)(turnWorkload, async () => {
            for (let i = 0; i < commands.length; i++) {
                const cmd = commands[i];
                const isFirst = i === 0;
                const result = await (0, processUserInput_js_1.processUserInput)({
                    input: cmd.value,
                    preExpansionInput: cmd.preExpansionValue,
                    mode: cmd.mode,
                    setToolJSX,
                    context: makeContext(),
                    pastedContents: isFirst ? cmd.pastedContents : undefined,
                    messages,
                    setUserInputOnProcessing: isFirst
                        ? setUserInputOnProcessing
                        : undefined,
                    isAlreadyProcessing: !isFirst,
                    querySource,
                    canUseTool,
                    uuid: cmd.uuid,
                    ideSelection: isFirst ? ideSelection : undefined,
                    skipSlashCommands: cmd.skipSlashCommands,
                    bridgeOrigin: cmd.bridgeOrigin,
                    isMeta: cmd.isMeta,
                    skipAttachments: !isFirst,
                });
                // Stamp origin here rather than threading another arg through
                // processUserInput → processUserInputBase → processTextPrompt → createUserMessage.
                // Derive origin from mode for task-notifications — mirrors the origin
                // derivation at messages.ts (case 'queued_command'); intentionally
                // does NOT mirror its isMeta:true so idle-dequeued notifications stay
                // visible in the transcript via UserAgentNotificationMessage.
                const origin = cmd.origin ??
                    (cmd.mode === 'task-notification'
                        ? { kind: 'task-notification' }
                        : undefined);
                if (origin) {
                    for (const m of result.messages) {
                        if (m.type === 'user')
                            m.origin = origin;
                    }
                }
                newMessages.push(...result.messages);
                if (isFirst) {
                    shouldQuery = result.shouldQuery;
                    allowedTools = result.allowedTools;
                    model = result.model;
                    effort = result.effort;
                    nextInput = result.nextInput;
                    submitNextInput = result.submitNextInput;
                }
            }
            (0, queryProfiler_js_1.queryCheckpoint)('query_process_user_input_end');
            if ((0, fileHistory_js_1.fileHistoryEnabled)()) {
                (0, queryProfiler_js_1.queryCheckpoint)('query_file_history_snapshot_start');
                newMessages.filter(MessageSelector_js_1.selectableUserMessagesFilter).forEach(message => {
                    void (0, fileHistory_js_1.fileHistoryMakeSnapshot)((updater) => {
                        setAppState(prev => ({
                            ...prev,
                            fileHistory: updater(prev.fileHistory),
                        }));
                    }, message.uuid);
                });
                (0, queryProfiler_js_1.queryCheckpoint)('query_file_history_snapshot_end');
            }
            if (newMessages.length) {
                // History is now added in the caller (onSubmit) for direct user submissions.
                // This ensures queued command processing (notifications, already-queued user input)
                // doesn't add to history, since those either shouldn't be in history or were
                // already added when originally queued.
                resetHistory();
                setToolJSX({
                    jsx: null,
                    shouldHidePromptInput: false,
                    clearLocalJSX: true,
                });
                const primaryCmd = commands[0];
                const primaryMode = primaryCmd?.mode ?? 'prompt';
                const primaryInput = primaryCmd && typeof primaryCmd.value === 'string'
                    ? primaryCmd.value
                    : undefined;
                const shouldCallBeforeQuery = primaryMode === 'prompt';
                await onQuery(newMessages, abortController, shouldQuery, allowedTools ?? [], model
                    ? (0, model_js_1.resolveSkillModelOverride)(model, mainLoopModel)
                    : mainLoopModel, shouldCallBeforeQuery ? onBeforeQuery : undefined, primaryInput, effort);
            }
            else {
                // Local slash commands that skip messages (e.g., /model, /theme).
                // Release the guard BEFORE clearing toolJSX to prevent spinner flash —
                // the spinner formula checks: (!toolJSX || showSpinner) && isLoading.
                // If we clear toolJSX while the guard is still reserved, spinner briefly
                // shows. The finally below also calls cancelReservation (no-op if idle).
                queryGuard.cancelReservation();
                setToolJSX({
                    jsx: null,
                    shouldHidePromptInput: false,
                    clearLocalJSX: true,
                });
                resetHistory();
                setAbortController(null);
            }
            // Handle nextInput from commands that want to chain (e.g., /discover activation)
            if (nextInput) {
                if (submitNextInput) {
                    (0, messageQueueManager_js_1.enqueue)({ value: nextInput, mode: 'prompt' });
                }
                else {
                    params.onInputChange(nextInput);
                }
            }
        }); // end runWithWorkload — ALS context naturally scoped, no finally needed
    }
    finally {
        // Safety net: release the guard reservation if processUserInput threw
        // or onQuery was skipped. No-op if onQuery already ran (guard is idle
        // via end(), or running — cancelReservation only acts on dispatching).
        // This is the single source of truth for releasing the reservation;
        // useQueueProcessor no longer needs its own .finally().
        queryGuard.cancelReservation();
        // Safety net: clear the placeholder if processUserInput produced no
        // messages or threw — otherwise it would stay visible until the next
        // turn's resetLoadingState. Harmless when onQuery ran: setMessages grew
        // displayedMessages past the baseline, so REPL.tsx already hid it.
        setUserInputOnProcessing(undefined);
    }
}
