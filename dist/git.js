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
exports.stashToCleanState = exports.getWorktreeCount = exports.getFileStatus = exports.getChangedFiles = exports.getIsClean = exports.hasUnpushedCommits = exports.getIsHeadOnRemote = exports.getRemoteUrl = exports.getDefaultBranch = exports.getBranch = exports.getHead = exports.dirIsInGitRepo = exports.getIsGit = exports.gitExe = exports.findCanonicalGitRoot = exports.findGitRoot = void 0;
exports.getGitDir = getGitDir;
exports.isAtGitRoot = isAtGitRoot;
exports.normalizeGitRemoteUrl = normalizeGitRemoteUrl;
exports.getRepoRemoteHash = getRepoRemoteHash;
exports.getGitState = getGitState;
exports.getGithubRepo = getGithubRepo;
exports.findRemoteBase = findRemoteBase;
exports.preserveGitStateForIssue = preserveGitStateForIssue;
exports.isCurrentDirectoryBareGitRepo = isCurrentDirectoryBareGitRepo;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const path_1 = require("path");
const files_js_1 = require("../constants/files.js");
const cwd_js_1 = require("./cwd.js");
const debug_js_1 = require("./debug.js");
const diagLogs_js_1 = require("./diagLogs.js");
const execFileNoThrow_js_1 = require("./execFileNoThrow.js");
const fsOperations_js_1 = require("./fsOperations.js");
const gitFilesystem_js_1 = require("./git/gitFilesystem.js");
const log_js_1 = require("./log.js");
const memoize_js_2 = require("./memoize.js");
const which_js_1 = require("./which.js");
const GIT_ROOT_NOT_FOUND = Symbol('git-root-not-found');
const findGitRootImpl = (0, memoize_js_2.memoizeWithLRU)((startPath) => {
    const startTime = Date.now();
    (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'find_git_root_started');
    let current = (0, path_1.resolve)(startPath);
    const root = current.substring(0, current.indexOf(path_1.sep) + 1) || path_1.sep;
    let statCount = 0;
    while (current !== root) {
        try {
            const gitPath = (0, path_1.join)(current, '.git');
            statCount++;
            const stat = (0, fs_1.statSync)(gitPath);
            // .git can be a directory (regular repo) or file (worktree/submodule)
            if (stat.isDirectory() || stat.isFile()) {
                (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'find_git_root_completed', {
                    duration_ms: Date.now() - startTime,
                    stat_count: statCount,
                    found: true,
                });
                return current.normalize('NFC');
            }
        }
        catch {
            // .git doesn't exist at this level, continue up
        }
        const parent = (0, path_1.dirname)(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }
    // Check root directory as well
    try {
        const gitPath = (0, path_1.join)(root, '.git');
        statCount++;
        const stat = (0, fs_1.statSync)(gitPath);
        if (stat.isDirectory() || stat.isFile()) {
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'find_git_root_completed', {
                duration_ms: Date.now() - startTime,
                stat_count: statCount,
                found: true,
            });
            return root.normalize('NFC');
        }
    }
    catch {
        // .git doesn't exist at root
    }
    (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'find_git_root_completed', {
        duration_ms: Date.now() - startTime,
        stat_count: statCount,
        found: false,
    });
    return GIT_ROOT_NOT_FOUND;
}, path => path, 50);
/**
 * Find the git root by walking up the directory tree.
 * Looks for a .git directory or file (worktrees/submodules use a file).
 * Returns the directory containing .git, or null if not found.
 *
 * Memoized per startPath with an LRU cache (max 50 entries) to prevent
 * unbounded growth — gitDiff calls this with dirname(file), so editing many
 * files across different directories would otherwise accumulate entries forever.
 */
