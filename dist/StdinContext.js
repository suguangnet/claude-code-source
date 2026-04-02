"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("react");
const emitter_js_1 = require("../events/emitter.js");
/**
 * `StdinContext` is a React context, which exposes input stream.
 */
const StdinContext = (0, react_1.createContext)({
    stdin: process.stdin,
    internal_eventEmitter: new emitter_js_1.EventEmitter(),
    setRawMode() { },
    isRawModeSupported: false,
    internal_exitOnCtrlC: true,
    internal_querier: null,
});
// eslint-disable-next-line custom-rules/no-top-level-side-effects
StdinContext.displayName = 'InternalStdinContext';
exports.default = StdinContext;
