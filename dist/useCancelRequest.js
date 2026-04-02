"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CancelRequestHandler = CancelRequestHandler;
/**
 * CancelRequestHandler component for handling cancel/escape keybinding.
 *
 * Must be rendered inside KeybindingSetup to have access to the keybinding context.
 * This component renders nothing - it just registers the cancel keybinding handler.
 */
const react_1 = require("react");
const index_js_1 = require("src/services/analytics/index.js");
const AppState_js_1 = require("src/state/AppState.js");
const utils_js_1 = require("../components/PromptInput/utils.js");
const notifications_js_1 = require("../context/notifications.js");
const overlayContext_js_1 = require("../context/overlayContext.js");
const useCommandQueue_js_1 = require("../hooks/useCommandQueue.js");
const shortcutFormat_js_1 = require("../keybindings/shortcutFormat.js");
const useKeybinding_js_1 = require("../keybindings/useKeybinding.js");
const teammateViewHelpers_js_1 = require("../state/teammateViewHelpers.js");
const LocalAgentTask_js_1 = require("../tasks/LocalAgentTask/LocalAgentTask.js");
const messageQueueManager_js_1 = require("../utils/messageQueueManager.js");
const sdkEventQueue_js_1 = require("../utils/sdkEventQueue.js");
/** Time window in ms during which a second press kills all background agents. */
const KILL_AGENTS_CONFIRM_WINDOW_MS = 3000;
/**
 * Component that handles cancel requests via keybinding.
 * Renders null but registers the 'chat:cancel' keybinding handler.
 */
