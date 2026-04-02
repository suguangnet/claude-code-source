"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var _TasksV2Store_instances, _TasksV2Store_tasks, _TasksV2Store_hidden, _TasksV2Store_watcher, _TasksV2Store_watchedDir, _TasksV2Store_hideTimer, _TasksV2Store_debounceTimer, _TasksV2Store_pollTimer, _TasksV2Store_unsubscribeTasksUpdated, _TasksV2Store_changed, _TasksV2Store_subscriberCount, _TasksV2Store_started, _TasksV2Store_notify, _TasksV2Store_rewatch, _TasksV2Store_debouncedFetch, _TasksV2Store_fetch, _TasksV2Store_onHideTimerFired, _TasksV2Store_clearHideTimer, _TasksV2Store_stop;
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTasksV2 = useTasksV2;
exports.useTasksV2WithCollapseEffect = useTasksV2WithCollapseEffect;
const fs_1 = require("fs");
const react_1 = require("react");
const AppState_js_1 = require("../state/AppState.js");
const signal_js_1 = require("../utils/signal.js");
const tasks_js_1 = require("../utils/tasks.js");
const teammate_js_1 = require("../utils/teammate.js");
const HIDE_DELAY_MS = 5000;
const DEBOUNCE_MS = 50;
const FALLBACK_POLL_MS = 5000; // Fallback in case fs.watch misses events
/**
 * Singleton store for the TodoV2 task list. Owns the file watcher, timers,
 * and cached task list. Multiple hook instances (REPL, Spinner,
 * PromptInputFooterLeftSide) subscribe to one shared store instead of each
 * setting up their own fs.watch on the same directory. The Spinner mounts/
 * unmounts every turn — per-hook watchers caused constant watch/unwatch churn.
 *
 * Implements the useSyncExternalStore contract: subscribe/getSnapshot.
 */
