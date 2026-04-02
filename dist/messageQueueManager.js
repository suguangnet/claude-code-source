"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearPendingNotifications = exports.resetPendingNotifications = exports.recheckPendingNotifications = exports.getPendingNotificationsCount = exports.hasPendingNotifications = exports.subscribeToPendingNotifications = exports.subscribeToCommandQueue = void 0;
exports.getCommandQueueSnapshot = getCommandQueueSnapshot;
exports.getCommandQueue = getCommandQueue;
exports.getCommandQueueLength = getCommandQueueLength;
exports.hasCommandsInQueue = hasCommandsInQueue;
exports.recheckCommandQueue = recheckCommandQueue;
exports.enqueue = enqueue;
exports.enqueuePendingNotification = enqueuePendingNotification;
exports.dequeue = dequeue;
exports.dequeueAll = dequeueAll;
exports.peek = peek;
exports.dequeueAllMatching = dequeueAllMatching;
exports.remove = remove;
exports.removeByFilter = removeByFilter;
exports.clearCommandQueue = clearCommandQueue;
exports.resetCommandQueue = resetCommandQueue;
exports.isPromptInputModeEditable = isPromptInputModeEditable;
exports.isQueuedCommandEditable = isQueuedCommandEditable;
exports.isQueuedCommandVisible = isQueuedCommandVisible;
exports.popAllEditable = popAllEditable;
exports.getPendingNotificationsSnapshot = getPendingNotificationsSnapshot;
exports.dequeuePendingNotification = dequeuePendingNotification;
exports.getCommandsByMaxPriority = getCommandsByMaxPriority;
exports.isSlashCommand = isSlashCommand;
const bun_bundle_1 = require("bun:bundle");
const state_js_1 = require("../bootstrap/state.js");
const messages_js_1 = require("./messages.js");
const objectGroupBy_js_1 = require("./objectGroupBy.js");
const sessionStorage_js_1 = require("./sessionStorage.js");
const signal_js_1 = require("./signal.js");
// ============================================================================
// Logging helper
// ============================================================================
function logOperation(operation, content) {
    const sessionId = (0, state_js_1.getSessionId)();
    const queueOp = {
        type: 'queue-operation',
        operation,
        timestamp: new Date().toISOString(),
        sessionId,
        ...(content !== undefined && { content }),
    };
    void (0, sessionStorage_js_1.recordQueueOperation)(queueOp);
}
// ============================================================================
// Unified command queue (module-level, independent of React state)
//
// All commands — user input, task notifications, orphaned permissions — go
// through this single queue. React components subscribe via
// useSyncExternalStore (subscribeToCommandQueue / getCommandQueueSnapshot).
// Non-React code (print.ts streaming loop) reads directly via
// getCommandQueue() / getCommandQueueLength().
//
// Priority determines dequeue order: 'now' > 'next' > 'later'.
// Within the same priority, commands are processed FIFO.
// ============================================================================
const commandQueue = [];
/** Frozen snapshot — recreated on every mutation for useSyncExternalStore. */
let snapshot = Object.freeze([]);
const queueChanged = (0, signal_js_1.createSignal)();
function notifySubscribers() {
    snapshot = Object.freeze([...commandQueue]);
    queueChanged.emit();
}
// ============================================================================
// useSyncExternalStore interface
// ============================================================================
/**
 * Subscribe to command queue changes.
 * Compatible with React's useSyncExternalStore.
 */
exports.subscribeToCommandQueue = queueChanged.subscribe;
/**
 * Get current snapshot of the command queue.
 * Compatible with React's useSyncExternalStore.
 * Returns a frozen array that only changes reference on mutation.
 */
function getCommandQueueSnapshot() {
    return snapshot;
}
// ============================================================================
// Read operations (for non-React code)
// ============================================================================
/**
 * Get a mutable copy of the current queue.
 * Use for one-off reads where you need the actual commands.
 */
function getCommandQueue() {
    return [...commandQueue];
}
/**
 * Get the current queue length without copying.
 */
