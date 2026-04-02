"use strict";
/**
 * Built-in terminal panel toggled with Meta+J.
 *
 * Uses tmux for shell persistence: a separate tmux server with a per-instance
 * socket (e.g., "claude-panel-a1b2c3d4") holds the shell session. Each Claude
 * Code instance gets its own isolated terminal panel that persists within the
 * session but is destroyed when the instance exits.
 *
 * Meta+J is bound to detach-client inside tmux, so pressing it returns to
 * Claude Code while the shell keeps running. Next toggle re-attaches to the
 * same session.
 *
 * When tmux is not available, falls back to a non-persistent shell via spawnSync.
 *
 * Uses the same suspend-Ink pattern as the external editor (promptEditor.ts).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTerminalPanelSocket = getTerminalPanelSocket;
exports.getTerminalPanel = getTerminalPanel;
const child_process_1 = require("child_process");
const state_js_1 = require("../bootstrap/state.js");
const instances_js_1 = __importDefault(require("../ink/instances.js"));
const cleanupRegistry_js_1 = require("./cleanupRegistry.js");
const cwd_js_1 = require("./cwd.js");
const debug_js_1 = require("./debug.js");
const TMUX_SESSION = 'panel';
/**
 * Get the tmux socket name for the terminal panel.
 * Uses a unique socket per Claude Code instance (based on session ID)
 * so that each instance has its own isolated terminal panel.
 */
function getTerminalPanelSocket() {
    // Use first 8 chars of session UUID for uniqueness while keeping name short
    const sessionId = (0, state_js_1.getSessionId)();
    return `claude-panel-${sessionId.slice(0, 8)}`;
}
let instance;
/**
 * Return the singleton TerminalPanel, creating it lazily on first use.
 */
function getTerminalPanel() {
    if (!instance) {
        instance = new TerminalPanel();
    }
    return instance;
}
class TerminalPanel {
    constructor() {
        this.cleanupRegistered = false;
    }
    // ── public API ────────────────────────────────────────────────────
    toggle() {
        this.showShell();
    }
    // ── tmux helpers ──────────────────────────────────────────────────
    checkTmux() {
        if (this.hasTmux !== undefined)
            return this.hasTmux;
        const result = (0, child_process_1.spawnSync)('tmux', ['-V'], { encoding: 'utf-8' });
        this.hasTmux = result.status === 0;
        if (!this.hasTmux) {
            (0, debug_js_1.logForDebugging)('Terminal panel: tmux not found, falling back to non-persistent shell');
        }
        return this.hasTmux;
    }
    hasSession() {
        const result = (0, child_process_1.spawnSync)('tmux', ['-L', getTerminalPanelSocket(), 'has-session', '-t', TMUX_SESSION], { encoding: 'utf-8' });
        return result.status === 0;
    }
    createSession() {
        const shell = process.env.SHELL || '/bin/bash';
        const cwd = (0, cwd_js_1.pwd)();
        const socket = getTerminalPanelSocket();
        const result = (0, child_process_1.spawnSync)('tmux', [
            '-L',
            socket,
            'new-session',
            '-d',
            '-s',
            TMUX_SESSION,
            '-c',
            cwd,
            shell,
            '-l',
        ], { encoding: 'utf-8' });
        if (result.status !== 0) {
            (0, debug_js_1.logForDebugging)(`Terminal panel: failed to create tmux session: ${result.stderr}`);
            return false;
        }
        // Bind Meta+J (toggles back to Claude Code from inside the terminal)
        // and configure the status bar hint. Chained with ';' to collapse
        // 5 spawnSync calls into 1.
        // biome-ignore format: one tmux command per line
        (0, child_process_1.spawnSync)('tmux', [
            '-L', socket,
            'bind-key', '-n', 'M-j', 'detach-client', ';',
            'set-option', '-g', 'status-style', 'bg=default', ';',
            'set-option', '-g', 'status-left', '', ';',
            'set-option', '-g', 'status-right', ' Alt+J to return to Claude ', ';',
            'set-option', '-g', 'status-right-style', 'fg=brightblack',
        ]);
        if (!this.cleanupRegistered) {
            this.cleanupRegistered = true;
            (0, cleanupRegistry_js_1.registerCleanup)(async () => {
                // Detached async spawn — spawnSync here would block the event loop
                // and serialize the entire cleanup Promise.all in gracefulShutdown.
                // .on('error') swallows ENOENT if tmux disappears between session
                // creation and cleanup — prevents spurious uncaughtException noise.
                (0, child_process_1.spawn)('tmux', ['-L', socket, 'kill-server'], {
                    detached: true,
                    stdio: 'ignore',
                })
                    .on('error', () => { })
                    .unref();
            });
        }
        return true;
    }
    attachSession() {
        (0, child_process_1.spawnSync)('tmux', ['-L', getTerminalPanelSocket(), 'attach-session', '-t', TMUX_SESSION], { stdio: 'inherit' });
    }
    // ── show shell ────────────────────────────────────────────────────
    showShell() {
        const inkInstance = instances_js_1.default.get(process.stdout);
        if (!inkInstance) {
            (0, debug_js_1.logForDebugging)('Terminal panel: no Ink instance found, aborting');
            return;
        }
        inkInstance.enterAlternateScreen();
        try {
            if (this.checkTmux() && this.ensureSession()) {
                this.attachSession();
            }
            else {
                this.runShellDirect();
            }
        }
        finally {
            inkInstance.exitAlternateScreen();
        }
    }
    // ── helpers ───────────────────────────────────────────────────────
    /** Ensure a tmux session exists, creating one if needed. */
    ensureSession() {
        if (this.hasSession())
            return true;
        return this.createSession();
    }
    /** Fallback when tmux is not available — runs a non-persistent shell. */
    runShellDirect() {
        const shell = process.env.SHELL || '/bin/bash';
        const cwd = (0, cwd_js_1.pwd)();
        (0, child_process_1.spawnSync)(shell, ['-i', '-l'], {
            stdio: 'inherit',
            cwd,
            env: process.env,
        });
    }
}
