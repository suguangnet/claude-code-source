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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPlansDirectory = void 0;
exports.getPlanSlug = getPlanSlug;
exports.setPlanSlug = setPlanSlug;
exports.clearPlanSlug = clearPlanSlug;
exports.clearAllPlanSlugs = clearAllPlanSlugs;
exports.getPlanFilePath = getPlanFilePath;
exports.getPlan = getPlan;
exports.copyPlanForResume = copyPlanForResume;
exports.copyPlanForFork = copyPlanForFork;
exports.persistFileSnapshotIfRemote = persistFileSnapshotIfRemote;
const crypto_1 = require("crypto");
const promises_1 = require("fs/promises");
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const path_1 = require("path");
const state_js_1 = require("../bootstrap/state.js");
const constants_js_1 = require("../tools/ExitPlanModeTool/constants.js");
const cwd_js_1 = require("./cwd.js");
const debug_js_1 = require("./debug.js");
const envUtils_js_1 = require("./envUtils.js");
const errors_js_1 = require("./errors.js");
const outputsScanner_js_1 = require("./filePersistence/outputsScanner.js");
const fsOperations_js_1 = require("./fsOperations.js");
const log_js_1 = require("./log.js");
const settings_js_1 = require("./settings/settings.js");
const words_js_1 = require("./words.js");
const MAX_SLUG_RETRIES = 10;
/**
 * Get or generate a word slug for the current session's plan.
 * The slug is generated lazily on first access and cached for the session.
 * If a plan file with the generated slug already exists, retries up to 10 times.
 */
function getPlanSlug(sessionId) {
    const id = sessionId ?? (0, state_js_1.getSessionId)();
    const cache = (0, state_js_1.getPlanSlugCache)();
    let slug = cache.get(id);
    if (!slug) {
        const plansDir = (0, exports.getPlansDirectory)();
        // Try to find a unique slug that doesn't conflict with existing files
        for (let i = 0; i < MAX_SLUG_RETRIES; i++) {
            slug = (0, words_js_1.generateWordSlug)();
            const filePath = (0, path_1.join)(plansDir, `${slug}.md`);
            if (!(0, fsOperations_js_1.getFsImplementation)().existsSync(filePath)) {
                break;
            }
        }
        cache.set(id, slug);
    }
    return slug;
}
/**
 * Set a specific plan slug for a session (used when resuming a session)
 */
function setPlanSlug(sessionId, slug) {
    (0, state_js_1.getPlanSlugCache)().set(sessionId, slug);
}
/**
 * Clear the plan slug for the current session.
 * This should be called on /clear to ensure a fresh plan file is used.
 */
function clearPlanSlug(sessionId) {
    const id = sessionId ?? (0, state_js_1.getSessionId)();
    (0, state_js_1.getPlanSlugCache)().delete(id);
}
/**
 * Clear ALL plan slug entries (all sessions).
 * Use this on /clear to free sub-session slug entries.
 */
function clearAllPlanSlugs() {
    (0, state_js_1.getPlanSlugCache)().clear();
}
// Memoized: called from render bodies (FileReadTool/FileEditTool/FileWriteTool UI.tsx)
// and permission checks. Inputs (initial settings + cwd) are fixed at startup, so the
// mkdirSync result is stable for the session. Without memoization, each rendered tool
// message triggers a mkdirSync syscall (regressed in #20005).
exports.getPlansDirectory = (0, memoize_js_1.default)(function getPlansDirectory() {
    const settings = (0, settings_js_1.getInitialSettings)();
    const settingsDir = settings.plansDirectory;
    let plansPath;
    if (settingsDir) {
        // Settings.json (relative to project root)
        const cwd = (0, cwd_js_1.getCwd)();
        const resolved = (0, path_1.resolve)(cwd, settingsDir);
        // Validate path stays within project root to prevent path traversal
        if (!resolved.startsWith(cwd + path_1.sep) && resolved !== cwd) {
            (0, log_js_1.logError)(new Error(`plansDirectory must be within project root: ${settingsDir}`));
            plansPath = (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), 'plans');
        }
        else {
            plansPath = resolved;
        }
    }
    else {
        // Default
        plansPath = (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), 'plans');
    }
    // Ensure directory exists (mkdirSync with recursive: true is a no-op if it exists)
    try {
        (0, fsOperations_js_1.getFsImplementation)().mkdirSync(plansPath);
    }
    catch (error) {
        (0, log_js_1.logError)(error);
    }
    return plansPath;
});
/**
 * Get the file path for a session's plan
 * @param agentId Optional agent ID for subagents. If not provided, returns main session plan.
 * For main conversation (no agentId), returns {planSlug}.md
 * For subagents (agentId provided), returns {planSlug}-agent-{agentId}.md
 */
