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
exports.ExpandShellOutputProvider = ExpandShellOutputProvider;
exports.useExpandShellOutput = useExpandShellOutput;
const compiler_runtime_1 = require("react/compiler-runtime");
const React = __importStar(require("react"));
const react_1 = require("react");
/**
 * Context to indicate that shell output should be shown in full (not truncated).
 * Used to auto-expand the most recent user `!` command output.
 *
 * This follows the same pattern as MessageResponseContext and SubAgentContext -
 * a boolean context that child components can check to modify their behavior.
 */
const ExpandShellOutputContext = React.createContext(false);
function ExpandShellOutputProvider(t0) {
    const $ = (0, compiler_runtime_1.c)(2);
    const { children } = t0;
    let t1;
    if ($[0] !== children) {
        t1 = React.createElement(ExpandShellOutputContext.Provider, { value: true }, children);
        $[0] = children;
        $[1] = t1;
    }
    else {
        t1 = $[1];
    }
    return t1;
}
/**
 * Returns true if this component is rendered inside an ExpandShellOutputProvider,
 * indicating the shell output should be shown in full rather than truncated.
 */
function useExpandShellOutput() {
    return (0, react_1.useContext)(ExpandShellOutputContext);
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsInVzZUNvbnRleHQiLCJFeHBhbmRTaGVsbE91dHB1dENvbnRleHQiLCJjcmVhdGVDb250ZXh0IiwiRXhwYW5kU2hlbGxPdXRwdXRQcm92aWRlciIsInQwIiwiJCIsIl9jIiwiY2hpbGRyZW4iLCJ0MSIsInVzZUV4cGFuZFNoZWxsT3V0cHV0Il0sInNvdXJjZXMiOlsiRXhwYW5kU2hlbGxPdXRwdXRDb250ZXh0LnRzeCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBSZWFjdCBmcm9tICdyZWFjdCdcbmltcG9ydCB7IHVzZUNvbnRleHQgfSBmcm9tICdyZWFjdCdcblxuLyoqXG4gKiBDb250ZXh0IHRvIGluZGljYXRlIHRoYXQgc2hlbGwgb3V0cHV0IHNob3VsZCBiZSBzaG93biBpbiBmdWxsIChub3QgdHJ1bmNhdGVkKS5cbiAqIFVzZWQgdG8gYXV0by1leHBhbmQgdGhlIG1vc3QgcmVjZW50IHVzZXIgYCFgIGNvbW1hbmQgb3V0cHV0LlxuICpcbiAqIFRoaXMgZm9sbG93cyB0aGUgc2FtZSBwYXR0ZXJuIGFzIE1lc3NhZ2VSZXNwb25zZUNvbnRleHQgYW5kIFN1YkFnZW50Q29udGV4dCAtXG4gKiBhIGJvb2xlYW4gY29udGV4dCB0aGF0IGNoaWxkIGNvbXBvbmVudHMgY2FuIGNoZWNrIHRvIG1vZGlmeSB0aGVpciBiZWhhdmlvci5cbiAqL1xuY29uc3QgRXhwYW5kU2hlbGxPdXRwdXRDb250ZXh0ID0gUmVhY3QuY3JlYXRlQ29udGV4dChmYWxzZSlcblxuZXhwb3J0IGZ1bmN0aW9uIEV4cGFuZFNoZWxsT3V0cHV0UHJvdmlkZXIoe1xuICBjaGlsZHJlbixcbn06IHtcbiAgY2hpbGRyZW46IFJlYWN0LlJlYWN0Tm9kZVxufSk6IFJlYWN0LlJlYWN0Tm9kZSB7XG4gIHJldHVybiAoXG4gICAgPEV4cGFuZFNoZWxsT3V0cHV0Q29udGV4dC5Qcm92aWRlciB2YWx1ZT17dHJ1ZX0+XG4gICAgICB7Y2hpbGRyZW59XG4gICAgPC9FeHBhbmRTaGVsbE91dHB1dENvbnRleHQuUHJvdmlkZXI+XG4gIClcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgdGhpcyBjb21wb25lbnQgaXMgcmVuZGVyZWQgaW5zaWRlIGFuIEV4cGFuZFNoZWxsT3V0cHV0UHJvdmlkZXIsXG4gKiBpbmRpY2F0aW5nIHRoZSBzaGVsbCBvdXRwdXQgc2hvdWxkIGJlIHNob3duIGluIGZ1bGwgcmF0aGVyIHRoYW4gdHJ1bmNhdGVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdXNlRXhwYW5kU2hlbGxPdXRwdXQoKTogYm9vbGVhbiB7XG4gIHJldHVybiB1c2VDb250ZXh0KEV4cGFuZFNoZWxsT3V0cHV0Q29udGV4dClcbn1cbiJdLCJtYXBwaW5ncyI6IjtBQUFBLE9BQU8sS0FBS0EsS0FBSyxNQUFNLE9BQU87QUFDOUIsU0FBU0MsVUFBVSxRQUFRLE9BQU87O0FBRWxDO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsTUFBTUMsd0JBQXdCLEdBQUdGLEtBQUssQ0FBQ0csYUFBYSxDQUFDLEtBQUssQ0FBQztBQUUzRCxPQUFPLFNBQUFDLDBCQUFBQyxFQUFBO0VBQUEsTUFBQUMsQ0FBQSxHQUFBQyxFQUFBO0VBQW1DO0lBQUFDO0VBQUEsSUFBQUgsRUFJekM7RUFBQSxJQUFBSSxFQUFBO0VBQUEsSUFBQUgsQ0FBQSxRQUFBRSxRQUFBO0lBRUdDLEVBQUEsc0NBQTBDLEtBQUksQ0FBSixLQUFHLENBQUMsQ0FDM0NELFNBQU8sQ0FDVixvQ0FBb0M7SUFBQUYsQ0FBQSxNQUFBRSxRQUFBO0lBQUFGLENBQUEsTUFBQUcsRUFBQTtFQUFBO0lBQUFBLEVBQUEsR0FBQUgsQ0FBQTtFQUFBO0VBQUEsT0FGcENHLEVBRW9DO0FBQUE7O0FBSXhDO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsT0FBTyxTQUFBQyxxQkFBQTtFQUFBLE9BQ0VULFVBQVUsQ0FBQ0Msd0JBQXdCLENBQUM7QUFBQSIsImlnbm9yZUxpc3QiOltdfQ==
