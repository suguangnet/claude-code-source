"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isBgSession = isBgSession;
exports.registerSession = registerSession;
exports.updateSessionName = updateSessionName;
exports.updateSessionBridgeId = updateSessionBridgeId;
exports.updateSessionActivity = updateSessionActivity;
exports.countConcurrentSessions = countConcurrentSessions;
const bun_bundle_1 = require("bun:bundle");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const state_js_1 = require("../bootstrap/state.js");
const cleanupRegistry_js_1 = require("./cleanupRegistry.js");
const debug_js_1 = require("./debug.js");
const envUtils_js_1 = require("./envUtils.js");
const errors_js_1 = require("./errors.js");
const genericProcessUtils_js_1 = require("./genericProcessUtils.js");
const platform_js_1 = require("./platform.js");
const slowOperations_js_1 = require("./slowOperations.js");
const teammate_js_1 = require("./teammate.js");
function getSessionsDir() {
    return (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), 'sessions');
}
/**
 * Kind override from env. Set by the spawner (`claude --bg`, daemon
 * supervisor) so the child can register without the parent having to
 * write the file for it — cleanup-on-exit wiring then works for free.
 * Gated so the env-var string is DCE'd from external builds.
 */
function envSessionKind() {
    if ((0, bun_bundle_1.feature)('BG_SESSIONS')) {
        const k = process.env.CLAUDE_CODE_SESSION_KIND;
        if (k === 'bg' || k === 'daemon' || k === 'daemon-worker')
            return k;
    }
    return undefined;
}
/**
 * True when this REPL is running inside a `claude --bg` tmux session.
 * Exit paths (/exit, ctrl+c, ctrl+d) should detach the attached client
 * instead of killing the process.
 */
function isBgSession() {
    return envSessionKind() === 'bg';
}
/**
 * Write a PID file for this session and register cleanup.
 *
 * Registers all top-level sessions — interactive CLI, SDK (vscode, desktop,
 * typescript, python, -p), bg/daemon spawns — so `claude ps` sees everything
 * the user might be running. Skips only teammates/subagents, which would
 * conflate swarm usage with genuine concurrency and pollute ps with noise.
 *
 * Returns true if registered, false if skipped.
 * Errors logged to debug, never thrown.
 */
async function registerSession() {
    if ((0, teammate_js_1.getAgentId)() != null)
        return false;
    const kind = envSessionKind() ?? 'interactive';
    const dir = getSessionsDir();
    const pidFile = (0, path_1.join)(dir, `${process.pid}.json`);
    (0, cleanupRegistry_js_1.registerCleanup)(async () => {
        try {
            await (0, promises_1.unlink)(pidFile);
        }
        catch {
            // ENOENT is fine (already deleted or never written)
        }
    });
    try {
        await (0, promises_1.mkdir)(dir, { recursive: true, mode: 0o700 });
        await (0, promises_1.chmod)(dir, 0o700);
        await (0, promises_1.writeFile)(pidFile, (0, slowOperations_js_1.jsonStringify)({
            pid: process.pid,
            sessionId: (0, state_js_1.getSessionId)(),
            cwd: (0, state_js_1.getOriginalCwd)(),
            startedAt: Date.now(),
            kind,
            entrypoint: process.env.CLAUDE_CODE_ENTRYPOINT,
            ...((0, bun_bundle_1.feature)('UDS_INBOX')
                ? { messagingSocketPath: process.env.CLAUDE_CODE_MESSAGING_SOCKET }
                : {}),
            ...((0, bun_bundle_1.feature)('BG_SESSIONS')
                ? {
                    name: process.env.CLAUDE_CODE_SESSION_NAME,
                    logPath: process.env.CLAUDE_CODE_SESSION_LOG,
                    agent: process.env.CLAUDE_CODE_AGENT,
                }
                : {}),
        }));
        // --resume / /resume mutates getSessionId() via switchSession. Without
        // this, the PID file's sessionId goes stale and `claude ps` sparkline
        // reads the wrong transcript.
        (0, state_js_1.onSessionSwitch)(id => {
            void updatePidFile({ sessionId: id });
        });
        return true;
    }
    catch (e) {
        (0, debug_js_1.logForDebugging)(`[concurrentSessions] register failed: ${(0, errors_js_1.errorMessage)(e)}`);
        return false;
    }
}
/**
 * Update this session's name in its PID registry file so ListPeers
 * can surface it. Best-effort: silently no-op if name is falsy, the
 * file doesn't exist (session not registered), or read/write fails.
 */
