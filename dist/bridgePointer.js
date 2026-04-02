"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BRIDGE_POINTER_TTL_MS = void 0;
exports.getBridgePointerPath = getBridgePointerPath;
exports.writeBridgePointer = writeBridgePointer;
exports.readBridgePointer = readBridgePointer;
exports.readBridgePointerAcrossWorktrees = readBridgePointerAcrossWorktrees;
exports.clearBridgePointer = clearBridgePointer;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const v4_1 = require("zod/v4");
const debug_js_1 = require("../utils/debug.js");
const errors_js_1 = require("../utils/errors.js");
const getWorktreePathsPortable_js_1 = require("../utils/getWorktreePathsPortable.js");
const lazySchema_js_1 = require("../utils/lazySchema.js");
const sessionStoragePortable_js_1 = require("../utils/sessionStoragePortable.js");
const slowOperations_js_1 = require("../utils/slowOperations.js");
/**
 * Upper bound on worktree fanout. git worktree list is naturally bounded
 * (50 is a LOT), but this caps the parallel stat() burst and guards against
 * pathological setups. Above this, --continue falls back to current-dir-only.
 */
const MAX_WORKTREE_FANOUT = 50;
/**
 * Crash-recovery pointer for Remote Control sessions.
 *
 * Written immediately after a bridge session is created, periodically
 * refreshed during the session, and cleared on clean shutdown. If the
 * process dies unclean (crash, kill -9, terminal closed), the pointer
 * persists. On next startup, `claude remote-control` detects it and offers
 * to resume via the --session-id flow from #20460.
 *
 * Staleness is checked against the file's mtime (not an embedded timestamp)
 * so that a periodic re-write with the same content serves as a refresh —
 * matches the backend's rolling BRIDGE_LAST_POLL_TTL (4h) semantics. A
 * bridge that's been polling for 5+ hours and then crashes still has a
 * fresh pointer as long as the refresh ran within the window.
 *
 * Scoped per working directory (alongside transcript JSONL files) so two
 * concurrent bridges in different repos don't clobber each other.
 */
exports.BRIDGE_POINTER_TTL_MS = 4 * 60 * 60 * 1000;
const BridgePointerSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    sessionId: v4_1.z.string(),
    environmentId: v4_1.z.string(),
    source: v4_1.z.enum(['standalone', 'repl']),
}));
function getBridgePointerPath(dir) {
    return (0, path_1.join)((0, sessionStoragePortable_js_1.getProjectsDir)(), (0, sessionStoragePortable_js_1.sanitizePath)(dir), 'bridge-pointer.json');
}
/**
 * Write the pointer. Also used to refresh mtime during long sessions —
 * calling with the same IDs is a cheap no-content-change write that bumps
 * the staleness clock. Best-effort — a crash-recovery file must never
 * itself cause a crash. Logs and swallows on error.
 */
async function writeBridgePointer(dir, pointer) {
    const path = getBridgePointerPath(dir);
    try {
        await (0, promises_1.mkdir)((0, path_1.dirname)(path), { recursive: true });
        await (0, promises_1.writeFile)(path, (0, slowOperations_js_1.jsonStringify)(pointer), 'utf8');
        (0, debug_js_1.logForDebugging)(`[bridge:pointer] wrote ${path}`);
    }
    catch (err) {
        (0, debug_js_1.logForDebugging)(`[bridge:pointer] write failed: ${err}`, { level: 'warn' });
    }
}
/**
 * Read the pointer and its age (ms since last write). Operates directly
 * and handles errors — no existence check (CLAUDE.md TOCTOU rule). Returns
 * null on any failure: missing file, corrupted JSON, schema mismatch, or
 * stale (mtime > 4h ago). Stale/invalid pointers are deleted so they don't
 * keep re-prompting after the backend has already GC'd the env.
 */
