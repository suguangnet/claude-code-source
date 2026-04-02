"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalWriteProvider = exports.TerminalWriteContext = void 0;
exports.useTerminalNotification = useTerminalNotification;
const react_1 = require("react");
const terminal_js_1 = require("./terminal.js");
const ansi_js_1 = require("./termio/ansi.js");
const osc_js_1 = require("./termio/osc.js");
exports.TerminalWriteContext = (0, react_1.createContext)(null);
exports.TerminalWriteProvider = exports.TerminalWriteContext.Provider;
function useTerminalNotification() {
    const writeRaw = (0, react_1.useContext)(exports.TerminalWriteContext);
    if (!writeRaw) {
        throw new Error('useTerminalNotification must be used within TerminalWriteProvider');
    }
    const notifyITerm2 = (0, react_1.useCallback)(({ message, title }) => {
        const displayString = title ? `${title}:\n${message}` : message;
        writeRaw((0, osc_js_1.wrapForMultiplexer)((0, osc_js_1.osc)(osc_js_1.OSC.ITERM2, `\n\n${displayString}`)));
    }, [writeRaw]);
    const notifyKitty = (0, react_1.useCallback)(({ message, title, id, }) => {
        writeRaw((0, osc_js_1.wrapForMultiplexer)((0, osc_js_1.osc)(osc_js_1.OSC.KITTY, `i=${id}:d=0:p=title`, title)));
        writeRaw((0, osc_js_1.wrapForMultiplexer)((0, osc_js_1.osc)(osc_js_1.OSC.KITTY, `i=${id}:p=body`, message)));
        writeRaw((0, osc_js_1.wrapForMultiplexer)((0, osc_js_1.osc)(osc_js_1.OSC.KITTY, `i=${id}:d=1:a=focus`, '')));
    }, [writeRaw]);
    const notifyGhostty = (0, react_1.useCallback)(({ message, title }) => {
        writeRaw((0, osc_js_1.wrapForMultiplexer)((0, osc_js_1.osc)(osc_js_1.OSC.GHOSTTY, 'notify', title, message)));
    }, [writeRaw]);
    const notifyBell = (0, react_1.useCallback)(() => {
        // Raw BEL — inside tmux this triggers tmux's bell-action (window flag).
        // Wrapping would make it opaque DCS payload and lose that fallback.
        writeRaw(ansi_js_1.BEL);
    }, [writeRaw]);
    const progress = (0, react_1.useCallback)((state, percentage) => {
        if (!(0, terminal_js_1.isProgressReportingAvailable)()) {
            return;
        }
        if (!state) {
            writeRaw((0, osc_js_1.wrapForMultiplexer)((0, osc_js_1.osc)(osc_js_1.OSC.ITERM2, osc_js_1.ITERM2.PROGRESS, osc_js_1.PROGRESS.CLEAR, '')));
            return;
        }
        const pct = Math.max(0, Math.min(100, Math.round(percentage ?? 0)));
        switch (state) {
            case 'completed':
                writeRaw((0, osc_js_1.wrapForMultiplexer)((0, osc_js_1.osc)(osc_js_1.OSC.ITERM2, osc_js_1.ITERM2.PROGRESS, osc_js_1.PROGRESS.CLEAR, '')));
                break;
            case 'error':
                writeRaw((0, osc_js_1.wrapForMultiplexer)((0, osc_js_1.osc)(osc_js_1.OSC.ITERM2, osc_js_1.ITERM2.PROGRESS, osc_js_1.PROGRESS.ERROR, pct)));
                break;
            case 'indeterminate':
                writeRaw((0, osc_js_1.wrapForMultiplexer)((0, osc_js_1.osc)(osc_js_1.OSC.ITERM2, osc_js_1.ITERM2.PROGRESS, osc_js_1.PROGRESS.INDETERMINATE, '')));
                break;
            case 'running':
                writeRaw((0, osc_js_1.wrapForMultiplexer)((0, osc_js_1.osc)(osc_js_1.OSC.ITERM2, osc_js_1.ITERM2.PROGRESS, osc_js_1.PROGRESS.SET, pct)));
                break;
            case null:
                // Handled by the if guard above
                break;
        }
    }, [writeRaw]);
    return (0, react_1.useMemo)(() => ({ notifyITerm2, notifyKitty, notifyGhostty, notifyBell, progress }), [notifyITerm2, notifyKitty, notifyGhostty, notifyBell, progress]);
}
