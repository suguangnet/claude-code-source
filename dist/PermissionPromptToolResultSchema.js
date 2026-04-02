"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.outputSchema = exports.inputSchema = void 0;
exports.permissionPromptToolResultToPermissionDecision = permissionPromptToolResultToPermissionDecision;
const v4_1 = __importDefault(require("zod/v4"));
const debug_js_1 = require("../debug.js");
const lazySchema_js_1 = require("../lazySchema.js");
const PermissionUpdate_js_1 = require("./PermissionUpdate.js");
const PermissionUpdateSchema_js_1 = require("./PermissionUpdateSchema.js");
exports.inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.default.object({
    tool_name: v4_1.default
        .string()
        .describe('The name of the tool requesting permission'),
    input: v4_1.default.record(v4_1.default.string(), v4_1.default.unknown()).describe('The input for the tool'),
    tool_use_id: v4_1.default
        .string()
        .optional()
        .describe('The unique tool use request ID'),
}));
// Zod schema for permission results
// This schema is used to validate the MCP permission prompt tool
// so we maintain it as a subset of the real PermissionDecision type
// Matches PermissionDecisionClassificationSchema in entrypoints/sdk/coreSchemas.ts.
// Malformed values fall through to undefined (same pattern as updatedPermissions
// below) so a bad string from the SDK host doesn't reject the whole decision.
const decisionClassificationField = (0, lazySchema_js_1.lazySchema)(() => v4_1.default
    .enum(['user_temporary', 'user_permanent', 'user_reject'])
    .optional()
    .catch(undefined));
const PermissionAllowResultSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.default.object({
    behavior: v4_1.default.literal('allow'),
    updatedInput: v4_1.default.record(v4_1.default.string(), v4_1.default.unknown()),
    // SDK hosts may send malformed entries; fall back to undefined rather
    // than rejecting the entire allow decision (anthropics/claude-code#29440)
    updatedPermissions: v4_1.default
        .array((0, PermissionUpdateSchema_js_1.permissionUpdateSchema)())
        .optional()
        .catch(ctx => {
        (0, debug_js_1.logForDebugging)(`Malformed updatedPermissions from SDK host ignored: ${ctx.error.issues[0]?.message ?? 'unknown'}`, { level: 'warn' });
        return undefined;
    }),
    toolUseID: v4_1.default.string().optional(),
    decisionClassification: decisionClassificationField(),
}));
const PermissionDenyResultSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.default.object({
    behavior: v4_1.default.literal('deny'),
    message: v4_1.default.string(),
    interrupt: v4_1.default.boolean().optional(),
    toolUseID: v4_1.default.string().optional(),
    decisionClassification: decisionClassificationField(),
}));
exports.outputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.default.union([PermissionAllowResultSchema(), PermissionDenyResultSchema()]));
/**
 * Normalizes the result of a permission prompt tool to a PermissionDecision.
 */
function permissionPromptToolResultToPermissionDecision(result, tool, input, toolUseContext) {
    const decisionReason = {
        type: 'permissionPromptTool',
        permissionPromptToolName: tool.name,
        toolResult: result,
    };
    if (result.behavior === 'allow') {
        const updatedPermissions = result.updatedPermissions;
        if (updatedPermissions) {
            toolUseContext.setAppState(prev => ({
                ...prev,
                toolPermissionContext: (0, PermissionUpdate_js_1.applyPermissionUpdates)(prev.toolPermissionContext, updatedPermissions),
            }));
            (0, PermissionUpdate_js_1.persistPermissionUpdates)(updatedPermissions);
        }
        // Mobile clients responding from a push notification don't have the
        // original tool input, so they send `{}` to satisfy the schema. Treat an
        // empty object as "use original" so the tool doesn't run with no args.
        const updatedInput = Object.keys(result.updatedInput).length > 0 ? result.updatedInput : input;
        return {
            ...result,
            updatedInput,
            decisionReason,
        };
    }
    else if (result.behavior === 'deny' && result.interrupt) {
        (0, debug_js_1.logForDebugging)(`SDK permission prompt deny+interrupt: tool=${tool.name} message=${result.message}`);
        toolUseContext.abortController.abort();
    }
    return {
        ...result,
        decisionReason,
    };
}
