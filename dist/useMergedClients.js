"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeClients = mergeClients;
exports.useMergedClients = useMergedClients;
const uniqBy_js_1 = __importDefault(require("lodash-es/uniqBy.js"));
const react_1 = require("react");
function mergeClients(initialClients, mcpClients) {
    if (initialClients && mcpClients && mcpClients.length > 0) {
        return (0, uniqBy_js_1.default)([...initialClients, ...mcpClients], 'name');
    }
    return initialClients || [];
}
function useMergedClients(initialClients, mcpClients) {
    return (0, react_1.useMemo)(() => mergeClients(initialClients, mcpClients), [initialClients, mcpClients]);
}
