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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateWorktreeSlug = validateWorktreeSlug;
exports.getCurrentWorktreeSession = getCurrentWorktreeSession;
exports.restoreWorktreeSession = restoreWorktreeSession;
exports.generateTmuxSessionName = generateTmuxSessionName;
exports.worktreeBranchName = worktreeBranchName;
exports.copyWorktreeIncludeFiles = copyWorktreeIncludeFiles;
exports.parsePRReference = parsePRReference;
exports.isTmuxAvailable = isTmuxAvailable;
exports.getTmuxInstallInstructions = getTmuxInstallInstructions;
exports.createTmuxSessionForWorktree = createTmuxSessionForWorktree;
exports.killTmuxSession = killTmuxSession;
exports.createWorktreeForSession = createWorktreeForSession;
exports.keepWorktree = keepWorktree;
exports.cleanupWorktree = cleanupWorktree;
exports.createAgentWorktree = createAgentWorktree;
exports.removeAgentWorktree = removeAgentWorktree;
exports.cleanupStaleAgentWorktrees = cleanupStaleAgentWorktrees;
exports.hasWorktreeChanges = hasWorktreeChanges;
exports.execIntoTmuxWorktree = execIntoTmuxWorktree;
const bun_bundle_1 = require("bun:bundle");
const chalk_1 = __importDefault(require("chalk"));
const child_process_1 = require("child_process");
const promises_1 = require("fs/promises");
const ignore_1 = __importDefault(require("ignore"));
const path_1 = require("path");
const config_js_1 = require("./config.js");
const cwd_js_1 = require("./cwd.js");
const debug_js_1 = require("./debug.js");
const errors_js_1 = require("./errors.js");
const execFileNoThrow_js_1 = require("./execFileNoThrow.js");
const gitConfigParser_js_1 = require("./git/gitConfigParser.js");
const gitFilesystem_js_1 = require("./git/gitFilesystem.js");
const git_js_1 = require("./git.js");
const hooks_js_1 = require("./hooks.js");
const path_js_1 = require("./path.js");
const platform_js_1 = require("./platform.js");
const settings_js_1 = require("./settings/settings.js");
const sleep_js_1 = require("./sleep.js");
const detection_js_1 = require("./swarm/backends/detection.js");
const VALID_WORKTREE_SLUG_SEGMENT = /^[a-zA-Z0-9._-]+$/;
const MAX_WORKTREE_SLUG_LENGTH = 64;
/**
 * Validates a worktree slug to prevent path traversal and directory escape.
 *
 * The slug is joined into `.claude/worktrees/<slug>` via path.join, which
 * normalizes `..` segments — so `../../../target` would escape the worktrees
 * directory. Similarly, an absolute path (leading `/` or `C:\`) would discard
 * the prefix entirely.
 *
 * Forward slashes are allowed for nesting (e.g. `asm/feature-foo`); each
 * segment is validated independently against the allowlist, so `.` / `..`
 * segments and drive-spec characters are still rejected.
 *
 * Throws synchronously — callers rely on this running before any side effects
 * (git commands, hook execution, chdir).
 */
function validateWorktreeSlug(slug) {
    if (slug.length > MAX_WORKTREE_SLUG_LENGTH) {
        throw new Error(`Invalid worktree name: must be ${MAX_WORKTREE_SLUG_LENGTH} characters or fewer (got ${slug.length})`);
    }
    // Leading or trailing `/` would make path.join produce an absolute path
    // or a dangling segment. Splitting and validating each segment rejects
    // both (empty segments fail the regex) while allowing `user/feature`.
    for (const segment of slug.split('/')) {
        if (segment === '.' || segment === '..') {
            throw new Error(`Invalid worktree name "${slug}": must not contain "." or ".." path segments`);
        }
        if (!VALID_WORKTREE_SLUG_SEGMENT.test(segment)) {
            throw new Error(`Invalid worktree name "${slug}": each "/"-separated segment must be non-empty and contain only letters, digits, dots, underscores, and dashes`);
        }
    }
}
// Helper function to create directories recursively
async function mkdirRecursive(dirPath) {
    await (0, promises_1.mkdir)(dirPath, { recursive: true });
}
/**
 * Symlinks directories from the main repository to avoid duplication.
 * This prevents disk bloat from duplicating node_modules and other large directories.
 *
 * @param repoRootPath - Path to the main repository root
 * @param worktreePath - Path to the worktree directory
 * @param dirsToSymlink - Array of directory names to symlink (e.g., ['node_modules'])
 */
async function symlinkDirectories(repoRootPath, worktreePath, dirsToSymlink) {
    for (const dir of dirsToSymlink) {
        // Validate directory doesn't escape repository boundaries
        if ((0, path_js_1.containsPathTraversal)(dir)) {
            (0, debug_js_1.logForDebugging)(`Skipping symlink for "${dir}": path traversal detected`, { level: 'warn' });
            continue;
        }
        const sourcePath = (0, path_1.join)(repoRootPath, dir);
        const destPath = (0, path_1.join)(worktreePath, dir);
        try {
            await (0, promises_1.symlink)(sourcePath, destPath, 'dir');
            (0, debug_js_1.logForDebugging)(`Symlinked ${dir} from main repository to worktree to avoid disk bloat`);
        }
        catch (error) {
            const code = (0, errors_js_1.getErrnoCode)(error);
            // ENOENT: source doesn't exist yet (expected - skip silently)
            // EEXIST: destination already exists (expected - skip silently)
            if (code !== 'ENOENT' && code !== 'EEXIST') {
                // Unexpected error (e.g., permission denied, unsupported platform)
                (0, debug_js_1.logForDebugging)(`Failed to symlink ${dir} (${code ?? 'unknown'}): ${(0, errors_js_1.errorMessage)(error)}`, { level: 'warn' });
            }
        }
    }
}
let currentWorktreeSession = null;
function getCurrentWorktreeSession() {
    return currentWorktreeSession;
}
/**
 * Restore the worktree session on --resume. The caller must have already
 * verified the directory exists (via process.chdir) and set the bootstrap
 * state (cwd, originalCwd).
 */