exports.findGitRoot = createFindGitRoot();
function createFindGitRoot() {
    function wrapper(startPath) {
        const result = findGitRootImpl(startPath);
        return result === GIT_ROOT_NOT_FOUND ? null : result;
    }
    wrapper.cache = findGitRootImpl.cache;
    return wrapper;
}
/**
 * Resolve a git root to the canonical main repository root.
 * For a regular repo this is a no-op. For a worktree, follows the
 * `.git` file → `gitdir:` → `commondir` chain to find the main repo's
 * working directory.
 *
 * Submodules (`.git` is a file but no `commondir`) fall through to the
 * input root, which is correct since submodules are separate repos.
 *
 * Memoized with a small LRU to avoid repeated file reads on the hot
 * path (permission checks, prompt building).
 */
const resolveCanonicalRoot = (0, memoize_js_2.memoizeWithLRU)((gitRoot) => {
    try {
        // In a worktree, .git is a file containing: gitdir: <path>
        // In a regular repo, .git is a directory (readFileSync throws EISDIR).
        const gitContent = (0, fs_1.readFileSync)((0, path_1.join)(gitRoot, '.git'), 'utf-8').trim();
        if (!gitContent.startsWith('gitdir:')) {
            return gitRoot;
        }
        const worktreeGitDir = (0, path_1.resolve)(gitRoot, gitContent.slice('gitdir:'.length).trim());
        // commondir points to the shared .git directory (relative to worktree gitdir).
        // Submodules have no commondir (readFileSync throws ENOENT) → fall through.
        const commonDir = (0, path_1.resolve)(worktreeGitDir, (0, fs_1.readFileSync)((0, path_1.join)(worktreeGitDir, 'commondir'), 'utf-8').trim());
        // SECURITY: The .git file and commondir are attacker-controlled in a
        // cloned/downloaded repo. Without validation, a malicious repo can point
        // commondir at any path the victim has trusted, bypassing the trust
        // dialog and executing hooks from .claude/settings.json on startup.
        //
        // Validate the structure matches what `git worktree add` creates:
        //   1. worktreeGitDir is a direct child of <commonDir>/worktrees/
        //      → ensures the commondir file we read lives inside the resolved
        //        common dir, not inside the attacker's repo
        //   2. <worktreeGitDir>/gitdir points back to <gitRoot>/.git
        //      → ensures an attacker can't borrow a victim's existing worktree
        //        entry by guessing its path
        // Both are required: (1) alone fails if victim has a worktree of the
        // trusted repo; (2) alone fails because attacker controls worktreeGitDir.
        if ((0, path_1.resolve)((0, path_1.dirname)(worktreeGitDir)) !== (0, path_1.join)(commonDir, 'worktrees')) {
            return gitRoot;
        }
        // Git writes gitdir with strbuf_realpath() (symlinks resolved), but
        // gitRoot from findGitRoot() is only lexically resolved. Realpath gitRoot
        // so legitimate worktrees accessed via a symlinked path (e.g. macOS
        // /tmp → /private/tmp) aren't rejected. Realpath the directory then join
        // '.git' — realpathing the .git file itself would follow a symlinked .git
        // and let an attacker borrow a victim's back-link.
        const backlink = (0, fs_1.realpathSync)((0, fs_1.readFileSync)((0, path_1.join)(worktreeGitDir, 'gitdir'), 'utf-8').trim());
        if (backlink !== (0, path_1.join)((0, fs_1.realpathSync)(gitRoot), '.git')) {
            return gitRoot;
        }
        // Bare-repo worktrees: the common dir isn't inside a working directory.
        // Use the common dir itself as the stable identity (anthropics/claude-code#27994).
        if ((0, path_1.basename)(commonDir) !== '.git') {
            return commonDir.normalize('NFC');
        }
        return (0, path_1.dirname)(commonDir).normalize('NFC');
    }
    catch {
        return gitRoot;
    }
}, root => root, 50);
/**
 * Find the canonical git repository root, resolving through worktrees.
 *
 * Unlike findGitRoot, which returns the worktree directory (where the `.git`
 * file lives), this returns the main repository's working directory. This
 * ensures all worktrees of the same repo map to the same project identity.
 *
 * Use this instead of findGitRoot for project-scoped state (auto-memory,
 * project config, agent memory) so worktrees share state with the main repo.
 */
