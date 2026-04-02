"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toInternalMessages = toInternalMessages;
exports.toSDKCompactMetadata = toSDKCompactMetadata;
exports.fromSDKCompactMetadata = fromSDKCompactMetadata;
exports.toSDKMessages = toSDKMessages;
exports.localCommandOutputToSDKAssistantMessage = localCommandOutputToSDKAssistantMessage;
exports.toSDKRateLimitInfo = toSDKRateLimitInfo;
const crypto_1 = require("crypto");
const state_js_1 = require("src/bootstrap/state.js");
const xml_js_1 = require("src/constants/xml.js");
const constants_js_1 = require("src/tools/ExitPlanModeTool/constants.js");
const strip_ansi_1 = __importDefault(require("strip-ansi"));
const messages_js_1 = require("../messages.js");
const plans_js_1 = require("../plans.js");
function toInternalMessages(messages) {
    return messages.flatMap(message => {
        switch (message.type) {
            case 'assistant':
                return [
                    {
                        type: 'assistant',
                        message: message.message,
                        uuid: message.uuid,
                        requestId: undefined,
                        timestamp: new Date().toISOString(),
                    },
                ];
            case 'user':
                return [
                    {
                        type: 'user',
                        message: message.message,
                        uuid: message.uuid ?? (0, crypto_1.randomUUID)(),
                        timestamp: message.timestamp ?? new Date().toISOString(),
                        isMeta: message.isSynthetic,
                    },
                ];
            case 'system':
                // Handle compact boundary messages
                if (message.subtype === 'compact_boundary') {
                    const compactMsg = message;
                    return [
                        {
                            type: 'system',
                            content: 'Conversation compacted',
                            level: 'info',
                            subtype: 'compact_boundary',
                            compactMetadata: fromSDKCompactMetadata(compactMsg.compact_metadata),
                            uuid: message.uuid,
                            timestamp: new Date().toISOString(),
                        },
                    ];
                }
                return [];
            default:
                return [];
        }
    });
}
function toSDKCompactMetadata(meta) {
    const seg = meta.preservedSegment;
    return {
        trigger: meta.trigger,
        pre_tokens: meta.preTokens,
        ...(seg && {
            preserved_segment: {
                head_uuid: seg.headUuid,
                anchor_uuid: seg.anchorUuid,
                tail_uuid: seg.tailUuid,
            },
        }),
    };
}
/**
 * Shared SDK→internal compact_metadata converter.
 */
function fromSDKCompactMetadata(meta) {
    const seg = meta.preserved_segment;
    return {
        trigger: meta.trigger,
        preTokens: meta.pre_tokens,
        ...(seg && {
            preservedSegment: {
                headUuid: seg.head_uuid,
                anchorUuid: seg.anchor_uuid,
                tailUuid: seg.tail_uuid,
            },
        }),
    };
}
function toSDKMessages(messages) {
    return messages.flatMap((message) => {
        switch (message.type) {
            case 'assistant':
                return [
                    {
                        type: 'assistant',
                        message: normalizeAssistantMessageForSDK(message),
                        session_id: (0, state_js_1.getSessionId)(),
                        parent_tool_use_id: null,
                        uuid: message.uuid,
                        error: message.error,
                    },
                ];
            case 'user':
                return [
                    {
                        type: 'user',
                        message: message.message,
                        session_id: (0, state_js_1.getSessionId)(),
                        parent_tool_use_id: null,
                        uuid: message.uuid,
                        timestamp: message.timestamp,
                        isSynthetic: message.isMeta || message.isVisibleInTranscriptOnly,
                        // Structured tool output (not the string content sent to the
                        // model — the full Output object). Rides the protobuf catchall
                        // so web viewers can read things like BriefTool's file_uuid
                        // without it polluting model context.
                        ...(message.toolUseResult !== undefined
                            ? { tool_use_result: message.toolUseResult }
                            : {}),
                    },
                ];
            case 'system':
                if (message.subtype === 'compact_boundary' && message.compactMetadata) {
                    return [
                        {
                            type: 'system',
                            subtype: 'compact_boundary',
                            session_id: (0, state_js_1.getSessionId)(),
                            uuid: message.uuid,
                            compact_metadata: toSDKCompactMetadata(message.compactMetadata),
                        },
                    ];
                }
                // Only convert local_command messages that contain actual command
                // output (stdout/stderr). The same subtype is also used for command
                // input metadata (e.g. <command-name>...</command-name>) which must
                // not leak to the RC web UI.
                if (message.subtype === 'local_command' &&
                    (message.content.includes(`<${xml_js_1.LOCAL_COMMAND_STDOUT_TAG}>`) ||
                        message.content.includes(`<${xml_js_1.LOCAL_COMMAND_STDERR_TAG}>`))) {
                    return [
                        localCommandOutputToSDKAssistantMessage(message.content, message.uuid),
                    ];
                }
                return [];
            default:
                return [];
        }
    });
}
/**
 * Converts local command output (e.g. /voice, /cost) to a well-formed
 * SDKAssistantMessage so downstream consumers (mobile apps, session-ingress
 * v1alpha→v1beta converter) can parse it without schema changes.
 *
 * Emitted as assistant instead of the dedicated SDKLocalCommandOutputMessage
 * because the system/local_command_output subtype is unknown to:
 *   - mobile-apps Android SdkMessageTypes.kt (no local_command_output handler)
 *   - api-go session-ingress convertSystemEvent (only init/compact_boundary)
 * See: https://anthropic.sentry.io/issues/7266299248/ (Android)
 *
 * Strips ANSI (e.g. chalk.dim() in /cost) then unwraps the XML wrapper tags.
 */