function restoreWorktreeSession(session) {
    currentWorktreeSession = session;
}
function generateTmuxSessionName(repoPath, branch) {
    const repoName = (0, path_1.basename)(repoPath);
    const combined = `${repoName}_${branch}`;
    return combined.replace(/[/.]/g, '_');
}
// Env vars to prevent git/SSH from prompting for credentials (which hangs the CLI).
// GIT_TERMINAL_PROMPT=0 prevents git from opening /dev/tty for credential prompts.
// GIT_ASKPASS='' disables askpass GUI programs.
// stdin: 'ignore' closes stdin so interactive prompts can't block.
const GIT_NO_PROMPT_ENV = {
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '',
};
function worktreesDir(repoRoot) {
    return (0, path_1.join)(repoRoot, '.claude', 'worktrees');
}
// Flatten nested slugs (`user/feature` → `user+feature`) for both the branch
// name and the directory path. Nesting in either location is unsafe:
//   - git refs: `worktree-user` (file) vs `worktree-user/feature` (needs dir)
//     is a D/F conflict that git rejects.
//   - directory: `.claude/worktrees/user/feature/` lives inside the `user`
//     worktree; `git worktree remove` on the parent deletes children with
//     uncommitted work.
// `+` is valid in git branch names and filesystem paths but NOT in the
// slug-segment allowlist ([a-zA-Z0-9._-]), so the mapping is injective.
function flattenSlug(slug) {
    return slug.replaceAll('/', '+');
}
function worktreeBranchName(slug) {
    return `worktree-${flattenSlug(slug)}`;
}
function worktreePathFor(repoRoot, slug) {
    return (0, path_1.join)(worktreesDir(repoRoot), flattenSlug(slug));
}
/**
 * Creates a new git worktree for the given slug, or resumes it if it already exists.
 * Named worktrees reuse the same path across invocations, so the existence check
 * prevents unconditionally running `git fetch` (which can hang waiting for credentials)
 * on every resume.
 */
async function getOrCreateWorktree(repoRoot, slug, options) {
    const worktreePath = worktreePathFor(repoRoot, slug);
    const worktreeBranch = worktreeBranchName(slug);
    // Fast resume path: if the worktree already exists skip fetch and creation.
    // Read the .git pointer file directly (no subprocess, no upward walk) — a
    // subprocess `rev-parse HEAD` burns ~15ms on spawn overhead even for a 2ms
    // task, and the await yield lets background spawnSyncs pile on (seen at 55ms).
    const existingHead = await (0, gitFilesystem_js_1.readWorktreeHeadSha)(worktreePath);
    if (existingHead) {
        return {
            worktreePath,
            worktreeBranch,
            headCommit: existingHead,
            existed: true,
        };
    }
    // New worktree: fetch base branch then add
    await (0, promises_1.mkdir)(worktreesDir(repoRoot), { recursive: true });
    const fetchEnv = { ...process.env, ...GIT_NO_PROMPT_ENV };
    let baseBranch;
    let baseSha = null;
    if (options?.prNumber) {
        const { code: prFetchCode, stderr: prFetchStderr } = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['fetch', 'origin', `pull/${options.prNumber}/head`], { cwd: repoRoot, stdin: 'ignore', env: fetchEnv });
        if (prFetchCode !== 0) {
            throw new Error(`Failed to fetch PR #${options.prNumber}: ${prFetchStderr.trim() || 'PR may not exist or the repository may not have a remote named "origin"'}`);
        }
        baseBranch = 'FETCH_HEAD';
    }
    else {
        // If origin/<branch> already exists locally, skip fetch. In large repos
        // (210k files, 16M objects) fetch burns ~6-8s on a local commit-graph
        // scan before even hitting the network. A slightly stale base is fine —
        // the user can pull in the worktree if they want latest.
        // resolveRef reads the loose/packed ref directly; when it succeeds we
        // already have the SHA, so the later rev-parse is skipped entirely.
        const [defaultBranch, gitDir] = await Promise.all([
            (0, git_js_1.getDefaultBranch)(),
            (0, gitFilesystem_js_1.resolveGitDir)(repoRoot),
        ]);
        const originRef = `origin/${defaultBranch}`;
        const originSha = gitDir
            ? await (0, gitFilesystem_js_1.resolveRef)(gitDir, `refs/remotes/origin/${defaultBranch}`)
            : null;
        if (originSha) {
            baseBranch = originRef;
            baseSha = originSha;
        }
        else {
            const { code: fetchCode } = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['fetch', 'origin', defaultBranch], { cwd: repoRoot, stdin: 'ignore', env: fetchEnv });
            baseBranch = fetchCode === 0 ? originRef : 'HEAD';
        }
    }
    // For the fetch/PR-fetch paths we still need the SHA — the fs-only resolveRef
    // above only covers the "origin/<branch> already exists locally" case.
    if (!baseSha) {
        const { stdout, code: shaCode } = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['rev-parse', baseBranch], { cwd: repoRoot });
        if (shaCode !== 0) {
            throw new Error(`Failed to resolve base branch "${baseBranch}": git rev-parse failed`);
        }
        baseSha = stdout.trim();
    }
    const sparsePaths = (0, settings_js_1.getInitialSettings)().worktree?.sparsePaths;
    const addArgs = ['worktree', 'add'];
    if (sparsePaths?.length) {
        addArgs.push('--no-checkout');
    }
    // -B (not -b): reset any orphan branch left behind by a removed worktree dir.
    // Saves a `git branch -D` subprocess (~15ms spawn overhead) on every create.
    addArgs.push('-B', worktreeBranch, worktreePath, baseBranch);
    const { code: createCode, stderr: createStderr } = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), addArgs, { cwd: repoRoot });
    if (createCode !== 0) {
        throw new Error(`Failed to create worktree: ${createStderr}`);
    }
    if (sparsePaths?.length) {
        // If sparse-checkout or checkout fail after --no-checkout, the worktree
        // is registered and HEAD is set but the working tree is empty. Next run's
        // fast-resume (rev-parse HEAD) would succeed and present a broken worktree
        // as "resumed". Tear it down before propagating the error.
        const tearDown = async (msg) => {
            await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['worktree', 'remove', '--force', worktreePath], { cwd: repoRoot });
            throw new Error(msg);
        };
        const { code: sparseCode, stderr: sparseErr } = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['sparse-checkout', 'set', '--cone', '--', ...sparsePaths], { cwd: worktreePath });
        if (sparseCode !== 0) {
            await tearDown(`Failed to configure sparse-checkout: ${sparseErr}`);
        }
        const { code: coCode, stderr: coErr } = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['checkout', 'HEAD'], { cwd: worktreePath });
        if (coCode !== 0) {
            await tearDown(`Failed to checkout sparse worktree: ${coErr}`);
        }
    }
    return {
        worktreePath,
        worktreeBranch,
        headCommit: baseSha,
        baseBranch,
        existed: false,
    };
}
/**
 * Copy gitignored files specified in .worktreeinclude from base repo to worktree.
 *
 * Only copies files that are BOTH:
 * 1. Matched by patterns in .worktreeinclude (uses .gitignore syntax)
 * 2. Gitignored (not tracked by git)
 *
 * Uses `git ls-files --others --ignored --exclude-standard --directory` to list
 * gitignored entries with fully-ignored dirs collapsed to single entries (so large
 * build outputs like node_modules/ don't force a full tree walk), then filters
 * against .worktreeinclude patterns in-process using the `ignore` library. If a
 * .worktreeinclude pattern explicitly targets a path inside a collapsed directory,
 * that directory is expanded with a second scoped `ls-files` call.
 */
