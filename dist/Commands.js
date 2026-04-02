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
exports.BRIDGE_SAFE_COMMANDS = exports.REMOTE_SAFE_COMMANDS = exports.getSlashCommandToolSkills = exports.getSkillToolCommands = exports.builtInCommandNames = exports.INTERNAL_ONLY_COMMANDS = exports.isCommandEnabled = exports.getCommandName = void 0;
exports.meetsAvailabilityRequirement = meetsAvailabilityRequirement;
exports.getCommands = getCommands;
exports.clearCommandMemoizationCaches = clearCommandMemoizationCaches;
exports.clearCommandsCache = clearCommandsCache;
exports.getMcpSkillCommands = getMcpSkillCommands;
exports.isBridgeSafeCommand = isBridgeSafeCommand;
exports.filterCommandsForRemoteMode = filterCommandsForRemoteMode;
exports.findCommand = findCommand;
exports.hasCommand = hasCommand;
exports.getCommand = getCommand;
exports.formatDescriptionWithSource = formatDescriptionWithSource;
// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
const index_js_1 = __importDefault(require("./commands/add-dir/index.js"));
const index_js_2 = __importDefault(require("./commands/autofix-pr/index.js"));
const index_js_3 = __importDefault(require("./commands/backfill-sessions/index.js"));
const index_js_4 = __importDefault(require("./commands/btw/index.js"));
const index_js_5 = __importDefault(require("./commands/good-claude/index.js"));
const index_js_6 = __importDefault(require("./commands/issue/index.js"));
const index_js_7 = __importDefault(require("./commands/feedback/index.js"));
const index_js_8 = __importDefault(require("./commands/clear/index.js"));
const index_js_9 = __importDefault(require("./commands/color/index.js"));
const commit_js_1 = __importDefault(require("./commands/commit.js"));
const index_js_10 = __importDefault(require("./commands/copy/index.js"));
const index_js_11 = __importDefault(require("./commands/desktop/index.js"));
const commit_push_pr_js_1 = __importDefault(require("./commands/commit-push-pr.js"));
const index_js_12 = __importDefault(require("./commands/compact/index.js"));
const index_js_13 = __importDefault(require("./commands/config/index.js"));
const index_js_14 = require("./commands/context/index.js");
const index_js_15 = __importDefault(require("./commands/cost/index.js"));
const index_js_16 = __importDefault(require("./commands/diff/index.js"));
const index_js_17 = __importDefault(require("./commands/ctx_viz/index.js"));
const index_js_18 = __importDefault(require("./commands/doctor/index.js"));
const index_js_19 = __importDefault(require("./commands/memory/index.js"));
const index_js_20 = __importDefault(require("./commands/help/index.js"));
const index_js_21 = __importDefault(require("./commands/ide/index.js"));
const init_js_1 = __importDefault(require("./commands/init.js"));
const init_verifiers_js_1 = __importDefault(require("./commands/init-verifiers.js"));
const index_js_22 = __importDefault(require("./commands/keybindings/index.js"));
const index_js_23 = __importDefault(require("./commands/login/index.js"));
const index_js_24 = __importDefault(require("./commands/logout/index.js"));
const index_js_25 = __importDefault(require("./commands/install-github-app/index.js"));
const index_js_26 = __importDefault(require("./commands/install-slack-app/index.js"));
const index_js_27 = __importDefault(require("./commands/break-cache/index.js"));
const index_js_28 = __importDefault(require("./commands/mcp/index.js"));
const index_js_29 = __importDefault(require("./commands/mobile/index.js"));
const index_js_30 = __importDefault(require("./commands/onboarding/index.js"));
const index_js_31 = __importDefault(require("./commands/pr_comments/index.js"));
const index_js_32 = __importDefault(require("./commands/release-notes/index.js"));
const index_js_33 = __importDefault(require("./commands/rename/index.js"));
const index_js_34 = __importDefault(require("./commands/resume/index.js"));
const review_js_1 = __importStar(require("./commands/review.js"));
const index_js_35 = __importDefault(require("./commands/session/index.js"));
const index_js_36 = __importDefault(require("./commands/share/index.js"));
const index_js_37 = __importDefault(require("./commands/skills/index.js"));
const index_js_38 = __importDefault(require("./commands/status/index.js"));
const index_js_39 = __importDefault(require("./commands/tasks/index.js"));
const index_js_40 = __importDefault(require("./commands/teleport/index.js"));
/* eslint-disable @typescript-eslint/no-require-imports */
const agentsPlatform = process.env.USER_TYPE === 'ant'
    ? require('./commands/agents-platform/index.js').default
    : null;
