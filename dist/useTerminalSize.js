"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTerminalSize = useTerminalSize;
const react_1 = require("react");
const TerminalSizeContext_js_1 = require("src/ink/components/TerminalSizeContext.js");
function useTerminalSize() {
    const size = (0, react_1.useContext)(TerminalSizeContext_js_1.TerminalSizeContext);
    if (!size) {
        throw new Error('useTerminalSize must be used within an Ink App component');
    }
    return size;
}
