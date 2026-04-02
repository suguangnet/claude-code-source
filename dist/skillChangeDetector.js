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
exports.skillChangeDetector = exports.subscribe = void 0;
exports.initialize = initialize;
exports.dispose = dispose;
exports.resetForTesting = resetForTesting;
const chokidar_1 = __importDefault(require("chokidar"));
const platformPath = __importStar(require("path"));
const state_js_1 = require("../../bootstrap/state.js");
const commands_js_1 = require("../../commands.js");
const index_js_1 = require("../../services/analytics/index.js");
const loadSkillsDir_js_1 = require("../../skills/loadSkillsDir.js");
const attachments_js_1 = require("../attachments.js");
const cleanupRegistry_js_1 = require("../cleanupRegistry.js");
const debug_js_1 = require("../debug.js");
const fsOperations_js_1 = require("../fsOperations.js");
const hooks_js_1 = require("../hooks.js");
const signal_js_1 = require("../signal.js");
/**
 * Time in milliseconds to wait for file writes to stabilize before processing.
 */
const FILE_STABILITY_THRESHOLD_MS = 1000;
/**
 * Polling interval in milliseconds for checking file stability.
 */
const FILE_STABILITY_POLL_INTERVAL_MS = 500;
/**
 * Time in milliseconds to debounce rapid skill change events into a single
 * reload. Prevents cascading reloads when many skill files change at once
 * (e.g. during auto-update or when another session modifies skill directories).
 * Without this, each file change triggers a full clearSkillCaches() +
 * clearCommandsCache() + listener notification cycle, which can deadlock the
 * event loop when dozens of events fire in rapid succession.
 */
const RELOAD_DEBOUNCE_MS = 300;
/**
 * Polling interval for chokidar when usePolling is enabled.
 * Skill files change rarely (manual edits, git operations), so a 2s interval
 * trades negligible latency for far fewer stat() calls than the default 100ms.
 */
const POLLING_INTERVAL_MS = 2000;
/**
 * Bun's native fs.watch() has a PathWatcherManager deadlock (oven-sh/bun#27469,
 * #26385): closing a watcher on the main thread while the File Watcher thread
 * is delivering events can hang both threads in __ulock_wait2 forever. Chokidar
 * with depth: 2 on large skill trees (hundreds of subdirs) triggers this
 * reliably when a git operation touches many directories at once — chokidar
 * internally closes/reopens per-directory FSWatchers as dirs are added/removed.
 *
 * Workaround: use stat() polling under Bun. No FSWatcher = no deadlock.
 * The fix is pending upstream; remove this once the Bun PR lands.
 */
const USE_POLLING = typeof Bun !== 'undefined';
let watcher = null;
let reloadTimer = null;
const pendingChangedPaths = new Set();
let initialized = false;
let disposed = false;
let dynamicSkillsCallbackRegistered = false;
let unregisterCleanup = null;
const skillsChanged = (0, signal_js_1.createSignal)();
// Test overrides for timing constants
let testOverrides = null;
/**
 * Initialize file watching for skill directories
 */
async function initialize() {
    if (initialized || disposed)
        return;
    initialized = true;
    // Register callback for when dynamic skills are loaded (only once)
    if (!dynamicSkillsCallbackRegistered) {
        dynamicSkillsCallbackRegistered = true;
        (0, loadSkillsDir_js_1.onDynamicSkillsLoaded)(() => {
            // Clear memoization caches so new skills are picked up
            // Note: we use clearCommandMemoizationCaches (not clearCommandsCache)
            // because clearCommandsCache would call clearSkillCaches which
            // wipes out the dynamic skills we just loaded
            (0, commands_js_1.clearCommandMemoizationCaches)();
            // Notify listeners that skills changed
            skillsChanged.emit();
        });
    }
    const paths = await getWatchablePaths();
    if (paths.length === 0)
        return;
    (0, debug_js_1.logForDebugging)(`Watching for changes in skill/command directories: ${paths.join(', ')}...`);
    watcher = chokidar_1.default.watch(paths, {
        persistent: true,
        ignoreInitial: true,
        depth: 2, // Skills use skill-name/SKILL.md format
        awaitWriteFinish: {
            stabilityThreshold: testOverrides?.stabilityThreshold ?? FILE_STABILITY_THRESHOLD_MS,
            pollInterval: testOverrides?.pollInterval ?? FILE_STABILITY_POLL_INTERVAL_MS,
        },
        // Ignore special file types (sockets, FIFOs, devices) - they cannot be watched
        // and will error with EOPNOTSUPP on macOS. Only allow regular files and directories.
        ignored: (path, stats) => {
            if (stats && !stats.isFile() && !stats.isDirectory())
                return true;
            // Ignore .git directories
            return path.split(platformPath.sep).some(dir => dir === '.git');
        },
        ignorePermissionErrors: true,
        usePolling: USE_POLLING,
        interval: testOverrides?.chokidarInterval ?? POLLING_INTERVAL_MS,
        atomic: true,
    });
    watcher.on('add', handleChange);
    watcher.on('change', handleChange);
    watcher.on('unlink', handleChange);
    // Register cleanup to properly dispose of the file watcher during graceful shutdown
    unregisterCleanup = (0, cleanupRegistry_js_1.registerCleanup)(async () => {
        await dispose();
    });
}
/**
 * Clean up file watcher
 */
