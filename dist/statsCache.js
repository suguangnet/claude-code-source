"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STATS_CACHE_VERSION = void 0;
exports.withStatsCacheLock = withStatsCacheLock;
exports.getStatsCachePath = getStatsCachePath;
exports.loadStatsCache = loadStatsCache;
exports.saveStatsCache = saveStatsCache;
exports.mergeCacheWithNewStats = mergeCacheWithNewStats;
exports.toDateString = toDateString;
exports.getTodayDateString = getTodayDateString;
exports.getYesterdayDateString = getYesterdayDateString;
exports.isDateBefore = isDateBefore;
const bun_bundle_1 = require("bun:bundle");
const crypto_1 = require("crypto");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const debug_js_1 = require("./debug.js");
const envUtils_js_1 = require("./envUtils.js");
const errors_js_1 = require("./errors.js");
const fsOperations_js_1 = require("./fsOperations.js");
const log_js_1 = require("./log.js");
const slowOperations_js_1 = require("./slowOperations.js");
exports.STATS_CACHE_VERSION = 3;
const MIN_MIGRATABLE_VERSION = 1;
const STATS_CACHE_FILENAME = 'stats-cache.json';
/**
 * Simple in-memory lock to prevent concurrent cache operations.
 */
let statsCacheLockPromise = null;
/**
 * Execute a function while holding the stats cache lock.
 * Only one operation can hold the lock at a time.
 */
async function withStatsCacheLock(fn) {
    // Wait for any existing lock to be released
    while (statsCacheLockPromise) {
        await statsCacheLockPromise;
    }
    // Create our lock
    let releaseLock;
    statsCacheLockPromise = new Promise(resolve => {
        releaseLock = resolve;
    });
    try {
        return await fn();
    }
    finally {
        // Release the lock
        statsCacheLockPromise = null;
        releaseLock?.();
    }
}
function getStatsCachePath() {
    return (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), STATS_CACHE_FILENAME);
}
function getEmptyCache() {
    return {
        version: exports.STATS_CACHE_VERSION,
        lastComputedDate: null,
        dailyActivity: [],
        dailyModelTokens: [],
        modelUsage: {},
        totalSessions: 0,
        totalMessages: 0,
        longestSession: null,
        firstSessionDate: null,
        hourCounts: {},
        totalSpeculationTimeSavedMs: 0,
        shotDistribution: {},
    };
}
/**
 * Migrate an older cache to the current schema.
 * Returns null if the version is unknown or too old to migrate.
 *
 * Preserves historical aggregates that would otherwise be lost when
 * transcript files have already aged out past cleanupPeriodDays.
 * Pre-migration days may undercount (e.g. v2 lacked subagent tokens);
 * we accept that rather than drop the history.
 */
function migrateStatsCache(parsed) {
    if (typeof parsed.version !== 'number' ||
        parsed.version < MIN_MIGRATABLE_VERSION ||
        parsed.version > exports.STATS_CACHE_VERSION) {
        return null;
    }
    if (!Array.isArray(parsed.dailyActivity) ||
        !Array.isArray(parsed.dailyModelTokens) ||
        typeof parsed.totalSessions !== 'number' ||
        typeof parsed.totalMessages !== 'number') {
        return null;
    }
    return {
        version: exports.STATS_CACHE_VERSION,
        lastComputedDate: parsed.lastComputedDate ?? null,
        dailyActivity: parsed.dailyActivity,
        dailyModelTokens: parsed.dailyModelTokens,
        modelUsage: parsed.modelUsage ?? {},
        totalSessions: parsed.totalSessions,
        totalMessages: parsed.totalMessages,
        longestSession: parsed.longestSession ?? null,
        firstSessionDate: parsed.firstSessionDate ?? null,
        hourCounts: parsed.hourCounts ?? {},
        totalSpeculationTimeSavedMs: parsed.totalSpeculationTimeSavedMs ?? 0,
        // Preserve undefined (don't default to {}) so the SHOT_STATS recompute
        // check in loadStatsCache fires for v1/v2 caches that lacked this field.
        shotDistribution: parsed.shotDistribution,
    };
}
/**
 * Load the stats cache from disk.
 * Returns an empty cache if the file doesn't exist or is invalid.
 */
