"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPostSamplingHook = registerPostSamplingHook;
exports.clearPostSamplingHooks = clearPostSamplingHooks;
exports.executePostSamplingHooks = executePostSamplingHooks;
const errors_js_1 = require("../errors.js");
const log_js_1 = require("../log.js");
// Internal registry for post-sampling hooks
const postSamplingHooks = [];
/**
 * Register a post-sampling hook that will be called after model sampling completes
 * This is an internal API not exposed through settings
 */
function registerPostSamplingHook(hook) {
    postSamplingHooks.push(hook);
}
/**
 * Clear all registered post-sampling hooks (for testing)
 */
function clearPostSamplingHooks() {
    postSamplingHooks.length = 0;
}
/**
 * Execute all registered post-sampling hooks
 */
async function executePostSamplingHooks(messages, systemPrompt, userContext, systemContext, toolUseContext, querySource) {
    const context = {
        messages,
        systemPrompt,
        userContext,
        systemContext,
        toolUseContext,
        querySource,
    };
    for (const hook of postSamplingHooks) {
        try {
            await hook(context);
        }
        catch (error) {
            // Log but don't fail on hook errors
            (0, log_js_1.logError)((0, errors_js_1.toError)(error));
        }
    }
}
