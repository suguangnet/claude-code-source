"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MACOS_RESERVED = exports.TERMINAL_RESERVED = exports.NON_REBINDABLE = void 0;
exports.getReservedShortcuts = getReservedShortcuts;
exports.normalizeKeyForComparison = normalizeKeyForComparison;
const platform_js_1 = require("../utils/platform.js");
/**
 * Shortcuts that cannot be rebound - they are hardcoded in Claude Code.
 */
exports.NON_REBINDABLE = [
    {
        key: 'ctrl+c',
        reason: 'Cannot be rebound - used for interrupt/exit (hardcoded)',
        severity: 'error',
    },
    {
        key: 'ctrl+d',
        reason: 'Cannot be rebound - used for exit (hardcoded)',
        severity: 'error',
    },
    {
        key: 'ctrl+m',
        reason: 'Cannot be rebound - identical to Enter in terminals (both send CR)',
        severity: 'error',
    },
];
/**
 * Terminal control shortcuts that are intercepted by the terminal/OS.
 * These will likely never reach the application.
 *
 * Note: ctrl+s (XOFF) and ctrl+q (XON) are NOT included here because:
 * - Most modern terminals disable flow control by default
 * - We use ctrl+s for the stash feature
 */
exports.TERMINAL_RESERVED = [
    {
        key: 'ctrl+z',
        reason: 'Unix process suspend (SIGTSTP)',
        severity: 'warning',
    },
    {
        key: 'ctrl+\\',
        reason: 'Terminal quit signal (SIGQUIT)',
        severity: 'error',
    },
];
/**
 * macOS-specific shortcuts that the OS intercepts.
 */
exports.MACOS_RESERVED = [
    { key: 'cmd+c', reason: 'macOS system copy', severity: 'error' },
    { key: 'cmd+v', reason: 'macOS system paste', severity: 'error' },
    { key: 'cmd+x', reason: 'macOS system cut', severity: 'error' },
    { key: 'cmd+q', reason: 'macOS quit application', severity: 'error' },
    { key: 'cmd+w', reason: 'macOS close window/tab', severity: 'error' },
    { key: 'cmd+tab', reason: 'macOS app switcher', severity: 'error' },
    { key: 'cmd+space', reason: 'macOS Spotlight', severity: 'error' },
];
/**
 * Get all reserved shortcuts for the current platform.
 * Includes non-rebindable shortcuts and terminal-reserved shortcuts.
 */
function getReservedShortcuts() {
    const platform = (0, platform_js_1.getPlatform)();
    // Non-rebindable shortcuts first (highest priority)
    const reserved = [...exports.NON_REBINDABLE, ...exports.TERMINAL_RESERVED];
    if (platform === 'macos') {
        reserved.push(...exports.MACOS_RESERVED);
    }
    return reserved;
}
/**
 * Normalize a key string for comparison (lowercase, sorted modifiers).
 * Chords (space-separated steps like "ctrl+x ctrl+b") are normalized
 * per-step — splitting on '+' first would mangle "x ctrl" into a mainKey
 * overwritten by the next step, collapsing the chord into its last key.
 */
function normalizeKeyForComparison(key) {
    return key.trim().split(/\s+/).map(normalizeStep).join(' ');
}
function normalizeStep(step) {
    const parts = step.split('+');
    const modifiers = [];
    let mainKey = '';
    for (const part of parts) {
        const lower = part.trim().toLowerCase();
        if ([
            'ctrl',
            'control',
            'alt',
            'opt',
            'option',
            'meta',
            'cmd',
            'command',
            'shift',
        ].includes(lower)) {
            // Normalize modifier names
            if (lower === 'control')
                modifiers.push('ctrl');
            else if (lower === 'option' || lower === 'opt')
                modifiers.push('alt');
            else if (lower === 'command' || lower === 'cmd')
                modifiers.push('cmd');
            else
                modifiers.push(lower);
        }
        else {
            mainKey = lower;
        }
    }
    modifiers.sort();
    return [...modifiers, mainKey].join('+');
}
