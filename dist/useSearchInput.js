"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSearchInput = useSearchInput;
const react_1 = require("react");
const keyboard_event_js_1 = require("../ink/events/keyboard-event.js");
// eslint-disable-next-line custom-rules/prefer-use-keybindings -- backward-compat bridge until consumers wire handleKeyDown to <Box onKeyDown>
const ink_js_1 = require("../ink.js");
const Cursor_js_1 = require("../utils/Cursor.js");
const useTerminalSize_js_1 = require("./useTerminalSize.js");
function isKillKey(e) {
    if (e.ctrl && (e.key === 'k' || e.key === 'u' || e.key === 'w')) {
        return true;
    }
    if (e.meta && e.key === 'backspace') {
        return true;
    }
    return false;
}
function isYankKey(e) {
    return (e.ctrl || e.meta) && e.key === 'y';
}
// Special key names that fall through the explicit handlers above the
// text-input branch (return/escape/arrows/home/end/tab/backspace/delete
// all early-return). Reject these so e.g. PageUp doesn't leak 'pageup'
// as literal text. The length>=1 check below is intentionally loose —
// batched input like stdin.write('abc') arrives as one multi-char e.key,
// matching the old useInput(input) behavior where cursor.insert(input)
// inserted the full chunk.
const UNHANDLED_SPECIAL_KEYS = new Set([
    'pageup',
    'pagedown',
    'insert',
    'wheelup',
    'wheeldown',
    'mouse',
    'f1',
    'f2',
    'f3',
    'f4',
    'f5',
    'f6',
    'f7',
    'f8',
    'f9',
    'f10',
    'f11',
    'f12',
]);
function useSearchInput({ isActive, onExit, onCancel, onExitUp, columns, passthroughCtrlKeys = [], initialQuery = '', backspaceExitsOnEmpty = true, }) {
    const { columns: terminalColumns } = (0, useTerminalSize_js_1.useTerminalSize)();
    const effectiveColumns = columns ?? terminalColumns;
    const [query, setQueryState] = (0, react_1.useState)(initialQuery);
    const [cursorOffset, setCursorOffset] = (0, react_1.useState)(initialQuery.length);
    const setQuery = (0, react_1.useCallback)((q) => {
        setQueryState(q);
        setCursorOffset(q.length);
    }, []);
    const handleKeyDown = (e) => {
        if (!isActive)
            return;
        const cursor = Cursor_js_1.Cursor.fromText(query, effectiveColumns, cursorOffset);
        // Check passthrough ctrl keys
        if (e.ctrl && passthroughCtrlKeys.includes(e.key.toLowerCase())) {
            return;
        }
        // Reset kill accumulation for non-kill keys
        if (!isKillKey(e)) {
            (0, Cursor_js_1.resetKillAccumulation)();
        }
        // Reset yank state for non-yank keys
        if (!isYankKey(e)) {
            (0, Cursor_js_1.resetYankState)();
        }
        // Exit conditions
        if (e.key === 'return' || e.key === 'down') {
            e.preventDefault();
            onExit();
            return;
        }
        if (e.key === 'up') {
            e.preventDefault();
            if (onExitUp) {
                onExitUp();
            }
            return;
        }
        if (e.key === 'escape') {
            e.preventDefault();
            if (onCancel) {
                onCancel();
            }
            else if (query.length > 0) {
                setQueryState('');
                setCursorOffset(0);
            }
            else {
                onExit();
            }
            return;
        }
        // Backspace/Delete
        if (e.key === 'backspace') {
            e.preventDefault();
            if (e.meta) {
                // Meta+Backspace: kill word before
                const { cursor: newCursor, killed } = cursor.deleteWordBefore();
                (0, Cursor_js_1.pushToKillRing)(killed, 'prepend');
                setQueryState(newCursor.text);
                setCursorOffset(newCursor.offset);
                return;
            }
            if (query.length === 0) {
                // Backspace past the / — cancel (clear + snap back), not commit.
                // less: same. vim: deletes the / and exits command mode.
                if (backspaceExitsOnEmpty)
                    (onCancel ?? onExit)();
                return;
            }
            const newCursor = cursor.backspace();
            setQueryState(newCursor.text);
            setCursorOffset(newCursor.offset);
            return;
        }
        if (e.key === 'delete') {
            e.preventDefault();
            const newCursor = cursor.del();
            setQueryState(newCursor.text);
            setCursorOffset(newCursor.offset);
            return;
        }
        // Arrow keys with modifiers (word jump)
        if (e.key === 'left' && (e.ctrl || e.meta || e.fn)) {
            e.preventDefault();
            const newCursor = cursor.prevWord();
            setCursorOffset(newCursor.offset);
            return;
        }
        if (e.key === 'right' && (e.ctrl || e.meta || e.fn)) {
            e.preventDefault();
            const newCursor = cursor.nextWord();
            setCursorOffset(newCursor.offset);
            return;
        }
        // Plain arrow keys
        if (e.key === 'left') {
            e.preventDefault();
            const newCursor = cursor.left();
            setCursorOffset(newCursor.offset);
            return;
        }
        if (e.key === 'right') {
            e.preventDefault();
            const newCursor = cursor.right();
            setCursorOffset(newCursor.offset);
            return;
        }
        // Home/End
        if (e.key === 'home') {
            e.preventDefault();
            setCursorOffset(0);
            return;
        }
        if (e.key === 'end') {
            e.preventDefault();
            setCursorOffset(query.length);
            return;
        }
        // Ctrl key bindings
        if (e.ctrl) {
            e.preventDefault();
            switch (e.key.toLowerCase()) {
                case 'a':
                    setCursorOffset(0);
                    return;
                case 'e':
                    setCursorOffset(query.length);
                    return;
                case 'b':
                    setCursorOffset(cursor.left().offset);
                    return;
                case 'f':
                    setCursorOffset(cursor.right().offset);
                    return;
                case 'd': {
                    if (query.length === 0) {
                        ;
                        (onCancel ?? onExit)();
                        return;
                    }
                    const newCursor = cursor.del();
                    setQueryState(newCursor.text);
                    setCursorOffset(newCursor.offset);
                    return;
                }
                case 'h': {
                    if (query.length === 0) {
                        if (backspaceExitsOnEmpty)
                            (onCancel ?? onExit)();
                        return;
                    }
                    const newCursor = cursor.backspace();
                    setQueryState(newCursor.text);
                    setCursorOffset(newCursor.offset);
                    return;
                }
                case 'k': {
                    const { cursor: newCursor, killed } = cursor.deleteToLineEnd();
                    (0, Cursor_js_1.pushToKillRing)(killed, 'append');
                    setQueryState(newCursor.text);
                    setCursorOffset(newCursor.offset);
                    return;
                }
                case 'u': {
                    const { cursor: newCursor, killed } = cursor.deleteToLineStart();
                    (0, Cursor_js_1.pushToKillRing)(killed, 'prepend');
                    setQueryState(newCursor.text);
                    setCursorOffset(newCursor.offset);
                    return;
                }
                case 'w': {
                    const { cursor: newCursor, killed } = cursor.deleteWordBefore();
                    (0, Cursor_js_1.pushToKillRing)(killed, 'prepend');
                    setQueryState(newCursor.text);
                    setCursorOffset(newCursor.offset);
                    return;
                }
                case 'y': {
                    const text = (0, Cursor_js_1.getLastKill)();
                    if (text.length > 0) {
                        const startOffset = cursor.offset;
                        const newCursor = cursor.insert(text);
                        (0, Cursor_js_1.recordYank)(startOffset, text.length);
                        setQueryState(newCursor.text);
                        setCursorOffset(newCursor.offset);
                    }
                    return;
                }
                case 'g':
                case 'c':
                    // Cancel (abandon search). ctrl+g is less's cancel key. Only
                    // fires if onCancel provided — otherwise falls through and
                    // returns silently (11 call sites, most expect ctrl+c to no-op).
                    if (onCancel) {
                        onCancel();
                        return;
                    }
            }
            return;
        }
        // Meta key bindings
        if (e.meta) {
            e.preventDefault();
            switch (e.key.toLowerCase()) {
                case 'b':
                    setCursorOffset(cursor.prevWord().offset);
                    return;
                case 'f':
                    setCursorOffset(cursor.nextWord().offset);
                    return;
                case 'd': {
                    const newCursor = cursor.deleteWordAfter();
                    setQueryState(newCursor.text);
                    setCursorOffset(newCursor.offset);
                    return;
                }
                case 'y': {
                    const popResult = (0, Cursor_js_1.yankPop)();
                    if (popResult) {
                        const { text, start, length } = popResult;
                        const before = query.slice(0, start);
                        const after = query.slice(start + length);
                        const newText = before + text + after;
                        const newOffset = start + text.length;
                        (0, Cursor_js_1.updateYankLength)(text.length);
                        setQueryState(newText);
                        setCursorOffset(newOffset);
                    }
                    return;
                }
            }
            return;
        }
        // Tab: ignore
        if (e.key === 'tab') {
            return;
        }
        // Regular character input. Accepts multi-char e.key so batched writes
        // (stdin.write('abc') in tests, or paste outside bracketed-paste mode)
        // insert the full chunk — matching the old useInput behavior.
        if (e.key.length >= 1 && !UNHANDLED_SPECIAL_KEYS.has(e.key)) {
            e.preventDefault();
            const newCursor = cursor.insert(e.key);
            setQueryState(newCursor.text);
            setCursorOffset(newCursor.offset);
        }
    };
    // Backward-compat bridge: existing consumers don't yet wire handleKeyDown
    // to <Box onKeyDown>. Subscribe via useInput and adapt InputEvent →
    // KeyboardEvent until all 11 call sites are migrated (separate PRs).
    // TODO(onKeyDown-migration): remove once all consumers pass handleKeyDown.
    (0, ink_js_1.useInput)((_input, _key, event) => {
        handleKeyDown(new keyboard_event_js_1.KeyboardEvent(event.keypress));
    }, { isActive });
    return { query, setQuery, cursorOffset, handleKeyDown };
}
