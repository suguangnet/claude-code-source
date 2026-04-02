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
exports.IdeStatusIndicator = IdeStatusIndicator;
const compiler_runtime_1 = require("react/compiler-runtime");
const path_1 = require("path");
const React = __importStar(require("react"));
const useIdeConnectionStatus_js_1 = require("../hooks/useIdeConnectionStatus.js");
const ink_js_1 = require("../ink.js");
function IdeStatusIndicator(t0) {
    const $ = (0, compiler_runtime_1.c)(7);
    const { ideSelection, mcpClients } = t0;
    const { status: ideStatus } = (0, useIdeConnectionStatus_js_1.useIdeConnectionStatus)(mcpClients);
    const shouldShowIdeSelection = ideStatus === "connected" && (ideSelection?.filePath || ideSelection?.text && ideSelection.lineCount > 0);
    if (ideStatus === null || !shouldShowIdeSelection || !ideSelection) {
        return null;
    }
    if (ideSelection.text && ideSelection.lineCount > 0) {
        const t1 = ideSelection.lineCount === 1 ? "line" : "lines";
        let t2;
        if ($[0] !== ideSelection.lineCount || $[1] !== t1) {
            t2 = React.createElement(ink_js_1.Text, { color: "ide", key: "selection-indicator", wrap: "truncate" },
                "\u29C9 ",
                ideSelection.lineCount,
                " ",
                t1,
                " selected");
            $[0] = ideSelection.lineCount;
            $[1] = t1;
            $[2] = t2;
        }
        else {
            t2 = $[2];
        }
        return t2;
    }
    if (ideSelection.filePath) {
        let t1;
        if ($[3] !== ideSelection.filePath) {
            t1 = (0, path_1.basename)(ideSelection.filePath);
            $[3] = ideSelection.filePath;
            $[4] = t1;
        }
        else {
            t1 = $[4];
        }
        let t2;
        if ($[5] !== t1) {
            t2 = React.createElement(ink_js_1.Text, { color: "ide", key: "selection-indicator", wrap: "truncate" },
                "\u29C9 In ",
                t1);
            $[5] = t1;
            $[6] = t2;
        }
        else {
            t2 = $[6];
        }
        return t2;
    }
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJiYXNlbmFtZSIsIlJlYWN0IiwidXNlSWRlQ29ubmVjdGlvblN0YXR1cyIsIklERVNlbGVjdGlvbiIsIlRleHQiLCJNQ1BTZXJ2ZXJDb25uZWN0aW9uIiwiSWRlU3RhdHVzSW5kaWNhdG9yUHJvcHMiLCJpZGVTZWxlY3Rpb24iLCJtY3BDbGllbnRzIiwiSWRlU3RhdHVzSW5kaWNhdG9yIiwidDAiLCIkIiwiX2MiLCJzdGF0dXMiLCJpZGVTdGF0dXMiLCJzaG91bGRTaG93SWRlU2VsZWN0aW9uIiwiZmlsZVBhdGgiLCJ0ZXh0IiwibGluZUNvdW50IiwidDEiLCJ0MiJdLCJzb3VyY2VzIjpbIklkZVN0YXR1c0luZGljYXRvci50c3giXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICdwYXRoJ1xuaW1wb3J0ICogYXMgUmVhY3QgZnJvbSAncmVhY3QnXG5pbXBvcnQgeyB1c2VJZGVDb25uZWN0aW9uU3RhdHVzIH0gZnJvbSAnLi4vaG9va3MvdXNlSWRlQ29ubmVjdGlvblN0YXR1cy5qcydcbmltcG9ydCB0eXBlIHsgSURFU2VsZWN0aW9uIH0gZnJvbSAnLi4vaG9va3MvdXNlSWRlU2VsZWN0aW9uLmpzJ1xuaW1wb3J0IHsgVGV4dCB9IGZyb20gJy4uL2luay5qcydcbmltcG9ydCB0eXBlIHsgTUNQU2VydmVyQ29ubmVjdGlvbiB9IGZyb20gJy4uL3NlcnZpY2VzL21jcC90eXBlcy5qcydcblxudHlwZSBJZGVTdGF0dXNJbmRpY2F0b3JQcm9wcyA9IHtcbiAgaWRlU2VsZWN0aW9uOiBJREVTZWxlY3Rpb24gfCB1bmRlZmluZWRcbiAgbWNwQ2xpZW50cz86IE1DUFNlcnZlckNvbm5lY3Rpb25bXVxufVxuXG5leHBvcnQgZnVuY3Rpb24gSWRlU3RhdHVzSW5kaWNhdG9yKHtcbiAgaWRlU2VsZWN0aW9uLFxuICBtY3BDbGllbnRzLFxufTogSWRlU3RhdHVzSW5kaWNhdG9yUHJvcHMpOiBSZWFjdC5SZWFjdE5vZGUge1xuICBjb25zdCB7IHN0YXR1czogaWRlU3RhdHVzIH0gPSB1c2VJZGVDb25uZWN0aW9uU3RhdHVzKG1jcENsaWVudHMpXG5cbiAgLy8gQ2hlY2sgaWYgd2Ugc2hvdWxkIHNob3cgdGhlIElERSBzZWxlY3Rpb24gaW5kaWNhdG9yXG4gIGNvbnN0IHNob3VsZFNob3dJZGVTZWxlY3Rpb24gPVxuICAgIGlkZVN0YXR1cyA9PT0gJ2Nvbm5lY3RlZCcgJiZcbiAgICAoaWRlU2VsZWN0aW9uPy5maWxlUGF0aCB8fFxuICAgICAgKGlkZVNlbGVjdGlvbj8udGV4dCAmJiBpZGVTZWxlY3Rpb24ubGluZUNvdW50ID4gMCkpXG5cbiAgaWYgKGlkZVN0YXR1cyA9PT0gbnVsbCB8fCAhc2hvdWxkU2hvd0lkZVNlbGVjdGlvbiB8fCAhaWRlU2VsZWN0aW9uKSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxuXG4gIGlmIChpZGVTZWxlY3Rpb24udGV4dCAmJiBpZGVTZWxlY3Rpb24ubGluZUNvdW50ID4gMCkge1xuICAgIHJldHVybiAoXG4gICAgICA8VGV4dCBjb2xvcj1cImlkZVwiIGtleT1cInNlbGVjdGlvbi1pbmRpY2F0b3JcIiB3cmFwPVwidHJ1bmNhdGVcIj5cbiAgICAgICAg4qeJIHtpZGVTZWxlY3Rpb24ubGluZUNvdW50fXsnICd9XG4gICAgICAgIHtpZGVTZWxlY3Rpb24ubGluZUNvdW50ID09PSAxID8gJ2xpbmUnIDogJ2xpbmVzJ30gc2VsZWN0ZWRcbiAgICAgIDwvVGV4dD5cbiAgICApXG4gIH1cblxuICBpZiAoaWRlU2VsZWN0aW9uLmZpbGVQYXRoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIDxUZXh0IGNvbG9yPVwiaWRlXCIga2V5PVwic2VsZWN0aW9uLWluZGljYXRvclwiIHdyYXA9XCJ0cnVuY2F0ZVwiPlxuICAgICAgICDip4kgSW4ge2Jhc2VuYW1lKGlkZVNlbGVjdGlvbi5maWxlUGF0aCl9XG4gICAgICA8L1RleHQ+XG4gICAgKVxuICB9XG59XG4iXSwibWFwcGluZ3MiOiI7QUFBQSxTQUFTQSxRQUFRLFFBQVEs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
