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
exports.General = General;
const compiler_runtime_1 = require("react/compiler-runtime");
const React = __importStar(require("react"));
const ink_js_1 = require("../../ink.js");
const PromptInputHelpMenu_js_1 = require("../PromptInput/PromptInputHelpMenu.js");
function General() {
    const $ = (0, compiler_runtime_1.c)(2);
    let t0;
    if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
        t0 = React.createElement(ink_js_1.Box, null,
            React.createElement(ink_js_1.Text, null, "Claude understands your codebase, makes edits with your permission, and executes commands \u2014 right from your terminal."));
        $[0] = t0;
    }
    else {
        t0 = $[0];
    }
    let t1;
    if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
        t1 = React.createElement(ink_js_1.Box, { flexDirection: "column", paddingY: 1, gap: 1 },
            t0,
            React.createElement(ink_js_1.Box, { flexDirection: "column" },
                React.createElement(ink_js_1.Box, null,
                    React.createElement(ink_js_1.Text, { bold: true }, "Shortcuts")),
                React.createElement(PromptInputHelpMenu_js_1.PromptInputHelpMenu, { gap: 2, fixedWidth: true })));
        $[1] = t1;
    }
    else {
        t1 = $[1];
    }
    return t1;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsIkJveCIsIlRleHQiLCJQcm9tcHRJbnB1dEhlbHBNZW51IiwiR2VuZXJhbCIsIiQiLCJfYyIsInQwIiwiU3ltYm9sIiwiZm9yIiwidDEiXSwic291cmNlcyI6WyJHZW5lcmFsLnRzeCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBSZWFjdCBmcm9tICdyZWFjdCdcbmltcG9ydCB7IEJveCwgVGV4dCB9IGZyb20gJy4uLy4uL2luay5qcydcbmltcG9ydCB7IFByb21wdElucHV0SGVscE1lbnUgfSBmcm9tICcuLi9Qcm9tcHRJbnB1dC9Qcm9tcHRJbnB1dEhlbHBNZW51LmpzJ1xuXG5leHBvcnQgZnVuY3Rpb24gR2VuZXJhbCgpOiBSZWFjdC5SZWFjdE5vZGUge1xuICByZXR1cm4gKFxuICAgIDxCb3ggZmxleERpcmVjdGlvbj1cImNvbHVtblwiIHBhZGRpbmdZPXsxfSBnYXA9ezF9PlxuICAgICAgPEJveD5cbiAgICAgICAgPFRleHQ+XG4gICAgICAgICAgQ2xhdWRlIHVuZGVyc3RhbmRzIHlvdXIgY29kZWJhc2UsIG1ha2VzIGVkaXRzIHdpdGggeW91ciBwZXJtaXNzaW9uLFxuICAgICAgICAgIGFuZCBleGVjdXRlcyBjb21tYW5kcyDigJQgcmlnaHQgZnJvbSB5b3VyIHRlcm1pbmFsLlxuICAgICAgICA8L1RleHQ+XG4gICAgICA8L0JveD5cbiAgICAgIDxCb3ggZmxleERpcmVjdGlvbj1cImNvbHVtblwiPlxuICAgICAgICA8Qm94PlxuICAgICAgICAgIDxUZXh0IGJvbGQ+U2hvcnRjdXRzPC9UZXh0PlxuICAgICAgICA8L0JveD5cbiAgICAgICAgPFByb21wdElucHV0SGVscE1lbnUgZ2FwPXsyfSBmaXhlZFdpZHRoPXt0cnVlfSAvPlxuICAgICAgPC9Cb3g+XG4gICAgPC9Cb3g+XG4gIClcbn1cbiJdLCJtYXBwaW5ncyI6IjtBQUFBLE9BQU8sS0FBS0EsS0FBSyxNQUFNLE9BQU87QUFDOUIsU0FBU0MsR0FBRyxFQUFFQyxJQUFJLFFBQVEsY0FBYztBQUN4QyxTQUFTQyxtQkFBbUIsUUFBUSx1Q0FBdUM7QUFFM0UsT0FBTyxTQUFBQyxRQUFBO0VBQUEsTUFBQUMsQ0FBQSxHQUFBQyxFQUFBO0VBQUEsSUFBQUMsRUFBQTtFQUFBLElBQUFGLENBQUEsUUFBQUcsTUFBQSxDQUFBQyxHQUFBO0lBR0RGLEVBQUEsSUFBQyxHQUFHLENBQ0YsQ0FBQyxJQUFJLENBQUMscUhBR04sRUFIQyxJQUFJLENBSVAsRUFMQyxHQUFHLENBS0U7SUFBQUYsQ0FBQSxNQUFBRSxFQUFBO0VBQUE7SUFBQUEsRUFBQSxHQUFBRixDQUFBO0VBQUE7RUFBQSxJQUFBSyxFQUFBO0VBQUEsSUFBQUwsQ0FBQSxRQUFBRyxNQUFBLENBQUFDLEdBQUE7SUFOUkMsRUFBQSxJQUFDLEdBQUcsQ0FBZSxhQUFRLENBQVIsUUFBUSxDQUFXLFFBQUMsQ0FBRCxHQUFDLENBQU8sR0FBQyxDQUFELEdBQUMsQ0FDN0MsQ0FBQUgsRUFLSyxDQUNMLENBQUMsR0FBRyxDQUFlLGFBQVEsQ0FBUixRQUFRLENBQ3pCLENBQUMsR0FBRyxDQUNGLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBSixLQUFHLENBQUMsQ0FBQyxTQUFTLEVBQW5CLElBQUksQ0FDUCxFQUZDLEdBQUcsQ0FHSixDQUFDLG1CQUFtQixDQUFNLEdBQUMsQ0FBRCxHQUFDLENBQWMsVUFBSSxDQUFKLEtBQUcsQ0FBQyxHQUMvQyxFQUxDLEdBQUcsQ0FNTixFQWJDLEdBQUcsQ0FhRTtJQUFBRixDQUFBLE1BQUFLLEVBQUE7RUFBQTtJQUFBQSxFQUFBLEdBQUFMLENBQUE7RUFBQTtFQUFBLE9BYk5LLEVBYU07QUFBQSIsImlnbm9yZUxpc3QiOltdfQ==
