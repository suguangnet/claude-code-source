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
exports.FlashingChar = FlashingChar;
const compiler_runtime_1 = require("react/compiler-runtime");
const React = __importStar(require("react"));
const ink_js_1 = require("../../ink.js");
const theme_js_1 = require("../../utils/theme.js");
const utils_js_1 = require("./utils.js");
function FlashingChar(t0) {
    const $ = (0, compiler_runtime_1.c)(9);
    const { char, flashOpacity, messageColor, shimmerColor } = t0;
    const [themeName] = (0, ink_js_1.useTheme)();
    let t1;
    if ($[0] !== char || $[1] !== flashOpacity || $[2] !== messageColor || $[3] !== shimmerColor || $[4] !== themeName) {
        t1 = Symbol.for("react.early_return_sentinel");
        bb0: {
            const theme = (0, theme_js_1.getTheme)(themeName);
            const baseColorStr = theme[messageColor];
            const shimmerColorStr = theme[shimmerColor];
            const baseRGB = baseColorStr ? (0, utils_js_1.parseRGB)(baseColorStr) : null;
            const shimmerRGB = shimmerColorStr ? (0, utils_js_1.parseRGB)(shimmerColorStr) : null;
            if (baseRGB && shimmerRGB) {
                const interpolated = (0, utils_js_1.interpolateColor)(baseRGB, shimmerRGB, flashOpacity);
                t1 = React.createElement(ink_js_1.Text, { color: (0, utils_js_1.toRGBColor)(interpolated) }, char);
                break bb0;
            }
        }
        $[0] = char;
        $[1] = flashOpacity;
        $[2] = messageColor;
        $[3] = shimmerColor;
        $[4] = themeName;
        $[5] = t1;
    }
    else {
        t1 = $[5];
    }
    if (t1 !== Symbol.for("react.early_return_sentinel")) {
        return t1;
    }
    const shouldUseShimmer = flashOpacity > 0.5;
    const t2 = shouldUseShimmer ? shimmerColor : messageColor;
    let t3;
    if ($[6] !== char || $[7] !== t2) {
        t3 = React.createElement(ink_js_1.Text, { color: t2 }, char);
        $[6] = char;
        $[7] = t2;
        $[8] = t3;
    }
    else {
        t3 = $[8];
    }
    return t3;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsIlRleHQiLCJ1c2VUaGVtZSIsImdldFRoZW1lIiwiVGhlbWUiLCJpbnRlcnBvbGF0ZUNvbG9yIiwicGFyc2VSR0IiLCJ0b1JHQkNvbG9yIiwiUHJvcHMiLCJjaGFyIiwiZmxhc2hPcGFjaXR5IiwibWVzc2FnZUNvbG9yIiwic2hpbW1lckNvbG9yIiwiRmxhc2hpbmdDaGFyIiwidDAiLCIkIiwiX2MiLCJ0aGVtZU5hbWUiLCJ0MSIsIlN5bWJvbCIsImZvciIsImJiMCIsInRoZW1lIiwiYmFzZUNvbG9yU3RyIiwic2hpbW1lckNvbG9yU3RyIiwiYmFzZVJHQiIsInNoaW1tZXJSR0IiLCJpbnRlcnBvbGF0ZWQiLCJzaG91bGRVc2VTaGltbWVyIiwidDIiLCJ0MyJdLCJzb3VyY2VzIjpbIkZsYXNoaW5nQ2hhci50c3giXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgUmVhY3QgZnJvbSAncmVhY3QnXG5pbXBvcnQgeyBUZXh0LCB1c2VUaGVtZSB9IGZyb20gJy4uLy4uL2luay5qcydcbmltcG9ydCB7IGdldFRoZW1lLCB0eXBlIFRoZW1lIH0gZnJvbSAnLi4vLi4vdXRpbHMvdGhlbWUuanMnXG5pbXBvcnQgeyBpbnRlcnBvbGF0ZUNvbG9yLCBwYXJzZVJHQiwgdG9SR0JDb2xvciB9IGZyb20gJy4vdXRpbHMuanMnXG5cbnR5cGUgUHJvcHMgPSB7XG4gIGNoYXI6IHN0cmluZ1xuICBmbGFzaE9wYWNpdHk6IG51bWJlclxuICBtZXNzYWdlQ29sb3I6IGtleW9mIFRoZW1lXG4gIHNoaW1tZXJDb2xvcjoga2V5b2YgVGhlbWVcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIEZsYXNoaW5nQ2hhcih7XG4gIGNoYXIsXG4gIGZsYXNoT3BhY2l0eSxcbiAgbWVzc2FnZUNvbG9yLFxuICBzaGltbWVyQ29sb3IsXG59OiBQcm9wcyk6IFJlYWN0LlJlYWN0Tm9kZSB7XG4gIGNvbnN0IFt0aGVtZU5hbWVdID0gdXNlVGhlbWUoKVxuICBjb25zdCB0aGVtZSA9IGdldFRoZW1lKHRoZW1lTmFtZSlcblxuICBjb25zdCBiYXNlQ29sb3JTdHIgPSB0aGVtZVttZXNzYWdlQ29sb3JdXG4gIGNvbnN0IHNoaW1tZXJDb2xvclN0ciA9IHRoZW1lW3NoaW1tZXJDb2xvcl1cblxuICBjb25zdCBiYXNlUkdCID0gYmFzZUNvbG9yU3RyID8gcGFyc2VSR0IoYmFzZUNvbG9yU3RyKSA6IG51bGxcbiAgY29uc3Qgc2hpbW1lclJHQiA9IHNoaW1tZXJDb2xvclN0ciA/IHBhcnNlUkdCKHNoaW1tZXJDb2xvclN0cikgOiBudWxsXG5cbiAgaWYgKGJhc2VSR0IgJiYgc2hpbW1lclJHQikge1xuICAgIC8vIFNtb290aCBpbnRlcnBvbGF0aW9uIGJldHdlZW4gY29sb3JzXG4gICAgY29uc3QgaW50ZXJwb2xhdGVkID0gaW50ZXJwb2xhdGVDb2xvcihiYXNlUkdCLCBzaGltbWVyUkdCLCBmbGFzaE9wYWNpdHkpXG4gICAgcmV0dXJuIDxUZXh0IGNvbG9yPXt0b1JHQkNvbG9yKGludGVycG9sYXRlZCl9PntjaGFyfTwvVGV4dD5cbiAgfVxuXG4gIC8vIEZhbGxiYWNrIGZvciBBTlNJIHRoZW1lczogYmluYXJ5IHN3aXRjaFxuICBjb25zdCBzaG91bGRVc2VTaGltbWVyID0gZmxhc2hPcGFjaXR5ID4gMC41XG4gIHJldHVybiAoXG4gICAgPFRleHQgY29sb3I9e3Nob3VsZFVzZVNoaW1tZXIgPyBzaGltbWVyQ29sb3IgOiBtZXNzYWdlQ29sb3J9PntjaGFyfTwvVGV4dD5cbiAgKVxufVxuIl0sIm1hcHBpbmdzIjoiO0FBQUEsT0FBTyxLQUFLQSxLQUFLLE1BQU0sT0FBTztBQUM5QixTQUFTQyxJQUFJLEVBQUVDLFFBQVEsUUFBUSxjQUFjO0FBQzdDLFNBQVNDLFFBQVEsRUFBRSxLQUFLQyxLQUFLLFFBQVEsc0JBQXNCO0FBQzNELFNBQVNDLGdCQUFnQixFQUFFQyxRQUFRLEVBQUVDLFVBQVUsUUFBUSxZQUFZO0FBRW5FLEtBQUtDLEtBQUssR0FBRztFQUNYQyxJQUFJLEVBQUUsTUFBTTtFQUNa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
