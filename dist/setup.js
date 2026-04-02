"use strict";
/* eslint-disable custom-rules/no-process-exit */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setup = setup;
const bun_bundle_1 = require("bun:bundle");
const chalk_1 = __importDefault(require("chalk"));
const index_js_1 = require("src/services/analytics/index.js");
const cwd_js_1 = require("src/utils/cwd.js");
const releaseNotes_js_1 = require("src/utils/releaseNotes.js");
const Shell_js_1 = require("src/utils/Shell.js");
const sinks_js_1 = require("src/utils/sinks.js");
const state_js_1 = require("./bootstrap/state.js");
const commands_js_1 = require("./commands.js");
const sessionMemory_js_1 = require("./services/SessionMemory/sessionMemory.js");
const ids_js_1 = require("./types/ids.js");
const agentSwarmsEnabled_js_1 = require("./utils/agentSwarmsEnabled.js");
const appleTerminalBackup_js_1 = require("./utils/appleTerminalBackup.js");
const auth_js_1 = require("./utils/auth.js");
const claudemd_js_1 = require("./utils/claudemd.js");
const config_js_1 = require("./utils/config.js");
const diagLogs_js_1 = require("./utils/diagLogs.js");
const env_js_1 = require("./utils/env.js");
const envDynamic_js_1 = require("./utils/envDynamic.js");
const envUtils_js_1 = require("./utils/envUtils.js");
const errors_js_1 = require("./utils/errors.js");
const git_js_1 = require("./utils/git.js");
const fileChangedWatcher_js_1 = require("./utils/hooks/fileChangedWatcher.js");
const hooksConfigSnapshot_js_1 = require("./utils/hooks/hooksConfigSnapshot.js");
const hooks_js_1 = require("./utils/hooks.js");
const iTermBackup_js_1 = require("./utils/iTermBackup.js");
const log_js_1 = require("./utils/log.js");
const logoV2Utils_js_1 = require("./utils/logoV2Utils.js");
const index_js_2 = require("./utils/nativeInstaller/index.js");
const plans_js_1 = require("./utils/plans.js");
const sessionStorage_js_1 = require("./utils/sessionStorage.js");
const startupProfiler_js_1 = require("./utils/startupProfiler.js");
const worktree_js_1 = require("./utils/worktree.js");
async function setup(cwd, permissionMode, allowDangerouslySkipPermissions, worktreeEnabled, worktreeName, tmuxEnabled, customSessionId, worktreePRNumber, messagingSocketPath) {
    (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'setup_started');
    // Check for Node.js version < 18
    const nodeVersion = process.version.match(/^v(\d+)\./)?.[1];
    if (!nodeVersion || parseInt(nodeVersion) < 18) {
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.error(chalk_1.default.bold.red('Error: Claude Code requires Node.js version 18 or higher.'));
        process.exit(1);
    }
    // Set custom session ID if provided
    if (customSessionId) {
        (0, state_js_1.switchSession)((0, ids_js_1.asSessionId)(customSessionId));
    }
    // --bare / SIMPLE: skip UDS messaging server and teammate snapshot.
    // Scripted calls don't receive injected messages and don't use swarm teammates.
    // Explicit --messaging-socket-path is the escape hatch (per #23222 gate pattern).
    if (!(0, envUtils_js_1.isBareMode)() || messagingSocketPath !== undefined) {
        // Start UDS messaging server (Mac/Linux only).
        // Enabled by default for ants — creates a socket in tmpdir if no
        // --messaging-socket-path is passed. Awaited so the server is bound
        // and $CLAUDE_CODE_MESSAGING_SOCKET is exported before any hook
        // (SessionStart in particular) can spawn and snapshot process.env.
        if ((0, bun_bundle_1.feature)('UDS_INBOX')) {
            const m = await Promise.resolve().then(() => __importStar(require('./utils/udsMessaging.js')));
            await m.startUdsMessaging(messagingSocketPath ?? m.getDefaultUdsSocketPath(), { isExplicit: messagingSocketPath !== undefined });
        }
    }
    // Teammate snapshot — SIMPLE-only gate (no escape hatch, swarm not used in bare)
    if (!(0, envUtils_js_1.isBareMode)() && (0, agentSwarmsEnabled_js_1.isAgentSwarmsEnabled)()) {
        const { captureTeammateModeSnapshot } = await Promise.resolve().then(() => __importStar(require('./utils/swarm/backends/teammateModeSnapshot.js')));
        captureTeammateModeSnapshot();
    }
    // Terminal backup restoration — interactive only. Print mode doesn't
    // interact with terminal settings; the next interactive session will
    // detect and restore any interrupted setup.
    if (!(0, state_js_1.getIsNonInteractiveSession)()) {
        // iTerm2 backup check only when swarms enabled
        if ((0, agentSwarmsEnabled_js_1.isAgentSwarmsEnabled)()) {
            const restoredIterm2Backup = await (0, iTermBackup_js_1.checkAndRestoreITerm2Backup)();
            if (restoredIterm2Backup.status === 'restored') {
                // biome-ignore lint/suspicious/noConsole:: intentional console output
                console.log(chalk_1.default.yellow('Detected an interrupted iTerm2 setup. Your original settings have been restored. You may need to restart iTerm2 for the changes to take effect.'));
            }
            else if (restoredIterm2Backup.status === 'failed') {
                // biome-ignore lint/suspicious/noConsole:: intentional console output
                console.error(chalk_1.default.red(`Failed to restore iTerm2 settings. Please manually restore your original settings with: defaults import com.googlecode.iterm2 ${restoredIterm2Backup.backupPath}.`));
            }
        }
        // Check and restore Terminal.app backup if setup was interrupted
        try {
            const restoredTerminalBackup = await (0, appleTerminalBackup_js_1.checkAndRestoreTerminalBackup)();
            if (restoredTerminalBackup.status === 'restored') {
                // biome-ignore lint/suspicious/noConsole:: intentional console output
                console.log(chalk_1.default.yellow('Detected an interrupted Terminal.app setup. Your original settings have been restored. You may need to restart Terminal.app for the changes to take effect.'));
            }
            else if (restoredTerminalBackup.status === 'failed') {
                // biome-ignore lint/suspicious/noConsole:: intentional console output
                console.error(chalk_1.default.red(`Failed to restore Terminal.app settings. Please manually restore your original settings with: defaults import com.apple.Terminal ${restoredTerminalBackup.backupPath}.`));
            }
        }
        catch (error) {
            // Log but don't crash if Terminal.app backup restoration fails
            (0, log_js_1.logError)(error);
        }
    }
    // IMPORTANT: setCwd() must be called before any other code that depends on the cwd
    (0, Shell_js_1.setCwd)(cwd);
    // Capture hooks configuration snapshot to avoid hidden hook modifications.
    // IMPORTANT: Must be called AFTER setCwd() so hooks are loaded from the correct directory
    const hooksStart = Date.now();
    (0, hooksConfigSnapshot_js_1.captureHooksConfigSnapshot)();
    (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'setup_hooks_captured', {
        duration_ms: Date.now() - hooksStart,
    });
    // Initialize FileChanged hook watcher — sync, reads hook config snapshot
    (0, fileChangedWatcher_js_1.initializeFileChangedWatcher)(cwd);
    // Handle worktree creation if requested
    // IMPORTANT: this must be called befiore getCommands(), otherwise /eject won't be available.
    if (worktreeEnabled) {
        // Mirrors bridgeMain.ts: hook-configured sessions can proceed without git
        // so createWorktreeForSession() can delegate to the hook (non-git VCS).
        const hasHook = (0, hooks_js_1.hasWorktreeCreateHook)();
        const inGit = await (0, git_js_1.getIsGit)();
        if (!hasHook && !inGit) {
            process.stderr.write(chalk_1.default.red(`Error: Can only use --worktree in a git repository, but ${chalk_1.default.bold(cwd)} is not a git repository. ` +
                `Configure a WorktreeCreate hook in settings.json to use --worktree with other VCS systems.\n`));
            process.exit(1);
        }
        const slug = worktreePRNumber
            ? `pr-${worktreePRNumber}`
            : (worktreeName ?? (0, plans_js_1.getPlanSlug)());
        // Git preamble runs whenever we're in a git repo — even if a hook is
        // configured — so --tmux keeps working for git users who also have a
        // WorktreeCreate hook. Only hook-only (non-git) mode skips it.
        let tmuxSessionName;
        if (inGit) {
            // Resolve to main repo root (handles being invoked from within a worktree).
            // findCanonicalGitRoot is sync/filesystem-only/memoized; the underlying
            // findGitRoot cache was already warmed by getIsGit() above, so this is ~free.
            const mainRepoRoot = (0, git_js_1.findCanonicalGitRoot)((0, cwd_js_1.getCwd)());
            if (!mainRepoRoot) {
                process.stderr.write(chalk_1.default.red(`Error: Could not determine the main git repository root.\n`));
                process.exit(1);
            }
            // If we're inside a worktree, switch to the main repo for worktree creation
            if (mainRepoRoot !== ((0, git_js_1.findGitRoot)((0, cwd_js_1.getCwd)()) ?? (0, cwd_js_1.getCwd)())) {
                (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'worktree_resolved_to_main_repo');
                process.chdir(mainRepoRoot);
                (0, Shell_js_1.setCwd)(mainRepoRoot);
            }
            tmuxSessionName = tmuxEnabled
                ? (0, worktree_js_1.generateTmuxSessionName)(mainRepoRoot, (0, worktree_js_1.worktreeBranchName)(slug))
                : undefined;
        }
        else {
            // Non-git hook mode: no canonical root to resolve, so name the tmux
            // session from cwd — generateTmuxSessionName only basenames the path.
            tmuxSessionName = tmuxEnabled
                ? (0, worktree_js_1.generateTmuxSessionName)((0, cwd_js_1.getCwd)(), (0, worktree_js_1.worktreeBranchName)(slug))
                : undefined;
        }
        let worktreeSession;
        try {
            worktreeSession = await (0, worktree_js_1.createWorktreeForSession)((0, state_js_1.getSessionId)(), slug, tmuxSessionName, worktreePRNumber ? { prNumber: worktreePRNumber } : undefined);
        }
        catch (error) {
            process.stderr.write(chalk_1.default.red(`Error creating worktree: ${(0, errors_js_1.errorMessage)(error)}\n`));
            process.exit(1);
        }
        (0, index_js_1.logEvent)('tengu_worktree_created', { tmux_enabled: tmuxEnabled });
        // Create tmux session for the worktree if enabled
        if (tmuxEnabled && tmuxSessionName) {
            const tmuxResult = await (0, worktree_js_1.createTmuxSessionForWorktree)(tmuxSessionName, worktreeSession.worktreePath);
            if (tmuxResult.created) {
                // biome-ignore lint/suspicious/noConsole:: intentional console output
                console.log(chalk_1.default.green(`Created tmux session: ${chalk_1.default.bold(tmuxSessionName)}\nTo attach: ${chalk_1.default.bold(`tmux attach -t ${tmuxSessionName}`)}`));
            }
            else {
                // biome-ignore lint/suspicious/noConsole:: intentional console output
                console.error(chalk_1.default.yellow(`Warning: Failed to create tmux session: ${tmuxResult.error}`));
            }
        }
        process.chdir(worktreeSession.worktreePath);
        (0, Shell_js_1.setCwd)(worktreeSession.worktreePath);
        (0, state_js_1.setOriginalCwd)((0, cwd_js_1.getCwd)());
        // --worktree means the worktree IS the session's project, so skills/hooks/
        // cron/etc. should resolve here. (EnterWorktreeTool mid-session does NOT
        // touch projectRoot — that's a throwaway worktree, project stays stable.)
        (0, state_js_1.setProjectRoot)((0, cwd_js_1.getCwd)());
        (0, sessionStorage_js_1.saveWorktreeState)(worktreeSession);
        // Clear memory files cache since originalCwd has changed
        (0, claudemd_js_1.clearMemoryFileCaches)();
        // Settings cache was populated in init() (via applySafeConfigEnvironmentVariables)
        // and again at captureHooksConfigSnapshot() above, both from the original dir's
        // .claude/settings.json. Re-read from the worktree and re-capture hooks.
        (0, hooksConfigSnapshot_js_1.updateHooksConfigSnapshot)();
    }
    // Background jobs - only critical registrations that must happen before first query
    (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'setup_background_jobs_starting');
    // Bundled skills/plugins are registered in main.tsx before the parallel
    // getCommands() kick — see comment there. Moved out of setup() because
    // the await points above (startUdsMessaging, ~20ms) meant getCommands()
    // raced ahead and memoized an empty bundledSkills list.
    if (!(0, envUtils_js_1.isBareMode)()) {
        (0, sessionMemory_js_1.initSessionMemory)(); // Synchronous - registers hook, gate check happens lazily
        if ((0, bun_bundle_1.feature)('CONTEXT_COLLAPSE')) {
            /* eslint-disable @typescript-eslint/no-require-imports */
            ;
            require('./services/contextCollapse/index.js').initContextCollapse();
            /* eslint-enable @typescript-eslint/no-require-imports */
        }
    }
    void (0, index_js_2.lockCurrentVersion)(); // Lock current version to prevent deletion by other processes
    (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'setup_background_jobs_launched');
    (0, startupProfiler_js_1.profileCheckpoint)('setup_before_prefetch');
    // Pre-fetch promises - only items needed before render
    (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'setup_prefetch_starting');
    // When CLAUDE_CODE_SYNC_PLUGIN_INSTALL is set, skip all plugin prefetch.
    // The sync install path in print.ts calls refreshPluginState() after
    // installing, which reloads commands, hooks, and agents. Prefetching here
    // races with the install (concurrent copyPluginToVersionedCache / cachePlugin
    // on the same directories), and the hot-reload handler fires clearPluginCache()
    // mid-install when policySettings arrives.
    const skipPluginPrefetch = ((0, state_js_1.getIsNonInteractiveSession)() &&
        (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_SYNC_PLUGIN_INSTALL)) ||
        // --bare: loadPluginHooks → loadAllPlugins is filesystem work that's
        // wasted when executeHooks early-returns under --bare anyway.
        (0, envUtils_js_1.isBareMode)();
    if (!skipPluginPrefetch) {
        void (0, commands_js_1.getCommands)((0, state_js_1.getProjectRoot)());
    }
    void Promise.resolve().then(() => __importStar(require('./utils/plugins/loadPluginHooks.js'))).then(m => {
        if (!skipPluginPrefetch) {
            void m.loadPluginHooks(); // Pre-load plugin hooks (consumed by processSessionStartHooks before render)
            m.setupPluginHookHotReload(); // Set up hot reload for plugin hooks when settings change
        }
    });
    // --bare: skip attribution hook install + repo classification +
    // session-file-access analytics + team memory watcher. These are background
    // bookkeeping for commit attribution + usage metrics — scripted calls don't
    // commit code, and the 49ms attribution hook stat check (measured) is pure
    // overhead. NOT an early-return: the --dangerously-skip-permissions safety
    // gate, tengu_started beacon, and apiKeyHelper prefetch below must still run.
    if (!(0, envUtils_js_1.isBareMode)()) {
        if (process.env.USER_TYPE === 'ant') {
            // Prime repo classification cache for auto-undercover mode. Default is
            // undercover ON until proven internal; if this resolves to internal, clear
            // the prompt cache so the next turn picks up the OFF state.
            void Promise.resolve().then(() => __importStar(require('./utils/commitAttribution.js'))).then(async (m) => {
                if (await m.isInternalModelRepo()) {
                    const { clearSystemPromptSections } = await Promise.resolve().then(() => __importStar(require('./constants/systemPromptSections.js')));
                    clearSystemPromptSections();
                }
            });
        }
        if ((0, bun_bundle_1.feature)('COMMIT_ATTRIBUTION')) {
            // Dynamic import to enable dead code elimination (module contains excluded strings).
            // Defer to next tick so the git subprocess spawn runs after first render
            // rather than during the setup() microtask window.
            setImmediate(() => {
                void Promise.resolve().then(() => __importStar(require('./utils/attributionHooks.js'))).then(({ registerAttributionHooks }) => {
                    registerAttributionHooks(); // Register attribution tracking hooks (ant-only feature)
                });
            });
        }
        void Promise.resolve().then(() => __importStar(require('./utils/sessionFileAccessHooks.js'))).then(m => m.registerSessionFileAccessHooks()); // Register session file access analytics hooks
        if ((0, bun_bundle_1.feature)('TEAMMEM')) {
            void Promise.resolve().then(() => __importStar(require('./services/teamMemorySync/watcher.js'))).then(m => m.startTeamMemoryWatcher()); // Start team memory sync watcher
        }
    }
    (0, sinks_js_1.initSinks)(); // Attach error log + analytics sinks and drain queued events
    // Session-success-rate denominator. Emit immediately after the analytics
    // sink is attached — before any parsing, fetching, or I/O that could throw.
    // inc-3694 (P0 CHANGELOG crash) threw at checkForReleaseNotes below; every
    // event after this point was dead. This beacon is the earliest reliable
    // "process started" signal for release health monitoring.
    (0, index_js_1.logEvent)('tengu_started', {});
    void (0, auth_js_1.prefetchApiKeyFromApiKeyHelperIfSafe)((0, state_js_1.getIsNonInteractiveSession)()); // Prefetch safely - only executes if trust already confirmed
    (0, startupProfiler_js_1.profileCheckpoint)('setup_after_prefetch');
    // Pre-fetch data for Logo v2 - await to ensure it's ready before logo renders.
    // --bare / SIMPLE: skip — release notes are interactive-UI display data,
    // and getRecentActivity() reads up to 10 session JSONL files.
    if (!(0, envUtils_js_1.isBareMode)()) {
        const { hasReleaseNotes } = await (0, releaseNotes_js_1.checkForReleaseNotes)((0, config_js_1.getGlobalConfig)().lastReleaseNotesSeen);
        if (hasReleaseNotes) {
            await (0, logoV2Utils_js_1.getRecentActivity)();
        }
    }
    // If permission mode is set to bypass, verify we're in a safe environment
    if (permissionMode === 'bypassPermissions' ||
        allowDangerouslySkipPermissions) {
        // Check if running as root/sudo on Unix-like systems
        // Allow root if in a sandbox (e.g., TPU devspaces that require root)
        if (process.platform !== 'win32' &&
            typeof process.getuid === 'function' &&
            process.getuid() === 0 &&
            process.env.IS_SANDBOX !== '1' &&
            !(0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_BUBBLEWRAP)) {
            // biome-ignore lint/suspicious/noConsole:: intentional console output
            console.error(`--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons`);
            process.exit(1);
        }
        if (process.env.USER_TYPE === 'ant' &&
            // Skip for Desktop's local agent mode — same trust model as CCR/BYOC
            // (trusted Anthropic-managed launcher intentionally pre-approving everything).
            // Precedent: permissionSetup.ts:861, applySettingsChange.ts:55 (PR #19116)
            process.env.CLAUDE_CODE_ENTRYPOINT !== 'local-agent' &&
            // Same for CCD (Claude Code in Desktop) — apps#29127 passes the flag
            // unconditionally to unlock mid-session bypass switching
            process.env.CLAUDE_CODE_ENTRYPOINT !== 'claude-desktop') {
            // Only await if permission mode is set to bypass
            const [isDocker, hasInternet] = await Promise.all([
                envDynamic_js_1.envDynamic.getIsDocker(),
                env_js_1.env.hasInternetAccess(),
            ]);
            const isBubblewrap = envDynamic_js_1.envDynamic.getIsBubblewrapSandbox();
            const isSandbox = process.env.IS_SANDBOX === '1';
            const isSandboxed = isDocker || isBubblewrap || isSandbox;
            if (!isSandboxed || hasInternet) {
                // biome-ignore lint/suspicious/noConsole:: intentional console output
                console.error(`--dangerously-skip-permissions can only be used in Docker/sandbox containers with no internet access but got Docker: ${isDocker}, Bubblewrap: ${isBubblewrap}, IS_SANDBOX: ${isSandbox}, hasInternet: ${hasInternet}`);
                process.exit(1);
            }
        }
    }
    if (process.env.NODE_ENV === 'test') {
        return;
    }
    // Log tengu_exit event from the last session?
    const projectConfig = (0, config_js_1.getCurrentProjectConfig)();
    if (projectConfig.lastCost !== undefined &&
        projectConfig.lastDuration !== undefined) {
        (0, index_js_1.logEvent)('tengu_exit', {
            last_session_cost: projectConfig.lastCost,
            last_session_api_duration: projectConfig.lastAPIDuration,
            last_session_tool_duration: projectConfig.lastToolDuration,
            last_session_duration: projectConfig.lastDuration,
            last_session_lines_added: projectConfig.lastLinesAdded,
            last_session_lines_removed: projectConfig.lastLinesRemoved,
            last_session_total_input_tokens: projectConfig.lastTotalInputTokens,
            last_session_total_output_tokens: projectConfig.lastTotalOutputTokens,
            last_session_total_cache_creation_input_tokens: projectConfig.lastTotalCacheCreationInputTokens,
            last_session_total_cache_read_input_tokens: projectConfig.lastTotalCacheReadInputTokens,
            last_session_fps_average: projectConfig.lastFpsAverage,
            last_session_fps_low_1_pct: projectConfig.lastFpsLow1Pct,
            last_session_id: projectConfig.lastSessionId,
            ...projectConfig.lastSessionMetrics,
        });
        // Note: We intentionally don't clear these values after logging.
        // They're needed for cost restoration when resuming sessions.
        // The values will be overwritten when the next session exits.
    }
}
