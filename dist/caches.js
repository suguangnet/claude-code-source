"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearSessionCaches = clearSessionCaches;
/**
 * Session cache clearing utilities.
 * This module is imported at startup by main.tsx, so keep imports minimal.
 */
const bun_bundle_1 = require("bun:bundle");
const state_js_1 = require("../../bootstrap/state.js");
const commands_js_1 = require("../../commands.js");
const common_js_1 = require("../../constants/common.js");
const context_js_1 = require("../../context.js");
const fileSuggestions_js_1 = require("../../hooks/fileSuggestions.js");
const useSwarmPermissionPoller_js_1 = require("../../hooks/useSwarmPermissionPoller.js");
const dumpPrompts_js_1 = require("../../services/api/dumpPrompts.js");
const promptCacheBreakDetection_js_1 = require("../../services/api/promptCacheBreakDetection.js");
const sessionIngress_js_1 = require("../../services/api/sessionIngress.js");
const postCompactCleanup_js_1 = require("../../services/compact/postCompactCleanup.js");
const LSPDiagnosticRegistry_js_1 = require("../../services/lsp/LSPDiagnosticRegistry.js");
const magicDocs_js_1 = require("../../services/MagicDocs/magicDocs.js");
const loadSkillsDir_js_1 = require("../../skills/loadSkillsDir.js");
const attachments_js_1 = require("../../utils/attachments.js");
const commands_js_2 = require("../../utils/bash/commands.js");
const claudemd_js_1 = require("../../utils/claudemd.js");
const detectRepository_js_1 = require("../../utils/detectRepository.js");
const gitFilesystem_js_1 = require("../../utils/git/gitFilesystem.js");
const imageStore_js_1 = require("../../utils/imageStore.js");
const sessionEnvVars_js_1 = require("../../utils/sessionEnvVars.js");
/**
 * Clear all session-related caches.
 * Call this when resuming a session to ensure fresh file/skill discovery.
 * This is a subset of what clearConversation does - it only clears caches
 * without affecting messages, session ID, or triggering hooks.
 *
 * @param preservedAgentIds - Agent IDs whose per-agent state should survive
 *   the clear (e.g., background tasks preserved across /clear). When non-empty,
 *   agentId-keyed state (invoked skills) is selectively cleared and requestId-keyed
 *   state (pending permission callbacks, dump state, cache-break tracking) is left
 *   intact since it cannot be safely scoped to the main session.
 */
function clearSessionCaches(preservedAgentIds = new Set()) {
    const hasPreserved = preservedAgentIds.size > 0;
    // Clear context caches
    context_js_1.getUserContext.cache.clear?.();
    context_js_1.getSystemContext.cache.clear?.();
    context_js_1.getGitStatus.cache.clear?.();
    common_js_1.getSessionStartDate.cache.clear?.();
    // Clear file suggestion caches (for @ mentions)
    (0, fileSuggestions_js_1.clearFileSuggestionCaches)();
    // Clear commands/skills cache
    (0, commands_js_1.clearCommandsCache)();
    // Clear prompt cache break detection state
    if (!hasPreserved)
        (0, promptCacheBreakDetection_js_1.resetPromptCacheBreakDetection)();
    // Clear system prompt injection (cache breaker)
    (0, context_js_1.setSystemPromptInjection)(null);
    // Clear last emitted date so it's re-detected on next turn
    (0, state_js_1.setLastEmittedDate)(null);
    // Run post-compaction cleanup (clears system prompt sections, microcompact tracking,
    // classifier approvals, speculative checks, and — for main-thread compacts — memory
    // files cache with load_reason 'compact').
    (0, postCompactCleanup_js_1.runPostCompactCleanup)();
    // Reset sent skill names so the skill listing is re-sent after /clear.
    // runPostCompactCleanup intentionally does NOT reset this (post-compact
    // re-injection costs ~4K tokens), but /clear wipes messages entirely so
    // the model needs the full listing again.
    (0, attachments_js_1.resetSentSkillNames)();
    // Override the memory cache reset with 'session_start': clearSessionCaches is called
    // from /clear and --resume/--continue, which are NOT compaction events. Without this,
    // the InstructionsLoaded hook would fire with load_reason 'compact' instead of
    // 'session_start' on the next getMemoryFiles() call.
    (0, claudemd_js_1.resetGetMemoryFilesCache)('session_start');
    // Clear stored image paths cache
    (0, imageStore_js_1.clearStoredImagePaths)();
    // Clear all session ingress caches (lastUuidMap, sequentialAppendBySession)
    (0, sessionIngress_js_1.clearAllSessions)();
    // Clear swarm permission pending callbacks
    if (!hasPreserved)
        (0, useSwarmPermissionPoller_js_1.clearAllPendingCallbacks)();
    // Clear tungsten session usage tracking
    if (process.env.USER_TYPE === 'ant') {
        void Promise.resolve().then(() => __importStar(require('../../tools/TungstenTool/TungstenTool.js'))).then(({ clearSessionsWithTungstenUsage, resetInitializationState }) => {
            clearSessionsWithTungstenUsage();
            resetInitializationState();
        });
    }
    // Clear attribution caches (file content cache, pending bash states)
    // Dynamic import to preserve dead code elimination for COMMIT_ATTRIBUTION feature flag
    if ((0, bun_bundle_1.feature)('COMMIT_ATTRIBUTION')) {
        void Promise.resolve().then(() => __importStar(require('../../utils/attributionHooks.js'))).then(({ clearAttributionCaches }) => clearAttributionCaches());
    }
    // Clear repository detection caches
    (0, detectRepository_js_1.clearRepositoryCaches)();
    // Clear bash command prefix caches (Haiku-extracted prefixes)
    (0, commands_js_2.clearCommandPrefixCaches)();
    // Clear dump prompts state
    if (!hasPreserved)
        (0, dumpPrompts_js_1.clearAllDumpState)();
    // Clear invoked skills cache (each entry holds full skill file content)
    (0, state_js_1.clearInvokedSkills)(preservedAgentIds);
    // Clear git dir resolution cache
    (0, gitFilesystem_js_1.clearResolveGitDirCache)();
    // Clear dynamic skills (loaded from skill directories)
    (0, loadSkillsDir_js_1.clearDynamicSkills)();
    // Clear LSP diagnostic tracking state
    (0, LSPDiagnosticRegistry_js_1.resetAllLSPDiagnosticState)();
    // Clear tracked magic docs
    (0, magicDocs_js_1.clearTrackedMagicDocs)();
    // Clear session environment variables
    (0, sessionEnvVars_js_1.clearSessionEnvVars)();
    // Clear WebFetch URL cache (up to 50MB of cached page content)
    void Promise.resolve().then(() => __importStar(require('../../tools/WebFetchTool/utils.js'))).then(({ clearWebFetchCache }) => clearWebFetchCache());
    // Clear ToolSearch description cache (full tool prompts, ~500KB for 50 MCP tools)
    void Promise.resolve().then(() => __importStar(require('../../tools/ToolSearchTool/ToolSearchTool.js'))).then(({ clearToolSearchDescriptionCache }) => clearToolSearchDescriptionCache());
    // Clear agent definitions cache (accumulates per-cwd via EnterWorktreeTool)
    void Promise.resolve().then(() => __importStar(require('../../tools/AgentTool/loadAgentsDir.js'))).then(({ clearAgentDefinitionsCache }) => clearAgentDefinitionsCache());
    // Clear SkillTool prompt cache (accumulates per project root)
    void Promise.resolve().then(() => __importStar(require('../../tools/SkillTool/prompt.js'))).then(({ clearPromptCache }) => clearPromptCache());
}
