"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useExitOnCtrlCD = useExitOnCtrlCD;
const react_1 = require("react");
const use_app_js_1 = __importDefault(require("../ink/hooks/use-app.js"));
const useDoublePress_js_1 = require("./useDoublePress.js");
/**
 * Handle ctrl+c and ctrl+d for exiting the application.
 *
 * Uses a time-based double-press mechanism:
 * - First press: Shows "Press X again to exit" message
 * - Second press within timeout: Exits the application
 *
 * Note: We use time-based double-press rather than the chord system because
 * we want the first ctrl+c to also trigger interrupt (handled elsewhere).
 * The chord system would prevent the first press from firing any action.
 *
 * These keys are hardcoded and cannot be rebound via keybindings.json.
 *
 * @param useKeybindingsHook - The useKeybindings hook to use for registering handlers
 *                            (dependency injection to avoid import cycles)
 * @param onInterrupt - Optional callback for features to handle interrupt (ctrl+c).
 *                      Return true if handled, false to fall through to double-press exit.
 * @param onExit - Optional custom exit handler
 * @param isActive - Whether the keybinding is active (default true). Set false
 *                   while an embedded TextInput is focused — TextInput's own
 *                   ctrl+c/d handlers will manage cancel/exit, and Dialog's
 *                   handler would otherwise double-fire (child useInput runs
 *                   before parent useKeybindings, so both see every keypress).
 */
function useExitOnCtrlCD(useKeybindingsHook, onInterrupt, onExit, isActive = true) {
    const { exit } = (0, use_app_js_1.default)();
    const [exitState, setExitState] = (0, react_1.useState)({
        pending: false,
        keyName: null,
    });
    const exitFn = (0, react_1.useMemo)(() => onExit ?? exit, [onExit, exit]);
    // Double-press handler for ctrl+c
    const handleCtrlCDoublePress = (0, useDoublePress_js_1.useDoublePress)(pending => setExitState({ pending, keyName: 'Ctrl-C' }), exitFn);
    // Double-press handler for ctrl+d
    const handleCtrlDDoublePress = (0, useDoublePress_js_1.useDoublePress)(pending => setExitState({ pending, keyName: 'Ctrl-D' }), exitFn);
    // Handler for app:interrupt (ctrl+c by default)
    // Let features handle interrupt first via callback
    const handleInterrupt = (0, react_1.useCallback)(() => {
        if (onInterrupt?.())
            return; // Feature handled it
        handleCtrlCDoublePress();
    }, [handleCtrlCDoublePress, onInterrupt]);
    // Handler for app:exit (ctrl+d by default)
    // This also uses double-press to confirm exit
    const handleExit = (0, react_1.useCallback)(() => {
        handleCtrlDDoublePress();
    }, [handleCtrlDDoublePress]);
    const handlers = (0, react_1.useMemo)(() => ({
        'app:interrupt': handleInterrupt,
        'app:exit': handleExit,
    }), [handleInterrupt, handleExit]);
    useKeybindingsHook(handlers, { context: 'Global', isActive });
    return exitState;
}
