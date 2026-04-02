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
exports.InterruptedByUser = InterruptedByUser;
const compiler_runtime_1 = require("react/compiler-runtime");
const React = __importStar(require("react"));
const ink_js_1 = require("../ink.js");
function InterruptedByUser() {
    const $ = (0, compiler_runtime_1.c)(1);
    let t0;
    if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
        t0 = React.createElement(React.Fragment, null,
            React.createElement(ink_js_1.Text, { dimColor: true }, "Interrupted "),
            false ? React.createElement(ink_js_1.Text, { dimColor: true }, "\u00B7 [ANT-ONLY] /issue to report a model issue") : React.createElement(ink_js_1.Text, { dimColor: true }, "\u00B7 What should Claude do instead?"));
        $[0] = t0;
    }
    else {
        t0 = $[0];
    }
    return t0;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsIlRleHQiLCJJbnRlcnJ1cHRlZEJ5VXNlciIsIiQiLCJfYyIsInQwIiwiU3ltYm9sIiwiZm9yIl0sInNvdXJjZXMiOlsiSW50ZXJydXB0ZWRCeVVzZXIudHN4Il0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIFJlYWN0IGZyb20gJ3JlYWN0J1xuaW1wb3J0IHsgVGV4dCB9IGZyb20gJy4uL2luay5qcydcblxuZXhwb3J0IGZ1bmN0aW9uIEludGVycnVwdGVkQnlVc2VyKCk6IFJlYWN0LlJlYWN0Tm9kZSB7XG4gIHJldHVybiAoXG4gICAgPD5cbiAgICAgIDxUZXh0IGRpbUNvbG9yPkludGVycnVwdGVkIDwvVGV4dD5cbiAgICAgIHtcImV4dGVybmFsXCIgPT09ICdhbnQnID8gKFxuICAgICAgICA8VGV4dCBkaW1Db2xvcj7CtyBbQU5ULU9OTFldIC9pc3N1ZSB0byByZXBvcnQgYSBtb2RlbCBpc3N1ZTwvVGV4dD5cbiAgICAgICkgOiAoXG4gICAgICAgIDxUZXh0IGRpbUNvbG9yPsK3IFdoYXQgc2hvdWxkIENsYXVkZSBkbyBpbnN0ZWFkPzwvVGV4dD5cbiAgICAgICl9XG4gICAgPC8+XG4gIClcbn1cbiJdLCJtYXBwaW5ncyI6IjtBQUFBLE9BQU8sS0FBS0EsS0FBSyxNQUFNLE9BQU87QUFDOUIsU0FBU0MsSUFBSSxRQUFRLFdBQVc7QUFFaEMsT0FBTyxTQUFBQyxrQkFBQTtFQUFBLE1BQUFDLENBQUEsR0FBQUMsRUFBQTtFQUFBLElBQUFDLEVBQUE7RUFBQSxJQUFBRixDQUFBLFFBQUFHLE1BQUEsQ0FBQUMsR0FBQTtJQUVIRixFQUFBLEtBQ0UsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFSLEtBQU8sQ0FBQyxDQUFDLFlBQVksRUFBMUIsSUFBSSxDQUNKLE1BQW9CLEdBQ25CLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBUixLQUFPLENBQUMsQ0FBQywyQ0FBMkMsRUFBekQsSUFBSSxDQUdOLEdBREMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFSLEtBQU8sQ0FBQyxDQUFDLGdDQUFnQyxFQUE5QyxJQUFJLENBQ1AsQ0FBQyxHQUNBO0lBQUFGLENBQUEsTUFBQUUsRUFBQTtFQUFBO0lBQUFBLEVBQUEsR0FBQUYsQ0FBQTtFQUFBO0VBQUEsT0FQSEUsRUFPRztBQUFBIiwiaWdub3JlTGlzdCI6W119