function localCommandOutputToSDKAssistantMessage(rawContent, uuid) {
    const cleanContent = (0, strip_ansi_1.default)(rawContent)
        .replace(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/, '$1')
        .replace(/<local-command-stderr>([\s\S]*?)<\/local-command-stderr>/, '$1')
        .trim();
    // createAssistantMessage builds a complete APIAssistantMessage with id, type,
    // model: SYNTHETIC_MODEL, role, stop_reason, usage — all fields required by
    // downstream deserializers like Android's SdkAssistantMessage.
    const synthetic = (0, messages_js_1.createAssistantMessage)({ content: cleanContent });
    return {
        type: 'assistant',
        message: synthetic.message,
        parent_tool_use_id: null,
        session_id: (0, state_js_1.getSessionId)(),
        uuid,
    };
}
/**
 * Maps internal ClaudeAILimits to the SDK-facing SDKRateLimitInfo type,
 * stripping internal-only fields like unifiedRateLimitFallbackAvailable.
 */
function toSDKRateLimitInfo(limits) {
    if (!limits) {
        return undefined;
    }
    return {
        status: limits.status,
        ...(limits.resetsAt !== undefined && { resetsAt: limits.resetsAt }),
        ...(limits.rateLimitType !== undefined && {
            rateLimitType: limits.rateLimitType,
        }),
        ...(limits.utilization !== undefined && {
            utilization: limits.utilization,
        }),
        ...(limits.overageStatus !== undefined && {
            overageStatus: limits.overageStatus,
        }),
        ...(limits.overageResetsAt !== undefined && {
            overageResetsAt: limits.overageResetsAt,
        }),
        ...(limits.overageDisabledReason !== undefined && {
            overageDisabledReason: limits.overageDisabledReason,
        }),
        ...(limits.isUsingOverage !== undefined && {
            isUsingOverage: limits.isUsingOverage,
        }),
        ...(limits.surpassedThreshold !== undefined && {
            surpassedThreshold: limits.surpassedThreshold,
        }),
    };
}
/**
 * Normalizes tool inputs in assistant message content for SDK consumption.
 * Specifically injects plan content into ExitPlanModeV2 tool inputs since
 * the V2 tool reads plan from file instead of input, but SDK users expect
 * tool_input.plan to exist.
 */
function normalizeAssistantMessageForSDK(message) {
    const content = message.message.content;
    if (!Array.isArray(content)) {
        return message.message;
    }
    const normalizedContent = content.map((block) => {
        if (block.type !== 'tool_use') {
            return block;
        }
        if (block.name === constants_js_1.EXIT_PLAN_MODE_V2_TOOL_NAME) {
            const plan = (0, plans_js_1.getPlan)();
            if (plan) {
                return {
                    ...block,
                    input: { ...block.input, plan },
                };
            }
        }
        return block;
    });
    return {
        ...message.message,
        content: normalizedContent,
    };
}