async function copyWorktreeIncludeFiles(repoRoot, worktreePath) {
    let includeContent;
    try {
        includeContent = await (0, promises_1.readFile)((0, path_1.join)(repoRoot, '.worktreeinclude'), 'utf-8');
    }
    catch {
        return [];
    }
    const patterns = includeContent
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'));
    if (patterns.length === 0) {
        return [];
    }
    // Single pass with --directory: collapses fully-gitignored dirs (node_modules/,
    // .turbo/, etc.) into single entries instead of listing every file inside.
    // In a large repo this cuts ~500k entries/~7s down to ~hundreds of entries/~100ms.
    const gitignored = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory'], { cwd: repoRoot });
    if (gitignored.code !== 0 || !gitignored.stdout.trim()) {
        return [];
    }
    const entries = gitignored.stdout.trim().split('\n').filter(Boolean);
    const matcher = (0, ignore_1.default)().add(includeContent);
    // --directory emits collapsed dirs with a trailing slash; everything else is
    // an individual file.
    const collapsedDirs = entries.filter(e => e.endsWith('/'));
    const files = entries.filter(e => !e.endsWith('/') && matcher.ignores(e));
    // Edge case: a .worktreeinclude pattern targets a path inside a collapsed dir
    // (e.g. pattern `config/secrets/api.key` when all of `config/secrets/` is
    // gitignored with no tracked siblings). Expand only dirs where a pattern has
    // that dir as its explicit path prefix (stripping redundant leading `/`), the
    // dir falls under an anchored glob's literal prefix (e.g. `config/**/*.key`
    // expands `config/secrets/`), or the dir itself matches a pattern. We don't
    // expand for `**/` or anchorless patterns -- those match files in tracked dirs
    // (already listed individually) and expanding every collapsed dir for them
    // would defeat the perf win.
    const dirsToExpand = collapsedDirs.filter(dir => {
        if (patterns.some(p => {
            const normalized = p.startsWith('/') ? p.slice(1) : p;
            // Literal prefix match: pattern starts with the collapsed dir path
            if (normalized.startsWith(dir))
                return true;
            // Anchored glob: dir falls under the pattern's literal (non-glob) prefix
            // e.g. `config/**/*.key` has literal prefix `config/` → expand `config/secrets/`
            const globIdx = normalized.search(/[*?[]/);
            if (globIdx > 0) {
                const literalPrefix = normalized.slice(0, globIdx);
                if (dir.startsWith(literalPrefix))
                    return true;
            }
            return false;
        }))
            return true;
        if (matcher.ignores(dir.slice(0, -1)))
            return true;
        return false;
    });
    if (dirsToExpand.length > 0) {
        const expanded = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), [
            'ls-files',
            '--others',
            '--ignored',
            '--exclude-standard',
            '--',
            ...dirsToExpand,
        ], { cwd: repoRoot });
        if (expanded.code === 0 && expanded.stdout.trim()) {
            for (const f of expanded.stdout.trim().split('\n').filter(Boolean)) {
                if (matcher.ignores(f)) {
                    files.push(f);
                }
            }
        }
    }
    const copied = [];
    for (const relativePath of files) {
        const srcPath = (0, path_1.join)(repoRoot, relativePath);
        const destPath = (0, path_1.join)(worktreePath, relativePath);
        try {
            await (0, promises_1.mkdir)((0, path_1.dirname)(destPath), { recursive: true });
            await (0, promises_1.copyFile)(srcPath, destPath);
            copied.push(relativePath);
        }
        catch (e) {
            (0, debug_js_1.logForDebugging)(`Failed to copy ${relativePath} to worktree: ${e.message}`, { level: 'warn' });
        }
    }
    if (copied.length > 0) {
        (0, debug_js_1.logForDebugging)(`Copied ${copied.length} files from .worktreeinclude: ${copied.join(', ')}`);
    }
    return copied;
}
/**
 * Post-creation setup for a newly created worktree.
 * Propagates settings.local.json, configures git hooks, and symlinks directories.
 */
