"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isResultSuccessful = isResultSuccessful;
exports.normalizeMessage = normalizeMessage;
exports.handleOrphanedPermission = handleOrphanedPermission;
exports.extractReadFilesFromMessages = extractReadFilesFromMessages;
exports.extractBashToolsFromMessages = extractBashToolsFromMessages;
const last_js_1 = __importDefault(require("lodash-es/last.js"));
const state_js_1 = require("src/bootstrap/state.js");
const toolOrchestration_js_1 = require("../services/tools/toolOrchestration.js");
const Tool_js_1 = require("../Tool.js");
const toolName_js_1 = require("../tools/BashTool/toolName.js");
const constants_js_1 = require("../tools/FileEditTool/constants.js");
const prompt_js_1 = require("../tools/FileReadTool/prompt.js");
const prompt_js_2 = require("../tools/FileWriteTool/prompt.js");
const debug_js_1 = require("./debug.js");
const envUtils_js_1 = require("./envUtils.js");
const errors_js_1 = require("./errors.js");
const file_js_1 = require("./file.js");
const fileRead_js_1 = require("./fileRead.js");
const fileStateCache_js_1 = require("./fileStateCache.js");
const messages_js_1 = require("./messages.js");
const path_js_1 = require("./path.js");
const sessionStorage_js_1 = require("./sessionStorage.js");
// Small cache size for ask operations which typically access few files
// during permission prompts or limited tool operations
const ASK_READ_FILE_STATE_CACHE_SIZE = 10;
/**
 * Checks if the result should be considered successful based on the last message.
 * Returns true if:
 * - Last message is assistant with text/thinking content
 * - Last message is user with only tool_result blocks
 * - Last message is the user prompt but the API completed with end_turn
 *   (model chose to emit no content blocks)
 */
