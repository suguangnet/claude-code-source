"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAndSaveSnapshot = void 0;
exports.createRipgrepShellIntegration = createRipgrepShellIntegration;
exports.createFindGrepShellIntegration = createFindGrepShellIntegration;
const child_process_1 = require("child_process");
const execa_1 = require("execa");
const promises_1 = require("fs/promises");
const os = __importStar(require("os"));
const path_1 = require("path");
const index_js_1 = require("src/services/analytics/index.js");
const cleanupRegistry_js_1 = require("../cleanupRegistry.js");
const cwd_js_1 = require("../cwd.js");
const debug_js_1 = require("../debug.js");
const embeddedTools_js_1 = require("../embeddedTools.js");
const envUtils_js_1 = require("../envUtils.js");
const file_js_1 = require("../file.js");
const fsOperations_js_1 = require("../fsOperations.js");
const log_js_1 = require("../log.js");
const platform_js_1 = require("../platform.js");
const ripgrep_js_1 = require("../ripgrep.js");
const subprocessEnv_js_1 = require("../subprocessEnv.js");
const shellQuote_js_1 = require("./shellQuote.js");
const LITERAL_BACKSLASH = '\\';
const SNAPSHOT_CREATION_TIMEOUT = 10000; // 10 seconds
/**
 * Creates a shell function that invokes `binaryPath` with a specific argv[0].
 * This uses the bun-internal ARGV0 dispatch trick: the bun binary checks its
 * argv[0] and runs the embedded tool (rg, bfs, ugrep) that matches.
 *
 * @param prependArgs - Arguments to inject before the user's args (e.g.,
 *   default flags). Injected literally; each element must be a valid shell
 *   word (no spaces/special chars).
 */
function createArgv0ShellFunction(funcName, argv0, binaryPath, prependArgs = []) {
    const quotedPath = (0, shellQuote_js_1.quote)([binaryPath]);
    const argSuffix = prependArgs.length > 0 ? `${prependArgs.join(' ')} "$@"` : '"$@"';
    return [
        `function ${funcName} {`,
        '  if [[ -n $ZSH_VERSION ]]; then',
        `    ARGV0=${argv0} ${quotedPath} ${argSuffix}`,
        '  elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then',
        // On Windows (git bash), exec -a does not work, so use ARGV0 env var instead
        // The bun binary reads from ARGV0 natively to set argv[0]
        `    ARGV0=${argv0} ${quotedPath} ${argSuffix}`,
        '  elif [[ $BASHPID != $$ ]]; then',
        `    exec -a ${argv0} ${quotedPath} ${argSuffix}`,
        '  else',
        `    (exec -a ${argv0} ${quotedPath} ${argSuffix})`,
        '  fi',
        '}',
    ].join('\n');
}
/**
 * Creates ripgrep shell integration (alias or function)
 * @returns Object with type and the shell snippet to use
 */
function createRipgrepShellIntegration() {
    const rgCommand = (0, ripgrep_js_1.ripgrepCommand)();
    // For embedded ripgrep (bun-internal), we need a shell function that sets argv0
    if (rgCommand.argv0) {
        return {
            type: 'function',
            snippet: createArgv0ShellFunction('rg', rgCommand.argv0, rgCommand.rgPath),
        };
    }
    // For regular ripgrep, use a simple alias target
    const quotedPath = (0, shellQuote_js_1.quote)([rgCommand.rgPath]);
    const quotedArgs = rgCommand.rgArgs.map(arg => (0, shellQuote_js_1.quote)([arg]));
    const aliasTarget = rgCommand.rgArgs.length > 0
        ? `${quotedPath} ${quotedArgs.join(' ')}`
        : quotedPath;
    return { type: 'alias', snippet: aliasTarget };
}
/**
 * VCS directories to exclude from grep searches. Matches the list in
 * GrepTool (see GrepTool.ts: VCS_DIRECTORIES_TO_EXCLUDE).
 */