/* eslint-enable @typescript-eslint/no-require-imports */
const security_review_js_1 = __importDefault(require("./commands/security-review.js"));
const index_js_41 = __importDefault(require("./commands/bughunter/index.js"));
const index_js_42 = __importDefault(require("./commands/terminalSetup/index.js"));
const index_js_43 = __importDefault(require("./commands/usage/index.js"));
const index_js_44 = __importDefault(require("./commands/theme/index.js"));
const index_js_45 = __importDefault(require("./commands/vim/index.js"));
const bun_bundle_1 = require("bun:bundle");
// Dead code elimination: conditional imports
/* eslint-disable @typescript-eslint/no-require-imports */
const proactive = (0, bun_bundle_1.feature)('PROACTIVE') || (0, bun_bundle_1.feature)('KAIROS')
    ? require('./commands/proactive.js').default
    : null;
const briefCommand = (0, bun_bundle_1.feature)('KAIROS') || (0, bun_bundle_1.feature)('KAIROS_BRIEF')
    ? require('./commands/brief.js').default
    : null;
const assistantCommand = (0, bun_bundle_1.feature)('KAIROS')
    ? require('./commands/assistant/index.js').default
    : null;
const bridge = (0, bun_bundle_1.feature)('BRIDGE_MODE')
    ? require('./commands/bridge/index.js').default
    : null;
const remoteControlServerCommand = (0, bun_bundle_1.feature)('DAEMON') && (0, bun_bundle_1.feature)('BRIDGE_MODE')
    ? require('./commands/remoteControlServer/index.js').default
    : null;
const voiceCommand = (0, bun_bundle_1.feature)('VOICE_MODE')
    ? require('./commands/voice/index.js').default
    : null;
const forceSnip = (0, bun_bundle_1.feature)('HISTORY_SNIP')
    ? require('./commands/force-snip.js').default
    : null;
const workflowsCmd = (0, bun_bundle_1.feature)('WORKFLOW_SCRIPTS')
    ? require('./commands/workflows/index.js').default
    : null;
const webCmd = (0, bun_bundle_1.feature)('CCR_REMOTE_SETUP')
    ? require('./commands/remote-setup/index.js').default
    : null;
const clearSkillIndexCache = (0, bun_bundle_1.feature)('EXPERIMENTAL_SKILL_SEARCH')
    ? require('./services/skillSearch/localSearch.js').clearSkillIndexCache
    : null;
const subscribePr = (0, bun_bundle_1.feature)('KAIROS_GITHUB_WEBHOOKS')
    ? require('./commands/subscribe-pr.js').default
    : null;
const ultraplan = (0, bun_bundle_1.feature)('ULTRAPLAN')
    ? require('./commands/ultraplan.js').default
    : null;
const torch = (0, bun_bundle_1.feature)('TORCH') ? require('./commands/torch.js').default : null;
const peersCmd = (0, bun_bundle_1.feature)('UDS_INBOX')
    ? require('./commands/peers/index.js').default
    : null;
const forkCmd = (0, bun_bundle_1.feature)('FORK_SUBAGENT')
    ? require('./commands/fork/index.js').default
    : null;
const buddy = (0, bun_bundle_1.feature)('BUDDY')
    ? require('./commands/buddy/index.js').default
    : null;
