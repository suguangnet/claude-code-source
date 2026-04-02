"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.call = void 0;
const bun_bundle_1 = require("bun:bundle");
const chalk_1 = __importDefault(require("chalk"));
const state_js_1 = require("src/bootstrap/state.js");
const prompts_js_1 = require("../../constants/prompts.js");
const context_js_1 = require("../../context.js");
const shortcutFormat_js_1 = require("../../keybindings/shortcutFormat.js");
const promptCacheBreakDetection_js_1 = require("../../services/api/promptCacheBreakDetection.js");
const compact_js_1 = require("../../services/compact/compact.js");
const compactWarningState_js_1 = require("../../services/compact/compactWarningState.js");
const microCompact_js_1 = require("../../services/compact/microCompact.js");
const postCompactCleanup_js_1 = require("../../services/compact/postCompactCleanup.js");
const sessionMemoryCompact_js_1 = require("../../services/compact/sessionMemoryCompact.js");
const sessionMemoryUtils_js_1 = require("../../services/SessionMemory/sessionMemoryUtils.js");
const errors_js_1 = require("../../utils/errors.js");
const hooks_js_1 = require("../../utils/hooks.js");
const log_js_1 = require("../../utils/log.js");
const messages_js_1 = require("../../utils/messages.js");
const contextWindowUpgradeCheck_js_1 = require("../../utils/model/contextWindowUpgradeCheck.js");
const systemPrompt_js_1 = require("../../utils/systemPrompt.js");
/* eslint-disable @typescript-eslint/no-require-imports */
const reactiveCompact = (0, bun_bundle_1.feature)('REACTIVE_COMPACT')
    ? require('../../services/compact/reactiveCompact.js')
    : null;
