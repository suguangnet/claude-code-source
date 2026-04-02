"use strict";
/**
 * Team Memory File Watcher
 *
 * Watches the team memory directory for changes and triggers
 * a debounced push to the server when files are modified.
 * Performs an initial pull on startup, then starts a directory-level
 * fs.watch so first-time writes to a fresh repo get picked up.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPermanentFailure = isPermanentFailure;
exports.startTeamMemoryWatcher = startTeamMemoryWatcher;
exports.notifyTeamMemoryWrite = notifyTeamMemoryWrite;
exports.stopTeamMemoryWatcher = stopTeamMemoryWatcher;
exports._resetWatcherStateForTesting = _resetWatcherStateForTesting;
exports._startFileWatcherForTesting = _startFileWatcherForTesting;
const bun_bundle_1 = require("bun:bundle");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const teamMemPaths_js_1 = require("../../memdir/teamMemPaths.js");
const cleanupRegistry_js_1 = require("../../utils/cleanupRegistry.js");
const debug_js_1 = require("../../utils/debug.js");
const errors_js_1 = require("../../utils/errors.js");
const git_js_1 = require("../../utils/git.js");
const index_js_1 = require("../analytics/index.js");
const index_js_2 = require("./index.js");
const DEBOUNCE_MS = 2000; // Wait 2s after last change before pushing
// ─── Watcher state ──────────────────────────────────────────
let watcher = null;
let debounceTimer = null;
let pushInProgress = false;
let hasPendingChanges = false;
let currentPushPromise = null;
let watcherStarted = false;
// Set after a push fails for a reason that can't self-heal on retry.
// Prevents watch events from other sessions' writes to the shared team
// dir driving an infinite retry loop (BQ Mar 14-16: one no_oauth device
// emitted 167K push events over 2.5 days). Cleared on unlink — file deletion
// is a recovery action for the too-many-entries case, and for no_oauth the
// suppression persisting until session restart is correct.
let pushSuppressedReason = null;
/**
 * Permanent = retry without user action will fail the same way.
 * - no_oauth / no_repo: pre-request client checks, no status code
 * - 4xx except 409/429: client error (404 missing repo, 413 too many
 *   entries, 403 permission). 409 is a transient conflict — server state
 *   changed under us, a fresh push after next pull can succeed. 429 is a
 *   rate limit — watcher-driven backoff is fine.
 */
function isPermanentFailure(r) {
    if (r.errorType === 'no_oauth' || r.errorType === 'no_repo')
        return true;
    if (r.httpStatus !== undefined &&
        r.httpStatus >= 400 &&
        r.httpStatus < 500 &&
        r.httpStatus !== 409 &&
        r.httpStatus !== 429) {
        return true;
    }
    return false;
}
// Sync state owned by the watcher — shared across all sync operations.
let syncState = null;
/**
 * Execute the push and track its lifecycle.
 * Push is read-only on disk (delta+probe, no merge writes), so no event
 * suppression is needed — edits arriving mid-push hit schedulePush() and
 * the debounce re-arms after this push completes.
 */
async function executePush() {
    if (!syncState) {
        return;
    }
    pushInProgress = true;
    try {
        const result = await (0, index_js_2.pushTeamMemory)(syncState);
        if (result.success) {
            hasPendingChanges = false;
        }
        if (result.success && result.filesUploaded > 0) {
            (0, debug_js_1.logForDebugging)(`team-memory-watcher: pushed ${result.filesUploaded} files`, { level: 'info' });
        }
        else if (!result.success) {
            (0, debug_js_1.logForDebugging)(`team-memory-watcher: push failed: ${result.error}`, {
                level: 'warn',
            });
            if (isPermanentFailure(result) && pushSuppressedReason === null) {
                pushSuppressedReason =
                    result.httpStatus !== undefined
                        ? `http_${result.httpStatus}`
                        : (result.errorType ?? 'unknown');
                (0, debug_js_1.logForDebugging)(`team-memory-watcher: suppressing retry until next unlink or session restart (${pushSuppressedReason})`, { level: 'warn' });
                (0, index_js_1.logEvent)('tengu_team_mem_push_suppressed', {
                    reason: pushSuppressedReason,
                    ...(result.httpStatus && { status: result.httpStatus }),
                });
            }
        }
    }
    catch (e) {
        (0, debug_js_1.logForDebugging)(`team-memory-watcher: push error: ${(0, errors_js_1.errorMessage)(e)}`, {
            level: 'warn',
        });
    }
    finally {
        pushInProgress = false;
        currentPushPromise = null;
    }
}
/**
 * Debounced push: waits for writes to settle, then pushes once.
 */
