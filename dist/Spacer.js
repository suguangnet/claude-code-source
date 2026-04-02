"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Spacer;
const compiler_runtime_1 = require("react/compiler-runtime");
const react_1 = __importDefault(require("react"));
const Box_js_1 = __importDefault(require("./Box.js"));
/**
 * A flexible space that expands along the major axis of its containing layout.
 * It's useful as a shortcut for filling all the available spaces between elements.
 */
function Spacer() {
    const $ = (0, compiler_runtime_1.c)(1);
    let t0;
    if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
        t0 = react_1.default.createElement(Box_js_1.default, { flexGrow: 1 });
        $[0] = t0;
    }
    else {
        t0 = $[0];
    }
    return t0;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsIkJveCIsIlNwYWNlciIsIiQiLCJfYyIsInQwIiwiU3ltYm9sIiwiZm9yIl0sInNvdXJjZXMiOlsiU3BhY2VyLnRzeCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUmVhY3QgZnJvbSAncmVhY3QnXG5pbXBvcnQgQm94IGZyb20gJy4vQm94LmpzJ1xuXG4vKipcbiAqIEEgZmxleGlibGUgc3BhY2UgdGhhdCBleHBhbmRzIGFsb25nIHRoZSBtYWpvciBheGlzIG9mIGl0cyBjb250YWluaW5nIGxheW91dC5cbiAqIEl0J3MgdXNlZnVsIGFzIGEgc2hvcnRjdXQgZm9yIGZpbGxpbmcgYWxsIHRoZSBhdmFpbGFibGUgc3BhY2VzIGJldHdlZW4gZWxlbWVudHMuXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIFNwYWNlcigpIHtcbiAgcmV0dXJuIDxCb3ggZmxleEdyb3c9ezF9IC8+XG59XG4iXSwibWFwcGluZ3MiOiI7QUFBQSxPQUFPQSxLQUFLLE1BQU0sT0FBTztBQUN6QixPQUFPQyxHQUFHLE1BQU0sVUFBVTs7QUFFMUI7QUFDQTtBQUNBO0FBQ0E7QUFDQSxlQUFlLFNBQUFDLE9BQUE7RUFBQSxNQUFBQyxDQUFBLEdBQUFDLEVBQUE7RUFBQSxJQUFBQyxFQUFBO0VBQUEsSUFBQUYsQ0FBQSxRQUFBRyxNQUFBLENBQUFDLEdBQUE7SUFDTkYsRUFBQSxJQUFDLEdBQUcsQ0FBVyxRQUFDLENBQUQsR0FBQyxHQUFJO0lBQUFGLENBQUEsTUFBQUUsRUFBQTtFQUFBO0lBQUFBLEVBQUEsR0FBQUYsQ0FBQTtFQUFBO0VBQUEsT0FBcEJFLEVBQW9CO0FBQUEiLCJpZ25vcmVMaXN0IjpbXX0=
