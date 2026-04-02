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
exports.WorkerBadge = WorkerBadge;
const compiler_runtime_1 = require("react/compiler-runtime");
const React = __importStar(require("react"));
const figures_js_1 = require("../../constants/figures.js");
const ink_js_1 = require("../../ink.js");
const ink_js_2 = require("../../utils/ink.js");
/**
 * Renders a colored badge showing the worker's name for permission prompts.
 * Used to indicate which swarm worker is requesting the permission.
 */
function WorkerBadge(t0) {
    const $ = (0, compiler_runtime_1.c)(7);
    const { name, color } = t0;
    let t1;
    if ($[0] !== color) {
        t1 = (0, ink_js_2.toInkColor)(color);
        $[0] = color;
        $[1] = t1;
    }
    else {
        t1 = $[1];
    }
    const inkColor = t1;
    let t2;
    if ($[2] !== name) {
        t2 = React.createElement(ink_js_1.Text, { bold: true },
            "@",
            name);
        $[2] = name;
        $[3] = t2;
    }
    else {
        t2 = $[3];
    }
    let t3;
    if ($[4] !== inkColor || $[5] !== t2) {
        t3 = React.createElement(ink_js_1.Box, { flexDirection: "row", gap: 1 },
            React.createElement(ink_js_1.Text, { color: inkColor },
                figures_js_1.BLACK_CIRCLE,
                " ",
                t2));
        $[4] = inkColor;
        $[5] = t2;
        $[6] = t3;
    }
    else {
        t3 = $[6];
    }
    return t3;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsIkJMQUNLX0NJUkNMRSIsIkJveCIsIlRleHQiLCJ0b0lua0NvbG9yIiwiV29ya2VyQmFkZ2VQcm9wcyIsIm5hbWUiLCJjb2xvciIsIldvcmtlckJhZGdlIiwidDAiLCIkIiwiX2MiLCJ0MSIsImlua0NvbG9yIiwidDIiLCJ0MyJdLCJzb3VyY2VzIjpbIldvcmtlckJhZGdlLnRzeCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBSZWFjdCBmcm9tICdyZWFjdCdcbmltcG9ydCB7IEJMQUNLX0NJUkNMRSB9IGZyb20gJy4uLy4uL2NvbnN0YW50cy9maWd1cmVzLmpzJ1xuaW1wb3J0IHsgQm94LCBUZXh0IH0gZnJvbSAnLi4vLi4vaW5rLmpzJ1xuaW1wb3J0IHsgdG9JbmtDb2xvciB9IGZyb20gJy4uLy4uL3V0aWxzL2luay5qcydcblxuZXhwb3J0IHR5cGUgV29ya2VyQmFkZ2VQcm9wcyA9IHtcbiAgbmFtZTogc3RyaW5nXG4gIGNvbG9yOiBzdHJpbmdcbn1cblxuLyoqXG4gKiBSZW5kZXJzIGEgY29sb3JlZCBiYWRnZSBzaG93aW5nIHRoZSB3b3JrZXIncyBuYW1lIGZvciBwZXJtaXNzaW9uIHByb21wdHMuXG4gKiBVc2VkIHRvIGluZGljYXRlIHdoaWNoIHN3YXJtIHdvcmtlciBpcyByZXF1ZXN0aW5nIHRoZSBwZXJtaXNzaW9uLlxuICovXG5leHBvcnQgZnVuY3Rpb24gV29ya2VyQmFkZ2Uoe1xuICBuYW1lLFxuICBjb2xvcixcbn06IFdvcmtlckJhZGdlUHJvcHMpOiBSZWFjdC5SZWFjdE5vZGUge1xuICBjb25zdCBpbmtDb2xvciA9IHRvSW5rQ29sb3IoY29sb3IpXG4gIHJldHVybiAoXG4gICAgPEJveCBmbGV4RGlyZWN0aW9uPVwicm93XCIgZ2FwPXsxfT5cbiAgICAgIDxUZXh0IGNvbG9yPXtpbmtDb2xvcn0+XG4gICAgICAgIHtCTEFDS19DSVJDTEV9IDxUZXh0IGJvbGQ+QHtuYW1lfTwvVGV4dD5cbiAgICAgIDwvVGV4dD5cbiAgICA8L0JveD5cbiAgKVxufVxuIl0sIm1hcHBpbmdzIjoiO0FBQUEsT0FBTyxLQUFLQSxLQUFLLE1BQU0sT0FBTztBQUM5QixTQUFTQyxZQUFZLFFBQVEsNEJBQTRCO0FBQ3pELFNBQVNDLEdBQUcsRUFBRUMsSUFBSSxRQUFRLGNBQWM7QUFDeEMsU0FBU0MsVUFBVSxRQUFRLG9CQUFvQjtBQUUvQyxPQUFPLEtBQUtDLGdCQUFnQixHQUFHO0VBQzdCQyxJQUFJLEVBQUUsTUFBTTtFQUNaQyxLQUFLLEVBQUUsTUFBTTtBQUNmLENBQUM7O0FBRUQ7QUFDQTtBQUNBO0FBQ0E7QUFDQSxPQUFPLFNBQUFDLFlBQUFDLEVBQUE7RUFBQSxNQUFBQyxDQUFBLEdBQUFDLEVBQUE7RUFBcUI7SUFBQUwsSUFBQTtJQUFBQztFQUFBLElBQUFFLEVBR1Q7RUFBQSxJQUFBRyxFQUFBO0VBQUEsSUFBQUYsQ0FBQSxRQUFBSCxLQUFBO0lBQ0FLLEVBQUEsR0FBQVIsVUFBVSxDQUFDRyxLQUFLLENBQUM7SUFBQUcsQ0FBQSxNQUFBSCxLQUFBO0lBQUFHLENBQUEsTUFBQUUsRUFBQTtFQUFBO0lBQUFBLEVBQUEsR0FBQUYsQ0FBQTtFQUFBO0VBQWxDLE1BQUFHLFFBQUEsR0FBaUJELEVBQWlCO0VBQUEsSUFBQUUsRUFBQTtFQUFBLElBQUFKLENBQUEsUUFBQUosSUFBQTtJQUliUSxFQUFBLElBQUMsSUFBSSxDQUFDLElBQUksQ0FBSixLQUFHLENBQUMsQ0FBQyxDQUFFUixLQUFHLENBQUUsRUFBakIsSUFBSSxDQUFvQjtJQUFBSSxDQUFBLE1BQUFKLElBQUE7SUFBQUksQ0FBQSxNQUFBSSxFQUFBO0VBQUE7SUFBQUEsRUFBQSxHQUFBSixDQUFBO0VBQUE7RUFBQSxJQUFBSyxFQUFBO0VBQUEsSUFBQUwsQ0FBQSxRQUFBRyxRQUFBLElBQUFILENBQUEsUUFBQUksRUFBQTtJQUY1Q0MsRUFBQSxJQUFDLEdBQUcsQ0FBZSxhQUFLLENBQUwsS0FBSyxDQUFNLEdBQUMsQ0FBRCxHQUFDLENBQzdCLENBQUMsSUFBSSxDQUFRRixLQUFRLENBQVJBLFNBQU8sQ0FBQyxDQUNsQlosYUFBVyxDQUFFLENBQUMsQ0FBQWEsRUFBd0IsQ0FDekMsRUFGQyxJQUFJLENBR1AsRUFKQyxHQUFHLENBSUU7SUFBQUosQ0FBQSxNQUFBRyxRQUFBO0lBQUFILENBQUEsTUFBQUksRUFBQTtJQUFBSixDQUFBLE1BQUFLLEVBQUE7RUFBQTtJQUFBQSxFQUFBLEdBQUFMLENBQUE7RUFBQTtFQUFBLE9BSk5LLEVBSU07QUFBQSIsImlnbm9yZUxpc3QiOltdfQ==
