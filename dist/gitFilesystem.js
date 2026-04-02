"use strict";
/**
 * Filesystem-based git state reading — avoids spawning git subprocesses.
 *
 * Covers: resolving .git directories (including worktrees/submodules),
 * parsing HEAD, resolving refs via loose files and packed-refs,
 * and the GitHeadWatcher that caches branch/SHA with fs.watchFile.
 *
 * Correctness notes (verified against git source):
 *   - HEAD: `ref: refs/heads/<branch>\n` or raw SHA (refs/files-backend.c)
 *   - Packed-refs: `<sha> <refname>\n`, skip `#` and `^` lines (packed-backend.c)
 *   - .git file (worktree): `gitdir: <path>\n` with optional relative path (setup.c)
 *   - Shallow: mere existence of `<commonDir>/shallow` means shallow (shallow.c)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearResolveGitDirCache = clearResolveGitDirCache;
exports.resolveGitDir = resolveGitDir;
exports.isSafeRefName = isSafeRefName;
exports.isValidGitSha = isValidGitSha;
exports.readGitHead = readGitHead;
exports.resolveRef = resolveRef;
exports.getCommonDir = getCommonDir;
exports.readRawSymref = readRawSymref;
exports.getCachedBranch = getCachedBranch;
exports.getCachedHead = getCachedHead;
exports.getCachedRemoteUrl = getCachedRemoteUrl;
exports.getCachedDefaultBranch = getCachedDefaultBranch;
exports.resetGitFileWatcher = resetGitFileWatcher;
exports.getHeadForDir = getHeadForDir;
exports.readWorktreeHeadSha = readWorktreeHeadSha;
exports.getRemoteUrlForDir = getRemoteUrlForDir;
exports.isShallowClone = isShallowClone;
exports.getWorktreeCountFromFs = getWorktreeCountFromFs;
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const state_js_1 = require("../../bootstrap/state.js");
const cleanupRegistry_js_1 = require("../cleanupRegistry.js");
const cwd_js_1 = require("../cwd.js");
const git_js_1 = require("../git.js");
const gitConfigParser_js_1 = require("./gitConfigParser.js");
// ---------------------------------------------------------------------------
// resolveGitDir — find the actual .git directory
// ---------------------------------------------------------------------------
const resolveGitDirCache = new Map();
/** Clear cached git dir resolutions. Exported for testing only. */
function clearResolveGitDirCache() {
    resolveGitDirCache.clear();
}
/**
 * Resolve the actual .git directory for a repo.
 * Handles worktrees/submodules where .git is a file containing `gitdir: <path>`.
 * Memoized per startPath.
 */
async function resolveGitDir(startPath) {
    const cwd = (0, path_1.resolve)(startPath ?? (0, cwd_js_1.getCwd)());
    const cached = resolveGitDirCache.get(cwd);
    if (cached !== undefined) {
        return cached;
    }
    const root = (0, git_js_1.findGitRoot)(cwd);
    if (!root) {
        resolveGitDirCache.set(cwd, null);
        return null;
    }
    const gitPath = (0, path_1.join)(root, '.git');
    try {
        const st = await (0, promises_1.stat)(gitPath);
        if (st.isFile()) {
            // Worktree or submodule: .git is a file with `gitdir: <path>`
            // Git strips trailing \n and \r (setup.c read_gitfile_gently).
            const content = (await (0, promises_1.readFile)(gitPath, 'utf-8')).trim();
            if (content.startsWith('gitdir:')) {
                const rawDir = content.slice('gitdir:'.length).trim();
                const resolved = (0, path_1.resolve)(root, rawDir);
                resolveGitDirCache.set(cwd, resolved);
                return resolved;
            }
        }
        // Regular repo: .git is a directory
        resolveGitDirCache.set(cwd, gitPath);
        return gitPath;
    }
    catch {
        resolveGitDirCache.set(cwd, null);
        return null;
    }
}
// ---------------------------------------------------------------------------
// isSafeRefName — validate ref/branch names read from .git/
// ---------------------------------------------------------------------------
/**
 * Validate that a ref/branch name read from .git/ is safe to use in path
 * joins, as git positional arguments, and when interpolated into shell
 * commands (commit-push-pr skill interpolates the branch into shell).
 * An attacker who controls .git/HEAD or a loose ref file could otherwise
 * embed path traversal (`..`), argument injection (leading `-`), or shell
 * metacharacters — .git/HEAD is a plain text file that can be written
 * without git's own check-ref-format validation.
 *
 * Allowlist: ASCII alphanumerics, `/`, `.`, `_`, `+`, `-`, `@` only. This
 * covers all legitimate git branch names (e.g. `feature/foo`,
 * `release-1.2.3+build`, `dependabot/npm_and_yarn/@types/node-18.0.0`)
 * while rejecting everything that could be dangerous in shell context
 * (newlines, backticks, `$`, `;`, `|`, `&`, `(`, `)`, `<`, `>`, spaces,
 * tabs, quotes, backslash) and path traversal (`..`).
 */