/* eslint-enable @typescript-eslint/no-require-imports */
const call = async (args, context) => {
    const { abortController } = context;
    let { messages } = context;
    // REPL keeps snipped messages for UI scrollback — project so the compact
    // model doesn't summarize content that was intentionally removed.
    messages = (0, messages_js_1.getMessagesAfterCompactBoundary)(messages);
    if (messages.length === 0) {
        throw new Error('No messages to compact');
    }
    const customInstructions = args.trim();
    try {
        // Try session memory compaction first if no custom instructions
        // (session memory compaction doesn't support custom instructions)
        if (!customInstructions) {
            const sessionMemoryResult = await (0, sessionMemoryCompact_js_1.trySessionMemoryCompaction)(messages, context.agentId);
            if (sessionMemoryResult) {
                context_js_1.getUserContext.cache.clear?.();
                (0, postCompactCleanup_js_1.runPostCompactCleanup)();
                // Reset cache read baseline so the post-compact drop isn't flagged
                // as a break. compactConversation does this internally; SM-compact doesn't.
                if ((0, bun_bundle_1.feature)('PROMPT_CACHE_BREAK_DETECTION')) {
                    (0, promptCacheBreakDetection_js_1.notifyCompaction)(context.options.querySource ?? 'compact', context.agentId);
                }
                (0, state_js_1.markPostCompaction)();
                // Suppress warning immediately after successful compaction
                (0, compactWarningState_js_1.suppressCompactWarning)();
                return {
                    type: 'compact',
                    compactionResult: sessionMemoryResult,
                    displayText: buildDisplayText(context),
                };
            }
        }
        // Reactive-only mode: route /compact through the reactive path.
        // Checked after session-memory (that path is cheap and orthogonal).
        if (reactiveCompact?.isReactiveOnlyMode()) {
            return await compactViaReactive(messages, context, customInstructions, reactiveCompact);
        }
        // Fall back to traditional compaction
        // Run microcompact first to reduce tokens before summarization
        const microcompactResult = await (0, microCompact_js_1.microcompactMessages)(messages, context);
        const messagesForCompact = microcompactResult.messages;
        const result = await (0, compact_js_1.compactConversation)(messagesForCompact, context, await getCacheSharingParams(context, messagesForCompact), false, customInstructions, false);
        // Reset lastSummarizedMessageId since legacy compaction replaces all messages
        // and the old message UUID will no longer exist in the new messages array
        (0, sessionMemoryUtils_js_1.setLastSummarizedMessageId)(undefined);
        // Suppress the "Context left until auto-compact" warning after successful compaction
        (0, compactWarningState_js_1.suppressCompactWarning)();
        context_js_1.getUserContext.cache.clear?.();
        (0, postCompactCleanup_js_1.runPostCompactCleanup)();
        return {
            type: 'compact',
            compactionResult: result,
            displayText: buildDisplayText(context, result.userDisplayMessage),
        };
    }
    catch (error) {
        if (abortController.signal.aborted) {
            throw new Error('Compaction canceled.');
        }
        else if ((0, errors_js_1.hasExactErrorMessage)(error, compact_js_1.ERROR_MESSAGE_NOT_ENOUGH_MESSAGES)) {
            throw new Error(compact_js_1.ERROR_MESSAGE_NOT_ENOUGH_MESSAGES);
        }
        else if ((0, errors_js_1.hasExactErrorMessage)(error, compact_js_1.ERROR_MESSAGE_INCOMPLETE_RESPONSE)) {
            throw new Error(compact_js_1.ERROR_MESSAGE_INCOMPLETE_RESPONSE);
        }
        else {
            (0, log_js_1.logError)(error);
            throw new Error(`Error during compaction: ${error}`);
        }
    }
};
exports.call = call;
async function compactViaReactive(messages, context, customInstructions, reactive) {
    context.onCompactProgress?.({
        type: 'hooks_start',
        hookType: 'pre_compact',
    });
    context.setSDKStatus?.('compacting');
    try {
        // Hooks and cache-param build are independent — run concurrently.
        // getCacheSharingParams walks all tools to build the system prompt;
        // pre-compact hooks spawn subprocesses. Neither depends on the other.
        const [hookResult, cacheSafeParams] = await Promise.all([
            (0, hooks_js_1.executePreCompactHooks)({ trigger: 'manual', customInstructions: customInstructions || null }, context.abortController.signal),
            getCacheSharingParams(context, messages),
        ]);
        const mergedInstructions = (0, compact_js_1.mergeHookInstructions)(customInstructions, hookResult.newCustomInstructions);
        context.setStreamMode?.('requesting');
        context.setResponseLength?.(() => 0);
        context.onCompactProgress?.({ type: 'compact_start' });
        const outcome = await reactive.reactiveCompactOnPromptTooLong(messages, cacheSafeParams, { customInstructions: mergedInstructions, trigger: 'manual' });
        if (!outcome.ok) {
            // The outer catch in `call` translates these: aborted → "Compaction
            // canceled." (via abortController.signal.aborted check), NOT_ENOUGH →
            // re-thrown as-is, everything else → "Error during compaction: …".
            switch (outcome.reason) {
                case 'too_few_groups':
                    throw new Error(compact_js_1.ERROR_MESSAGE_NOT_ENOUGH_MESSAGES);
                case 'aborted':
                    throw new Error(compact_js_1.ERROR_MESSAGE_USER_ABORT);
                case 'exhausted':
                case 'error':
                case 'media_unstrippable':
                    throw new Error(compact_js_1.ERROR_MESSAGE_INCOMPLETE_RESPONSE);
            }
        }
        // Mirrors the post-success cleanup in tryReactiveCompact, minus
        // resetMicrocompactState — processSlashCommand calls that for all
        // type:'compact' results.
        (0, sessionMemoryUtils_js_1.setLastSummarizedMessageId)(undefined);
        (0, postCompactCleanup_js_1.runPostCompactCleanup)();
        (0, compactWarningState_js_1.suppressCompactWarning)();
        context_js_1.getUserContext.cache.clear?.();
        // reactiveCompactOnPromptTooLong runs PostCompact hooks but not PreCompact
        // — both callers (here and tryReactiveCompact) run PreCompact outside so
        // they can merge its userDisplayMessage with PostCompact's here. This
        // caller additionally runs it concurrently with getCacheSharingParams.
        const combinedMessage = [hookResult.userDisplayMessage, outcome.result.userDisplayMessage]
            .filter(Boolean)
            .join('\n') || undefined;
        return {
            type: 'compact',
            compactionResult: {
                ...outcome.result,
                userDisplayMessage: combinedMessage,
            },
            displayText: buildDisplayText(context, combinedMessage),
        };
    }
    finally {
        context.setStreamMode?.('requesting');
        context.setResponseLength?.(() => 0);
        context.onCompactProgress?.({ type: 'compact_end' });
        context.setSDKStatus?.(null);
    }
}
function buildDisplayText(context, userDisplayMessage) {
    const upgradeMessage = (0, contextWindowUpgradeCheck_js_1.getUpgradeMessage)('tip');
    const expandShortcut = (0, shortcutFormat_js_1.getShortcutDisplay)('app:toggleTranscript', 'Global', 'ctrl+o');
    const dimmed = [
        ...(context.options.verbose
            ? []
            : [`(${expandShortcut} to see full summary)`]),
        ...(userDisplayMessage ? [userDisplayMessage] : []),
        ...(upgradeMessage ? [upgradeMessage] : []),
    ];
    return chalk_1.default.dim('Compacted ' + dimmed.join('\n'));
}
async function getCacheSharingParams(context, forkContextMessages) {
    const appState = context.getAppState();
    const defaultSysPrompt = await (0, prompts_js_1.getSystemPrompt)(context.options.tools, context.options.mainLoopModel, Array.from(appState.toolPermissionContext.additionalWorkingDirectories.keys()), context.options.mcpClients);
    const systemPrompt = (0, systemPrompt_js_1.buildEffectiveSystemPrompt)({
        mainThreadAgentDefinition: undefined,
        toolUseContext: context,
        customSystemPrompt: context.options.customSystemPrompt,
        defaultSystemPrompt: defaultSysPrompt,
        appendSystemPrompt: context.options.appendSystemPrompt,
    });
    const [userContext, systemContext] = await Promise.all([
        (0, context_js_1.getUserContext)(),
        (0, context_js_1.getSystemContext)(),
    ]);
    return {
        systemPrompt,
        userContext,
        systemContext,
        toolUseContext: context,
        forkContextMessages,
    };
}
