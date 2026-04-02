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
exports.getAttributionTexts = getAttributionTexts;
exports.countUserPromptsInMessages = countUserPromptsInMessages;
exports.getEnhancedPRAttribution = getEnhancedPRAttribution;
const bun_bundle_1 = require("bun:bundle");
const promises_1 = require("fs/promises");
const state_js_1 = require("../bootstrap/state.js");
const product_js_1 = require("../constants/product.js");
const xml_js_1 = require("../constants/xml.js");
const constants_js_1 = require("../tools/FileEditTool/constants.js");
const prompt_js_1 = require("../tools/FileReadTool/prompt.js");
const prompt_js_2 = require("../tools/FileWriteTool/prompt.js");
const prompt_js_3 = require("../tools/GlobTool/prompt.js");
const prompt_js_4 = require("../tools/GrepTool/prompt.js");
const commitAttribution_js_1 = require("./commitAttribution.js");
const debug_js_1 = require("./debug.js");
const json_js_1 = require("./json.js");
const log_js_1 = require("./log.js");
const model_js_1 = require("./model/model.js");
const sessionFileAccessHooks_js_1 = require("./sessionFileAccessHooks.js");
const sessionStorage_js_1 = require("./sessionStorage.js");
const sessionStoragePortable_js_1 = require("./sessionStoragePortable.js");
const settings_js_1 = require("./settings/settings.js");
const undercover_js_1 = require("./undercover.js");
/**
 * Returns attribution text for commits and PRs based on user settings.
 * Handles:
 * - Dynamic model name via getPublicModelName()
 * - Custom attribution settings (settings.attribution.commit/pr)
 * - Backward compatibility with deprecated includeCoAuthoredBy setting
 * - Remote mode: returns session URL for attribution
 */
function getAttributionTexts() {
    if (process.env.USER_TYPE === 'ant' && (0, undercover_js_1.isUndercover)()) {
        return { commit: '', pr: '' };
    }
    if ((0, state_js_1.getClientType)() === 'remote') {
        const remoteSessionId = process.env.CLAUDE_CODE_REMOTE_SESSION_ID;
        if (remoteSessionId) {
            const ingressUrl = process.env.SESSION_INGRESS_URL;
            // Skip for local dev - URLs won't persist
            if (!(0, product_js_1.isRemoteSessionLocal)(remoteSessionId, ingressUrl)) {
                const sessionUrl = (0, product_js_1.getRemoteSessionUrl)(remoteSessionId, ingressUrl);
                return { commit: sessionUrl, pr: sessionUrl };
            }
        }
        return { commit: '', pr: '' };
    }
    // @[MODEL LAUNCH]: Update the hardcoded fallback model name below (guards against codename leaks).
    // For internal repos, use the real model name. For external repos,
    // fall back to "Claude Opus 4.6" for unrecognized models to avoid leaking codenames.
    const model = (0, model_js_1.getMainLoopModel)();
    const isKnownPublicModel = (0, model_js_1.getPublicModelDisplayName)(model) !== null;
    const modelName = (0, commitAttribution_js_1.isInternalModelRepoCached)() || isKnownPublicModel
        ? (0, model_js_1.getPublicModelName)(model)
        : 'Claude Opus 4.6';
    const defaultAttribution = `🤖 Generated with [Claude Code](${product_js_1.PRODUCT_URL})`;
    const defaultCommit = `Co-Authored-By: ${modelName} <noreply@anthropic.com>`;
    const settings = (0, settings_js_1.getInitialSettings)();
    // New attribution setting takes precedence over deprecated includeCoAuthoredBy
    if (settings.attribution) {
        return {
            commit: settings.attribution.commit ?? defaultCommit,
            pr: settings.attribution.pr ?? defaultAttribution,
        };
    }
    // Backward compatibility: deprecated includeCoAuthoredBy setting
    if (settings.includeCoAuthoredBy === false) {
        return { commit: '', pr: '' };
    }
    return { commit: defaultCommit, pr: defaultAttribution };
}
/**
 * Check if a message content string is terminal output rather than a user prompt.
 * Terminal output includes bash input/output tags and caveat messages about local commands.
 */
function isTerminalOutput(content) {
    for (const tag of xml_js_1.TERMINAL_OUTPUT_TAGS) {
        if (content.includes(`<${tag}>`)) {
            return true;
        }
    }
    return false;
}
/**
 * Count user messages with visible text content in a list of non-sidechain messages.
 * Excludes tool_result blocks, terminal output, and empty messages.
 *
 * Callers should pass messages already filtered to exclude sidechain messages.
 */