exports.findCanonicalGitRoot = createFindCanonicalGitRoot();
function createFindCanonicalGitRoot() {
    function wrapper(startPath) {
        const root = (0, exports.findGitRoot)(startPath);
        if (!root) {
            return null;
        }
        return resolveCanonicalRoot(root);
    }
    wrapper.cache = resolveCanonicalRoot.cache;
    return wrapper;
}
exports.gitExe = (0, memoize_js_1.default)(() => {
    // Every time we spawn a process, we have to lookup the path.
    // Let's instead avoid that lookup so we only do it once.
    return (0, which_js_1.whichSync)('git') || 'git';
});
exports.getIsGit = (0, memoize_js_1.default)(async () => {
    const startTime = Date.now();
    (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'is_git_check_started');
    const isGit = (0, exports.findGitRoot)((0, cwd_js_1.getCwd)()) !== null;
    (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'is_git_check_completed', {
        duration_ms: Date.now() - startTime,
        is_git: isGit,
    });
    return isGit;
});
function getGitDir(cwd) {
    return (0, gitFilesystem_js_1.resolveGitDir)(cwd);
}
async function isAtGitRoot() {
    const cwd = (0, cwd_js_1.getCwd)();
    const gitRoot = (0, exports.findGitRoot)(cwd);
    if (!gitRoot) {
        return false;
    }
    // Resolve symlinks for accurate comparison
    try {
        const [resolvedCwd, resolvedGitRoot] = await Promise.all([
            (0, promises_1.realpath)(cwd),
            (0, promises_1.realpath)(gitRoot),
        ]);
        return resolvedCwd === resolvedGitRoot;
    }
    catch {
        return cwd === gitRoot;
    }
}
const dirIsInGitRepo = async (cwd) => {
    return (0, exports.findGitRoot)(cwd) !== null;
};
exports.dirIsInGitRepo = dirIsInGitRepo;
const getHead = async () => {
    return (0, gitFilesystem_js_1.getCachedHead)();
};
exports.getHead = getHead;
const getBranch = async () => {
    return (0, gitFilesystem_js_1.getCachedBranch)();
};
exports.getBranch = getBranch;
const getDefaultBranch = async () => {
    return (0, gitFilesystem_js_1.getCachedDefaultBranch)();
};
exports.getDefaultBranch = getDefaultBranch;
const getRemoteUrl = async () => {
    return (0, gitFilesystem_js_1.getCachedRemoteUrl)();
};
exports.getRemoteUrl = getRemoteUrl;
/**
 * Normalizes a git remote URL to a canonical form for hashing.
 * Converts SSH and HTTPS URLs to the same format: host/owner/repo (lowercase, no .git)
 *
 * Examples:
 * - git@github.com:owner/repo.git -> github.com/owner/repo
 * - https://github.com/owner/repo.git -> github.com/owner/repo
 * - ssh://git@github.com/owner/repo -> github.com/owner/repo
 * - http://local_proxy@127.0.0.1:16583/git/owner/repo -> github.com/owner/repo
 */
function normalizeGitRemoteUrl(url) {
    const trimmed = url.trim();
    if (!trimmed)
        return null;
    // Handle SSH format: git@host:owner/repo.git
    const sshMatch = trimmed.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
    if (sshMatch && sshMatch[1] && sshMatch[2]) {
        return `${sshMatch[1]}/${sshMatch[2]}`.toLowerCase();
    }
    // Handle HTTPS/SSH URL format: https://host/owner/repo.git or ssh://git@host/owner/repo
    const urlMatch = trimmed.match(/^(?:https?|ssh):\/\/(?:[^@]+@)?([^/]+)\/(.+?)(?:\.git)?$/);
    if (urlMatch && urlMatch[1] && urlMatch[2]) {
        const host = urlMatch[1];
        const path = urlMatch[2];
        // CCR git proxy URLs use format:
        //   Legacy:  http://...@127.0.0.1:PORT/git/owner/repo       (github.com assumed)
        //   GHE:     http://...@127.0.0.1:PORT/git/ghe.host/owner/repo (host encoded in path)
        // Strip the /git/ prefix. If the first segment contains a dot, it's a
        // hostname (GitHub org names cannot contain dots). Otherwise assume github.com.
        if (isLocalHost(host) && path.startsWith('git/')) {
            const proxyPath = path.slice(4); // Remove "git/" prefix
            const segments = proxyPath.split('/');
            // 3+ segments where first contains a dot → host/owner/repo (GHE format)
            if (segments.length >= 3 && segments[0].includes('.')) {
                return proxyPath.toLowerCase();
            }
            // 2 segments → owner/repo (legacy format, assume github.com)
            return `github.com/${proxyPath}`.toLowerCase();
        }
        return `${host}/${path}`.toLowerCase();
    }
    return null;
}
/**
 * Returns a SHA256 hash (first 16 chars) of the normalized git remote URL.
 * This provides a globally unique identifier for the repository that:
 * - Is the same regardless of SSH vs HTTPS clone
 * - Does not expose the actual repository name in logs
 */