const VCS_DIRECTORIES_TO_EXCLUDE = [
    '.git',
    '.svn',
    '.hg',
    '.bzr',
    '.jj',
    '.sl',
];
/**
 * Creates shell integration for `find` and `grep`, backed by bfs and ugrep
 * embedded in the bun binary (ant-native only). Unlike the rg integration,
 * this always shadows the system find/grep since bfs/ugrep are drop-in
 * replacements and we want consistent fast behavior.
 *
 * These wrappers replace the GlobTool/GrepTool dedicated tools (which are
 * removed from the tool registry when embedded search tools are available),
 * so they're tuned to match those tools' semantics, not GNU find/grep.
 *
 * `find` ↔ GlobTool:
 * - Inject `-regextype findutils-default`: bfs defaults to POSIX BRE for
 *   -regex, but GNU find defaults to emacs-flavor (which supports `\|`
 *   alternation). Without this, `find . -regex '.*\.\(js\|ts\)'` silently
 *   returns zero results. A later user-supplied -regextype still overrides.
 * - No gitignore filtering: GlobTool passes `--no-ignore` to rg. bfs has no
 *   gitignore support anyway, so this matches by default.
 * - Hidden files included: both GlobTool (`--hidden`) and bfs's default.
 *
 * Caveat: even with findutils-default, Oniguruma (bfs's regex engine) uses
 * leftmost-first alternation, not POSIX leftmost-longest. Patterns where
 * one alternative is a prefix of another (e.g., `\(ts\|tsx\)`) may miss
 * matches that GNU find catches. Workaround: put the longer alternative first.
 *
 * `grep` ↔ GrepTool (file filtering) + GNU grep (regex syntax):
 * - `-G` (basic regex / BRE): GNU grep defaults to BRE where `\|` is
 *   alternation. ugrep defaults to ERE where `|` is alternation and `\|` is a
 *   literal pipe. Without -G, `grep "foo\|bar"` silently returns zero results.
 *   User-supplied `-E`, `-F`, or `-P` later in argv overrides this.
 * - `--ignore-files`: respect .gitignore (GrepTool uses rg's default, which
 *   respects gitignore). Override with `grep --no-ignore-files`.
 * - `--hidden`: include hidden files (GrepTool passes `--hidden` to rg).
 *   Override with `grep --no-hidden`.
 * - `--exclude-dir` for VCS dirs: GrepTool passes `--glob '!.git'` etc. to rg.
 * - `-I`: skip binary files. rg's recursion silently skips binary matches
 *   by default (different from direct-file-arg behavior); ugrep doesn't, so
 *   we inject -I to match. Override with `grep -a`.
 *
 * Not replicated from GrepTool:
 * - `--max-columns 500`: ugrep's `--width` hard-truncates output which could
 *   break pipelines; rg's version replaces the line with a placeholder.
 * - Read deny rules / plugin cache exclusions: require toolPermissionContext
 *   which isn't available at shell-snapshot creation time.
 *
 * Returns null if embedded search tools are not available in this build.
 */
function createFindGrepShellIntegration() {
    if (!(0, embeddedTools_js_1.hasEmbeddedSearchTools)()) {
        return null;
    }
    const binaryPath = (0, embeddedTools_js_1.embeddedSearchToolsBinaryPath)();
    return [
        // User shell configs may define aliases like `alias find=gfind` or
        // `alias grep=ggrep` (common on macOS with Homebrew GNU tools). The
        // snapshot sources user aliases before these function definitions, and
        // bash expands aliases before function lookup — so a renaming alias
        // would silently bypass the embedded bfs/ugrep dispatch. Clear them first
        // (same fix the rg integration uses).
        'unalias find 2>/dev/null || true',
        'unalias grep 2>/dev/null || true',
        createArgv0ShellFunction('find', 'bfs', binaryPath, [
            '-regextype',
            'findutils-default',
        ]),
        createArgv0ShellFunction('grep', 'ugrep', binaryPath, [
            '-G',
            '--ignore-files',
            '--hidden',
            '-I',
            ...VCS_DIRECTORIES_TO_EXCLUDE.map(d => `--exclude-dir=${d}`),
        ]),
    ].join('\n');
}
function getConfigFile(shellPath) {
    const fileName = shellPath.includes('zsh')
        ? '.zshrc'
        : shellPath.includes('bash')
            ? '.bashrc'
            : '.profile';
    const configPath = (0, path_1.join)(os.homedir(), fileName);
    return configPath;
}
/**
 * Generates user-specific snapshot content (functions, options, aliases)
 * This content is derived from the user's shell configuration file
 */
