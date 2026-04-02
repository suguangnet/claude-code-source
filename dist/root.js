"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderSync = void 0;
exports.createRoot = createRoot;
const debug_js_1 = require("src/utils/debug.js");
const stream_1 = require("stream");
const ink_js_1 = __importDefault(require("./ink.js"));
const instances_js_1 = __importDefault(require("./instances.js"));
/**
 * Mount a component and render the output.
 */
const renderSync = (node, options) => {
    const opts = getOptions(options);
    const inkOptions = {
        stdout: process.stdout,
        stdin: process.stdin,
        stderr: process.stderr,
        exitOnCtrlC: true,
        patchConsole: true,
        ...opts,
    };
    const instance = getInstance(inkOptions.stdout, () => new ink_js_1.default(inkOptions));
    instance.render(node);
    return {
        rerender: instance.render,
        unmount() {
            instance.unmount();
        },
        waitUntilExit: instance.waitUntilExit,
        cleanup: () => instances_js_1.default.delete(inkOptions.stdout),
    };
};
exports.renderSync = renderSync;
const wrappedRender = async (node, options) => {
    // Preserve the microtask boundary that `await loadYoga()` used to provide.
    // Without it, the first render fires synchronously before async startup work
    // (e.g. useReplBridge notification state) settles, and the subsequent Static
    // write overwrites scrollback instead of appending below the logo.
    await Promise.resolve();
    const instance = (0, exports.renderSync)(node, options);
    (0, debug_js_1.logForDebugging)(`[render] first ink render: ${Math.round(process.uptime() * 1000)}ms since process start`);
    return instance;
};
exports.default = wrappedRender;
/**
 * Create an Ink root without rendering anything yet.
 * Like react-dom's createRoot — call root.render() to mount a tree.
 */
async function createRoot({ stdout = process.stdout, stdin = process.stdin, stderr = process.stderr, exitOnCtrlC = true, patchConsole = true, onFrame, } = {}) {
    // See wrappedRender — preserve microtask boundary from the old WASM await.
    await Promise.resolve();
    const instance = new ink_js_1.default({
        stdout,
        stdin,
        stderr,
        exitOnCtrlC,
        patchConsole,
        onFrame,
    });
    // Register in the instances map so that code that looks up the Ink
    // instance by stdout (e.g. external editor pause/resume) can find it.
    instances_js_1.default.set(stdout, instance);
    return {
        render: node => instance.render(node),
        unmount: () => instance.unmount(),
        waitUntilExit: () => instance.waitUntilExit(),
    };
}
const getOptions = (stdout = {}) => {
    if (stdout instanceof stream_1.Stream) {
        return {
            stdout,
            stdin: process.stdin,
        };
    }
    return stdout;
};
const getInstance = (stdout, createInstance) => {
    let instance = instances_js_1.default.get(stdout);
    if (!instance) {
        instance = createInstance();
        instances_js_1.default.set(stdout, instance);
    }
    return instance;
};