/* eslint-enable @typescript-eslint/no-require-imports */
const index_js_46 = __importDefault(require("./commands/thinkback/index.js"));
const index_js_47 = __importDefault(require("./commands/thinkback-play/index.js"));
const index_js_48 = __importDefault(require("./commands/permissions/index.js"));
const index_js_49 = __importDefault(require("./commands/plan/index.js"));
const index_js_50 = __importDefault(require("./commands/fast/index.js"));
const index_js_51 = __importDefault(require("./commands/passes/index.js"));
const index_js_52 = __importDefault(require("./commands/privacy-settings/index.js"));
const index_js_53 = __importDefault(require("./commands/hooks/index.js"));
const index_js_54 = __importDefault(require("./commands/files/index.js"));
const index_js_55 = __importDefault(require("./commands/branch/index.js"));
const index_js_56 = __importDefault(require("./commands/agents/index.js"));
const index_js_57 = __importDefault(require("./commands/plugin/index.js"));
const index_js_58 = __importDefault(require("./commands/reload-plugins/index.js"));
const index_js_59 = __importDefault(require("./commands/rewind/index.js"));
const index_js_60 = __importDefault(require("./commands/heapdump/index.js"));
const index_js_61 = __importDefault(require("./commands/mock-limits/index.js"));
const bridge_kick_js_1 = __importDefault(require("./commands/bridge-kick.js"));
const version_js_1 = __importDefault(require("./commands/version.js"));
const index_js_62 = __importDefault(require("./commands/summary/index.js"));
const index_js_63 = require("./commands/reset-limits/index.js");
const index_js_64 = __importDefault(require("./commands/ant-trace/index.js"));
const index_js_65 = __importDefault(require("./commands/perf-issue/index.js"));
const index_js_66 = __importDefault(require("./commands/sandbox-toggle/index.js"));
const index_js_67 = __importDefault(require("./commands/chrome/index.js"));
const index_js_68 = __importDefault(require("./commands/stickers/index.js"));
const advisor_js_1 = __importDefault(require("./commands/advisor.js"));
const log_js_1 = require("./utils/log.js");
const errors_js_1 = require("./utils/errors.js");
const debug_js_1 = require("./utils/debug.js");
const loadSkillsDir_js_1 = require("./skills/loadSkillsDir.js");
const bundledSkills_js_1 = require("./skills/bundledSkills.js");
const builtinPlugins_js_1 = require("./plugins/builtinPlugins.js");
const loadPluginCommands_js_1 = require("./utils/plugins/loadPluginCommands.js");
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const auth_js_1 = require("./utils/auth.js");
const providers_js_1 = require("./utils/model/providers.js");
const index_js_69 = __importDefault(require("./commands/env/index.js"));
const index_js_70 = __importDefault(require("./commands/exit/index.js"));
const index_js_71 = __importDefault(require("./commands/export/index.js"));
const index_js_72 = __importDefault(require("./commands/model/index.js"));
const index_js_73 = __importDefault(require("./commands/tag/index.js"));
const index_js_74 = __importDefault(require("./commands/output-style/index.js"));
const index_js_75 = __importDefault(require("./commands/remote-env/index.js"));
const index_js_76 = __importDefault(require("./commands/upgrade/index.js"));
const index_js_77 = require("./commands/extra-usage/index.js");
const index_js_78 = __importDefault(require("./commands/rate-limit-options/index.js"));
const statusline_js_1 = __importDefault(require("./commands/statusline.js"));
const index_js_79 = __importDefault(require("./commands/effort/index.js"));
const index_js_80 = __importDefault(require("./commands/stats/index.js"));
// insights.ts is 113KB (3200 lines, includes diffLines/html rendering). Lazy
// shim defers the heavy module until /insights is actually invoked.
const usageReport = {
    type: 'prompt',
    name: 'insights',
    description: 'Generate a report analyzing your Claude Code sessions',
    contentLength: 0,
    progressMessage: 'analyzing your sessions',
    source: 'builtin',
    async getPromptForCommand(args, context) {
        const real = (await Promise.resolve().then(() => __importStar(require('./commands/insights.js')))).default;
        if (real.type !== 'prompt')
            throw new Error('unreachable');
        return real.getPromptForCommand(args, context);
    },
};
const index_js_81 = __importDefault(require("./commands/oauth-refresh/index.js"));
const index_js_82 = __importDefault(require("./commands/debug-tool-call/index.js"));
const constants_js_1 = require("./utils/settings/constants.js");
const command_js_1 = require("./types/command.js");
var command_js_2 = require("./types/command.js");
Object.defineProperty(exports, "getCommandName", { enumerable: true, get: function () { return command_js_2.getCommandName; } });
Object.defineProperty(exports, "isCommandEnabled", { enumerable: true, get: function () { return command_js_2.isCommandEnabled; } });
// Commands that get eliminated from the external build
exports.INTERNAL_ONLY_COMMANDS = [
    index_js_3.default,
    index_js_27.default,
    index_js_41.default,
    commit_js_1.default,
    commit_push_pr_js_1.default,
    index_js_17.default,
    index_js_5.default,
    index_js_6.default,
    init_verifiers_js_1.default,
    ...(forceSnip ? [forceSnip] : []),
    index_js_61.default,
    bridge_kick_js_1.default,
    version_js_1.default,
    ...(ultraplan ? [ultraplan] : []),
    ...(subscribePr ? [subscribePr] : []),
    index_js_63.resetLimits,
    index_js_63.resetLimitsNonInteractive,
    index_js_30.default,
    index_js_36.default,
    index_js_62.default,
    index_js_40.default,
    index_js_64.default,
    index_js_65.default,
    index_js_69.default,
    index_js_81.default,
    index_js_82.default,
    agentsPlatform,
    index_js_2.default,
].filter(Boolean);
// Declared as a function so that we don't run this until getCommands is called,
// since underlying functions read from config, which can't be read at module initialization time
const COMMANDS = (0, memoize_js_1.default)(() => [
    index_js_1.default,
    advisor_js_1.default,
    index_js_56.default,
    index_js_55.default,
    index_js_4.default,
    index_js_67.default,
    index_js_8.default,
    index_js_9.default,
    index_js_12.default,
    index_js_13.default,
    index_js_10.default,
    index_js_11.default,
    index_js_14.context,
    index_js_14.contextNonInteractive,
    index_js_15.default,
    index_js_16.default,
    index_js_18.default,
    index_js_79.default,
    index_js_70.default,
    index_js_50.default,
    index_js_54.default,
    index_js_60.default,
    index_js_20.default,
    index_js_21.default,
    init_js_1.default,
    index_js_22.default,
    index_js_25.default,
    index_js_26.default,
    index_js_28.default,
    index_js_19.default,
    index_js_29.default,
    index_js_72.default,
    index_js_74.default,
    index_js_75.default,
    index_js_57.default,
    index_js_31.default,
    index_js_32.default,
    index_js_58.default,
    index_js_33.default,
    index_js_34.default,
    index_js_35.default,
    index_js_37.default,
    index_js_80.default,
    index_js_38.default,
    statusline_js_1.default,
    index_js_68.default,
    index_js_73.default,
    index_js_44.default,
    index_js_7.default,
    review_js_1.default,
    review_js_1.ultrareview,
    index_js_59.default,
    security_review_js_1.default,
    index_js_42.default,
    index_js_76.default,
    index_js_77.extraUsage,
    index_js_77.extraUsageNonInteractive,
    index_js_78.default,
    index_js_43.default,
    usageReport,
    index_js_45.default,
    ...(webCmd ? [webCmd] : []),
    ...(forkCmd ? [forkCmd] : []),
    ...(buddy ? [buddy] : []),
    ...(proactive ? [proactive] : []),
    ...(briefCommand ? [briefCommand] : []),
    ...(assistantCommand ? [assistantCommand] : []),
    ...(bridge ? [bridge] : []),
    ...(remoteControlServerCommand ? [remoteControlServerCommand] : []),
    ...(voiceCommand ? [voiceCommand] : []),
    index_js_46.default,
    index_js_47.default,
    index_js_48.default,
    index_js_49.default,
    index_js_52.default,
    index_js_53.default,
    index_js_71.default,
    index_js_66.default,
    ...(!(0, auth_js_1.isUsing3PServices)() ? [index_js_24.default, (0, index_js_23.default)()] : []),
    index_js_51.default,
    ...(peersCmd ? [peersCmd] : []),
    index_js_39.default,
    ...(workflowsCmd ? [workflowsCmd] : []),
    ...(torch ? [torch] : []),
    ...(process.env.USER_TYPE === 'ant' && !process.env.IS_DEMO
        ? exports.INTERNAL_ONLY_COMMANDS
        : []),
]);
exports.builtInCommandNames = (0, memoize_js_1.default)(() => new Set(COMMANDS().flatMap(_ => [_.name, ...(_.aliases ?? [])])));
async function getSkills(cwd) {
    try {
        const [skillDirCommands, pluginSkills] = await Promise.all([
            (0, loadSkillsDir_js_1.getSkillDirCommands)(cwd).catch(err => {
                (0, log_js_1.logError)((0, errors_js_1.toError)(err));
                (0, debug_js_1.logForDebugging)('Skill directory commands failed to load, continuing without them');
                return [];
            }),
            (0, loadPluginCommands_js_1.getPluginSkills)().catch(err => {
                (0, log_js_1.logError)((0, errors_js_1.toError)(err));
                (0, debug_js_1.logForDebugging)('Plugin skills failed to load, continuing without them');
                return [];
            }),
        ]);
        // Bundled skills are registered synchronously at startup
        const bundledSkills = (0, bundledSkills_js_1.getBundledSkills)();
        // Built-in plugin skills come from enabled built-in plugins
        const builtinPluginSkills = (0, builtinPlugins_js_1.getBuiltinPluginSkillCommands)();
        (0, debug_js_1.logForDebugging)(`getSkills returning: ${skillDirCommands.length} skill dir commands, ${pluginSkills.length} plugin skills, ${bundledSkills.length} bundled skills, ${builtinPluginSkills.length} builtin plugin skills`);
        return {
            skillDirCommands,
            pluginSkills,
            bundledSkills,
            builtinPluginSkills,
        };
    }
    catch (err) {
        // This should never happen since we catch at the Promise level, but defensive
        (0, log_js_1.logError)((0, errors_js_1.toError)(err));
        (0, debug_js_1.logForDebugging)('Unexpected error in getSkills, returning empty');
        return {
            skillDirCommands: [],
            pluginSkills: [],
            bundledSkills: [],
            builtinPluginSkills: [],
        };
    }
}
/* eslint-disable @typescript-eslint/no-require-imports */
const getWorkflowCommands = (0, bun_bundle_1.feature)('WORKFLOW_SCRIPTS')
    ? require('./tools/WorkflowTool/createWorkflowCommand.js').getWorkflowCommands
    : null;