function schedulePush() {
    if (pushSuppressedReason !== null)
        return;
    hasPendingChanges = true;
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
        if (pushInProgress) {
            schedulePush();
            return;
        }
        currentPushPromise = executePush();
    }, DEBOUNCE_MS);
}
/**
 * Start watching the team memory directory for changes.
 *
 * Uses `fs.watch({recursive: true})` on the directory (not chokidar).
 * chokidar 4+ dropped fsevents, and Bun's `fs.watch` fallback uses kqueue,
 * which requires one open fd per watched file — with 500+ team memory files
 * that's 500+ permanently-held fds (confirmed via lsof + repro).
 *
 * `recursive: true` is required because team memory supports subdirs
 * (validateTeamMemKey, pushTeamMemory's walkDir). On macOS Bun uses
 * FSEvents for recursive — O(1) fds regardless of tree size (verified:
 * 2 fds for 60 files across 5 subdirs). On Linux inotify needs one watch
 * per directory — O(subdirs), still fine (team memory rarely nests).
 *
 * `fs.watch` on a directory doesn't distinguish add/change/unlink — all three
 * emit `rename`. To clear suppression on the too-many-entries recovery path
 * (user deletes files), we stat the filename on each event: ENOENT → treat as
 * unlink.  For `no_oauth` suppression this is correct: no_oauth users don't
 * delete team memory files to recover, they restart with auth.
 */
async function startFileWatcher(teamDir) {
    if (watcherStarted) {
        return;
    }
    watcherStarted = true;
    try {
        // pullTeamMemory returns early without creating the dir for fresh repos
        // with no server content (index.ts isEmpty path). mkdir with
        // recursive:true is idempotent — no existence check needed.
        await (0, promises_1.mkdir)(teamDir, { recursive: true });
        watcher = (0, fs_1.watch)(teamDir, { persistent: true, recursive: true }, (_eventType, filename) => {
            if (filename === null) {
                schedulePush();
                return;
            }
            if (pushSuppressedReason !== null) {
                // Suppression is only cleared by unlink (recovery action for
                // too-many-entries). fs.watch doesn't distinguish unlink from
                // add/write — stat to disambiguate. ENOENT → file gone → clear.
                void (0, promises_1.stat)((0, path_1.join)(teamDir, filename)).catch((err) => {
                    if (err.code !== 'ENOENT')
                        return;
                    if (pushSuppressedReason !== null) {
                        (0, debug_js_1.logForDebugging)(`team-memory-watcher: unlink cleared suppression (was: ${pushSuppressedReason})`, { level: 'info' });
                        pushSuppressedReason = null;
                    }
                    schedulePush();
                });
                return;
            }
            schedulePush();
        });
        watcher.on('error', err => {
            (0, debug_js_1.logForDebugging)(`team-memory-watcher: fs.watch error: ${(0, errors_js_1.errorMessage)(err)}`, { level: 'warn' });
        });
        (0, debug_js_1.logForDebugging)(`team-memory-watcher: watching ${teamDir}`, {
            level: 'debug',
        });
    }
    catch (err) {
        // fs.watch throws synchronously on ENOENT (race: dir deleted between
        // mkdir and watch) or EACCES. watcherStarted is already true above,
        // so notifyTeamMemoryWrite's explicit schedulePush path still works.
        (0, debug_js_1.logForDebugging)(`team-memory-watcher: failed to watch ${teamDir}: ${(0, errors_js_1.errorMessage)(err)}`, { level: 'warn' });
    }
    (0, cleanupRegistry_js_1.registerCleanup)(async () => stopTeamMemoryWatcher());
}
/**
 * Start the team memory sync system.
 *
 * Returns early (before creating any state) if:
 *   - TEAMMEM build flag is off
 *   - team memory is disabled (isTeamMemoryEnabled)
 *   - OAuth is not available (isTeamMemorySyncAvailable)
 *   - the current repo has no github.com remote
 *
 * The early github.com check prevents a noisy failure mode where the
 * watcher starts, it fires on local edits, and every push/pull
 * logs `errorType: no_repo` forever. Team memory is GitHub-scoped on
 * the server side, so non-github.com remotes can never sync anyway.
 *
 * Pulls from server, then starts the file watcher unconditionally.
 * The watcher must start even when the server has no content yet
 * (fresh EAP repo) — otherwise Claude's first team-memory write
 * depends entirely on PostToolUse hooks firing notifyTeamMemoryWrite,
 * which is a chicken-and-egg: Claude's write rate is low enough that
 * a fresh partner can sit in the bootstrap dead zone for days.
 */
