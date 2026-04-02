"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useElapsedTime = useElapsedTime;
const react_1 = require("react");
const format_js_1 = require("../utils/format.js");
/**
 * Hook that returns formatted elapsed time since startTime.
 * Uses useSyncExternalStore with interval-based updates for efficiency.
 *
 * @param startTime - Unix timestamp in ms
 * @param isRunning - Whether to actively update the timer
 * @param ms - How often should we trigger updates?
 * @param pausedMs - Total paused duration to subtract
 * @param endTime - If set, freezes the duration at this timestamp (for
 *   terminal tasks). Without this, viewing a 2-min task 30 min after
 *   completion would show "32m".
 * @returns Formatted duration string (e.g., "1m 23s")
 */
function useElapsedTime(startTime, isRunning, ms = 1000, pausedMs = 0, endTime) {
    const get = () => (0, format_js_1.formatDuration)(Math.max(0, (endTime ?? Date.now()) - startTime - pausedMs));
    const subscribe = (0, react_1.useCallback)((notify) => {
        if (!isRunning)
            return () => { };
        const interval = setInterval(notify, ms);
        return () => clearInterval(interval);
    }, [isRunning, ms]);
    return (0, react_1.useSyncExternalStore)(subscribe, get, get);
}