async function updatePidFile(patch) {
    const pidFile = (0, path_1.join)(getSessionsDir(), `${process.pid}.json`);
    try {
        const data = (0, slowOperations_js_1.jsonParse)(await (0, promises_1.readFile)(pidFile, 'utf8'));
        await (0, promises_1.writeFile)(pidFile, (0, slowOperations_js_1.jsonStringify)({ ...data, ...patch }));
    }
    catch (e) {
        (0, debug_js_1.logForDebugging)(`[concurrentSessions] updatePidFile failed: ${(0, errors_js_1.errorMessage)(e)}`);
    }
}
async function updateSessionName(name) {
    if (!name)
        return;
    await updatePidFile({ name });
}
/**
 * Record this session's Remote Control session ID so peer enumeration can
 * dedup: a session reachable over both UDS and bridge should only appear
 * once (local wins). Cleared on bridge teardown so stale IDs don't
 * suppress a legitimately-remote session after reconnect.
 */
async function updateSessionBridgeId(bridgeSessionId) {
    await updatePidFile({ bridgeSessionId });
}
/**
 * Push live activity state for `claude ps`. Fire-and-forget from REPL's
 * status-change effect — a dropped write just means ps falls back to
 * transcript-tail derivation for one refresh.
 */
async function updateSessionActivity(patch) {
    if (!(0, bun_bundle_1.feature)('BG_SESSIONS'))
        return;
    await updatePidFile({ ...patch, updatedAt: Date.now() });
}
/**
 * Count live concurrent CLI sessions (including this one).
 * Filters out stale PID files (crashed sessions) and deletes them.
 * Returns 0 on any error (conservative).
 */
async function countConcurrentSessions() {
    const dir = getSessionsDir();
    let files;
    try {
        files = await (0, promises_1.readdir)(dir);
    }
    catch (e) {
        if (!(0, errors_js_1.isFsInaccessible)(e)) {
            (0, debug_js_1.logForDebugging)(`[concurrentSessions] readdir failed: ${(0, errors_js_1.errorMessage)(e)}`);
        }
        return 0;
    }
    let count = 0;
    for (const file of files) {
        // Strict filename guard: only `<pid>.json` is a candidate. parseInt's
        // lenient prefix-parsing means `2026-03-14_notes.md` would otherwise
        // parse as PID 2026 and get swept as stale — silent user data loss.
        // See anthropics/claude-code#34210.
        if (!/^\d+\.json$/.test(file))
            continue;
        const pid = parseInt(file.slice(0, -5), 10);
        if (pid === process.pid) {
            count++;
            continue;
        }
        if ((0, genericProcessUtils_js_1.isProcessRunning)(pid)) {
            count++;
        }
        else if ((0, platform_js_1.getPlatform)() !== 'wsl') {
            // Stale file from a crashed session — sweep it. Skip on WSL: if
            // ~/.claude/sessions/ is shared with Windows-native Claude (symlink
            // or CLAUDE_CONFIG_DIR), a Windows PID won't be probeable from WSL
            // and we'd falsely delete a live session's file. This is just
            // telemetry so conservative undercount is acceptable.
            void (0, promises_1.unlink)((0, path_1.join)(dir, file)).catch(() => { });
        }
    }
    return count;
}