/* eslint-enable @typescript-eslint/no-require-imports */
/**
 * Filters commands by their declared `availability` (auth/provider requirement).
 * Commands without `availability` are treated as universal.
 * This runs before `isEnabled()` so that provider-gated commands are hidden
 * regardless of feature-flag state.
 *
 * Not memoized — auth state can change mid-session (e.g. after /login),
 * so this must be re-evaluated on every getCommands() call.
 */
function meetsAvailabilityRequirement(cmd) {
    if (!cmd.availability)
        return true;
    for (const a of cmd.availability) {
        switch (a) {
            case 'claude-ai':
                if ((0, auth_js_1.isClaudeAISubscriber)())
                    return true;
                break;
            case 'console':
                // Console API key user = direct 1P API customer (not 3P, not claude.ai).
                // Excludes 3P (Bedrock/Vertex/Foundry) who don't set ANTHROPIC_BASE_URL
                // and gateway users who proxy through a custom base URL.
                if (!(0, auth_js_1.isClaudeAISubscriber)() &&
                    !(0, auth_js_1.isUsing3PServices)() &&
                    (0, providers_js_1.isFirstPartyAnthropicBaseUrl)())
                    return true;
                break;
            default: {
                const _exhaustive = a;
                void _exhaustive;
                break;
            }
        }
    }
    return false;
}
/**
 * Loads all command sources (skills, plugins, workflows). Memoized by cwd
 * because loading is expensive (disk I/O, dynamic imports).
 */
