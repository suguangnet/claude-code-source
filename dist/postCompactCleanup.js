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
exports.runPostCompactCleanup = runPostCompactCleanup;
const bun_bundle_1 = require("bun:bundle");
const systemPromptSections_js_1 = require("../../constants/systemPromptSections.js");
const context_js_1 = require("../../context.js");
const bashPermissions_js_1 = require("../../tools/BashTool/bashPermissions.js");
const classifierApprovals_js_1 = require("../../utils/classifierApprovals.js");
const claudemd_js_1 = require("../../utils/claudemd.js");
const sessionStorage_js_1 = require("../../utils/sessionStorage.js");
const betaSessionTracing_js_1 = require("../../utils/telemetry/betaSessionTracing.js");
const microCompact_js_1 = require("./microCompact.js");
/**
 * Run cleanup of caches and tracking state after compaction.
 * Call this after both auto-compact and manual /compact to free memory
 * held by tracking structures that are invalidated by compaction.
 *
 * Note: We intentionally do NOT clear invoked skill content here.
 * Skill content must survive across multiple compactions so that
 * createSkillAttachmentIfNeeded() can include the full skill text
 * in subsequent compaction attachments.
 *
 * querySource: pass the compacting query's source so we can skip
 * resets that would clobber main-thread module-level state. Subagents
 * (agent:*) run in the same process and share module-level state
 * (context-collapse store, getMemoryFiles one-shot hook flag,
 * getUserContext cache); resetting those when a SUBAGENT compacts
 * would corrupt the MAIN thread's state. All compaction callers should
 * pass querySource — undefined is only safe for callers that are
 * genuinely main-thread-only (/compact, /clear).
 */
function runPostCompactCleanup(querySource) {
    // Subagents (agent:*) run in the same process and share module-level
    // state with the main thread. Only reset main-thread module-level state
    // (context-collapse, memory file cache) for main-thread compacts.
    // Same startsWith pattern as isMainThread (index.ts:188).
    const isMainThreadCompact = querySource === undefined ||
        querySource.startsWith('repl_main_thread') ||
        querySource === 'sdk';
    (0, microCompact_js_1.resetMicrocompactState)();
    if ((0, bun_bundle_1.feature)('CONTEXT_COLLAPSE')) {
        if (isMainThreadCompact) {
            /* eslint-disable @typescript-eslint/no-require-imports */
            ;
            require('../contextCollapse/index.js').resetContextCollapse();
            /* eslint-enable @typescript-eslint/no-require-imports */
        }
    }
    if (isMainThreadCompact) {
        // getUserContext is a memoized outer layer wrapping getClaudeMds() →
        // getMemoryFiles(). If only the inner getMemoryFiles cache is cleared,
        // the next turn hits the getUserContext cache and never reaches
        // getMemoryFiles(), so the armed InstructionsLoaded hook never fires.
        // Manual /compact already clears this explicitly at its call sites;
        // auto-compact and reactive-compact did not — this centralizes the
        // clear so all compaction paths behave consistently.
        context_js_1.getUserContext.cache.clear?.();
        (0, claudemd_js_1.resetGetMemoryFilesCache)('compact');
    }
    (0, systemPromptSections_js_1.clearSystemPromptSections)();
    (0, classifierApprovals_js_1.clearClassifierApprovals)();
    (0, bashPermissions_js_1.clearSpeculativeChecks)();
    // Intentionally NOT calling resetSentSkillNames(): re-injecting the full
    // skill_listing (~4K tokens) post-compact is pure cache_creation. The
    // model still has SkillTool in schema, invoked_skills preserves used
    // skills, and dynamic additions are handled by skillChangeDetector /
    // cacheUtils resets. See compactConversation() for full rationale.
    (0, betaSessionTracing_js_1.clearBetaTracingState)();
    if ((0, bun_bundle_1.feature)('COMMIT_ATTRIBUTION')) {
        void Promise.resolve().then(() => __importStar(require('../../utils/attributionHooks.js'))).then(m => m.sweepFileContentCache());
    }
    (0, sessionStorage_js_1.clearSessionMessagesCache)();
}
