"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCoordinatorPermission = handleCoordinatorPermission;
const bun_bundle_1 = require("bun:bundle");
const log_js_1 = require("../../../utils/log.js");
/**
 * Handles the coordinator worker permission flow.
 *
 * For coordinator workers, automated checks (hooks and classifier) are
 * awaited sequentially before falling through to the interactive dialog.
 *
 * Returns a PermissionDecision if the automated checks resolved the
 * permission, or null if the caller should fall through to the
 * interactive dialog.
 */
async function handleCoordinatorPermission(params) {
    const { ctx, updatedInput, suggestions, permissionMode } = params;
    try {
        // 1. Try permission hooks first (fast, local)
        const hookResult = await ctx.runHooks(permissionMode, suggestions, updatedInput);
        if (hookResult)
            return hookResult;
        // 2. Try classifier (slow, inference -- bash only)
        const classifierResult = (0, bun_bundle_1.feature)('BASH_CLASSIFIER')
            ? await ctx.tryClassifier?.(params.pendingClassifierCheck, updatedInput)
            : null;
        if (classifierResult) {
            return classifierResult;
        }
    }
    catch (error) {
        // If automated checks fail unexpectedly, fall through to show the dialog
        // so the user can decide manually. Non-Error throws get a context prefix
        // so the log is traceable — intentionally NOT toError(), which would drop
        // the prefix.
        if (error instanceof Error) {
            (0, log_js_1.logError)(error);
        }
        else {
            (0, log_js_1.logError)(new Error(`Automated permission check failed: ${String(error)}`));
        }
    }
    // 3. Neither resolved (or checks failed) -- fall through to dialog below.
    // Hooks already ran, classifier already consumed.
    return null;
}
