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
exports.OrderedListItemContext = void 0;
exports.OrderedListItem = OrderedListItem;
const compiler_runtime_1 = require("react/compiler-runtime");
const react_1 = __importStar(require("react"));
const ink_js_1 = require("../../ink.js");
exports.OrderedListItemContext = (0, react_1.createContext)({
    marker: ''
});
function OrderedListItem(t0) {
    const $ = (0, compiler_runtime_1.c)(7);
    const { children } = t0;
    const { marker } = (0, react_1.useContext)(exports.OrderedListItemContext);
    let t1;
    if ($[0] !== marker) {
        t1 = react_1.default.createElement(ink_js_1.Text, { dimColor: true }, marker);
        $[0] = marker;
        $[1] = t1;
    }
    else {
        t1 = $[1];
    }
    let t2;
    if ($[2] !== children) {
        t2 = react_1.default.createElement(ink_js_1.Box, { flexDirection: "column" }, children);
        $[2] = children;
        $[3] = t2;
    }
    else {
        t2 = $[3];
    }
    let t3;
    if ($[4] !== t1 || $[5] !== t2) {
        t3 = react_1.default.createElement(ink_js_1.Box, { gap: 1 },
            t1,
            t2);
        $[4] = t1;
        $[5] = t2;
        $[6] = t3;
    }
    else {
        t3 = $[6];
    }
    return t3;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsImNyZWF0ZUNvbnRleHQiLCJSZWFjdE5vZGUiLCJ1c2VDb250ZXh0IiwiQm94IiwiVGV4dCIsIk9yZGVyZWRMaXN0SXRlbUNvbnRleHQiLCJtYXJrZXIiLCJPcmRlcmVkTGlzdEl0ZW1Qcm9wcyIsImNoaWxkcmVuIiwiT3JkZXJlZExpc3RJdGVtIiwidDAiLCIkIiwiX2MiLCJ0MSIsInQyIiwidDMiXSwic291cmNlcyI6WyJPcmRlcmVkTGlzdEl0ZW0udHN4Il0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBSZWFjdCwgeyBjcmVhdGVDb250ZXh0LCB0eXBlIFJlYWN0Tm9kZSwgdXNlQ29udGV4dCB9IGZyb20gJ3JlYWN0J1xuaW1wb3J0IHsgQm94LCBUZXh0IH0gZnJvbSAnLi4vLi4vaW5rLmpzJ1xuXG5leHBvcnQgY29uc3QgT3JkZXJlZExpc3RJdGVtQ29udGV4dCA9IGNyZWF0ZUNvbnRleHQoeyBtYXJrZXI6ICcnIH0pXG5cbnR5cGUgT3JkZXJlZExpc3RJdGVtUHJvcHMgPSB7XG4gIGNoaWxkcmVuOiBSZWFjdE5vZGVcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIE9yZGVyZWRMaXN0SXRlbSh7XG4gIGNoaWxkcmVuLFxufTogT3JkZXJlZExpc3RJdGVtUHJvcHMpOiBSZWFjdC5SZWFjdE5vZGUge1xuICBjb25zdCB7IG1hcmtlciB9ID0gdXNlQ29udGV4dChPcmRlcmVkTGlzdEl0ZW1Db250ZXh0KVxuXG4gIHJldHVybiAoXG4gICAgPEJveCBnYXA9ezF9PlxuICAgICAgPFRleHQgZGltQ29sb3I+e21hcmtlcn08L1RleHQ+XG4gICAgICA8Qm94IGZsZXhEaXJlY3Rpb249XCJjb2x1bW5cIj57Y2hpbGRyZW59PC9Cb3g+XG4gICAgPC9Cb3g+XG4gIClcbn1cbiJdLCJtYXBwaW5ncyI6IjtBQUFBLE9BQU9BLEtBQUssSUFBSUMsYUFBYSxFQUFFLEtBQUtDLFNBQVMsRUFBRUMsVUFBVSxRQUFRLE9BQU87QUFDeEUsU0FBU0MsR0FBRyxFQUFFQyxJQUFJLFFBQVEsY0FBYztBQUV4QyxPQUFPLE1BQU1DLHNCQUFzQixHQUFHTCxhQUFhLENBQUM7RUFBRU0sTUFBTSxFQUFFO0FBQUcsQ0FBQyxDQUFDO0FBRW5FLEtBQUtDLG9CQUFvQixHQUFHO0VBQzFCQyxRQUFRLEVBQUVQLFNBQVM7QUFDckIsQ0FBQztBQUVELE9BQU8sU0FBQVEsZ0JBQUFDLEVBQUE7RUFBQSxNQUFBQyxDQUFBLEdBQUFDLEVBQUE7RUFBeUI7SUFBQUo7RUFBQSxJQUFBRSxFQUVUO0VBQ3JCO0lBQUFKO0VBQUEsSUFBbUJKLFVBQVUsQ0FBQ0csc0JBQXNCLENBQUM7RUFBQSxJQUFBUSxFQUFBO0VBQUEsSUFBQUYsQ0FBQSxRQUFBTCxNQUFBO0lBSWpETyxFQUFBLElBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBUixLQUFPLENBQUMsQ0FBRVAsT0FBSyxDQUFFLEVBQXRCLElBQUksQ0FBeUI7SUFBQUssQ0FBQSxNQUFBTCxNQUFBO0lBQUFLLENBQUEsTUFBQUUsRUFBQTtFQUFBO0lBQUFBLEVBQUEsR0FBQUYsQ0FBQTtFQUFBO0VBQUEsSUFBQUcsRUFBQTtFQUFBLElBQUFILENBQUEsUUFBQUgsUUFBQTtJQUM5Qk0sRUFBQSxJQUFDLEdBQUcsQ0FBZSxhQUFRLENBQVIsUUFBUSxDQUFFTixTQUFPLENBQUUsRUFBckMsR0FBRyxDQUF3QztJQUFBRyxDQUFBLE1BQUFILFFBQUE7SUFBQUcsQ0FBQSxNQUFBRyxFQUFBO0VBQUE7SUFBQUEsRUFBQSxHQUFBSCxDQUFBO0VBQUE7RUFBQSxJQUFBSSxFQUFBO0VBQUEsSUFBQUosQ0FBQSxRQUFBRSxFQUFBLElBQUFGLENBQUEsUUFBQUcsRUFBQTtJQUY5Q0MsRUFBQSxJQUFDLEdBQUcsQ0FBTSxHQUFDLENBQUQsR0FBQyxDQUNULENBQUFGLEVBQTZCLENBQzdCLENBQUFDLEVBQTJDLENBQzdDLEVBSEMsR0FBRyxDQUdFO0lBQUFILENBQUEsTUFBQUUsRUFBQTtJQUFBRixDQUFBLE1BQUFHLEVBQUE7SUFBQUgsQ0FBQSxNQUFBSSxFQUFBO0VBQUE7SUFBQUEsRUFBQSxHQUFBSixDQUFBO0VBQUE7RUFBQSxPQUhOSSxFQUdNO0FBQUEiLCJpZ25vcmVMaXN0IjpbXX0=
