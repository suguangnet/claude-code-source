"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBridgeLogger = createBridgeLogger;
const chalk_1 = __importDefault(require("chalk"));
const qrcode_1 = require("qrcode");
const figures_js_1 = require("../constants/figures.js");
const stringWidth_js_1 = require("../ink/stringWidth.js");
const debug_js_1 = require("../utils/debug.js");
const bridgeStatusUtil_js_1 = require("./bridgeStatusUtil.js");
const QR_OPTIONS = {
    type: 'utf8',
    errorCorrectionLevel: 'L',
    small: true,
};
/** Generate a QR code and return its lines. */
async function generateQr(url) {
    const qr = await (0, qrcode_1.toString)(url, QR_OPTIONS);
    return qr.split('\n').filter((line) => line.length > 0);
}
function createBridgeLogger(options) {
    const write = options.write ?? ((s) => process.stdout.write(s));
    const verbose = options.verbose;
    // Track how many status lines are currently displayed at the bottom
    let statusLineCount = 0;
    // Status state machine
    let currentState = 'idle';
    let currentStateText = 'Ready';
    let repoName = '';
    let branch = '';
    let debugLogPath = '';
    // Connect URL (built in printBanner with correct base for staging/prod)
    let connectUrl = '';
    let cachedIngressUrl = '';
    let cachedEnvironmentId = '';
    let activeSessionUrl = null;
    // QR code lines for the current URL
    let qrLines = [];
    let qrVisible = false;
    // Tool activity for the second status line
    let lastToolSummary = null;
    let lastToolTime = 0;
    // Session count indicator (shown when multi-session mode is enabled)
    let sessionActive = 0;
    let sessionMax = 1;
    // Spawn mode shown in the session-count line + gates the `w` hint
    let spawnModeDisplay = null;
    let spawnMode = 'single-session';
    // Per-session display info for the multi-session bullet list (keyed by compat sessionId)
    const sessionDisplayInfo = new Map();
    // Connecting spinner state
    let connectingTimer = null;
    let connectingTick = 0;
    /**
     * Count how many visual terminal rows a string occupies, accounting for
     * line wrapping. Each `\n` is one row, and content wider than the terminal
     * wraps to additional rows.
     */
    function countVisualLines(text) {
        // eslint-disable-next-line custom-rules/prefer-use-terminal-size
        const cols = process.stdout.columns || 80; // non-React CLI context
        let count = 0;
        // Split on newlines to get logical lines
        for (const logical of text.split('\n')) {
            if (logical.length === 0) {
                // Empty segment between consecutive \n — counts as 1 row
                count++;
                continue;
            }
            const width = (0, stringWidth_js_1.stringWidth)(logical);
            count += Math.max(1, Math.ceil(width / cols));
        }
        // The trailing \n in "line\n" produces an empty last element — don't count it
        // because the cursor sits at the start of the next line, not a new visual row.
        if (text.endsWith('\n')) {
            count--;
        }
        return count;
    }
    /** Write a status line and track its visual line count. */
    function writeStatus(text) {
        write(text);
        statusLineCount += countVisualLines(text);
    }
    /** Clear any currently displayed status lines. */
    function clearStatusLines() {
        if (statusLineCount <= 0)
            return;
        (0, debug_js_1.logForDebugging)(`[bridge:ui] clearStatusLines count=${statusLineCount}`);
        // Move cursor up to the start of the status block, then erase everything below
        write(`\x1b[${statusLineCount}A`); // cursor up N lines
        write('\x1b[J'); // erase from cursor to end of screen
        statusLineCount = 0;
    }
    /** Print a permanent log line, clearing status first and restoring after. */
    function printLog(line) {
        clearStatusLines();
        write(line);
    }
    /** Regenerate the QR code with the given URL. */
    function regenerateQr(url) {
        generateQr(url)
            .then(lines => {
            qrLines = lines;
            renderStatusLine();
        })
            .catch(e => {
            (0, debug_js_1.logForDebugging)(`QR code generation failed: ${e}`, { level: 'error' });
        });
    }
    /** Render the connecting spinner line (shown before first updateIdleStatus). */
    function renderConnectingLine() {
        clearStatusLines();
        const frame = figures_js_1.BRIDGE_SPINNER_FRAMES[connectingTick % figures_js_1.BRIDGE_SPINNER_FRAMES.length];
        let suffix = '';
        if (repoName) {
            suffix += chalk_1.default.dim(' \u00b7 ') + chalk_1.default.dim(repoName);
        }
        if (branch) {
            suffix += chalk_1.default.dim(' \u00b7 ') + chalk_1.default.dim(branch);
        }
        writeStatus(`${chalk_1.default.yellow(frame)} ${chalk_1.default.yellow('Connecting')}${suffix}\n`);
    }
    /** Start the connecting spinner. Stopped by first updateIdleStatus(). */
    function startConnecting() {
        stopConnecting();
        renderConnectingLine();
        connectingTimer = setInterval(() => {
            connectingTick++;
            renderConnectingLine();
        }, 150);
    }
    /** Stop the connecting spinner. */
    function stopConnecting() {
        if (connectingTimer) {
            clearInterval(connectingTimer);
            connectingTimer = null;
        }
    }
    /** Render and write the current status lines based on state. */
    function renderStatusLine() {
        if (currentState === 'reconnecting' || currentState === 'failed') {
            // These states are handled separately (updateReconnectingStatus /
            // updateFailedStatus). Return before clearing so callers like toggleQr
            // and setSpawnModeDisplay don't blank the display during these states.
            return;
        }
        clearStatusLines();
        const isIdle = currentState === 'idle';
        // QR code above the status line
        if (qrVisible) {
            for (const line of qrLines) {
                writeStatus(`${chalk_1.default.dim(line)}\n`);
            }
        }
        // Determine indicator and colors based on state
        const indicator = figures_js_1.BRIDGE_READY_INDICATOR;
        const indicatorColor = isIdle ? chalk_1.default.green : chalk_1.default.cyan;
        const baseColor = isIdle ? chalk_1.default.green : chalk_1.default.cyan;
        const stateText = baseColor(currentStateText);
        // Build the suffix with repo and branch
        let suffix = '';
        if (repoName) {
            suffix += chalk_1.default.dim(' \u00b7 ') + chalk_1.default.dim(repoName);
        }
        // In worktree mode each session gets its own branch, so showing the
        // bridge's branch would be misleading.
        if (branch && spawnMode !== 'worktree') {
            suffix += chalk_1.default.dim(' \u00b7 ') + chalk_1.default.dim(branch);
        }
        if (process.env.USER_TYPE === 'ant' && debugLogPath) {
            writeStatus(`${chalk_1.default.yellow('[ANT-ONLY] Logs:')} ${chalk_1.default.dim(debugLogPath)}\n`);
        }
        writeStatus(`${indicatorColor(indicator)} ${stateText}${suffix}\n`);
        // Session count and per-session list (multi-session mode only)
        if (sessionMax > 1) {
            const modeHint = spawnMode === 'worktree'
                ? 'New sessions will be created in an isolated worktree'
                : 'New sessions will be created in the current directory';
            writeStatus(`    ${chalk_1.default.dim(`Capacity: ${sessionActive}/${sessionMax} \u00b7 ${modeHint}`)}\n`);
            for (const [, info] of sessionDisplayInfo) {
                const titleText = info.title
                    ? (0, bridgeStatusUtil_js_1.truncatePrompt)(info.title, 35)
                    : chalk_1.default.dim('Attached');
                const titleLinked = (0, bridgeStatusUtil_js_1.wrapWithOsc8Link)(titleText, info.url);
                const act = info.activity;
                const showAct = act && act.type !== 'result' && act.type !== 'error';
                const actText = showAct
                    ? chalk_1.default.dim(` ${(0, bridgeStatusUtil_js_1.truncatePrompt)(act.summary, 40)}`)
                    : '';
                writeStatus(`    ${titleLinked}${actText}
`);
            }
        }
        // Mode line for spawn modes with a single slot (or true single-session mode)
        if (sessionMax === 1) {
            const modeText = spawnMode === 'single-session'
                ? 'Single session \u00b7 exits when complete'
                : spawnMode === 'worktree'
                    ? `Capacity: ${sessionActive}/1 \u00b7 New sessions will be created in an isolated worktree`
                    : `Capacity: ${sessionActive}/1 \u00b7 New sessions will be created in the current directory`;
            writeStatus(`    ${chalk_1.default.dim(modeText)}\n`);
        }
        // Tool activity line for single-session mode
        if (sessionMax === 1 &&
            !isIdle &&
            lastToolSummary &&
            Date.now() - lastToolTime < bridgeStatusUtil_js_1.TOOL_DISPLAY_EXPIRY_MS) {
            writeStatus(`  ${chalk_1.default.dim((0, bridgeStatusUtil_js_1.truncatePrompt)(lastToolSummary, 60))}\n`);
        }
        // Blank line separator before footer
        const url = activeSessionUrl ?? connectUrl;
        if (url) {
            writeStatus('\n');
            const footerText = isIdle
                ? (0, bridgeStatusUtil_js_1.buildIdleFooterText)(url)
                : (0, bridgeStatusUtil_js_1.buildActiveFooterText)(url);
            const qrHint = qrVisible
                ? chalk_1.default.dim.italic('space to hide QR code')
                : chalk_1.default.dim.italic('space to show QR code');
            const toggleHint = spawnModeDisplay
                ? chalk_1.default.dim.italic(' \u00b7 w to toggle spawn mode')
                : '';
            writeStatus(`${chalk_1.default.dim(footerText)}\n`);
            writeStatus(`${qrHint}${toggleHint}\n`);
        }
    }
    return {
        printBanner(config, environmentId) {
            cachedIngressUrl = config.sessionIngressUrl;
            cachedEnvironmentId = environmentId;
            connectUrl = (0, bridgeStatusUtil_js_1.buildBridgeConnectUrl)(environmentId, cachedIngressUrl);
            regenerateQr(connectUrl);
            if (verbose) {
                write(chalk_1.default.dim(`Remote Control`) + ` v${MACRO.VERSION}\n`);
            }
            if (verbose) {
                if (config.spawnMode !== 'single-session') {
                    write(chalk_1.default.dim(`Spawn mode: `) + `${config.spawnMode}\n`);
                    write(chalk_1.default.dim(`Max concurrent sessions: `) + `${config.maxSessions}\n`);
                }
                write(chalk_1.default.dim(`Environment ID: `) + `${environmentId}\n`);
            }
            if (config.sandbox) {
                write(chalk_1.default.dim(`Sandbox: `) + `${chalk_1.default.green('Enabled')}\n`);
            }
            write('\n');
            // Start connecting spinner — first updateIdleStatus() will stop it
            startConnecting();
        },
        logSessionStart(sessionId, prompt) {
            if (verbose) {
                const short = (0, bridgeStatusUtil_js_1.truncatePrompt)(prompt, 80);
                printLog(chalk_1.default.dim(`[${(0, bridgeStatusUtil_js_1.timestamp)()}]`) +
                    ` Session started: ${chalk_1.default.white(`"${short}"`)} (${chalk_1.default.dim(sessionId)})\n`);
            }
        },
        logSessionComplete(sessionId, durationMs) {
            printLog(chalk_1.default.dim(`[${(0, bridgeStatusUtil_js_1.timestamp)()}]`) +
                ` Session ${chalk_1.default.green('completed')} (${(0, bridgeStatusUtil_js_1.formatDuration)(durationMs)}) ${chalk_1.default.dim(sessionId)}\n`);
        },
        logSessionFailed(sessionId, error) {
            printLog(chalk_1.default.dim(`[${(0, bridgeStatusUtil_js_1.timestamp)()}]`) +
                ` Session ${chalk_1.default.red('failed')}: ${error} ${chalk_1.default.dim(sessionId)}\n`);
        },
        logStatus(message) {
            printLog(chalk_1.default.dim(`[${(0, bridgeStatusUtil_js_1.timestamp)()}]`) + ` ${message}\n`);
        },
        logVerbose(message) {
            if (verbose) {
                printLog(chalk_1.default.dim(`[${(0, bridgeStatusUtil_js_1.timestamp)()}] ${message}`) + '\n');
            }
        },
        logError(message) {
            printLog(chalk_1.default.red(`[${(0, bridgeStatusUtil_js_1.timestamp)()}] Error: ${message}`) + '\n');
        },
        logReconnected(disconnectedMs) {
            printLog(chalk_1.default.dim(`[${(0, bridgeStatusUtil_js_1.timestamp)()}]`) +
                ` ${chalk_1.default.green('Reconnected')} after ${(0, bridgeStatusUtil_js_1.formatDuration)(disconnectedMs)}\n`);
        },
        setRepoInfo(repo, branchName) {
            repoName = repo;
            branch = branchName;
        },
        setDebugLogPath(path) {
            debugLogPath = path;
        },
        updateIdleStatus() {
            stopConnecting();
            currentState = 'idle';
            currentStateText = 'Ready';
            lastToolSummary = null;
            lastToolTime = 0;
            activeSessionUrl = null;
            regenerateQr(connectUrl);
            renderStatusLine();
        },
        setAttached(sessionId) {
            stopConnecting();
            currentState = 'attached';
            currentStateText = 'Connected';
            lastToolSummary = null;
            lastToolTime = 0;
            // Multi-session: keep footer/QR on the environment connect URL so users
            // can spawn more sessions. Per-session links are in the bullet list.
            if (sessionMax <= 1) {
                activeSessionUrl = (0, bridgeStatusUtil_js_1.buildBridgeSessionUrl)(sessionId, cachedEnvironmentId, cachedIngressUrl);
                regenerateQr(activeSessionUrl);
            }
            renderStatusLine();
        },
        updateReconnectingStatus(delayStr, elapsedStr) {
            stopConnecting();
            clearStatusLines();
            currentState = 'reconnecting';
            // QR code above the status line
            if (qrVisible) {
                for (const line of qrLines) {
                    writeStatus(`${chalk_1.default.dim(line)}\n`);
                }
            }
            const frame = figures_js_1.BRIDGE_SPINNER_FRAMES[connectingTick % figures_js_1.BRIDGE_SPINNER_FRAMES.length];
            connectingTick++;
            writeStatus(`${chalk_1.default.yellow(frame)} ${chalk_1.default.yellow('Reconnecting')} ${chalk_1.default.dim('\u00b7')} ${chalk_1.default.dim(`retrying in ${delayStr}`)} ${chalk_1.default.dim('\u00b7')} ${chalk_1.default.dim(`disconnected ${elapsedStr}`)}\n`);
        },
        updateFailedStatus(error) {
            stopConnecting();
            clearStatusLines();
            currentState = 'failed';
            let suffix = '';
            if (repoName) {
                suffix += chalk_1.default.dim(' \u00b7 ') + chalk_1.default.dim(repoName);
            }
            if (branch) {
                suffix += chalk_1.default.dim(' \u00b7 ') + chalk_1.default.dim(branch);
            }
            writeStatus(`${chalk_1.default.red(figures_js_1.BRIDGE_FAILED_INDICATOR)} ${chalk_1.default.red('Remote Control Failed')}${suffix}\n`);
            writeStatus(`${chalk_1.default.dim(bridgeStatusUtil_js_1.FAILED_FOOTER_TEXT)}\n`);
            if (error) {
                writeStatus(`${chalk_1.default.red(error)}\n`);
            }
        },
        updateSessionStatus(_sessionId, _elapsed, activity, _trail) {
            // Cache tool activity for the second status line
            if (activity.type === 'tool_start') {
                lastToolSummary = activity.summary;
                lastToolTime = Date.now();
            }
            renderStatusLine();
        },
        clearStatus() {
            stopConnecting();
            clearStatusLines();
        },
        toggleQr() {
            qrVisible = !qrVisible;
            renderStatusLine();
        },
        updateSessionCount(active, max, mode) {
            if (sessionActive === active && sessionMax === max && spawnMode === mode)
                return;
            sessionActive = active;
            sessionMax = max;
            spawnMode = mode;
            // Don't re-render here — the status ticker calls renderStatusLine
            // on its own cadence, and the next tick will pick up the new values.
        },
        setSpawnModeDisplay(mode) {
            if (spawnModeDisplay === mode)
                return;
            spawnModeDisplay = mode;
            // Also sync the #21118-added spawnMode so the next render shows correct
            // mode hint + branch visibility. Don't render here — matches
            // updateSessionCount: called before printBanner (initial setup) and
            // again from the `w` handler (which follows with refreshDisplay).
            if (mode)
                spawnMode = mode;
        },
        addSession(sessionId, url) {
            sessionDisplayInfo.set(sessionId, { url });
        },
        updateSessionActivity(sessionId, activity) {
            const info = sessionDisplayInfo.get(sessionId);
            if (!info)
                return;
            info.activity = activity;
        },
        setSessionTitle(sessionId, title) {
            const info = sessionDisplayInfo.get(sessionId);
            if (!info)
                return;
            info.title = title;
            // Guard against reconnecting/failed — renderStatusLine clears then returns
            // early for those states, which would erase the spinner/error.
            if (currentState === 'reconnecting' || currentState === 'failed')
                return;
            if (sessionMax === 1) {
                // Single-session: show title in the main status line too.
                currentState = 'titled';
                currentStateText = (0, bridgeStatusUtil_js_1.truncatePrompt)(title, 40);
            }
            renderStatusLine();
        },
        removeSession(sessionId) {
            sessionDisplayInfo.delete(sessionId);
        },
        refreshDisplay() {
            // Skip during reconnecting/failed — renderStatusLine clears then returns
            // early for those states, which would erase the spinner/error.
            if (currentState === 'reconnecting' || currentState === 'failed')
                return;
            renderStatusLine();
        },
    };
}
