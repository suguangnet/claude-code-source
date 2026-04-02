"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CACHE_PATHS = void 0;
const env_paths_1 = __importDefault(require("env-paths"));
const path_1 = require("path");
const fsOperations_js_1 = require("./fsOperations.js");
const hash_js_1 = require("./hash.js");
const paths = (0, env_paths_1.default)('claude-cli');
// Local sanitizePath using djb2Hash — NOT the shared version from
// sessionStoragePortable.ts which uses Bun.hash (wyhash) when available.
// Cache directory names must remain stable across upgrades so existing cache
// data (error logs, MCP logs) is not orphaned.
const MAX_SANITIZED_LENGTH = 200;
function sanitizePath(name) {
    const sanitized = name.replace(/[^a-zA-Z0-9]/g, '-');
    if (sanitized.length <= MAX_SANITIZED_LENGTH) {
        return sanitized;
    }
    return `${sanitized.slice(0, MAX_SANITIZED_LENGTH)}-${Math.abs((0, hash_js_1.djb2Hash)(name)).toString(36)}`;
}
function getProjectDir(cwd) {
    return sanitizePath(cwd);
}
exports.CACHE_PATHS = {
    baseLogs: () => (0, path_1.join)(paths.cache, getProjectDir((0, fsOperations_js_1.getFsImplementation)().cwd())),
    errors: () => (0, path_1.join)(paths.cache, getProjectDir((0, fsOperations_js_1.getFsImplementation)().cwd()), 'errors'),
    messages: () => (0, path_1.join)(paths.cache, getProjectDir((0, fsOperations_js_1.getFsImplementation)().cwd()), 'messages'),
    mcpLogs: (serverName) => (0, path_1.join)(paths.cache, getProjectDir((0, fsOperations_js_1.getFsImplementation)().cwd()), 
    // Sanitize server name for Windows compatibility (colons are reserved for drive letters)
    `mcp-logs-${sanitizePath(serverName)}`),
};