function isSafeRefName(name) {
    if (!name || name.startsWith('-') || name.startsWith('/')) {
        return false;
    }
    if (name.includes('..')) {
        return false;
    }
    // Reject single-dot and empty path components (`.`, `foo/./bar`, `foo//bar`,
    // `foo/`). Git-check-ref-format rejects these, and `.` normalizes away in
    // path joins so a tampered HEAD of `refs/heads/.` would make us watch the
    // refs/heads directory itself instead of a branch file.
    if (name.split('/').some(c => c === '.' || c === '')) {
        return false;
    }
    // Allowlist-only: alphanumerics, /, ., _, +, -, @. Rejects all shell
    // metacharacters, whitespace, NUL, and non-ASCII. Git's forbidden @{
    // sequence is blocked because { is not in the allowlist.
    if (!/^[a-zA-Z0-9/._+@-]+$/.test(name)) {
        return false;
    }
    return true;
}
/**
 * Validate that a string is a git SHA: 40 hex chars (SHA-1) or 64 hex chars
 * (SHA-256). Git never writes abbreviated SHAs to HEAD or ref files, so we
 * only accept full-length hashes.
 *
 * An attacker who controls .git/HEAD when detached, or a loose ref file,
 * could otherwise return arbitrary content that flows into shell contexts.
 */
function isValidGitSha(s) {
    return /^[0-9a-f]{40}$/.test(s) || /^[0-9a-f]{64}$/.test(s);
}
// ---------------------------------------------------------------------------
// readGitHead — parse .git/HEAD
// ---------------------------------------------------------------------------
/**
 * Parse .git/HEAD to determine current branch or detached SHA.
 *
 * HEAD format (per git source, refs/files-backend.c):
 *   - `ref: refs/heads/<branch>\n`  — on a branch
 *   - `ref: <other-ref>\n`          — unusual symref (e.g. during bisect)
 *   - `<hex-sha>\n`                 — detached HEAD (e.g. during rebase)
 *
 * Git strips trailing whitespace via strbuf_rtrim; .trim() is equivalent.
 * Git allows any whitespace between "ref:" and the path; we handle
 * this by trimming after slicing past "ref:".
 */