function getPlanFilePath(agentId) {
    const planSlug = getPlanSlug((0, state_js_1.getSessionId)());
    // Main conversation: simple filename with word slug
    if (!agentId) {
        return (0, path_1.join)((0, exports.getPlansDirectory)(), `${planSlug}.md`);
    }
    // Subagents: include agent ID
    return (0, path_1.join)((0, exports.getPlansDirectory)(), `${planSlug}-agent-${agentId}.md`);
}
/**
 * Get the plan content for a session
 * @param agentId Optional agent ID for subagents. If not provided, returns main session plan.
 */
function getPlan(agentId) {
    const filePath = getPlanFilePath(agentId);
    try {
        return (0, fsOperations_js_1.getFsImplementation)().readFileSync(filePath, { encoding: 'utf-8' });
    }
    catch (error) {
        if ((0, errors_js_1.isENOENT)(error))
            return null;
        (0, log_js_1.logError)(error);
        return null;
    }
}
/**
 * Extract the plan slug from a log's message history.
 */
function getSlugFromLog(log) {
    return log.messages.find(m => m.slug)?.slug;
}
/**
 * Restore plan slug from a resumed session.
 * Sets the slug in the session cache so getPlanSlug returns it.
 * If the plan file is missing, attempts to recover it from a file snapshot
 * (written incrementally during the session) or from message history.
 * Returns true if a plan file exists (or was recovered) for the slug.
 * @param log The log to restore from
 * @param targetSessionId The session ID to associate the plan slug with.
 *                        This should be the ORIGINAL session ID being resumed,
 *                        not the temporary session ID from before resume.
 */
async function copyPlanForResume(log, targetSessionId) {
    const slug = getSlugFromLog(log);
    if (!slug) {
        return false;
    }
    // Set the slug for the target session ID (or current if not provided)
    const sessionId = targetSessionId ?? (0, state_js_1.getSessionId)();
    setPlanSlug(sessionId, slug);
    // Attempt to read the plan file directly — recovery triggers on ENOENT.
    const planPath = (0, path_1.join)((0, exports.getPlansDirectory)(), `${slug}.md`);
    try {
        await (0, fsOperations_js_1.getFsImplementation)().readFile(planPath, { encoding: 'utf-8' });
        return true;
    }
    catch (e) {
        if (!(0, errors_js_1.isENOENT)(e)) {
            // Don't throw — called fire-and-forget (void copyPlanForResume(...)) with no .catch()
            (0, log_js_1.logError)(e);
            return false;
        }
        // Only attempt recovery in remote sessions (CCR) where files don't persist
        if ((0, outputsScanner_js_1.getEnvironmentKind)() === null) {
            return false;
        }
        (0, debug_js_1.logForDebugging)(`Plan file missing during resume: ${planPath}. Attempting recovery.`);
        // Try file snapshot first (written incrementally during session)
        const snapshotPlan = findFileSnapshotEntry(log.messages, 'plan');
        let recovered = null;
        if (snapshotPlan && snapshotPlan.content.length > 0) {
            recovered = snapshotPlan.content;
            (0, debug_js_1.logForDebugging)(`Plan recovered from file snapshot, ${recovered.length} chars`, { level: 'info' });
        }
        else {
            // Fall back to searching message history
            recovered = recoverPlanFromMessages(log);
            if (recovered) {
                (0, debug_js_1.logForDebugging)(`Plan recovered from message history, ${recovered.length} chars`, { level: 'info' });
            }
        }
        if (recovered) {
            try {
                await (0, promises_1.writeFile)(planPath, recovered, { encoding: 'utf-8' });
                return true;
            }
            catch (writeError) {
                (0, log_js_1.logError)(writeError);
                return false;
            }
        }
        (0, debug_js_1.logForDebugging)('Plan file recovery failed: no file snapshot or plan content found in message history');
        return false;
    }
}
/**
 * Copy a plan file for a forked session. Unlike copyPlanForResume (which reuses
 * the original slug), this generates a NEW slug for the forked session and
 * writes the original plan content to the new file. This prevents the original
 * and forked sessions from clobbering each other's plan files.
 */
