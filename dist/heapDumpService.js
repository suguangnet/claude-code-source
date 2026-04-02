"use strict";
/**
 * Service for heap dump capture.
 * Used by the /heapdump command.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureMemoryDiagnostics = captureMemoryDiagnostics;
exports.performHeapDump = performHeapDump;
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const promises_2 = require("stream/promises");
const v8_1 = require("v8");
const state_js_1 = require("../bootstrap/state.js");
const index_js_1 = require("../services/analytics/index.js");
const debug_js_1 = require("./debug.js");
const errors_js_1 = require("./errors.js");
const file_js_1 = require("./file.js");
const fsOperations_js_1 = require("./fsOperations.js");
const log_js_1 = require("./log.js");
const slowOperations_js_1 = require("./slowOperations.js");
/**
 * Capture memory diagnostics.
 * This helps identify if the leak is in V8 heap (captured) or native memory (not captured).
 */
async function captureMemoryDiagnostics(trigger, dumpNumber = 0) {
    const usage = process.memoryUsage();
    const heapStats = (0, v8_1.getHeapStatistics)();
    const resourceUsage = process.resourceUsage();
    const uptimeSeconds = process.uptime();
    // getHeapSpaceStatistics() is not available in Bun
    let heapSpaceStats;
    try {
        heapSpaceStats = (0, v8_1.getHeapSpaceStatistics)();
    }
    catch {
        // Not available in Bun runtime
    }
    // Get active handles/requests count (these are internal APIs but stable)
    const activeHandles = process._getActiveHandles().length;
    const activeRequests = process._getActiveRequests().length;
    // Try to count open file descriptors (Linux/macOS)
    let openFileDescriptors;
    try {
        openFileDescriptors = (await (0, promises_1.readdir)('/proc/self/fd')).length;
    }
    catch {
        // Not on Linux - try macOS approach would require lsof, skip for now
    }
    // Try to read Linux smaps_rollup for detailed memory breakdown
    let smapsRollup;
    try {
        smapsRollup = await (0, promises_1.readFile)('/proc/self/smaps_rollup', 'utf8');
    }
    catch {
        // Not on Linux or no access - this is fine
    }
    // Calculate native memory (RSS - heap) and growth rate
    const nativeMemory = usage.rss - usage.heapUsed;
    const bytesPerSecond = uptimeSeconds > 0 ? usage.rss / uptimeSeconds : 0;
    const mbPerHour = (bytesPerSecond * 3600) / (1024 * 1024);
    // Identify potential leaks
    const potentialLeaks = [];
    if (heapStats.number_of_detached_contexts > 0) {
        potentialLeaks.push(`${heapStats.number_of_detached_contexts} detached context(s) - possible iframe/context leak`);
    }
    if (activeHandles > 100) {
        potentialLeaks.push(`${activeHandles} active handles - possible timer/socket leak`);
    }
    if (nativeMemory > usage.heapUsed) {
        potentialLeaks.push('Native memory > heap - leak may be in native addons (node-pty, sharp, etc.)');
    }
    if (mbPerHour > 100) {
        potentialLeaks.push(`High memory growth rate: ${mbPerHour.toFixed(1)} MB/hour`);
    }
    if (openFileDescriptors && openFileDescriptors > 500) {
        potentialLeaks.push(`${openFileDescriptors} open file descriptors - possible file/socket leak`);
    }
    return {
        timestamp: new Date().toISOString(),
        sessionId: (0, state_js_1.getSessionId)(),
        trigger,
        dumpNumber,
        uptimeSeconds,
        memoryUsage: {
            heapUsed: usage.heapUsed,
            heapTotal: usage.heapTotal,
            external: usage.external,
            arrayBuffers: usage.arrayBuffers,
            rss: usage.rss,
        },
        memoryGrowthRate: {
            bytesPerSecond,
            mbPerHour,
        },
        v8HeapStats: {
            heapSizeLimit: heapStats.heap_size_limit,
            mallocedMemory: heapStats.malloced_memory,
            peakMallocedMemory: heapStats.peak_malloced_memory,
            detachedContexts: heapStats.number_of_detached_contexts,
            nativeContexts: heapStats.number_of_native_contexts,
        },
        v8HeapSpaces: heapSpaceStats?.map(space => ({
            name: space.space_name,
            size: space.space_size,
            used: space.space_used_size,
            available: space.space_available_size,
        })),
        resourceUsage: {
            maxRSS: resourceUsage.maxRSS * 1024, // Convert KB to bytes
            userCPUTime: resourceUsage.userCPUTime,
            systemCPUTime: resourceUsage.systemCPUTime,
        },
        activeHandles,
        activeRequests,
        openFileDescriptors,
        analysis: {
            potentialLeaks,
            recommendation: potentialLeaks.length > 0
                ? `WARNING: ${potentialLeaks.length} potential leak indicator(s) found. See potentialLeaks array.`
                : 'No obvious leak indicators. Check heap snapshot for retained objects.',
        },
        smapsRollup,
        platform: process.platform,
        nodeVersion: process.version,
        ccVersion: MACRO.VERSION,
    };
}
/**
 * Core heap dump function — captures heap snapshot + diagnostics to ~/Desktop.
 *
 * Diagnostics are written BEFORE the heap snapshot is captured, because the
 * V8 heap snapshot serialization can crash for very large heaps. By writing
 * diagnostics first, we still get useful memory info even if the snapshot fails.
 */