async function readGitHead(gitDir) {
    try {
        const content = (await (0, promises_1.readFile)((0, path_1.join)(gitDir, 'HEAD'), 'utf-8')).trim();
        if (content.startsWith('ref:')) {
            const ref = content.slice('ref:'.length).trim();
            if (ref.startsWith('refs/heads/')) {
                const name = ref.slice('refs/heads/'.length);
                // Reject path traversal and argument injection from a tampered HEAD.
                if (!isSafeRefName(name)) {
                    return null;
                }
                return { type: 'branch', name };
            }
            // Unusual symref (not a local branch) — resolve to SHA
            if (!isSafeRefName(ref)) {
                return null;
            }
            const sha = await resolveRef(gitDir, ref);
            return sha ? { type: 'detached', sha } : { type: 'detached', sha: '' };
        }
        // Raw SHA (detached HEAD). Validate: an attacker-controlled HEAD file
        // could contain shell metacharacters that flow into downstream shell
        // contexts.
        if (!isValidGitSha(content)) {
            return null;
        }
        return { type: 'detached', sha: content };
    }
    catch {
        return null;
    }
}
// ---------------------------------------------------------------------------
// resolveRef — resolve loose/packed refs to SHAs
// ---------------------------------------------------------------------------
/**
 * Resolve a git ref (e.g. `refs/heads/main`) to a commit SHA.
 * Checks loose ref files first, then falls back to packed-refs.
 * Follows symrefs (e.g. `ref: refs/remotes/origin/main`).
 *
 * For worktrees, refs live in the common gitdir (pointed to by the
 * `commondir` file), not the worktree-specific gitdir. We check the
 * worktree gitdir first, then fall back to the common dir.
 *
 * Packed-refs format (per packed-backend.c):
 *   - Header: `# pack-refs with: <traits>\n`
 *   - Entries: `<40-hex-sha> <refname>\n`
 *   - Peeled:  `^<40-hex-sha>\n` (after annotated tag entries)
 */
async function resolveRef(gitDir, ref) {
    const result = await resolveRefInDir(gitDir, ref);
    if (result) {
        return result;
    }
    // For worktrees: try the common gitdir where shared refs live
    const commonDir = await getCommonDir(gitDir);
    if (commonDir && commonDir !== gitDir) {
        return resolveRefInDir(commonDir, ref);
    }
    return null;
}
async function resolveRefInDir(dir, ref) {
    // Try loose ref file
    try {
        const content = (await (0, promises_1.readFile)((0, path_1.join)(dir, ref), 'utf-8')).trim();
        if (content.startsWith('ref:')) {
            const target = content.slice('ref:'.length).trim();
            // Reject path traversal in a tampered symref chain.
            if (!isSafeRefName(target)) {
                return null;
            }
            return resolveRef(dir, target);
        }
        // Loose ref content should be a raw SHA. Validate: an attacker-controlled
        // ref file could contain shell metacharacters.
        if (!isValidGitSha(content)) {
            return null;
        }
        return content;
    }
    catch {
        // Loose ref doesn't exist, try packed-refs
    }
    try {
        const packed = await (0, promises_1.readFile)((0, path_1.join)(dir, 'packed-refs'), 'utf-8');
        for (const line of packed.split('\n')) {
            if (line.startsWith('#') || line.startsWith('^')) {
                continue;
            }
            const spaceIdx = line.indexOf(' ');
            if (spaceIdx === -1) {
                continue;
            }
            if (line.slice(spaceIdx + 1) === ref) {
                const sha = line.slice(0, spaceIdx);
                return isValidGitSha(sha) ? sha : null;
            }
        }
    }
    catch {
        // No packed-refs
    }
    return null;
}
/**
 * Read the `commondir` file to find the shared git directory.
 * In a worktree, this points to the main repo's .git dir.
 * Returns null if no commondir file exists (regular repo).
 */
async function getCommonDir(gitDir) {
    try {
        const content = (await (0, promises_1.readFile)((0, path_1.join)(gitDir, 'commondir'), 'utf-8')).trim();
        return (0, path_1.resolve)(gitDir, content);
    }
    catch {
        return null;
    }
}
/**
 * Read a raw symref file and extract the branch name after a known prefix.
 * Returns null if the ref doesn't exist, isn't a symref, or doesn't match the prefix.
 * Checks loose file only — packed-refs doesn't store symrefs.
 */
