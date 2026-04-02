"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.call = void 0;
const bun_bundle_1 = require("bun:bundle");
const state_js_1 = require("../../bootstrap/state.js");
const index_js_1 = require("../../services/settingsSync/index.js");
const envUtils_js_1 = require("../../utils/envUtils.js");
const refresh_js_1 = require("../../utils/plugins/refresh.js");
const changeDetector_js_1 = require("../../utils/settings/changeDetector.js");
const stringUtils_js_1 = require("../../utils/stringUtils.js");
const call = async (_args, context) => {
    // CCR: re-pull user settings before the cache sweep so enabledPlugins /
    // extraKnownMarketplaces pushed from the user's local CLI (settingsSync)
    // take effect. Non-CCR headless (e.g. vscode SDK subprocess) shares disk
    // with whoever writes settings — the file watcher delivers changes, no
    // re-pull needed there.
    //
    // Managed settings intentionally NOT re-fetched: it already polls hourly
    // (POLLING_INTERVAL_MS), and policy enforcement is eventually-consistent
    // by design (stale-cache fallback on fetch failure). Interactive
    // /reload-plugins has never re-fetched it either.
    //
    // No retries: user-initiated command, one attempt + fail-open. The user
    // can re-run /reload-plugins to retry. Startup path keeps its retries.
    if ((0, bun_bundle_1.feature)('DOWNLOAD_USER_SETTINGS') &&
        ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_REMOTE) || (0, state_js_1.getIsRemoteMode)())) {
        const applied = await (0, index_js_1.redownloadUserSettings)();
        // applyRemoteEntriesToLocal uses markInternalWrite to suppress the
        // file watcher (correct for startup, nothing listening yet); fire
        // notifyChange here so mid-session applySettingsChange runs.
        if (applied) {
            changeDetector_js_1.settingsChangeDetector.notifyChange('userSettings');
        }
    }
    const r = await (0, refresh_js_1.refreshActivePlugins)(context.setAppState);
    const parts = [
        n(r.enabled_count, 'plugin'),
        n(r.command_count, 'skill'),
        n(r.agent_count, 'agent'),
        n(r.hook_count, 'hook'),
        // "plugin MCP/LSP" disambiguates from user-config/built-in servers,
        // which /reload-plugins doesn't touch. Commands/hooks are plugin-only;
        // agent_count is total agents (incl. built-ins). (gh-31321)
        n(r.mcp_count, 'plugin MCP server'),
        n(r.lsp_count, 'plugin LSP server'),
    ];
    let msg = `Reloaded: ${parts.join(' · ')}`;
    if (r.error_count > 0) {
        msg += `\n${n(r.error_count, 'error')} during load. Run /doctor for details.`;
    }
    return { type: 'text', value: msg };
};
exports.call = call;
function n(count, noun) {
    return `${count} ${(0, stringUtils_js_1.plural)(count, noun)}`;
}