async function loadStatsCache() {
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    const cachePath = getStatsCachePath();
    try {
        const content = await fs.readFile(cachePath, { encoding: 'utf-8' });
        const parsed = (0, slowOperations_js_1.jsonParse)(content);
        // Validate version
        if (parsed.version !== exports.STATS_CACHE_VERSION) {
            const migrated = migrateStatsCache(parsed);
            if (!migrated) {
                (0, debug_js_1.logForDebugging)(`Stats cache version ${parsed.version} not migratable (expected ${exports.STATS_CACHE_VERSION}), returning empty cache`);
                return getEmptyCache();
            }
            (0, debug_js_1.logForDebugging)(`Migrated stats cache from v${parsed.version} to v${exports.STATS_CACHE_VERSION}`);
            // Persist migration so we don't re-migrate on every load.
            // aggregateClaudeCodeStats() skips its save when lastComputedDate is
            // already current, so without this the on-disk file stays at the old
            // version indefinitely.
            await saveStatsCache(migrated);
            if ((0, bun_bundle_1.feature)('SHOT_STATS') && !migrated.shotDistribution) {
                (0, debug_js_1.logForDebugging)('Migrated stats cache missing shotDistribution, forcing recomputation');
                return getEmptyCache();
            }
            return migrated;
        }
        // Basic validation
        if (!Array.isArray(parsed.dailyActivity) ||
            !Array.isArray(parsed.dailyModelTokens) ||
            typeof parsed.totalSessions !== 'number' ||
            typeof parsed.totalMessages !== 'number') {
            (0, debug_js_1.logForDebugging)('Stats cache has invalid structure, returning empty cache');
            return getEmptyCache();
        }
        // If SHOT_STATS is enabled but cache doesn't have shotDistribution,
        // force full recomputation to get historical shot data
        if ((0, bun_bundle_1.feature)('SHOT_STATS') && !parsed.shotDistribution) {
            (0, debug_js_1.logForDebugging)('Stats cache missing shotDistribution, forcing recomputation');
            return getEmptyCache();
        }
        return parsed;
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`Failed to load stats cache: ${(0, errors_js_1.errorMessage)(error)}`);
        return getEmptyCache();
    }
}
/**
 * Save the stats cache to disk atomically.
 * Uses a temp file + rename pattern to prevent corruption.
 */
async function saveStatsCache(cache) {
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    const cachePath = getStatsCachePath();
    const tempPath = `${cachePath}.${(0, crypto_1.randomBytes)(8).toString('hex')}.tmp`;
    try {
        // Ensure the directory exists
        const configDir = (0, envUtils_js_1.getClaudeConfigHomeDir)();
        try {
            await fs.mkdir(configDir);
        }
        catch {
            // Directory already exists or other error - proceed
        }
        // Write to temp file with fsync for atomic write safety
        const content = (0, slowOperations_js_1.jsonStringify)(cache, null, 2);
        const handle = await (0, promises_1.open)(tempPath, 'w', 0o600);
        try {
            await handle.writeFile(content, { encoding: 'utf-8' });
            await handle.sync();
        }
        finally {
            await handle.close();
        }
        // Atomic rename
        await fs.rename(tempPath, cachePath);
        (0, debug_js_1.logForDebugging)(`Stats cache saved successfully (lastComputedDate: ${cache.lastComputedDate})`);
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        // Clean up temp file
        try {
            await fs.unlink(tempPath);
        }
        catch {
            // Ignore cleanup errors
        }
    }
}
/**
 * Merge new stats into an existing cache.
 * Used when incrementally adding new days to the cache.
 */
