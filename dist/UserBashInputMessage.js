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
exports.UserBashInputMessage = UserBashInputMessage;
const compiler_runtime_1 = require("react/compiler-runtime");
const React = __importStar(require("react"));
const ink_js_1 = require("../../ink.js");
const messages_js_1 = require("../../utils/messages.js");
function UserBashInputMessage(t0) {
    const $ = (0, compiler_runtime_1.c)(8);
    const { param: t1, addMargin } = t0;
    const { text } = t1;
    let t2;
    if ($[0] !== text) {
        t2 = (0, messages_js_1.extractTag)(text, "bash-input");
        $[0] = text;
        $[1] = t2;
    }
    else {
        t2 = $[1];
    }
    const input = t2;
    if (!input) {
        return null;
    }
    const t3 = addMargin ? 1 : 0;
    let t4;
    if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
        t4 = React.createElement(ink_js_1.Text, { color: "bashBorder" }, "! ");
        $[2] = t4;
    }
    else {
        t4 = $[2];
    }
    let t5;
    if ($[3] !== input) {
        t5 = React.createElement(ink_js_1.Text, { color: "text" }, input);
        $[3] = input;
        $[4] = t5;
    }
    else {
        t5 = $[4];
    }
    let t6;
    if ($[5] !== t3 || $[6] !== t5) {
        t6 = React.createElement(ink_js_1.Box, { flexDirection: "row", marginTop: t3, backgroundColor: "bashMessageBackgroundColor", paddingRight: 1 },
            t4,
            t5);
        $[5] = t3;
        $[6] = t5;
        $[7] = t6;
    }
    else {
        t6 = $[7];
    }
    return t6;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJUZXh0QmxvY2tQYXJhbSIsIlJlYWN0IiwiQm94IiwiVGV4dCIsImV4dHJhY3RUYWciLCJQcm9wcyIsImFkZE1hcmdpbiIsInBhcmFtIiwiVXNlckJhc2hJbnB1dE1lc3NhZ2UiLCJ0MCIsIiQiLCJfYyIsInQxIiwidGV4dCIsInQyIiwiaW5wdXQiLCJ0MyIsInQ0IiwiU3ltYm9sIiwiZm9yIiwidDUiLCJ0NiJdLCJzb3VyY2VzIjpbIlVzZXJCYXNoSW5wdXRNZXNzYWdlLnRzeCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7IFRleHRCbG9ja1BhcmFtIH0gZnJvbSAnQGFudGhyb3BpYy1haS9zZGsvcmVzb3VyY2VzL2luZGV4Lm1qcydcbmltcG9ydCAqIGFzIFJlYWN0IGZyb20gJ3JlYWN0J1xuaW1wb3J0IHsgQm94LCBUZXh0IH0gZnJvbSAnLi4vLi4vaW5rLmpzJ1xuaW1wb3J0IHsgZXh0cmFjdFRhZyB9IGZyb20gJy4uLy4uL3V0aWxzL21lc3NhZ2VzLmpzJ1xuXG50eXBlIFByb3BzID0ge1xuICBhZGRNYXJnaW46IGJvb2xlYW5cbiAgcGFyYW06IFRleHRCbG9ja1BhcmFtXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBVc2VyQmFzaElucHV0TWVzc2FnZSh7XG4gIHBhcmFtOiB7IHRleHQgfSxcbiAgYWRkTWFyZ2luLFxufTogUHJvcHMpOiBSZWFjdC5SZWFjdE5vZGUge1xuICBjb25zdCBpbnB1dCA9IGV4dHJhY3RUYWcodGV4dCwgJ2Jhc2gtaW5wdXQnKVxuICBpZiAoIWlucHV0KSB7XG4gICAgcmV0dXJuIG51bGxcbiAgfVxuICByZXR1cm4gKFxuICAgIDxCb3hcbiAgICAgIGZsZXhEaXJlY3Rpb249XCJyb3dcIlxuICAgICAgbWFyZ2luVG9wPXthZGRNYXJnaW4gPyAxIDogMH1cbiAgICAgIGJhY2tncm91bmRDb2xvcj1cImJhc2hNZXNzYWdlQmFja2dyb3VuZENvbG9yXCJcbiAgICAgIHBhZGRpbmdSaWdodD17MX1cbiAgICA+XG4gICAgICA8VGV4dCBjb2xvcj1cImJhc2hCb3JkZXJcIj4hIDwvVGV4dD5cbiAgICAgIDxUZXh0IGNvbG9yPVwidGV4dFwiPntpbnB1dH08L1RleHQ+XG4gICAgPC9Cb3g+XG4gIClcbn1cbiJdLCJtYXBwaW5ncyI6IjtBQUFBLGNBQWNBLGNBQWMsUUFBUSx1Q0FBdUM7QUFDM0UsT0FBTyxLQUFLQyxLQUFLLE1BQU0sT0FBTztBQUM5QixTQUFTQyxHQUFHLEVBQUVDLElBQUksUUFBUSxjQUFjO0FBQ3hDLFNBQVNDLFVBQVUsUUFBUSx5QkFBeUI7QUFFcEQsS0FBS0MsS0FBSyxHQUFHO0VBQ1hDLFNBQVMsRUFBRSxPQUFPO0VBQ2xCQyxLQUFLLEVBQUVQLGNBQWM7QUFDdkIsQ0FBQztBQUVELE9BQU8sU0FBQVEscUJBQUFDLEVBQUE7RUFBQSxNQUFBQyxDQUFBLEdBQUFDLEVBQUE7RUFBOEI7SUFBQUosS0FBQSxFQUFBSyxFQUFBO0lBQUFOO0VBQUEsSUFBQUcsRUFHN0I7RUFGQztJQUFBSTtFQUFBLElBQUFELEVBQVE7RUFBQSxJQUFBRSxFQUFBO0VBQUEsSUFBQUosQ0FBQSxRQUFBRyxJQUFBO0lBR0RDLEVBQUEsR0FBQVYsVUFBVSxDQUFDUyxJQUFJLEVBQUUsWUFBWSxDQUFDO0lBQUFILENBQUEsTUFBQUcsSUFBQTtJQUFBSCxDQUFBLE1BQUFJLEVBQUE7RUFBQTtJQUFBQSxFQUFBLEdBQUFKLENBQUE7RUFBQTtFQUE1QyxNQUFBSyxLQUFBLEdBQWNELEVBQThCO0VBQzVDLElBQUksQ0FBQ0MsS0FBSztJQUFBLE9BQ0QsSUFBSTtFQUFBO0VBS0UsTUFBQUMsRUFBQSxHQUFBVixTQUFTLEdBQVQsQ0FBaUIsR0FBakIsQ0FBaUI7RUFBQSxJQUFBVyxFQUFBO0VBQUEsSUFBQVAsQ0FBQSxRQUFBUSxNQUFBLENBQUFDLEdBQUE7SUFJNUJGLEVBQUEsSUFBQyxJQUFJLENBQU8sS0FBWSxDQUFaLFlBQVksQ0FBQyxFQUFFLEVBQTFCLElBQUksQ0FBNkI7SUFBQVAsQ0FBQSxNQUFBTyxFQUFBO0VBQUE7SUFBQUEsRUFBQSxHQUFBUCxDQUFBO0VBQUE7RUFBQSxJQUFBVSxFQUFBO0VBQUEsSUFBQVYsQ0FBQSxRQUFBSyxLQUFBO0lBQ2xDSyxFQUFBLElBQUMsSUFBSSxDQUFPLEtBQU0sQ0FBTixNQUFNLENBQUVMLE1BQUksQ0FBRSxFQUF6QixJQUFJLENBQTRCO0lBQUFMLENBQUEsTUFBQUssS0FBQTtJQUFBTCxDQUFBLE1BQUFVLEVBQUE7RUFBQTtJQUFBQSxFQUFBLEdBQUFWLENBQUE7RUFBQTtFQUFBLElBQUFXLEVBQUE7RUFBQSxJQUFBWCxDQUFBLFFBQUFNLEVBQUEsSUFBQU4sQ0FBQSxRQUFBVSxFQUFBO0lBUG5DQyxFQUFBLElBQUMsR0FBRyxDQUNZLGFBQUssQ0FBTCxLQUFLLENBQ1IsU0FBaUIsQ0FBakIsQ0FBQUwsRUFBZ0IsQ0FBQyxDQUNaLGVBQTRCLENBQTVCLDRCQUE0QixDQUM5QixZQUFDLENBQUQsR0FBQyxDQUVmLENBQUFDLEVBQWlDLENBQ2pDLENBQUFHLEVBQWdDLENBQ2xDLEVBUkMsR0FBRyxDQVFFO0lBQUFWLENBQUEsTUFBQU0sRUFBQTtJQUFBTixDQUFBLE1BQUFVLEVBQUE7SUFBQVYsQ0FBQSxNQUFBVyxFQUFBO0VBQUE7SUFBQUEsRUFBQSxHQUFBWCxDQUFBO0VBQUE7RUFBQSxPQVJOVyxFQVFNO0FBQUEiLCJpZ25vcmVMaXN0IjpbXX0=
