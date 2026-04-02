"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getComputerUseHostAdapter = getComputerUseHostAdapter;
const util_1 = require("util");
const debug_js_1 = require("../debug.js");
const common_js_1 = require("./common.js");
const executor_js_1 = require("./executor.js");
const gates_js_1 = require("./gates.js");
const swiftLoader_js_1 = require("./swiftLoader.js");
class DebugLogger {
    silly(message, ...args) {
        (0, debug_js_1.logForDebugging)((0, util_1.format)(message, ...args), { level: 'debug' });
    }
    debug(message, ...args) {
        (0, debug_js_1.logForDebugging)((0, util_1.format)(message, ...args), { level: 'debug' });
    }
    info(message, ...args) {
        (0, debug_js_1.logForDebugging)((0, util_1.format)(message, ...args), { level: 'info' });
    }
    warn(message, ...args) {
        (0, debug_js_1.logForDebugging)((0, util_1.format)(message, ...args), { level: 'warn' });
    }
    error(message, ...args) {
        (0, debug_js_1.logForDebugging)((0, util_1.format)(message, ...args), { level: 'error' });
    }
}
let cached;
/**
 * Process-lifetime singleton. Built once on first CU tool call; native modules
 * (both `@ant/computer-use-input` and `@ant/computer-use-swift`) are loaded
 * here via the executor factory, which throws on load failure — there is no
 * degraded mode.
 */
function getComputerUseHostAdapter() {
    if (cached)
        return cached;
    cached = {
        serverName: common_js_1.COMPUTER_USE_MCP_SERVER_NAME,
        logger: new DebugLogger(),
        executor: (0, executor_js_1.createCliExecutor)({
            getMouseAnimationEnabled: () => (0, gates_js_1.getChicagoSubGates)().mouseAnimation,
            getHideBeforeActionEnabled: () => (0, gates_js_1.getChicagoSubGates)().hideBeforeAction,
        }),
        ensureOsPermissions: async () => {
            const cu = (0, swiftLoader_js_1.requireComputerUseSwift)();
            const accessibility = cu.tcc.checkAccessibility();
            const screenRecording = cu.tcc.checkScreenRecording();
            return accessibility && screenRecording
                ? { granted: true }
                : { granted: false, accessibility, screenRecording };
        },
        isDisabled: () => !(0, gates_js_1.getChicagoEnabled)(),
        getSubGates: gates_js_1.getChicagoSubGates,
        // cleanup.ts always unhides at turn end — no user preference to disable it.
        getAutoUnhideEnabled: () => true,
        // Pixel-validation JPEG decode+crop. MUST be synchronous (the package
        // does `patch1.equals(patch2)` directly on the return value). Cowork uses
        // Electron's `nativeImage` (sync); our `image-processor-napi` is
        // sharp-compatible and async-only. Returning null → validation skipped,
        // click proceeds — the designed fallback per `PixelCompareResult.skipped`.
        // The sub-gate defaults to false anyway.
        cropRawPatch: () => null,
    };
    return cached;
}