async function copyPlanForFork(log, targetSessionId) {
    const originalSlug = getSlugFromLog(log);
    if (!originalSlug) {
        return false;
    }
    const plansDir = (0, exports.getPlansDirectory)();
    const originalPlanPath = (0, path_1.join)(plansDir, `${originalSlug}.md`);
    // Generate a new slug for the forked session (do NOT reuse the original)
    const newSlug = getPlanSlug(targetSessionId);
    const newPlanPath = (0, path_1.join)(plansDir, `${newSlug}.md`);
    try {
        await (0, promises_1.copyFile)(originalPlanPath, newPlanPath);
        return true;
    }
    catch (error) {
        if ((0, errors_js_1.isENOENT)(error)) {
            return false;
        }
        (0, log_js_1.logError)(error);
        return false;
    }
}
/**
 * Recover plan content from the message history. Plan content can appear in
 * three forms depending on what happened during the session:
 *
 * 1. ExitPlanMode tool_use input — normalizeToolInput injects the plan content
 *    into the tool_use input, which persists in the transcript.
 *
 * 2. planContent field on user messages — set during the "clear context and
 *    implement" flow when ExitPlanMode is approved.
 *
 * 3. plan_file_reference attachment — created by auto-compact to preserve the
 *    plan across compaction boundaries.
 */
function recoverPlanFromMessages(log) {
    for (let i = log.messages.length - 1; i >= 0; i--) {
        const msg = log.messages[i];
        if (!msg) {
            continue;
        }
        if (msg.type === 'assistant') {
            const { content } = msg.message;
            if (Array.isArray(content)) {
                for (const block of content) {
                    if (block.type === 'tool_use' &&
                        block.name === constants_js_1.EXIT_PLAN_MODE_V2_TOOL_NAME) {
                        const input = block.input;
                        const plan = input?.plan;
                        if (typeof plan === 'string' && plan.length > 0) {
                            return plan;
                        }
                    }
                }
            }
        }
        if (msg.type === 'user') {
            const userMsg = msg;
            if (typeof userMsg.planContent === 'string' &&
                userMsg.planContent.length > 0) {
                return userMsg.planContent;
            }
        }
        if (msg.type === 'attachment') {
            const attachmentMsg = msg;
            if (attachmentMsg.attachment?.type === 'plan_file_reference') {
                const plan = attachmentMsg.attachment
                    .planContent;
                if (typeof plan === 'string' && plan.length > 0) {
                    return plan;
                }
            }
        }
    }
    return null;
}
/**
 * Find a file entry in the most recent file-snapshot system message in the transcript.
 * Scans backwards to find the latest snapshot.
 */
function findFileSnapshotEntry(messages, key) {
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg?.type === 'system' &&
            'subtype' in msg &&
            msg.subtype === 'file_snapshot' &&
            'snapshotFiles' in msg) {
            const files = msg.snapshotFiles;
            return files.find(f => f.key === key);
        }
    }
    return undefined;
}
/**
 * Persist a snapshot of session files (plan, todos) to the transcript.
 * Called incrementally whenever these files change. Only active in remote
 * sessions (CCR) where local files don't persist between sessions.
 */
async function persistFileSnapshotIfRemote() {
    if ((0, outputsScanner_js_1.getEnvironmentKind)() === null) {
        return;
    }
    try {
        const snapshotFiles = [];
        // Snapshot plan file
        const plan = getPlan();
        if (plan) {
            snapshotFiles.push({
                key: 'plan',
                path: getPlanFilePath(),
                content: plan,
            });
        }
        if (snapshotFiles.length === 0) {
            return;
        }
        const message = {
            type: 'system',
            subtype: 'file_snapshot',
            content: 'File snapshot',
            level: 'info',
            isMeta: true,
            timestamp: new Date().toISOString(),
            uuid: (0, crypto_1.randomUUID)(),
            snapshotFiles,
        };
        const { recordTranscript } = await Promise.resolve().then(() => __importStar(require('./sessionStorage.js')));
        await recordTranscript([message]);
    }
    catch (error) {
        (0, log_js_1.logError)(error);
    }
}
