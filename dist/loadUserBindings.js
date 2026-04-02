"use strict";
/**
 * User keybinding configuration loader with hot-reload support.
 *
 * Loads keybindings from ~/.claude/keybindings.json and watches
 * for changes to reload them automatically.
 *
 * NOTE: User keybinding customization is currently only available for
 * Anthropic employees (USER_TYPE === 'ant'). External users always
 * use the default bindings.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscribeToKeybindingChanges = void 0;
exports.isKeybindingCustomizationEnabled = isKeybindingCustomizationEnabled;
exports.getKeybindingsPath = getKeybindingsPath;
exports.loadKeybindings = loadKeybindings;
exports.loadKeybindingsSync = loadKeybindingsSync;
exports.loadKeybindingsSyncWithWarnings = loadKeybindingsSyncWithWarnings;
exports.initializeKeybindingWatcher = initializeKeybindingWatcher;
exports.disposeKeybindingWatcher = disposeKeybindingWatcher;
exports.getCachedKeybindingWarnings = getCachedKeybindingWarnings;
exports.resetKeybindingLoaderForTesting = resetKeybindingLoaderForTesting;
const chokidar_1 = __importDefault(require("chokidar"));
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const growthbook_js_1 = require("../services/analytics/growthbook.js");
const index_js_1 = require("../services/analytics/index.js");
const cleanupRegistry_js_1 = require("../utils/cleanupRegistry.js");
const debug_js_1 = require("../utils/debug.js");
const envUtils_js_1 = require("../utils/envUtils.js");
const errors_js_1 = require("../utils/errors.js");
const signal_js_1 = require("../utils/signal.js");
const slowOperations_js_1 = require("../utils/slowOperations.js");
const defaultBindings_js_1 = require("./defaultBindings.js");
const parser_js_1 = require("./parser.js");
const validate_js_1 = require("./validate.js");
/**
 * Check if keybinding customization is enabled.
 *
 * Returns true if the tengu_keybinding_customization_release GrowthBook gate is enabled.
 *
 * This function is exported so other parts of the codebase (e.g., /doctor)
 * can check the same condition consistently.
 */
function isKeybindingCustomizationEnabled() {
    return (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_keybinding_customization_release', false);
}
/**
 * Time in milliseconds to wait for file writes to stabilize.
 */
const FILE_STABILITY_THRESHOLD_MS = 500;
/**
 * Polling interval for checking file stability.
 */
const FILE_STABILITY_POLL_INTERVAL_MS = 200;
let watcher = null;
let initialized = false;
let disposed = false;
let cachedBindings = null;
let cachedWarnings = [];
const keybindingsChanged = (0, signal_js_1.createSignal)();
/**
 * Tracks the date (YYYY-MM-DD) when we last logged a custom keybindings load event.
 * Used to ensure we fire the event at most once per day.
 */
let lastCustomBindingsLogDate = null;
/**
 * Log a telemetry event when custom keybindings are loaded, at most once per day.
 * This lets us estimate the percentage of users who customize their keybindings.
 */
function logCustomBindingsLoadedOncePerDay(userBindingCount) {
    const today = new Date().toISOString().slice(0, 10);
    if (lastCustomBindingsLogDate === today)
        return;
    lastCustomBindingsLogDate = today;
    (0, index_js_1.logEvent)('tengu_custom_keybindings_loaded', {
        user_binding_count: userBindingCount,
    });
}
/**
 * Type guard to check if an object is a valid KeybindingBlock.
 */
function isKeybindingBlock(obj) {
    if (typeof obj !== 'object' || obj === null)
        return false;
    const b = obj;
    return (typeof b.context === 'string' &&
        typeof b.bindings === 'object' &&
        b.bindings !== null);
}
/**
 * Type guard to check if an array contains only valid KeybindingBlocks.
 */
function isKeybindingBlockArray(arr) {
    return Array.isArray(arr) && arr.every(isKeybindingBlock);
}
/**
 * Get the path to the user keybindings file.
 */
function getKeybindingsPath() {
    return (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), 'keybindings.json');
}
/**
 * Parse default bindings (cached for performance).
 */
function getDefaultParsedBindings() {
    return (0, parser_js_1.parseBindings)(defaultBindings_js_1.DEFAULT_BINDINGS);
}
/**
 * Load and parse keybindings from user config file.
 * Returns merged default + user bindings along with validation warnings.
 *
 * For external users, always returns default bindings only.
 * User customization is currently gated to Anthropic employees.
 */
