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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginTrustWarning = PluginTrustWarning;
const compiler_runtime_1 = require("react/compiler-runtime");
const figures_1 = __importDefault(require("figures"));
const React = __importStar(require("react"));
const ink_js_1 = require("../../ink.js");
const marketplaceHelpers_js_1 = require("../../utils/plugins/marketplaceHelpers.js");
function PluginTrustWarning() {
    const $ = (0, compiler_runtime_1.c)(3);
    let t0;
    if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
        t0 = (0, marketplaceHelpers_js_1.getPluginTrustMessage)();
        $[0] = t0;
    }
    else {
        t0 = $[0];
    }
    const customMessage = t0;
    let t1;
    if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
        t1 = React.createElement(ink_js_1.Text, { color: "claude" },
            figures_1.default.warning,
            " ");
        $[1] = t1;
    }
    else {
        t1 = $[1];
    }
    let t2;
    if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
        t2 = React.createElement(ink_js_1.Box, { marginBottom: 1 },
            t1,
            React.createElement(ink_js_1.Text, { dimColor: true, italic: true },
                "Make sure you trust a plugin before installing, updating, or using it. Anthropic does not control what MCP servers, files, or other software are included in plugins and cannot verify that they will work as intended or that they won't change. See each plugin's homepage for more information.",
                customMessage ? ` ${customMessage}` : ""));
        $[2] = t2;
    }
    else {
        t2 = $[2];
    }
    return t2;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJmaWd1cmVzIiwiUmVhY3QiLCJCb3giLCJUZXh0IiwiZ2V0UGx1Z2luVHJ1c3RNZXNzYWdlIiwiUGx1Z2luVHJ1c3RXYXJuaW5nIiwiJCIsIl9jIiwidDAiLCJTeW1ib2wiLCJmb3IiLCJjdXN0b21NZXNzYWdlIiwidDEiLCJ3YXJuaW5nIiwidDIiXSwic291cmNlcyI6WyJQbHVnaW5UcnVzdFdhcm5pbmcudHN4Il0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBmaWd1cmVzIGZyb20gJ2ZpZ3VyZXMnXG5pbXBvcnQgKiBhcyBSZWFjdCBmcm9tICdyZWFjdCdcbmltcG9ydCB7IEJveCwgVGV4dCB9IGZyb20gJy4uLy4uL2luay5qcydcbmltcG9ydCB7IGdldFBsdWdpblRydXN0TWVzc2FnZSB9IGZyb20gJy4uLy4uL3V0aWxzL3BsdWdpbnMvbWFya2V0cGxhY2VIZWxwZXJzLmpzJ1xuXG5leHBvcnQgZnVuY3Rpb24gUGx1Z2luVHJ1c3RXYXJuaW5nKCk6IFJlYWN0LlJlYWN0Tm9kZSB7XG4gIGNvbnN0IGN1c3RvbU1lc3NhZ2UgPSBnZXRQbHVnaW5UcnVzdE1lc3NhZ2UoKVxuICByZXR1cm4gKFxuICAgIDxCb3ggbWFyZ2luQm90dG9tPXsxfT5cbiAgICAgIDxUZXh0IGNvbG9yPVwiY2xhdWRlXCI+e2ZpZ3VyZXMud2FybmluZ30gPC9UZXh0PlxuICAgICAgPFRleHQgZGltQ29sb3IgaXRhbGljPlxuICAgICAgICBNYWtlIHN1cmUgeW91IHRydXN0IGEgcGx1Z2luIGJlZm9yZSBpbnN0YWxsaW5nLCB1cGRhdGluZywgb3IgdXNpbmcgaXQuXG4gICAgICAgIEFudGhyb3BpYyBkb2VzIG5vdCBjb250cm9sIHdoYXQgTUNQIHNlcnZlcnMsIGZpbGVzLCBvciBvdGhlciBzb2Z0d2FyZVxuICAgICAgICBhcmUgaW5jbHVkZWQgaW4gcGx1Z2lucyBhbmQgY2Fubm90IHZlcmlmeSB0aGF0IHRoZXkgd2lsbCB3b3JrIGFzXG4gICAgICAgIGludGVuZGVkIG9yIHRoYXQgdGhleSB3b24mYXBvczt0IGNoYW5nZS4gU2VlIGVhY2ggcGx1Z2luJmFwb3M7cyBob21lcGFnZVxuICAgICAgICBmb3IgbW9yZSBpbmZvcm1hdGlvbi57Y3VzdG9tTWVzc2FnZSA/IGAgJHtjdXN0b21NZXNzYWdlfWAgOiAnJ31cbiAgICAgIDwvVGV4dD5cbiAgICA8L0JveD5cbiAgKVxufVxuIl0sIm1hcHBpbmdzIjoiO0FBQUEsT0FBT0EsT0FBTyxNQUFNLFNBQVM7QUFDN0IsT0FBTyxLQUFLQyxLQUFLLE1BQU0sT0FBTztBQUM5QixTQUFTQyxHQUFHLEVBQUVDLElBQUksUUFBUSxjQUFjO0FBQ3hDLFNBQVNDLHFCQUFxQixRQUFRLDJDQUEyQztBQUVqRixPQUFPLFNBQUFDLG1CQUFBO0VBQUEsTUFBQUMsQ0FBQSxHQUFBQyxFQUFBO0VBQUEsSUFBQUMsRUFBQTtFQUFBLElBQUFGLENBQUEsUUFBQUcsTUFBQSxDQUFBQyxHQUFBO0lBQ2lCRixFQUFBLEdBQUFKLHFCQUFxQixDQUFDLENBQUM7SUFBQUUsQ0FBQSxNQUFBRSxFQUFBO0VBQUE7SUFBQUEsRUFBQSxHQUFBRixDQUFBO0VBQUE7RUFBN0MsTUFBQUssYUFBQSxHQUFzQkgsRUFBdUI7RUFBQSxJQUFBSSxFQUFBO0VBQUEsSUFBQU4sQ0FBQSxRQUFBRyxNQUFBLENBQUFDLEdBQUE7SUFHekNFLEVBQUEsSUFBQyxJQUFJLENBQU8sS0FBUSxDQUFSLFFBQVEsQ0FBRSxDQUFBWixPQUFPLENBQUFhLE9BQU8sQ0FBRSxDQUFDLEVBQXRDLElBQUksQ0FBeUM7SUFBQVAsQ0FBQSxNQUFBTSxFQUFBO0VBQUE7SUFBQUEsRUFBQSxHQUFBTixDQUFBO0VBQUE7RUFBQSxJQUFBUSxFQUFBO0VBQUEsSUFBQVIsQ0FBQSxRQUFBRyxNQUFBLENBQUFDLEdBQUE7SUFEaERJLEVBQUEsSUFBQyxHQUFHLENBQWUsWUFBQyxDQUFELEdBQUMsQ0FDbEIsQ0FBQUYsRUFBNkMsQ0FDN0MsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFSLEtBQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBTixLQUFLLENBQUMsQ0FBQyxrU0FLRSxDQUFBRCxhQUFhLEdBQWIsSUFBb0JBLGFBQWEsRUFBTyxHQUF4QyxFQUF1QyxDQUMvRCxFQU5DLElBQUksQ0FPUCxFQVRDLEdBQUcsQ0FTRTtJQUFBTCxDQUFBLE1BQUFRLEVBQUE7RUFBQTtJQUFBQSxFQUFBLEdBQUFSLENBQUE7RUFBQTtFQUFBLE9BVE5RLEVBU007QUFBQSIsImlnbm9yZUxpc3QiOltdfQ==
