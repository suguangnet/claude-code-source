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
exports.WorkerPendingPermission = WorkerPendingPermission;
const compiler_runtime_1 = require("react/compiler-runtime");
const React = __importStar(require("react"));
const ink_js_1 = require("../../ink.js");
const teammate_js_1 = require("../../utils/teammate.js");
const Spinner_js_1 = require("../Spinner.js");
const WorkerBadge_js_1 = require("./WorkerBadge.js");
/**
 * Visual indicator shown on workers while waiting for leader to approve a permission request.
 * Displays the pending tool with a spinner and information about what's being requested.
 */
function WorkerPendingPermission(t0) {
    const $ = (0, compiler_runtime_1.c)(15);
    const { toolName, description } = t0;
    let t1;
    if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
        t1 = (0, teammate_js_1.getTeamName)();
        $[0] = t1;
    }
    else {
        t1 = $[0];
    }
    const teamName = t1;
    let t2;
    if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
        t2 = (0, teammate_js_1.getAgentName)();
        $[1] = t2;
    }
    else {
        t2 = $[1];
    }
    const agentName = t2;
    let t3;
    if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
        t3 = (0, teammate_js_1.getTeammateColor)();
        $[2] = t3;
    }
    else {
        t3 = $[2];
    }
    const agentColor = t3;
    let t4;
    let t5;
    if ($[3] === Symbol.for("react.memo_cache_sentinel")) {
        t4 = React.createElement(ink_js_1.Box, { marginBottom: 1 },
            React.createElement(Spinner_js_1.Spinner, null),
            React.createElement(ink_js_1.Text, { color: "warning", bold: true },
                " ",
                "Waiting for team lead approval"));
        t5 = agentName && agentColor && React.createElement(ink_js_1.Box, { marginBottom: 1 },
            React.createElement(WorkerBadge_js_1.WorkerBadge, { name: agentName, color: agentColor }));
        $[3] = t4;
        $[4] = t5;
    }
    else {
        t4 = $[3];
        t5 = $[4];
    }
    let t6;
    if ($[5] === Symbol.for("react.memo_cache_sentinel")) {
        t6 = React.createElement(ink_js_1.Text, { dimColor: true }, "Tool: ");
        $[5] = t6;
    }
    else {
        t6 = $[5];
    }
    let t7;
    if ($[6] !== toolName) {
        t7 = React.createElement(ink_js_1.Box, null,
            t6,
            React.createElement(ink_js_1.Text, null, toolName));
        $[6] = toolName;
        $[7] = t7;
    }
    else {
        t7 = $[7];
    }
    let t8;
    if ($[8] === Symbol.for("react.memo_cache_sentinel")) {
        t8 = React.createElement(ink_js_1.Text, { dimColor: true }, "Action: ");
        $[8] = t8;
    }
    else {
        t8 = $[8];
    }
    let t9;
    if ($[9] !== description) {
        t9 = React.createElement(ink_js_1.Box, null,
            t8,
            React.createElement(ink_js_1.Text, null, description));
        $[9] = description;
        $[10] = t9;
    }
    else {
        t9 = $[10];
    }
    let t10;
    if ($[11] === Symbol.for("react.memo_cache_sentinel")) {
        t10 = teamName && React.createElement(ink_js_1.Box, { marginTop: 1 },
            React.createElement(ink_js_1.Text, { dimColor: true },
                "Permission request sent to team ",
                "\"",
                teamName,
                "\"",
                " leader"));
        $[11] = t10;
    }
    else {
        t10 = $[11];
    }
    let t11;
    if ($[12] !== t7 || $[13] !== t9) {
        t11 = React.createElement(ink_js_1.Box, { flexDirection: "column", borderStyle: "round", borderColor: "warning", paddingX: 1 },
            t4,
            t5,
            t7,
            t9,
            t10);
        $[12] = t7;
        $[13] = t9;
        $[14] = t11;
    }
    else {
        t11 = $[14];
    }
    return t11;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsIkJveCIsIlRleHQiLCJnZXRBZ2VudE5hbWUiLCJnZXRUZWFtbWF0ZUNvbG9yIiwiZ2V0VGVhbU5hbWUiLCJTcGlubmVyIiwiV29ya2VyQmFkZ2UiLCJQcm9wcyIsInRvb2xOYW1lIiwiZGVzY3JpcHRpb24iLCJXb3JrZXJQZW5kaW5nUGVybWlzc2lvbiIsInQwIiwiJCIsIl9jIiwidDEiLCJTeW1ib2wiLCJmb3IiLCJ0ZWFtTmFtZSIsInQyIiwiYWdlbnROYW1lIiwidDMiLCJhZ2VudENvbG9yIiwidDQiLCJ0NSIsInQ2IiwidDciLCJ0OCIsInQ5IiwidDEwIiwidDExIl0sInNvdXJjZXMiOlsiV29ya2VyUGVuZGluZ1Blcm1pc3Npb24udHN4Il0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIFJlYWN0IGZyb20gJ3JlYWN0J1xuaW1wb3J0IHsgQm94LCBUZXh0IH0gZnJvbSAnLi4vLi4vaW5rLmpzJ1xuaW1wb3J0IHtcbiAgZ2V0QWdlbnROYW1lLFxuICBnZXRUZWFtbWF0ZUNvbG9yLFxuICBnZXRUZWFtTmFtZSxcbn0gZnJvbSAnLi4vLi4vdXRpbHMvdGVhbW1hdGUuanMnXG5pbXBvcnQgeyBTcGlubmVyIH0gZnJvbSAnLi4vU3Bpbm5lci5qcydcbmltcG9ydCB7IFdvcmtlckJhZGdlIH0gZnJvbSAnLi9Xb3JrZXJCYWRnZS5qcydcblxudHlwZSBQcm9wcyA9IHtcbiAgdG9vbE5hbWU6IHN0cmluZ1xuICBkZXNjcmlwdGlvbjogc3RyaW5nXG59XG5cbi8qKlxuICogVmlzdWFsIGluZGljYXRvciBzaG93biBvbiB3b3JrZXJzIHdoaWxlIHdhaXRpbmcgZm9yIGxlYWRlciB0byBhcHByb3ZlIGEgcGVybWlzc2lvbiByZXF1ZXN0LlxuICogRGlzcGxheXMgdGhlIHBlbmRpbmcgdG9vbCB3aXRoIGEgc3Bpbm5lciBhbmQgaW5mb3JtYXRpb24gYWJvdXQgd2hhdCdzIGJlaW5nIHJlcXVlc3RlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIFdvcmtlclBlbmRpbmdQZXJtaXNzaW9uKHtcbiAgdG9vbE5hbWUsXG4gIGRlc2NyaXB0aW9uLFxufTogUHJvcHMpOiBSZWFjdC5SZWFjdE5vZGUge1xuICBjb25zdCB0ZWFtTmFtZSA9IGdldFRlYW1OYW1lKClcbiAgY29uc3QgYWdlbnROYW1lID0gZ2V0QWdlbnROYW1lKClcbiAgY29uc3QgYWdlbnRDb2xvciA9IGdldFRlYW1tYXRlQ29sb3IoKVxuXG4gIHJldHVybiAoXG4gICAgPEJveFxuICAgICAgZmxleERpcmVjdGlvbj1cImNvbHVtblwiXG4gICAgICBib3JkZXJTdHlsZT1cInJvdW5kXCJcbiAgICAgIGJvcmRlckNvbG9yPVwid2FybmluZ1wiXG4gICAgICBwYWRkaW5nWD17MX1cbiAgICA+XG4gICAgICA8Qm94IG1hcmdpbkJvdHRvbT17MX0+XG4gICAgICAgIDxTcGlubmVyIC8+XG4gICAgICAgIDxUZXh0IGNvbG9yPVwid2FybmluZ1wiIGJvbGQ+XG4gICAgICAgICAgeycgJ31cbiAgICAgICAgICBXYWl0aW5nIGZvciB0ZWFtIGxlYWQgYXBwcm92YWxcbiAgICAgICAgPC9UZXh0PlxuICAgICAgPC9Cb3g+XG5cbiAgICAgIHthZ2VudE5hbWUgJiYgYWdlbnRDb2xvciAmJiAoXG4gICAgICAgIDxCb3ggbWFyZ2luQm90dG9tPXsxfT5cbiAgICAgICAgICA8V29ya2VyQmFkZ2UgbmFtZT17YWdlbnROYW1lfSBjb2xvcj17YWdlbnRDb2xvcn0gLz5cbiAgICAgICAgPC9Cb3g+XG4gICAgICApfVxuXG4gICAgICA8Qm94PlxuICAgICAgICA8VGV4dCBkaW1Db2xvcj5Ub29sOiA8L1RleHQ+XG4gICAgICAgIDxUZXh0Pnt0b29sTmFtZX08L1RleHQ+XG4gICAgICA8L0JveD5cblxuICAgICAgPEJveD5cbiAgICAgICAgPFRleHQgZGltQ29sb3I+QWN0aW9uOiA8L1RleHQ+XG4gICAgICAgIDxUZXh0PntkZXNjcmlwdGlvbn08L1RleHQ+XG4gICAgICA8L0JveD5cblxuICAgICAge3RlYW1OYW1lICYmIChcbiAgICAgICAgPEJveCBtYXJnaW5Ub3A9ezF9PlxuICAgICAgICAgIDxUZXh0IGRpbUNvbG9yPlxuICAgICAgICAgICAgUGVybWlzc2lvbiByZXF1ZXN0IHNlbnQgdG8gdGVhbSB7J1wiJ31cbiAgICAgICAgICAgIHt0ZWFtTmFtZX1cbiAgICAgICAgICAgIHsnXCInfSBsZWFkZXJcbiAgICAgICAgICA8L1RleHQ+XG4gICAgICAgIDwvQm94PlxuICAgICAgKX1cbiAgICA8L0JveD5cbiAgKVxufVxuIl0sIm1hcHBpbmdzIjoiO0FBQUEsT0FBTyxLQUFLQSxLQUFLLE1BQU0sT0FBTztBQUM5QixTQUFTQyxHQUFHLEVBQUVDLElBQUksUUFBUSxjQUFjO0FBQ3hDLFNBQ0VDLFlBQVksRUFDWkMsZ0JBQWdCLEVBQ2hCQyxXQUFXLFFBQ04seUJBQXlCO0FBQ2hDLFNBQVNDLE9BQU8sUUFBUSxlQUFlO0FBQ3ZDLFNBQVNDLFdBQVcsUUFBUSxrQkFBa0I7QUFFOUMsS0FBS0MsS0FBSyxHQUFHO0VBQ1hDLFFBQVEsRUFBRSxNQUFNO0VBQ2hCQyxXQUFXLEVBQUUsTUFBTTtBQUNyQixDQUFDOztBQUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0EsT0FBTyxTQUFBQyx3QkFBQUMsRUFBQTtFQUFBLE1BQUFDLENBQUEsR0FBQUMsRUFBQTtFQUFpQztJQUFBTCxRQUFBO0lBQUFDO0VBQUEsSUFBQUUsRUFHaEM7RUFBQSxJQUFBRyxFQUFBO0VBQUEsSUFBQUYsQ0FBQSxRQUFBRyxNQUFBLENBQUFDLEdBQUE7SUFDV0YsRUFBQSxHQUFBVixXQUFXLENBQUMsQ0FBQztJQUFBUSxDQUFBLE1BQUFFLEVBQUE7RUFBQTtJQUFBQSxFQUFBLEdBQUFGLENBQUE7RUFBQTtFQUE5QixNQUFBSyxRQUFBLEdBQWlCSCxFQUFhO0VBQUEsSUFBQUksRUFBQTtFQUFBLElBQUFOLENBQUEsUUFBQUcsTUFBQSxDQUFBQyxHQUFBO0lBQ1pFLEVBQUEsR0FBQWhCLFlBQVksQ0FBQyxDQUFDO0lBQUFVLENBQUEsTUFBQU0sRUFBQTtFQUFB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
