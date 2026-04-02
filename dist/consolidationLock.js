"use strict";
// Lock file whose mtime IS lastConsolidatedAt. Body is the holder's PID.
//
// Lives inside the memory dir (getAutoMemPath) so it keys on git-root
// like memory does, and so it's writable even when the memory path comes
// from an env/settings override whose parent may not be.
Object.defineProperty(exports, "__esModule", { value: true });
exports.readLastConsolidatedAt = readLastConsolidatedAt;
exports.tryAcquireConsolidationLock = tryAcquireConsolidationLock;
exports.rollbackConsolidationLock = rollbackConsolidationLock;
exports.listSessionsTouchedSince = listSessionsTouchedSince;
exports.recordConsolidation = recordConsolidation;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const state_js_1 = require("../../bootstrap/state.js");
const paths_js_1 = require("../../memdir/paths.js");
const debug_js_1 = require("../../utils/debug.js");
const genericProcessUtils_js_1 = require("../../utils/genericProcessUtils.js");
const listSessionsImpl_js_1 = require("../../utils/listSessionsImpl.js");
const sessionStorage_js_1 = require("../../utils/sessionStorage.js");
const LOCK_FILE = '.consolidate-lock';
// Stale past this even if the PID is live (PID reuse guard).
const HOLDER_STALE_MS = 60 * 60 * 1000;
function lockPath() {
    return (0, path_1.join)((0, paths_js_1.getAutoMemPath)(), LOCK_FILE);
}
/**
 * mtime of the lock file = lastConsolidatedAt. 0 if absent.
 * Per-turn cost: one stat.
 */
async function readLastConsolidatedAt() {
    try {
        const s = await (0, promises_1.stat)(lockPath());
        return s.mtimeMs;
    }
    catch {
        return 0;
    }
}
/**
 * Acquire: write PID → mtime = now. Returns the pre-acquire mtime
 * (for rollback), or null if blocked / lost a race.
 *
 *   Success → do nothing. mtime stays at now.
 *   Failure → rollbackConsolidationLock(priorMtime) rewinds mtime.
 *   Crash   → mtime stuck, dead PID → next process reclaims.
 */
async function tryAcquireConsolidationLock() {
    const path = lockPath();
    let mtimeMs;
    let holderPid;
    try {
        const [s, raw] = await Promise.all([(0, promises_1.stat)(path), (0, promises_1.readFile)(path, 'utf8')]);
        mtimeMs = s.mtimeMs;
        const parsed = parseInt(raw.trim(), 10);
        holderPid = Number.isFinite(parsed) ? parsed : undefined;
    }
    catch {
        // ENOENT — no prior lock.
    }
    if (mtimeMs !== undefined && Date.now() - mtimeMs < HOLDER_STALE_MS) {
        if (holderPid !== undefined && (0, genericProcessUtils_js_1.isProcessRunning)(holderPid)) {
            (0, debug_js_1.logForDebugging)(`[autoDream] lock held by live PID ${holderPid} (mtime ${Math.round((Date.now() - mtimeMs) / 1000)}s ago)`);
            return null;
        }
        // Dead PID or unparseable body — reclaim.
    }
    // Memory dir may not exist yet.
    await (0, promises_1.mkdir)((0, paths_js_1.getAutoMemPath)(), { recursive: true });
    await (0, promises_1.writeFile)(path, String(process.pid));
    // Two reclaimers both write → last wins the PID. Loser bails on re-read.
    let verify;
    try {
        verify = await (0, promises_1.readFile)(path, 'utf8');
    }
    catch {
        return null;
    }
    if (parseInt(verify.trim(), 10) !== process.pid)
        return null;
    return mtimeMs ?? 0;
}
/**
 * Rewind mtime to pre-acquire after a failed fork. Clears the PID body —
 * otherwise our still-running process would look like it's holding.
 * priorMtime 0 → unlink (restore no-file).
 */
async function rollbackConsolidationLock(priorMtime) {
    const path = lockPath();
    try {
        if (priorMtime === 0) {
            await (0, promises_1.unlink)(path);
            return;
        }
        await (0, promises_1.writeFile)(path, '');
        const t = priorMtime / 1000; // utimes wants seconds
        await (0, promises_1.utimes)(path, t, t);
    }
    catch (e) {
        (0, debug_js_1.logForDebugging)(`[autoDream] rollback failed: ${e.message} — next trigger delayed to minHours`);
    }
}
/**
 * Session IDs with mtime after sinceMs. listCandidates handles UUID
 * validation (excludes agent-*.jsonl) and parallel stat.
 *
 * Uses mtime (sessions TOUCHED since), not birthtime (0 on ext4).
 * Caller excludes the current session. Scans per-cwd transcripts — it's
 * a skip-gate, so undercounting worktree sessions is safe.
 */
async function listSessionsTouchedSince(sinceMs) {
    const dir = (0, sessionStorage_js_1.getProjectDir)((0, state_js_1.getOriginalCwd)());
    const candidates = await (0, listSessionsImpl_js_1.listCandidates)(dir, true);
    return candidates.filter(c => c.mtime > sinceMs).map(c => c.sessionId);
}
/**
 * Stamp from manual /dream. Optimistic — fires at prompt-build time,
 * no post-skill completion hook. Best-effort.
 */
async function recordConsolidation() {
    try {
        // Memory dir may not exist yet (manual /dream before any auto-trigger).
        await (0, promises_1.mkdir)((0, paths_js_1.getAutoMemPath)(), { recursive: true });
        await (0, promises_1.writeFile)(lockPath(), String(process.pid));
    }
    catch (e) {
        (0, debug_js_1.logForDebugging)(`[autoDream] recordConsolidation write failed: ${e.message}`);
    }
}
