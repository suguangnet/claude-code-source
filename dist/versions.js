"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectIsInGitRepo = projectIsInGitRepo;
const git_js_1 = require("../git.js");
// Note: This is used to check git repo status synchronously
// Uses findGitRoot which walks the filesystem (no subprocess)
// Prefer `dirIsInGitRepo()` for async checks
function projectIsInGitRepo(cwd) {
    return (0, git_js_1.findGitRoot)(cwd) !== null;
}