class TasksV2Store {
    constructor() {
        _TasksV2Store_instances.add(this);
        /** Stable array reference; replaced only on fetch. undefined until started. */
        _TasksV2Store_tasks.set(this, undefined
        /**
         * Set when the hide timer has elapsed (all tasks completed for >5s), or
         * when the task list is empty. Starts false so the first fetch runs the
         * "all completed → schedule 5s hide" path (matches original behavior:
         * resuming a session with completed tasks shows them briefly).
         */
        );
        /**
         * Set when the hide timer has elapsed (all tasks completed for >5s), or
         * when the task list is empty. Starts false so the first fetch runs the
         * "all completed → schedule 5s hide" path (matches original behavior:
         * resuming a session with completed tasks shows them briefly).
         */
        _TasksV2Store_hidden.set(this, false);
        _TasksV2Store_watcher.set(this, null);
        _TasksV2Store_watchedDir.set(this, null);
        _TasksV2Store_hideTimer.set(this, null);
        _TasksV2Store_debounceTimer.set(this, null);
        _TasksV2Store_pollTimer.set(this, null);
        _TasksV2Store_unsubscribeTasksUpdated.set(this, null);
        _TasksV2Store_changed.set(this, (0, signal_js_1.createSignal)());
        _TasksV2Store_subscriberCount.set(this, 0);
        _TasksV2Store_started.set(this, false
        /**
         * useSyncExternalStore snapshot. Returns the same Task[] reference between
         * updates (required for Object.is stability). Returns undefined when hidden.
         */
        );
        /**
         * useSyncExternalStore snapshot. Returns the same Task[] reference between
         * updates (required for Object.is stability). Returns undefined when hidden.
         */
        this.getSnapshot = () => {
            return __classPrivateFieldGet(this, _TasksV2Store_hidden, "f") ? undefined : __classPrivateFieldGet(this, _TasksV2Store_tasks, "f");
        };
        this.subscribe = (fn) => {
            var _a;
            // Lazy init on first subscriber. useSyncExternalStore calls this
            // post-commit, so I/O here is safe (no render-phase side effects).
            // REPL.tsx keeps a subscription alive for the whole session, so
            // Spinner mount/unmount churn never drives the count to zero.
            const unsubscribe = __classPrivateFieldGet(this, _TasksV2Store_changed, "f").subscribe(fn);
            __classPrivateFieldSet(this, _TasksV2Store_subscriberCount, (_a = __classPrivateFieldGet(this, _TasksV2Store_subscriberCount, "f"), _a++, _a), "f");
            if (!__classPrivateFieldGet(this, _TasksV2Store_started, "f")) {
                __classPrivateFieldSet(this, _TasksV2Store_started, true, "f");
                __classPrivateFieldSet(this, _TasksV2Store_unsubscribeTasksUpdated, (0, tasks_js_1.onTasksUpdated)(__classPrivateFieldGet(this, _TasksV2Store_debouncedFetch, "f")), "f");
                // Fire-and-forget: subscribe is called post-commit (not in render),
                // and the store notifies subscribers when the fetch resolves.
                void __classPrivateFieldGet(this, _TasksV2Store_fetch, "f").call(this);
            }
            let unsubscribed = false;
            return () => {
                var _a;
                if (unsubscribed)
                    return;
                unsubscribed = true;
                unsubscribe();
                __classPrivateFieldSet(this, _TasksV2Store_subscriberCount, (_a = __classPrivateFieldGet(this, _TasksV2Store_subscriberCount, "f"), _a--, _a), "f");
                if (__classPrivateFieldGet(this, _TasksV2Store_subscriberCount, "f") === 0)
                    __classPrivateFieldGet(this, _TasksV2Store_instances, "m", _TasksV2Store_stop).call(this);
            };
        };
        _TasksV2Store_debouncedFetch.set(this, () => {
            if (__classPrivateFieldGet(this, _TasksV2Store_debounceTimer, "f"))
                clearTimeout(__classPrivateFieldGet(this, _TasksV2Store_debounceTimer, "f"));
            __classPrivateFieldSet(this, _TasksV2Store_debounceTimer, setTimeout(() => void __classPrivateFieldGet(this, _TasksV2Store_fetch, "f").call(this), DEBOUNCE_MS), "f");
            __classPrivateFieldGet(this, _TasksV2Store_debounceTimer, "f").unref();
        });
        _TasksV2Store_fetch.set(this, async () => {
            const taskListId = (0, tasks_js_1.getTaskListId)();
            // Task list ID can change mid-session (TeamCreateTool sets
            // leaderTeamName) — point the watcher at the current dir.
            __classPrivateFieldGet(this, _TasksV2Store_instances, "m", _TasksV2Store_rewatch).call(this, (0, tasks_js_1.getTasksDir)(taskListId));
            const current = (await (0, tasks_js_1.listTasks)(taskListId)).filter(t => !t.metadata?._internal);
            __classPrivateFieldSet(this, _TasksV2Store_tasks, current, "f");
            const hasIncomplete = current.some(t => t.status !== 'completed');
            if (hasIncomplete || current.length === 0) {
                // Has unresolved tasks (open/in_progress) or empty — reset hide state
                __classPrivateFieldSet(this, _TasksV2Store_hidden, current.length === 0, "f");
                __classPrivateFieldGet(this, _TasksV2Store_instances, "m", _TasksV2Store_clearHideTimer).call(this);
            }
            else if (__classPrivateFieldGet(this, _TasksV2Store_hideTimer, "f") === null && !__classPrivateFieldGet(this, _TasksV2Store_hidden, "f")) {
                // All tasks just became completed — schedule clear
                __classPrivateFieldSet(this, _TasksV2Store_hideTimer, setTimeout(__classPrivateFieldGet(this, _TasksV2Store_instances, "m", _TasksV2Store_onHideTimerFired).bind(this, taskListId), HIDE_DELAY_MS), "f");
                __classPrivateFieldGet(this, _TasksV2Store_hideTimer, "f").unref();
            }
            __classPrivateFieldGet(this, _TasksV2Store_instances, "m", _TasksV2Store_notify).call(this);
            // Schedule fallback poll only when there are incomplete tasks that
            // need monitoring. When all tasks are completed (or there are none),
            // the fs.watch watcher and onTasksUpdated callback are sufficient to
            // detect new activity — no need to keep polling and re-rendering.
            if (__classPrivateFieldGet(this, _TasksV2Store_pollTimer, "f")) {
                clearTimeout(__classPrivateFieldGet(this, _TasksV2Store_pollTimer, "f"));
                __classPrivateFieldSet(this, _TasksV2Store_pollTimer, null, "f");
            }
            if (hasIncomplete) {
                __classPrivateFieldSet(this, _TasksV2Store_pollTimer, setTimeout(__classPrivateFieldGet(this, _TasksV2Store_debouncedFetch, "f"), FALLBACK_POLL_MS), "f");
                __classPrivateFieldGet(this, _TasksV2Store_pollTimer, "f").unref();
            }
        });
    }
}
_TasksV2Store_tasks = new WeakMap(), _TasksV2Store_hidden = new WeakMap(), _TasksV2Store_watcher = new WeakMap(), _TasksV2Store_watchedDir = new WeakMap(), _TasksV2Store_hideTimer = new WeakMap(), _TasksV2Store_debounceTimer = new WeakMap(), _TasksV2Store_pollTimer = new WeakMap(), _TasksV2Store_unsubscribeTasksUpdated = new WeakMap(), _TasksV2Store_changed = new WeakMap(), _TasksV2Store_subscriberCount = new WeakMap(), _TasksV2Store_started = new WeakMap(), _TasksV2Store_debouncedFetch = new WeakMap(), _TasksV2Store_fetch = new WeakMap(), _TasksV2Store_instances = new WeakSet(), _TasksV2Store_notify = function _TasksV2Store_notify() {
    __classPrivateFieldGet(this, _TasksV2Store_changed, "f").emit();
}, _TasksV2Store_rewatch = function _TasksV2Store_rewatch(dir) {
    // Retry even on same dir if the previous watch attempt failed (dir
    // didn't exist yet). Once the watcher is established, same-dir is a no-op.
    if (dir === __classPrivateFieldGet(this, _TasksV2Store_watchedDir, "f") && __classPrivateFieldGet(this, _TasksV2Store_watcher, "f") !== null)
        return;
    __classPrivateFieldGet(this, _TasksV2Store_watcher, "f")?.close();
    __classPrivateFieldSet(this, _TasksV2Store_watcher, null, "f");
    __classPrivateFieldSet(this, _TasksV2Store_watchedDir, dir, "f");
    try {
        __classPrivateFieldSet(this, _TasksV2Store_watcher, (0, fs_1.watch)(dir, __classPrivateFieldGet(this, _TasksV2Store_debouncedFetch, "f")), "f");
        __classPrivateFieldGet(this, _TasksV2Store_watcher, "f").unref();
    }
    catch {
        // Directory may not exist yet (ensureTasksDir is called by writers).
        // Not critical — onTasksUpdated covers in-process updates and the
        // poll timer covers cross-process updates.
    }
}, _TasksV2Store_onHideTimerFired = function _TasksV2Store_onHideTimerFired(scheduledForTaskListId) {
    __classPrivateFieldSet(this, _TasksV2Store_hideTimer, null, "f");
    // Bail if the task list ID changed since scheduling (team created/deleted
    // during the 5s window) — don't reset the wrong list.
    const currentId = (0, tasks_js_1.getTaskListId)();
    if (currentId !== scheduledForTaskListId)
        return;
    // Verify all tasks are still completed before clearing
    void (0, tasks_js_1.listTasks)(currentId).then(async (tasksToCheck) => {
        const allStillCompleted = tasksToCheck.length > 0 &&
            tasksToCheck.every(t => t.status === 'completed');
        if (allStillCompleted) {
            await (0, tasks_js_1.resetTaskList)(currentId);
            __classPrivateFieldSet(this, _TasksV2Store_tasks, [], "f");
            __classPrivateFieldSet(this, _TasksV2Store_hidden, true, "f");
        }
        __classPrivateFieldGet(this, _TasksV2Store_instances, "m", _TasksV2Store_notify).call(this);
    });
}, _TasksV2Store_clearHideTimer = function _TasksV2Store_clearHideTimer() {
    if (__classPrivateFieldGet(this, _TasksV2Store_hideTimer, "f")) {
        clearTimeout(__classPrivateFieldGet(this, _TasksV2Store_hideTimer, "f"));
        __classPrivateFieldSet(this, _TasksV2Store_hideTimer, null, "f");
    }
}, _TasksV2Store_stop = function _TasksV2Store_stop() {
    __classPrivateFieldGet(this, _TasksV2Store_watcher, "f")?.close();
    __classPrivateFieldSet(this, _TasksV2Store_watcher, null, "f");
    __classPrivateFieldSet(this, _TasksV2Store_watchedDir, null, "f");
    __classPrivateFieldGet(this, _TasksV2Store_unsubscribeTasksUpdated, "f")?.call(this);
    __classPrivateFieldSet(this, _TasksV2Store_unsubscribeTasksUpdated, null, "f");
    __classPrivateFieldGet(this, _TasksV2Store_instances, "m", _TasksV2Store_clearHideTimer).call(this);
    if (__classPrivateFieldGet(this, _TasksV2Store_debounceTimer, "f"))
        clearTimeout(__classPrivateFieldGet(this, _TasksV2Store_debounceTimer, "f"));
    if (__classPrivateFieldGet(this, _TasksV2Store_pollTimer, "f"))
        clearTimeout(__classPrivateFieldGet(this, _TasksV2Store_pollTimer, "f"));
    __classPrivateFieldSet(this, _TasksV2Store_debounceTimer, null, "f");
    __classPrivateFieldSet(this, _TasksV2Store_pollTimer, null, "f");
    __classPrivateFieldSet(this, _TasksV2Store_started, false, "f");
};
let _store = null;
function getStore() {
    return (_store ?? (_store = new TasksV2Store()));
}
// Stable no-ops for the disabled path so useSyncExternalStore doesn't
// churn its subscription on every render.
const NOOP = () => { };
const NOOP_SUBSCRIBE = () => NOOP;
const NOOP_SNAPSHOT = () => undefined;
/**
 * Hook to get the current task list for the persistent UI display.
 * Returns tasks when TodoV2 is enabled, otherwise returns undefined.
 * All hook instances share a single file watcher via TasksV2Store.
 * Hides the list after 5 seconds if there are no open tasks.
 */
function useTasksV2() {
    const teamContext = (0, AppState_js_1.useAppState)(s => s.teamContext);
    const enabled = (0, tasks_js_1.isTodoV2Enabled)() && (!teamContext || (0, teammate_js_1.isTeamLead)(teamContext));
    const store = enabled ? getStore() : null;
    return (0, react_1.useSyncExternalStore)(store ? store.subscribe : NOOP_SUBSCRIBE, store ? store.getSnapshot : NOOP_SNAPSHOT);
}
/**
 * Same as useTasksV2, plus collapses the expanded task view when the list
 * becomes hidden. Call this from exactly one always-mounted component (REPL)
 * so the collapse effect runs once instead of N× per consumer.
 */
function useTasksV2WithCollapseEffect() {
    const tasks = useTasksV2();
    const setAppState = (0, AppState_js_1.useSetAppState)();
    const hidden = tasks === undefined;
    (0, react_1.useEffect)(() => {
        if (!hidden)
            return;
        setAppState(prev => {
            if (prev.expandedView !== 'tasks')
                return prev;
            return { ...prev, expandedView: 'none' };
        });
    }, [hidden, setAppState]);
    return tasks;
}