function countUserPromptsInMessages(messages) {
    let count = 0;
    for (const message of messages) {
        if (message.type !== 'user') {
            continue;
        }
        const content = message.message?.content;
        if (!content) {
            continue;
        }
        let hasUserText = false;
        if (typeof content === 'string') {
            if (isTerminalOutput(content)) {
                continue;
            }
            hasUserText = content.trim().length > 0;
        }
        else if (Array.isArray(content)) {
            hasUserText = content.some(block => {
                if (!block || typeof block !== 'object' || !('type' in block)) {
                    return false;
                }
                return ((block.type === 'text' &&
                    typeof block.text === 'string' &&
                    !isTerminalOutput(block.text)) ||
                    block.type === 'image' ||
                    block.type === 'document');
            });
        }
        if (hasUserText) {
            count++;
        }
    }
    return count;
}
/**
 * Count non-sidechain user messages in transcript entries.
 * Used to calculate the number of "steers" (user prompts - 1).
 *
 * Counts user messages that contain actual user-typed text,
 * excluding tool_result blocks, sidechain messages, and terminal output.
 */
function countUserPromptsFromEntries(entries) {
    const nonSidechain = entries.filter(entry => entry.type === 'user' && !('isSidechain' in entry && entry.isSidechain));
    return countUserPromptsInMessages(nonSidechain);
}
/**
 * Get full attribution data from the provided AppState's attribution state.
 * Uses ALL tracked files from the attribution state (not just staged files)
 * because for PR attribution, files may not be staged yet.
 * Returns null if no attribution data is available.
 */
async function getPRAttributionData(appState) {
    const attribution = appState.attribution;
    if (!attribution) {
        return null;
    }
    // Handle both Map and plain object (in case of serialization)
    const fileStates = attribution.fileStates;
    const isMap = fileStates instanceof Map;
    const trackedFiles = isMap
        ? Array.from(fileStates.keys())
        : Object.keys(fileStates);
    if (trackedFiles.length === 0) {
        return null;
    }
    try {
        return await (0, commitAttribution_js_1.calculateCommitAttribution)([attribution], trackedFiles);
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return null;
    }
}
const MEMORY_ACCESS_TOOL_NAMES = new Set([
    prompt_js_1.FILE_READ_TOOL_NAME,
    prompt_js_4.GREP_TOOL_NAME,
    prompt_js_3.GLOB_TOOL_NAME,
    constants_js_1.FILE_EDIT_TOOL_NAME,
    prompt_js_2.FILE_WRITE_TOOL_NAME,
]);
/**
 * Count memory file accesses in transcript entries.
 * Uses the same detection conditions as the PostToolUse session file access hooks.
 */
function countMemoryFileAccessFromEntries(entries) {
    let count = 0;
    for (const entry of entries) {
        if (entry.type !== 'assistant')
            continue;
        const content = entry.message?.content;
        if (!Array.isArray(content))
            continue;
        for (const block of content) {
            if (block.type !== 'tool_use' ||
                !MEMORY_ACCESS_TOOL_NAMES.has(block.name))
                continue;
            if ((0, sessionFileAccessHooks_js_1.isMemoryFileAccess)(block.name, block.input))
                count++;
        }
    }
    return count;
}
/**
 * Read session transcript entries and compute prompt count and memory access
 * count. Pre-compact entries are skipped — the N-shot count and memory-access
 * count should reflect only the current conversation arc, not accumulated
 * prompts from before a compaction boundary.
 */
async function getTranscriptStats() {
    try {
        const filePath = (0, sessionStorage_js_1.getTranscriptPath)();
        const fileSize = (await (0, promises_1.stat)(filePath)).size;
        // Fused reader: attr-snap lines (84% of a long session by bytes) are
        // skipped at the fd level so peak scales with output, not file size. The
        // one surviving attr-snap at EOF is a no-op for the count functions
        // (neither checks type === 'attribution-snapshot'). When the last
        // boundary has preservedSegment the reader returns full (no truncate);
        // the findLastIndex below still slices to post-boundary.
        const scan = await (0, sessionStoragePortable_js_1.readTranscriptForLoad)(filePath, fileSize);
        const buf = scan.postBoundaryBuf;
        const entries = (0, json_js_1.parseJSONL)(buf);
        const lastBoundaryIdx = entries.findLastIndex(e => e.type === 'system' &&
            'subtype' in e &&
            e.subtype === 'compact_boundary');
        const postBoundary = lastBoundaryIdx >= 0 ? entries.slice(lastBoundaryIdx + 1) : entries;
        return {
            promptCount: countUserPromptsFromEntries(postBoundary),
            memoryAccessCount: countMemoryFileAccessFromEntries(postBoundary),
        };
    }
    catch {
        return { promptCount: 0, memoryAccessCount: 0 };
    }
}
/**
 * Get enhanced PR attribution text with Claude contribution stats.
 *
 * Format: "🤖 Generated with Claude Code (93% 3-shotted by claude-opus-4-5)"
 *
 * Rules:
 * - Shows Claude contribution percentage from commit attribution
 * - Shows N-shotted where N is the prompt count (1-shotted, 2-shotted, etc.)
 * - Shows short model name (e.g., claude-opus-4-5)
 * - Returns default attribution if stats can't be computed
 *
 * @param getAppState Function to get the current AppState (from command context)
 */
