"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkComputerUseLock = checkComputerUseLock;
exports.isLockHeldLocally = isLockHeldLocally;
exports.tryAcquireComputerUseLock = tryAcquireComputerUseLock;
exports.releaseComputerUseLock = releaseComputerUseLock;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const state_js_1 = require("../../bootstrap/state.js");
const cleanupRegistry_js_1 = require("../../utils/cleanupRegistry.js");
const debug_js_1 = require("../../utils/debug.js");
const envUtils_js_1 = require("../../utils/envUtils.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const errors_js_1 = require("../errors.js");
const LOCK_FILENAME = 'computer-use.lock';
// Holds the unregister function for the shutdown cleanup handler.
// Set when the lock is acquired, cleared when released.
let unregisterCleanup;
const FRESH = { kind: 'acquired', fresh: true };
const REENTRANT = { kind: 'acquired', fresh: false };
function isComputerUseLock(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    return ('sessionId' in value &&
        typeof value.sessionId === 'string' &&
        'pid' in value &&
        typeof value.pid === 'number');
}
function getLockPath() {
    return (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), LOCK_FILENAME);
}
async function readLock() {
    try {
        const raw = await (0, promises_1.readFile)(getLockPath(), 'utf8');
        const parsed = (0, slowOperations_js_1.jsonParse)(raw);
        return isComputerUseLock(parsed) ? parsed : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * Check whether a process is still running (signal 0 probe).
 *
 * Note: there is a small window for PID reuse — if the owning process
 * exits and an unrelated process is assigned the same PID, the check
 * will return true. This is extremely unlikely in practice.
 */
function isProcessRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Attempt to create the lock file atomically with O_EXCL.
 * Returns true on success, false if the file already exists.
 * Throws for other errors.
 */
async function tryCreateExclusive(lock) {
    try {
        await (0, promises_1.writeFile)(getLockPath(), (0, slowOperations_js_1.jsonStringify)(lock), { flag: 'wx' });
        return true;
    }
    catch (e) {
        if ((0, errors_js_1.getErrnoCode)(e) === 'EEXIST')
            return false;
        throw e;
    }
}
/**
 * Register a shutdown cleanup handler so the lock is released even if
 * turn-end cleanup is never reached (e.g. the user runs /exit while
 * a tool call is in progress).
 */
function registerLockCleanup() {
    unregisterCleanup?.();
    unregisterCleanup = (0, cleanupRegistry_js_1.registerCleanup)(async () => {
        await releaseComputerUseLock();
    });
}
/**
 * Check lock state without acquiring. Used for `request_access` /
 * `list_granted_applications` — the package's `defersLockAcquire` contract:
 * these tools check but don't take the lock, so the enter-notification and
 * overlay don't fire while the model is only asking for permission.
 *
 * Does stale-PID recovery (unlinks) so a dead session's lock doesn't block
 * `request_access`. Does NOT create — that's `tryAcquireComputerUseLock`'s job.
 */
async function checkComputerUseLock() {
    const existing = await readLock();
    if (!existing)
        return { kind: 'free' };
    if (existing.sessionId === (0, state_js_1.getSessionId)())
        return { kind: 'held_by_self' };
    if (isProcessRunning(existing.pid)) {
        return { kind: 'blocked', by: existing.sessionId };
    }
    (0, debug_js_1.logForDebugging)(`Recovering stale computer-use lock from session ${existing.sessionId} (PID ${existing.pid})`);
    await (0, promises_1.unlink)(getLockPath()).catch(() => { });
    return { kind: 'free' };
}
/**
 * Zero-syscall check: does THIS process believe it holds the lock?
 * True iff `tryAcquireComputerUseLock` succeeded and `releaseComputerUseLock`
 * hasn't run yet. Used to gate the per-turn release in `cleanup.ts` so
 * non-CU turns don't touch disk.
 */
function isLockHeldLocally() {
    return unregisterCleanup !== undefined;
}
/**
 * Try to acquire the computer-use lock for the current session.
 *
 * `{kind: 'acquired', fresh: true}` — first tool call of a CU turn. Callers fire
 * enter notifications on this. `{kind: 'acquired', fresh: false}` — re-entrant,
 * same session already holds it. `{kind: 'blocked', by}` — another live session
 * holds it.
 *
 * Uses O_EXCL (open 'wx') for atomic test-and-set — the OS guarantees at
 * most one process sees the create succeed. If the file already exists,
 * we check ownership and PID liveness; for a stale lock we unlink and
 * retry the exclusive create once. If two sessions race to recover the
 * same stale lock, only one create succeeds (the other reads the winner).
 */
async function tryAcquireComputerUseLock() {
    const sessionId = (0, state_js_1.getSessionId)();
    const lock = {
        sessionId,
        pid: process.pid,
        acquiredAt: Date.now(),
    };
    await (0, promises_1.mkdir)((0, envUtils_js_1.getClaudeConfigHomeDir)(), { recursive: true });
    // Fresh acquisition.
    if (await tryCreateExclusive(lock)) {
        registerLockCleanup();
        return FRESH;
    }
    const existing = await readLock();
    // Corrupt/unparseable — treat as stale (can't extract a blocking ID).
    if (!existing) {
        await (0, promises_1.unlink)(getLockPath()).catch(() => { });
        if (await tryCreateExclusive(lock)) {
            registerLockCleanup();
            return FRESH;
        }
        return { kind: 'blocked', by: (await readLock())?.sessionId ?? 'unknown' };
    }
    // Already held by this session.
    if (existing.sessionId === sessionId)
        return REENTRANT;
    // Another live session holds it — blocked.
    if (isProcessRunning(existing.pid)) {
        return { kind: 'blocked', by: existing.sessionId };
    }
    // Stale lock — recover. Unlink then retry the exclusive create.
    // If another session is also recovering, one EEXISTs and reads the winner.
    (0, debug_js_1.logForDebugging)(`Recovering stale computer-use lock from session ${existing.sessionId} (PID ${existing.pid})`);
    await (0, promises_1.unlink)(getLockPath()).catch(() => { });
    if (await tryCreateExclusive(lock)) {
        registerLockCleanup();
        return FRESH;
    }
    return { kind: 'blocked', by: (await readLock())?.sessionId ?? 'unknown' };
}
/**
 * Release the computer-use lock if the current session owns it. Returns
 * `true` if we actually unlinked the file (i.e., we held it) — callers fire
 * exit notifications on this. Idempotent: subsequent calls return `false`.
 */
async function releaseComputerUseLock() {
    unregisterCleanup?.();
    unregisterCleanup = undefined;
    const existing = await readLock();
    if (!existing || existing.sessionId !== (0, state_js_1.getSessionId)())
        return false;
    try {
        await (0, promises_1.unlink)(getLockPath());
        (0, debug_js_1.logForDebugging)('Released computer-use lock');
        return true;
    }
    catch {
        return false;
    }
}
