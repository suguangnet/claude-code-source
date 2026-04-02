"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BriefTool = void 0;
exports.isBriefEntitled = isBriefEntitled;
exports.isBriefEnabled = isBriefEnabled;
const bun_bundle_1 = require("bun:bundle");
const v4_1 = require("zod/v4");
const state_js_1 = require("../../bootstrap/state.js");
const growthbook_js_1 = require("../../services/analytics/growthbook.js");
const index_js_1 = require("../../services/analytics/index.js");
const Tool_js_1 = require("../../Tool.js");
const envUtils_js_1 = require("../../utils/envUtils.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const stringUtils_js_1 = require("../../utils/stringUtils.js");
const attachments_js_1 = require("./attachments.js");
const prompt_js_1 = require("./prompt.js");
const UI_js_1 = require("./UI.js");
const inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.strictObject({
    message: v4_1.z
        .string()
        .describe('The message for the user. Supports markdown formatting.'),
    attachments: v4_1.z
        .array(v4_1.z.string())
        .optional()
        .describe('Optional file paths (absolute or relative to cwd) to attach. Use for photos, screenshots, diffs, logs, or any file the user should see alongside your message.'),
    status: v4_1.z
        .enum(['normal', 'proactive'])
        .describe("Use 'proactive' when you're surfacing something the user hasn't asked for and needs to see now — task completion while they're away, a blocker you hit, an unsolicited status update. Use 'normal' when replying to something the user just said."),
}));
// attachments MUST remain optional — resumed sessions replay pre-attachment
// outputs verbatim and a required field would crash the UI renderer on resume.
const outputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    message: v4_1.z.string().describe('The message'),
    attachments: v4_1.z
        .array(v4_1.z.object({
        path: v4_1.z.string(),
        size: v4_1.z.number(),
        isImage: v4_1.z.boolean(),
        file_uuid: v4_1.z.string().optional(),
    }))
        .optional()
        .describe('Resolved attachment metadata'),
    sentAt: v4_1.z
        .string()
        .optional()
        .describe('ISO timestamp captured at tool execution on the emitting process. Optional — resumed sessions replay pre-sentAt outputs verbatim.'),
}));
const KAIROS_BRIEF_REFRESH_MS = 5 * 60 * 1000;
/**
 * Entitlement check — is the user ALLOWED to use Brief? Combines build-time
 * flags with runtime GB gate + assistant-mode passthrough. No opt-in check
 * here — this decides whether opt-in should be HONORED, not whether the user
 * has opted in.
 *
 * Build-time OR-gated on KAIROS || KAIROS_BRIEF (same pattern as
 * PROACTIVE || KAIROS): assistant mode depends on Brief, so KAIROS alone
 * must bundle it. KAIROS_BRIEF lets Brief ship independently.
 *
 * Use this to decide whether `--brief` / `defaultView: 'chat'` / `--tools`
 * listing should be honored. Use `isBriefEnabled()` to decide whether the
 * tool is actually active in the current session.
 *
 * CLAUDE_CODE_BRIEF env var force-grants entitlement for dev/testing —
 * bypasses the GB gate so you can test without being enrolled. Still
 * requires an opt-in action to activate (--brief, defaultView, etc.), but
 * the env var alone also sets userMsgOptIn via maybeActivateBrief().
 */
