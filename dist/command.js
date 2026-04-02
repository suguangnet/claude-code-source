"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCommandName = getCommandName;
exports.isCommandEnabled = isCommandEnabled;
/** Resolves the user-visible name, falling back to `cmd.name` when not overridden. */
function getCommandName(cmd) {
    return cmd.userFacingName?.() ?? cmd.name;
}
/** Resolves whether the command is enabled, defaulting to true. */
function isCommandEnabled(cmd) {
    return cmd.isEnabled?.() ?? true;
}
