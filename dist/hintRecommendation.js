"use strict";
/**
 * Plugin-hint recommendations.
 *
 * Companion to lspRecommendation.ts: where LSP recommendations are triggered
 * by file edits, plugin hints are triggered by CLIs/SDKs emitting a
 * `<claude-code-hint />` tag to stderr (detected by the Bash/PowerShell tools).
 *
 * State persists in GlobalConfig.claudeCodeHints — a show-once record per
 * plugin and a disabled flag (user picked "don't show again"). Official-
 * marketplace filtering is hardcoded for v1.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.maybeRecordPluginHint = maybeRecordPluginHint;
exports._resetHintRecommendationForTesting = _resetHintRecommendationForTesting;
exports.resolvePluginHint = resolvePluginHint;
exports.markHintPluginShown = markHintPluginShown;
exports.disableHintRecommendations = disableHintRecommendations;
const growthbook_js_1 = require("../../services/analytics/growthbook.js");
const index_js_1 = require("../../services/analytics/index.js");
const claudeCodeHints_js_1 = require("../claudeCodeHints.js");
const config_js_1 = require("../config.js");
const debug_js_1 = require("../debug.js");
const installedPluginsManager_js_1 = require("./installedPluginsManager.js");
const marketplaceManager_js_1 = require("./marketplaceManager.js");
const pluginIdentifier_js_1 = require("./pluginIdentifier.js");
const pluginPolicy_js_1 = require("./pluginPolicy.js");
/**
 * Hard cap on `claudeCodeHints.plugin[]` — bounds config growth. Each shown
 * plugin appends one slug; past this point we stop prompting (and stop
 * appending) rather than let the config grow without limit.
 */
const MAX_SHOWN_PLUGINS = 100;
/**
 * Pre-store gate called by shell tools when a `type="plugin"` hint is detected.
 * Drops the hint if:
 *
 *  - a dialog has already been shown this session
 *  - user has disabled hints
 *  - the shown-plugins list has hit the config-growth cap
 *  - plugin slug doesn't parse as `name@marketplace`
 *  - marketplace isn't official (hardcoded for v1)
 *  - plugin is already installed
 *  - plugin was already shown in a prior session
 *
 * Synchronous on purpose — shell tools shouldn't await a marketplace lookup
 * just to strip a stderr line. The async marketplace-cache check happens
 * later in resolvePluginHint (hook side).
 */
function maybeRecordPluginHint(hint) {
    if (!(0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_lapis_finch', false))
        return;
    if ((0, claudeCodeHints_js_1.hasShownHintThisSession)())
        return;
    const state = (0, config_js_1.getGlobalConfig)().claudeCodeHints;
    if (state?.disabled)
        return;
    const shown = state?.plugin ?? [];
    if (shown.length >= MAX_SHOWN_PLUGINS)
        return;
    const pluginId = hint.value;
    const { name, marketplace } = (0, pluginIdentifier_js_1.parsePluginIdentifier)(pluginId);
    if (!name || !marketplace)
        return;
    if (!(0, pluginIdentifier_js_1.isOfficialMarketplaceName)(marketplace))
        return;
    if (shown.includes(pluginId))
        return;
    if ((0, installedPluginsManager_js_1.isPluginInstalled)(pluginId))
        return;
    if ((0, pluginPolicy_js_1.isPluginBlockedByPolicy)(pluginId))
        return;
    // Bound repeat lookups on the same slug — a CLI that emits on every
    // invocation shouldn't trigger N resolve cycles for the same plugin.
    if (triedThisSession.has(pluginId))
        return;
    triedThisSession.add(pluginId);
    (0, claudeCodeHints_js_1.setPendingHint)(hint);
}
const triedThisSession = new Set();
/** Test-only reset. */
function _resetHintRecommendationForTesting() {
    triedThisSession.clear();
}
/**
 * Resolve the pending hint to a renderable recommendation. Runs the async
 * marketplace lookup that the sync pre-store gate skipped. Returns null if
 * the plugin isn't in the marketplace cache — the hint is discarded.
 */
async function resolvePluginHint(hint) {
    const pluginId = hint.value;
    const { name, marketplace } = (0, pluginIdentifier_js_1.parsePluginIdentifier)(pluginId);
    const pluginData = await (0, marketplaceManager_js_1.getPluginById)(pluginId);
    (0, index_js_1.logEvent)('tengu_plugin_hint_detected', {
        _PROTO_plugin_name: (name ??
            ''),
        _PROTO_marketplace_name: (marketplace ??
            ''),
        result: (pluginData
            ? 'passed'
            : 'not_in_cache'),
    });
    if (!pluginData) {
        (0, debug_js_1.logForDebugging)(`[hintRecommendation] ${pluginId} not found in marketplace cache`);
        return null;
    }
    return {
        pluginId,
        pluginName: pluginData.entry.name,
        marketplaceName: marketplace ?? '',
        pluginDescription: pluginData.entry.description,
        sourceCommand: hint.sourceCommand,
    };
}
/**
 * Record that a prompt for this plugin was surfaced. Called regardless of
 * the user's yes/no response — show-once semantics.
 */
function markHintPluginShown(pluginId) {
    (0, config_js_1.saveGlobalConfig)(current => {
        const existing = current.claudeCodeHints?.plugin ?? [];
        if (existing.includes(pluginId))
            return current;
        return {
            ...current,
            claudeCodeHints: {
                ...current.claudeCodeHints,
                plugin: [...existing, pluginId],
            },
        };
    });
}
/** Called when the user picks "don't show plugin installation hints again". */
function disableHintRecommendations() {
    (0, config_js_1.saveGlobalConfig)(current => {
        if (current.claudeCodeHints?.disabled)
            return current;
        return {
            ...current,
            claudeCodeHints: { ...current.claudeCodeHints, disabled: true },
        };
    });
}