function getUserSnapshotContent(configFile) {
    const isZsh = configFile.endsWith('.zshrc');
    let content = '';
    // User functions
    if (isZsh) {
        content += `
      echo "# Functions" >> "$SNAPSHOT_FILE"

      # Force autoload all functions first
      typeset -f > /dev/null 2>&1

      # Now get user function names - filter completion functions (single underscore prefix)
      # but keep double-underscore helpers (e.g. __zsh_like_cd from mise, __pyenv_init)
      typeset +f | grep -vE '^_[^_]' | while read func; do
        typeset -f "$func" >> "$SNAPSHOT_FILE"
      done
    `;
    }
    else {
        content += `
      echo "# Functions" >> "$SNAPSHOT_FILE"

      # Force autoload all functions first
      declare -f > /dev/null 2>&1

      # Now get user function names - filter completion functions (single underscore prefix)
      # but keep double-underscore helpers (e.g. __zsh_like_cd from mise, __pyenv_init)
      declare -F | cut -d' ' -f3 | grep -vE '^_[^_]' | while read func; do
        # Encode the function to base64, preserving all special characters
        encoded_func=$(declare -f "$func" | base64 )
        # Write the function definition to the snapshot
        echo "eval ${LITERAL_BACKSLASH}"${LITERAL_BACKSLASH}$(echo '$encoded_func' | base64 -d)${LITERAL_BACKSLASH}" > /dev/null 2>&1" >> "$SNAPSHOT_FILE"
      done
    `;
    }
    // Shell options
    if (isZsh) {
        content += `
      echo "# Shell Options" >> "$SNAPSHOT_FILE"
      setopt | sed 's/^/setopt /' | head -n 1000 >> "$SNAPSHOT_FILE"
    `;
    }
    else {
        content += `
      echo "# Shell Options" >> "$SNAPSHOT_FILE"
      shopt -p | head -n 1000 >> "$SNAPSHOT_FILE"
      set -o | grep "on" | awk '{print "set -o " $1}' | head -n 1000 >> "$SNAPSHOT_FILE"
      echo "shopt -s expand_aliases" >> "$SNAPSHOT_FILE"
    `;
    }
    // User aliases
    content += `
      echo "# Aliases" >> "$SNAPSHOT_FILE"
      # Filter out winpty aliases on Windows to avoid "stdin is not a tty" errors
      # Git Bash automatically creates aliases like "alias node='winpty node.exe'" for
      # programs that need Win32 Console in mintty, but winpty fails when there's no TTY
      if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
        alias | grep -v "='winpty " | sed 's/^alias //g' | sed 's/^/alias -- /' | head -n 1000 >> "$SNAPSHOT_FILE"
      else
        alias | sed 's/^alias //g' | sed 's/^/alias -- /' | head -n 1000 >> "$SNAPSHOT_FILE"
      fi
  `;
    return content;
}
/**
 * Generates Claude Code specific snapshot content
 * This content is always included regardless of user configuration
 */
