"use strict";
/**
 * Startup profiling utility for measuring and reporting time spent in various
 * initialization phases.
 *
 * Two modes:
 * 1. Sampled logging: 100% of ant users, 0.1% of external users - logs phases to Statsig
 * 2. Detailed profiling: CLAUDE_CODE_PROFILE_STARTUP=1 - full report with memory snapshots
 *
 * Uses Node.js built-in performance hooks API for standard timing measurement.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileCheckpoint = profileCheckpoint;
exports.profileReport = profileReport;
exports.isDetailedProfilingEnabled = isDetailedProfilingEnabled;
exports.getStartupPerfLogPath = getStartupPerfLogPath;
exports.logStartupPerf = logStartupPerf;
const path_1 = require("path");
const state_js_1 = require("src/bootstrap/state.js");
const index_js_1 = require("../services/analytics/index.js");
const debug_js_1 = require("./debug.js");
const envUtils_js_1 = require("./envUtils.js");
const fsOperations_js_1 = require("./fsOperations.js");
const profilerBase_js_1 = require("./profilerBase.js");
const slowOperations_js_1 = require("./slowOperations.js");
// Module-level state - decided once at module load
// eslint-disable-next-line custom-rules/no-process-env-top-level
const DETAILED_PROFILING = (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_PROFILE_STARTUP);
// Sampling for Statsig logging: 100% ant, 0.5% external
// Decision made once at startup - non-sampled users pay no profiling cost
const STATSIG_SAMPLE_RATE = 0.005;
// eslint-disable-next-line custom-rules/no-process-env-top-level
const STATSIG_LOGGING_SAMPLED = process.env.USER_TYPE === 'ant' || Math.random() < STATSIG_SAMPLE_RATE;
// Enable profiling if either detailed mode OR sampled for Statsig
const SHOULD_PROFILE = DETAILED_PROFILING || STATSIG_LOGGING_SAMPLED;
// Track memory snapshots separately (perf_hooks doesn't track memory).
// Only used when DETAILED_PROFILING is enabled.
// Stored as an array that appends in the same order as perf.mark() calls, so
// memorySnapshots[i] corresponds to getEntriesByType('mark')[i]. Using a Map
// keyed by checkpoint name is wrong because some checkpoints fire more than
// once (e.g. loadSettingsFromDisk_start fires during init and again after
// plugins reset the settings cache), and the second call would overwrite the
// first's memory snapshot.
const memorySnapshots = [];
// Phase definitions for Statsig logging: [startCheckpoint, endCheckpoint]
const PHASE_DEFINITIONS = {
    import_time: ['cli_entry', 'main_tsx_imports_loaded'],
    init_time: ['init_function_start', 'init_function_end'],
    settings_time: ['eagerLoadSettings_start', 'eagerLoadSettings_end'],
    total_time: ['cli_entry', 'main_after_run'],
};
// Record initial checkpoint if profiling is enabled
if (SHOULD_PROFILE) {
    // eslint-disable-next-line custom-rules/no-top-level-side-effects
    profileCheckpoint('profiler_initialized');
}
/**
 * Record a checkpoint with the given name
 */
function profileCheckpoint(name) {
    if (!SHOULD_PROFILE)
        return;
    const perf = (0, profilerBase_js_1.getPerformance)();
    perf.mark(name);
    // Only capture memory when detailed profiling enabled (env var)
    if (DETAILED_PROFILING) {
        memorySnapshots.push(process.memoryUsage());
    }
}
/**
 * Get a formatted report of all checkpoints
 * Only available when DETAILED_PROFILING is enabled
 */
function getReport() {
    if (!DETAILED_PROFILING) {
        return 'Startup profiling not enabled';
    }
    const perf = (0, profilerBase_js_1.getPerformance)();
    const marks = perf.getEntriesByType('mark');
    if (marks.length === 0) {
        return 'No profiling checkpoints recorded';
    }
    const lines = [];
    lines.push('='.repeat(80));
    lines.push('STARTUP PROFILING REPORT');
    lines.push('='.repeat(80));
    lines.push('');
    let prevTime = 0;
    for (const [i, mark] of marks.entries()) {
        lines.push((0, profilerBase_js_1.formatTimelineLine)(mark.startTime, mark.startTime - prevTime, mark.name, memorySnapshots[i], 8, 7));
        prevTime = mark.startTime;
    }
    const lastMark = marks[marks.length - 1];
    lines.push('');
    lines.push(`Total startup time: ${(0, profilerBase_js_1.formatMs)(lastMark?.startTime ?? 0)}ms`);
    lines.push('='.repeat(80));
    return lines.join('\n');
}
let reported = false;
function profileReport() {
    if (reported)
        return;
    reported = true;
    // Log to Statsig (sampled: 100% ant, 0.1% external)
    logStartupPerf();
    // Output detailed report if CLAUDE_CODE_PROFILE_STARTUP=1
    if (DETAILED_PROFILING) {
        // Write to file
        const path = getStartupPerfLogPath();
        const dir = (0, path_1.dirname)(path);
        const fs = (0, fsOperations_js_1.getFsImplementation)();
        fs.mkdirSync(dir);
        (0, slowOperations_js_1.writeFileSync_DEPRECATED)(path, getReport(), {
            encoding: 'utf8',
            flush: true,
        });
        (0, debug_js_1.logForDebugging)('Startup profiling report:');
        (0, debug_js_1.logForDebugging)(getReport());
    }
}
function isDetailedProfilingEnabled() {
    return DETAILED_PROFILING;
}
function getStartupPerfLogPath() {
    return (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), 'startup-perf', `${(0, state_js_1.getSessionId)()}.txt`);
}
/**
 * Log startup performance phases to Statsig.
 * Only logs if this session was sampled at startup.
 */
function logStartupPerf() {
    // Only log if we were sampled (decision made at module load)
    if (!STATSIG_LOGGING_SAMPLED)
        return;
    const perf = (0, profilerBase_js_1.getPerformance)();
    const marks = perf.getEntriesByType('mark');
    if (marks.length === 0)
        return;
    // Build checkpoint lookup
    const checkpointTimes = new Map();
    for (const mark of marks) {
        checkpointTimes.set(mark.name, mark.startTime);
    }
    // Compute phase durations
    const metadata = {};
    for (const [phaseName, [startCheckpoint, endCheckpoint]] of Object.entries(PHASE_DEFINITIONS)) {
        const startTime = checkpointTimes.get(startCheckpoint);
        const endTime = checkpointTimes.get(endCheckpoint);
        if (startTime !== undefined && endTime !== undefined) {
            metadata[`${phaseName}_ms`] = Math.round(endTime - startTime);
        }
    }
    // Add checkpoint count for debugging
    metadata.checkpoint_count = marks.length;
    (0, index_js_1.logEvent)('tengu_startup_perf', metadata);
}
