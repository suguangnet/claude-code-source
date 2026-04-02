"use strict";
/**
 * Git bundle creation + upload for CCR seed-bundle seeding.
 *
 * Flow:
 *   1. git stash create → update-ref refs/seed/stash (makes it reachable)
 *   2. git bundle create --all (packs refs/seed/stash + its objects)
 *   3. Upload to /v1/files
 *   4. Cleanup refs/seed/stash (don't pollute user's repo)
 *   5. Caller sets seed_bundle_file_id on SessionContext
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAndUploadGitBundle = createAndUploadGitBundle;
const promises_1 = require("fs/promises");
const index_js_1 = require("src/services/analytics/index.js");
const growthbook_js_1 = require("../../services/analytics/growthbook.js");
const filesApi_js_1 = require("../../services/api/filesApi.js");
const cwd_js_1 = require("../cwd.js");
const debug_js_1 = require("../debug.js");
const execFileNoThrow_js_1 = require("../execFileNoThrow.js");
const git_js_1 = require("../git.js");
const tempfile_js_1 = require("../tempfile.js");
// Tunable via tengu_ccr_bundle_max_bytes.
const DEFAULT_BUNDLE_MAX_BYTES = 100 * 1024 * 1024;
// Bundle --all → HEAD → squashed-root. HEAD drops side branches/tags but
// keeps full current-branch history. Squashed-root is a single parentless
// commit of HEAD's tree (or the stash tree if WIP exists) — no history,
// just the snapshot. Receiver needs refs/seed/root handling for that tier.
async function _bundleWithFallback(gitRoot, bundlePath, maxBytes, hasStash, signal) {
    // --all picks up refs/seed/stash; HEAD needs it explicit.
    const extra = hasStash ? ['refs/seed/stash'] : [];
    const mkBundle = (base) => (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['bundle', 'create', bundlePath, base, ...extra], { cwd: gitRoot, abortSignal: signal });
    const allResult = await mkBundle('--all');
    if (allResult.code !== 0) {
        return {
            ok: false,
            error: `git bundle create --all failed (${allResult.code}): ${allResult.stderr.slice(0, 200)}`,
            failReason: 'git_error',
        };
    }
    const { size: allSize } = await (0, promises_1.stat)(bundlePath);
    if (allSize <= maxBytes) {
        return { ok: true, size: allSize, scope: 'all' };
    }
    // bundle create overwrites in place.
    (0, debug_js_1.logForDebugging)(`[gitBundle] --all bundle is ${(allSize / 1024 / 1024).toFixed(1)}MB (> ${(maxBytes / 1024 / 1024).toFixed(0)}MB), retrying HEAD-only`);
    const headResult = await mkBundle('HEAD');
    if (headResult.code !== 0) {
        return {
            ok: false,
            error: `git bundle create HEAD failed (${headResult.code}): ${headResult.stderr.slice(0, 200)}`,
            failReason: 'git_error',
        };
    }
    const { size: headSize } = await (0, promises_1.stat)(bundlePath);
    if (headSize <= maxBytes) {
        return { ok: true, size: headSize, scope: 'head' };
    }
    // Last resort: squash to a single parentless commit. Uses the stash tree
    // when WIP exists (bakes uncommitted changes in — can't bundle the stash
    // ref separately since its parents would drag history back).
    (0, debug_js_1.logForDebugging)(`[gitBundle] HEAD bundle is ${(headSize / 1024 / 1024).toFixed(1)}MB, retrying squashed-root`);
    const treeRef = hasStash ? 'refs/seed/stash^{tree}' : 'HEAD^{tree}';
    const commitTree = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['commit-tree', treeRef, '-m', 'seed'], { cwd: gitRoot, abortSignal: signal });
    if (commitTree.code !== 0) {
        return {
            ok: false,
            error: `git commit-tree failed (${commitTree.code}): ${commitTree.stderr.slice(0, 200)}`,
            failReason: 'git_error',
        };
    }
    const squashedSha = commitTree.stdout.trim();
    await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['update-ref', 'refs/seed/root', squashedSha], { cwd: gitRoot });
    const squashResult = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['bundle', 'create', bundlePath, 'refs/seed/root'], { cwd: gitRoot, abortSignal: signal });
    if (squashResult.code !== 0) {
        return {
            ok: false,
            error: `git bundle create refs/seed/root failed (${squashResult.code}): ${squashResult.stderr.slice(0, 200)}`,
            failReason: 'git_error',
        };
    }
    const { size: squashSize } = await (0, promises_1.stat)(bundlePath);
    if (squashSize <= maxBytes) {
        return { ok: true, size: squashSize, scope: 'squashed' };
    }
    return {
        ok: false,
        error: 'Repo is too large to bundle. Please setup GitHub on https://claude.ai/code',
        failReason: 'too_large',
    };
}
// Bundle the repo and upload to Files API; return file_id for
// seed_bundle_file_id. --all → HEAD → squashed-root fallback chain.
// Tracked WIP via stash create → refs/seed/stash (or baked into the
// squashed tree); untracked not captured.
async function createAndUploadGitBundle(config, opts) {
    const workdir = opts?.cwd ?? (0, cwd_js_1.getCwd)();
    const gitRoot = (0, git_js_1.findGitRoot)(workdir);
    if (!gitRoot) {
        return { success: false, error: 'Not in a git repository' };
    }
    // Sweep stale refs from a crashed prior run before --all bundles them.
    // Runs before the empty-repo check so it's never skipped by an early return.
    for (const ref of ['refs/seed/stash', 'refs/seed/root']) {
        await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['update-ref', '-d', ref], {
            cwd: gitRoot,
        });
    }
    // `git bundle create` refuses to create an empty bundle (exit 128), and
    // `stash create` fails with "You do not have the initial commit yet".
    // Check for any refs (not just HEAD) so orphan branches with commits
    // elsewhere still bundle — `--all` packs those refs regardless of HEAD.
    const refCheck = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['for-each-ref', '--count=1', 'refs/'], { cwd: gitRoot });
    if (refCheck.code === 0 && refCheck.stdout.trim() === '') {
        (0, index_js_1.logEvent)('tengu_ccr_bundle_upload', {
            outcome: 'empty_repo',
        });
        return {
            success: false,
            error: 'Repository has no commits yet',
            failReason: 'empty_repo',
        };
    }
    // stash create writes a dangling commit — doesn't touch refs/stash or
    // the working tree. Untracked files intentionally excluded.
    const stashResult = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['stash', 'create'], { cwd: gitRoot, abortSignal: opts?.signal });
    // exit 0 + empty stdout = nothing to stash. Nonzero is rare; non-fatal.
    const wipStashSha = stashResult.code === 0 ? stashResult.stdout.trim() : '';
    const hasWip = wipStashSha !== '';
    if (stashResult.code !== 0) {
        (0, debug_js_1.logForDebugging)(`[gitBundle] git stash create failed (${stashResult.code}), proceeding without WIP: ${stashResult.stderr.slice(0, 200)}`);
    }
    else if (hasWip) {
        (0, debug_js_1.logForDebugging)(`[gitBundle] Captured WIP as stash ${wipStashSha}`);
        // env-runner reads the SHA via bundle list-heads refs/seed/stash.
        await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['update-ref', 'refs/seed/stash', wipStashSha], { cwd: gitRoot });
    }
    const bundlePath = (0, tempfile_js_1.generateTempFilePath)('ccr-seed', '.bundle');
    // git leaves a partial file on nonzero exit (e.g. empty-repo 128).
    try {
        const maxBytes = (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_ccr_bundle_max_bytes', null) ?? DEFAULT_BUNDLE_MAX_BYTES;
        const bundle = await _bundleWithFallback(gitRoot, bundlePath, maxBytes, hasWip, opts?.signal);
        if (!bundle.ok) {
            (0, debug_js_1.logForDebugging)(`[gitBundle] ${bundle.error}`);
            (0, index_js_1.logEvent)('tengu_ccr_bundle_upload', {
                outcome: bundle.failReason,
                max_bytes: maxBytes,
            });
            return {
                success: false,
                error: bundle.error,
                failReason: bundle.failReason,
            };
        }
        // Fixed relativePath so CCR can locate it.
        const upload = await (0, filesApi_js_1.uploadFile)(bundlePath, '_source_seed.bundle', config, {
            signal: opts?.signal,
        });
        if (!upload.success) {
            (0, index_js_1.logEvent)('tengu_ccr_bundle_upload', {
                outcome: 'failed',
            });
            return { success: false, error: upload.error };
        }
        (0, debug_js_1.logForDebugging)(`[gitBundle] Uploaded ${upload.size} bytes as file_id ${upload.fileId}`);
        (0, index_js_1.logEvent)('tengu_ccr_bundle_upload', {
            outcome: 'success',
            size_bytes: upload.size,
            scope: bundle.scope,
            has_wip: hasWip,
        });
        return {
            success: true,
            fileId: upload.fileId,
            bundleSizeBytes: upload.size,
            scope: bundle.scope,
            hasWip,
        };
    }
    finally {
        try {
            await (0, promises_1.unlink)(bundlePath);
        }
        catch {
            (0, debug_js_1.logForDebugging)(`[gitBundle] Could not delete ${bundlePath} (non-fatal)`);
        }
        // Always delete — also sweeps a stale ref from a crashed prior run.
        // update-ref -d on a missing ref exits 0.
        for (const ref of ['refs/seed/stash', 'refs/seed/root']) {
            await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), ['update-ref', '-d', ref], {
                cwd: gitRoot,
            });
        }
    }
}
