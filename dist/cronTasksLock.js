"use strict";
// Scheduler lease lock for .claude/scheduled_tasks.json.
//
// When multiple Claude sessions run in the same project directory, only one
// should drive the cron scheduler. The first session to acquire this lock
// becomes the scheduler; others stay passive and periodically probe the lock.
// If the owner dies (PID no longer running), a passive session takes over.
//
// Pattern mirrors computerUseLock.ts: O_EXCL atomic create, PID liveness
// probe, stale-lock recovery, cleanup-on-exit.
Object.defineProperty(exports, "__esModule", { value: true });
exports.tryAcquireSchedulerLock = tryAcquireSchedulerLock;
exports.releaseSchedulerLock = releaseSchedulerLock;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const v4_1 = require("zod/v4");
const state_js_1 = require("../bootstrap/state.js");
const cleanupRegistry_js_1 = require("./cleanupRegistry.js");
const debug_js_1 = require("./debug.js");
const errors_js_1 = require("./errors.js");
const genericProcessUtils_js_1 = require("./genericProcessUtils.js");
const json_js_1 = require("./json.js");
const lazySchema_js_1 = require("./lazySchema.js");
const slowOperations_js_1 = require("./slowOperations.js");
const LOCK_FILE_REL = (0, path_1.join)('.claude', 'scheduled_tasks.lock');
const schedulerLockSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    sessionId: v4_1.z.string(),
    pid: v4_1.z.number(),
    acquiredAt: v4_1.z.number(),
}));
let unregisterCleanup;
// Suppress repeat "held by X" log lines when polling a live owner.
let lastBlockedBy;
function getLockPath(dir) {
    return (0, path_1.join)(dir ?? (0, state_js_1.getProjectRoot)(), LOCK_FILE_REL);
}
async function readLock(dir) {
    let raw;
    try {
        raw = await (0, promises_1.readFile)(getLockPath(dir), 'utf8');
    }
    catch {
        return undefined;
    }
    const result = schedulerLockSchema().safeParse((0, json_js_1.safeParseJSON)(raw, false));
    return result.success ? result.data : undefined;
}
async function tryCreateExclusive(lock, dir) {
    const path = getLockPath(dir);
    const body = (0, slowOperations_js_1.jsonStringify)(lock);
    try {
        await (0, promises_1.writeFile)(path, body, { flag: 'wx' });
        return true;
    }
    catch (e) {
        const code = (0, errors_js_1.getErrnoCode)(e);
        if (code === 'EEXIST')
            return false;
        if (code === 'ENOENT') {
            // .claude/ doesn't exist yet — create it and retry once. In steady
            // state the dir already exists (scheduled_tasks.json lives there),
            // so this path is hit at most once.
            await (0, promises_1.mkdir)((0, path_1.dirname)(path), { recursive: true });
            try {
                await (0, promises_1.writeFile)(path, body, { flag: 'wx' });
                return true;
            }
            catch (retryErr) {
                if ((0, errors_js_1.getErrnoCode)(retryErr) === 'EEXIST')
                    return false;
                throw retryErr;
            }
        }
        throw e;
    }
}
function registerLockCleanup(opts) {
    unregisterCleanup?.();
    unregisterCleanup = (0, cleanupRegistry_js_1.registerCleanup)(async () => {
        await releaseSchedulerLock(opts);
    });
}
/**
 * Try to acquire the scheduler lock for the current session.
 * Returns true on success, false if another live session holds it.
 *
 * Uses O_EXCL ('wx') for atomic test-and-set. If the file exists:
 *   - Already ours → true (idempotent re-acquire)
 *   - Another live PID → false
 *   - Stale (PID dead / corrupt) → unlink and retry exclusive create once
 *
 * If two sessions race to recover a stale lock, only one create succeeds.
 */
async function tryAcquireSchedulerLock(opts) {
    const dir = opts?.dir;
    // "sessionId" in the lock file is really just a stable owner key. REPL
    // uses getSessionId(); daemon callers supply their own UUID. PID remains
    // the liveness signal regardless.
    const sessionId = opts?.lockIdentity ?? (0, state_js_1.getSessionId)();
    const lock = {
        sessionId,
        pid: process.pid,
        acquiredAt: Date.now(),
    };
    if (await tryCreateExclusive(lock, dir)) {
        lastBlockedBy = undefined;
        registerLockCleanup(opts);
        (0, debug_js_1.logForDebugging)(`[ScheduledTasks] acquired scheduler lock (PID ${process.pid})`);
        return true;
    }
    const existing = await readLock(dir);
    // Already ours (idempotent). After --resume the session ID is restored
    // but the process has a new PID — update the lock file so other sessions
    // see a live PID and don't steal it.
    if (existing?.sessionId === sessionId) {
        if (existing.pid !== process.pid) {
            await (0, promises_1.writeFile)(getLockPath(dir), (0, slowOperations_js_1.jsonStringify)(lock));
            registerLockCleanup(opts);
        }
        return true;
    }
    // Corrupt or unparseable — treat as stale.
    // Another live session — blocked.
    if (existing && (0, genericProcessUtils_js_1.isProcessRunning)(existing.pid)) {
        if (lastBlockedBy !== existing.sessionId) {
            lastBlockedBy = existing.sessionId;
            (0, debug_js_1.logForDebugging)(`[ScheduledTasks] scheduler lock held by session ${existing.sessionId} (PID ${existing.pid})`);
        }
        return false;
    }
    // Stale — unlink and retry the exclusive create once.
    if (existing) {
        (0, debug_js_1.logForDebugging)(`[ScheduledTasks] recovering stale scheduler lock from PID ${existing.pid}`);
    }
    await (0, promises_1.unlink)(getLockPath(dir)).catch(() => { });
    if (await tryCreateExclusive(lock, dir)) {
        lastBlockedBy = undefined;
        registerLockCleanup(opts);
        return true;
    }
    // Another session won the recovery race.
    return false;
}
/**
 * Release the scheduler lock if the current session owns it.
 */
async function releaseSchedulerLock(opts) {
    unregisterCleanup?.();
    unregisterCleanup = undefined;
    lastBlockedBy = undefined;
    const dir = opts?.dir;
    const sessionId = opts?.lockIdentity ?? (0, state_js_1.getSessionId)();
    const existing = await readLock(dir);
    if (!existing || existing.sessionId !== sessionId)
        return;
    try {
        await (0, promises_1.unlink)(getLockPath(dir));
        (0, debug_js_1.logForDebugging)('[ScheduledTasks] released scheduler lock');
    }
    catch {
        // Already gone.
    }
}
