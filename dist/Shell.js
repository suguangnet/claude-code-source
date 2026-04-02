"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPsProvider = exports.getShellConfig = void 0;
exports.findSuitableShell = findSuitableShell;
exports.exec = exec;
exports.setCwd = setCwd;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const path_1 = require("path");
const posix_1 = require("path/posix");
const index_js_1 = require("src/services/analytics/index.js");
const state_js_1 = require("../bootstrap/state.js");
const Task_js_1 = require("../Task.js");
const cwd_js_1 = require("./cwd.js");
const debug_js_1 = require("./debug.js");
const errors_js_1 = require("./errors.js");
const fsOperations_js_1 = require("./fsOperations.js");
const log_js_1 = require("./log.js");
const ShellCommand_js_1 = require("./ShellCommand.js");
const diskOutput_js_1 = require("./task/diskOutput.js");
const TaskOutput_js_1 = require("./task/TaskOutput.js");
const which_js_1 = require("./which.js");
const fs_2 = require("fs");
const fileChangedWatcher_js_1 = require("./hooks/fileChangedWatcher.js");
const filesystem_js_1 = require("./permissions/filesystem.js");
const platform_js_1 = require("./platform.js");
const sandbox_adapter_js_1 = require("./sandbox/sandbox-adapter.js");
const sessionEnvironment_js_1 = require("./sessionEnvironment.js");
const bashProvider_js_1 = require("./shell/bashProvider.js");
const powershellDetection_js_1 = require("./shell/powershellDetection.js");
const powershellProvider_js_1 = require("./shell/powershellProvider.js");
const subprocessEnv_js_1 = require("./subprocessEnv.js");
const windowsPaths_js_1 = require("./windowsPaths.js");
const DEFAULT_TIMEOUT = 30 * 60 * 1000; // 30 minutes
function isExecutable(shellPath) {
    try {
        (0, fs_2.accessSync)(shellPath, fs_1.constants.X_OK);
        return true;
    }
    catch (_err) {
        // Fallback for Nix and other environments where X_OK check might fail
        try {
            // Try to execute the shell with --version, which should exit quickly
            // Use execFileSync to avoid shell injection vulnerabilities
            (0, child_process_1.execFileSync)(shellPath, ['--version'], {
                timeout: 1000,
                stdio: 'ignore',
            });
            return true;
        }
        catch {
            return false;
        }
    }
}
/**
 * Determines the best available shell to use.
 */
async function findSuitableShell() {
    // Check for explicit shell override first
    const shellOverride = process.env.CLAUDE_CODE_SHELL;
    if (shellOverride) {
        // Validate it's a supported shell type
        const isSupported = shellOverride.includes('bash') || shellOverride.includes('zsh');
        if (isSupported && isExecutable(shellOverride)) {
            (0, debug_js_1.logForDebugging)(`Using shell override: ${shellOverride}`);
            return shellOverride;
        }
        else {
            // Note, if we ever want to add support for new shells here we'll need to update or Bash tool parsing to account for this
            (0, debug_js_1.logForDebugging)(`CLAUDE_CODE_SHELL="${shellOverride}" is not a valid bash/zsh path, falling back to detection`);
        }
    }
    // Check user's preferred shell from environment
    const env_shell = process.env.SHELL;
    // Only consider SHELL if it's bash or zsh
    const isEnvShellSupported = env_shell && (env_shell.includes('bash') || env_shell.includes('zsh'));
    const preferBash = env_shell?.includes('bash');
    // Try to locate shells using which (uses Bun.which when available)
    const [zshPath, bashPath] = await Promise.all([(0, which_js_1.which)('zsh'), (0, which_js_1.which)('bash')]);
    // Populate shell paths from which results and fallback locations
    const shellPaths = ['/bin', '/usr/bin', '/usr/local/bin', '/opt/homebrew/bin'];
    // Order shells based on user preference
    const shellOrder = preferBash ? ['bash', 'zsh'] : ['zsh', 'bash'];
    const supportedShells = shellOrder.flatMap(shell => shellPaths.map(path => `${path}/${shell}`));
    // Add discovered paths to the beginning of our search list
    // Put the user's preferred shell type first
    if (preferBash) {
        if (bashPath)
            supportedShells.unshift(bashPath);
        if (zshPath)
            supportedShells.push(zshPath);
    }
    else {
        if (zshPath)
            supportedShells.unshift(zshPath);
        if (bashPath)
            supportedShells.push(bashPath);
    }
    // Always prioritize SHELL env variable if it's a supported shell type
    if (isEnvShellSupported && isExecutable(env_shell)) {
        supportedShells.unshift(env_shell);
    }
    const shellPath = supportedShells.find(shell => shell && isExecutable(shell));
    // If no valid shell found, throw a helpful error
    if (!shellPath) {
        const errorMsg = 'No suitable shell found. Claude CLI requires a Posix shell environment. ' +
            'Please ensure you have a valid shell installed and the SHELL environment variable set.';
        (0, log_js_1.logError)(new Error(errorMsg));
        throw new Error(errorMsg);
    }
    return shellPath;
}
async function getShellConfigImpl() {
    const binShell = await findSuitableShell();
    const provider = await (0, bashProvider_js_1.createBashShellProvider)(binShell);
    return { provider };
}
// Memoize the entire shell config so it only happens once per session
exports.getShellConfig = (0, memoize_js_1.default)(getShellConfigImpl);
exports.getPsProvider = (0, memoize_js_1.default)(async () => {
    const psPath = await (0, powershellDetection_js_1.getCachedPowerShellPath)();
    if (!psPath) {
        throw new Error('PowerShell is not available');
    }
    return (0, powershellProvider_js_1.createPowerShellProvider)(psPath);
});
const resolveProvider = {
    bash: async () => (await (0, exports.getShellConfig)()).provider,
    powershell: exports.getPsProvider,
};
/**
 * Execute a shell command using the environment snapshot
 * Creates a new shell process for each command execution
 */