async function loadKeybindings() {
    const defaultBindings = getDefaultParsedBindings();
    // Skip user config loading for external users
    if (!isKeybindingCustomizationEnabled()) {
        return { bindings: defaultBindings, warnings: [] };
    }
    const userPath = getKeybindingsPath();
    try {
        const content = await (0, promises_1.readFile)(userPath, 'utf-8');
        const parsed = (0, slowOperations_js_1.jsonParse)(content);
        // Extract bindings array from object wrapper format: { "bindings": [...] }
        let userBlocks;
        if (typeof parsed === 'object' && parsed !== null && 'bindings' in parsed) {
            userBlocks = parsed.bindings;
        }
        else {
            // Invalid format - missing bindings property
            const errorMessage = 'keybindings.json must have a "bindings" array';
            const suggestion = 'Use format: { "bindings": [ ... ] }';
            (0, debug_js_1.logForDebugging)(`[keybindings] Invalid keybindings.json: ${errorMessage}`);
            return {
                bindings: defaultBindings,
                warnings: [
                    {
                        type: 'parse_error',
                        severity: 'error',
                        message: errorMessage,
                        suggestion,
                    },
                ],
            };
        }
        // Validate structure - bindings must be an array of valid keybinding blocks
        if (!isKeybindingBlockArray(userBlocks)) {
            const errorMessage = !Array.isArray(userBlocks)
                ? '"bindings" must be an array'
                : 'keybindings.json contains invalid block structure';
            const suggestion = !Array.isArray(userBlocks)
                ? 'Set "bindings" to an array of keybinding blocks'
                : 'Each block must have "context" (string) and "bindings" (object)';
            (0, debug_js_1.logForDebugging)(`[keybindings] Invalid keybindings.json: ${errorMessage}`);
            return {
                bindings: defaultBindings,
                warnings: [
                    {
                        type: 'parse_error',
                        severity: 'error',
                        message: errorMessage,
                        suggestion,
                    },
                ],
            };
        }
        const userParsed = (0, parser_js_1.parseBindings)(userBlocks);
        (0, debug_js_1.logForDebugging)(`[keybindings] Loaded ${userParsed.length} user bindings from ${userPath}`);
        // User bindings come after defaults, so they override
        const mergedBindings = [...defaultBindings, ...userParsed];
        logCustomBindingsLoadedOncePerDay(userParsed.length);
        // Run validation on user config
        // First check for duplicate keys in raw JSON (JSON.parse silently drops earlier values)
        const duplicateKeyWarnings = (0, validate_js_1.checkDuplicateKeysInJson)(content);
        const warnings = [
            ...duplicateKeyWarnings,
            ...(0, validate_js_1.validateBindings)(userBlocks, mergedBindings),
        ];
        if (warnings.length > 0) {
            (0, debug_js_1.logForDebugging)(`[keybindings] Found ${warnings.length} validation issue(s)`);
        }
        return { bindings: mergedBindings, warnings };
    }
    catch (error) {
        // File doesn't exist - use defaults (user can run /keybindings to create)
        if ((0, errors_js_1.isENOENT)(error)) {
            return { bindings: defaultBindings, warnings: [] };
        }
        // Other error - log and return defaults with warning
        (0, debug_js_1.logForDebugging)(`[keybindings] Error loading ${userPath}: ${(0, errors_js_1.errorMessage)(error)}`);
        return {
            bindings: defaultBindings,
            warnings: [
                {
                    type: 'parse_error',
                    severity: 'error',
                    message: `Failed to parse keybindings.json: ${(0, errors_js_1.errorMessage)(error)}`,
                },
            ],
        };
    }
}
/**
 * Load keybindings synchronously (for initial render).
 * Uses cached value if available.
 */
function loadKeybindingsSync() {
    if (cachedBindings) {
        return cachedBindings;
    }
    const result = loadKeybindingsSyncWithWarnings();
    return result.bindings;
}
/**
 * Load keybindings synchronously with validation warnings.
 * Uses cached values if available.
 *
 * For external users, always returns default bindings only.
 * User customization is currently gated to Anthropic employees.
 */