async function readRawSymref(gitDir, refPath, branchPrefix) {
    try {
        const content = (await (0, promises_1.readFile)((0, path_1.join)(gitDir, refPath), 'utf-8')).trim();
        if (content.startsWith('ref:')) {
            const target = content.slice('ref:'.length).trim();
            if (target.startsWith(branchPrefix)) {
                const name = target.slice(branchPrefix.length);
                // Reject path traversal and argument injection from a tampered symref.
                if (!isSafeRefName(name)) {
                    return null;
                }
                return name;
            }
        }
    }
    catch {
        // Not a loose ref
    }
    return null;
}
const WATCH_INTERVAL_MS = process.env.NODE_ENV === 'test' ? 10 : 1000;
class GitFileWatcher {
    constructor() {
        this.gitDir = null;
        this.commonDir = null;
        this.initialized = false;
        this.initPromise = null;
        this.watchedPaths = [];
        this.branchRefPath = null;
        this.cache = new Map();
    }
    async ensureStarted() {
        if (this.initialized) {
            return;
        }
        if (this.initPromise) {
            return this.initPromise;
        }
        this.initPromise = this.start();
        return this.initPromise;
    }
    async start() {
        this.gitDir = await resolveGitDir();
        this.initialized = true;
        if (!this.gitDir) {
            return;
        }
        // In a worktree, branch refs and the main config are shared and live in
        // commonDir, not the per-worktree gitDir. Resolve once so we don't
        // re-read the commondir file on every branch switch.
        this.commonDir = await getCommonDir(this.gitDir);
        // Watch .git/HEAD and .git/config
        this.watchPath((0, path_1.join)(this.gitDir, 'HEAD'), () => {
            void this.onHeadChanged();
        });
        // Config (remote URLs) lives in commonDir for worktrees
        this.watchPath((0, path_1.join)(this.commonDir ?? this.gitDir, 'config'), () => {
            this.invalidate();
        });
        // Watch the current branch's ref file for commit changes
        await this.watchCurrentBranchRef();
        (0, cleanupRegistry_js_1.registerCleanup)(async () => {
            this.stopWatching();
        });
    }
    watchPath(path, callback) {
        this.watchedPaths.push(path);
        (0, fs_1.watchFile)(path, { interval: WATCH_INTERVAL_MS }, callback);
    }
    /**
     * Watch the loose ref file for the current branch.
     * Called on startup and whenever HEAD changes (branch switch).
     */
    async watchCurrentBranchRef() {
        if (!this.gitDir) {
            return;
        }
        const head = await readGitHead(this.gitDir);
        // Branch refs live in commonDir for worktrees (gitDir for regular repos)
        const refsDir = this.commonDir ?? this.gitDir;
        const refPath = head?.type === 'branch' ? (0, path_1.join)(refsDir, 'refs', 'heads', head.name) : null;
        // Already watching this ref (or already not watching anything)
        if (refPath === this.branchRefPath) {
            return;
        }
        // Stop watching old branch ref. Runs for branch→branch AND
        // branch→detached (checkout --detach, rebase, bisect).
        if (this.branchRefPath) {
            (0, fs_1.unwatchFile)(this.branchRefPath);
            this.watchedPaths = this.watchedPaths.filter(p => p !== this.branchRefPath);
        }
        this.branchRefPath = refPath;
        if (!refPath) {
            return;
        }
        // The ref file may not exist yet (new branch before first commit).
        // watchFile works on nonexistent files — it fires when the file appears.
        this.watchPath(refPath, () => {
            this.invalidate();
        });
    }
    async onHeadChanged() {
        // HEAD changed — could be a branch switch or detach.
        // Defer file I/O (readGitHead, watchFile setup) until scroll settles so
        // watchFile callbacks that land mid-scroll don't compete for the event
        // loop. invalidate() is cheap (just marks dirty) so do it first — the
        // cache correctly serves stale-marked values until the watcher updates.
        this.invalidate();
        await (0, state_js_1.waitForScrollIdle)();
        await this.watchCurrentBranchRef();
    }
    invalidate() {
        for (const entry of this.cache.values()) {
            entry.dirty = true;
        }
    }
    stopWatching() {
        for (const path of this.watchedPaths) {
            (0, fs_1.unwatchFile)(path);
        }
        this.watchedPaths = [];
        this.branchRefPath = null;
    }
    /**
     * Get a cached value by key. On first call for a key, computes and caches it.
     * Subsequent calls return the cached value until a watched file changes,
     * which marks the entry dirty. The next get() re-computes from disk.
     *
     * Race condition handling: dirty is cleared BEFORE the async compute starts.
     * If a file change arrives during compute, it re-sets dirty, so the next
     * get() will re-read again rather than serving a stale value.
     */
    async get(key, compute) {
        await this.ensureStarted();
        const existing = this.cache.get(key);
        if (existing && !existing.dirty) {
            return existing.value;
        }
        // Clear dirty before compute — if the file changes again during the
        // async read, invalidate() will re-set dirty and we'll re-read on
        // the next get() call.
        if (existing) {
            existing.dirty = false;
        }
        const value = await compute();
        // Only update the cached value if no new invalidation arrived during compute
        const entry = this.cache.get(key);
        if (entry && !entry.dirty) {
            entry.value = value;
        }
        if (!entry) {
            this.cache.set(key, { value, dirty: false, compute });
        }
        return value;
    }
    /** Reset all state. Stops file watchers. For testing only. */
    reset() {
        this.stopWatching();
        this.cache.clear();
        this.initialized = false;
        this.initPromise = null;
        this.gitDir = null;
        this.commonDir = null;
    }
}
const gitWatcher = new GitFileWatcher();
async function computeBranch() {
    const gitDir = await resolveGitDir();
    if (!gitDir) {
        return 'HEAD';
    }
    const head = await readGitHead(gitDir);
    if (!head) {
        return 'HEAD';
    }
    return head.type === 'branch' ? head.name : 'HEAD';
}
async function computeHead() {
    const gitDir = await resolveGitDir();
    if (!gitDir) {
        return '';
    }
    const head = await readGitHead(gitDir);
    if (!head) {
        return '';
    }
    if (head.type === 'branch') {
        return (await resolveRef(gitDir, `refs/heads/${head.name}`)) ?? '';
    }
    return head.sha;
}
async function computeRemoteUrl() {
    const gitDir = await resolveGitDir();
    if (!gitDir) {
        return null;
    }
    const url = await (0, gitConfigParser_js_1.parseGitConfigValue)(gitDir, 'remote', 'origin', 'url');
    if (url) {
        return url;
    }
    // In worktrees, the config with remote URLs is in the common dir
    const commonDir = await getCommonDir(gitDir);
    if (commonDir && commonDir !== gitDir) {
        return (0, gitConfigParser_js_1.parseGitConfigValue)(commonDir, 'remote', 'origin', 'url');
    }
    return null;
}
async function computeDefaultBranch() {
    const gitDir = await resolveGitDir();
    if (!gitDir) {
        return 'main';
    }
    // refs/remotes/ lives in commonDir, not the per-worktree gitDir
    const commonDir = (await getCommonDir(gitDir)) ?? gitDir;
    const branchFromSymref = await readRawSymref(commonDir, 'refs/remotes/origin/HEAD', 'refs/remotes/origin/');
    if (branchFromSymref) {
        return branchFromSymref;
    }
    for (const candidate of ['main', 'master']) {
        const sha = await resolveRef(commonDir, `refs/remotes/origin/${candidate}`);
        if (sha) {
            return candidate;
        }
    }
    return 'main';
}
function getCachedBranch() {
    return gitWatcher.get('branch', computeBranch);
}
function getCachedHead() {
    return gitWatcher.get('head', computeHead);
}
function getCachedRemoteUrl() {
    return gitWatcher.get('remoteUrl', computeRemoteUrl);
}
function getCachedDefaultBranch() {
    return gitWatcher.get('defaultBranch', computeDefaultBranch);
}
/** Reset the git file watcher state. For testing only. */
function resetGitFileWatcher() {
    gitWatcher.reset();
}
/**
 * Read the HEAD SHA for an arbitrary directory (not using the watcher).
 * Used by plugins that need the HEAD of a specific repo, not the CWD repo.
 */
