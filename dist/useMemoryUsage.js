"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useMemoryUsage = useMemoryUsage;
const react_1 = require("react");
const usehooks_ts_1 = require("usehooks-ts");
const HIGH_MEMORY_THRESHOLD = 1.5 * 1024 * 1024 * 1024; // 1.5GB in bytes
const CRITICAL_MEMORY_THRESHOLD = 2.5 * 1024 * 1024 * 1024; // 2.5GB in bytes
/**
 * Hook to monitor Node.js process memory usage.
 * Polls every 10 seconds; returns null while status is 'normal'.
 */
function useMemoryUsage() {
    const [memoryUsage, setMemoryUsage] = (0, react_1.useState)(null);
    (0, usehooks_ts_1.useInterval)(() => {
        const heapUsed = process.memoryUsage().heapUsed;
        const status = heapUsed >= CRITICAL_MEMORY_THRESHOLD
            ? 'critical'
            : heapUsed >= HIGH_MEMORY_THRESHOLD
                ? 'high'
                : 'normal';
        setMemoryUsage(prev => {
            // Bail when status is 'normal' — nothing is shown, so heapUsed is
            // irrelevant and we avoid re-rendering the whole Notifications subtree
            // every 10 seconds for the 99%+ of users who never reach 1.5GB.
            if (status === 'normal')
                return prev === null ? prev : null;
            return { heapUsed, status };
        });
    }, 10000);
    return memoryUsage;
}