async function getEnhancedPRAttribution(getAppState) {
    if (process.env.USER_TYPE === 'ant' && (0, undercover_js_1.isUndercover)()) {
        return '';
    }
    if ((0, state_js_1.getClientType)() === 'remote') {
        const remoteSessionId = process.env.CLAUDE_CODE_REMOTE_SESSION_ID;
        if (remoteSessionId) {
            const ingressUrl = process.env.SESSION_INGRESS_URL;
            // Skip for local dev - URLs won't persist
            if (!(0, product_js_1.isRemoteSessionLocal)(remoteSessionId, ingressUrl)) {
                return (0, product_js_1.getRemoteSessionUrl)(remoteSessionId, ingressUrl);
            }
        }
        return '';
    }
    const settings = (0, settings_js_1.getInitialSettings)();
    // If user has custom PR attribution, use that
    if (settings.attribution?.pr) {
        return settings.attribution.pr;
    }
    // Backward compatibility: deprecated includeCoAuthoredBy setting
    if (settings.includeCoAuthoredBy === false) {
        return '';
    }
    const defaultAttribution = `🤖 Generated with [Claude Code](${product_js_1.PRODUCT_URL})`;
    // Get AppState first
    const appState = getAppState();
    (0, debug_js_1.logForDebugging)(`PR Attribution: appState.attribution exists: ${!!appState.attribution}`);
    if (appState.attribution) {
        const fileStates = appState.attribution.fileStates;
        const isMap = fileStates instanceof Map;
        const fileCount = isMap ? fileStates.size : Object.keys(fileStates).length;
        (0, debug_js_1.logForDebugging)(`PR Attribution: fileStates count: ${fileCount}`);
    }
    // Get attribution stats (transcript is read once for both prompt count and memory access)
    const [attributionData, { promptCount, memoryAccessCount }, isInternal] = await Promise.all([
        getPRAttributionData(appState),
        getTranscriptStats(),
        (0, commitAttribution_js_1.isInternalModelRepo)(),
    ]);
    const claudePercent = attributionData?.summary.claudePercent ?? 0;
    (0, debug_js_1.logForDebugging)(`PR Attribution: claudePercent: ${claudePercent}, promptCount: ${promptCount}, memoryAccessCount: ${memoryAccessCount}`);
    // Get short model name, sanitized for non-internal repos
    const rawModelName = (0, model_js_1.getCanonicalName)((0, model_js_1.getMainLoopModel)());
    const shortModelName = isInternal
        ? rawModelName
        : (0, commitAttribution_js_1.sanitizeModelName)(rawModelName);
    // If no attribution data, return default
    if (claudePercent === 0 && promptCount === 0 && memoryAccessCount === 0) {
        (0, debug_js_1.logForDebugging)('PR Attribution: returning default (no data)');
        return defaultAttribution;
    }
    // Build the enhanced attribution: "🤖 Generated with Claude Code (93% 3-shotted by claude-opus-4-5, 2 memories recalled)"
    const memSuffix = memoryAccessCount > 0
        ? `, ${memoryAccessCount} ${memoryAccessCount === 1 ? 'memory' : 'memories'} recalled`
        : '';
    const summary = `🤖 Generated with [Claude Code](${product_js_1.PRODUCT_URL}) (${claudePercent}% ${promptCount}-shotted by ${shortModelName}${memSuffix})`;
    // Append trailer lines for squash-merge survival. Only for allowlisted repos
    // (INTERNAL_MODEL_REPOS) and only in builds with COMMIT_ATTRIBUTION enabled —
    // attributionTrailer.ts contains excluded strings, so reach it via dynamic
    // import behind feature(). When the repo is configured with
    // squash_merge_commit_message=PR_BODY (cli, apps), the PR body becomes the
    // squash commit body verbatim — trailer lines at the end become proper git
    // trailers on the squash commit.
    if ((0, bun_bundle_1.feature)('COMMIT_ATTRIBUTION') && isInternal && attributionData) {
        const { buildPRTrailers } = await Promise.resolve().then(() => __importStar(require('./attributionTrailer.js')));
        const trailers = buildPRTrailers(attributionData, appState.attribution);
        const result = `${summary}\n\n${trailers.join('\n')}`;
        (0, debug_js_1.logForDebugging)(`PR Attribution: returning with trailers: ${result}`);
        return result;
    }
    (0, debug_js_1.logForDebugging)(`PR Attribution: returning summary: ${summary}`);
    return summary;
}