function getCommandQueueLength() {
    return commandQueue.length;
}
/**
 * Check if there are commands in the queue.
 */
function hasCommandsInQueue() {
    return commandQueue.length > 0;
}
/**
 * Trigger a re-check by notifying subscribers.
 * Use after async processing completes to ensure remaining commands
 * are picked up by useSyncExternalStore consumers.
 */
function recheckCommandQueue() {
    if (commandQueue.length > 0) {
        notifySubscribers();
    }
}
// ============================================================================
// Write operations
// ============================================================================
/**
 * Add a command to the queue.
 * Used for user-initiated commands (prompt, bash, orphaned-permission).
 * Defaults priority to 'next' (processed before task notifications).
 */
function enqueue(command) {
    commandQueue.push({ ...command, priority: command.priority ?? 'next' });
    notifySubscribers();
    logOperation('enqueue', typeof command.value === 'string' ? command.value : undefined);
}
/**
 * Add a task notification to the queue.
 * Convenience wrapper that defaults priority to 'later' so user input
 * is never starved by system messages.
 */
function enqueuePendingNotification(command) {
    commandQueue.push({ ...command, priority: command.priority ?? 'later' });
    notifySubscribers();
    logOperation('enqueue', typeof command.value === 'string' ? command.value : undefined);
}
const PRIORITY_ORDER = {
    now: 0,
    next: 1,
    later: 2,
};
/**
 * Remove and return the highest-priority command, or undefined if empty.
 * Within the same priority level, commands are dequeued FIFO.
 *
 * An optional `filter` narrows the candidates: only commands for which the
 * predicate returns `true` are considered. Non-matching commands stay in the
 * queue untouched. This lets between-turn drains (SDK, REPL) restrict to
 * main-thread commands (`cmd.agentId === undefined`) without restructuring
 * the existing while-loop patterns.
 */
function dequeue(filter) {
    if (commandQueue.length === 0) {
        return undefined;
    }
    // Find the first command with the highest priority (respecting filter)
    let bestIdx = -1;
    let bestPriority = Infinity;
    for (let i = 0; i < commandQueue.length; i++) {
        const cmd = commandQueue[i];
        if (filter && !filter(cmd))
            continue;
        const priority = PRIORITY_ORDER[cmd.priority ?? 'next'];
        if (priority < bestPriority) {
            bestIdx = i;
            bestPriority = priority;
        }
    }
    if (bestIdx === -1)
        return undefined;
    const [dequeued] = commandQueue.splice(bestIdx, 1);
    notifySubscribers();
    logOperation('dequeue');
    return dequeued;
}
/**
 * Remove and return all commands from the queue.
 * Logs a dequeue operation for each command.
 */
function dequeueAll() {
    if (commandQueue.length === 0) {
        return [];
    }
    const commands = [...commandQueue];
    commandQueue.length = 0;
    notifySubscribers();
    for (const _cmd of commands) {
        logOperation('dequeue');
    }
    return commands;
}
/**
 * Return the highest-priority command without removing it, or undefined if empty.
 * Accepts an optional `filter` — only commands passing the predicate are considered.
 */
function peek(filter) {
    if (commandQueue.length === 0) {
        return undefined;
    }
    let bestIdx = -1;
    let bestPriority = Infinity;
    for (let i = 0; i < commandQueue.length; i++) {
        const cmd = commandQueue[i];
        if (filter && !filter(cmd))
            continue;
        const priority = PRIORITY_ORDER[cmd.priority ?? 'next'];
        if (priority < bestPriority) {
            bestIdx = i;
            bestPriority = priority;
        }
    }
    if (bestIdx === -1)
        return undefined;
    return commandQueue[bestIdx];
}
/**
 * Remove and return all commands matching a predicate, preserving priority order.
 * Non-matching commands stay in the queue.
 */
