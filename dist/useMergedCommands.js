"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useMergedCommands = useMergedCommands;
const uniqBy_js_1 = __importDefault(require("lodash-es/uniqBy.js"));
const react_1 = require("react");
function useMergedCommands(initialCommands, mcpCommands) {
    return (0, react_1.useMemo)(() => {
        if (mcpCommands.length > 0) {
            return (0, uniqBy_js_1.default)([...initialCommands, ...mcpCommands], 'name');
        }
        return initialCommands;
    }, [initialCommands, mcpCommands]);
}
