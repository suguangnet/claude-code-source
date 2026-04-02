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
exports.ShimmerChar = ShimmerChar;
const compiler_runtime_1 = require("react/compiler-runtime");
const React = __importStar(require("react"));
const ink_js_1 = require("../../ink.js");
function ShimmerChar(t0) {
    const $ = (0, compiler_runtime_1.c)(3);
    const { char, index, glimmerIndex, messageColor, shimmerColor } = t0;
    const isHighlighted = index === glimmerIndex;
    const isNearHighlight = Math.abs(index - glimmerIndex) === 1;
    const shouldUseShimmer = isHighlighted || isNearHighlight;
    const t1 = shouldUseShimmer ? shimmerColor : messageColor;
    let t2;
    if ($[0] !== char || $[1] !== t1) {
        t2 = React.createElement(ink_js_1.Text, { color: t1 }, char);
        $[0] = char;
        $[1] = t1;
        $[2] = t2;
    }
    else {
        t2 = $[2];
    }
    return t2;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsIlRleHQiLCJUaGVtZSIsIlByb3BzIiwiY2hhciIsImluZGV4IiwiZ2xpbW1lckluZGV4IiwibWVzc2FnZUNvbG9yIiwic2hpbW1lckNvbG9yIiwiU2hpbW1lckNoYXIiLCJ0MCIsIiQiLCJfYyIsImlzSGlnaGxpZ2h0ZWQiLCJpc05lYXJIaWdobGlnaHQiLCJNYXRoIiwiYWJzIiwic2hvdWxkVXNlU2hpbW1lciIsInQxIiwidDIiXSwic291cmNlcyI6WyJTaGltbWVyQ2hhci50c3giXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgUmVhY3QgZnJvbSAncmVhY3QnXG5pbXBvcnQgeyBUZXh0IH0gZnJvbSAnLi4vLi4vaW5rLmpzJ1xuaW1wb3J0IHR5cGUgeyBUaGVtZSB9IGZyb20gJy4uLy4uL3V0aWxzL3RoZW1lLmpzJ1xuXG50eXBlIFByb3BzID0ge1xuICBjaGFyOiBzdHJpbmdcbiAgaW5kZXg6IG51bWJlclxuICBnbGltbWVySW5kZXg6IG51bWJlclxuICBtZXNzYWdlQ29sb3I6IGtleW9mIFRoZW1lXG4gIHNoaW1tZXJDb2xvcjoga2V5b2YgVGhlbWVcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIFNoaW1tZXJDaGFyKHtcbiAgY2hhcixcbiAgaW5kZXgsXG4gIGdsaW1tZXJJbmRleCxcbiAgbWVzc2FnZUNvbG9yLFxuICBzaGltbWVyQ29sb3IsXG59OiBQcm9wcyk6IFJlYWN0LlJlYWN0Tm9kZSB7XG4gIGNvbnN0IGlzSGlnaGxpZ2h0ZWQgPSBpbmRleCA9PT0gZ2xpbW1lckluZGV4XG4gIGNvbnN0IGlzTmVhckhpZ2hsaWdodCA9IE1hdGguYWJzKGluZGV4IC0gZ2xpbW1lckluZGV4KSA9PT0gMVxuICBjb25zdCBzaG91bGRVc2VTaGltbWVyID0gaXNIaWdobGlnaHRlZCB8fCBpc05lYXJIaWdobGlnaHRcblxuICByZXR1cm4gKFxuICAgIDxUZXh0IGNvbG9yPXtzaG91bGRVc2VTaGltbWVyID8gc2hpbW1lckNvbG9yIDogbWVzc2FnZUNvbG9yfT57Y2hhcn08L1RleHQ+XG4gIClcbn1cbiJdLCJtYXBwaW5ncyI6IjtBQUFBLE9BQU8sS0FBS0EsS0FBSyxNQUFNLE9BQU87QUFDOUIsU0FBU0MsSUFBSSxRQUFRLGNBQWM7QUFDbkMsY0FBY0MsS0FBSyxRQUFRLHNCQUFzQjtBQUVqRCxLQUFLQyxLQUFLLEdBQUc7RUFDWEMsSUFBSSxFQUFFLE1BQU07RUFDWkMsS0FBSyxFQUFFLE1BQU07RUFDYkMsWUFBWSxFQUFFLE1BQU07RUFDcEJDLFlBQVksRUFBRSxNQUFNTCxLQUFLO0VBQ3pCTSxZQUFZLEVBQUUsTUFBTU4sS0FBSztBQUMzQixDQUFDO0FBRUQsT0FBTyxTQUFBTyxZQUFBQyxFQUFBO0VBQUEsTUFBQUMsQ0FBQSxHQUFBQyxFQUFBO0VBQXFCO0lBQUFSLElBQUE7SUFBQUMsS0FBQTtJQUFBQyxZQUFBO0lBQUFDLFlBQUE7SUFBQUM7RUFBQSxJQUFBRSxFQU1wQjtFQUNOLE1BQUFHLGFBQUEsR0FBc0JSLEtBQUssS0FBS0MsWUFBWTtFQUM1QyxNQUFBUSxlQUFBLEdBQXdCQyxJQUFJLENBQUFDLEdBQUksQ0FBQ1gsS0FBSyxHQUFHQyxZQUFZLENBQUMsS0FBSyxDQUFDO0VBQzVELE1BQUFXLGdCQUFBLEdBQXlCSixhQUFnQyxJQUFoQ0MsZUFBZ0M7RUFHMUMsTUFBQUksRUFBQSxHQUFBRCxnQkFBZ0IsR0FBaEJULFlBQThDLEdBQTlDRCxZQUE4QztFQUFBLElBQUFZLEVBQUE7RUFBQSxJQUFBUixDQUFBLFFBQUFQLElBQUEsSUFBQU8sQ0FBQSxRQUFBTyxFQUFBO0lBQTNEQyxFQUFBLElBQUMsSUFBSSxDQUFRLEtBQThDLENBQTlDLENBQUFELEVBQTZDLENBQUMsQ0FBR2QsS0FBRyxDQUFFLEVBQWxFLElBQUksQ0FBcUU7SUFBQU8sQ0FBQSxNQUFBUCxJQUFBO0lBQUFPLENBQUEsTUFBQU8sRUFBQTtJQUFBUCxDQUFBLE1BQUFRLEVBQUE7RUFBQTtJQUFBQSxFQUFBLEdBQUFSLENBQUE7RUFBQTtFQUFBLE9BQTFFUSxFQUEwRTtBQUFBIiwiaWdub3JlTGlzdCI6W119