async function performPostCreationSetup(repoRoot, worktreePath) {
    // Copy settings.local.json to the worktree's .claude directory
    // This propagates local settings (which may contain secrets) to the worktree
    const localSettingsRelativePath = (0, settings_js_1.getRelativeSettingsFilePathForSource)('localSettings');
    const sourceSettingsLocal = (0, path_1.join)(repoRoot, localSettingsRelativePath);
    try {
        const destSettingsLocal = (0, path_1.join)(worktreePath, localSettingsRelativePath);
        await mkdirRecursive((0, path_1.dirname)(destSettingsLocal));
        await (0, promises_1.copyFile)(sourceSettingsLocal, destSettingsLocal);
        (0, debug_js_1.logForDebugging)(`Copied settings.local.json to worktree: ${destSettingsLocal}`);
    }
    catch (e) {
        const code = (0, errors_js_1.getErrnoCode)(e);
        if (code !== 'ENOENT') {
            (0, debug_js_1.logForDebugging)(`Failed to copy settings.local.json: ${e.message}`, { level: 'warn' });
        }
    }
    // Configure the worktree to use hooks from the main repository
    // This solves issues with .husky and other git hooks that use relative paths
    const huskyPath = (0, path_1.join)(repoRoot, '.husky');
    const gitHooksPath = (0, path_1.join)(repoRoot, '.git', 'hooks');
    let hooksPath = null;
    for (const candidatePath of [huskyPath, gitHooksPath]) {
        try {
            const s = await (0, promises_1.stat)(candidatePath);
            if (s.isDirectory()) {
                hooksPath = candidatePath;
                break;
            }
        }
        catch {
            // Path doesn't exist or can't be accessed
        }
    }
    if (hooksPath) {
        // `git config` (no --worktree flag) writes to the main repo's .git/config,
        // shared by all worktrees. Once set, every subsequent worktree create is a
        // no-op — skip the subprocess (~14ms spawn) when the value already matches.
        const gitDir = await (0, gitFilesystem_js_1.resolveGitDir)(repoRoot);
        const configDir = gitDir ? ((await (0, gitFilesystem_js_1.getCommonDir)(gitDir)) ?? gitDir) : null;
        const existing = configDir
            ? await (0, gitConfigParser_js_1.parseGitConfigValue)(configDir, 'core', null, 'hooksPath')
            : null;
        if (existing !== hooksPath) {
            const { code: configCode, stderr: configError } = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['config', 'core.hooksPath', hooksPath], { cwd: worktreePath });
            if (configCode === 0) {
                (0, debug_js_1.logForDebugging)(`Configured worktree to use hooks from main repository: ${hooksPath}`);
            }
            else {
                (0, debug_js_1.logForDebugging)(`Failed to configure hooks path: ${configError}`, {
                    level: 'error',
                });
            }
        }
    }
    // Symlink directories to avoid disk bloat (opt-in via settings)
    const settings = (0, settings_js_1.getInitialSettings)();
    const dirsToSymlink = settings.worktree?.symlinkDirectories ?? [];
    if (dirsToSymlink.length > 0) {
        await symlinkDirectories(repoRoot, worktreePath, dirsToSymlink);
    }
    // Copy gitignored files specified in .worktreeinclude (best-effort)
    await copyWorktreeIncludeFiles(repoRoot, worktreePath);
    // The core.hooksPath config-set above is fragile: husky's prepare script
    // (`git config core.hooksPath .husky`) runs on every `bun install` and
    // resets the SHARED .git/config value back to relative, causing each
    // worktree to resolve to its OWN .husky/ again. The attribution hook
    // file isn't tracked (it's in .git/info/exclude), so fresh worktrees
    // don't have it. Install it directly into the worktree's .husky/ —
    // husky won't delete it (husky install is additive-only), and for
    // non-husky repos this resolves to the shared .git/hooks/ (idempotent).
    //
    // Pass the worktree-local .husky explicitly: getHooksDir would return
    // the absolute core.hooksPath we just set above (main repo's .husky),
    // not the worktree's — `git rev-parse --git-path hooks` echoes the config
    // value verbatim when it's absolute.
    if ((0, bun_bundle_1.feature)('COMMIT_ATTRIBUTION')) {
        const worktreeHooksDir = hooksPath === huskyPath ? (0, path_1.join)(worktreePath, '.husky') : undefined;
        void Promise.resolve().then(() => __importStar(require('./postCommitAttribution.js'))).then(m => m
            .installPrepareCommitMsgHook(worktreePath, worktreeHooksDir)
            .catch(error => {
            (0, debug_js_1.logForDebugging)(`Failed to install attribution hook in worktree: ${error}`);
        }))
            .catch(error => {
            // Dynamic import() itself rejected (module load failure). The inner
            // .catch above only handles installPrepareCommitMsgHook rejection —
            // without this outer handler an import failure would surface as an
            // unhandled promise rejection.
            (0, debug_js_1.logForDebugging)(`Failed to load postCommitAttribution module: ${error}`);
        });
    }
}
/**
 * Parses a PR reference from a string.
 * Accepts GitHub-style PR URLs (e.g., https://github.com/owner/repo/pull/123,
 * or GHE equivalents like https://ghe.example.com/owner/repo/pull/123)
 * or `#N` format (e.g., #123).
 * Returns the PR number or null if the string is not a recognized PR reference.
 */
