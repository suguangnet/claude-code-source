"use strict";
// Content for the verify bundled skill.
// Each .md file is inlined as a string at build time via Bun's text loader.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SKILL_FILES = exports.SKILL_MD = void 0;
const cli_md_1 = __importDefault(require("./verify/examples/cli.md"));
const server_md_1 = __importDefault(require("./verify/examples/server.md"));
const SKILL_md_1 = __importDefault(require("./verify/SKILL.md"));
exports.SKILL_MD = SKILL_md_1.default;
exports.SKILL_FILES = {
    'examples/cli.md': cli_md_1.default,
    'examples/server.md': server_md_1.default,
};