async function exec(command, abortSignal, shellType, options) {
    const { timeout, onProgress, preventCwdChanges, shouldUseSandbox, shouldAutoBackground, onStdout, } = options ?? {};
    const commandTimeout = timeout || DEFAULT_TIMEOUT;
    const provider = await resolveProvider[shellType]();
    const id = Math.floor(Math.random() * 0x10000)
        .toString(16)
        .padStart(4, '0');
    // Sandbox temp directory - use per-user directory name to prevent multi-user permission conflicts
    const sandboxTmpDir = (0, posix_1.join)(process.env.CLAUDE_CODE_TMPDIR || '/tmp', (0, filesystem_js_1.getClaudeTempDirName)());
    const { commandString: builtCommand, cwdFilePath } = await provider.buildExecCommand(command, {
        id,
        sandboxTmpDir: shouldUseSandbox ? sandboxTmpDir : undefined,
        useSandbox: shouldUseSandbox ?? false,
    });
    let commandString = builtCommand;
    let cwd = (0, cwd_js_1.pwd)();
    // Recover if the current working directory no longer exists on disk.
    // This can happen when a command deletes its own CWD (e.g., temp dir cleanup).
    try {
        await (0, promises_1.realpath)(cwd);
    }
    catch {
        const fallback = (0, state_js_1.getOriginalCwd)();
        (0, debug_js_1.logForDebugging)(`Shell CWD "${cwd}" no longer exists, recovering to "${fallback}"`);
        try {
            await (0, promises_1.realpath)(fallback);
            (0, state_js_1.setCwdState)(fallback);
            cwd = fallback;
        }
        catch {
            return (0, ShellCommand_js_1.createFailedCommand)(`Working directory "${cwd}" no longer exists. Please restart Claude from an existing directory.`);
        }
    }
    // If already aborted, don't spawn the process at all
    if (abortSignal.aborted) {
        return (0, ShellCommand_js_1.createAbortedCommand)();
    }
    const binShell = provider.shellPath;
    // Sandboxed PowerShell: wrapWithSandbox hardcodes `<binShell> -c '<cmd>'` —
    // using pwsh there would lose -NoProfile -NonInteractive (profile load
    // inside sandbox → delays, stray output, may hang on prompts). Instead:
    //   • powershellProvider.buildExecCommand (useSandbox) pre-wraps as
    //     `pwsh -NoProfile -NonInteractive -EncodedCommand <base64>` — base64
    //     survives the runtime's shellquote.quote() layer
    //   • pass /bin/sh as the sandbox's inner shell to exec that invocation
    //   • outer spawn is also /bin/sh -c to parse the runtime's POSIX output
    // /bin/sh exists on every platform where sandbox is supported.
    const isSandboxedPowerShell = shouldUseSandbox && shellType === 'powershell';
    const sandboxBinShell = isSandboxedPowerShell ? '/bin/sh' : binShell;
    if (shouldUseSandbox) {
        commandString = await sandbox_adapter_js_1.SandboxManager.wrapWithSandbox(commandString, sandboxBinShell, undefined, abortSignal);
        // Create sandbox temp directory for sandboxed processes with secure permissions
        try {
            const fs = (0, fsOperations_js_1.getFsImplementation)();
            await fs.mkdir(sandboxTmpDir, { mode: 0o700 });
        }
        catch (error) {
            (0, debug_js_1.logForDebugging)(`Failed to create ${sandboxTmpDir} directory: ${error}`);
        }
    }
    const spawnBinary = isSandboxedPowerShell ? '/bin/sh' : binShell;
    const shellArgs = isSandboxedPowerShell
        ? ['-c', commandString]
        : provider.getSpawnArgs(commandString);
    const envOverrides = await provider.getEnvironmentOverrides(command);
    // When onStdout is provided, use pipe mode: stdout flows through
    // StreamWrapper → TaskOutput in-memory buffer instead of a file fd.
    // This lets callers receive real-time stdout callbacks.
    const usePipeMode = !!onStdout;
    const taskId = (0, Task_js_1.generateTaskId)('local_bash');
    const taskOutput = new TaskOutput_js_1.TaskOutput(taskId, onProgress ?? null, !usePipeMode);
    await (0, promises_1.mkdir)((0, diskOutput_js_1.getTaskOutputDir)(), { recursive: true });
    // In file mode, both stdout and stderr go to the same file fd.
    // On POSIX, O_APPEND makes each write atomic (seek-to-end + write), so
    // stdout and stderr are interleaved chronologically without tearing.
    // On Windows, 'a' mode strips FILE_WRITE_DATA (only grants FILE_APPEND_DATA)
    // via libuv's fs__open. MSYS2/Cygwin probes inherited handles with
    // NtQueryInformationFile(FileAccessInformation) and treats handles without
    // FILE_WRITE_DATA as read-only, silently discarding all output. Using 'w'
    // grants FILE_GENERIC_WRITE. Atomicity is preserved because duplicated
    // handles share the same FILE_OBJECT with FILE_SYNCHRONOUS_IO_NONALERT,
    // which serializes all I/O through a single kernel lock.
    // SECURITY: O_NOFOLLOW prevents symlink-following attacks from the sandbox.
    // On Windows, use string flags — numeric flags can produce EINVAL through libuv.
    let outputHandle;
    if (!usePipeMode) {
        const O_NOFOLLOW = fs_1.constants.O_NOFOLLOW ?? 0;
        outputHandle = await (0, promises_1.open)(taskOutput.path, process.platform === 'win32'
            ? 'w'
            : fs_1.constants.O_WRONLY |
                fs_1.constants.O_CREAT |
                fs_1.constants.O_APPEND |
                O_NOFOLLOW);
    }
    try {
        const childProcess = (0, child_process_1.spawn)(spawnBinary, shellArgs, {
            env: {
                ...(0, subprocessEnv_js_1.subprocessEnv)(),
                SHELL: shellType === 'bash' ? binShell : undefined,
                GIT_EDITOR: 'true',
                CLAUDECODE: '1',
                ...envOverrides,
                ...(process.env.USER_TYPE === 'ant'
                    ? {
                        CLAUDE_CODE_SESSION_ID: (0, state_js_1.getSessionId)(),
                    }
                    : {}),
            },
            cwd,
            stdio: usePipeMode
                ? ['pipe', 'pipe', 'pipe']
                : ['pipe', outputHandle?.fd, outputHandle?.fd],
            // Don't pass the signal - we'll handle termination ourselves with tree-kill
            detached: provider.detached,
            // Prevent visible console window on Windows (no-op on other platforms)
            windowsHide: true,
        });
        const shellCommand = (0, ShellCommand_js_1.wrapSpawn)(childProcess, abortSignal, commandTimeout, taskOutput, shouldAutoBackground);
        // Close our copy of the fd — the child has its own dup.
        // Must happen after wrapSpawn attaches 'error' listener, since the await
        // yields and the child's ENOENT 'error' event can fire in that window.
        // Wrapped in its own try/catch so a close failure (e.g. EIO) doesn't fall
        // through to the spawn-failure catch block, which would orphan the child.
        if (outputHandle !== undefined) {
            try {
                await outputHandle.close();
            }
            catch {
                // fd may already be closed by the child; safe to ignore
            }
        }
        // In pipe mode, attach the caller's callbacks alongside StreamWrapper.
        // Both listeners receive the same data chunks (Node.js ReadableStream supports
        // multiple 'data' listeners). StreamWrapper feeds TaskOutput for persistence;
        // these callbacks give the caller real-time access.
        if (childProcess.stdout && onStdout) {
            childProcess.stdout.on('data', (chunk) => {
                onStdout(typeof chunk === 'string' ? chunk : chunk.toString());
            });
        }
        // Attach cleanup to the command result
        // NOTE: readFileSync/unlinkSync are intentional here — these must complete
        // synchronously within the .then() microtask so that callers who
        // `await shellCommand.result` see the updated cwd immediately after.
        // Using async readFile would introduce a microtask boundary, causing
        // a race where cwd hasn't been updated yet when the caller continues.
        // On Windows, cwdFilePath is a POSIX path (for bash's `pwd -P >| $path`),
        // but Node.js needs a native Windows path for readFileSync/unlinkSync.
        // Similarly, `pwd -P` outputs a POSIX path that must be converted before setCwd.
        const nativeCwdFilePath = (0, platform_js_1.getPlatform)() === 'windows'
            ? (0, windowsPaths_js_1.posixPathToWindowsPath)(cwdFilePath)
            : cwdFilePath;
        void shellCommand.result.then(async (result) => {
            // On Linux, bwrap creates 0-byte mount-point files on the host to deny
            // writes to non-existent paths (.bashrc, HEAD, etc.). These persist after
            // bwrap exits as ghost dotfiles in cwd. Cleanup is synchronous and a no-op
            // on macOS. Keep before any await so callers awaiting .result see a clean
            // working tree in the same microtask.
            if (shouldUseSandbox) {
                sandbox_adapter_js_1.SandboxManager.cleanupAfterCommand();
            }
            // Only foreground tasks update the cwd
            if (result && !preventCwdChanges && !result.backgroundTaskId) {
                try {
                    let newCwd = (0, fs_1.readFileSync)(nativeCwdFilePath, {
                        encoding: 'utf8',
                    }).trim();
                    if ((0, platform_js_1.getPlatform)() === 'windows') {
                        newCwd = (0, windowsPaths_js_1.posixPathToWindowsPath)(newCwd);
                    }
                    // cwd is NFC-normalized (setCwdState); newCwd from `pwd -P` may be
                    // NFD on macOS APFS. Normalize before comparing so Unicode paths
                    // don't false-positive as "changed" on every command.
                    if (newCwd.normalize('NFC') !== cwd) {
                        setCwd(newCwd, cwd);
                        (0, sessionEnvironment_js_1.invalidateSessionEnvCache)();
                        void (0, fileChangedWatcher_js_1.onCwdChangedForHooks)(cwd, newCwd);
                    }
                }
                catch {
                    (0, index_js_1.logEvent)('tengu_shell_set_cwd', { success: false });
                }
            }
            // Clean up the temp file used for cwd tracking
            try {
                (0, fs_1.unlinkSync)(nativeCwdFilePath);
            }
            catch {
                // File may not exist if command failed before pwd -P ran
            }
        });
        return shellCommand;
    }
    catch (error) {
        // Close the fd if spawn failed (child never got its dup)
        if (outputHandle !== undefined) {
            try {
                await outputHandle.close();
            }
            catch {
                // May already be closed
            }
        }
        taskOutput.clear();
        (0, debug_js_1.logForDebugging)(`Shell exec error: ${(0, errors_js_1.errorMessage)(error)}`);
        return (0, ShellCommand_js_1.createAbortedCommand)(undefined, {
            code: 126, // Standard Unix code for execution errors
            stderr: (0, errors_js_1.errorMessage)(error),
        });
    }
}
/**
 * Set the current working directory
 */
function setCwd(path, relativeTo) {
    const resolved = (0, path_1.isAbsolute)(path)
        ? path
        : (0, path_1.resolve)(relativeTo || (0, fsOperations_js_1.getFsImplementation)().cwd(), path);
    // Resolve symlinks to match the behavior of pwd -P.
    // realpathSync throws ENOENT if the path doesn't exist - convert to a
    // friendlier error message instead of a separate existsSync pre-check (TOCTOU).
    let physicalPath;
    try {
        physicalPath = (0, fsOperations_js_1.getFsImplementation)().realpathSync(resolved);
    }
    catch (e) {
        if ((0, errors_js_1.isENOENT)(e)) {
            throw new Error(`Path "${resolved}" does not exist`);
        }
        throw e;
    }
    (0, state_js_1.setCwdState)(physicalPath);
    if (process.env.NODE_ENV !== 'test') {
        try {
            (0, index_js_1.logEvent)('tengu_shell_set_cwd', {
                success: true,
            });
        }
        catch (_error) {
            // Ignore logging errors to prevent test failures
        }
    }
}
