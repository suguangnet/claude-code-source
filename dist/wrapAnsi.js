"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.wrapAnsi = void 0;
const wrap_ansi_1 = __importDefault(require("wrap-ansi"));
const wrapAnsiBun = typeof Bun !== 'undefined' && typeof Bun.wrapAnsi === 'function'
    ? Bun.wrapAnsi
    : null;
const wrapAnsi = wrapAnsiBun ?? wrap_ansi_1.default;
exports.wrapAnsi = wrapAnsi;