async function readBridgePointer(dir) {
    const path = getBridgePointerPath(dir);
    let raw;
    let mtimeMs;
    try {
        // stat for mtime (staleness anchor), then read. Two syscalls, but both
        // are needed — mtime IS the data we return, not a TOCTOU guard.
        mtimeMs = (await (0, promises_1.stat)(path)).mtimeMs;
        raw = await (0, promises_1.readFile)(path, 'utf8');
    }
    catch {
        return null;
    }
    const parsed = BridgePointerSchema().safeParse(safeJsonParse(raw));
    if (!parsed.success) {
        (0, debug_js_1.logForDebugging)(`[bridge:pointer] invalid schema, clearing: ${path}`);
        await clearBridgePointer(dir);
        return null;
    }
    const ageMs = Math.max(0, Date.now() - mtimeMs);
    if (ageMs > exports.BRIDGE_POINTER_TTL_MS) {
        (0, debug_js_1.logForDebugging)(`[bridge:pointer] stale (>4h mtime), clearing: ${path}`);
        await clearBridgePointer(dir);
        return null;
    }
    return { ...parsed.data, ageMs };
}
/**
 * Worktree-aware read for `--continue`. The REPL bridge writes its pointer
 * to `getOriginalCwd()` which EnterWorktreeTool/activeWorktreeSession can
 * mutate to a worktree path — but `claude remote-control --continue` runs
 * with `resolve('.')` = shell CWD. This fans out across git worktree
 * siblings to find the freshest pointer, matching /resume's semantics.
 *
 * Fast path: checks `dir` first. Only shells out to `git worktree list` if
 * that misses — the common case (pointer in launch dir) is one stat, zero
 * exec. Fanout reads run in parallel; capped at MAX_WORKTREE_FANOUT.
 *
 * Returns the pointer AND the dir it was found in, so the caller can clear
 * the right file on resume failure.
 */
async function readBridgePointerAcrossWorktrees(dir) {
    // Fast path: current dir. Covers standalone bridge (always matches) and
    // REPL bridge when no worktree mutation happened.
    const here = await readBridgePointer(dir);
    if (here) {
        return { pointer: here, dir };
    }
    // Fanout: scan worktree siblings. getWorktreePathsPortable has a 5s
    // timeout and returns [] on any error (not a git repo, git not installed).
    const worktrees = await (0, getWorktreePathsPortable_js_1.getWorktreePathsPortable)(dir);
    if (worktrees.length <= 1)
        return null;
    if (worktrees.length > MAX_WORKTREE_FANOUT) {
        (0, debug_js_1.logForDebugging)(`[bridge:pointer] ${worktrees.length} worktrees exceeds fanout cap ${MAX_WORKTREE_FANOUT}, skipping`);
        return null;
    }
    // Dedupe against `dir` so we don't re-stat it. sanitizePath normalizes
    // case/separators so worktree-list output matches our fast-path key even
    // on Windows where git may emit C:/ vs stored c:/.
    const dirKey = (0, sessionStoragePortable_js_1.sanitizePath)(dir);
    const candidates = worktrees.filter(wt => (0, sessionStoragePortable_js_1.sanitizePath)(wt) !== dirKey);
    // Parallel stat+read. Each readBridgePointer is a stat() that ENOENTs
    // for worktrees with no pointer (cheap) plus a ~100-byte read for the
    // rare ones that have one. Promise.all → latency ≈ slowest single stat.
    const results = await Promise.all(candidates.map(async (wt) => {
        const p = await readBridgePointer(wt);
        return p ? { pointer: p, dir: wt } : null;
    }));
    // Pick freshest (lowest ageMs). The pointer stores environmentId so
    // resume reconnects to the right env regardless of which worktree
    // --continue was invoked from.
    let freshest = null;
    for (const r of results) {
        if (r && (!freshest || r.pointer.ageMs < freshest.pointer.ageMs)) {
            freshest = r;
        }
    }
    if (freshest) {
        (0, debug_js_1.logForDebugging)(`[bridge:pointer] fanout found pointer in worktree ${freshest.dir} (ageMs=${freshest.pointer.ageMs})`);
    }
    return freshest;
}
/**
 * Delete the pointer. Idempotent — ENOENT is expected when the process
 * shut down clean previously.
 */
async function clearBridgePointer(dir) {
    const path = getBridgePointerPath(dir);
    try {
        await (0, promises_1.unlink)(path);
        (0, debug_js_1.logForDebugging)(`[bridge:pointer] cleared ${path}`);
    }
    catch (err) {
        if (!(0, errors_js_1.isENOENT)(err)) {
            (0, debug_js_1.logForDebugging)(`[bridge:pointer] clear failed: ${err}`, {
                level: 'warn',
            });
        }
    }
}
function safeJsonParse(raw) {
    try {
        return (0, slowOperations_js_1.jsonParse)(raw);
    }
    catch {
        return null;
    }
}