function dequeueAllMatching(predicate) {
    const matched = [];
    const remaining = [];
    for (const cmd of commandQueue) {
        if (predicate(cmd)) {
            matched.push(cmd);
        }
        else {
            remaining.push(cmd);
        }
    }
    if (matched.length === 0) {
        return [];
    }
    commandQueue.length = 0;
    commandQueue.push(...remaining);
    notifySubscribers();
    for (const _cmd of matched) {
        logOperation('dequeue');
    }
    return matched;
}
/**
 * Remove specific commands from the queue by reference identity.
 * Callers must pass the same object references that are in the queue
 * (e.g. from getCommandsByMaxPriority). Logs a 'remove' operation for each.
 */
function remove(commandsToRemove) {
    if (commandsToRemove.length === 0) {
        return;
    }
    const before = commandQueue.length;
    for (let i = commandQueue.length - 1; i >= 0; i--) {
        if (commandsToRemove.includes(commandQueue[i])) {
            commandQueue.splice(i, 1);
        }
    }
    if (commandQueue.length !== before) {
        notifySubscribers();
    }
    for (const _cmd of commandsToRemove) {
        logOperation('remove');
    }
}
/**
 * Remove commands matching a predicate.
 * Returns the removed commands.
 */
function removeByFilter(predicate) {
    const removed = [];
    for (let i = commandQueue.length - 1; i >= 0; i--) {
        if (predicate(commandQueue[i])) {
            removed.unshift(commandQueue.splice(i, 1)[0]);
        }
    }
    if (removed.length > 0) {
        notifySubscribers();
        for (const _cmd of removed) {
            logOperation('remove');
        }
    }
    return removed;
}
/**
 * Clear all commands from the queue.
 * Used by ESC cancellation to discard queued notifications.
 */
function clearCommandQueue() {
    if (commandQueue.length === 0) {
        return;
    }
    commandQueue.length = 0;
    notifySubscribers();
}
/**
 * Clear all commands and reset snapshot.
 * Used for test cleanup.
 */
function resetCommandQueue() {
    commandQueue.length = 0;
    snapshot = Object.freeze([]);
}
// ============================================================================
// Editable mode helpers
// ============================================================================
const NON_EDITABLE_MODES = new Set([
    'task-notification',
]);
function isPromptInputModeEditable(mode) {
    return !NON_EDITABLE_MODES.has(mode);
}
/**
 * Whether this queued command can be pulled into the input buffer via UP/ESC.
 * System-generated commands (proactive ticks, scheduled tasks, plan
 * verification, channel messages) contain raw XML and must not leak into
 * the user's input.
 */
function isQueuedCommandEditable(cmd) {
    return isPromptInputModeEditable(cmd.mode) && !cmd.isMeta;
}
/**
 * Whether this queued command should render in the queue preview under the
 * prompt. Superset of editable — channel messages show (so the keyboard user
 * sees what arrived) but stay non-editable (raw XML).
 */
function isQueuedCommandVisible(cmd) {
    if (((0, bun_bundle_1.feature)('KAIROS') || (0, bun_bundle_1.feature)('KAIROS_CHANNELS')) &&
        cmd.origin?.kind === 'channel')
        return true;
    return isQueuedCommandEditable(cmd);
}
/**
 * Extract text from a queued command value.
 * For strings, returns the string.
 * For ContentBlockParam[], extracts text from text blocks.
 */
function extractTextFromValue(value) {
    return typeof value === 'string' ? value : (0, messages_js_1.extractTextContent)(value, '\n');
}
/**
 * Extract images from ContentBlockParam[] and convert to PastedContent format.
 * Returns empty array for string values or if no images found.
 */
function extractImagesFromValue(value, startId) {
    if (typeof value === 'string') {
        return [];
    }
    const images = [];
    let imageIndex = 0;
    for (const block of value) {
        if (block.type === 'image' && block.source.type === 'base64') {
            images.push({
                id: startId + imageIndex,
                type: 'image',
                content: block.source.data,
                mediaType: block.source.media_type,
                filename: `image${imageIndex + 1}`,
            });
            imageIndex++;
        }
    }
    return images;
}
/**
 * Pop all editable commands and combine them with current input for editing.
 * Notification modes (task-notification) are left in the queue
 * to be auto-processed later.
 * Returns object with combined text, cursor offset, and images to restore.
 * Returns undefined if no editable commands in queue.
 */