async function getRepoRemoteHash() {
    const remoteUrl = await (0, exports.getRemoteUrl)();
    if (!remoteUrl)
        return null;
    const normalized = normalizeGitRemoteUrl(remoteUrl);
    if (!normalized)
        return null;
    const hash = (0, crypto_1.createHash)('sha256').update(normalized).digest('hex');
    return hash.substring(0, 16);
}
const getIsHeadOnRemote = async () => {
    const { code } = await (0, execFileNoThrow_js_1.execFileNoThrow)((0, exports.gitExe)(), ['rev-parse', '@{u}'], {
        preserveOutputOnError: false,
    });
    return code === 0;
};
exports.getIsHeadOnRemote = getIsHeadOnRemote;
const hasUnpushedCommits = async () => {
    const { stdout, code } = await (0, execFileNoThrow_js_1.execFileNoThrow)((0, exports.gitExe)(), ['rev-list', '--count', '@{u}..HEAD'], { preserveOutputOnError: false });
    return code === 0 && parseInt(stdout.trim(), 10) > 0;
};
exports.hasUnpushedCommits = hasUnpushedCommits;
const getIsClean = async (options) => {
    const args = ['--no-optional-locks', 'status', '--porcelain'];
    if (options?.ignoreUntracked) {
        args.push('-uno');
    }
    const { stdout } = await (0, execFileNoThrow_js_1.execFileNoThrow)((0, exports.gitExe)(), args, {
        preserveOutputOnError: false,
    });
    return stdout.trim().length === 0;
};
exports.getIsClean = getIsClean;
const getChangedFiles = async () => {
    const { stdout } = await (0, execFileNoThrow_js_1.execFileNoThrow)((0, exports.gitExe)(), ['--no-optional-locks', 'status', '--porcelain'], {
        preserveOutputOnError: false,
    });
    return stdout
        .trim()
        .split('\n')
        .map(line => line.trim().split(' ', 2)[1]?.trim()) // Remove status prefix (e.g., "M ", "A ", "??")
        .filter(line => typeof line === 'string'); // Remove empty entries
};
exports.getChangedFiles = getChangedFiles;
const getFileStatus = async () => {
    const { stdout } = await (0, execFileNoThrow_js_1.execFileNoThrow)((0, exports.gitExe)(), ['--no-optional-locks', 'status', '--porcelain'], {
        preserveOutputOnError: false,
    });
    const tracked = [];
    const untracked = [];
    stdout
        .trim()
        .split('\n')
        .filter(line => line.length > 0)
        .forEach(line => {
        const status = line.substring(0, 2);
        const filename = line.substring(2).trim();
        if (status === '??') {
            untracked.push(filename);
        }
        else if (filename) {
            tracked.push(filename);
        }
    });
    return { tracked, untracked };
};
exports.getFileStatus = getFileStatus;
const getWorktreeCount = async () => {
    return (0, gitFilesystem_js_1.getWorktreeCountFromFs)();
};
exports.getWorktreeCount = getWorktreeCount;
/**
 * Stashes all changes (including untracked files) to return git to a clean porcelain state
 * Important: This function stages untracked files before stashing to prevent data loss
 * @param message - Optional custom message for the stash
 * @returns Promise<boolean> - true if stash was successful, false otherwise
 */