function isResultSuccessful(message, stopReason = null) {
    if (!message)
        return false;
    if (message.type === 'assistant') {
        const lastContent = (0, last_js_1.default)(message.message.content);
        return (lastContent?.type === 'text' ||
            lastContent?.type === 'thinking' ||
            lastContent?.type === 'redacted_thinking');
    }
    if (message.type === 'user') {
        // Check if all content blocks are tool_result type
        const content = message.message.content;
        if (Array.isArray(content) &&
            content.length > 0 &&
            content.every(block => 'type' in block && block.type === 'tool_result')) {
            return true;
        }
    }
    // Carve-out: API completed (message_delta set stop_reason) but yielded
    // no assistant content — last(messages) is still this turn's prompt.
    // claude.ts:2026 recognizes end_turn-with-zero-content-blocks as
    // legitimate and passes through without throwing. Observed on
    // task_notification drain turns: model returns stop_reason=end_turn,
    // outputTokens=4, textContentLength=0 — it saw the subagent result
    // and decided nothing needed saying. Without this, QueryEngine emits
    // error_during_execution with errors[] = the entire process's
    // accumulated logError() buffer. Covers both string-content and
    // text-block-content user prompts, and any other non-passing shape.
    return stopReason === 'end_turn';
}
// Track last sent time for tool progress messages per tool use ID
// Keep only the last 100 entries to prevent unbounded growth
const MAX_TOOL_PROGRESS_TRACKING_ENTRIES = 100;
const TOOL_PROGRESS_THROTTLE_MS = 30000;
const toolProgressLastSentTime = new Map();
function* normalizeMessage(message) {
    switch (message.type) {
        case 'assistant':
            for (const _ of (0, messages_js_1.normalizeMessages)([message])) {
                // Skip empty messages (e.g., "(no content)") that shouldn't be output to SDK
                if (!(0, messages_js_1.isNotEmptyMessage)(_)) {
                    continue;
                }
                yield {
                    type: 'assistant',
                    message: _.message,
                    parent_tool_use_id: null,
                    session_id: (0, state_js_1.getSessionId)(),
                    uuid: _.uuid,
                    error: _.error,
                };
            }
            return;
        case 'progress':
            if (message.data.type === 'agent_progress' ||
                message.data.type === 'skill_progress') {
                for (const _ of (0, messages_js_1.normalizeMessages)([message.data.message])) {
                    switch (_.type) {
                        case 'assistant':
                            // Skip empty messages (e.g., "(no content)") that shouldn't be output to SDK
                            if (!(0, messages_js_1.isNotEmptyMessage)(_)) {
                                break;
                            }
                            yield {
                                type: 'assistant',
                                message: _.message,
                                parent_tool_use_id: message.parentToolUseID,
                                session_id: (0, state_js_1.getSessionId)(),
                                uuid: _.uuid,
                                error: _.error,
                            };
                            break;
                        case 'user':
                            yield {
                                type: 'user',
                                message: _.message,
                                parent_tool_use_id: message.parentToolUseID,
                                session_id: (0, state_js_1.getSessionId)(),
                                uuid: _.uuid,
                                timestamp: _.timestamp,
                                isSynthetic: _.isMeta || _.isVisibleInTranscriptOnly,
                                tool_use_result: _.mcpMeta
                                    ? { content: _.toolUseResult, ..._.mcpMeta }
                                    : _.toolUseResult,
                            };
                            break;
                    }
                }
            }
            else if (message.data.type === 'bash_progress' ||
                message.data.type === 'powershell_progress') {
                // Filter bash progress to send only one per minute
                // Only emit for Claude Code Remote for now
                if (!(0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_REMOTE) &&
                    !process.env.CLAUDE_CODE_CONTAINER_ID) {
                    break;
                }
                // Use parentToolUseID as the key since toolUseID changes for each progress message
                const trackingKey = message.parentToolUseID;
                const now = Date.now();
                const lastSent = toolProgressLastSentTime.get(trackingKey) || 0;
                const timeSinceLastSent = now - lastSent;
                // Send if at least 30 seconds have passed since last update
                if (timeSinceLastSent >= TOOL_PROGRESS_THROTTLE_MS) {
                    // Remove oldest entry if we're at capacity (LRU eviction)
                    if (toolProgressLastSentTime.size >= MAX_TOOL_PROGRESS_TRACKING_ENTRIES) {
                        const firstKey = toolProgressLastSentTime.keys().next().value;
                        if (firstKey !== undefined) {
                            toolProgressLastSentTime.delete(firstKey);
                        }
                    }
                    toolProgressLastSentTime.set(trackingKey, now);
                    yield {
                        type: 'tool_progress',
                        tool_use_id: message.toolUseID,
                        tool_name: message.data.type === 'bash_progress' ? 'Bash' : 'PowerShell',
                        parent_tool_use_id: message.parentToolUseID,
                        elapsed_time_seconds: message.data.elapsedTimeSeconds,
                        task_id: message.data.taskId,
                        session_id: (0, state_js_1.getSessionId)(),
                        uuid: message.uuid,
                    };
                }
            }
            break;
        case 'user':
            for (const _ of (0, messages_js_1.normalizeMessages)([message])) {
                yield {
                    type: 'user',
                    message: _.message,
                    parent_tool_use_id: null,
                    session_id: (0, state_js_1.getSessionId)(),
                    uuid: _.uuid,
                    timestamp: _.timestamp,
                    isSynthetic: _.isMeta || _.isVisibleInTranscriptOnly,
                    tool_use_result: _.mcpMeta
                        ? { content: _.toolUseResult, ..._.mcpMeta }
                        : _.toolUseResult,
                };
            }
            return;
        default:
        // yield nothing
    }
}
async function* handleOrphanedPermission(orphanedPermission, tools, mutableMessages, processUserInputContext) {
    const persistSession = !(0, state_js_1.isSessionPersistenceDisabled)();
    const { permissionResult, assistantMessage } = orphanedPermission;
    const { toolUseID } = permissionResult;
    if (!toolUseID) {
        return;
    }
    const content = assistantMessage.message.content;
    let toolUseBlock;
    if (Array.isArray(content)) {
        for (const block of content) {
            if (block.type === 'tool_use' && block.id === toolUseID) {
                toolUseBlock = block;
                break;
            }
        }
    }
    if (!toolUseBlock) {
        return;
    }
    const toolName = toolUseBlock.name;
    const toolInput = toolUseBlock.input;
    const toolDefinition = (0, Tool_js_1.findToolByName)(tools, toolName);
    if (!toolDefinition) {
        return;
    }
    // Create ToolUseBlock with the updated input if permission was allowed
    let finalInput = toolInput;
    if (permissionResult.behavior === 'allow') {
        if (permissionResult.updatedInput !== undefined) {
            finalInput = permissionResult.updatedInput;
        }
        else {
            (0, debug_js_1.logForDebugging)(`Orphaned permission for ${toolName}: updatedInput is undefined, falling back to original tool input`, { level: 'warn' });
        }
    }
    const finalToolUseBlock = {
        ...toolUseBlock,
        input: finalInput,
    };
    const canUseTool = async () => ({
        ...permissionResult,
        decisionReason: {
            type: 'mode',
            mode: 'default',
        },
    });
    // Add the assistant message with tool_use to messages BEFORE executing
    // so the conversation history is complete (tool_use -> tool_result).
    //
    // On CCR resume, mutableMessages is seeded from the transcript and may already
    // contain this tool_use. Pushing again would make normalizeMessagesForAPI merge
    // same-ID assistants (concatenating content) and produce a duplicate tool_use
    // ID, which the API rejects with "tool_use ids must be unique".
    //
    // Check for the specific tool_use_id rather than message.id: streaming yields
    // each content block as a separate AssistantMessage sharing one message.id, so
    // a [text, tool_use] response lands as two entries. filterUnresolvedToolUses may
    // strip the tool_use entry but keep the text one; an id-based check would then
    // wrongly skip the push while runTools below still executes, orphaning the result.
    const alreadyPresent = mutableMessages.some(m => m.type === 'assistant' &&
        Array.isArray(m.message.content) &&
        m.message.content.some(b => b.type === 'tool_use' && 'id' in b && b.id === toolUseID));
    if (!alreadyPresent) {
        mutableMessages.push(assistantMessage);
        if (persistSession) {
            await (0, sessionStorage_js_1.recordTranscript)(mutableMessages);
        }
    }
    const sdkAssistantMessage = {
        ...assistantMessage,
        session_id: (0, state_js_1.getSessionId)(),
        parent_tool_use_id: null,
    };
    yield sdkAssistantMessage;
    // Execute the tool - errors are handled internally by runToolUse
    for await (const update of (0, toolOrchestration_js_1.runTools)([finalToolUseBlock], [assistantMessage], canUseTool, processUserInputContext)) {
        if (update.message) {
            mutableMessages.push(update.message);
            if (persistSession) {
                await (0, sessionStorage_js_1.recordTranscript)(mutableMessages);
            }
            const sdkMessage = {
                ...update.message,
                session_id: (0, state_js_1.getSessionId)(),
                parent_tool_use_id: null,
            };
            yield sdkMessage;
        }
    }
}
// Create a function to extract read files from messages
function extractReadFilesFromMessages(messages, cwd, maxSize = ASK_READ_FILE_STATE_CACHE_SIZE) {
    const cache = (0, fileStateCache_js_1.createFileStateCacheWithSizeLimit)(maxSize);
    // First pass: find all FileReadTool/FileWriteTool/FileEditTool uses in assistant messages
    const fileReadToolUseIds = new Map(); // toolUseId -> filePath
    const fileWriteToolUseIds = new Map(); // toolUseId -> { filePath, content }
    const fileEditToolUseIds = new Map(); // toolUseId -> filePath
    for (const message of messages) {
        if (message.type === 'assistant' &&
            Array.isArray(message.message.content)) {
            for (const content of message.message.content) {
                if (content.type === 'tool_use' &&
                    content.name === prompt_js_1.FILE_READ_TOOL_NAME) {
                    // Extract file_path from the tool use input
                    const input = content.input;
                    // Ranged reads are not added to the cache.
                    if (input?.file_path &&
                        input?.offset === undefined &&
                        input?.limit === undefined) {
                        // Normalize to absolute path for consistent cache lookups
                        const absolutePath = (0, path_js_1.expandPath)(input.file_path, cwd);
                        fileReadToolUseIds.set(content.id, absolutePath);
                    }
                }
                else if (content.type === 'tool_use' &&
                    content.name === prompt_js_2.FILE_WRITE_TOOL_NAME) {
                    // Extract file_path and content from the Write tool use input
                    const input = content.input;
                    if (input?.file_path && input?.content) {
                        // Normalize to absolute path for consistent cache lookups
                        const absolutePath = (0, path_js_1.expandPath)(input.file_path, cwd);
                        fileWriteToolUseIds.set(content.id, {
                            filePath: absolutePath,
                            content: input.content,
                        });
                    }
                }
                else if (content.type === 'tool_use' &&
                    content.name === constants_js_1.FILE_EDIT_TOOL_NAME) {
                    // Edit's input has old_string/new_string, not the resulting content.
                    // Track the path so the second pass can read current disk state.
                    const input = content.input;
                    if (input?.file_path) {
                        const absolutePath = (0, path_js_1.expandPath)(input.file_path, cwd);
                        fileEditToolUseIds.set(content.id, absolutePath);
                    }
                }
            }
        }
    }
    // Second pass: find corresponding tool results and extract content
    for (const message of messages) {
        if (message.type === 'user' && Array.isArray(message.message.content)) {
            for (const content of message.message.content) {
                if (content.type === 'tool_result' && content.tool_use_id) {
                    // Handle Read tool results
                    const readFilePath = fileReadToolUseIds.get(content.tool_use_id);
                    if (readFilePath &&
                        typeof content.content === 'string' &&
                        // Dedup stubs contain no file content — the earlier real Read
                        // already cached it. Chronological last-wins would otherwise
                        // overwrite the real entry with stub text.
                        !content.content.startsWith(prompt_js_1.FILE_UNCHANGED_STUB)) {
                        // Remove system-reminder blocks from the content
                        const processedContent = content.content.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
                        // Extract the actual file content from the tool result
                        // Tool results for text files contain line numbers, we need to strip those
                        const fileContent = processedContent
                            .split('\n')
                            .map(file_js_1.stripLineNumberPrefix)
                            .join('\n')
                            .trim();
                        // Cache the file content with the message timestamp
                        if (message.timestamp) {
                            const timestamp = new Date(message.timestamp).getTime();
                            cache.set(readFilePath, {
                                content: fileContent,
                                timestamp,
                                offset: undefined,
                                limit: undefined,
                            });
                        }
                    }
                    // Handle Write tool results - use content from the tool input
                    const writeToolData = fileWriteToolUseIds.get(content.tool_use_id);
                    if (writeToolData && message.timestamp) {
                        const timestamp = new Date(message.timestamp).getTime();
                        cache.set(writeToolData.filePath, {
                            content: writeToolData.content,
                            timestamp,
                            offset: undefined,
                            limit: undefined,
                        });
                    }
                    // Handle Edit tool results — post-edit content isn't in the
                    // tool_use input (only old_string/new_string) nor fully in the
                    // result (only a snippet). Read from disk now, using actual mtime
                    // so getChangedFiles's mtime check passes on the next turn.
                    //
                    // Callers seed the cache once at process start (print.ts --resume,
                    // Cowork cold-restart per turn), so disk content at extraction time
                    // IS the post-edit state. No dedup: processing every Edit preserves
                    // last-wins semantics when Read/Write interleave (Edit→Read→Edit).
                    const editFilePath = fileEditToolUseIds.get(content.tool_use_id);
                    if (editFilePath && content.is_error !== true) {
                        try {
                            const { content: diskContent } = (0, fileRead_js_1.readFileSyncWithMetadata)(editFilePath);
                            cache.set(editFilePath, {
                                content: diskContent,
                                timestamp: (0, file_js_1.getFileModificationTime)(editFilePath),
                                offset: undefined,
                                limit: undefined,
                            });
                        }
                        catch (e) {
                            if (!(0, errors_js_1.isFsInaccessible)(e)) {
                                throw e;
                            }
                            // File deleted or inaccessible since the Edit — skip
                        }
                    }
                }
            }
        }
    }
    return cache;
}
/**
 * Extract the top-level CLI tools used in BashTool calls from message history.
 * Returns a deduplicated set of command names (e.g. 'vercel', 'aws', 'git').
 */
function extractBashToolsFromMessages(messages) {
    const tools = new Set();
    for (const message of messages) {
        if (message.type === 'assistant' &&
            Array.isArray(message.message.content)) {
            for (const content of message.message.content) {
                if (content.type === 'tool_use' && content.name === toolName_js_1.BASH_TOOL_NAME) {
                    const { input } = content;
                    if (typeof input !== 'object' ||
                        input === null ||
                        !('command' in input))
                        continue;
                    const cmd = extractCliName(typeof input.command === 'string' ? input.command : undefined);
                    if (cmd) {
                        tools.add(cmd);
                    }
                }
            }
        }
    }
    return tools;
}
const STRIPPED_COMMANDS = new Set(['sudo']);
/**
 * Extract the actual CLI name from a bash command string, skipping
 * env var assignments (e.g. `FOO=bar vercel` → `vercel`) and prefixes
 * in STRIPPED_COMMANDS.
 */
function extractCliName(command) {
    if (!command)
        return undefined;
    const tokens = command.trim().split(/\s+/);
    for (const token of tokens) {
        if (/^[A-Za-z_]\w*=/.test(token))
            continue;
        if (STRIPPED_COMMANDS.has(token))
            continue;
        return token;
    }
    return undefined;
}