function popAllEditable(currentInput, currentCursorOffset) {
    if (commandQueue.length === 0) {
        return undefined;
    }
    const { editable = [], nonEditable = [] } = (0, objectGroupBy_js_1.objectGroupBy)([...commandQueue], cmd => (isQueuedCommandEditable(cmd) ? 'editable' : 'nonEditable'));
    if (editable.length === 0) {
        return undefined;
    }
    // Extract text from queued commands (handles both strings and ContentBlockParam[])
    const queuedTexts = editable.map(cmd => extractTextFromValue(cmd.value));
    const newInput = [...queuedTexts, currentInput].filter(Boolean).join('\n');
    // Calculate cursor offset: length of joined queued commands + 1 + current cursor offset
    const cursorOffset = queuedTexts.join('\n').length + 1 + currentCursorOffset;
    // Extract images from queued commands
    const images = [];
    let nextImageId = Date.now(); // Use timestamp as base for unique IDs
    for (const cmd of editable) {
        // handlePromptSubmit queues images in pastedContents (value is a string).
        // Preserve the original PastedContent id so imageStore lookups still work.
        if (cmd.pastedContents) {
            for (const content of Object.values(cmd.pastedContents)) {
                if (content.type === 'image') {
                    images.push(content);
                }
            }
        }
        // Bridge/remote commands may embed images directly in ContentBlockParam[].
        const cmdImages = extractImagesFromValue(cmd.value, nextImageId);
        images.push(...cmdImages);
        nextImageId += cmdImages.length;
    }
    for (const command of editable) {
        logOperation('popAll', typeof command.value === 'string' ? command.value : undefined);
    }
    // Replace queue contents with only the non-editable commands
    commandQueue.length = 0;
    commandQueue.push(...nonEditable);
    notifySubscribers();
    return { text: newInput, cursorOffset, images };
}
// ============================================================================
// Backward-compatible aliases (deprecated — prefer new names)
// ============================================================================
/** @deprecated Use subscribeToCommandQueue */
exports.subscribeToPendingNotifications = exports.subscribeToCommandQueue;
/** @deprecated Use getCommandQueueSnapshot */
function getPendingNotificationsSnapshot() {
    return snapshot;
}
/** @deprecated Use hasCommandsInQueue */
exports.hasPendingNotifications = hasCommandsInQueue;
/** @deprecated Use getCommandQueueLength */
exports.getPendingNotificationsCount = getCommandQueueLength;
/** @deprecated Use recheckCommandQueue */
exports.recheckPendingNotifications = recheckCommandQueue;
/** @deprecated Use dequeue */
function dequeuePendingNotification() {
    return dequeue();
}
/** @deprecated Use resetCommandQueue */
exports.resetPendingNotifications = resetCommandQueue;
/** @deprecated Use clearCommandQueue */
exports.clearPendingNotifications = clearCommandQueue;
/**
 * Get commands at or above a given priority level without removing them.
 * Useful for mid-chain draining where only urgent items should be processed.
 *
 * Priority order: 'now' (0) > 'next' (1) > 'later' (2).
 * Passing 'now' returns only now-priority commands; 'later' returns everything.
 */
function getCommandsByMaxPriority(maxPriority) {
    const threshold = PRIORITY_ORDER[maxPriority];
    return commandQueue.filter(cmd => PRIORITY_ORDER[cmd.priority ?? 'next'] <= threshold);
}
/**
 * Returns true if the command is a slash command that should be routed through
 * processSlashCommand rather than sent to the model as text.
 *
 * Commands with `skipSlashCommands` (e.g. bridge/CCR messages) are NOT treated
 * as slash commands — their text is meant for the model.
 */
function isSlashCommand(cmd) {
    return (typeof cmd.value === 'string' &&
        cmd.value.trim().startsWith('/') &&
        !cmd.skipSlashCommands);
}