const stashToCleanState = async (message) => {
    try {
        const stashMessage = message || `Claude Code auto-stash - ${new Date().toISOString()}`;
        // First, check if we have untracked files
        const { untracked } = await (0, exports.getFileStatus)();
        // If we have untracked files, add them to the index first
        // This prevents them from being deleted
        if (untracked.length > 0) {
            const { code: addCode } = await (0, execFileNoThrow_js_1.execFileNoThrow)((0, exports.gitExe)(), ['add', ...untracked], { preserveOutputOnError: false });
            if (addCode !== 0) {
                return false;
            }
        }
        // Now stash everything (staged and unstaged changes)
        const { code } = await (0, execFileNoThrow_js_1.execFileNoThrow)((0, exports.gitExe)(), ['stash', 'push', '--message', stashMessage], { preserveOutputOnError: false });
        return code === 0;
    }
    catch (_) {
        return false;
    }
};
exports.stashToCleanState = stashToCleanState;
async function getGitState() {
    try {
        const [commitHash, branchName, remoteUrl, isHeadOnRemote, isClean, worktreeCount,] = await Promise.all([
            (0, exports.getHead)(),
            (0, exports.getBranch)(),
            (0, exports.getRemoteUrl)(),
            (0, exports.getIsHeadOnRemote)(),
            (0, exports.getIsClean)(),
            (0, exports.getWorktreeCount)(),
        ]);
        return {
            commitHash,
            branchName,
            remoteUrl,
            isHeadOnRemote,
            isClean,
            worktreeCount,
        };
    }
    catch (_) {
        // Fail silently - git state is best effort
        return null;
    }
}
async function getGithubRepo() {
    const { parseGitRemote } = await Promise.resolve().then(() => __importStar(require('./detectRepository.js')));
    const remoteUrl = await (0, exports.getRemoteUrl)();
    if (!remoteUrl) {
        (0, debug_js_1.logForDebugging)('Local GitHub repo: unknown');
        return null;
    }
    // Only return results for github.com — callers (e.g. issue submission)
    // assume the result is a github.com repository.
    const parsed = parseGitRemote(remoteUrl);
    if (parsed && parsed.host === 'github.com') {
        const result = `${parsed.owner}/${parsed.name}`;
        (0, debug_js_1.logForDebugging)(`Local GitHub repo: ${result}`);
        return result;
    }
    (0, debug_js_1.logForDebugging)('Local GitHub repo: unknown');
    return null;
}
// Size limits for untracked file capture
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB per file
const MAX_TOTAL_SIZE_BYTES = 5 * 1024 * 1024 * 1024; // 5GB total
const MAX_FILE_COUNT = 20000;
// Initial read buffer for binary detection + content reuse. 64KB covers
// most source files in a single read; isBinaryContent() internally scans
// only its first 8KB for the binary heuristic, so the extra bytes are
// purely for avoiding a second read when the file turns out to be text.
const SNIFF_BUFFER_SIZE = 64 * 1024;
/**
 * Find the best remote branch to use as a base.
 * Priority: tracking branch > origin/main > origin/staging > origin/master
 */
async function findRemoteBase() {
    // First try: get the tracking branch for the current branch
    const { stdout: trackingBranch, code: trackingCode } = await (0, execFileNoThrow_js_1.execFileNoThrow)((0, exports.gitExe)(), ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { preserveOutputOnError: false });
    if (trackingCode === 0 && trackingBranch.trim()) {
        return trackingBranch.trim();
    }
    // Second try: check for common default branch names on origin
    const { stdout: remoteRefs, code: remoteCode } = await (0, execFileNoThrow_js_1.execFileNoThrow)((0, exports.gitExe)(), ['remote', 'show', 'origin', '--', 'HEAD'], { preserveOutputOnError: false });
    if (remoteCode === 0) {
        // Parse the default branch from remote show output
        const match = remoteRefs.match(/HEAD branch: (\S+)/);
        if (match && match[1]) {
            return `origin/${match[1]}`;
        }
    }
    // Third try: check which common branches exist
    const candidates = ['origin/main', 'origin/staging', 'origin/master'];
    for (const candidate of candidates) {
        const { code } = await (0, execFileNoThrow_js_1.execFileNoThrow)((0, exports.gitExe)(), ['rev-parse', '--verify', candidate], { preserveOutputOnError: false });
        if (code === 0) {
            return candidate;
        }
    }
    return null;
}
/**
 * Check if we're in a shallow clone by looking for <gitDir>/shallow.
 */