const loadAllCommands = (0, memoize_js_1.default)(async (cwd) => {
    const [{ skillDirCommands, pluginSkills, bundledSkills, builtinPluginSkills }, pluginCommands, workflowCommands,] = await Promise.all([
        getSkills(cwd),
        (0, loadPluginCommands_js_1.getPluginCommands)(),
        getWorkflowCommands ? getWorkflowCommands(cwd) : Promise.resolve([]),
    ]);
    return [
        ...bundledSkills,
        ...builtinPluginSkills,
        ...skillDirCommands,
        ...workflowCommands,
        ...pluginCommands,
        ...pluginSkills,
        ...COMMANDS(),
    ];
});
/**
 * Returns commands available to the current user. The expensive loading is
 * memoized, but availability and isEnabled checks run fresh every call so
 * auth changes (e.g. /login) take effect immediately.
 */
async function getCommands(cwd) {
    const allCommands = await loadAllCommands(cwd);
    // Get dynamic skills discovered during file operations
    const dynamicSkills = (0, loadSkillsDir_js_1.getDynamicSkills)();
    // Build base commands without dynamic skills
    const baseCommands = allCommands.filter(_ => meetsAvailabilityRequirement(_) && (0, command_js_1.isCommandEnabled)(_));
    if (dynamicSkills.length === 0) {
        return baseCommands;
    }
    // Dedupe dynamic skills - only add if not already present
    const baseCommandNames = new Set(baseCommands.map(c => c.name));
    const uniqueDynamicSkills = dynamicSkills.filter(s => !baseCommandNames.has(s.name) &&
        meetsAvailabilityRequirement(s) &&
        (0, command_js_1.isCommandEnabled)(s));
    if (uniqueDynamicSkills.length === 0) {
        return baseCommands;
    }
    // Insert dynamic skills after plugin skills but before built-in commands
    const builtInNames = new Set(COMMANDS().map(c => c.name));
    const insertIndex = baseCommands.findIndex(c => builtInNames.has(c.name));
    if (insertIndex === -1) {
        return [...baseCommands, ...uniqueDynamicSkills];
    }
    return [
        ...baseCommands.slice(0, insertIndex),
        ...uniqueDynamicSkills,
        ...baseCommands.slice(insertIndex),
    ];
}
/**
 * Clears only the memoization caches for commands, WITHOUT clearing skill caches.
 * Use this when dynamic skills are added to invalidate cached command lists.
 */
