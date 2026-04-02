"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERMISSION_HANDLERS = void 0;
const index_js_1 = require("../../../services/analytics/index.js");
const metadata_js_1 = require("../../../services/analytics/metadata.js");
const constants_js_1 = require("../../../tools/FileEditTool/constants.js");
const env_js_1 = require("../../../utils/env.js");
const filesystem_js_1 = require("../../../utils/permissions/filesystem.js");
const unaryLogging_js_1 = require("../../../utils/unaryLogging.js");
function logPermissionEvent(event, completionType, languageName, messageId, hasFeedback) {
    void (0, unaryLogging_js_1.logUnaryEvent)({
        completion_type: completionType,
        event,
        metadata: {
            language_name: languageName,
            message_id: messageId,
            platform: env_js_1.env.platform,
            hasFeedback: hasFeedback ?? false,
        },
    });
}
function handleAcceptOnce(params, options) {
    const { messageId, toolUseConfirm, onDone, completionType, languageName } = params;
    logPermissionEvent('accept', completionType, languageName, messageId);
    // Log accept submission with feedback context
    (0, index_js_1.logEvent)('tengu_accept_submitted', {
        toolName: (0, metadata_js_1.sanitizeToolNameForAnalytics)(toolUseConfirm.tool.name),
        isMcp: toolUseConfirm.tool.isMcp ?? false,
        has_instructions: !!options?.feedback,
        instructions_length: options?.feedback?.length ?? 0,
        entered_feedback_mode: options?.enteredFeedbackMode ?? false,
    });
    onDone();
    toolUseConfirm.onAllow(toolUseConfirm.input, [], options?.feedback);
}
function handleAcceptSession(params, options) {
    const { messageId, path, toolUseConfirm, toolPermissionContext, onDone, completionType, languageName, operationType, } = params;
    logPermissionEvent('accept', completionType, languageName, messageId);
    // For claude-folder scope, grant session-level access to all .claude/ files
    if (options?.scope === 'claude-folder' ||
        options?.scope === 'global-claude-folder') {
        const pattern = options.scope === 'global-claude-folder'
            ? constants_js_1.GLOBAL_CLAUDE_FOLDER_PERMISSION_PATTERN
            : constants_js_1.CLAUDE_FOLDER_PERMISSION_PATTERN;
        const suggestions = [
            {
                type: 'addRules',
                rules: [
                    {
                        toolName: constants_js_1.FILE_EDIT_TOOL_NAME,
                        ruleContent: pattern,
                    },
                ],
                behavior: 'allow',
                destination: 'session',
            },
        ];
        onDone();
        toolUseConfirm.onAllow(toolUseConfirm.input, suggestions);
        return;
    }
    // Generate permission updates if path is provided
    const suggestions = path
        ? (0, filesystem_js_1.generateSuggestions)(path, operationType, toolPermissionContext)
        : [];
    onDone();
    // Pass permission updates directly to onAllow
    toolUseConfirm.onAllow(toolUseConfirm.input, suggestions);
}
function handleReject(params, options) {
    const { messageId, toolUseConfirm, onDone, onReject, completionType, languageName, } = params;
    logPermissionEvent('reject', completionType, languageName, messageId, options?.hasFeedback);
    // Log reject submission with feedback context
    (0, index_js_1.logEvent)('tengu_reject_submitted', {
        toolName: (0, metadata_js_1.sanitizeToolNameForAnalytics)(toolUseConfirm.tool.name),
        isMcp: toolUseConfirm.tool.isMcp ?? false,
        has_instructions: !!options?.feedback,
        instructions_length: options?.feedback?.length ?? 0,
        entered_feedback_mode: options?.enteredFeedbackMode ?? false,
    });
    onDone();
    onReject();
    toolUseConfirm.onReject(options?.feedback);
}
exports.PERMISSION_HANDLERS = {
    'accept-once': handleAcceptOnce,
    'accept-session': handleAcceptSession,
    reject: handleReject,
};