function isShallowClone() {
    return (0, gitFilesystem_js_1.isShallowClone)();
}
/**
 * Capture untracked files (git diff doesn't include them).
 * Respects size limits and skips binary files.
 */
async function captureUntrackedFiles() {
    const { stdout, code } = await (0, execFileNoThrow_js_1.execFileNoThrow)((0, exports.gitExe)(), ['ls-files', '--others', '--exclude-standard'], { preserveOutputOnError: false });
    const trimmed = stdout.trim();
    if (code !== 0 || !trimmed) {
        return [];
    }
    const files = trimmed.split('\n').filter(Boolean);
    const result = [];
    let totalSize = 0;
    for (const filePath of files) {
        // Check file count limit
        if (result.length >= MAX_FILE_COUNT) {
            (0, debug_js_1.logForDebugging)(`Untracked file capture: reached max file count (${MAX_FILE_COUNT})`);
            break;
        }
        // Skip binary files by extension - zero I/O
        if ((0, files_js_1.hasBinaryExtension)(filePath)) {
            continue;
        }
        try {
            const stats = await (0, promises_1.stat)(filePath);
            const fileSize = stats.size;
            // Skip files exceeding per-file limit
            if (fileSize > MAX_FILE_SIZE_BYTES) {
                (0, debug_js_1.logForDebugging)(`Untracked file capture: skipping ${filePath} (exceeds ${MAX_FILE_SIZE_BYTES} bytes)`);
                continue;
            }
            // Check total size limit
            if (totalSize + fileSize > MAX_TOTAL_SIZE_BYTES) {
                (0, debug_js_1.logForDebugging)(`Untracked file capture: reached total size limit (${MAX_TOTAL_SIZE_BYTES} bytes)`);
                break;
            }
            // Empty file - no need to open
            if (fileSize === 0) {
                result.push({ path: filePath, content: '' });
                continue;
            }
            // Binary sniff on up to SNIFF_BUFFER_SIZE bytes. Caps binary-file reads
            // at SNIFF_BUFFER_SIZE even though MAX_FILE_SIZE_BYTES allows up to 500MB.
            // If the file fits in the sniff buffer we reuse it as the content; for
            // larger text files we fall back to readFile with encoding so the runtime
            // decodes to a string without materializing a full-size Buffer in JS.
            const sniffSize = Math.min(SNIFF_BUFFER_SIZE, fileSize);
            const fd = await (0, promises_1.open)(filePath, 'r');
            try {
                const sniffBuf = Buffer.alloc(sniffSize);
                const { bytesRead } = await fd.read(sniffBuf, 0, sniffSize, 0);
                const sniff = sniffBuf.subarray(0, bytesRead);
                if ((0, files_js_1.isBinaryContent)(sniff)) {
                    continue;
                }
                let content;
                if (fileSize <= sniffSize) {
                    // Sniff already covers the whole file
                    content = sniff.toString('utf-8');
                }
                else {
                    // readFile with encoding decodes to string directly, avoiding a
                    // full-size Buffer living alongside the decoded string. The extra
                    // open/close is cheaper than doubling peak memory for large files.
                    content = await (0, promises_1.readFile)(filePath, 'utf-8');
                }
                result.push({ path: filePath, content });
                totalSize += fileSize;
            }
            finally {
                await fd.close();
            }
        }
        catch (err) {
            // Skip files we can't read
            (0, debug_js_1.logForDebugging)(`Failed to read untracked file ${filePath}: ${err}`);
        }
    }
    return result;
}
/**
 * Preserve git state for issue submission.
 * Uses remote base for more stable replay capability.
 *
 * Edge cases handled:
 * - Detached HEAD: falls back to merge-base with default branch directly
 * - No remote: returns null for remote fields, uses HEAD-only mode
 * - Shallow clone: falls back to HEAD-only mode
 */
