"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CUSTOM_BORDER_STYLES = void 0;
const chalk_1 = __importDefault(require("chalk"));
const cli_boxes_1 = __importDefault(require("cli-boxes"));
const colorize_js_1 = require("./colorize.js");
const stringWidth_js_1 = require("./stringWidth.js");
exports.CUSTOM_BORDER_STYLES = {
    dashed: {
        top: '╌',
        left: '╎',
        right: '╎',
        bottom: '╌',
        // there aren't any line-drawing characters for dashes unfortunately
        topLeft: ' ',
        topRight: ' ',
        bottomLeft: ' ',
        bottomRight: ' ',
    },
};
function embedTextInBorder(borderLine, text, align, offset = 0, borderChar) {
    const textLength = (0, stringWidth_js_1.stringWidth)(text);
    const borderLength = borderLine.length;
    if (textLength >= borderLength - 2) {
        return ['', text.substring(0, borderLength), ''];
    }
    let position;
    if (align === 'center') {
        position = Math.floor((borderLength - textLength) / 2);
    }
    else if (align === 'start') {
        position = offset + 1; // +1 to account for corner character
    }
    else {
        // align === 'end'
        position = borderLength - textLength - offset - 1; // -1 for corner character
    }
    // Ensure position is valid
    position = Math.max(1, Math.min(position, borderLength - textLength - 1));
    const before = borderLine.substring(0, 1) + borderChar.repeat(position - 1);
    const after = borderChar.repeat(borderLength - position - textLength - 1) +
        borderLine.substring(borderLength - 1);
    return [before, text, after];
}
function styleBorderLine(line, color, dim) {
    let styled = (0, colorize_js_1.applyColor)(line, color);
    if (dim) {
        styled = chalk_1.default.dim(styled);
    }
    return styled;
}
const renderBorder = (x, y, node, output) => {
    if (node.style.borderStyle) {
        const width = Math.floor(node.yogaNode.getComputedWidth());
        const height = Math.floor(node.yogaNode.getComputedHeight());
        const box = typeof node.style.borderStyle === 'string'
            ? (exports.CUSTOM_BORDER_STYLES[node.style.borderStyle] ?? cli_boxes_1.default[node.style.borderStyle])
            : node.style.borderStyle;
        const topBorderColor = node.style.borderTopColor ?? node.style.borderColor;
        const bottomBorderColor = node.style.borderBottomColor ?? node.style.borderColor;
        const leftBorderColor = node.style.borderLeftColor ?? node.style.borderColor;
        const rightBorderColor = node.style.borderRightColor ?? node.style.borderColor;
        const dimTopBorderColor = node.style.borderTopDimColor ?? node.style.borderDimColor;
        const dimBottomBorderColor = node.style.borderBottomDimColor ?? node.style.borderDimColor;
        const dimLeftBorderColor = node.style.borderLeftDimColor ?? node.style.borderDimColor;
        const dimRightBorderColor = node.style.borderRightDimColor ?? node.style.borderDimColor;
        const showTopBorder = node.style.borderTop !== false;
        const showBottomBorder = node.style.borderBottom !== false;
        const showLeftBorder = node.style.borderLeft !== false;
        const showRightBorder = node.style.borderRight !== false;
        const contentWidth = Math.max(0, width - (showLeftBorder ? 1 : 0) - (showRightBorder ? 1 : 0));
        const topBorderLine = showTopBorder
            ? (showLeftBorder ? box.topLeft : '') +
                box.top.repeat(contentWidth) +
                (showRightBorder ? box.topRight : '')
            : '';
        // Handle text in top border
        let topBorder;
        if (showTopBorder && node.style.borderText?.position === 'top') {
            const [before, text, after] = embedTextInBorder(topBorderLine, node.style.borderText.content, node.style.borderText.align, node.style.borderText.offset, box.top);
            topBorder =
                styleBorderLine(before, topBorderColor, dimTopBorderColor) +
                    text +
                    styleBorderLine(after, topBorderColor, dimTopBorderColor);
        }
        else if (showTopBorder) {
            topBorder = styleBorderLine(topBorderLine, topBorderColor, dimTopBorderColor);
        }
        let verticalBorderHeight = height;
        if (showTopBorder) {
            verticalBorderHeight -= 1;
        }
        if (showBottomBorder) {
            verticalBorderHeight -= 1;
        }
        verticalBorderHeight = Math.max(0, verticalBorderHeight);
        let leftBorder = ((0, colorize_js_1.applyColor)(box.left, leftBorderColor) + '\n').repeat(verticalBorderHeight);
        if (dimLeftBorderColor) {
            leftBorder = chalk_1.default.dim(leftBorder);
        }
        let rightBorder = ((0, colorize_js_1.applyColor)(box.right, rightBorderColor) + '\n').repeat(verticalBorderHeight);
        if (dimRightBorderColor) {
            rightBorder = chalk_1.default.dim(rightBorder);
        }
        const bottomBorderLine = showBottomBorder
            ? (showLeftBorder ? box.bottomLeft : '') +
                box.bottom.repeat(contentWidth) +
                (showRightBorder ? box.bottomRight : '')
            : '';
        // Handle text in bottom border
        let bottomBorder;
        if (showBottomBorder && node.style.borderText?.position === 'bottom') {
            const [before, text, after] = embedTextInBorder(bottomBorderLine, node.style.borderText.content, node.style.borderText.align, node.style.borderText.offset, box.bottom);
            bottomBorder =
                styleBorderLine(before, bottomBorderColor, dimBottomBorderColor) +
                    text +
                    styleBorderLine(after, bottomBorderColor, dimBottomBorderColor);
        }
        else if (showBottomBorder) {
            bottomBorder = styleBorderLine(bottomBorderLine, bottomBorderColor, dimBottomBorderColor);
        }
        const offsetY = showTopBorder ? 1 : 0;
        if (topBorder) {
            output.write(x, y, topBorder);
        }
        if (showLeftBorder) {
            output.write(x, y + offsetY, leftBorder);
        }
        if (showRightBorder) {
            output.write(x + width - 1, y + offsetY, rightBorder);
        }
        if (bottomBorder) {
            output.write(x, y + height - 1, bottomBorder);
        }
    }
};
exports.default = renderBorder;