function dispose() {
    disposed = true;
    if (unregisterCleanup) {
        unregisterCleanup();
        unregisterCleanup = null;
    }
    let closePromise = Promise.resolve();
    if (watcher) {
        closePromise = watcher.close();
        watcher = null;
    }
    if (reloadTimer) {
        clearTimeout(reloadTimer);
        reloadTimer = null;
    }
    pendingChangedPaths.clear();
    skillsChanged.clear();
    return closePromise;
}
/**
 * Subscribe to skill changes
 */
exports.subscribe = skillsChanged.subscribe;
async function getWatchablePaths() {
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    const paths = [];
    // User skills directory (~/.claude/skills)
    const userSkillsPath = (0, loadSkillsDir_js_1.getSkillsPath)('userSettings', 'skills');
    if (userSkillsPath) {
        try {
            await fs.stat(userSkillsPath);
            paths.push(userSkillsPath);
        }
        catch {
            // Path doesn't exist, skip it
        }
    }
    // User commands directory (~/.claude/commands)
    const userCommandsPath = (0, loadSkillsDir_js_1.getSkillsPath)('userSettings', 'commands');
    if (userCommandsPath) {
        try {
            await fs.stat(userCommandsPath);
            paths.push(userCommandsPath);
        }
        catch {
            // Path doesn't exist, skip it
        }
    }
    // Project skills directory (.claude/skills)
    const projectSkillsPath = (0, loadSkillsDir_js_1.getSkillsPath)('projectSettings', 'skills');
    if (projectSkillsPath) {
        try {
            // For project settings, resolve to absolute path
            const absolutePath = platformPath.resolve(projectSkillsPath);
            await fs.stat(absolutePath);
            paths.push(absolutePath);
        }
        catch {
            // Path doesn't exist, skip it
        }
    }
    // Project commands directory (.claude/commands)
    const projectCommandsPath = (0, loadSkillsDir_js_1.getSkillsPath)('projectSettings', 'commands');
    if (projectCommandsPath) {
        try {
            // For project settings, resolve to absolute path
            const absolutePath = platformPath.resolve(projectCommandsPath);
            await fs.stat(absolutePath);
            paths.push(absolutePath);
        }
        catch {
            // Path doesn't exist, skip it
        }
    }
    // Additional directories (--add-dir) skills
    for (const dir of (0, state_js_1.getAdditionalDirectoriesForClaudeMd)()) {
        const additionalSkillsPath = platformPath.join(dir, '.claude', 'skills');
        try {
            await fs.stat(additionalSkillsPath);
            paths.push(additionalSkillsPath);
        }
        catch {
            // Path doesn't exist, skip it
        }
    }
    return paths;
}
function handleChange(path) {
    (0, debug_js_1.logForDebugging)(`Detected skill change: ${path}`);
    (0, index_js_1.logEvent)('tengu_skill_file_changed', {
        source: 'chokidar',
    });
    scheduleReload(path);
}
/**
 * Debounce rapid skill changes into a single reload. When many skill files
 * change at once (e.g. auto-update installs a new binary and a new session
 * touches skill directories), each file fires its own chokidar event. Without
 * debouncing, each event triggers clearSkillCaches() + clearCommandsCache() +
 * listener notification — 30 events means 30 full reload cycles, which can
 * deadlock the Bun event loop via rapid FSWatcher watch/unwatch churn.
 */
function scheduleReload(changedPath) {
    pendingChangedPaths.add(changedPath);
    if (reloadTimer)
        clearTimeout(reloadTimer);
    reloadTimer = setTimeout(async () => {
        reloadTimer = null;
        const paths = [...pendingChangedPaths];
        pendingChangedPaths.clear();
        // Fire ConfigChange hook once for the batch — the hook query is always
        // 'skills' so firing per-path (which can be hundreds during a git
        // operation) just spams the hook matcher with identical queries. Pass the
        // first path as a representative; hooks can inspect all paths via the
        // skills directory if they need the full set.
        const results = await (0, hooks_js_1.executeConfigChangeHooks)('skills', paths[0]);
        if ((0, hooks_js_1.hasBlockingResult)(results)) {
            (0, debug_js_1.logForDebugging)(`ConfigChange hook blocked skill reload (${paths.length} paths)`);
            return;
        }
        (0, loadSkillsDir_js_1.clearSkillCaches)();
        (0, commands_js_1.clearCommandsCache)();
        (0, attachments_js_1.resetSentSkillNames)();
        skillsChanged.emit();
    }, testOverrides?.reloadDebounce ?? RELOAD_DEBOUNCE_MS);
}
/**
 * Reset internal state for testing purposes only.
 */
async function resetForTesting(overrides) {
    // Clean up existing watcher if present to avoid resource leaks
    if (watcher) {
        await watcher.close();
        watcher = null;
    }
    if (reloadTimer) {
        clearTimeout(reloadTimer);
        reloadTimer = null;
    }
    pendingChangedPaths.clear();
    skillsChanged.clear();
    initialized = false;
    disposed = false;
    testOverrides = overrides ?? null;
}
exports.skillChangeDetector = {
    initialize,
    dispose,
    subscribe: exports.subscribe,
    resetForTesting,
};
