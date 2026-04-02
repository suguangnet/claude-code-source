"use strict";
/**
 * Marketplace reconciler — makes known_marketplaces.json consistent with
 * declared intent in settings.
 *
 * Two layers:
 * - diffMarketplaces(): comparison (reads .git for worktree canonicalization, memoized)
 * - reconcileMarketplaces(): bundled diff + install (I/O, idempotent, additive)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.diffMarketplaces = diffMarketplaces;
exports.reconcileMarketplaces = reconcileMarketplaces;
const isEqual_js_1 = __importDefault(require("lodash-es/isEqual.js"));
const path_1 = require("path");
const state_js_1 = require("../../bootstrap/state.js");
const debug_js_1 = require("../debug.js");
const errors_js_1 = require("../errors.js");
const file_js_1 = require("../file.js");
const git_js_1 = require("../git.js");
const log_js_1 = require("../log.js");
const marketplaceManager_js_1 = require("./marketplaceManager.js");
const schemas_js_1 = require("./schemas.js");
/**
 * Compare declared intent (settings) against materialized state (JSON).
 *
 * Resolves relative directory/file paths in `declared` before comparing,
 * so project settings with `./path` match JSON's absolute path. Path
 * resolution reads `.git` to canonicalize worktree paths (memoized).
 */
function diffMarketplaces(declared, materialized, opts) {
    const missing = [];
    const sourceChanged = [];
    const upToDate = [];
    for (const [name, intent] of Object.entries(declared)) {
        const state = materialized[name];
        const normalizedIntent = normalizeSource(intent.source, opts?.projectRoot);
        if (!state) {
            missing.push(name);
        }
        else if (intent.sourceIsFallback) {
            // Fallback: presence suffices. Don't compare sources — the declared source
            // is only a default for the `missing` branch. If seed/prior-install/mirror
            // materialized this marketplace under ANY source, leave it alone. Comparing
            // would report sourceChanged → re-clone → stomp the materialized content.
            upToDate.push(name);
        }
        else if (!(0, isEqual_js_1.default)(normalizedIntent, state.source)) {
            sourceChanged.push({
                name,
                declaredSource: normalizedIntent,
                materializedSource: state.source,
            });
        }
        else {
            upToDate.push(name);
        }
    }
    return { missing, sourceChanged, upToDate };
}
/**
 * Make known_marketplaces.json consistent with declared intent.
 * Idempotent. Additive only (never deletes). Does not touch AppState.
 */
async function reconcileMarketplaces(opts) {
    const declared = (0, marketplaceManager_js_1.getDeclaredMarketplaces)();
    if (Object.keys(declared).length === 0) {
        return { installed: [], updated: [], failed: [], upToDate: [], skipped: [] };
    }
    let materialized;
    try {
        materialized = await (0, marketplaceManager_js_1.loadKnownMarketplacesConfig)();
    }
    catch (e) {
        (0, log_js_1.logError)(e);
        materialized = {};
    }
    const diff = diffMarketplaces(declared, materialized, {
        projectRoot: (0, state_js_1.getOriginalCwd)(),
    });
    const work = [
        ...diff.missing.map((name) => ({
            name,
            source: normalizeSource(declared[name].source),
            action: 'install',
        })),
        ...diff.sourceChanged.map(({ name, declaredSource }) => ({
            name,
            source: declaredSource,
            action: 'update',
        })),
    ];
    const skipped = [];
    const toProcess = [];
    for (const item of work) {
        if (opts?.skip?.(item.name, item.source)) {
            skipped.push(item.name);
            continue;
        }
        // For sourceChanged local-path entries, skip if the declared path doesn't
        // exist. Guards multi-checkout scenarios where normalizeSource can't
        // canonicalize and produces a dead path — the materialized entry may still
        // be valid; addMarketplaceSource would fail anyway, so skipping avoids a
        // noisy "failed" event and preserves the working entry. Missing entries
        // are NOT skipped (nothing to preserve; the user should see the error).
        if (item.action === 'update' &&
            (0, schemas_js_1.isLocalMarketplaceSource)(item.source) &&
            !(await (0, file_js_1.pathExists)(item.source.path))) {
            (0, debug_js_1.logForDebugging)(`[reconcile] '${item.name}' declared path does not exist; keeping materialized entry`);
            skipped.push(item.name);
            continue;
        }
        toProcess.push(item);
    }
    if (toProcess.length === 0) {
        return {
            installed: [],
            updated: [],
            failed: [],
            upToDate: diff.upToDate,
            skipped,
        };
    }
    (0, debug_js_1.logForDebugging)(`[reconcile] ${toProcess.length} marketplace(s): ${toProcess.map(w => `${w.name}(${w.action})`).join(', ')}`);
    const installed = [];
    const updated = [];
    const failed = [];
    for (let i = 0; i < toProcess.length; i++) {
        const { name, source, action } = toProcess[i];
        opts?.onProgress?.({
            type: 'installing',
            name,
            action,
            index: i + 1,
            total: toProcess.length,
        });
        try {
            // addMarketplaceSource is source-idempotent — same source returns
            // alreadyMaterialized:true without cloning. For 'update' (source
            // changed), the new source won't match existing → proceeds with clone
            // and overwrites the old JSON entry.
            const result = await (0, marketplaceManager_js_1.addMarketplaceSource)(source);
            if (action === 'install')
                installed.push(name);
            else
                updated.push(name);
            opts?.onProgress?.({
                type: 'installed',
                name,
                alreadyMaterialized: result.alreadyMaterialized,
            });
        }
        catch (e) {
            const error = (0, errors_js_1.errorMessage)(e);
            failed.push({ name, error });
            opts?.onProgress?.({ type: 'failed', name, error });
            (0, log_js_1.logError)(e);
        }
    }
    return { installed, updated, failed, upToDate: diff.upToDate, skipped };
}
/**
 * Resolve relative directory/file paths for stable comparison.
 * Settings declared at project scope may use project-relative paths;
 * JSON stores absolute paths.
 *
 * For git worktrees, resolve against the main checkout (canonical root)
 * instead of the worktree cwd. Project settings are checked into git,
 * so `./foo` means "relative to this repo" — but known_marketplaces.json is
 * user-global with one entry per marketplace name. Resolving against the
 * worktree cwd means each worktree session overwrites the shared entry with
 * its own absolute path, and deleting the worktree leaves a dead
 * installLocation. The canonical root is stable across all worktrees.
 */
function normalizeSource(source, projectRoot) {
    if ((source.source === 'directory' || source.source === 'file') &&
        !(0, path_1.isAbsolute)(source.path)) {
        const base = projectRoot ?? (0, state_js_1.getOriginalCwd)();
        const canonicalRoot = (0, git_js_1.findCanonicalGitRoot)(base);
        return {
            ...source,
            path: (0, path_1.resolve)(canonicalRoot ?? base, source.path),
        };
    }
    return source;
}