function parsePRReference(input) {
    // GitHub-style PR URL: https://<host>/owner/repo/pull/123 (with optional trailing slash, query, hash)
    // The /pull/N path shape is specific to GitHub — GitLab uses /-/merge_requests/N,
    // Bitbucket uses /pull-requests/N — so matching any host here is safe.
    const urlMatch = input.match(/^https?:\/\/[^/]+\/[^/]+\/[^/]+\/pull\/(\d+)\/?(?:[?#].*)?$/i);
    if (urlMatch?.[1]) {
        return parseInt(urlMatch[1], 10);
    }
    // #N format
    const hashMatch = input.match(/^#(\d+)$/);
    if (hashMatch?.[1]) {
        return parseInt(hashMatch[1], 10);
    }
    return null;
}
async function isTmuxAvailable() {
    const { code } = await (0, execFileNoThrow_js_1.execFileNoThrow)('tmux', ['-V']);
    return code === 0;
}
function getTmuxInstallInstructions() {
    const platform = (0, platform_js_1.getPlatform)();
    switch (platform) {
        case 'macos':
            return 'Install tmux with: brew install tmux';
        case 'linux':
        case 'wsl':
            return 'Install tmux with: sudo apt install tmux (Debian/Ubuntu) or sudo dnf install tmux (Fedora/RHEL)';
        case 'windows':
            return 'tmux is not natively available on Windows. Consider using WSL or Cygwin.';
        default:
            return 'Install tmux using your system package manager.';
    }
}
async function createTmuxSessionForWorktree(sessionName, worktreePath) {
    const { code, stderr } = await (0, execFileNoThrow_js_1.execFileNoThrow)('tmux', [
        'new-session',
        '-d',
        '-s',
        sessionName,
        '-c',
        worktreePath,
    ]);
    if (code !== 0) {
        return { created: false, error: stderr };
    }
    return { created: true };
}
async function killTmuxSession(sessionName) {
    const { code } = await (0, execFileNoThrow_js_1.execFileNoThrow)('tmux', [
        'kill-session',
        '-t',
        sessionName,
    ]);
    return code === 0;
}
async function createWorktreeForSession(sessionId, slug, tmuxSessionName, options) {
    // Must run before the hook branch below — hooks receive the raw slug as an
    // argument, and the git branch builds a path from it via path.join.
    validateWorktreeSlug(slug);
    const originalCwd = (0, cwd_js_1.getCwd)();
    // Try hook-based worktree creation first (allows user-configured VCS)
    if ((0, hooks_js_1.hasWorktreeCreateHook)()) {
        const hookResult = await (0, hooks_js_1.executeWorktreeCreateHook)(slug);
        (0, debug_js_1.logForDebugging)(`Created hook-based worktree at: ${hookResult.worktreePath}`);
        currentWorktreeSession = {
            originalCwd,
            worktreePath: hookResult.worktreePath,
            worktreeName: slug,
            sessionId,
            tmuxSessionName,
            hookBased: true,
        };
    }
    else {
        // Fall back to git worktree
        const gitRoot = (0, git_js_1.findGitRoot)((0, cwd_js_1.getCwd)());
        if (!gitRoot) {
            throw new Error('Cannot create a worktree: not in a git repository and no WorktreeCreate hooks are configured. ' +
                'Configure WorktreeCreate/WorktreeRemove hooks in settings.json to use worktree isolation with other VCS systems.');
        }
        const originalBranch = await (0, git_js_1.getBranch)();
        const createStart = Date.now();
        const { worktreePath, worktreeBranch, headCommit, existed } = await getOrCreateWorktree(gitRoot, slug, options);
        let creationDurationMs;
        if (existed) {
            (0, debug_js_1.logForDebugging)(`Resuming existing worktree at: ${worktreePath}`);
        }
        else {
            (0, debug_js_1.logForDebugging)(`Created worktree at: ${worktreePath} on branch: ${worktreeBranch}`);
            await performPostCreationSetup(gitRoot, worktreePath);
            creationDurationMs = Date.now() - createStart;
        }
        currentWorktreeSession = {
            originalCwd,
            worktreePath,
            worktreeName: slug,
            worktreeBranch,
            originalBranch,
            originalHeadCommit: headCommit,
            sessionId,
            tmuxSessionName,
            creationDurationMs,
            usedSparsePaths: ((0, settings_js_1.getInitialSettings)().worktree?.sparsePaths?.length ?? 0) > 0,
        };
    }
    // Save to project config for persistence
    (0, config_js_1.saveCurrentProjectConfig)(current => ({
        ...current,
        activeWorktreeSession: currentWorktreeSession ?? undefined,
    }));
    return currentWorktreeSession;
}
async function keepWorktree() {
    if (!currentWorktreeSession) {
        return;
    }
    try {
        const { worktreePath, originalCwd, worktreeBranch } = currentWorktreeSession;
        // Change back to original directory first
        process.chdir(originalCwd);
        // Clear the session but keep the worktree intact
        currentWorktreeSession = null;
        // Update config
        (0, config_js_1.saveCurrentProjectConfig)(current => ({
            ...current,
            activeWorktreeSession: undefined,
        }));
        (0, debug_js_1.logForDebugging)(`Linked worktree preserved at: ${worktreePath}${worktreeBranch ? ` on branch: ${worktreeBranch}` : ''}`);
        (0, debug_js_1.logForDebugging)(`You can continue working there by running: cd ${worktreePath}`);
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`Error keeping worktree: ${error}`, {
            level: 'error',
        });
    }
}
async function cleanupWorktree() {
    if (!currentWorktreeSession) {
        return;
    }
    try {
        const { worktreePath, originalCwd, worktreeBranch, hookBased } = currentWorktreeSession;
        // Change back to original directory first
        process.chdir(originalCwd);
        if (hookBased) {
            // Hook-based worktree: delegate cleanup to WorktreeRemove hook
            const hookRan = await (0, hooks_js_1.executeWorktreeRemoveHook)(worktreePath);
            if (hookRan) {
                (0, debug_js_1.logForDebugging)(`Removed hook-based worktree at: ${worktreePath}`);
            }
            else {
                (0, debug_js_1.logForDebugging)(`No WorktreeRemove hook configured, hook-based worktree left at: ${worktreePath}`, { level: 'warn' });
            }
        }
        else {
            // Git-based worktree: use git worktree remove.
            // Explicit cwd: process.chdir above does NOT update getCwd() (the state
            // CWD that execFileNoThrow defaults to). If the model cd'd to a non-repo
            // dir, the bare execFileNoThrow variant would fail silently here.
            const { code: removeCode, stderr: removeError } = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['worktree', 'remove', '--force', worktreePath], { cwd: originalCwd });
            if (removeCode !== 0) {
                (0, debug_js_1.logForDebugging)(`Failed to remove linked worktree: ${removeError}`, {
                    level: 'error',
                });
            }
            else {
                (0, debug_js_1.logForDebugging)(`Removed linked worktree at: ${worktreePath}`);
            }
        }
        // Clear the session
        currentWorktreeSession = null;
        // Update config
        (0, config_js_1.saveCurrentProjectConfig)(current => ({
            ...current,
            activeWorktreeSession: undefined,
        }));
        // Delete the temporary worktree branch (git-based only)
        if (!hookBased && worktreeBranch) {
            // Wait a bit to ensure git has released all locks
            await (0, sleep_js_1.sleep)(100);
            const { code: deleteBranchCode, stderr: deleteBranchError } = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['branch', '-D', worktreeBranch], { cwd: originalCwd });
            if (deleteBranchCode !== 0) {
                (0, debug_js_1.logForDebugging)(`Could not delete worktree branch: ${deleteBranchError}`, { level: 'error' });
            }
            else {
                (0, debug_js_1.logForDebugging)(`Deleted worktree branch: ${worktreeBranch}`);
            }
        }
        (0, debug_js_1.logForDebugging)('Linked worktree cleaned up completely');
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`Error cleaning up worktree: ${error}`, {
            level: 'error',
        });
    }
}
/**
 * Create a lightweight worktree for a subagent.
 * Reuses getOrCreateWorktree/performPostCreationSetup but does NOT touch
 * global session state (currentWorktreeSession, process.chdir, project config).
 * Falls back to hook-based creation if not in a git repository.
 */
async function createAgentWorktree(slug) {
    validateWorktreeSlug(slug);
    // Try hook-based worktree creation first (allows user-configured VCS)
    if ((0, hooks_js_1.hasWorktreeCreateHook)()) {
        const hookResult = await (0, hooks_js_1.executeWorktreeCreateHook)(slug);
        (0, debug_js_1.logForDebugging)(`Created hook-based agent worktree at: ${hookResult.worktreePath}`);
        return { worktreePath: hookResult.worktreePath, hookBased: true };
    }
    // Fall back to git worktree
    // findCanonicalGitRoot (not findGitRoot) so agent worktrees always land in
    // the main repo's .claude/worktrees/ even when spawned from inside a session
    // worktree — otherwise they nest at <worktree>/.claude/worktrees/ and the
    // periodic cleanup (which scans the canonical root) never finds them.
    const gitRoot = (0, git_js_1.findCanonicalGitRoot)((0, cwd_js_1.getCwd)());
    if (!gitRoot) {
        throw new Error('Cannot create agent worktree: not in a git repository and no WorktreeCreate hooks are configured. ' +
            'Configure WorktreeCreate/WorktreeRemove hooks in settings.json to use worktree isolation with other VCS systems.');
    }
    const { worktreePath, worktreeBranch, headCommit, existed } = await getOrCreateWorktree(gitRoot, slug);
    if (!existed) {
        (0, debug_js_1.logForDebugging)(`Created agent worktree at: ${worktreePath} on branch: ${worktreeBranch}`);
        await performPostCreationSetup(gitRoot, worktreePath);
    }
    else {
        // Bump mtime so the periodic stale-worktree cleanup doesn't consider this
        // worktree stale — the fast-resume path is read-only and leaves the original
        // creation-time mtime intact, which can be past the 30-day cutoff.
        const now = new Date();
        await (0, promises_1.utimes)(worktreePath, now, now);
        (0, debug_js_1.logForDebugging)(`Resuming existing agent worktree at: ${worktreePath}`);
    }
    return { worktreePath, worktreeBranch, headCommit, gitRoot };
}
/**
 * Remove a worktree created by createAgentWorktree.
 * For git-based worktrees, removes the worktree directory and deletes the temporary branch.
 * For hook-based worktrees, delegates to the WorktreeRemove hook.
 * Must be called with the main repo's git root (for git worktrees), not the worktree path,
 * since the worktree directory is deleted during this operation.
 */