function loadKeybindingsSyncWithWarnings() {
    if (cachedBindings) {
        return { bindings: cachedBindings, warnings: cachedWarnings };
    }
    const defaultBindings = getDefaultParsedBindings();
    // Skip user config loading for external users
    if (!isKeybindingCustomizationEnabled()) {
        cachedBindings = defaultBindings;
        cachedWarnings = [];
        return { bindings: cachedBindings, warnings: cachedWarnings };
    }
    const userPath = getKeybindingsPath();
    try {
        // sync IO: called from sync context (React useState initializer)
        const content = (0, fs_1.readFileSync)(userPath, 'utf-8');
        const parsed = (0, slowOperations_js_1.jsonParse)(content);
        // Extract bindings array from object wrapper format: { "bindings": [...] }
        let userBlocks;
        if (typeof parsed === 'object' && parsed !== null && 'bindings' in parsed) {
            userBlocks = parsed.bindings;
        }
        else {
            // Invalid format - missing bindings property
            cachedBindings = defaultBindings;
            cachedWarnings = [
                {
                    type: 'parse_error',
                    severity: 'error',
                    message: 'keybindings.json must have a "bindings" array',
                    suggestion: 'Use format: { "bindings": [ ... ] }',
                },
            ];
            return { bindings: cachedBindings, warnings: cachedWarnings };
        }
        // Validate structure - bindings must be an array of valid keybinding blocks
        if (!isKeybindingBlockArray(userBlocks)) {
            const errorMessage = !Array.isArray(userBlocks)
                ? '"bindings" must be an array'
                : 'keybindings.json contains invalid block structure';
            const suggestion = !Array.isArray(userBlocks)
                ? 'Set "bindings" to an array of keybinding blocks'
                : 'Each block must have "context" (string) and "bindings" (object)';
            cachedBindings = defaultBindings;
            cachedWarnings = [
                {
                    type: 'parse_error',
                    severity: 'error',
                    message: errorMessage,
                    suggestion,
                },
            ];
            return { bindings: cachedBindings, warnings: cachedWarnings };
        }
        const userParsed = (0, parser_js_1.parseBindings)(userBlocks);
        (0, debug_js_1.logForDebugging)(`[keybindings] Loaded ${userParsed.length} user bindings from ${userPath}`);
        cachedBindings = [...defaultBindings, ...userParsed];
        logCustomBindingsLoadedOncePerDay(userParsed.length);
        // Run validation - check for duplicate keys in raw JSON first
        const duplicateKeyWarnings = (0, validate_js_1.checkDuplicateKeysInJson)(content);
        cachedWarnings = [
            ...duplicateKeyWarnings,
            ...(0, validate_js_1.validateBindings)(userBlocks, cachedBindings),
        ];
        if (cachedWarnings.length > 0) {
            (0, debug_js_1.logForDebugging)(`[keybindings] Found ${cachedWarnings.length} validation issue(s)`);
        }
        return { bindings: cachedBindings, warnings: cachedWarnings };
    }
    catch {
        // File doesn't exist or error - use defaults (user can run /keybindings to create)
        cachedBindings = defaultBindings;
        cachedWarnings = [];
        return { bindings: cachedBindings, warnings: cachedWarnings };
    }
}
/**
 * Initialize file watching for keybindings.json.
 * Call this once when the app starts.
 *
 * For external users, this is a no-op since user customization is disabled.
 */
async function initializeKeybindingWatcher() {
    if (initialized || disposed)
        return;
    // Skip file watching for external users
    if (!isKeybindingCustomizationEnabled()) {
        (0, debug_js_1.logForDebugging)('[keybindings] Skipping file watcher - user customization disabled');
        return;
    }
    const userPath = getKeybindingsPath();
    const watchDir = (0, path_1.dirname)(userPath);
    // Only watch if parent directory exists
    try {
        const stats = await (0, promises_1.stat)(watchDir);
        if (!stats.isDirectory()) {
            (0, debug_js_1.logForDebugging)(`[keybindings] Not watching: ${watchDir} is not a directory`);
            return;
        }
    }
    catch {
        (0, debug_js_1.logForDebugging)(`[keybindings] Not watching: ${watchDir} does not exist`);
        return;
    }
    // Set initialized only after we've confirmed we can watch
    initialized = true;
    (0, debug_js_1.logForDebugging)(`[keybindings] Watching for changes to ${userPath}`);
    watcher = chokidar_1.default.watch(userPath, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
            stabilityThreshold: FILE_STABILITY_THRESHOLD_MS,
            pollInterval: FILE_STABILITY_POLL_INTERVAL_MS,
        },
        ignorePermissionErrors: true,
        usePolling: false,
        atomic: true,
    });
    watcher.on('add', handleChange);
    watcher.on('change', handleChange);
    watcher.on('unlink', handleDelete);
    // Register cleanup
    (0, cleanupRegistry_js_1.registerCleanup)(async () => disposeKeybindingWatcher());
}
/**
 * Clean up the file watcher.
 */
function disposeKeybindingWatcher() {
    disposed = true;
    if (watcher) {
        void watcher.close();
        watcher = null;
    }
    keybindingsChanged.clear();
}
/**
 * Subscribe to keybinding changes.
 * The listener receives the new parsed bindings when the file changes.
 */
exports.subscribeToKeybindingChanges = keybindingsChanged.subscribe;
async function handleChange(path) {
    (0, debug_js_1.logForDebugging)(`[keybindings] Detected change to ${path}`);
    try {
        const result = await loadKeybindings();
        cachedBindings = result.bindings;
        cachedWarnings = result.warnings;
        // Notify all listeners with the full result
        keybindingsChanged.emit(result);
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`[keybindings] Error reloading: ${(0, errors_js_1.errorMessage)(error)}`);
    }
}
function handleDelete(path) {
    (0, debug_js_1.logForDebugging)(`[keybindings] Detected deletion of ${path}`);
    // Reset to defaults when file is deleted
    const defaultBindings = getDefaultParsedBindings();
    cachedBindings = defaultBindings;
    cachedWarnings = [];
    keybindingsChanged.emit({ bindings: defaultBindings, warnings: [] });
}
/**
 * Get the cached keybinding warnings.
 * Returns empty array if no warnings or bindings haven't been loaded yet.
 */
function getCachedKeybindingWarnings() {
    return cachedWarnings;
}
/**
 * Reset internal state for testing.
 */
function resetKeybindingLoaderForTesting() {
    initialized = false;
    disposed = false;
    cachedBindings = null;
    cachedWarnings = [];
    lastCustomBindingsLogDate = null;
    if (watcher) {
        void watcher.close();
        watcher = null;
    }
    keybindingsChanged.clear();
}
