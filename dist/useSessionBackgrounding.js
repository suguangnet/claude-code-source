"use strict";
/**
 * Hook for managing session backgrounding (Ctrl+B to background/foreground sessions).
 *
 * Handles:
 * - Calling onBackgroundQuery to spawn a background task for the current query
 * - Re-backgrounding foregrounded tasks
 * - Syncing foregrounded task messages/state to main view
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSessionBackgrounding = useSessionBackgrounding;
const react_1 = require("react");
const AppState_js_1 = require("../state/AppState.js");
function useSessionBackgrounding({ setMessages, setIsLoading, resetLoadingState, setAbortController, onBackgroundQuery, }) {
    const foregroundedTaskId = (0, AppState_js_1.useAppState)(s => s.foregroundedTaskId);
    const foregroundedTask = (0, AppState_js_1.useAppState)(s => s.foregroundedTaskId ? s.tasks[s.foregroundedTaskId] : undefined);
    const setAppState = (0, AppState_js_1.useSetAppState)();
    const lastSyncedMessagesLengthRef = (0, react_1.useRef)(0);
    const handleBackgroundSession = (0, react_1.useCallback)(() => {
        if (foregroundedTaskId) {
            // Re-background the foregrounded task
            setAppState(prev => {
                const taskId = prev.foregroundedTaskId;
                if (!taskId)
                    return prev;
                const task = prev.tasks[taskId];
                if (!task) {
                    return { ...prev, foregroundedTaskId: undefined };
                }
                return {
                    ...prev,
                    foregroundedTaskId: undefined,
                    tasks: {
                        ...prev.tasks,
                        [taskId]: { ...task, isBackgrounded: true },
                    },
                };
            });
            setMessages([]);
            resetLoadingState();
            setAbortController(null);
            return;
        }
        onBackgroundQuery();
    }, [
        foregroundedTaskId,
        setAppState,
        setMessages,
        resetLoadingState,
        setAbortController,
        onBackgroundQuery,
    ]);
    // Sync foregrounded task's messages and loading state to the main view
    (0, react_1.useEffect)(() => {
        if (!foregroundedTaskId) {
            // Reset when no foregrounded task
            lastSyncedMessagesLengthRef.current = 0;
            return;
        }
        if (!foregroundedTask || foregroundedTask.type !== 'local_agent') {
            setAppState(prev => ({ ...prev, foregroundedTaskId: undefined }));
            resetLoadingState();
            lastSyncedMessagesLengthRef.current = 0;
            return;
        }
        // Sync messages from background task to main view
        // Only update if messages have actually changed to avoid redundant renders
        const taskMessages = foregroundedTask.messages ?? [];
        if (taskMessages.length !== lastSyncedMessagesLengthRef.current) {
            lastSyncedMessagesLengthRef.current = taskMessages.length;
            setMessages([...taskMessages]);
        }
        if (foregroundedTask.status === 'running') {
            // Check if the task was aborted (user pressed Escape)
            const taskAbortController = foregroundedTask.abortController;
            if (taskAbortController?.signal.aborted) {
                // Task was aborted - clear foregrounded state immediately
                setAppState(prev => {
                    if (!prev.foregroundedTaskId)
                        return prev;
                    const task = prev.tasks[prev.foregroundedTaskId];
                    if (!task)
                        return { ...prev, foregroundedTaskId: undefined };
                    return {
                        ...prev,
                        foregroundedTaskId: undefined,
                        tasks: {
                            ...prev.tasks,
                            [prev.foregroundedTaskId]: { ...task, isBackgrounded: true },
                        },
                    };
                });
                resetLoadingState();
                setAbortController(null);
                lastSyncedMessagesLengthRef.current = 0;
                return;
            }
            setIsLoading(true);
            // Set abort controller to the foregrounded task's controller for Escape handling
            if (taskAbortController) {
                setAbortController(taskAbortController);
            }
        }
        else {
            // Task completed - restore to background and clear foregrounded view
            setAppState(prev => {
                const taskId = prev.foregroundedTaskId;
                if (!taskId)
                    return prev;
                const task = prev.tasks[taskId];
                if (!task)
                    return { ...prev, foregroundedTaskId: undefined };
                return {
                    ...prev,
                    foregroundedTaskId: undefined,
                    tasks: { ...prev.tasks, [taskId]: { ...task, isBackgrounded: true } },
                };
            });
            resetLoadingState();
            setAbortController(null);
            lastSyncedMessagesLengthRef.current = 0;
        }
    }, [
        foregroundedTaskId,
        foregroundedTask,
        setAppState,
        setMessages,
        setIsLoading,
        resetLoadingState,
        setAbortController,
    ]);
    return {
        handleBackgroundSession,
    };
}
