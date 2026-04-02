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
exports.UserPlanMessage = UserPlanMessage;
const compiler_runtime_1 = require("react/compiler-runtime");
const React = __importStar(require("react"));
const ink_js_1 = require("../../ink.js");
const Markdown_js_1 = require("../Markdown.js");
function UserPlanMessage(t0) {
    const $ = (0, compiler_runtime_1.c)(6);
    const { addMargin, planContent } = t0;
    const t1 = addMargin ? 1 : 0;
    let t2;
    if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
        t2 = React.createElement(ink_js_1.Box, { marginBottom: 1 },
            React.createElement(ink_js_1.Text, { bold: true, color: "planMode" }, "Plan to implement"));
        $[0] = t2;
    }
    else {
        t2 = $[0];
    }
    let t3;
    if ($[1] !== planContent) {
        t3 = React.createElement(Markdown_js_1.Markdown, null, planContent);
        $[1] = planContent;
        $[2] = t3;
    }
    else {
        t3 = $[2];
    }
    let t4;
    if ($[3] !== t1 || $[4] !== t3) {
        t4 = React.createElement(ink_js_1.Box, { flexDirection: "column", borderStyle: "round", borderColor: "planMode", marginTop: t1, paddingX: 1 },
            t2,
            t3);
        $[3] = t1;
        $[4] = t3;
        $[5] = t4;
    }
    else {
        t4 = $[5];
    }
    return t4;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsIkJveCIsIlRleHQiLCJNYXJrZG93biIsIlByb3BzIiwiYWRkTWFyZ2luIiwicGxhbkNvbnRlbnQiLCJVc2VyUGxhbk1lc3NhZ2UiLCJ0MCIsIiQiLCJfYyIsInQxIiwidDIiLCJTeW1ib2wiLCJmb3IiLCJ0MyIsInQ0Il0sInNvdXJjZXMiOlsiVXNlclBsYW5NZXNzYWdlLnRzeCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBSZWFjdCBmcm9tICdyZWFjdCdcbmltcG9ydCB7IEJveCwgVGV4dCB9IGZyb20gJy4uLy4uL2luay5qcydcbmltcG9ydCB7IE1hcmtkb3duIH0gZnJvbSAnLi4vTWFya2Rvd24uanMnXG5cbnR5cGUgUHJvcHMgPSB7XG4gIGFkZE1hcmdpbjogYm9vbGVhblxuICBwbGFuQ29udGVudDogc3RyaW5nXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBVc2VyUGxhbk1lc3NhZ2Uoe1xuICBhZGRNYXJnaW4sXG4gIHBsYW5Db250ZW50LFxufTogUHJvcHMpOiBSZWFjdC5SZWFjdE5vZGUge1xuICByZXR1cm4gKFxuICAgIDxCb3hcbiAgICAgIGZsZXhEaXJlY3Rpb249XCJjb2x1bW5cIlxuICAgICAgYm9yZGVyU3R5bGU9XCJyb3VuZFwiXG4gICAgICBib3JkZXJDb2xvcj1cInBsYW5Nb2RlXCJcbiAgICAgIG1hcmdpblRvcD17YWRkTWFyZ2luID8gMSA6IDB9XG4gICAgICBwYWRkaW5nWD17MX1cbiAgICA+XG4gICAgICA8Qm94IG1hcmdpbkJvdHRvbT17MX0+XG4gICAgICAgIDxUZXh0IGJvbGQgY29sb3I9XCJwbGFuTW9kZVwiPlxuICAgICAgICAgIFBsYW4gdG8gaW1wbGVtZW50XG4gICAgICAgIDwvVGV4dD5cbiAgICAgIDwvQm94PlxuICAgICAgPE1hcmtkb3duPntwbGFuQ29udGVudH08L01hcmtkb3duPlxuICAgIDwvQm94PlxuICApXG59XG4iXSwibWFwcGluZ3MiOiI7QUFBQSxPQUFPLEtBQUtBLEtBQUssTUFBTSxPQUFPO0FBQzlCLFNBQVNDLEdBQUcsRUFBRUMsSUFBSSxRQUFRLGNBQWM7QUFDeEMsU0FBU0MsUUFBUSxRQUFRLGdCQUFnQjtBQUV6QyxLQUFLQyxLQUFLLEdBQUc7RUFDWEMsU0FBUyxFQUFFLE9BQU87RUFDbEJDLFdBQVcsRUFBRSxNQUFNO0FBQ3JCLENBQUM7QUFFRCxPQUFPLFNBQUFDLGdCQUFBQyxFQUFBO0VBQUEsTUFBQUMsQ0FBQSxHQUFBQyxFQUFBO0VBQXlCO0lBQUFMLFNBQUE7SUFBQUM7RUFBQSxJQUFBRSxFQUd4QjtFQU1TLE1BQUFHLEVBQUEsR0FBQU4sU0FBUyxHQUFULENBQWlCLEdBQWpCLENBQWlCO0VBQUEsSUFBQU8sRUFBQTtFQUFBLElBQUFILENBQUEsUUFBQUksTUFBQSxDQUFBQyxHQUFBO0lBRzVCRixFQUFBLElBQUMsR0FBRyxDQUFlLFlBQUMsQ0FBRCxHQUFDLENBQ2xCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBSixLQUFHLENBQUMsQ0FBTyxLQUFVLENBQVYsVUFBVSxDQUFDLGlCQUU1QixFQUZDLElBQUksQ0FHUCxFQUpDLEdBQUcsQ0FJRTtJQUFBSCxDQUFBLE1BQUFHLEVBQUE7RUFBQTtJQUFBQSxFQUFBLEdBQUFILENBQUE7RUFBQTtFQUFBLElBQUFNLEVBQUE7RUFBQSxJQUFBTixDQUFBLFFBQUFILFdBQUE7SUFDTlMsRUFBQSxJQUFDLFFBQVEsQ0FBRVQsWUFBVSxDQUFFLEVBQXRCLFFBQVEsQ0FBeUI7SUFBQUcsQ0FBQSxNQUFBSCxXQUFBO0lBQUFHLENBQUEsTUFBQU0sRUFBQTtFQUFBO0lBQUFBLEVBQUEsR0FBQU4sQ0FBQTtFQUFBO0VBQUEsSUFBQU8sRUFBQTtFQUFBLElBQUFQLENBQUEsUUFBQUUsRUFBQSxJQUFBRixDQUFBLFFBQUFNLEVBQUE7SUFacENDLEVBQUEsSUFBQyxHQUFHLENBQ1ksYUFBUSxDQUFSLFFBQVEsQ0FDVixXQUFPLENBQVAsT0FBTyxDQUNQLFdBQVUsQ0FBVixVQUFVLENBQ1gsU0FBaUIsQ0FBakIsQ0FBQUwsRUFBZ0IsQ0FBQyxDQUNsQixRQUFDLENBQUQsR0FBQyxDQUVYLENBQUFDLEVBSUssQ0FDTCxDQUFBRyxFQUFpQyxDQUNuQyxFQWJDLEdBQUcsQ0FhRTtJQUFBTixDQUFBLE1BQUFFLEVBQUE7SUFBQUYsQ0FBQSxNQUFBTSxFQUFBO0lBQUFOLENBQUEsTUFBQU8sRUFBQTtFQUFBO0lBQUFBLEVBQUEsR0FBQVAsQ0FBQTtFQUFBO0VBQUEsT0FiTk8sRUFhTTtBQUFBIiwiaWdub3JlTGlzdCI6W119
