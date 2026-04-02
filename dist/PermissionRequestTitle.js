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
exports.PermissionRequestTitle = PermissionRequestTitle;
const compiler_runtime_1 = require("react/compiler-runtime");
const React = __importStar(require("react"));
const ink_js_1 = require("../../ink.js");
function PermissionRequestTitle(t0) {
    const $ = (0, compiler_runtime_1.c)(13);
    const { title, subtitle, color: t1, workerBadge } = t0;
    const color = t1 === undefined ? "permission" : t1;
    let t2;
    if ($[0] !== color || $[1] !== title) {
        t2 = React.createElement(ink_js_1.Text, { bold: true, color: color }, title);
        $[0] = color;
        $[1] = title;
        $[2] = t2;
    }
    else {
        t2 = $[2];
    }
    let t3;
    if ($[3] !== workerBadge) {
        t3 = workerBadge && React.createElement(ink_js_1.Text, { dimColor: true },
            "\xB7 ",
            "@",
            workerBadge.name);
        $[3] = workerBadge;
        $[4] = t3;
    }
    else {
        t3 = $[4];
    }
    let t4;
    if ($[5] !== t2 || $[6] !== t3) {
        t4 = React.createElement(ink_js_1.Box, { flexDirection: "row", gap: 1 },
            t2,
            t3);
        $[5] = t2;
        $[6] = t3;
        $[7] = t4;
    }
    else {
        t4 = $[7];
    }
    let t5;
    if ($[8] !== subtitle) {
        t5 = subtitle != null && (typeof subtitle === "string" ? React.createElement(ink_js_1.Text, { dimColor: true, wrap: "truncate-start" }, subtitle) : subtitle);
        $[8] = subtitle;
        $[9] = t5;
    }
    else {
        t5 = $[9];
    }
    let t6;
    if ($[10] !== t4 || $[11] !== t5) {
        t6 = React.createElement(ink_js_1.Box, { flexDirection: "column" },
            t4,
            t5);
        $[10] = t4;
        $[11] = t5;
        $[12] = t6;
    }
    else {
        t6 = $[12];
    }
    return t6;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsIkJveCIsIlRleHQiLCJUaGVtZSIsIldvcmtlckJhZGdlUHJvcHMiLCJQcm9wcyIsInRpdGxlIiwic3VidGl0bGUiLCJSZWFjdE5vZGUiLCJjb2xvciIsIndvcmtlckJhZGdlIiwiUGVybWlzc2lvblJlcXVlc3RUaXRsZSIsInQwIiwiJCIsIl9jIiwidDEiLCJ1bmRlZmluZWQiLCJ0MiIsInQzIiwibmFtZSIsInQ0IiwidDUiLCJ0NiJdLCJzb3VyY2VzIjpbIlBlcm1pc3Npb25SZXF1ZXN0VGl0bGUudHN4Il0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIFJlYWN0IGZyb20gJ3JlYWN0J1xuaW1wb3J0IHsgQm94LCBUZXh0IH0gZnJvbSAnLi4vLi4vaW5rLmpzJ1xuaW1wb3J0IHR5cGUgeyBUaGVtZSB9IGZyb20gJy4uLy4uL3V0aWxzL3RoZW1lLmpzJ1xuaW1wb3J0IHR5cGUgeyBXb3JrZXJCYWRnZVByb3BzIH0gZnJvbSAnLi9Xb3JrZXJCYWRnZS5qcydcblxudHlwZSBQcm9wcyA9IHtcbiAgdGl0bGU6IHN0cmluZ1xuICBzdWJ0aXRsZT86IFJlYWN0LlJlYWN0Tm9kZVxuICBjb2xvcj86IGtleW9mIFRoZW1lXG4gIHdvcmtlckJhZGdlPzogV29ya2VyQmFkZ2VQcm9wc1xufVxuXG5leHBvcnQgZnVuY3Rpb24gUGVybWlzc2lvblJlcXVlc3RUaXRsZSh7XG4gIHRpdGxlLFxuICBzdWJ0aXRsZSxcbiAgY29sb3IgPSAncGVybWlzc2lvbicsXG4gIHdvcmtlckJhZGdlLFxufTogUHJvcHMpOiBSZWFjdC5SZWFjdE5vZGUge1xuICByZXR1cm4gKFxuICAgIDxCb3ggZmxleERpcmVjdGlvbj1cImNvbHVtblwiPlxuICAgICAgPEJveCBmbGV4RGlyZWN0aW9uPVwicm93XCIgZ2FwPXsxfT5cbiAgICAgICAgPFRleHQgYm9sZCBjb2xvcj17Y29sb3J9PlxuICAgICAgICAgIHt0aXRsZX1cbiAgICAgICAgPC9UZXh0PlxuICAgICAgICB7d29ya2VyQmFkZ2UgJiYgKFxuICAgICAgICAgIDxUZXh0IGRpbUNvbG9yPlxuICAgICAgICAgICAgeyfCtyAnfUB7d29ya2VyQmFkZ2UubmFtZX1cbiAgICAgICAgICA8L1RleHQ+XG4gICAgICAgICl9XG4gICAgICA8L0JveD5cbiAgICAgIHtzdWJ0aXRsZSAhPSBudWxsICYmXG4gICAgICAgICh0eXBlb2Ygc3VidGl0bGUgPT09ICdzdHJpbmcnID8gKFxuICAgICAgICAgIDxUZXh0IGRpbUNvbG9yIHdyYXA9XCJ0cnVuY2F0ZS1zdGFydFwiPlxuICAgICAgICAgICAge3N1YnRpdGxlfVxuICAgICAgICAgIDwvVGV4dD5cbiAgICAgICAgKSA6IChcbiAgICAgICAgICBzdWJ0aXRsZVxuICAgICAgICApKX1cbiAgICA8L0JveD5cbiAgKVxufVxuIl0sIm1hcHBpbmdzIjoiO0FBQUEsT0FBTyxLQUFLQSxLQUFLLE1BQU0sT0FBTztBQUM5QixTQUFTQyxHQUFHLEVBQUVDLElBQUksUUFBUSxjQUFjO0FBQ3hDLGNBQWNDLEtBQUssUUFBUSxzQkFBc0I7QUFDakQsY0FBY0MsZ0JBQWdCLFFBQVEsa0JBQWtCO0FBRXhELEtBQUtDLEtBQUssR0FBRztFQUNYQyxLQUFLLEVBQUUsTUFBTTtFQUNiQyxRQUFRLENBQUMsRUFBRVAsS0FBSyxDQUFDUSxTQUFTO0VBQzFCQyxLQUFLLENBQUMsRUFBRSxNQUFNTixLQUFLO0VBQ25CTyxXQUFXLENBQUMsRUFBRU4sZ0JBQWdCO0FBQ2hDLENBQUM7QUFFRCxPQUFPLFNBQUFPLHVCQUFBQyxFQUFBO0VBQUEsTUFBQUMsQ0FBQSxHQUFBQyxFQUFBO0VBQWdDO0lBQUFSLEtBQUE7SUFBQUMsUUFBQTtJQUFBRSxLQUFBLEVBQUFNLEVBQUE7SUFBQUw7RUFBQSxJQUFBRSxFQUsvQjtFQUZOLE1BQUFILEtBQUEsR0FBQU0sRUFBb0IsS0FBcEJDLFNBQW9CLEdBQXBCLFlBQW9CLEdBQXBCRCxFQUFvQjtFQUFBLElBQUFFLEVBQUE7RUFBQSxJQUFBSixDQUFBLFFBQUFKLEtBQUEsSUFBQUksQ0FBQSxRQUFBUCxLQUFBO0lBTWRXLEVBQUEsSUFBQyxJQUFJLENBQUMsSUFBSSxDQUFKLEtBQUcsQ0FBQyxDQUFRUixLQUFLLENBQUxBLE1BQUksQ0FBQyxDQUNwQkgsTUFBSSxDQUNQLEVBRkMsSUFBSSxDQUVFO0lBQUFPLENBQUEsTUFBQUosS0FBQTtJQUFBSSxDQUFBLE1BQUFQLEtBQUE7SUFBQU8sQ0FBQSxNQUFBSSxFQUFBO0VBQUE7SUFBQUEsRUFBQSxHQUFBSixDQUFBO0VBQUE7RUFBQSxJQUFBSyxFQUFBO0VBQUEsSUFBQUwsQ0FBQSxRQUFBSCxXQUFBO0lBQ05RLEVBQUEsR0FBQVIsV0FJQSxJQUhDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBUixLQUFPLENBQUMsQ0FDWCxRQUFHLENBQUUsQ0FBRSxDQUFBQSxXQUFXLENBQUFTLElBQUksQ0FDekIsRUFGQyxJQUFJLENBR047SUFBQU4sQ0FBQSxNQUFBSCxXQUFBO0lBQUFHLENBQUEsTUFBQUssRUFBQTtFQUFBO0lBQUFBLEVBQUEsR0FBQUwsQ0FBQTtFQUFBO0VBQUEsSUFBQU8sRUFBQTtFQUFBLElBQUFQLENBQUEsUUFBQUksRUFBQSxJQUFBSixDQUFBLFFBQUFLLEVBQUE7SUFSSEUsRUFBQSxJQUFDLEdBQUcsQ0FBZSxhQUFLLENBQUwsS0FBSyxDQUFNLEdBQUMsQ0FBRCxHQUFDLENBQzdCLENBQUFILEVBRU0sQ0FDTCxDQUFBQyxFQUlELENBQ0YsRUFUQyxHQUFHLENBU0U7SUFBQUwsQ0FBQSxNQUFBSSxFQUFBO0lBQUFKLENBQUEsTUFBQUssRUFBQTtJQUFBTCxDQUFBLE1BQUFPLEVBQUE7RUFBQTtJQUFBQSxFQUFBLEdBQUFQLENBQUE7RUFBQTtFQUFBLElBQUFRLEVBQUE7RUFBQSxJQUFBUixDQUFBLFFBQUFOLFFBQUE7SUFDTGMsRUFBQSxHQUFBZCxRQUFRLElBQUksSUFPVCxLQU5ELE9BQU9BLFFBQVEsS0FBSyxRQU1wQixHQUxDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBUixLQUFPLENBQUMsQ0FBTSxJQUFnQixDQUFoQixnQkFBZ0IsQ0FDakNBLFNBQU8sQ0FDVixFQUZDLElBQUksQ0FLTixHQU5BQSxRQU1DO0lBQUFNLENBQUEsTUFBQU4sUUFBQTtJQUFBTSxDQUFBLE1BQUFRLEVBQUE7RUFBQTtJQUFBQSxFQUFBLEdBQUFSLENBQUE7RUFBQTtFQUFBLElBQUFTLEVBQUE7RUFBQSxJQUFBVCxDQUFBLFNBQUFPLEVBQUEsSUFBQVAsQ0FBQSxTQUFBUSxFQUFBO0lBbEJOQyxFQUFBLElBQUMsR0FBRyxDQUFlLGFBQVEsQ0FBUixRQUFRLENBQ3pCLENBQUFGLEVBU0ssQ0FDSixDQUFBQyxFQU9FLENBQ0wsRUFuQkMsR0FBRyxDQW1CRTtJQUFBUixDQUFBLE9BQUFPLEVBQUE7SUFBQVAsQ0FBQSxPQUFBUSxFQUFBO0lBQUFSLENBQUEsT0FBQVMsRUFBQTtFQUFBO0lBQUFBLEVBQUEsR0FBQVQsQ0FBQTtFQUFBO0VBQUEsT0FuQk5TLEVBbUJNO0FBQUEiLCJpZ25vcmVMaXN0IjpbXX0=