function CancelRequestHandler(props) {
    const { setToolUseConfirmQueue, onCancel, onAgentsKilled, isMessageSelectorVisible, screen, abortSignal, popCommandFromQueue, vimMode, isLocalJSXCommand, isSearchingHistory, isHelpOpen, inputMode, inputValue, streamMode, } = props;
    const store = (0, AppState_js_1.useAppStateStore)();
    const setAppState = (0, AppState_js_1.useSetAppState)();
    const queuedCommandsLength = (0, useCommandQueue_js_1.useCommandQueue)().length;
    const { addNotification, removeNotification } = (0, notifications_js_1.useNotifications)();
    const lastKillAgentsPressRef = (0, react_1.useRef)(0);
    const viewSelectionMode = (0, AppState_js_1.useAppState)(s => s.viewSelectionMode);
    const handleCancel = (0, react_1.useCallback)(() => {
        const cancelProps = {
            source: 'escape',
            streamMode: streamMode,
        };
        // Priority 1: If there's an active task running, cancel it first
        // This takes precedence over queue management so users can always interrupt Claude
        if (abortSignal !== undefined && !abortSignal.aborted) {
            (0, index_js_1.logEvent)('tengu_cancel', cancelProps);
            setToolUseConfirmQueue(() => []);
            onCancel();
            return;
        }
        // Priority 2: Pop queue when Claude is idle (no running task to cancel)
        if ((0, messageQueueManager_js_1.hasCommandsInQueue)()) {
            if (popCommandFromQueue) {
                popCommandFromQueue();
                return;
            }
        }
        // Fallback: nothing to cancel or pop (shouldn't reach here if isActive is correct)
        (0, index_js_1.logEvent)('tengu_cancel', cancelProps);
        setToolUseConfirmQueue(() => []);
        onCancel();
    }, [
        abortSignal,
        popCommandFromQueue,
        setToolUseConfirmQueue,
        onCancel,
        streamMode,
    ]);
    // Determine if this handler should be active
    // Other contexts (Transcript, HistorySearch, Help) have their own escape handlers
    // Overlays (ModelPicker, ThinkingToggle, etc.) register themselves via useRegisterOverlay
    // Local JSX commands (like /model, /btw) handle their own input
    const isOverlayActive = (0, overlayContext_js_1.useIsOverlayActive)();
    const canCancelRunningTask = abortSignal !== undefined && !abortSignal.aborted;
    const hasQueuedCommands = queuedCommandsLength > 0;
    // When in bash/background mode with empty input, escape should exit the mode
    // rather than cancel the request. Let PromptInput handle mode exit.
    // This only applies to Escape, not Ctrl+C which should always cancel.
    const isInSpecialModeWithEmptyInput = inputMode !== undefined && inputMode !== 'prompt' && !inputValue;
    // When viewing a teammate's transcript, let useBackgroundTaskNavigation handle Escape
    const isViewingTeammate = viewSelectionMode === 'viewing-agent';
    // Context guards: other screens/overlays handle their own cancel
    const isContextActive = screen !== 'transcript' &&
        !isSearchingHistory &&
        !isMessageSelectorVisible &&
        !isLocalJSXCommand &&
        !isHelpOpen &&
        !isOverlayActive &&
        !((0, utils_js_1.isVimModeEnabled)() && vimMode === 'INSERT');
    // Escape (chat:cancel) defers to mode-exit when in special mode with empty
    // input, and to useBackgroundTaskNavigation when viewing a teammate
    const isEscapeActive = isContextActive &&
        (canCancelRunningTask || hasQueuedCommands) &&
        !isInSpecialModeWithEmptyInput &&
        !isViewingTeammate;
    // Ctrl+C (app:interrupt): when viewing a teammate, stops everything and
    // returns to main thread. Otherwise just handleCancel. Must NOT claim
    // ctrl+c when main is idle at the prompt — that blocks the copy-selection
    // handler and double-press-to-exit from ever seeing the keypress.
    const isCtrlCActive = isContextActive &&
        (canCancelRunningTask || hasQueuedCommands || isViewingTeammate);
    (0, useKeybinding_js_1.useKeybinding)('chat:cancel', handleCancel, {
        context: 'Chat',
        isActive: isEscapeActive,
    });
    // Shared kill path: stop all agents, suppress per-agent notifications,
    // emit SDK events, enqueue a single aggregate model-facing notification.
    // Returns true if anything was killed.
    const killAllAgentsAndNotify = (0, react_1.useCallback)(() => {
        const tasks = store.getState().tasks;
        const running = Object.entries(tasks).filter(([, t]) => t.type === 'local_agent' && t.status === 'running');
        if (running.length === 0)
            return false;
        (0, LocalAgentTask_js_1.killAllRunningAgentTasks)(tasks, setAppState);
        const descriptions = [];
        for (const [taskId, task] of running) {
            (0, LocalAgentTask_js_1.markAgentsNotified)(taskId, setAppState);
            descriptions.push(task.description);
            (0, sdkEventQueue_js_1.emitTaskTerminatedSdk)(taskId, 'stopped', {
                toolUseId: task.toolUseId,
                summary: task.description,
            });
        }
        const summary = descriptions.length === 1
            ? `Background agent "${descriptions[0]}" was stopped by the user.`
            : `${descriptions.length} background agents were stopped by the user: ${descriptions.map(d => `"${d}"`).join(', ')}.`;
        (0, messageQueueManager_js_1.enqueuePendingNotification)({ value: summary, mode: 'task-notification' });
        onAgentsKilled();
        return true;
    }, [store, setAppState, onAgentsKilled]);
    // Ctrl+C (app:interrupt). Scoped to teammate-view: killing agents from the
    // main prompt stays a deliberate gesture (chat:killAgents), not a
    // side-effect of cancelling a turn.
    const handleInterrupt = (0, react_1.useCallback)(() => {
        if (isViewingTeammate) {
            killAllAgentsAndNotify();
            (0, teammateViewHelpers_js_1.exitTeammateView)(setAppState);
        }
        if (canCancelRunningTask || hasQueuedCommands) {
            handleCancel();
        }
    }, [
        isViewingTeammate,
        killAllAgentsAndNotify,
        setAppState,
        canCancelRunningTask,
        hasQueuedCommands,
        handleCancel,
    ]);
    (0, useKeybinding_js_1.useKeybinding)('app:interrupt', handleInterrupt, {
        context: 'Global',
        isActive: isCtrlCActive,
    });
    // chat:killAgents uses a two-press pattern: first press shows a
    // confirmation hint, second press within the window actually kills all
    // agents. Reads tasks from the store directly to avoid stale closures.
    const handleKillAgents = (0, react_1.useCallback)(() => {
        const tasks = store.getState().tasks;
        const hasRunningAgents = Object.values(tasks).some(t => t.type === 'local_agent' && t.status === 'running');
        if (!hasRunningAgents) {
            addNotification({
                key: 'kill-agents-none',
                text: 'No background agents running',
                priority: 'immediate',
                timeoutMs: 2000,
            });
            return;
        }
        const now = Date.now();
        const elapsed = now - lastKillAgentsPressRef.current;
        if (elapsed <= KILL_AGENTS_CONFIRM_WINDOW_MS) {
            // Second press within window -- kill all background agents
            lastKillAgentsPressRef.current = 0;
            removeNotification('kill-agents-confirm');
            (0, index_js_1.logEvent)('tengu_cancel', {
                source: 'kill_agents',
            });
            (0, messageQueueManager_js_1.clearCommandQueue)();
            killAllAgentsAndNotify();
            return;
        }
        // First press -- show confirmation hint in status bar
        lastKillAgentsPressRef.current = now;
        const shortcut = (0, shortcutFormat_js_1.getShortcutDisplay)('chat:killAgents', 'Chat', 'ctrl+x ctrl+k');
        addNotification({
            key: 'kill-agents-confirm',
            text: `Press ${shortcut} again to stop background agents`,
            priority: 'immediate',
            timeoutMs: KILL_AGENTS_CONFIRM_WINDOW_MS,
        });
    }, [store, addNotification, removeNotification, killAllAgentsAndNotify]);
    // Must stay always-active: ctrl+x is consumed as a chord prefix regardless
    // of isActive (because ctrl+x ctrl+e is always live), so an inactive handler
    // here would leak ctrl+k to readline kill-line. Handler gates internally.
    (0, useKeybinding_js_1.useKeybinding)('chat:killAgents', handleKillAgents, {
        context: 'Chat',
    });
    return null;
}
