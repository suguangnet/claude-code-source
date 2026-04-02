"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderPlaceholder = renderPlaceholder;
const chalk_1 = __importDefault(require("chalk"));
function renderPlaceholder({ placeholder, value, showCursor, focus, terminalFocus = true, invert = chalk_1.default.inverse, hidePlaceholderText = false, }) {
    let renderedPlaceholder = undefined;
    if (placeholder) {
        if (hidePlaceholderText) {
            // Voice recording: show only the cursor, no placeholder text
            renderedPlaceholder =
                showCursor && focus && terminalFocus ? invert(' ') : '';
        }
        else {
            renderedPlaceholder = chalk_1.default.dim(placeholder);
            // Show inverse cursor only when both input and terminal are focused
            if (showCursor && focus && terminalFocus) {
                renderedPlaceholder =
                    placeholder.length > 0
                        ? invert(placeholder[0]) + chalk_1.default.dim(placeholder.slice(1))
                        : invert(' ');
            }
        }
    }
    const showPlaceholder = value.length === 0 && Boolean(placeholder);
    return {
        renderedPlaceholder,
        showPlaceholder,
    };
}