async function startTeamMemoryWatcher() {
    if (!(0, bun_bundle_1.feature)('TEAMMEM')) {
        return;
    }
    if (!(0, teamMemPaths_js_1.isTeamMemoryEnabled)() || !(0, index_js_2.isTeamMemorySyncAvailable)()) {
        return;
    }
    const repoSlug = await (0, git_js_1.getGithubRepo)();
    if (!repoSlug) {
        (0, debug_js_1.logForDebugging)('team-memory-watcher: no github.com remote, skipping sync', { level: 'debug' });
        return;
    }
    syncState = (0, index_js_2.createSyncState)();
    // Initial pull from server (runs before the watcher starts, so its disk
    // writes won't trigger schedulePush)
    let initialPullSuccess = false;
    let initialFilesPulled = 0;
    let serverHasContent = false;
    try {
        const pullResult = await (0, index_js_2.pullTeamMemory)(syncState);
        initialPullSuccess = pullResult.success;
        serverHasContent = pullResult.entryCount > 0;
        if (pullResult.success && pullResult.filesWritten > 0) {
            initialFilesPulled = pullResult.filesWritten;
            (0, debug_js_1.logForDebugging)(`team-memory-watcher: initial pull got ${pullResult.filesWritten} files`, { level: 'info' });
        }
    }
    catch (e) {
        (0, debug_js_1.logForDebugging)(`team-memory-watcher: initial pull failed: ${(0, errors_js_1.errorMessage)(e)}`, { level: 'warn' });
    }
    // Always start the watcher. Watching an empty dir is cheap,
    // and the alternative (lazy start on notifyTeamMemoryWrite) creates
    // a bootstrap dead zone for fresh repos.
    await startFileWatcher((0, teamMemPaths_js_1.getTeamMemPath)());
    (0, index_js_1.logEvent)('tengu_team_mem_sync_started', {
        initial_pull_success: initialPullSuccess,
        initial_files_pulled: initialFilesPulled,
        // Kept for dashboard continuity; now always true when this event fires.
        watcher_started: true,
        server_has_content: serverHasContent,
    });
}
/**
 * Call this when a team memory file is written (e.g. from PostToolUse hooks).
 * Schedules a push explicitly in case fs.watch misses the write —
 * a file written in the same tick the watcher starts may not fire an
 * event, and some platforms coalesce rapid successive writes.
 * If the watcher does fire, the debounce timer just resets.
 */
async function notifyTeamMemoryWrite() {
    if (!syncState) {
        return;
    }
    schedulePush();
}
/**
 * Stop the file watcher and flush pending changes.
 * Note: runs within the 2s graceful shutdown budget, so the flush
 * is best-effort — if the HTTP PUT doesn't complete in time,
 * process.exit() will kill it.
 */
async function stopTeamMemoryWatcher() {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
    if (watcher) {
        watcher.close();
        watcher = null;
    }
    // Await any in-flight push
    if (currentPushPromise) {
        try {
            await currentPushPromise;
        }
        catch {
            // Ignore errors during shutdown
        }
    }
    // Flush pending changes that were debounced but not yet pushed
    if (hasPendingChanges && syncState && pushSuppressedReason === null) {
        try {
            await (0, index_js_2.pushTeamMemory)(syncState);
        }
        catch {
            // Best-effort — shutdown may kill this
        }
    }
}
/**
 * Test-only: reset module state and optionally seed syncState.
 * The feature('TEAMMEM') gate at the top of startTeamMemoryWatcher() is
 * always false in bun test, so tests can't set syncState through the normal
 * path. This helper lets tests drive notifyTeamMemoryWrite() /
 * stopTeamMemoryWatcher() directly.
 *
 * `skipWatcher: true` marks the watcher as already-started without actually
 * starting it. Tests that only exercise the schedulePush/flush path don't
 * need a real watcher.
 */
function _resetWatcherStateForTesting(opts) {
    watcher = null;
    debounceTimer = null;
    pushInProgress = false;
    hasPendingChanges = false;
    currentPushPromise = null;
    watcherStarted = opts?.skipWatcher ?? false;
    pushSuppressedReason = opts?.pushSuppressedReason ?? null;
    syncState = opts?.syncState ?? null;
}
/**
 * Test-only: start the real fs.watch on a specified directory.
 * Used by the fd-count regression test — startTeamMemoryWatcher() is gated
 * by feature('TEAMMEM') which is false under bun test.
 */
function _startFileWatcherForTesting(dir) {
    return startFileWatcher(dir);
}
