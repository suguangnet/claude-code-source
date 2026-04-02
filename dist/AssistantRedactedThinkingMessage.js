"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssistantRedactedThinkingMessage = AssistantRedactedThinkingMessage;
const compiler_runtime_1 = require("react/compiler-runtime");
const react_1 = __importDefault(require("react"));
const ink_js_1 = require("../../ink.js");
function AssistantRedactedThinkingMessage(t0) {
    const $ = (0, compiler_runtime_1.c)(3);
    const { addMargin: t1 } = t0;
    const addMargin = t1 === undefined ? false : t1;
    const t2 = addMargin ? 1 : 0;
    let t3;
    if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
        t3 = react_1.default.createElement(ink_js_1.Text, { dimColor: true, italic: true }, "\u273B Thinking\u2026");
        $[0] = t3;
    }
    else {
        t3 = $[0];
    }
    let t4;
    if ($[1] !== t2) {
        t4 = react_1.default.createElement(ink_js_1.Box, { marginTop: t2 }, t3);
        $[1] = t2;
        $[2] = t4;
    }
    else {
        t4 = $[2];
    }
    return t4;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsIkJveCIsIlRleHQiLCJQcm9wcyIsImFkZE1hcmdpbiIsIkFzc2lzdGFudFJlZGFjdGVkVGhpbmtpbmdNZXNzYWdlIiwidDAiLCIkIiwiX2MiLCJ0MSIsInVuZGVmaW5lZCIsInQyIiwidDMiLCJTeW1ib2wiLCJmb3IiLCJ0NCJdLCJzb3VyY2VzIjpbIkFzc2lzdGFudFJlZGFjdGVkVGhpbmtpbmdNZXNzYWdlLnRzeCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUmVhY3QgZnJvbSAncmVhY3QnXG5pbXBvcnQgeyBCb3gsIFRleHQgfSBmcm9tICcuLi8uLi9pbmsuanMnXG5cbnR5cGUgUHJvcHMgPSB7XG4gIGFkZE1hcmdpbjogYm9vbGVhblxufVxuXG5leHBvcnQgZnVuY3Rpb24gQXNzaXN0YW50UmVkYWN0ZWRUaGlua2luZ01lc3NhZ2Uoe1xuICBhZGRNYXJnaW4gPSBmYWxzZSxcbn06IFByb3BzKTogUmVhY3QuUmVhY3ROb2RlIHtcbiAgcmV0dXJuIChcbiAgICA8Qm94IG1hcmdpblRvcD17YWRkTWFyZ2luID8gMSA6IDB9PlxuICAgICAgPFRleHQgZGltQ29sb3IgaXRhbGljPlxuICAgICAgICDinLsgVGhpbmtpbmfigKZcbiAgICAgIDwvVGV4dD5cbiAgICA8L0JveD5cbiAgKVxufVxuIl0sIm1hcHBpbmdzIjoiO0FBQUEsT0FBT0EsS0FBSyxNQUFNLE9BQU87QUFDekIsU0FBU0MsR0FBRyxFQUFFQyxJQUFJLFFBQVEsY0FBYztBQUV4QyxLQUFLQyxLQUFLLEdBQUc7RUFDWEMsU0FBUyxFQUFFLE9BQU87QUFDcEIsQ0FBQztBQUVELE9BQU8sU0FBQUMsaUNBQUFDLEVBQUE7RUFBQSxNQUFBQyxDQUFBLEdBQUFDLEVBQUE7RUFBMEM7SUFBQUosU0FBQSxFQUFBSztFQUFBLElBQUFILEVBRXpDO0VBRE4sTUFBQUYsU0FBQSxHQUFBSyxFQUFpQixLQUFqQkMsU0FBaUIsR0FBakIsS0FBaUIsR0FBakJELEVBQWlCO0VBR0MsTUFBQUUsRUFBQSxHQUFBUCxTQUFTLEdBQVQsQ0FBaUIsR0FBakIsQ0FBaUI7RUFBQSxJQUFBUSxFQUFBO0VBQUEsSUFBQUwsQ0FBQSxRQUFBTSxNQUFBLENBQUFDLEdBQUE7SUFDL0JGLEVBQUEsSUFBQyxJQUFJLENBQUMsUUFBUSxDQUFSLEtBQU8sQ0FBQyxDQUFDLE1BQU0sQ0FBTixLQUFLLENBQUMsQ0FBQyxXQUV0QixFQUZDLElBQUksQ0FFRTtJQUFBTCxDQUFBLE1BQUFLLEVBQUE7RUFBQTtJQUFBQSxFQUFBLEdBQUFMLENBQUE7RUFBQTtFQUFBLElBQUFRLEVBQUE7RUFBQSxJQUFBUixDQUFBLFFBQUFJLEVBQUE7SUFIVEksRUFBQSxJQUFDLEdBQUcsQ0FBWSxTQUFpQixDQUFqQixDQUFBSixFQUFnQixDQUFDLENBQy9CLENBQUFDLEVBRU0sQ0FDUixFQUpDLEdBQUcsQ0FJRTtJQUFBTCxDQUFBLE1BQUFJLEVBQUE7SUFBQUosQ0FBQSxNQUFBUSxFQUFBO0VBQUE7SUFBQUEsRUFBQSxHQUFBUixDQUFBO0VBQUE7RUFBQSxPQUpOUSxFQUlNO0FBQUEiLCJpZ25vcmVMaXN0IjpbXX0=
