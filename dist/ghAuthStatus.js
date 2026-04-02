"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGhAuthStatus = getGhAuthStatus;
const execa_1 = require("execa");
const which_js_1 = require("../which.js");
/**
 * Returns gh CLI install + auth status for telemetry.
 * Uses which() first (Bun.which — no subprocess) to detect install, then
 * exit code of `gh auth token` to detect auth. Uses `auth token` instead of
 * `auth status` because the latter makes a network request to GitHub's API,
 * while `auth token` only reads local config/keyring. Spawns with
 * stdout: 'ignore' so the token never enters this process.
 */
async function getGhAuthStatus() {
    const ghPath = await (0, which_js_1.which)('gh');
    if (!ghPath) {
        return 'not_installed';
    }
    const { exitCode } = await (0, execa_1.execa)('gh', ['auth', 'token'], {
        stdout: 'ignore',
        stderr: 'ignore',
        timeout: 5000,
        reject: false,
    });
    return exitCode === 0 ? 'authenticated' : 'not_authenticated';
}
