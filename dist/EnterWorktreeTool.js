"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnterWorktreeTool = void 0;
const v4_1 = require("zod/v4");
const state_js_1 = require("../../bootstrap/state.js");
const systemPromptSections_js_1 = require("../../constants/systemPromptSections.js");
const index_js_1 = require("../../services/analytics/index.js");
const Tool_js_1 = require("../../Tool.js");
const claudemd_js_1 = require("../../utils/claudemd.js");
const cwd_js_1 = require("../../utils/cwd.js");
const git_js_1 = require("../../utils/git.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const plans_js_1 = require("../../utils/plans.js");
const Shell_js_1 = require("../../utils/Shell.js");
const sessionStorage_js_1 = require("../../utils/sessionStorage.js");
const worktree_js_1 = require("../../utils/worktree.js");
const constants_js_1 = require("./constants.js");
const prompt_js_1 = require("./prompt.js");
const UI_js_1 = require("./UI.js");
const inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.strictObject({
    name: v4_1.z
        .string()
        .superRefine((s, ctx) => {
        try {
            (0, worktree_js_1.validateWorktreeSlug)(s);
        }
        catch (e) {
            ctx.addIssue({ code: 'custom', message: e.message });
        }
    })
        .optional()
        .describe('Optional name for the worktree. Each "/"-separated segment may contain only letters, digits, dots, underscores, and dashes; max 64 chars total. A random name is generated if not provided.'),
}));
const outputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    worktreePath: v4_1.z.string(),
    worktreeBranch: v4_1.z.string().optional(),
    message: v4_1.z.string(),
}));
exports.EnterWorktreeTool = (0, Tool_js_1.buildTool)({
    name: constants_js_1.ENTER_WORKTREE_TOOL_NAME,
    searchHint: 'create an isolated git worktree and switch into it',
    maxResultSizeChars: 100000,
    async description() {
        return 'Creates an isolated worktree (via git or configured hooks) and switches the session into it';
    },
    async prompt() {
        return (0, prompt_js_1.getEnterWorktreeToolPrompt)();
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    userFacingName() {
        return 'Creating worktree';
    },
    shouldDefer: true,
    toAutoClassifierInput(input) {
        return input.name ?? '';
    },
    renderToolUseMessage: UI_js_1.renderToolUseMessage,
    renderToolResultMessage: UI_js_1.renderToolResultMessage,
    async call(input) {
        // Validate not already in a worktree created by this session
        if ((0, worktree_js_1.getCurrentWorktreeSession)()) {
            throw new Error('Already in a worktree session');
        }
        // Resolve to main repo root so worktree creation works from within a worktree
        const mainRepoRoot = (0, git_js_1.findCanonicalGitRoot)((0, cwd_js_1.getCwd)());
        if (mainRepoRoot && mainRepoRoot !== (0, cwd_js_1.getCwd)()) {
            process.chdir(mainRepoRoot);
            (0, Shell_js_1.setCwd)(mainRepoRoot);
        }
        const slug = input.name ?? (0, plans_js_1.getPlanSlug)();
        const worktreeSession = await (0, worktree_js_1.createWorktreeForSession)((0, state_js_1.getSessionId)(), slug);
        process.chdir(worktreeSession.worktreePath);
        (0, Shell_js_1.setCwd)(worktreeSession.worktreePath);
        (0, state_js_1.setOriginalCwd)((0, cwd_js_1.getCwd)());
        (0, sessionStorage_js_1.saveWorktreeState)(worktreeSession);
        // Clear cached system prompt sections so env_info_simple recomputes with worktree context
        (0, systemPromptSections_js_1.clearSystemPromptSections)();
        // Clear memoized caches that depend on CWD
        (0, claudemd_js_1.clearMemoryFileCaches)();
        plans_js_1.getPlansDirectory.cache.clear?.();
        (0, index_js_1.logEvent)('tengu_worktree_created', {
            mid_session: true,
        });
        const branchInfo = worktreeSession.worktreeBranch
            ? ` on branch ${worktreeSession.worktreeBranch}`
            : '';
        return {
            data: {
                worktreePath: worktreeSession.worktreePath,
                worktreeBranch: worktreeSession.worktreeBranch,
                message: `Created worktree at ${worktreeSession.worktreePath}${branchInfo}. The session is now working in the worktree. Use ExitWorktree to leave mid-session, or exit the session to be prompted.`,
            },
        };
    },
    mapToolResultToToolResultBlockParam({ message }, toolUseID) {
        return {
            type: 'tool_result',
            content: message,
            tool_use_id: toolUseID,
        };
    },
});