async function removeAgentWorktree(worktreePath, worktreeBranch, gitRoot, hookBased) {
    if (hookBased) {
        const hookRan = await (0, hooks_js_1.executeWorktreeRemoveHook)(worktreePath);
        if (hookRan) {
            (0, debug_js_1.logForDebugging)(`Removed hook-based agent worktree at: ${worktreePath}`);
        }
        else {
            (0, debug_js_1.logForDebugging)(`No WorktreeRemove hook configured, hook-based agent worktree left at: ${worktreePath}`, { level: 'warn' });
        }
        return hookRan;
    }
    if (!gitRoot) {
        (0, debug_js_1.logForDebugging)('Cannot remove agent worktree: no git root provided', {
            level: 'error',
        });
        return false;
    }
    // Run from the main repo root, not the worktree (which we're about to delete)
    const { code: removeCode, stderr: removeError } = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['worktree', 'remove', '--force', worktreePath], { cwd: gitRoot });
    if (removeCode !== 0) {
        (0, debug_js_1.logForDebugging)(`Failed to remove agent worktree: ${removeError}`, {
            level: 'error',
        });
        return false;
    }
    (0, debug_js_1.logForDebugging)(`Removed agent worktree at: ${worktreePath}`);
    if (!worktreeBranch) {
        return true;
    }
    // Delete the temporary worktree branch from the main repo
    const { code: deleteBranchCode, stderr: deleteBranchError } = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['branch', '-D', worktreeBranch], {
        cwd: gitRoot,
    });
    if (deleteBranchCode !== 0) {
        (0, debug_js_1.logForDebugging)(`Could not delete agent worktree branch: ${deleteBranchError}`, { level: 'error' });
    }
    return true;
}
/**
 * Slug patterns for throwaway worktrees created by AgentTool (`agent-a<7hex>`,
 * from earlyAgentId.slice(0,8)), WorkflowTool (`wf_<runId>-<idx>` where runId
 * is randomUUID().slice(0,12) = 8 hex + `-` + 3 hex), and bridgeMain
 * (`bridge-<safeFilenameId>`). These leak when the parent process is killed
 * (Ctrl+C, ESC, crash) before their in-process cleanup runs. Exact-shape
 * patterns avoid sweeping user-named EnterWorktree slugs like `wf-myfeature`.
 */
const EPHEMERAL_WORKTREE_PATTERNS = [
    /^agent-a[0-9a-f]{7}$/,
    /^wf_[0-9a-f]{8}-[0-9a-f]{3}-\d+$/,
    // Legacy wf-<idx> slugs from before workflowRunId disambiguation — kept so
    // the 30-day sweep still cleans up worktrees leaked by older builds.
    /^wf-\d+$/,
    // Real bridge slugs are `bridge-${safeFilenameId(sessionId)}`.
    /^bridge-[A-Za-z0-9_]+(-[A-Za-z0-9_]+)*$/,
    // Template job worktrees: job-<templateName>-<8hex>. Prefix distinguishes
    // from user-named EnterWorktree slugs that happen to end in 8 hex.
    /^job-[a-zA-Z0-9._-]{1,55}-[0-9a-f]{8}$/,
];
/**
 * Remove stale agent/workflow worktrees older than cutoffDate.
 *
 * Safety:
 * - Only touches slugs matching ephemeral patterns (never user-named worktrees)
 * - Skips the current session's worktree
 * - Fail-closed: skips if git status fails or shows tracked changes
 *   (-uno: untracked files in a 30-day-old crashed agent worktree are build
 *   artifacts; skipping the untracked scan is 5-10× faster on large repos)
 * - Fail-closed: skips if any commits aren't reachable from a remote
 *
 * `git worktree remove --force` handles both the directory and git's internal
 * worktree tracking. If git doesn't recognize the path as a worktree (orphaned
 * dir), it's left in place — a later readdir finding it stale again is harmless.
 */
async function cleanupStaleAgentWorktrees(cutoffDate) {
    const gitRoot = (0, git_js_1.findCanonicalGitRoot)((0, cwd_js_1.getCwd)());
    if (!gitRoot) {
        return 0;
    }
    const dir = worktreesDir(gitRoot);
    let entries;
    try {
        entries = await (0, promises_1.readdir)(dir);
    }
    catch {
        return 0;
    }
    const cutoffMs = cutoffDate.getTime();
    const currentPath = currentWorktreeSession?.worktreePath;
    let removed = 0;
    for (const slug of entries) {
        if (!EPHEMERAL_WORKTREE_PATTERNS.some(p => p.test(slug))) {
            continue;
        }
        const worktreePath = (0, path_1.join)(dir, slug);
        if (currentPath === worktreePath) {
            continue;
        }
        let mtimeMs;
        try {
            mtimeMs = (await (0, promises_1.stat)(worktreePath)).mtimeMs;
        }
        catch {
            continue;
        }
        if (mtimeMs >= cutoffMs) {
            continue;
        }
        // Both checks must succeed with empty output. Non-zero exit (corrupted
        // worktree, git not recognizing it, etc.) means skip — we don't know
        // what's in there.
        const [status, unpushed] = await Promise.all([
            (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['--no-optional-locks', 'status', '--porcelain', '-uno'], { cwd: worktreePath }),
            (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['rev-list', '--max-count=1', 'HEAD', '--not', '--remotes'], { cwd: worktreePath }),
        ]);
        if (status.code !== 0 || status.stdout.trim().length > 0) {
            continue;
        }
        if (unpushed.code !== 0 || unpushed.stdout.trim().length > 0) {
            continue;
        }
        if (await removeAgentWorktree(worktreePath, worktreeBranchName(slug), gitRoot)) {
            removed++;
        }
    }
    if (removed > 0) {
        await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['worktree', 'prune'], {
            cwd: gitRoot,
        });
        (0, debug_js_1.logForDebugging)(`cleanupStaleAgentWorktrees: removed ${removed} stale worktree(s)`);
    }
    return removed;
}
/**
 * Check whether a worktree has uncommitted changes or new commits since creation.
 * Returns true if there are uncommitted changes (dirty working tree), if commits
 * were made on the worktree branch since `headCommit`, or if git commands fail
 * — callers use this to decide whether to remove a worktree, so fail-closed.
 */
