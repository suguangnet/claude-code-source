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
Object.defineProperty(exports, "__esModule", { value: true });
exports.useVimInput = useVimInput;
const react_1 = __importStar(require("react"));
const Cursor_js_1 = require("../utils/Cursor.js");
const intl_js_1 = require("../utils/intl.js");
const operators_js_1 = require("../vim/operators.js");
const transitions_js_1 = require("../vim/transitions.js");
const types_js_1 = require("../vim/types.js");
const useTextInput_js_1 = require("./useTextInput.js");
function useVimInput(props) {
    const vimStateRef = react_1.default.useRef((0, types_js_1.createInitialVimState)());
    const [mode, setMode] = (0, react_1.useState)('INSERT');
    const persistentRef = react_1.default.useRef((0, types_js_1.createInitialPersistentState)());
    // inputFilter is applied once at the top of handleVimInput (not here) so
    // vim-handled paths that return without calling textInput.onInput still
    // run the filter — otherwise a stateful filter (e.g. lazy-space-after-
    // pill) stays armed across an Escape → NORMAL → INSERT round-trip.
    const textInput = (0, useTextInput_js_1.useTextInput)({ ...props, inputFilter: undefined });
    const { onModeChange, inputFilter } = props;
    const switchToInsertMode = (0, react_1.useCallback)((offset) => {
        if (offset !== undefined) {
            textInput.setOffset(offset);
        }
        vimStateRef.current = { mode: 'INSERT', insertedText: '' };
        setMode('INSERT');
        onModeChange?.('INSERT');
    }, [textInput, onModeChange]);
    const switchToNormalMode = (0, react_1.useCallback)(() => {
        const current = vimStateRef.current;
        if (current.mode === 'INSERT' && current.insertedText) {
            persistentRef.current.lastChange = {
                type: 'insert',
                text: current.insertedText,
            };
        }
        // Vim behavior: move cursor left by 1 when exiting insert mode
        // (unless at beginning of line or at offset 0)
        const offset = textInput.offset;
        if (offset > 0 && props.value[offset - 1] !== '\n') {
            textInput.setOffset(offset - 1);
        }
        vimStateRef.current = { mode: 'NORMAL', command: { type: 'idle' } };
        setMode('NORMAL');
        onModeChange?.('NORMAL');
    }, [onModeChange, textInput, props.value]);
    function createOperatorContext(cursor, isReplay = false) {
        return {
            cursor,
            text: props.value,
            setText: (newText) => props.onChange(newText),
            setOffset: (offset) => textInput.setOffset(offset),
            enterInsert: (offset) => switchToInsertMode(offset),
            getRegister: () => persistentRef.current.register,
            setRegister: (content, linewise) => {
                persistentRef.current.register = content;
                persistentRef.current.registerIsLinewise = linewise;
            },
            getLastFind: () => persistentRef.current.lastFind,
            setLastFind: (type, char) => {
                persistentRef.current.lastFind = { type, char };
            },
            recordChange: isReplay
                ? () => { }
                : (change) => {
                    persistentRef.current.lastChange = change;
                },
        };
    }
    function replayLastChange() {
        const change = persistentRef.current.lastChange;
        if (!change)
            return;
        const cursor = Cursor_js_1.Cursor.fromText(props.value, props.columns, textInput.offset);
        const ctx = createOperatorContext(cursor, true);
        switch (change.type) {
            case 'insert':
                if (change.text) {
                    const newCursor = cursor.insert(change.text);
                    props.onChange(newCursor.text);
                    textInput.setOffset(newCursor.offset);
                }
                break;
            case 'x':
                (0, operators_js_1.executeX)(change.count, ctx);
                break;
            case 'replace':
                (0, operators_js_1.executeReplace)(change.char, change.count, ctx);
                break;
            case 'toggleCase':
                (0, operators_js_1.executeToggleCase)(change.count, ctx);
                break;
            case 'indent':
                (0, operators_js_1.executeIndent)(change.dir, change.count, ctx);
                break;
            case 'join':
                (0, operators_js_1.executeJoin)(change.count, ctx);
                break;
            case 'openLine':
                (0, operators_js_1.executeOpenLine)(change.direction, ctx);
                break;
            case 'operator':
                (0, operators_js_1.executeOperatorMotion)(change.op, change.motion, change.count, ctx);
                break;
            case 'operatorFind':
                (0, operators_js_1.executeOperatorFind)(change.op, change.find, change.char, change.count, ctx);
                break;
            case 'operatorTextObj':
                (0, operators_js_1.executeOperatorTextObj)(change.op, change.scope, change.objType, change.count, ctx);
                break;
        }
    }
    function handleVimInput(rawInput, key) {
        const state = vimStateRef.current;
        // Run inputFilter in all modes so stateful filters disarm on any key,
        // but only apply the transformed input in INSERT — NORMAL-mode command
        // lookups expect single chars and a prepended space would break them.
        const filtered = inputFilter ? inputFilter(rawInput, key) : rawInput;
        const input = state.mode === 'INSERT' ? filtered : rawInput;
        const cursor = Cursor_js_1.Cursor.fromText(props.value, props.columns, textInput.offset);
        if (key.ctrl) {
            textInput.onInput(input, key);
            return;
        }
        // NOTE(keybindings): This escape handler is intentionally NOT migrated to the keybindings system.
        // It's vim's standard INSERT->NORMAL mode switch - a vim-specific behavior that should not be
        // configurable via keybindings. Vim users expect Esc to always exit INSERT mode.
        if (key.escape && state.mode === 'INSERT') {
            switchToNormalMode();
            return;
        }
        // Escape in NORMAL mode cancels any pending command (replace, operator, etc.)
        if (key.escape && state.mode === 'NORMAL') {
            vimStateRef.current = { mode: 'NORMAL', command: { type: 'idle' } };
            return;
        }
        // Pass Enter to base handler regardless of mode (allows submission from NORMAL)
        if (key.return) {
            textInput.onInput(input, key);
            return;
        }
        if (state.mode === 'INSERT') {
            // Track inserted text for dot-repeat
            if (key.backspace || key.delete) {
                if (state.insertedText.length > 0) {
                    vimStateRef.current = {
                        mode: 'INSERT',
                        insertedText: state.insertedText.slice(0, -((0, intl_js_1.lastGrapheme)(state.insertedText).length || 1)),
                    };
                }
            }
            else {
                vimStateRef.current = {
                    mode: 'INSERT',
                    insertedText: state.insertedText + input,
                };
            }
            textInput.onInput(input, key);
            return;
        }
        if (state.mode !== 'NORMAL') {
            return;
        }
        // In idle state, delegate arrow keys to base handler for cursor movement
        // and history fallback (upOrHistoryUp / downOrHistoryDown)
        if (state.command.type === 'idle' &&
            (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow)) {
            textInput.onInput(input, key);
            return;
        }
        const ctx = {
            ...createOperatorContext(cursor, false),
            onUndo: props.onUndo,
            onDotRepeat: replayLastChange,
        };
        // Backspace/Delete are only mapped in motion-expecting states. In
        // literal-char states (replace, find, operatorFind), mapping would turn
        // r+Backspace into "replace with h" and df+Delete into "delete to next x".
        // Delete additionally skips count state: in vim, N<Del> removes a count
        // digit rather than executing Nx; we don't implement digit removal but
        // should at least not turn a cancel into a destructive Nx.
        const expectsMotion = state.command.type === 'idle' ||
            state.command.type === 'count' ||
            state.command.type === 'operator' ||
            state.command.type === 'operatorCount';
        // Map arrow keys to vim motions in NORMAL mode
        let vimInput = input;
        if (key.leftArrow)
            vimInput = 'h';
        else if (key.rightArrow)
            vimInput = 'l';
        else if (key.upArrow)
            vimInput = 'k';
        else if (key.downArrow)
            vimInput = 'j';
        else if (expectsMotion && key.backspace)
            vimInput = 'h';
        else if (expectsMotion && state.command.type !== 'count' && key.delete)
            vimInput = 'x';
        const result = (0, transitions_js_1.transition)(state.command, vimInput, ctx);
        if (result.execute) {
            result.execute();
        }
        // Update command state (only if execute didn't switch to INSERT)
        if (vimStateRef.current.mode === 'NORMAL') {
            if (result.next) {
                vimStateRef.current = { mode: 'NORMAL', command: result.next };
            }
            else if (result.execute) {
                vimStateRef.current = { mode: 'NORMAL', command: { type: 'idle' } };
            }
        }
        if (input === '?' &&
            state.mode === 'NORMAL' &&
            state.command.type === 'idle') {
            props.onChange('?');
        }
    }
    const setModeExternal = (0, react_1.useCallback)((newMode) => {
        if (newMode === 'INSERT') {
            vimStateRef.current = { mode: 'INSERT', insertedText: '' };
        }
        else {
            vimStateRef.current = { mode: 'NORMAL', command: { type: 'idle' } };
        }
        setMode(newMode);
        onModeChange?.(newMode);
    }, [onModeChange]);
    return {
        ...textInput,
        onInput: handleVimInput,
        mode,
        setMode: setModeExternal,
    };
}