async function getHeadForDir(cwd) {
    const gitDir = await resolveGitDir(cwd);
    if (!gitDir) {
        return null;
    }
    const head = await readGitHead(gitDir);
    if (!head) {
        return null;
    }
    if (head.type === 'branch') {
        return resolveRef(gitDir, `refs/heads/${head.name}`);
    }
    return head.sha;
}
/**
 * Read the HEAD SHA for a git worktree directory (not the main repo).
 *
 * Unlike `getHeadForDir`, this reads `<worktreePath>/.git` directly as a
 * `gitdir:` pointer file, with no upward walk. `getHeadForDir` walks upward
 * via `findGitRoot` and would find the parent repo's `.git` when the
 * worktree path doesn't exist — misreporting the parent HEAD as the worktree's.
 *
 * Returns null if the worktree doesn't exist (`.git` pointer ENOENT) or is
 * malformed. Caller can treat null as "not a valid worktree".
 */
async function readWorktreeHeadSha(worktreePath) {
    let gitDir;
    try {
        const ptr = (await (0, promises_1.readFile)((0, path_1.join)(worktreePath, '.git'), 'utf-8')).trim();
        if (!ptr.startsWith('gitdir:')) {
            return null;
        }
        gitDir = (0, path_1.resolve)(worktreePath, ptr.slice('gitdir:'.length).trim());
    }
    catch {
        return null;
    }
    const head = await readGitHead(gitDir);
    if (!head) {
        return null;
    }
    if (head.type === 'branch') {
        return resolveRef(gitDir, `refs/heads/${head.name}`);
    }
    return head.sha;
}
/**
 * Read the remote origin URL for an arbitrary directory via .git/config.
 */