async function hasWorktreeChanges(worktreePath, headCommit) {
    const { code: statusCode, stdout: statusOutput } = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['status', '--porcelain'], {
        cwd: worktreePath,
    });
    if (statusCode !== 0) {
        return true;
    }
    if (statusOutput.trim().length > 0) {
        return true;
    }
    const { code: revListCode, stdout: revListOutput } = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['rev-list', '--count', `${headCommit}..HEAD`], { cwd: worktreePath });
    if (revListCode !== 0) {
        return true;
    }
    if (parseInt(revListOutput.trim(), 10) > 0) {
        return true;
    }
    return false;
}
/**
 * Fast-path handler for --worktree --tmux.
 * Creates the worktree and execs into tmux running Claude inside.
 * This is called early in cli.tsx before loading the full CLI.
 */
async function execIntoTmuxWorktree(args) {
    // Check platform - tmux doesn't work on Windows
    if (process.platform === 'win32') {
        return {
            handled: false,
            error: 'Error: --tmux is not supported on Windows',
        };
    }
    // Check if tmux is available
    const tmuxCheck = (0, child_process_1.spawnSync)('tmux', ['-V'], { encoding: 'utf-8' });
    if (tmuxCheck.status !== 0) {
        const installHint = process.platform === 'darwin'
            ? 'Install tmux with: brew install tmux'
            : 'Install tmux with: sudo apt install tmux';
        return {
            handled: false,
            error: `Error: tmux is not installed. ${installHint}`,
        };
    }
    // Parse worktree name and tmux mode from args
    let worktreeName;
    let forceClassicTmux = false;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg)
            continue;
        if (arg === '-w' || arg === '--worktree') {
            // Check if next arg exists and isn't another flag
            const next = args[i + 1];
            if (next && !next.startsWith('-')) {
                worktreeName = next;
            }
        }
        else if (arg.startsWith('--worktree=')) {
            worktreeName = arg.slice('--worktree='.length);
        }
        else if (arg === '--tmux=classic') {
            forceClassicTmux = true;
        }
    }
    // Check if worktree name is a PR reference
    let prNumber = null;
    if (worktreeName) {
        prNumber = parsePRReference(worktreeName);
        if (prNumber !== null) {
            worktreeName = `pr-${prNumber}`;
        }
    }
    // Generate a slug if no name provided
    if (!worktreeName) {
        const adjectives = ['swift', 'bright', 'calm', 'keen', 'bold'];
        const nouns = ['fox', 'owl', 'elm', 'oak', 'ray'];
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        const suffix = Math.random().toString(36).slice(2, 6);
        worktreeName = `${adj}-${noun}-${suffix}`;
    }
    // worktreeName is joined into worktreeDir via path.join below; apply the
    // same allowlist used by the in-session worktree tool so the constraint
    // holds uniformly regardless of entry point.
    try {
        validateWorktreeSlug(worktreeName);
    }
    catch (e) {
        return {
            handled: false,
            error: `Error: ${e.message}`,
        };
    }
    // Mirror createWorktreeForSession(): hook takes precedence over git so the
    // WorktreeCreate hook substitutes the VCS backend for this fast-path too
    // (anthropics/claude-code#39281). Git path below runs only when no hook.
    let worktreeDir;
    let repoName;
    if ((0, hooks_js_1.hasWorktreeCreateHook)()) {
        try {
            const hookResult = await (0, hooks_js_1.executeWorktreeCreateHook)(worktreeName);
            worktreeDir = hookResult.worktreePath;
        }
        catch (error) {
            return {
                handled: false,
                error: `Error: ${(0, errors_js_1.errorMessage)(error)}`,
            };
        }
        repoName = (0, path_1.basename)((0, git_js_1.findCanonicalGitRoot)((0, cwd_js_1.getCwd)()) ?? (0, cwd_js_1.getCwd)());
        // biome-ignore lint/suspicious/noConsole: intentional console output
        console.log(`Using worktree via hook: ${worktreeDir}`);
    }
    else {
        // Get main git repo root (resolves through worktrees)
        const repoRoot = (0, git_js_1.findCanonicalGitRoot)((0, cwd_js_1.getCwd)());
        if (!repoRoot) {
            return {
                handled: false,
                error: 'Error: --worktree requires a git repository',
            };
        }
        repoName = (0, path_1.basename)(repoRoot);
        worktreeDir = worktreePathFor(repoRoot, worktreeName);
        // Create or resume worktree
        try {
            const result = await getOrCreateWorktree(repoRoot, worktreeName, prNumber !== null ? { prNumber } : undefined);
            if (!result.existed) {
                // biome-ignore lint/suspicious/noConsole: intentional console output
                console.log(`Created worktree: ${worktreeDir} (based on ${result.baseBranch})`);
                await performPostCreationSetup(repoRoot, worktreeDir);
            }
        }
        catch (error) {
            return {
                handled: false,
                error: `Error: ${(0, errors_js_1.errorMessage)(error)}`,
            };
        }
    }
    // Sanitize for tmux session name (replace / and . with _)
    const tmuxSessionName = `${repoName}_${worktreeBranchName(worktreeName)}`.replace(/[/.]/g, '_');
    // Build new args without --tmux and --worktree (we're already in the worktree)
    const newArgs = [];
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg)
            continue;
        if (arg === '--tmux' || arg === '--tmux=classic')
            continue;
        if (arg === '-w' || arg === '--worktree') {
            // Skip the flag and its value if present
            const next = args[i + 1];
            if (next && !next.startsWith('-')) {
                i++; // Skip the value too
            }
            continue;
        }
        if (arg.startsWith('--worktree='))
            continue;
        newArgs.push(arg);
    }
    // Get tmux prefix for user guidance
    let tmuxPrefix = 'C-b'; // default
    const prefixResult = (0, child_process_1.spawnSync)('tmux', ['show-options', '-g', 'prefix'], {
        encoding: 'utf-8',
    });
    if (prefixResult.status === 0 && prefixResult.stdout) {
        const match = prefixResult.stdout.match(/prefix\s+(\S+)/);
        if (match?.[1]) {
            tmuxPrefix = match[1];
        }
    }
    // Check if tmux prefix conflicts with Claude keybindings
    // Claude binds: ctrl+b (task:background), ctrl+c, ctrl+d, ctrl+t, ctrl+o, ctrl+r, ctrl+s, ctrl+g, ctrl+e
    const claudeBindings = [
        'C-b',
        'C-c',
        'C-d',
        'C-t',
        'C-o',
        'C-r',
        'C-s',
        'C-g',
        'C-e',
    ];
    const prefixConflicts = claudeBindings.includes(tmuxPrefix);
    // Set env vars for the inner Claude to display tmux info in welcome message
    const tmuxEnv = {
        ...process.env,
        CLAUDE_CODE_TMUX_SESSION: tmuxSessionName,
        CLAUDE_CODE_TMUX_PREFIX: tmuxPrefix,
        CLAUDE_CODE_TMUX_PREFIX_CONFLICTS: prefixConflicts ? '1' : '',
    };
    // Check if session already exists
    const hasSessionResult = (0, child_process_1.spawnSync)('tmux', ['has-session', '-t', tmuxSessionName], { encoding: 'utf-8' });
    const sessionExists = hasSessionResult.status === 0;
    // Check if we're already inside a tmux session
    const isAlreadyInTmux = Boolean(process.env.TMUX);
    // Use tmux control mode (-CC) for native iTerm2 tab/pane integration
    // This lets users use iTerm2's UI instead of learning tmux keybindings
    // Use --tmux=classic to force traditional tmux even in iTerm2
    // Control mode doesn't make sense when already in tmux (would need to switch-client)
    const useControlMode = (0, detection_js_1.isInITerm2)() && !forceClassicTmux && !isAlreadyInTmux;
    const tmuxGlobalArgs = useControlMode ? ['-CC'] : [];
    // Print hint about iTerm2 preferences when using control mode
    if (useControlMode && !sessionExists) {
        const y = chalk_1.default.yellow;
        // biome-ignore lint/suspicious/noConsole: intentional user guidance
        console.log(`\n${y('╭─ iTerm2 Tip ────────────────────────────────────────────────────────╮')}\n` +
            `${y('│')} To open as a tab instead of a new window:                           ${y('│')}\n` +
            `${y('│')} iTerm2 > Settings > General > tmux > "Tabs in attaching window"     ${y('│')}\n` +
            `${y('╰─────────────────────────────────────────────────────────────────────╯')}\n`);
    }
    // For ants in claude-cli-internal, set up dev panes (watch + start)
    const isAnt = process.env.USER_TYPE === 'ant';
    const isClaudeCliInternal = repoName === 'claude-cli-internal';
    const shouldSetupDevPanes = isAnt && isClaudeCliInternal && !sessionExists;
    if (shouldSetupDevPanes) {
        // Create detached session with Claude in first pane
        (0, child_process_1.spawnSync)('tmux', [
            'new-session',
            '-d', // detached
            '-s',
            tmuxSessionName,
            '-c',
            worktreeDir,
            '--',
            process.execPath,
            ...newArgs,
        ], { cwd: worktreeDir, env: tmuxEnv });
        // Split horizontally and run watch
        (0, child_process_1.spawnSync)('tmux', ['split-window', '-h', '-t', tmuxSessionName, '-c', worktreeDir], { cwd: worktreeDir });
        (0, child_process_1.spawnSync)('tmux', ['send-keys', '-t', tmuxSessionName, 'bun run watch', 'Enter'], { cwd: worktreeDir });
        // Split vertically and run start
        (0, child_process_1.spawnSync)('tmux', ['split-window', '-v', '-t', tmuxSessionName, '-c', worktreeDir], { cwd: worktreeDir });
        (0, child_process_1.spawnSync)('tmux', ['send-keys', '-t', tmuxSessionName, 'bun run start'], {
            cwd: worktreeDir,
        });
        // Select the first pane (Claude)
        (0, child_process_1.spawnSync)('tmux', ['select-pane', '-t', `${tmuxSessionName}:0.0`], {
            cwd: worktreeDir,
        });
        // Attach or switch to the session
        if (isAlreadyInTmux) {
            // Switch to sibling session (avoid nesting)
            (0, child_process_1.spawnSync)('tmux', ['switch-client', '-t', tmuxSessionName], {
                stdio: 'inherit',
            });
        }
        else {
            // Attach to the session
            (0, child_process_1.spawnSync)('tmux', [...tmuxGlobalArgs, 'attach-session', '-t', tmuxSessionName], {
                stdio: 'inherit',
                cwd: worktreeDir,
            });
        }
    }
    else {
        // Standard behavior: create or attach
        if (isAlreadyInTmux) {
            // Already in tmux - create detached session, then switch to it (sibling)
            // Check if session already exists first
            if (sessionExists) {
                // Just switch to existing session
                (0, child_process_1.spawnSync)('tmux', ['switch-client', '-t', tmuxSessionName], {
                    stdio: 'inherit',
                });
            }
            else {
                // Create new detached session
                (0, child_process_1.spawnSync)('tmux', [
                    'new-session',
                    '-d', // detached
                    '-s',
                    tmuxSessionName,
                    '-c',
                    worktreeDir,
                    '--',
                    process.execPath,
                    ...newArgs,
                ], { cwd: worktreeDir, env: tmuxEnv });
                // Switch to the new session
                (0, child_process_1.spawnSync)('tmux', ['switch-client', '-t', tmuxSessionName], {
                    stdio: 'inherit',
                });
            }
        }
        else {
            // Not in tmux - create and attach (original behavior)
            const tmuxArgs = [
                ...tmuxGlobalArgs,
                'new-session',
                '-A', // Attach if exists, create if not
                '-s',
                tmuxSessionName,
                '-c',
                worktreeDir,
                '--', // Separator before command
                process.execPath,
                ...newArgs,
            ];
            (0, child_process_1.spawnSync)('tmux', tmuxArgs, {
                stdio: 'inherit',
                cwd: worktreeDir,
                env: tmuxEnv,
            });
        }
    }
    return { handled: true };
}
