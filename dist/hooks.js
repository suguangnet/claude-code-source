"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePermissionRequestLogging = usePermissionRequestLogging;
const bun_bundle_1 = require("bun:bundle");
const react_1 = require("react");
const index_js_1 = require("src/services/analytics/index.js");
const metadata_js_1 = require("src/services/analytics/metadata.js");
const BashTool_js_1 = require("src/tools/BashTool/BashTool.js");
const commands_js_1 = require("src/utils/bash/commands.js");
const PermissionUpdate_js_1 = require("src/utils/permissions/PermissionUpdate.js");
const permissionRuleParser_js_1 = require("src/utils/permissions/permissionRuleParser.js");
const sandbox_adapter_js_1 = require("src/utils/sandbox/sandbox-adapter.js");
const AppState_js_1 = require("../../state/AppState.js");
const env_js_1 = require("../../utils/env.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const unaryLogging_js_1 = require("../../utils/unaryLogging.js");
function permissionResultToLog(permissionResult) {
    switch (permissionResult.behavior) {
        case 'allow':
            return 'allow';
        case 'ask': {
            const rules = (0, PermissionUpdate_js_1.extractRules)(permissionResult.suggestions);
            const suggestions = rules.length > 0
                ? rules.map(r => (0, permissionRuleParser_js_1.permissionRuleValueToString)(r)).join(', ')
                : 'none';
            return `ask: ${permissionResult.message}, 
suggestions: ${suggestions}
reason: ${decisionReasonToString(permissionResult.decisionReason)}`;
        }
        case 'deny':
            return `deny: ${permissionResult.message},
reason: ${decisionReasonToString(permissionResult.decisionReason)}`;
        case 'passthrough': {
            const rules = (0, PermissionUpdate_js_1.extractRules)(permissionResult.suggestions);
            const suggestions = rules.length > 0
                ? rules.map(r => (0, permissionRuleParser_js_1.permissionRuleValueToString)(r)).join(', ')
                : 'none';
            return `passthrough: ${permissionResult.message},
suggestions: ${suggestions}
reason: ${decisionReasonToString(permissionResult.decisionReason)}`;
        }
    }
}
function decisionReasonToString(decisionReason) {
    if (!decisionReason) {
        return 'No decision reason';
    }
    if (((0, bun_bundle_1.feature)('BASH_CLASSIFIER') || (0, bun_bundle_1.feature)('TRANSCRIPT_CLASSIFIER')) &&
        decisionReason.type === 'classifier') {
        return `Classifier: ${decisionReason.classifier}, Reason: ${decisionReason.reason}`;
    }
    switch (decisionReason.type) {
        case 'rule':
            return `Rule: ${(0, permissionRuleParser_js_1.permissionRuleValueToString)(decisionReason.rule.ruleValue)}`;
        case 'mode':
            return `Mode: ${decisionReason.mode}`;
        case 'subcommandResults':
            return `Subcommand Results: ${Array.from(decisionReason.reasons.entries())
                .map(([key, value]) => `${key}: ${permissionResultToLog(value)}`)
                .join(', \n')}`;
        case 'permissionPromptTool':
            return `Permission Tool: ${decisionReason.permissionPromptToolName}, Result: ${(0, slowOperations_js_1.jsonStringify)(decisionReason.toolResult)}`;
        case 'hook':
            return `Hook: ${decisionReason.hookName}${decisionReason.reason ? `, Reason: ${decisionReason.reason}` : ''}`;
        case 'workingDir':
            return `Working Directory: ${decisionReason.reason}`;
        case 'safetyCheck':
            return `Safety check: ${decisionReason.reason}`;
        case 'other':
            return `Other: ${decisionReason.reason}`;
        default:
            return (0, slowOperations_js_1.jsonStringify)(decisionReason, null, 2);
    }
}
/**
 * Logs permission request events using analytics and unary logging.
 * Handles both the analytics event and the unary event logging.
 */
function usePermissionRequestLogging(toolUseConfirm, unaryEvent) {
    const setAppState = (0, AppState_js_1.useSetAppState)();
    // Guard against effect re-firing if toolUseConfirm's object reference
    // changes during a single dialog's lifetime (e.g., parent re-renders with a
    // fresh object). Without this, the unconditional setAppState below can
    // cascade into an infinite microtask loop — each re-fire does another
    // setAppState spread + (ant builds) splitCommand → shell-quote regex,
    // pegging CPU at 100% and leaking ~500MB/min in JSRopeString/RegExp allocs.
    // The component is keyed by toolUseID, so this ref resets on remount —
    // we only need to dedupe re-fires WITHIN one dialog instance.
    const loggedToolUseID = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => {
        if (loggedToolUseID.current === toolUseConfirm.toolUseID) {
            return;
        }
        loggedToolUseID.current = toolUseConfirm.toolUseID;
        // Increment permission prompt count for attribution tracking
        setAppState(prev => ({
            ...prev,
            attribution: {
                ...prev.attribution,
                permissionPromptCount: prev.attribution.permissionPromptCount + 1,
            },
        }));
        // Log analytics event
        (0, index_js_1.logEvent)('tengu_tool_use_show_permission_request', {
            messageID: toolUseConfirm.assistantMessage.message
                .id,
            toolName: (0, metadata_js_1.sanitizeToolNameForAnalytics)(toolUseConfirm.tool.name),
            isMcp: toolUseConfirm.tool.isMcp ?? false,
            decisionReasonType: toolUseConfirm.permissionResult.decisionReason
                ?.type,
            sandboxEnabled: sandbox_adapter_js_1.SandboxManager.isSandboxingEnabled(),
        });
        if (process.env.USER_TYPE === 'ant') {
            const permissionResult = toolUseConfirm.permissionResult;
            if (toolUseConfirm.tool.name === BashTool_js_1.BashTool.name &&
                permissionResult.behavior === 'ask' &&
                !(0, PermissionUpdate_js_1.hasRules)(permissionResult.suggestions)) {
                // Log if no rule suggestions ("always allow") are provided
                (0, index_js_1.logEvent)('tengu_internal_tool_use_permission_request_no_always_allow', {
                    messageID: toolUseConfirm.assistantMessage.message
                        .id,
                    toolName: (0, metadata_js_1.sanitizeToolNameForAnalytics)(toolUseConfirm.tool.name),
                    isMcp: toolUseConfirm.tool.isMcp ?? false,
                    decisionReasonType: (permissionResult.decisionReason?.type ??
                        'unknown'),
                    sandboxEnabled: sandbox_adapter_js_1.SandboxManager.isSandboxingEnabled(),
                    // This DOES contain code/filepaths and should not be logged in the public build!
                    decisionReasonDetails: decisionReasonToString(permissionResult.decisionReason),
                });
            }
        }
        // [ANT-ONLY] Log bash tool calls, so we can categorize
        // & burn down calls that should have been allowed
        if (process.env.USER_TYPE === 'ant') {
            const parsedInput = BashTool_js_1.BashTool.inputSchema.safeParse(toolUseConfirm.input);
            if (toolUseConfirm.tool.name === BashTool_js_1.BashTool.name &&
                toolUseConfirm.permissionResult.behavior === 'ask' &&
                parsedInput.success) {
                // Note: All metadata fields in this event contain code/filepaths
                let split = [parsedInput.data.command];
                try {
                    split = (0, commands_js_1.splitCommand_DEPRECATED)(parsedInput.data.command);
                }
                catch {
                    // Ignore parse errors here - just log the full command
                }
                (0, index_js_1.logEvent)('tengu_internal_bash_tool_use_permission_request', {
                    parts: (0, slowOperations_js_1.jsonStringify)(split),
                    input: (0, slowOperations_js_1.jsonStringify)(toolUseConfirm.input),
                    decisionReasonType: toolUseConfirm.permissionResult.decisionReason
                        ?.type,
                    decisionReason: decisionReasonToString(toolUseConfirm.permissionResult.decisionReason),
                });
            }
        }
        void (0, unaryLogging_js_1.logUnaryEvent)({
            completion_type: unaryEvent.completion_type,
            event: 'response',
            metadata: {
                language_name: unaryEvent.language_name,
                message_id: toolUseConfirm.assistantMessage.message.id,
                platform: env_js_1.env.platform,
            },
        });
    }, [toolUseConfirm, unaryEvent, setAppState]);
}
