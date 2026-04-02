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
exports.OrderedList = void 0;
const compiler_runtime_1 = require("react/compiler-runtime");
const react_1 = __importStar(require("react"));
const ink_js_1 = require("../../ink.js");
const OrderedListItem_js_1 = require("./OrderedListItem.js");
const OrderedListContext = (0, react_1.createContext)({
    marker: ''
});
function OrderedListComponent(t0) {
    const $ = (0, compiler_runtime_1.c)(9);
    const { children } = t0;
    const { marker: parentMarker } = (0, react_1.useContext)(OrderedListContext);
    let numberOfItems = 0;
    for (const child of react_1.default.Children.toArray(children)) {
        if (!(0, react_1.isValidElement)(child) || child.type !== OrderedListItem_js_1.OrderedListItem) {
            continue;
        }
        numberOfItems++;
    }
    const maxMarkerWidth = String(numberOfItems).length;
    let t1;
    if ($[0] !== children || $[1] !== maxMarkerWidth || $[2] !== parentMarker) {
        let t2;
        if ($[4] !== maxMarkerWidth || $[5] !== parentMarker) {
            t2 = (child_0, index) => {
                if (!(0, react_1.isValidElement)(child_0) || child_0.type !== OrderedListItem_js_1.OrderedListItem) {
                    return child_0;
                }
                const paddedMarker = `${String(index + 1).padStart(maxMarkerWidth)}.`;
                const marker = `${parentMarker}${paddedMarker}`;
                return react_1.default.createElement(OrderedListContext.Provider, { value: {
                        marker
                    } },
                    react_1.default.createElement(OrderedListItem_js_1.OrderedListItemContext.Provider, { value: {
                            marker
                        } }, child_0));
            };
            $[4] = maxMarkerWidth;
            $[5] = parentMarker;
            $[6] = t2;
        }
        else {
            t2 = $[6];
        }
        t1 = react_1.default.Children.map(children, t2);
        $[0] = children;
        $[1] = maxMarkerWidth;
        $[2] = parentMarker;
        $[3] = t1;
    }
    else {
        t1 = $[3];
    }
    let t2;
    if ($[7] !== t1) {
        t2 = react_1.default.createElement(ink_js_1.Box, { flexDirection: "column" }, t1);
        $[7] = t1;
        $[8] = t2;
    }
    else {
        t2 = $[8];
    }
    return t2;
}
// eslint-disable-next-line custom-rules/no-top-level-side-effects
OrderedListComponent.Item = OrderedListItem_js_1.OrderedListItem;
exports.OrderedList = OrderedListComponent;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsImNyZWF0ZUNvbnRleHQiLCJpc1ZhbGlkRWxlbWVudCIsIlJlYWN0Tm9kZSIsInVzZUNvbnRleHQiLCJCb3giLCJPcmRlcmVkTGlzdEl0ZW0iLCJPcmRlcmVkTGlzdEl0ZW1Db250ZXh0IiwiT3JkZXJlZExpc3RDb250ZXh0IiwibWFya2VyIiwiT3JkZXJlZExpc3RQcm9wcyIsImNoaWxkcmVuIiwiT3JkZXJlZExpc3RDb21wb25lbnQiLCJ0MCIsIiQiLCJfYyIsInBhcmVudE1hcmtlciIsIm51bWJlck9mSXRlbXMiLCJjaGlsZCIsIkNoaWxkcmVuIiwidG9BcnJheSIsInR5cGUiLCJtYXhNYXJrZXJXaWR0aCIsIlN0cmluZyIsImxlbmd0aCIsInQxIiwidDIiLCJjaGlsZF8wIiwiaW5kZXgiLCJwYWRkZWRNYXJrZXIiLCJwYWRTdGFydCIsIm1hcCIsIkl0ZW0iLCJPcmRlcmVkTGlzdCJdLCJzb3VyY2VzIjpbIk9yZGVyZWRMaXN0LnRzeCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUmVhY3QsIHtcbiAgY3JlYXRlQ29udGV4dCxcbiAgaXNWYWxpZEVsZW1lbnQsXG4gIHR5cGUgUmVhY3ROb2RlLFxuICB1c2VDb250ZXh0LFxufSBmcm9tICdyZWFjdCdcbmltcG9ydCB7IEJveCB9IGZyb20gJy4uLy4uL2luay5qcydcbmltcG9ydCB7IE9yZGVyZWRMaXN0SXRlbSwgT3JkZXJlZExpc3RJdGVtQ29udGV4dCB9IGZyb20gJy4vT3JkZXJlZExpc3RJdGVtLmpzJ1xuXG5jb25zdCBPcmRlcmVkTGlzdENvbnRleHQgPSBjcmVhdGVDb250ZXh0KHsgbWFya2VyOiAnJyB9KVxuXG50eXBlIE9yZGVyZWRMaXN0UHJvcHMgPSB7XG4gIGNoaWxkcmVuOiBSZWFjdE5vZGVcbn1cblxuZnVuY3Rpb24gT3JkZXJlZExpc3RDb21wb25lbnQoeyBjaGlsZHJlbiB9OiBPcmRlcmVkTGlzdFByb3BzKTogUmVhY3QuUmVhY3ROb2RlIHtcbiAgY29uc3QgeyBtYXJrZXI6IHBhcmVudE1hcmtlciB9ID0gdXNlQ29udGV4dChPcmRlcmVkTGlzdENvbnRleHQpXG5cbiAgbGV0IG51bWJlck9mSXRlbXMgPSAwXG4gIGZvciAoY29uc3QgY2hpbGQgb2YgUmVhY3QuQ2hpbGRyZW4udG9BcnJheShjaGlsZHJlbikpIHtcbiAgICBpZiAoIWlzVmFsaWRFbGVtZW50KGNoaWxkKSB8fCBjaGlsZC50eXBlICE9PSBPcmRlcmVkTGlzdEl0ZW0pIHtcbiAgICAgIGNvbnRpbnVlXG4gICAgfVxuICAgIG51bWJlck9mSXRlbXMrK1xuICB9XG5cbiAgY29uc3QgbWF4TWFya2VyV2lkdGggPSBTdHJpbmcobnVtYmVyT2ZJdGVtcykubGVuZ3RoXG5cbiAgcmV0dXJuIChcbiAgICA8Qm94IGZsZXhEaXJlY3Rpb249XCJjb2x1bW5cIj5cbiAgICAgIHtSZWFjdC5DaGlsZHJlbi5tYXAoY2hpbGRyZW4sIChjaGlsZCwgaW5kZXgpID0+IHtcbiAgICAgICAgaWYgKCFpc1ZhbGlkRWxlbWVudChjaGlsZCkgfHwgY2hpbGQudHlwZSAhPT0gT3JkZXJlZExpc3RJdGVtKSB7XG4gICAgICAgICAgcmV0dXJuIGNoaWxkXG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwYWRkZWRNYXJrZXIgPSBgJHtTdHJpbmcoaW5kZXggKyAxKS5wYWRTdGFydChtYXhNYXJrZXJXaWR0aCl9LmBcbiAgICAgICAgY29uc3QgbWFya2VyID0gYCR7cGFyZW50TWFya2VyfSR7cGFkZGVkTWFya2VyfWBcblxuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgIDxPcmRlcmVkTGlzdENvbnRleHQuUHJvdmlkZXIgdmFsdWU9e3sgbWFya2VyIH19PlxuICAgICAgICAgICAgPE9yZGVyZWRMaXN0SXRlbUNvbnRleHQuUHJvdmlkZXIgdmFsdWU9e3sgbWFya2VyIH19PlxuICAgICAgICAgICAgICB7Y2hpbGR9XG4gICAgICAgICAgICA8L09yZGVyZWRMaXN0SXRlbUNvbnRleHQuUHJvdmlkZXI+XG4gICAgICAgICAgPC9PcmRlcmVkTGlzdENvbnRleHQuUHJvdmlkZXI+XG4gICAgICAgIClcbiAgICAgIH0pfVxuICAgIDwvQm94PlxuICApXG59XG5cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBjdXN0b20tcnVsZXMvbm8tdG9wLWxldmVsLXNpZGUtZWZmZWN0c1xuT3JkZXJlZExpc3RDb21wb25lbnQuSXRlbSA9IE9yZGVyZWRMaXN0SXRlbVxuXG5leHBvcnQgY29uc3QgT3JkZXJlZExpc3QgPSBPcmRlcmVkTGlzdENvbXBvbmVudFxuIl0sIm1hcHBpbmdzIjoiO0FBQUEsT0FBT0EsS0FBSyxJQUNWQyxhQUFhLEVBQ2JDLGNBQWMsRUFDZCxLQUFLQyxTQUFTLEVBQ2RDLFVBQVUsUUFDTCxPQUFPO0FBQ2QsU0FBU0MsR0FBRyxRQUFRLGNBQWM7QUFDbEMsU0FBU0MsZUFBZSxFQUFFQyxzQkFBc0IsUUFBUSxzQkFBc0I7QUFFOUUsTUFBTUMsa0JBQWtCLEdBQUdQLGFBQWEsQ0FBQztFQUFFUSxNQUFNLEVBQUU7QUFBRyxDQUFDLENBQUM7QUFFeEQsS0FBS0MsZ0JBQWdCLEdBQUc7RUFDdEJDLFFBQVEsRUFBRVIsU0FBUztBQUNyQixDQUFDO0FBRUQsU0FBQVMscUJBQUFDLEVBQUE7RUFBQSxNQUFBQyxDQUFBLEdBQUFDLEVBQUE7RUFBOEI7SUFBQUo7RUFBQSxJQUFBRSxFQUE4QjtFQUMxRDtJQUFBSixNQUFBLEVBQUFPO0VBQUEsSUFBaUNaLFVBQVUsQ0FBQ0ksa0JBQWtCLENBQUM7RUFFL0QsSUFBQVMsYUFBQSxHQUFvQixDQUFDO0VBQ3JCLEtBQUssTUFBQUMsS0FBVyxJQUFJbEIsS0FBSyxDQUFBbUIsUUFBUyxDQUFBQyxPQUFRLENBQUNULFFBQVEsQ0FBQztJQUNsRCxJQUFJLENBQUNULGNBQWMsQ0FBQ2dCLEtBQUssQ0FBbUMsSUFBOUJBLEtBQUssQ0FBQUcsSUFBSyxLQUFLZixlQUFlO01BQzFEO0lBQVE7SUFFVlcsYUFBYSxFQUFFO0VBQUE7RUFHakIsTUFBQUssY0FBQSxHQUF1QkMsTUFBTSxDQUFDTixhQUFhLENBQUMsQ0FBQU8sTUFBTztFQUFBLElBQUFDLEVBQUE7RUFBQSxJQUFBWCxDQUFBLFFBQUFILFFBQUEsSUFBQUcsQ0FBQSxRQUFBUSxjQUFBLElBQUFSLENBQUEsUUFBQUUsWUFBQTtJQUFBLElBQUFVLEVBQUE7SUFBQSxJQUFBWixDQUFBLFFBQUFRLGNBQUEsSUFBQVIsQ0FBQSxRQUFBRSxZQUFBO01BSWpCVSxFQUFBLEdBQUFBLENBQUFDLE9BQUEsRUFBQUMsS0FBQTtRQUM1QixJQUFJLENBQUMxQixjQUFjLENBQUNnQixPQUFLLENBQW1DLElBQTlCQSxPQUFLLENBQUFHLElBQUssS0FBS2YsZUFBZTtVQUFBLE9BQ25EWSxPQUFLO1FBQUE7UUFHZCxNQUFBVyxZQUFBLEdBQXFCLEdBQUdOLE1BQU0sQ0FBQ0ssS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFBRSxRQUFTLENBQUNSLGNBQWMsQ0FBQyxHQUFHO1FBQ3JFLE1BQUFiLE1BQUEsR0FBZSxHQUFHTyxZQUFZLEdBQUdhLFlBQVksRUFBRTtRQUFBLE9BRzdDLDZCQUFvQyxLQUFVLENBQVY7VUFBQXBCO1FBQVMsRUFBQyxDQUM1QyxpQ0FBd0MsS0FBVSxDQUFWO1lBQUFBO1VBQVMsRUFBQyxDQUMvQ1MsUUFBSSxDQUNQLGtDQUNGLDhCQUE4QjtNQUFBLENBRWpDO01BQUFKLENBQUEsTUFBQVEsY0FBQTtNQUFBUixDQUFBLE1BQUFFLFlBQUE7TUFBQUYsQ0FBQSxNQUFBWSxFQUFBO0lBQUE7TUFBQUEsRUFBQSxHQUFBWixDQUFBO0lBQUE7SUFmQVcsRUFBQSxHQUFBekIsS0FBSyxDQUFBbUIsUUFBUyxDQUFBWSxHQUFJLENBQUNwQixRQUFRLEVBQUVlLEVBZTdCLENBQUM7SUFBQVosQ0FBQSxNQUFBSCxRQUFBO0lBQUFHLENBQUEsTUFBQVEsY0FBQTtJQUFBUixDQUFBLE1BQUFFLFlBQUE7SUFBQUYsQ0FBQSxNQUFBVyxFQUFBO0VBQUE7SUFBQUEsRUFBQSxHQUFBWCxDQUFBO0VBQUE7RUFBQSxJQUFBWSxFQUFBO0VBQUEsSUFBQVosQ0FBQSxRQUFBVyxFQUFBO0lBaEJKQyxFQUFBLElBQUMsR0FBRyxDQUFlLGFBQVEsQ0FBUixRQUFRLENBQ3hCLENBQUFELEVBZUEsQ0FDSCxFQWpCQyxHQUFHLENBaUJFO0lBQUFYLENBQUEsTUFBQVcsRUFBQTtJQUFBWCxDQUFBLE1BQUFZLEVBQUE7RUFBQTtJQUFBQSxFQUFBLEdBQUFaLENBQUE7RUFBQTtFQUFBLE9BakJOWSxFQWlCTTtBQUFBOztBQUlWO0FBQ0FkLG9CQUFvQixDQUFDb0IsSUFBSSxHQUFHMUIsZUFBZTtBQUUzQyxPQUFPLE1BQU0yQixXQUFXLEdBQUdyQixvQkFBb0IiLCJpZ25vcmVMaXN0IjpbXX0=
