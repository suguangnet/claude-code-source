"use strict";
// Git-related behaviors that depend on user settings.
//
// This lives outside git.ts because git.ts is in the vscode extension's
// dep graph and must stay free of settings.ts, which transitively pulls
// @opentelemetry/api + undici (forbidden in vscode). It's also a cycle:
// settings.ts → git/gitignore.ts → git.ts, so git.ts → settings.ts loops.
//
// If you're tempted to add `import settings` to git.ts — don't. Put it here.
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldIncludeGitInstructions = shouldIncludeGitInstructions;
const envUtils_js_1 = require("./envUtils.js");
const settings_js_1 = require("./settings/settings.js");
function shouldIncludeGitInstructions() {
    const envVal = process.env.CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS;
    if ((0, envUtils_js_1.isEnvTruthy)(envVal))
        return false;
    if ((0, envUtils_js_1.isEnvDefinedFalsy)(envVal))
        return true;
    return (0, settings_js_1.getInitialSettings)().includeGitInstructions ?? true;
}