async function getClaudeCodeSnapshotContent() {
    // Get the appropriate PATH based on platform
    let pathValue = process.env.PATH;
    if ((0, platform_js_1.getPlatform)() === 'windows') {
        // On Windows with git-bash, read the Cygwin PATH
        const cygwinResult = await (0, execa_1.execa)('echo $PATH', {
            shell: true,
            reject: false,
        });
        if (cygwinResult.exitCode === 0 && cygwinResult.stdout) {
            pathValue = cygwinResult.stdout.trim();
        }
        // Fall back to process.env.PATH if we can't get Cygwin PATH
    }
    const rgIntegration = createRipgrepShellIntegration();
    let content = '';
    // Check if rg is available, if not create an alias/function to bundled ripgrep
    // We use a subshell to unalias rg before checking, so that user aliases like
    // `alias rg='rg --smart-case'` don't shadow the real binary check. The subshell
    // ensures we don't modify the user's aliases in the parent shell.
    content += `
      # Check for rg availability
      echo "# Check for rg availability" >> "$SNAPSHOT_FILE"
      echo "if ! (unalias rg 2>/dev/null; command -v rg) >/dev/null 2>&1; then" >> "$SNAPSHOT_FILE"
  `;
    if (rgIntegration.type === 'function') {
        // For embedded ripgrep, write the function definition using heredoc
        content += `
      cat >> "$SNAPSHOT_FILE" << 'RIPGREP_FUNC_END'
  ${rgIntegration.snippet}
RIPGREP_FUNC_END
    `;
    }
    else {
        // For regular ripgrep, write a simple alias
        const escapedSnippet = rgIntegration.snippet.replace(/'/g, "'\\''");
        content += `
      echo '  alias rg='"'${escapedSnippet}'" >> "$SNAPSHOT_FILE"
    `;
    }
    content += `
      echo "fi" >> "$SNAPSHOT_FILE"
  `;
    // For ant-native builds, shadow find/grep with bfs/ugrep embedded in the bun
    // binary. Unlike rg (which only activates if system rg is absent), we always
    // shadow find/grep since bfs/ugrep are drop-in replacements and we want
    // consistent fast behavior in Claude's shell.
    const findGrepIntegration = createFindGrepShellIntegration();
    if (findGrepIntegration !== null) {
        content += `
      # Shadow find/grep with embedded bfs/ugrep (ant-native only)
      echo "# Shadow find/grep with embedded bfs/ugrep" >> "$SNAPSHOT_FILE"
      cat >> "$SNAPSHOT_FILE" << 'FIND_GREP_FUNC_END'
${findGrepIntegration}
FIND_GREP_FUNC_END
    `;
    }
    // Add PATH to the file
    content += `

      # Add PATH to the file
      echo "export PATH=${(0, shellQuote_js_1.quote)([pathValue || ''])}" >> "$SNAPSHOT_FILE"
  `;
    return content;
}
/**
 * Creates the appropriate shell script for capturing environment
 */
async function getSnapshotScript(shellPath, snapshotFilePath, configFileExists) {
    const configFile = getConfigFile(shellPath);
    const isZsh = configFile.endsWith('.zshrc');
    // Generate the user content and Claude Code content
    const userContent = configFileExists
        ? getUserSnapshotContent(configFile)
        : !isZsh
            ? // we need to manually force alias expansion in bash - normally `getUserSnapshotContent` takes care of this
                'echo "shopt -s expand_aliases" >> "$SNAPSHOT_FILE"'
            : '';
    const claudeCodeContent = await getClaudeCodeSnapshotContent();
    const script = `SNAPSHOT_FILE=${(0, shellQuote_js_1.quote)([snapshotFilePath])}
      ${configFileExists ? `source "${configFile}" < /dev/null` : '# No user config file to source'}

      # First, create/clear the snapshot file
      echo "# Snapshot file" >| "$SNAPSHOT_FILE"

      # When this file is sourced, we first unalias to avoid conflicts
      # This is necessary because aliases get "frozen" inside function definitions at definition time,
      # which can cause unexpected behavior when functions use commands that conflict with aliases
      echo "# Unset all aliases to avoid conflicts with functions" >> "$SNAPSHOT_FILE"
      echo "unalias -a 2>/dev/null || true" >> "$SNAPSHOT_FILE"

      ${userContent}

      ${claudeCodeContent}

      # Exit silently on success, only report errors
      if [ ! -f "$SNAPSHOT_FILE" ]; then
        echo "Error: Snapshot file was not created at $SNAPSHOT_FILE" >&2
        exit 1
      fi
    `;
    return script;
}
/**
 * Creates and saves the shell environment snapshot by loading the user's shell configuration
 *
 * This function is a critical part of Claude CLI's shell integration strategy. It:
 *
 * 1. Identifies the user's shell config file (.zshrc, .bashrc, etc.)
 * 2. Creates a temporary script that sources this configuration file
 * 3. Captures the resulting shell environment state including:
 *    - Functions defined in the user's shell configuration
 *    - Shell options and settings that affect command behavior
 *    - Aliases that the user has defined
 *
 * The snapshot is saved to a temporary file that can be sourced by subsequent shell
 * commands, ensuring they run with the user's expected environment, aliases, and functions.
 *
 * This approach allows Claude CLI to execute commands as if they were run in the user's
 * interactive shell, while avoiding the overhead of creating a new login shell for each command.
 * It handles both Bash and Zsh shells with their different syntax for functions, options, and aliases.
 *
 * If the snapshot creation fails (e.g., timeout, permissions issues), the CLI will still
 * function but without the user's custom shell environment, potentially missing aliases
 * and functions the user relies on.
 *
 * @returns Promise that resolves to the snapshot file path or undefined if creation failed
 */
const createAndSaveSnapshot = async (binShell) => {
    const shellType = binShell.includes('zsh')
        ? 'zsh'
        : binShell.includes('bash')
            ? 'bash'
            : 'sh';
    (0, debug_js_1.logForDebugging)(`Creating shell snapshot for ${shellType} (${binShell})`);
    return new Promise(async (resolve) => {
        try {
            const configFile = getConfigFile(binShell);
            (0, debug_js_1.logForDebugging)(`Looking for shell config file: ${configFile}`);
            const configFileExists = await (0, file_js_1.pathExists)(configFile);
            if (!configFileExists) {
                (0, debug_js_1.logForDebugging)(`Shell config file not found: ${configFile}, creating snapshot with Claude Code defaults only`);
            }
            // Create unique snapshot path with timestamp and random ID
            const timestamp = Date.now();
            const randomId = Math.random().toString(36).substring(2, 8);
            const snapshotsDir = (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), 'shell-snapshots');
            (0, debug_js_1.logForDebugging)(`Snapshots directory: ${snapshotsDir}`);
            const shellSnapshotPath = (0, path_1.join)(snapshotsDir, `snapshot-${shellType}-${timestamp}-${randomId}.sh`);
            // Ensure snapshots directory exists
            await (0, promises_1.mkdir)(snapshotsDir, { recursive: true });
            const snapshotScript = await getSnapshotScript(binShell, shellSnapshotPath, configFileExists);
            (0, debug_js_1.logForDebugging)(`Creating snapshot at: ${shellSnapshotPath}`);
            (0, debug_js_1.logForDebugging)(`Execution timeout: ${SNAPSHOT_CREATION_TIMEOUT}ms`);
            (0, child_process_1.execFile)(binShell, ['-c', '-l', snapshotScript], {
                env: {
                    ...(process.env.CLAUDE_CODE_DONT_INHERIT_ENV
                        ? {}
                        : (0, subprocessEnv_js_1.subprocessEnv)()),
                    SHELL: binShell,
                    GIT_EDITOR: 'true',
                    CLAUDECODE: '1',
                },
                timeout: SNAPSHOT_CREATION_TIMEOUT,
                maxBuffer: 1024 * 1024, // 1MB buffer
                encoding: 'utf8',
            }, async (error, stdout, stderr) => {
                if (error) {
                    const execError = error;
                    (0, debug_js_1.logForDebugging)(`Shell snapshot creation failed: ${error.message}`);
                    (0, debug_js_1.logForDebugging)(`Error details:`);
                    (0, debug_js_1.logForDebugging)(`  - Error code: ${execError?.code}`);
                    (0, debug_js_1.logForDebugging)(`  - Error signal: ${execError?.signal}`);
                    (0, debug_js_1.logForDebugging)(`  - Error killed: ${execError?.killed}`);
                    (0, debug_js_1.logForDebugging)(`  - Shell path: ${binShell}`);
                    (0, debug_js_1.logForDebugging)(`  - Config file: ${getConfigFile(binShell)}`);
                    (0, debug_js_1.logForDebugging)(`  - Config file exists: ${configFileExists}`);
                    (0, debug_js_1.logForDebugging)(`  - Working directory: ${(0, cwd_js_1.getCwd)()}`);
                    (0, debug_js_1.logForDebugging)(`  - Claude home: ${(0, envUtils_js_1.getClaudeConfigHomeDir)()}`);
                    (0, debug_js_1.logForDebugging)(`Full snapshot script:\n${snapshotScript}`);
                    if (stdout) {
                        (0, debug_js_1.logForDebugging)(`stdout output (${stdout.length} chars):\n${stdout}`);
                    }
                    else {
                        (0, debug_js_1.logForDebugging)(`No stdout output captured`);
                    }
                    if (stderr) {
                        (0, debug_js_1.logForDebugging)(`stderr output (${stderr.length} chars): ${stderr}`);
                    }
                    else {
                        (0, debug_js_1.logForDebugging)(`No stderr output captured`);
                    }
                    (0, log_js_1.logError)(new Error(`Failed to create shell snapshot: ${error.message}`));
                    // Convert signal name to number if present
                    const signalNumber = execError?.signal
                        ? os.constants.signals[execError.signal]
                        : undefined;
                    (0, index_js_1.logEvent)('tengu_shell_snapshot_failed', {
                        stderr_length: stderr?.length || 0,
                        has_error_code: !!execError?.code,
                        error_signal_number: signalNumber,
                        error_killed: execError?.killed,
                    });
                    resolve(undefined);
                }
                else {
                    let snapshotSize;
                    try {
                        snapshotSize = (await (0, promises_1.stat)(shellSnapshotPath)).size;
                    }
                    catch {
                        // Snapshot file not found
                    }
                    if (snapshotSize !== undefined) {
                        (0, debug_js_1.logForDebugging)(`Shell snapshot created successfully (${snapshotSize} bytes)`);
                        // Register cleanup to remove snapshot on graceful shutdown
                        (0, cleanupRegistry_js_1.registerCleanup)(async () => {
                            try {
                                await (0, fsOperations_js_1.getFsImplementation)().unlink(shellSnapshotPath);
                                (0, debug_js_1.logForDebugging)(`Cleaned up session snapshot: ${shellSnapshotPath}`);
                            }
                            catch (error) {
                                (0, debug_js_1.logForDebugging)(`Error cleaning up session snapshot: ${error}`);
                            }
                        });
                        resolve(shellSnapshotPath);
                    }
                    else {
                        (0, debug_js_1.logForDebugging)(`Shell snapshot file not found after creation: ${shellSnapshotPath}`);
                        (0, debug_js_1.logForDebugging)(`Checking if parent directory still exists: ${snapshotsDir}`);
                        try {
                            const dirContents = await (0, fsOperations_js_1.getFsImplementation)().readdir(snapshotsDir);
                            (0, debug_js_1.logForDebugging)(`Directory contains ${dirContents.length} files`);
                        }
                        catch {
                            (0, debug_js_1.logForDebugging)(`Parent directory does not exist or is not accessible: ${snapshotsDir}`);
                        }
                        (0, index_js_1.logEvent)('tengu_shell_unknown_error', {});
                        resolve(undefined);
                    }
                }
            });
        }
        catch (error) {
            (0, debug_js_1.logForDebugging)(`Unexpected error during snapshot creation: ${error}`);
            if (error instanceof Error) {
                (0, debug_js_1.logForDebugging)(`Error stack trace: ${error.stack}`);
            }
            (0, log_js_1.logError)(error);
            (0, index_js_1.logEvent)('tengu_shell_snapshot_error', {});
            resolve(undefined);
        }
    });
};
exports.createAndSaveSnapshot = createAndSaveSnapshot;