async function preserveGitStateForIssue() {
    try {
        const isGit = await (0, exports.getIsGit)();
        if (!isGit) {
            return null;
        }
        // Check for shallow clone - fall back to simpler mode
        if (await isShallowClone()) {
            (0, debug_js_1.logForDebugging)('Shallow clone detected, using HEAD-only mode for issue');
            const [{ stdout: patch }, untrackedFiles] = await Promise.all([
                (0, execFileNoThrow_js_1.execFileNoThrow)((0, exports.gitExe)(), ['diff', 'HEAD']),
                captureUntrackedFiles(),
            ]);
            return {
                remote_base_sha: null,
                remote_base: null,
                patch: patch || '',
                untracked_files: untrackedFiles,
                format_patch: null,
                head_sha: null,
                branch_name: null,
            };
        }
        // Find the best remote base
        const remoteBase = await findRemoteBase();
        if (!remoteBase) {
            // No remote found - use HEAD-only mode
            (0, debug_js_1.logForDebugging)('No remote found, using HEAD-only mode for issue');
            const [{ stdout: patch }, untrackedFiles] = await Promise.all([
                (0, execFileNoThrow_js_1.execFileNoThrow)((0, exports.gitExe)(), ['diff', 'HEAD']),
                captureUntrackedFiles(),
            ]);
            return {
                remote_base_sha: null,
                remote_base: null,
                patch: patch || '',
                untracked_files: untrackedFiles,
                format_patch: null,
                head_sha: null,
                branch_name: null,
            };
        }
        // Get the merge-base with remote
        const { stdout: mergeBase, code: mergeBaseCode } = await (0, execFileNoThrow_js_1.execFileNoThrow)((0, exports.gitExe)(), ['merge-base', 'HEAD', remoteBase], { preserveOutputOnError: false });
        if (mergeBaseCode !== 0 || !mergeBase.trim()) {
            // Merge-base failed - fall back to HEAD-only
            (0, debug_js_1.logForDebugging)('Merge-base failed, using HEAD-only mode for issue');
            const [{ stdout: patch }, untrackedFiles] = await Promise.all([
                (0, execFileNoThrow_js_1.execFileNoThrow)((0, exports.gitExe)(), ['diff', 'HEAD']),
                captureUntrackedFiles(),
            ]);
            return {
                remote_base_sha: null,
                remote_base: null,
                patch: patch || '',
                untracked_files: untrackedFiles,
                format_patch: null,
                head_sha: null,
                branch_name: null,
            };
        }
        const remoteBaseSha = mergeBase.trim();
        // All 5 commands below depend only on remoteBaseSha — run them in parallel.
        // ~5×90ms serial → ~90ms parallel on Bun native (used by /issue and /share).
        const [{ stdout: patch }, untrackedFiles, { stdout: formatPatchOut, code: formatPatchCode }, { stdout: headSha }, { stdout: branchName },] = await Promise.all([
            // Patch from merge-base to current state (including staged changes)
            (0, execFileNoThrow_js_1.execFileNoThrow)((0, exports.gitExe)(), ['diff', remoteBaseSha]),
            // Untracked files captured separately
            captureUntrackedFiles(),
            // format-patch for committed changes between merge-base and HEAD.
            // Preserves the actual commit chain (author, date, message) so replay
            // containers can reconstruct the branch with real commits instead of a
            // squashed diff. Uses --stdout to emit all patches as a single text stream.
            (0, execFileNoThrow_js_1.execFileNoThrow)((0, exports.gitExe)(), [
                'format-patch',
                `${remoteBaseSha}..HEAD`,
                '--stdout',
            ]),
            // HEAD SHA for replay
            (0, execFileNoThrow_js_1.execFileNoThrow)((0, exports.gitExe)(), ['rev-parse', 'HEAD']),
            // Branch name for replay
            (0, execFileNoThrow_js_1.execFileNoThrow)((0, exports.gitExe)(), ['rev-parse', '--abbrev-ref', 'HEAD']),
        ]);
        let formatPatch = null;
        if (formatPatchCode === 0 && formatPatchOut && formatPatchOut.trim()) {
            formatPatch = formatPatchOut;
        }
        const trimmedBranch = branchName?.trim();
        return {
            remote_base_sha: remoteBaseSha,
            remote_base: remoteBase,
            patch: patch || '',
            untracked_files: untrackedFiles,
            format_patch: formatPatch,
            head_sha: headSha?.trim() || null,
            branch_name: trimmedBranch && trimmedBranch !== 'HEAD' ? trimmedBranch : null,
        };
    }
    catch (err) {
        (0, log_js_1.logError)(err);
        return null;
    }
}
function isLocalHost(host) {
    const hostWithoutPort = host.split(':')[0] ?? '';
    return (hostWithoutPort === 'localhost' ||
        /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostWithoutPort));
}
/**
 * Checks if the current working directory appears to be a bare git repository
 * or has been manipulated to look like one (sandbox escape attack vector).
 *
 * SECURITY: Git's is_git_directory() function (setup.c:417-455) checks for:
 * 1. HEAD file - Must be a valid ref
 * 2. objects/ directory - Must exist and be accessible
 * 3. refs/ directory - Must exist and be accessible
 *
 * If all three exist in the current directory (not in a .git subdirectory),
 * Git treats the current directory as a bare repository and will execute
 * hooks/pre-commit and other hook scripts from the cwd.
 *
 * Attack scenario:
 * 1. Attacker creates HEAD, objects/, refs/, and hooks/pre-commit in cwd
 * 2. Attacker deletes or corrupts .git/HEAD to invalidate the normal git directory
 * 3. When user runs 'git status', Git treats cwd as the git dir and runs the hook
 *
 * @returns true if the cwd looks like a bare/exploited git directory
 */
