"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.processUserInput = processUserInput;
const bun_bundle_1 = require("bun:bundle");
const crypto_1 = require("crypto");
const index_js_1 = require("src/services/analytics/index.js");
const messages_js_1 = require("src/utils/messages.js");
const commands_js_1 = require("../../commands.js");
const textInputTypes_js_1 = require("../../types/textInputTypes.js");
const attachments_js_1 = require("../attachments.js");
const generators_js_1 = require("../generators.js");
const hooks_js_1 = require("../hooks.js");
const imageResizer_js_1 = require("../imageResizer.js");
const imageStore_js_1 = require("../imageStore.js");
const messages_js_2 = require("../messages.js");
const queryProfiler_js_1 = require("../queryProfiler.js");
const slashCommandParsing_js_1 = require("../slashCommandParsing.js");
const keyword_js_1 = require("../ultraplan/keyword.js");
const processTextPrompt_js_1 = require("./processTextPrompt.js");
async function processUserInput({ input, preExpansionInput, mode, setToolJSX, context, pastedContents, ideSelection, messages, setUserInputOnProcessing, uuid, isAlreadyProcessing, querySource, canUseTool, skipSlashCommands, bridgeOrigin, isMeta, skipAttachments, }) {
    const inputString = typeof input === 'string' ? input : null;
    // Immediately show the user input prompt while we are still processing the input.
    // Skip for isMeta (system-generated prompts like scheduled tasks) — those
    // should run invisibly.
    if (mode === 'prompt' && inputString !== null && !isMeta) {
        setUserInputOnProcessing?.(inputString);
    }
    (0, queryProfiler_js_1.queryCheckpoint)('query_process_user_input_base_start');
    const appState = context.getAppState();
    const result = await processUserInputBase(input, mode, setToolJSX, context, pastedContents, ideSelection, messages, uuid, isAlreadyProcessing, querySource, canUseTool, appState.toolPermissionContext.mode, skipSlashCommands, bridgeOrigin, isMeta, skipAttachments, preExpansionInput);
    (0, queryProfiler_js_1.queryCheckpoint)('query_process_user_input_base_end');
    if (!result.shouldQuery) {
        return result;
    }
    // Execute UserPromptSubmit hooks and handle blocking
    (0, queryProfiler_js_1.queryCheckpoint)('query_hooks_start');
    const inputMessage = (0, messages_js_1.getContentText)(input) || '';
    for await (const hookResult of (0, hooks_js_1.executeUserPromptSubmitHooks)(inputMessage, appState.toolPermissionContext.mode, context, context.requestPrompt)) {
        // We only care about the result
        if (hookResult.message?.type === 'progress') {
            continue;
        }
        // Return only a system-level error message, erasing the original user input
        if (hookResult.blockingError) {
            const blockingMessage = (0, hooks_js_1.getUserPromptSubmitHookBlockingMessage)(hookResult.blockingError);
            return {
                messages: [
                    // TODO: Make this an attachment message
                    (0, messages_js_2.createSystemMessage)(`${blockingMessage}\n\nOriginal prompt: ${input}`, 'warning'),
                ],
                shouldQuery: false,
                allowedTools: result.allowedTools,
            };
        }
        // If preventContinuation is set, stop processing but keep the original
        // prompt in context.
        if (hookResult.preventContinuation) {
            const message = hookResult.stopReason
                ? `Operation stopped by hook: ${hookResult.stopReason}`
                : 'Operation stopped by hook';
            result.messages.push((0, messages_js_2.createUserMessage)({
                content: message,
            }));
            result.shouldQuery = false;
            return result;
        }
        // Collect additional contexts
        if (hookResult.additionalContexts &&
            hookResult.additionalContexts.length > 0) {
            result.messages.push((0, attachments_js_1.createAttachmentMessage)({
                type: 'hook_additional_context',
                content: hookResult.additionalContexts.map(applyTruncation),
                hookName: 'UserPromptSubmit',
                toolUseID: `hook-${(0, crypto_1.randomUUID)()}`,
                hookEvent: 'UserPromptSubmit',
            }));
        }
        // TODO: Clean this up
        if (hookResult.message) {
            switch (hookResult.message.attachment.type) {
                case 'hook_success':
                    if (!hookResult.message.attachment.content) {
                        // Skip if there is no content
                        break;
                    }
                    result.messages.push({
                        ...hookResult.message,
                        attachment: {
                            ...hookResult.message.attachment,
                            content: applyTruncation(hookResult.message.attachment.content),
                        },
                    });
                    break;
                default:
                    result.messages.push(hookResult.message);
                    break;
            }
        }
    }
    (0, queryProfiler_js_1.queryCheckpoint)('query_hooks_end');
    // Happy path: onQuery will clear userInputOnProcessing via startTransition
    // so it resolves in the same frame as deferredMessages (no flicker gap).
    // Error paths are handled by handlePromptSubmit's finally block.
    return result;
}
const MAX_HOOK_OUTPUT_LENGTH = 10000;
function applyTruncation(content) {
    if (content.length > MAX_HOOK_OUTPUT_LENGTH) {
        return `${content.substring(0, MAX_HOOK_OUTPUT_LENGTH)}… [output truncated - exceeded ${MAX_HOOK_OUTPUT_LENGTH} characters]`;
    }
    return content;
}
async function processUserInputBase(input, mode, setToolJSX, context, pastedContents, ideSelection, messages, uuid, isAlreadyProcessing, querySource, canUseTool, permissionMode, skipSlashCommands, bridgeOrigin, isMeta, skipAttachments, preExpansionInput) {
    let inputString = null;
    let precedingInputBlocks = [];
    // Collect image metadata texts for isMeta message
    const imageMetadataTexts = [];
    // Normalized view of `input` with image blocks resized. For string input
    // this is just `input`; for array input it's the processed blocks. We pass
    // this (not raw `input`) to processTextPrompt so resized/normalized image
    // blocks actually reach the API — otherwise the resize work above is
    // discarded for the regular prompt path. Also normalizes bridge inputs
    // where iOS may send `mediaType` instead of `media_type` (mobile-apps#5825).
    let normalizedInput = input;
    if (typeof input === 'string') {
        inputString = input;
    }
    else if (input.length > 0) {
        (0, queryProfiler_js_1.queryCheckpoint)('query_image_processing_start');
        const processedBlocks = [];
        for (const block of input) {
            if (block.type === 'image') {
                const resized = await (0, imageResizer_js_1.maybeResizeAndDownsampleImageBlock)(block);
                // Collect image metadata for isMeta message
                if (resized.dimensions) {
                    const metadataText = (0, imageResizer_js_1.createImageMetadataText)(resized.dimensions);
                    if (metadataText) {
                        imageMetadataTexts.push(metadataText);
                    }
                }
                processedBlocks.push(resized.block);
            }
            else {
                processedBlocks.push(block);
            }
        }
        normalizedInput = processedBlocks;
        (0, queryProfiler_js_1.queryCheckpoint)('query_image_processing_end');
        // Extract the input string from the last content block if it is text,
        // and keep track of the preceding content blocks
        const lastBlock = processedBlocks[processedBlocks.length - 1];
        if (lastBlock?.type === 'text') {
            inputString = lastBlock.text;
            precedingInputBlocks = processedBlocks.slice(0, -1);
        }
        else {
            precedingInputBlocks = processedBlocks;
        }
    }
    if (inputString === null && mode !== 'prompt') {
        throw new Error(`Mode: ${mode} requires a string input.`);
    }
    // Extract and convert image content to content blocks early
    // Keep track of IDs in order for message storage
    const imageContents = pastedContents
        ? Object.values(pastedContents).filter(textInputTypes_js_1.isValidImagePaste)
        : [];
    const imagePasteIds = imageContents.map(img => img.id);
    // Store images to disk so Claude can reference the path in context
    // (for manipulation with CLI tools, uploading to PRs, etc.)
    const storedImagePaths = pastedContents
        ? await (0, imageStore_js_1.storeImages)(pastedContents)
        : new Map();
    // Resize pasted images to ensure they fit within API limits (parallel processing)
    (0, queryProfiler_js_1.queryCheckpoint)('query_pasted_image_processing_start');
    const imageProcessingResults = await Promise.all(imageContents.map(async (pastedImage) => {
        const imageBlock = {
            type: 'image',
            source: {
                type: 'base64',
                media_type: (pastedImage.mediaType ||
                    'image/png'),
                data: pastedImage.content,
            },
        };
        (0, index_js_1.logEvent)('tengu_pasted_image_resize_attempt', {
            original_size_bytes: pastedImage.content.length,
        });
        const resized = await (0, imageResizer_js_1.maybeResizeAndDownsampleImageBlock)(imageBlock);
        return {
            resized,
            originalDimensions: pastedImage.dimensions,
            sourcePath: pastedImage.sourcePath ?? storedImagePaths.get(pastedImage.id),
        };
    }));
    // Collect results preserving order
    const imageContentBlocks = [];
    for (const { resized, originalDimensions, sourcePath, } of imageProcessingResults) {
        // Collect image metadata for isMeta message (prefer resized dimensions)
        if (resized.dimensions) {
            const metadataText = (0, imageResizer_js_1.createImageMetadataText)(resized.dimensions, sourcePath);
            if (metadataText) {
                imageMetadataTexts.push(metadataText);
            }
        }
        else if (originalDimensions) {
            // Fall back to original dimensions if resize didn't provide them
            const metadataText = (0, imageResizer_js_1.createImageMetadataText)(originalDimensions, sourcePath);
            if (metadataText) {
                imageMetadataTexts.push(metadataText);
            }
        }
        else if (sourcePath) {
            // If we have a source path but no dimensions, still add source info
            imageMetadataTexts.push(`[Image source: ${sourcePath}]`);
        }
        imageContentBlocks.push(resized.block);
    }
    (0, queryProfiler_js_1.queryCheckpoint)('query_pasted_image_processing_end');
    // Bridge-safe slash command override: mobile/web clients set bridgeOrigin
    // with skipSlashCommands still true (defense-in-depth against exit words and
    // immediate-command fast paths). Resolve the command here — if it passes
    // isBridgeSafeCommand, clear the skip so the gate below opens. If it's a
    // known-but-unsafe command (local-jsx UI or terminal-only), short-circuit
    // with a helpful message rather than letting the model see raw "/config".
    let effectiveSkipSlash = skipSlashCommands;
    if (bridgeOrigin && inputString !== null && inputString.startsWith('/')) {
        const parsed = (0, slashCommandParsing_js_1.parseSlashCommand)(inputString);
        const cmd = parsed
            ? (0, commands_js_1.findCommand)(parsed.commandName, context.options.commands)
            : undefined;
        if (cmd) {
            if ((0, commands_js_1.isBridgeSafeCommand)(cmd)) {
                effectiveSkipSlash = false;
            }
            else {
                const msg = `/${(0, commands_js_1.getCommandName)(cmd)} isn't available over Remote Control.`;
                return {
                    messages: [
                        (0, messages_js_2.createUserMessage)({ content: inputString, uuid }),
                        (0, messages_js_2.createCommandInputMessage)(`<local-command-stdout>${msg}</local-command-stdout>`),
                    ],
                    shouldQuery: false,
                    resultText: msg,
                };
            }
        }
        // Unknown /foo or unparseable — fall through to plain text, same as
        // pre-#19134. A mobile user typing "/shrug" shouldn't see "Unknown skill".
    }
    // Ultraplan keyword — route through /ultraplan. Detect on the
    // pre-expansion input so pasted content containing the word cannot
    // trigger a CCR session; replace with "plan" in the expanded input so
    // the CCR prompt receives paste contents and stays grammatical. See
    // keyword.ts for the quote/path exclusions. Interactive prompt mode +
    // non-slash-prefixed only:
    // headless/print mode filters local-jsx commands out of context.options,
    // so routing to /ultraplan there yields "Unknown skill" — and there's no
    // rainbow animation in print mode anyway.
    // Runs before attachment extraction so this path matches the slash-command
    // path below (no await between setUserInputOnProcessing and setAppState —
    // React batches both into one render, no flash).
    if ((0, bun_bundle_1.feature)('ULTRAPLAN') &&
        mode === 'prompt' &&
        !context.options.isNonInteractiveSession &&
        inputString !== null &&
        !effectiveSkipSlash &&
        !inputString.startsWith('/') &&
        !context.getAppState().ultraplanSessionUrl &&
        !context.getAppState().ultraplanLaunching &&
        (0, keyword_js_1.hasUltraplanKeyword)(preExpansionInput ?? inputString)) {
        (0, index_js_1.logEvent)('tengu_ultraplan_keyword', {});
        const rewritten = (0, keyword_js_1.replaceUltraplanKeyword)(inputString).trim();
        const { processSlashCommand } = await Promise.resolve().then(() => __importStar(require('./processSlashCommand.js')));
        const slashResult = await processSlashCommand(`/ultraplan ${rewritten}`, precedingInputBlocks, imageContentBlocks, [], context, setToolJSX, uuid, isAlreadyProcessing, canUseTool);
        return addImageMetadataMessage(slashResult, imageMetadataTexts);
    }
    // For slash commands, attachments will be extracted within getMessagesForSlashCommand
    const shouldExtractAttachments = !skipAttachments &&
        inputString !== null &&
        (mode !== 'prompt' || effectiveSkipSlash || !inputString.startsWith('/'));
    (0, queryProfiler_js_1.queryCheckpoint)('query_attachment_loading_start');
    const attachmentMessages = shouldExtractAttachments
        ? await (0, generators_js_1.toArray)((0, attachments_js_1.getAttachmentMessages)(inputString, context, ideSelection ?? null, [], // queuedCommands - handled by query.ts for mid-turn attachments
        messages, querySource))
        : [];
    (0, queryProfiler_js_1.queryCheckpoint)('query_attachment_loading_end');
    // Bash commands
    if (inputString !== null && mode === 'bash') {
        const { processBashCommand } = await Promise.resolve().then(() => __importStar(require('./processBashCommand.js')));
        return addImageMetadataMessage(await processBashCommand(inputString, precedingInputBlocks, attachmentMessages, context, setToolJSX), imageMetadataTexts);
    }
    // Slash commands
    // Skip for remote bridge messages — input from CCR clients is plain text
    if (inputString !== null &&
        !effectiveSkipSlash &&
        inputString.startsWith('/')) {
        const { processSlashCommand } = await Promise.resolve().then(() => __importStar(require('./processSlashCommand.js')));
        const slashResult = await processSlashCommand(inputString, precedingInputBlocks, imageContentBlocks, attachmentMessages, context, setToolJSX, uuid, isAlreadyProcessing, canUseTool);
        return addImageMetadataMessage(slashResult, imageMetadataTexts);
    }
    // Log agent mention queries for analysis
    if (inputString !== null && mode === 'prompt') {
        const trimmedInput = inputString.trim();
        const agentMention = attachmentMessages.find((m) => m.attachment.type === 'agent_mention');
        if (agentMention) {
            const agentMentionString = `@agent-${agentMention.attachment.agentType}`;
            const isSubagentOnly = trimmedInput === agentMentionString;
            const isPrefix = trimmedInput.startsWith(agentMentionString) && !isSubagentOnly;
            // Log whenever users use @agent-<name> syntax
            (0, index_js_1.logEvent)('tengu_subagent_at_mention', {
                is_subagent_only: isSubagentOnly,
                is_prefix: isPrefix,
            });
        }
    }
    // Regular user prompt
    return addImageMetadataMessage((0, processTextPrompt_js_1.processTextPrompt)(normalizedInput, imageContentBlocks, imagePasteIds, attachmentMessages, uuid, permissionMode, isMeta), imageMetadataTexts);
}
// Adds image metadata texts as isMeta message to result
function addImageMetadataMessage(result, imageMetadataTexts) {
    if (imageMetadataTexts.length > 0) {
        result.messages.push((0, messages_js_2.createUserMessage)({
            content: imageMetadataTexts.map(text => ({ type: 'text', text })),
            isMeta: true,
        }));
    }
    return result;
}