function clearCommandMemoizationCaches() {
    loadAllCommands.cache?.clear?.();
    exports.getSkillToolCommands.cache?.clear?.();
    exports.getSlashCommandToolSkills.cache?.clear?.();
    // getSkillIndex in skillSearch/localSearch.ts is a separate memoization layer
    // built ON TOP of getSkillToolCommands/getCommands. Clearing only the inner
    // caches is a no-op for the outer — lodash memoize returns the cached result
    // without ever reaching the cleared inners. Must clear it explicitly.
    clearSkillIndexCache?.();
}
function clearCommandsCache() {
    clearCommandMemoizationCaches();
    (0, loadPluginCommands_js_1.clearPluginCommandCache)();
    (0, loadPluginCommands_js_1.clearPluginSkillsCache)();
    (0, loadSkillsDir_js_1.clearSkillCaches)();
}
/**
 * Filter AppState.mcp.commands to MCP-provided skills (prompt-type,
 * model-invocable, loaded from MCP). These live outside getCommands() so
 * callers that need MCP skills in their skill index thread them through
 * separately.
 */
function getMcpSkillCommands(mcpCommands) {
    if ((0, bun_bundle_1.feature)('MCP_SKILLS')) {
        return mcpCommands.filter(cmd => cmd.type === 'prompt' &&
            cmd.loadedFrom === 'mcp' &&
            !cmd.disableModelInvocation);
    }
    return [];
}
// SkillTool shows ALL prompt-based commands that the model can invoke
// This includes both skills (from /skills/) and commands (from /commands/)
exports.getSkillToolCommands = (0, memoize_js_1.default)(async (cwd) => {
    const allCommands = await getCommands(cwd);
    return allCommands.filter(cmd => cmd.type === 'prompt' &&
        !cmd.disableModelInvocation &&
        cmd.source !== 'builtin' &&
        // Always include skills from /skills/ dirs, bundled skills, and legacy /commands/ entries
        // (they all get an auto-derived description from the first line if frontmatter is missing).
        // Plugin/MCP commands still require an explicit description to appear in the listing.
        (cmd.loadedFrom === 'bundled' ||
            cmd.loadedFrom === 'skills' ||
            cmd.loadedFrom === 'commands_DEPRECATED' ||
            cmd.hasUserSpecifiedDescription ||
            cmd.whenToUse));
});
// Filters commands to include only skills. Skills are commands that provide
// specialized capabilities for the model to use. They are identified by
// loadedFrom being 'skills', 'plugin', or 'bundled', or having disableModelInvocation set.
exports.getSlashCommandToolSkills = (0, memoize_js_1.default)(async (cwd) => {
    try {
        const allCommands = await getCommands(cwd);
        return allCommands.filter(cmd => cmd.type === 'prompt' &&
            cmd.source !== 'builtin' &&
            (cmd.hasUserSpecifiedDescription || cmd.whenToUse) &&
            (cmd.loadedFrom === 'skills' ||
                cmd.loadedFrom === 'plugin' ||
                cmd.loadedFrom === 'bundled' ||
                cmd.disableModelInvocation));
    }
    catch (error) {
        (0, log_js_1.logError)((0, errors_js_1.toError)(error));
        // Return empty array rather than throwing - skills are non-critical
        // This prevents skill loading failures from breaking the entire system
        (0, debug_js_1.logForDebugging)('Returning empty skills array due to load failure');
        return [];
    }
});
/**
 * Commands that are safe to use in remote mode (--remote).
 * These only affect local TUI state and don't depend on local filesystem,
 * git, shell, IDE, MCP, or other local execution context.
 *
 * Used in two places:
 * 1. Pre-filtering commands in main.tsx before REPL renders (prevents race with CCR init)
 * 2. Preserving local-only commands in REPL's handleRemoteInit after CCR filters
 */
