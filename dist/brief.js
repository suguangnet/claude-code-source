"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bun_bundle_1 = require("bun:bundle");
const v4_1 = require("zod/v4");
const state_js_1 = require("../bootstrap/state.js");
const growthbook_js_1 = require("../services/analytics/growthbook.js");
const index_js_1 = require("../services/analytics/index.js");
const BriefTool_js_1 = require("../tools/BriefTool/BriefTool.js");
const prompt_js_1 = require("../tools/BriefTool/prompt.js");
const lazySchema_js_1 = require("../utils/lazySchema.js");
// Zod guards against fat-fingered GB pushes (same pattern as pollConfig.ts /
// cronScheduler.ts). A malformed config falls back to DEFAULT_BRIEF_CONFIG
// entirely rather than being partially trusted.
const briefConfigSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    enable_slash_command: v4_1.z.boolean(),
}));
const DEFAULT_BRIEF_CONFIG = {
    enable_slash_command: false,
};
// No TTL — this gate controls slash-command *visibility*, not a kill switch.
// CACHED_MAY_BE_STALE still has one background-update flip (first call kicks
// off fetch; second call sees fresh value), but no additional flips after that.
// The tool-availability gate (tengu_kairos_brief in isBriefEnabled) keeps its
// 5-min TTL because that one IS a kill switch.
function getBriefConfig() {
    const raw = (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_kairos_brief_config', DEFAULT_BRIEF_CONFIG);
    const parsed = briefConfigSchema().safeParse(raw);
    return parsed.success ? parsed.data : DEFAULT_BRIEF_CONFIG;
}
const brief = {
    type: 'local-jsx',
    name: 'brief',
    description: 'Toggle brief-only mode',
    isEnabled: () => {
        if ((0, bun_bundle_1.feature)('KAIROS') || (0, bun_bundle_1.feature)('KAIROS_BRIEF')) {
            return getBriefConfig().enable_slash_command;
        }
        return false;
    },
    immediate: true,
    load: () => Promise.resolve({
        async call(onDone, context) {
            const current = context.getAppState().isBriefOnly;
            const newState = !current;
            // Entitlement check only gates the on-transition — off is always
            // allowed so a user whose GB gate flipped mid-session isn't stuck.
            if (newState && !(0, BriefTool_js_1.isBriefEntitled)()) {
                (0, index_js_1.logEvent)('tengu_brief_mode_toggled', {
                    enabled: false,
                    gated: true,
                    source: 'slash_command',
                });
                onDone('Brief tool is not enabled for your account', {
                    display: 'system',
                });
                return null;
            }
            // Two-way: userMsgOptIn tracks isBriefOnly so the tool is available
            // exactly when brief mode is on. This invalidates prompt cache on
            // each toggle (tool list changes), but a stale tool list is worse —
            // when /brief is enabled mid-session the model was previously left
            // without the tool, emitting plain text the filter hides.
            (0, state_js_1.setUserMsgOptIn)(newState);
            context.setAppState(prev => {
                if (prev.isBriefOnly === newState)
                    return prev;
                return { ...prev, isBriefOnly: newState };
            });
            (0, index_js_1.logEvent)('tengu_brief_mode_toggled', {
                enabled: newState,
                gated: false,
                source: 'slash_command',
            });
            // The tool list change alone isn't a strong enough signal mid-session
            // (model may keep emitting plain text from inertia, or keep calling a
            // tool that just vanished). Inject an explicit reminder into the next
            // turn's context so the transition is unambiguous.
            // Skip when Kairos is active: isBriefEnabled() short-circuits on
            // getKairosActive() so the tool never actually leaves the list, and
            // the Kairos system prompt already mandates SendUserMessage.
            // Inline <system-reminder> wrap — importing wrapInSystemReminder from
            // utils/messages.ts pulls constants/xml.ts into the bridge SDK bundle
            // via this module's import chain, tripping the excluded-strings check.
            const metaMessages = (0, state_js_1.getKairosActive)()
                ? undefined
                : [
                    `<system-reminder>\n${newState
                        ? `Brief mode is now enabled. Use the ${prompt_js_1.BRIEF_TOOL_NAME} tool for all user-facing output — plain text outside it is hidden from the user's view.`
                        : `Brief mode is now disabled. The ${prompt_js_1.BRIEF_TOOL_NAME} tool is no longer available — reply with plain text.`}\n</system-reminder>`,
                ];
            onDone(newState ? 'Brief-only mode enabled' : 'Brief-only mode disabled', { display: 'system', metaMessages });
            return null;
        },
    }),
};
exports.default = brief;
