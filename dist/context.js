"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserContext = exports.getSystemContext = exports.getGitStatus = void 0;
exports.getSystemPromptInjection = getSystemPromptInjection;
exports.setSystemPromptInjection = setSystemPromptInjection;
const bun_bundle_1 = require("bun:bundle");
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const state_js_1 = require("./bootstrap/state.js");
const common_js_1 = require("./constants/common.js");
const claudemd_js_1 = require("./utils/claudemd.js");
const diagLogs_js_1 = require("./utils/diagLogs.js");
const envUtils_js_1 = require("./utils/envUtils.js");
const execFileNoThrow_js_1 = require("./utils/execFileNoThrow.js");
const git_js_1 = require("./utils/git.js");
const gitSettings_js_1 = require("./utils/gitSettings.js");
const log_js_1 = require("./utils/log.js");
const MAX_STATUS_CHARS = 2000;
// System prompt injection for cache breaking (ant-only, ephemeral debugging state)
let systemPromptInjection = null;
function getSystemPromptInjection() {
    return systemPromptInjection;
}
function setSystemPromptInjection(value) {
    systemPromptInjection = value;
    // Clear context caches immediately when injection changes
    exports.getUserContext.cache.clear?.();
    exports.getSystemContext.cache.clear?.();
}
exports.getGitStatus = (0, memoize_js_1.default)(async () => {
    if (process.env.NODE_ENV === 'test') {
        // Avoid cycles in tests
        return null;
    }
    const startTime = Date.now();
    (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'git_status_started');
    const isGitStart = Date.now();
    const isGit = await (0, git_js_1.getIsGit)();
    (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'git_is_git_check_completed', {
        duration_ms: Date.now() - isGitStart,
        is_git: isGit,
    });
    if (!isGit) {
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'git_status_skipped_not_git', {
            duration_ms: Date.now() - startTime,
        });
        return null;
    }
    try {
        const gitCmdsStart = Date.now();
        const [branch, mainBranch, status, log, userName] = await Promise.all([
            (0, git_js_1.getBranch)(),
            (0, git_js_1.getDefaultBranch)(),
            (0, execFileNoThrow_js_1.execFileNoThrow)((0, git_js_1.gitExe)(), ['--no-optional-locks', 'status', '--short'], {
                preserveOutputOnError: false,
            }).then(({ stdout }) => stdout.trim()),
            (0, execFileNoThrow_js_1.execFileNoThrow)((0, git_js_1.gitExe)(), ['--no-optional-locks', 'log', '--oneline', '-n', '5'], {
                preserveOutputOnError: false,
            }).then(({ stdout }) => stdout.trim()),
            (0, execFileNoThrow_js_1.execFileNoThrow)((0, git_js_1.gitExe)(), ['config', 'user.name'], {
                preserveOutputOnError: false,
            }).then(({ stdout }) => stdout.trim()),
        ]);
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'git_commands_completed', {
            duration_ms: Date.now() - gitCmdsStart,
            status_length: status.length,
        });
        // Check if status exceeds character limit
        const truncatedStatus = status.length > MAX_STATUS_CHARS
            ? status.substring(0, MAX_STATUS_CHARS) +
                '\n... (truncated because it exceeds 2k characters. If you need more information, run "git status" using BashTool)'
            : status;
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'git_status_completed', {
            duration_ms: Date.now() - startTime,
            truncated: status.length > MAX_STATUS_CHARS,
        });
        return [
            `This is the git status at the start of the conversation. Note that this status is a snapshot in time, and will not update during the conversation.`,
            `Current branch: ${branch}`,
            `Main branch (you will usually use this for PRs): ${mainBranch}`,
            ...(userName ? [`Git user: ${userName}`] : []),
            `Status:\n${truncatedStatus || '(clean)'}`,
            `Recent commits:\n${log}`,
        ].join('\n\n');
    }
    catch (error) {
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('error', 'git_status_failed', {
            duration_ms: Date.now() - startTime,
        });
        (0, log_js_1.logError)(error);
        return null;
    }
});
/**
 * This context is prepended to each conversation, and cached for the duration of the conversation.
 */
exports.getSystemContext = (0, memoize_js_1.default)(async () => {
    const startTime = Date.now();
    (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'system_context_started');
    // Skip git status in CCR (unnecessary overhead on resume) or when git instructions are disabled
    const gitStatus = (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_REMOTE) ||
        !(0, gitSettings_js_1.shouldIncludeGitInstructions)()
        ? null
        : await (0, exports.getGitStatus)();
    // Include system prompt injection if set (for cache breaking, ant-only)
    const injection = (0, bun_bundle_1.feature)('BREAK_CACHE_COMMAND')
        ? getSystemPromptInjection()
        : null;
    (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'system_context_completed', {
        duration_ms: Date.now() - startTime,
        has_git_status: gitStatus !== null,
        has_injection: injection !== null,
    });
    return {
        ...(gitStatus && { gitStatus }),
        ...((0, bun_bundle_1.feature)('BREAK_CACHE_COMMAND') && injection
            ? {
                cacheBreaker: `[CACHE_BREAKER: ${injection}]`,
            }
            : {}),
    };
});
/**
 * This context is prepended to each conversation, and cached for the duration of the conversation.
 */
exports.getUserContext = (0, memoize_js_1.default)(async () => {
    const startTime = Date.now();
    (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'user_context_started');
    // CLAUDE_CODE_DISABLE_CLAUDE_MDS: hard off, always.
    // --bare: skip auto-discovery (cwd walk), BUT honor explicit --add-dir.
    // --bare means "skip what I didn't ask for", not "ignore what I asked for".
    const shouldDisableClaudeMd = (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_DISABLE_CLAUDE_MDS) ||
        ((0, envUtils_js_1.isBareMode)() && (0, state_js_1.getAdditionalDirectoriesForClaudeMd)().length === 0);
    // Await the async I/O (readFile/readdir directory walk) so the event
    // loop yields naturally at the first fs.readFile.
    const claudeMd = shouldDisableClaudeMd
        ? null
        : (0, claudemd_js_1.getClaudeMds)((0, claudemd_js_1.filterInjectedMemoryFiles)(await (0, claudemd_js_1.getMemoryFiles)()));
    // Cache for the auto-mode classifier (yoloClassifier.ts reads this
    // instead of importing claudemd.ts directly, which would create a
    // cycle through permissions/filesystem → permissions → yoloClassifier).
    (0, state_js_1.setCachedClaudeMdContent)(claudeMd || null);
    (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'user_context_completed', {
        duration_ms: Date.now() - startTime,
        claudemd_length: claudeMd?.length ?? 0,
        claudemd_disabled: Boolean(shouldDisableClaudeMd),
    });
    return {
        ...(claudeMd && { claudeMd }),
        currentDate: `Today's date is ${(0, common_js_1.getLocalISODate)()}.`,
    };
});