exports.REMOTE_SAFE_COMMANDS = new Set([
    index_js_35.default, // Shows QR code / URL for remote session
    index_js_70.default, // Exit the TUI
    index_js_8.default, // Clear screen
    index_js_20.default, // Show help
    index_js_44.default, // Change terminal theme
    index_js_9.default, // Change agent color
    index_js_45.default, // Toggle vim mode
    index_js_15.default, // Show session cost (local cost tracking)
    index_js_43.default, // Show usage info
    index_js_10.default, // Copy last message
    index_js_4.default, // Quick note
    index_js_7.default, // Send feedback
    index_js_49.default, // Plan mode toggle
    index_js_22.default, // Keybinding management
    statusline_js_1.default, // Status line toggle
    index_js_68.default, // Stickers
    index_js_29.default, // Mobile QR code
]);
/**
 * Builtin commands of type 'local' that ARE safe to execute when received
 * over the Remote Control bridge. These produce text output that streams
 * back to the mobile/web client and have no terminal-only side effects.
 *
 * 'local-jsx' commands are blocked by type (they render Ink UI) and
 * 'prompt' commands are allowed by type (they expand to text sent to the
 * model) — this set only gates 'local' commands.
 *
 * When adding a new 'local' command that should work from mobile, add it
 * here. Default is blocked.
 */