async function getRemoteUrlForDir(cwd) {
    const gitDir = await resolveGitDir(cwd);
    if (!gitDir) {
        return null;
    }
    const url = await (0, gitConfigParser_js_1.parseGitConfigValue)(gitDir, 'remote', 'origin', 'url');
    if (url) {
        return url;
    }
    // In worktrees, the config with remote URLs is in the common dir
    const commonDir = await getCommonDir(gitDir);
    if (commonDir && commonDir !== gitDir) {
        return (0, gitConfigParser_js_1.parseGitConfigValue)(commonDir, 'remote', 'origin', 'url');
    }
    return null;
}
/**
 * Check if we're in a shallow clone by looking for <commonDir>/shallow.
 * Per git's shallow.c, mere existence of the file means shallow.
 * The shallow file lives in commonDir, not the per-worktree gitDir.
 */
async function isShallowClone() {
    const gitDir = await resolveGitDir();
    if (!gitDir) {
        return false;
    }
    const commonDir = (await getCommonDir(gitDir)) ?? gitDir;
    try {
        await (0, promises_1.stat)((0, path_1.join)(commonDir, 'shallow'));
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Count worktrees by reading <commonDir>/worktrees/ directory.
 * The worktrees/ directory lives in commonDir, not the per-worktree gitDir.
 * The main worktree is not listed there, so add 1.
 */
async function getWorktreeCountFromFs() {
    try {
        const gitDir = await resolveGitDir();
        if (!gitDir) {
            return 0;
        }
        const commonDir = (await getCommonDir(gitDir)) ?? gitDir;
        const entries = await (0, promises_1.readdir)((0, path_1.join)(commonDir, 'worktrees'));
        return entries.length + 1;
    }
    catch {
        // No worktrees directory means only the main worktree
        return 1;
    }
}