/* eslint-disable custom-rules/no-sync-fs -- sync permission-eval check */
function isCurrentDirectoryBareGitRepo() {
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    const cwd = (0, cwd_js_1.getCwd)();
    const gitPath = (0, path_1.join)(cwd, '.git');
    try {
        const stats = fs.statSync(gitPath);
        if (stats.isFile()) {
            // worktree/submodule — Git follows the gitdir reference
            return false;
        }
        if (stats.isDirectory()) {
            const gitHeadPath = (0, path_1.join)(gitPath, 'HEAD');
            try {
                // SECURITY: check isFile(). An attacker creating .git/HEAD as a
                // DIRECTORY would pass a bare statSync but Git's setup_git_directory
                // rejects it (not a valid HEAD) and falls back to cwd discovery.
                if (fs.statSync(gitHeadPath).isFile()) {
                    // normal repo — .git/HEAD valid, Git won't fall back to cwd
                    return false;
                }
                // .git/HEAD exists but is not a regular file — fall through
            }
            catch {
                // .git exists but no HEAD — fall through to bare-repo check
            }
        }
    }
    catch {
        // no .git — fall through to bare-repo indicator check
    }
    // No valid .git/HEAD found. Check if cwd has bare git repo indicators.
    // Be cautious — flag if ANY of these exist without a valid .git reference.
    // Per-indicator try/catch so an error on one doesn't mask another.
    try {
        if (fs.statSync((0, path_1.join)(cwd, 'HEAD')).isFile())
            return true;
    }
    catch {
        // no HEAD
    }
    try {
        if (fs.statSync((0, path_1.join)(cwd, 'objects')).isDirectory())
            return true;
    }
    catch {
        // no objects/
    }
    try {
        if (fs.statSync((0, path_1.join)(cwd, 'refs')).isDirectory())
            return true;
    }
    catch {
        // no refs/
    }
    return false;
}
/* eslint-enable custom-rules/no-sync-fs */