async function performHeapDump(trigger = 'manual', dumpNumber = 0) {
    try {
        const sessionId = (0, state_js_1.getSessionId)();
        // Capture diagnostics before any other async I/O —
        // the heap dump itself allocates memory and would skew the numbers.
        const diagnostics = await captureMemoryDiagnostics(trigger, dumpNumber);
        const toGB = (bytes) => (bytes / 1024 / 1024 / 1024).toFixed(3);
        (0, debug_js_1.logForDebugging)(`[HeapDump] Memory state:
  heapUsed: ${toGB(diagnostics.memoryUsage.heapUsed)} GB (in snapshot)
  external: ${toGB(diagnostics.memoryUsage.external)} GB (NOT in snapshot)
  rss: ${toGB(diagnostics.memoryUsage.rss)} GB (total process)
  ${diagnostics.analysis.recommendation}`);
        const dumpDir = (0, file_js_1.getDesktopPath)();
        await (0, fsOperations_js_1.getFsImplementation)().mkdir(dumpDir);
        const suffix = dumpNumber > 0 ? `-dump${dumpNumber}` : '';
        const heapFilename = `${sessionId}${suffix}.heapsnapshot`;
        const diagFilename = `${sessionId}${suffix}-diagnostics.json`;
        const heapPath = (0, path_1.join)(dumpDir, heapFilename);
        const diagPath = (0, path_1.join)(dumpDir, diagFilename);
        // Write diagnostics first (cheap, unlikely to fail)
        await (0, promises_1.writeFile)(diagPath, (0, slowOperations_js_1.jsonStringify)(diagnostics, null, 2), {
            mode: 0o600,
        });
        (0, debug_js_1.logForDebugging)(`[HeapDump] Diagnostics written to ${diagPath}`);
        // Write heap snapshot (this can crash for very large heaps)
        await writeHeapSnapshot(heapPath);
        (0, debug_js_1.logForDebugging)(`[HeapDump] Heap dump written to ${heapPath}`);
        (0, index_js_1.logEvent)('tengu_heap_dump', {
            triggerManual: trigger === 'manual',
            triggerAuto15GB: trigger === 'auto-1.5GB',
            dumpNumber,
            success: true,
        });
        return { success: true, heapPath, diagPath };
    }
    catch (err) {
        const error = (0, errors_js_1.toError)(err);
        (0, log_js_1.logError)(error);
        (0, index_js_1.logEvent)('tengu_heap_dump', {
            triggerManual: trigger === 'manual',
            triggerAuto15GB: trigger === 'auto-1.5GB',
            dumpNumber,
            success: false,
        });
        return { success: false, error: error.message };
    }
}
/**
 * Write heap snapshot to a file.
 * Uses pipeline() which handles stream cleanup automatically on errors.
 */
async function writeHeapSnapshot(filepath) {
    if (typeof Bun !== 'undefined') {
        // In Bun, heapsnapshots are currently not streaming.
        // Use synchronous I/O despite potentially large filesize so that we avoid cloning the string for cross-thread usage.
        //
        /* eslint-disable custom-rules/no-sync-fs -- intentionally sync to avoid cloning large heap snapshot string for cross-thread usage */
        // @ts-expect-error 2nd argument is in the next version of Bun
        (0, fs_1.writeFileSync)(filepath, Bun.generateHeapSnapshot('v8', 'arraybuffer'), {
            mode: 0o600,
        });
        /* eslint-enable custom-rules/no-sync-fs */
        // Force GC to try to free that heap snapshot sooner.
        Bun.gc(true);
        return;
    }
    const writeStream = (0, fs_1.createWriteStream)(filepath, { mode: 0o600 });
    const heapSnapshotStream = (0, v8_1.getHeapSnapshot)();
    await (0, promises_2.pipeline)(heapSnapshotStream, writeStream);
}
