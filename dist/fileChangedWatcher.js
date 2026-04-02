"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setEnvHookNotifier = setEnvHookNotifier;
exports.initializeFileChangedWatcher = initializeFileChangedWatcher;
exports.updateWatchPaths = updateWatchPaths;
exports.onCwdChangedForHooks = onCwdChangedForHooks;
exports.resetFileChangedWatcherForTesting = resetFileChangedWatcherForTesting;
const chokidar_1 = __importDefault(require("chokidar"));
const path_1 = require("path");
const cleanupRegistry_js_1 = require("../cleanupRegistry.js");
const debug_js_1 = require("../debug.js");
const errors_js_1 = require("../errors.js");
const hooks_js_1 = require("../hooks.js");
const sessionEnvironment_js_1 = require("../sessionEnvironment.js");
const hooksConfigSnapshot_js_1 = require("./hooksConfigSnapshot.js");
let watcher = null;
let currentCwd;
let dynamicWatchPaths = [];
let dynamicWatchPathsSorted = [];
let initialized = false;
let hasEnvHooks = false;
let notifyCallback = null;
function setEnvHookNotifier(cb) {
    notifyCallback = cb;
}
function initializeFileChangedWatcher(cwd) {
    if (initialized)
        return;
    initialized = true;
    currentCwd = cwd;
    const config = (0, hooksConfigSnapshot_js_1.getHooksConfigFromSnapshot)();
    hasEnvHooks =
        (config?.CwdChanged?.length ?? 0) > 0 ||
            (config?.FileChanged?.length ?? 0) > 0;
    if (hasEnvHooks) {
        (0, cleanupRegistry_js_1.registerCleanup)(async () => dispose());
    }
    const paths = resolveWatchPaths(config);
    if (paths.length === 0)
        return;
    startWatching(paths);
}
function resolveWatchPaths(config) {
    const matchers = (config ?? (0, hooksConfigSnapshot_js_1.getHooksConfigFromSnapshot)())?.FileChanged ?? [];
    // Matcher field: filenames to watch in cwd, pipe-separated (e.g. ".envrc|.env")
    const staticPaths = [];
    for (const m of matchers) {
        if (!m.matcher)
            continue;
        for (const name of m.matcher.split('|').map(s => s.trim())) {
            if (!name)
                continue;
            staticPaths.push((0, path_1.isAbsolute)(name) ? name : (0, path_1.join)(currentCwd, name));
        }
    }
    // Combine static matcher paths with dynamic paths from hook output
    return [...new Set([...staticPaths, ...dynamicWatchPaths])];
}
function startWatching(paths) {
    (0, debug_js_1.logForDebugging)(`FileChanged: watching ${paths.length} paths`);
    watcher = chokidar_1.default.watch(paths, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 200 },
        ignorePermissionErrors: true,
    });
    watcher.on('change', p => handleFileEvent(p, 'change'));
    watcher.on('add', p => handleFileEvent(p, 'add'));
    watcher.on('unlink', p => handleFileEvent(p, 'unlink'));
}
function handleFileEvent(path, event) {
    (0, debug_js_1.logForDebugging)(`FileChanged: ${event} ${path}`);
    void (0, hooks_js_1.executeFileChangedHooks)(path, event)
        .then(({ results, watchPaths, systemMessages }) => {
        if (watchPaths.length > 0) {
            updateWatchPaths(watchPaths);
        }
        for (const msg of systemMessages) {
            notifyCallback?.(msg, false);
        }
        for (const r of results) {
            if (!r.succeeded && r.output) {
                notifyCallback?.(r.output, true);
            }
        }
    })
        .catch(e => {
        const msg = (0, errors_js_1.errorMessage)(e);
        (0, debug_js_1.logForDebugging)(`FileChanged hook failed: ${msg}`, {
            level: 'error',
        });
        notifyCallback?.(msg, true);
    });
}
function updateWatchPaths(paths) {
    if (!initialized)
        return;
    const sorted = paths.slice().sort();
    if (sorted.length === dynamicWatchPathsSorted.length &&
        sorted.every((p, i) => p === dynamicWatchPathsSorted[i])) {
        return;
    }
    dynamicWatchPaths = paths;
    dynamicWatchPathsSorted = sorted;
    restartWatching();
}
function restartWatching() {
    if (watcher) {
        void watcher.close();
        watcher = null;
    }
    const paths = resolveWatchPaths();
    if (paths.length > 0) {
        startWatching(paths);
    }
}
async function onCwdChangedForHooks(oldCwd, newCwd) {
    if (oldCwd === newCwd)
        return;
    // Re-evaluate from the current snapshot so mid-session hook changes are picked up
    const config = (0, hooksConfigSnapshot_js_1.getHooksConfigFromSnapshot)();
    const currentHasEnvHooks = (config?.CwdChanged?.length ?? 0) > 0 ||
        (config?.FileChanged?.length ?? 0) > 0;
    if (!currentHasEnvHooks)
        return;
    currentCwd = newCwd;
    await (0, sessionEnvironment_js_1.clearCwdEnvFiles)();
    const hookResult = await (0, hooks_js_1.executeCwdChangedHooks)(oldCwd, newCwd).catch(e => {
        const msg = (0, errors_js_1.errorMessage)(e);
        (0, debug_js_1.logForDebugging)(`CwdChanged hook failed: ${msg}`, {
            level: 'error',
        });
        notifyCallback?.(msg, true);
        return {
            results: [],
            watchPaths: [],
            systemMessages: [],
        };
    });
    dynamicWatchPaths = hookResult.watchPaths;
    dynamicWatchPathsSorted = hookResult.watchPaths.slice().sort();
    for (const msg of hookResult.systemMessages) {
        notifyCallback?.(msg, false);
    }
    for (const r of hookResult.results) {
        if (!r.succeeded && r.output) {
            notifyCallback?.(r.output, true);
        }
    }
    // Re-resolve matcher paths against the new cwd
    if (initialized) {
        restartWatching();
    }
}
function dispose() {
    if (watcher) {
        void watcher.close();
        watcher = null;
    }
    dynamicWatchPaths = [];
    dynamicWatchPathsSorted = [];
    initialized = false;
    hasEnvHooks = false;
    notifyCallback = null;
}
function resetFileChangedWatcherForTesting() {
    dispose();
}