function mergeCacheWithNewStats(existingCache, newStats, newLastComputedDate) {
    // Merge daily activity - combine by date
    const dailyActivityMap = new Map();
    for (const day of existingCache.dailyActivity) {
        dailyActivityMap.set(day.date, { ...day });
    }
    for (const day of newStats.dailyActivity) {
        const existing = dailyActivityMap.get(day.date);
        if (existing) {
            existing.messageCount += day.messageCount;
            existing.sessionCount += day.sessionCount;
            existing.toolCallCount += day.toolCallCount;
        }
        else {
            dailyActivityMap.set(day.date, { ...day });
        }
    }
    // Merge daily model tokens - combine by date
    const dailyModelTokensMap = new Map();
    for (const day of existingCache.dailyModelTokens) {
        dailyModelTokensMap.set(day.date, { ...day.tokensByModel });
    }
    for (const day of newStats.dailyModelTokens) {
        const existing = dailyModelTokensMap.get(day.date);
        if (existing) {
            for (const [model, tokens] of Object.entries(day.tokensByModel)) {
                existing[model] = (existing[model] || 0) + tokens;
            }
        }
        else {
            dailyModelTokensMap.set(day.date, { ...day.tokensByModel });
        }
    }
    // Merge model usage
    const modelUsage = { ...existingCache.modelUsage };
    for (const [model, usage] of Object.entries(newStats.modelUsage)) {
        if (modelUsage[model]) {
            modelUsage[model] = {
                inputTokens: modelUsage[model].inputTokens + usage.inputTokens,
                outputTokens: modelUsage[model].outputTokens + usage.outputTokens,
                cacheReadInputTokens: modelUsage[model].cacheReadInputTokens + usage.cacheReadInputTokens,
                cacheCreationInputTokens: modelUsage[model].cacheCreationInputTokens +
                    usage.cacheCreationInputTokens,
                webSearchRequests: modelUsage[model].webSearchRequests + usage.webSearchRequests,
                costUSD: modelUsage[model].costUSD + usage.costUSD,
                contextWindow: Math.max(modelUsage[model].contextWindow, usage.contextWindow),
                maxOutputTokens: Math.max(modelUsage[model].maxOutputTokens, usage.maxOutputTokens),
            };
        }
        else {
            modelUsage[model] = { ...usage };
        }
    }
    // Merge hour counts
    const hourCounts = { ...existingCache.hourCounts };
    for (const [hour, count] of Object.entries(newStats.hourCounts)) {
        const hourNum = parseInt(hour, 10);
        hourCounts[hourNum] = (hourCounts[hourNum] || 0) + count;
    }
    // Update session aggregates
    const totalSessions = existingCache.totalSessions + newStats.sessionStats.length;
    const totalMessages = existingCache.totalMessages +
        newStats.sessionStats.reduce((sum, s) => sum + s.messageCount, 0);
    // Find longest session (compare existing with new)
    let longestSession = existingCache.longestSession;
    for (const session of newStats.sessionStats) {
        if (!longestSession || session.duration > longestSession.duration) {
            longestSession = session;
        }
    }
    // Find first session date
    let firstSessionDate = existingCache.firstSessionDate;
    for (const session of newStats.sessionStats) {
        if (!firstSessionDate || session.timestamp < firstSessionDate) {
            firstSessionDate = session.timestamp;
        }
    }
    const result = {
        version: exports.STATS_CACHE_VERSION,
        lastComputedDate: newLastComputedDate,
        dailyActivity: Array.from(dailyActivityMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
        dailyModelTokens: Array.from(dailyModelTokensMap.entries())
            .map(([date, tokensByModel]) => ({ date, tokensByModel }))
            .sort((a, b) => a.date.localeCompare(b.date)),
        modelUsage,
        totalSessions,
        totalMessages,
        longestSession,
        firstSessionDate,
        hourCounts,
        totalSpeculationTimeSavedMs: existingCache.totalSpeculationTimeSavedMs +
            newStats.totalSpeculationTimeSavedMs,
    };
    if ((0, bun_bundle_1.feature)('SHOT_STATS')) {
        const shotDistribution = {
            ...(existingCache.shotDistribution || {}),
        };
        for (const [count, sessions] of Object.entries(newStats.shotDistribution || {})) {
            const key = parseInt(count, 10);
            shotDistribution[key] = (shotDistribution[key] || 0) + sessions;
        }
        result.shotDistribution = shotDistribution;
    }
    return result;
}
/**
 * Extract the date portion (YYYY-MM-DD) from a Date object.
 */
function toDateString(date) {
    const parts = date.toISOString().split('T');
    const dateStr = parts[0];
    if (!dateStr) {
        throw new Error('Invalid ISO date string');
    }
    return dateStr;
}
/**
 * Get today's date in YYYY-MM-DD format.
 */
function getTodayDateString() {
    return toDateString(new Date());
}
/**
 * Get yesterday's date in YYYY-MM-DD format.
 */
function getYesterdayDateString() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return toDateString(yesterday);
}
/**
 * Check if a date string is before another date string.
 * Both should be in YYYY-MM-DD format.
 */
function isDateBefore(date1, date2) {
    return date1 < date2;
}