function isBriefEntitled() {
    // Positive ternary — see docs/feature-gating.md. Negative early-return
    // would not eliminate the GB gate string from external builds.
    return (0, bun_bundle_1.feature)('KAIROS') || (0, bun_bundle_1.feature)('KAIROS_BRIEF')
        ? (0, state_js_1.getKairosActive)() ||
            (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_BRIEF) ||
            (0, growthbook_js_1.getFeatureValue_CACHED_WITH_REFRESH)('tengu_kairos_brief', false, KAIROS_BRIEF_REFRESH_MS)
        : false;
}
/**
 * Unified activation gate for the Brief tool. Governs model-facing behavior
 * as a unit: tool availability, system prompt section (getBriefSection),
 * tool-deferral bypass (isDeferredTool), and todo-nag suppression.
 *
 * Activation requires explicit opt-in (userMsgOptIn) set by one of:
 *   - `--brief` CLI flag (maybeActivateBrief in main.tsx)
 *   - `defaultView: 'chat'` in settings (main.tsx init)
 *   - `/brief` slash command (brief.ts)
 *   - `/config` defaultView picker (Config.tsx)
 *   - SendUserMessage in `--tools` / SDK `tools` option (main.tsx)
 *   - CLAUDE_CODE_BRIEF env var (maybeActivateBrief — dev/testing bypass)
 * Assistant mode (kairosActive) bypasses opt-in since its system prompt
 * hard-codes "you MUST use SendUserMessage" (systemPrompt.md:14).
 *
 * The GB gate is re-checked here as a kill-switch AND — flipping
 * tengu_kairos_brief off mid-session disables the tool on the next 5-min
 * refresh even for opted-in sessions. No opt-in → always false regardless
 * of GB (this is the fix for "brief defaults on for enrolled ants").
 *
 * Called from Tool.isEnabled() (lazy, post-init), never at module scope.
 * getKairosActive() and getUserMsgOptIn() are set in main.tsx before any
 * caller reaches here.
 */
function isBriefEnabled() {
    // Top-level feature() guard is load-bearing for DCE: Bun can constant-fold
    // the ternary to `false` in external builds and then dead-code the BriefTool
    // object. Composing isBriefEntitled() alone (which has its own guard) is
    // semantically equivalent but defeats constant-folding across the boundary.
    return (0, bun_bundle_1.feature)('KAIROS') || (0, bun_bundle_1.feature)('KAIROS_BRIEF')
        ? ((0, state_js_1.getKairosActive)() || (0, state_js_1.getUserMsgOptIn)()) && isBriefEntitled()
        : false;
}
exports.BriefTool = (0, Tool_js_1.buildTool)({
    name: prompt_js_1.BRIEF_TOOL_NAME,
    aliases: [prompt_js_1.LEGACY_BRIEF_TOOL_NAME],
    searchHint: 'send a message to the user — your primary visible output channel',
    maxResultSizeChars: 100000,
    userFacingName() {
        return '';
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    isEnabled() {
        return isBriefEnabled();
    },
    isConcurrencySafe() {
        return true;
    },
    isReadOnly() {
        return true;
    },
    toAutoClassifierInput(input) {
        return input.message;
    },
    async validateInput({ attachments }, _context) {
        if (!attachments || attachments.length === 0) {
            return { result: true };
        }
        return (0, attachments_js_1.validateAttachmentPaths)(attachments);
    },
    async description() {
        return prompt_js_1.DESCRIPTION;
    },
    async prompt() {
        return prompt_js_1.BRIEF_TOOL_PROMPT;
    },
    mapToolResultToToolResultBlockParam(output, toolUseID) {
        const n = output.attachments?.length ?? 0;
        const suffix = n === 0 ? '' : ` (${n} ${(0, stringUtils_js_1.plural)(n, 'attachment')} included)`;
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: `Message delivered to user.${suffix}`,
        };
    },
    renderToolUseMessage: UI_js_1.renderToolUseMessage,
    renderToolResultMessage: UI_js_1.renderToolResultMessage,
    async call({ message, attachments, status }, context) {
        const sentAt = new Date().toISOString();
        (0, index_js_1.logEvent)('tengu_brief_send', {
            proactive: status === 'proactive',
            attachment_count: attachments?.length ?? 0,
        });
        if (!attachments || attachments.length === 0) {
            return { data: { message, sentAt } };
        }
        const appState = context.getAppState();
        const resolved = await (0, attachments_js_1.resolveAttachments)(attachments, {
            replBridgeEnabled: appState.replBridgeEnabled,
            signal: context.abortController.signal,
        });
        return {
            data: { message, attachments: resolved, sentAt },
        };
    },
});
