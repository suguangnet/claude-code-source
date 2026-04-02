"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSelection = useSelection;
exports.useHasSelection = useHasSelection;
const react_1 = require("react");
const StdinContext_js_1 = __importDefault(require("../components/StdinContext.js"));
const instances_js_1 = __importDefault(require("../instances.js"));
const selection_js_1 = require("../selection.js");
/**
 * Access to text selection operations on the Ink instance (fullscreen only).
 * Returns no-op functions when fullscreen mode is disabled.
 */
function useSelection() {
    // Look up the Ink instance via stdout — same pattern as instances map.
    // StdinContext is available (it's always provided), and the Ink instance
    // is keyed by stdout which we can get from process.stdout since there's
    // only one Ink instance per process in practice.
    (0, react_1.useContext)(StdinContext_js_1.default); // anchor to App subtree for hook rules
    const ink = instances_js_1.default.get(process.stdout);
    // Memoize so callers can safely use the return value in dependency arrays.
    // ink is a singleton per stdout — stable across renders.
    return (0, react_1.useMemo)(() => {
        if (!ink) {
            return {
                copySelection: () => '',
                copySelectionNoClear: () => '',
                clearSelection: () => { },
                hasSelection: () => false,
                getState: () => null,
                subscribe: () => () => { },
                shiftAnchor: () => { },
                shiftSelection: () => { },
                moveFocus: () => { },
                captureScrolledRows: () => { },
                setSelectionBgColor: () => { },
            };
        }
        return {
            copySelection: () => ink.copySelection(),
            copySelectionNoClear: () => ink.copySelectionNoClear(),
            clearSelection: () => ink.clearTextSelection(),
            hasSelection: () => ink.hasTextSelection(),
            getState: () => ink.selection,
            subscribe: (cb) => ink.subscribeToSelectionChange(cb),
            shiftAnchor: (dRow, minRow, maxRow) => (0, selection_js_1.shiftAnchor)(ink.selection, dRow, minRow, maxRow),
            shiftSelection: (dRow, minRow, maxRow) => ink.shiftSelectionForScroll(dRow, minRow, maxRow),
            moveFocus: (move) => ink.moveSelectionFocus(move),
            captureScrolledRows: (firstRow, lastRow, side) => ink.captureScrolledRows(firstRow, lastRow, side),
            setSelectionBgColor: (color) => ink.setSelectionBgColor(color),
        };
    }, [ink]);
}
const NO_SUBSCRIBE = () => () => { };
const ALWAYS_FALSE = () => false;
/**
 * Reactive selection-exists state. Re-renders the caller when a text
 * selection is created or cleared. Always returns false outside
 * fullscreen mode (selection is only available in alt-screen).
 */
function useHasSelection() {
    (0, react_1.useContext)(StdinContext_js_1.default);
    const ink = instances_js_1.default.get(process.stdout);
    return (0, react_1.useSyncExternalStore)(ink ? ink.subscribeToSelectionChange : NO_SUBSCRIBE, ink ? ink.hasTextSelection : ALWAYS_FALSE);
}
