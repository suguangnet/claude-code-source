"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("react");
const StdinContext_js_1 = __importDefault(require("../components/StdinContext.js"));
/**
 * `useStdin` is a React hook, which exposes stdin stream.
 */
const useStdin = () => (0, react_1.useContext)(StdinContext_js_1.default);
exports.default = useStdin;
