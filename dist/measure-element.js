"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Measure the dimensions of a particular `<Box>` element.
 */
const measureElement = (node) => ({
    width: node.yogaNode?.getComputedWidth() ?? 0,
    height: node.yogaNode?.getComputedHeight() ?? 0,
});
exports.default = measureElement;
