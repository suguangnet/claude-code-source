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
exports.YogaLayoutNode = void 0;
exports.createYogaLayoutNode = createYogaLayoutNode;
const index_js_1 = __importStar(require("src/native-ts/yoga-layout/index.js"));
const node_js_1 = require("./node.js");
// --
// Edge/Gutter mapping
const EDGE_MAP = {
    all: index_js_1.Edge.All,
    horizontal: index_js_1.Edge.Horizontal,
    vertical: index_js_1.Edge.Vertical,
    left: index_js_1.Edge.Left,
    right: index_js_1.Edge.Right,
    top: index_js_1.Edge.Top,
    bottom: index_js_1.Edge.Bottom,
    start: index_js_1.Edge.Start,
    end: index_js_1.Edge.End,
};
const GUTTER_MAP = {
    all: index_js_1.Gutter.All,
    column: index_js_1.Gutter.Column,
    row: index_js_1.Gutter.Row,
};
// --
// Yoga adapter
class YogaLayoutNode {
    constructor(yoga) {
        this.yoga = yoga;
    }
    // Tree
    insertChild(child, index) {
        this.yoga.insertChild(child.yoga, index);
    }
    removeChild(child) {
        this.yoga.removeChild(child.yoga);
    }
    getChildCount() {
        return this.yoga.getChildCount();
    }
    getParent() {
        const p = this.yoga.getParent();
        return p ? new YogaLayoutNode(p) : null;
    }
    // Layout
    calculateLayout(width, _height) {
        this.yoga.calculateLayout(width, undefined, index_js_1.Direction.LTR);
    }
    setMeasureFunc(fn) {
        this.yoga.setMeasureFunc((w, wMode) => {
            const mode = wMode === index_js_1.MeasureMode.Exactly
                ? node_js_1.LayoutMeasureMode.Exactly
                : wMode === index_js_1.MeasureMode.AtMost
                    ? node_js_1.LayoutMeasureMode.AtMost
                    : node_js_1.LayoutMeasureMode.Undefined;
            return fn(w, mode);
        });
    }
    unsetMeasureFunc() {
        this.yoga.unsetMeasureFunc();
    }
    markDirty() {
        this.yoga.markDirty();
    }
    // Computed layout
    getComputedLeft() {
        return this.yoga.getComputedLeft();
    }
    getComputedTop() {
        return this.yoga.getComputedTop();
    }
    getComputedWidth() {
        return this.yoga.getComputedWidth();
    }
    getComputedHeight() {
        return this.yoga.getComputedHeight();
    }
    getComputedBorder(edge) {
        return this.yoga.getComputedBorder(EDGE_MAP[edge]);
    }
    getComputedPadding(edge) {
        return this.yoga.getComputedPadding(EDGE_MAP[edge]);
    }
    // Style setters
    setWidth(value) {
        this.yoga.setWidth(value);
    }
    setWidthPercent(value) {
        this.yoga.setWidthPercent(value);
    }
    setWidthAuto() {
        this.yoga.setWidthAuto();
    }
    setHeight(value) {
        this.yoga.setHeight(value);
    }
    setHeightPercent(value) {
        this.yoga.setHeightPercent(value);
    }
    setHeightAuto() {
        this.yoga.setHeightAuto();
    }
    setMinWidth(value) {
        this.yoga.setMinWidth(value);
    }
    setMinWidthPercent(value) {
        this.yoga.setMinWidthPercent(value);
    }
    setMinHeight(value) {
        this.yoga.setMinHeight(value);
    }
    setMinHeightPercent(value) {
        this.yoga.setMinHeightPercent(value);
    }
    setMaxWidth(value) {
        this.yoga.setMaxWidth(value);
    }
    setMaxWidthPercent(value) {
        this.yoga.setMaxWidthPercent(value);
    }
    setMaxHeight(value) {
        this.yoga.setMaxHeight(value);
    }
    setMaxHeightPercent(value) {
        this.yoga.setMaxHeightPercent(value);
    }
    setFlexDirection(dir) {
        const map = {
            row: index_js_1.FlexDirection.Row,
            'row-reverse': index_js_1.FlexDirection.RowReverse,
            column: index_js_1.FlexDirection.Column,
            'column-reverse': index_js_1.FlexDirection.ColumnReverse,
        };
        this.yoga.setFlexDirection(map[dir]);
    }
    setFlexGrow(value) {
        this.yoga.setFlexGrow(value);
    }
    setFlexShrink(value) {
        this.yoga.setFlexShrink(value);
    }
    setFlexBasis(value) {
        this.yoga.setFlexBasis(value);
    }
    setFlexBasisPercent(value) {
        this.yoga.setFlexBasisPercent(value);
    }
    setFlexWrap(wrap) {
        const map = {
            nowrap: index_js_1.Wrap.NoWrap,
            wrap: index_js_1.Wrap.Wrap,
            'wrap-reverse': index_js_1.Wrap.WrapReverse,
        };
        this.yoga.setFlexWrap(map[wrap]);
    }
    setAlignItems(align) {
        const map = {
            auto: index_js_1.Align.Auto,
            stretch: index_js_1.Align.Stretch,
            'flex-start': index_js_1.Align.FlexStart,
            center: index_js_1.Align.Center,
            'flex-end': index_js_1.Align.FlexEnd,
        };
        this.yoga.setAlignItems(map[align]);
    }
    setAlignSelf(align) {
        const map = {
            auto: index_js_1.Align.Auto,
            stretch: index_js_1.Align.Stretch,
            'flex-start': index_js_1.Align.FlexStart,
            center: index_js_1.Align.Center,
            'flex-end': index_js_1.Align.FlexEnd,
        };
        this.yoga.setAlignSelf(map[align]);
    }
    setJustifyContent(justify) {
        const map = {
            'flex-start': index_js_1.Justify.FlexStart,
            center: index_js_1.Justify.Center,
            'flex-end': index_js_1.Justify.FlexEnd,
            'space-between': index_js_1.Justify.SpaceBetween,
            'space-around': index_js_1.Justify.SpaceAround,
            'space-evenly': index_js_1.Justify.SpaceEvenly,
        };
        this.yoga.setJustifyContent(map[justify]);
    }
    setDisplay(display) {
        this.yoga.setDisplay(display === 'flex' ? index_js_1.Display.Flex : index_js_1.Display.None);
    }
    getDisplay() {
        return this.yoga.getDisplay() === index_js_1.Display.None
            ? node_js_1.LayoutDisplay.None
            : node_js_1.LayoutDisplay.Flex;
    }
    setPositionType(type) {
        this.yoga.setPositionType(type === 'absolute' ? index_js_1.PositionType.Absolute : index_js_1.PositionType.Relative);
    }
    setPosition(edge, value) {
        this.yoga.setPosition(EDGE_MAP[edge], value);
    }
    setPositionPercent(edge, value) {
        this.yoga.setPositionPercent(EDGE_MAP[edge], value);
    }
    setOverflow(overflow) {
        const map = {
            visible: index_js_1.Overflow.Visible,
            hidden: index_js_1.Overflow.Hidden,
            scroll: index_js_1.Overflow.Scroll,
        };
        this.yoga.setOverflow(map[overflow]);
    }
    setMargin(edge, value) {
        this.yoga.setMargin(EDGE_MAP[edge], value);
    }
    setPadding(edge, value) {
        this.yoga.setPadding(EDGE_MAP[edge], value);
    }
    setBorder(edge, value) {
        this.yoga.setBorder(EDGE_MAP[edge], value);
    }
    setGap(gutter, value) {
        this.yoga.setGap(GUTTER_MAP[gutter], value);
    }
    // Lifecycle
    free() {
        this.yoga.free();
    }
    freeRecursive() {
        this.yoga.freeRecursive();
    }
}
exports.YogaLayoutNode = YogaLayoutNode;
// --
// Instance management
//
// The TS yoga-layout port is synchronous — no WASM loading, no linear memory
// growth, so no preload/swap/reset machinery is needed. The Yoga instance is
// just a plain JS object available at import time.
function createYogaLayoutNode() {
    return new YogaLayoutNode(index_js_1.default.Node.create());
}