exports.BRIDGE_SAFE_COMMANDS = new Set([
    index_js_12.default, // Shrink context — useful mid-session from a phone
    index_js_8.default, // Wipe transcript
    index_js_15.default, // Show session cost
    index_js_62.default, // Summarize conversation
    index_js_32.default, // Show changelog
    index_js_54.default, // List tracked files
].filter((c) => c !== null));
/**
 * Whether a slash command is safe to execute when its input arrived over the
 * Remote Control bridge (mobile/web client).
 *
 * PR #19134 blanket-blocked all slash commands from bridge inbound because
 * `/model` from iOS was popping the local Ink picker. This predicate relaxes
 * that with an explicit allowlist: 'prompt' commands (skills) expand to text
 * and are safe by construction; 'local' commands need an explicit opt-in via
 * BRIDGE_SAFE_COMMANDS; 'local-jsx' commands render Ink UI and stay blocked.
 */
function isBridgeSafeCommand(cmd) {
    if (cmd.type === 'local-jsx')
        return false;
    if (cmd.type === 'prompt')
        return true;
    return exports.BRIDGE_SAFE_COMMANDS.has(cmd);
}
/**
 * Filter commands to only include those safe for remote mode.
 * Used to pre-filter commands when rendering the REPL in --remote mode,
 * preventing local-only commands from being briefly available before
 * the CCR init message arrives.
 */
function filterCommandsForRemoteMode(commands) {
    return commands.filter(cmd => exports.REMOTE_SAFE_COMMANDS.has(cmd));
}
function findCommand(commandName, commands) {
    return commands.find(_ => _.name === commandName ||
        (0, command_js_1.getCommandName)(_) === commandName ||
        _.aliases?.includes(commandName));
}
function hasCommand(commandName, commands) {
    return findCommand(commandName, commands) !== undefined;
}
function getCommand(commandName, commands) {
    const command = findCommand(commandName, commands);
    if (!command) {
        throw ReferenceError(`Command ${commandName} not found. Available commands: ${commands
            .map(_ => {
            const name = (0, command_js_1.getCommandName)(_);
            return _.aliases ? `${name} (aliases: ${_.aliases.join(', ')})` : name;
        })
            .sort((a, b) => a.localeCompare(b))
            .join(', ')}`);
    }
    return command;
}
/**
 * Formats a command's description with its source annotation for user-facing UI.
 * Use this in typeahead, help screens, and other places where users need to see
 * where a command comes from.
 *
 * For model-facing prompts (like SkillTool), use cmd.description directly.
 */
function formatDescriptionWithSource(cmd) {
    if (cmd.type !== 'prompt') {
        return cmd.description;
    }
    if (cmd.kind === 'workflow') {
        return `${cmd.description} (workflow)`;
    }
    if (cmd.source === 'plugin') {
        const pluginName = cmd.pluginInfo?.pluginManifest.name;
        if (pluginName) {
            return `(${pluginName}) ${cmd.description}`;
        }
        return `${cmd.description} (plugin)`;
    }
    if (cmd.source === 'builtin' || cmd.source === 'mcp') {
        return cmd.description;
    }
    if (cmd.source === 'bundled') {
        return `${cmd.description} (bundled)`;
    }
    return `${cmd.description} (${(0, constants_js_1.getSettingSourceName)(cmd.source)})`;
}
