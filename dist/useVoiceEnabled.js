"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useVoiceEnabled = useVoiceEnabled;
const react_1 = require("react");
const AppState_js_1 = require("../state/AppState.js");
const voiceModeEnabled_js_1 = require("../voice/voiceModeEnabled.js");
/**
 * Combines user intent (settings.voiceEnabled) with auth + GB kill-switch.
 * Only the auth half is memoized on authVersion — it's the expensive one
 * (cold getClaudeAIOAuthTokens memoize → sync `security` spawn, ~60ms/call,
 * ~180ms total in profile v5 when token refresh cleared the cache mid-session).
 * GB is a cheap cached-map lookup and stays outside the memo so a mid-session
 * kill-switch flip still takes effect on the next render.
 *
 * authVersion bumps on /login only. Background token refresh leaves it alone
 * (user is still authed), so the auth memo stays correct without re-eval.
 */
function useVoiceEnabled() {
    const userIntent = (0, AppState_js_1.useAppState)(s => s.settings.voiceEnabled === true);
    const authVersion = (0, AppState_js_1.useAppState)(s => s.authVersion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const authed = (0, react_1.useMemo)(voiceModeEnabled_js_1.hasVoiceAuth, [authVersion]);
    return userIntent && authed && (0, voiceModeEnabled_js_1.isVoiceGrowthBookEnabled)();
}
