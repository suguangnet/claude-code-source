"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRelevantTips = getRelevantTips;
const chalk_1 = __importDefault(require("chalk"));
const debug_js_1 = require("src/utils/debug.js");
const fileHistory_js_1 = require("src/utils/fileHistory.js");
const settings_js_1 = require("src/utils/settings/settings.js");
const terminalSetup_js_1 = require("../../commands/terminalSetup/terminalSetup.js");
const DesktopUpsellStartup_js_1 = require("../../components/DesktopUpsell/DesktopUpsellStartup.js");
const color_js_1 = require("../../components/design-system/color.js");
const OverageCreditUpsell_js_1 = require("../../components/LogoV2/OverageCreditUpsell.js");
const shortcutFormat_js_1 = require("../../keybindings/shortcutFormat.js");
const prompt_js_1 = require("../../tools/ScheduleCronTool/prompt.js");
const auth_js_1 = require("../../utils/auth.js");
const concurrentSessions_js_1 = require("../../utils/concurrentSessions.js");
const config_js_1 = require("../../utils/config.js");
const effort_js_1 = require("../../utils/effort.js");
const env_js_1 = require("../../utils/env.js");
const fileStateCache_js_1 = require("../../utils/fileStateCache.js");
const git_js_1 = require("../../utils/git.js");
const ide_js_1 = require("../../utils/ide.js");
const model_js_1 = require("../../utils/model/model.js");
const platform_js_1 = require("../../utils/platform.js");
const installedPluginsManager_js_1 = require("../../utils/plugins/installedPluginsManager.js");
const marketplaceManager_js_1 = require("../../utils/plugins/marketplaceManager.js");
const officialMarketplace_js_1 = require("../../utils/plugins/officialMarketplace.js");
const sessionStorage_js_1 = require("../../utils/sessionStorage.js");
const growthbook_js_1 = require("../analytics/growthbook.js");
const overageCreditGrant_js_1 = require("../api/overageCreditGrant.js");
const referral_js_1 = require("../api/referral.js");
const tipHistory_js_1 = require("./tipHistory.js");
let _isOfficialMarketplaceInstalledCache;
async function isOfficialMarketplaceInstalled() {
    if (_isOfficialMarketplaceInstalledCache !== undefined) {
        return _isOfficialMarketplaceInstalledCache;
    }
    const config = await (0, marketplaceManager_js_1.loadKnownMarketplacesConfigSafe)();
    _isOfficialMarketplaceInstalledCache = officialMarketplace_js_1.OFFICIAL_MARKETPLACE_NAME in config;
    return _isOfficialMarketplaceInstalledCache;
}
async function isMarketplacePluginRelevant(pluginName, context, signals) {
    if (!(await isOfficialMarketplaceInstalled())) {
        return false;
    }
    if ((0, installedPluginsManager_js_1.isPluginInstalled)(`${pluginName}@${officialMarketplace_js_1.OFFICIAL_MARKETPLACE_NAME}`)) {
        return false;
    }
    const { bashTools } = context ?? {};
    if (signals.cli && bashTools?.size) {
        if (signals.cli.some(cmd => bashTools.has(cmd))) {
            return true;
        }
    }
    if (signals.filePath && context?.readFileState) {
        const readFiles = (0, fileStateCache_js_1.cacheKeys)(context.readFileState);
        if (readFiles.some(fp => signals.filePath.test(fp))) {
            return true;
        }
    }
    return false;
}
const externalTips = [
    {
        id: 'new-user-warmup',
        content: async () => `Start with small features or bug fixes, tell Claude to propose a plan, and verify its suggested edits`,
        cooldownSessions: 3,
        async isRelevant() {
            const config = (0, config_js_1.getGlobalConfig)();
            return config.numStartups < 10;
        },
    },
    {
        id: 'plan-mode-for-complex-tasks',
        content: async () => `Use Plan Mode to prepare for a complex request before making changes. Press ${(0, shortcutFormat_js_1.getShortcutDisplay)('chat:cycleMode', 'Chat', 'shift+tab')} twice to enable.`,
        cooldownSessions: 5,
        isRelevant: async () => {
            if (process.env.USER_TYPE === 'ant')
                return false;
            const config = (0, config_js_1.getGlobalConfig)();
            // Show to users who haven't used plan mode recently (7+ days)
            const daysSinceLastUse = config.lastPlanModeUse
                ? (Date.now() - config.lastPlanModeUse) / (1000 * 60 * 60 * 24)
                : Infinity;
            return daysSinceLastUse > 7;
        },
    },
    {
        id: 'default-permission-mode-config',
        content: async () => `Use /config to change your default permission mode (including Plan Mode)`,
        cooldownSessions: 10,
        isRelevant: async () => {
            try {
                const config = (0, config_js_1.getGlobalConfig)();
                const settings = (0, settings_js_1.getSettings_DEPRECATED)();
                // Show if they've used plan mode but haven't set a default
                const hasUsedPlanMode = Boolean(config.lastPlanModeUse);
                const hasDefaultMode = Boolean(settings?.permissions?.defaultMode);
                return hasUsedPlanMode && !hasDefaultMode;
            }
            catch (error) {
                (0, debug_js_1.logForDebugging)(`Failed to check default-permission-mode-config tip relevance: ${error}`, { level: 'warn' });
                return false;
            }
        },
    },
    {
        id: 'git-worktrees',
        content: async () => 'Use git worktrees to run multiple Claude sessions in parallel.',
        cooldownSessions: 10,
        isRelevant: async () => {
            try {
                const config = (0, config_js_1.getGlobalConfig)();
                const worktreeCount = await (0, git_js_1.getWorktreeCount)();
                return worktreeCount <= 1 && config.numStartups > 50;
            }
            catch (_) {
                return false;
            }
        },
    },
    {
        id: 'color-when-multi-clauding',
        content: async () => 'Running multiple Claude sessions? Use /color and /rename to tell them apart at a glance.',
        cooldownSessions: 10,
        isRelevant: async () => {
            if ((0, sessionStorage_js_1.getCurrentSessionAgentColor)())
                return false;
            const count = await (0, concurrentSessions_js_1.countConcurrentSessions)();
            return count >= 2;
        },
    },
    {
        id: 'terminal-setup',
        content: async () => env_js_1.env.terminal === 'Apple_Terminal'
            ? 'Run /terminal-setup to enable convenient terminal integration like Option + Enter for new line and more'
            : 'Run /terminal-setup to enable convenient terminal integration like Shift + Enter for new line and more',
        cooldownSessions: 10,
        async isRelevant() {
            const config = (0, config_js_1.getGlobalConfig)();
            if (env_js_1.env.terminal === 'Apple_Terminal') {
                return !config.optionAsMetaKeyInstalled;
            }
            return !config.shiftEnterKeyBindingInstalled;
        },
    },
    {
        id: 'shift-enter',
        content: async () => env_js_1.env.terminal === 'Apple_Terminal'
            ? 'Press Option+Enter to send a multi-line message'
            : 'Press Shift+Enter to send a multi-line message',
        cooldownSessions: 10,
        async isRelevant() {
            const config = (0, config_js_1.getGlobalConfig)();
            return Boolean((env_js_1.env.terminal === 'Apple_Terminal'
                ? config.optionAsMetaKeyInstalled
                : config.shiftEnterKeyBindingInstalled) && config.numStartups > 3);
        },
    },
    {
        id: 'shift-enter-setup',
        content: async () => env_js_1.env.terminal === 'Apple_Terminal'
            ? 'Run /terminal-setup to enable Option+Enter for new lines'
            : 'Run /terminal-setup to enable Shift+Enter for new lines',
        cooldownSessions: 10,
        async isRelevant() {
            if (!(0, terminalSetup_js_1.shouldOfferTerminalSetup)()) {
                return false;
            }
            const config = (0, config_js_1.getGlobalConfig)();
            return !(env_js_1.env.terminal === 'Apple_Terminal'
                ? config.optionAsMetaKeyInstalled
                : config.shiftEnterKeyBindingInstalled);
        },
    },
    {
        id: 'memory-command',
        content: async () => 'Use /memory to view and manage Claude memory',
        cooldownSessions: 15,
        async isRelevant() {
            const config = (0, config_js_1.getGlobalConfig)();
            return config.memoryUsageCount <= 0;
        },
    },
    {
        id: 'theme-command',
        content: async () => 'Use /theme to change the color theme',
        cooldownSessions: 20,
        isRelevant: async () => true,
    },
    {
        id: 'colorterm-truecolor',
        content: async () => 'Try setting environment variable COLORTERM=truecolor for richer colors',
        cooldownSessions: 30,
        isRelevant: async () => !process.env.COLORTERM && chalk_1.default.level < 3,
    },
    {
        id: 'powershell-tool-env',
        content: async () => 'Set CLAUDE_CODE_USE_POWERSHELL_TOOL=1 to enable the PowerShell tool (preview)',
        cooldownSessions: 10,
        isRelevant: async () => (0, platform_js_1.getPlatform)() === 'windows' &&
            process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL === undefined,
    },
    {
        id: 'status-line',
        content: async () => 'Use /statusline to set up a custom status line that will display beneath the input box',
        cooldownSessions: 25,
        isRelevant: async () => (0, settings_js_1.getSettings_DEPRECATED)().statusLine === undefined,
    },
    {
        id: 'prompt-queue',
        content: async () => 'Hit Enter to queue up additional messages while Claude is working.',
        cooldownSessions: 5,
        async isRelevant() {
            const config = (0, config_js_1.getGlobalConfig)();
            return config.promptQueueUseCount <= 3;
        },
    },
    {
        id: 'enter-to-steer-in-relatime',
        content: async () => 'Send messages to Claude while it works to steer Claude in real-time',
        cooldownSessions: 20,
        isRelevant: async () => true,
    },
    {
        id: 'todo-list',
        content: async () => 'Ask Claude to create a todo list when working on complex tasks to track progress and remain on track',
        cooldownSessions: 20,
        isRelevant: async () => true,
    },
    {
        id: 'vscode-command-install',
        content: async () => `Open the Command Palette (Cmd+Shift+P) and run "Shell Command: Install '${env_js_1.env.terminal === 'vscode' ? 'code' : env_js_1.env.terminal}' command in PATH" to enable IDE integration`,
        cooldownSessions: 0,
        async isRelevant() {
            // Only show this tip if we're in a VS Code-style terminal
            if (!(0, ide_js_1.isSupportedVSCodeTerminal)()) {
                return false;
            }
            if ((0, platform_js_1.getPlatform)() !== 'macos') {
                return false;
            }
            // Check if the relevant command is available
            switch (env_js_1.env.terminal) {
                case 'vscode':
                    return !(await (0, ide_js_1.isVSCodeInstalled)());
                case 'cursor':
                    return !(await (0, ide_js_1.isCursorInstalled)());
                case 'windsurf':
                    return !(await (0, ide_js_1.isWindsurfInstalled)());
                default:
                    return false;
            }
        },
    },
    {
        id: 'ide-upsell-external-terminal',
        content: async () => 'Connect Claude to your IDE · /ide',
        cooldownSessions: 4,
        async isRelevant() {
            if ((0, ide_js_1.isSupportedTerminal)()) {
                return false;
            }
            // Use lockfiles as a (quicker) signal for running IDEs
            const lockfiles = await (0, ide_js_1.getSortedIdeLockfiles)();
            if (lockfiles.length !== 0) {
                return false;
            }
            const runningIDEs = await (0, ide_js_1.detectRunningIDEsCached)();
            return runningIDEs.length > 0;
        },
    },
    {
        id: 'install-github-app',
        content: async () => 'Run /install-github-app to tag @claude right from your Github issues and PRs',
        cooldownSessions: 10,
        isRelevant: async () => !(0, config_js_1.getGlobalConfig)().githubActionSetupCount,
    },
    {
        id: 'install-slack-app',
        content: async () => 'Run /install-slack-app to use Claude in Slack',
        cooldownSessions: 10,
        isRelevant: async () => !(0, config_js_1.getGlobalConfig)().slackAppInstallCount,
    },
    {
        id: 'permissions',
        content: async () => 'Use /permissions to pre-approve and pre-deny bash, edit, and MCP tools',
        cooldownSessions: 10,
        async isRelevant() {
            const config = (0, config_js_1.getGlobalConfig)();
            return config.numStartups > 10;
        },
    },
    {
        id: 'drag-and-drop-images',
        content: async () => 'Did you know you can drag and drop image files into your terminal?',
        cooldownSessions: 10,
        isRelevant: async () => !env_js_1.env.isSSH(),
    },
    {
        id: 'paste-images-mac',
        content: async () => 'Paste images into Claude Code using control+v (not cmd+v!)',
        cooldownSessions: 10,
        isRelevant: async () => (0, platform_js_1.getPlatform)() === 'macos',
    },
    {
        id: 'double-esc',
        content: async () => 'Double-tap esc to rewind the conversation to a previous point in time',
        cooldownSessions: 10,
        isRelevant: async () => !(0, fileHistory_js_1.fileHistoryEnabled)(),
    },
    {
        id: 'double-esc-code-restore',
        content: async () => 'Double-tap esc to rewind the code and/or conversation to a previous point in time',
        cooldownSessions: 10,
        isRelevant: async () => (0, fileHistory_js_1.fileHistoryEnabled)(),
    },
    {
        id: 'continue',
        content: async () => 'Run claude --continue or claude --resume to resume a conversation',
        cooldownSessions: 10,
        isRelevant: async () => true,
    },
    {
        id: 'rename-conversation',
        content: async () => 'Name your conversations with /rename to find them easily in /resume later',
        cooldownSessions: 15,
        isRelevant: async () => (0, sessionStorage_js_1.isCustomTitleEnabled)() && (0, config_js_1.getGlobalConfig)().numStartups > 10,
    },
    {
        id: 'custom-commands',
        content: async () => 'Create skills by adding .md files to .claude/skills/ in your project or ~/.claude/skills/ for skills that work in any project',
        cooldownSessions: 15,
        async isRelevant() {
            const config = (0, config_js_1.getGlobalConfig)();
            return config.numStartups > 10;
        },
    },
    {
        id: 'shift-tab',
        content: async () => process.env.USER_TYPE === 'ant'
            ? `Hit ${(0, shortcutFormat_js_1.getShortcutDisplay)('chat:cycleMode', 'Chat', 'shift+tab')} to cycle between default mode and auto mode`
            : `Hit ${(0, shortcutFormat_js_1.getShortcutDisplay)('chat:cycleMode', 'Chat', 'shift+tab')} to cycle between default mode, auto-accept edit mode, and plan mode`,
        cooldownSessions: 10,
        isRelevant: async () => true,
    },
    {
        id: 'image-paste',
        content: async () => `Use ${(0, shortcutFormat_js_1.getShortcutDisplay)('chat:imagePaste', 'Chat', 'ctrl+v')} to paste images from your clipboard`,
        cooldownSessions: 20,
        isRelevant: async () => true,
    },
    {
        id: 'custom-agents',
        content: async () => 'Use /agents to optimize specific tasks. Eg. Software Architect, Code Writer, Code Reviewer',
        cooldownSessions: 15,
        async isRelevant() {
            const config = (0, config_js_1.getGlobalConfig)();
            return config.numStartups > 5;
        },
    },
    {
        id: 'agent-flag',
        content: async () => 'Use --agent <agent_name> to directly start a conversation with a subagent',
        cooldownSessions: 15,
        async isRelevant() {
            const config = (0, config_js_1.getGlobalConfig)();
            return config.numStartups > 5;
        },
    },
    {
        id: 'desktop-app',
        content: async () => 'Run Claude Code locally or remotely using the Claude desktop app: clau.de/desktop',
        cooldownSessions: 15,
        isRelevant: async () => (0, platform_js_1.getPlatform)() !== 'linux',
    },
    {
        id: 'desktop-shortcut',
        content: async (ctx) => {
            const blue = (0, color_js_1.color)('suggestion', ctx.theme);
            return `Continue your session in Claude Code Desktop with ${blue('/desktop')}`;
        },
        cooldownSessions: 15,
        isRelevant: async () => {
            if (!(0, DesktopUpsellStartup_js_1.getDesktopUpsellConfig)().enable_shortcut_tip)
                return false;
            return (process.platform === 'darwin' ||
                (process.platform === 'win32' && process.arch === 'x64'));
        },
    },
    {
        id: 'web-app',
        content: async () => 'Run tasks in the cloud while you keep coding locally · clau.de/web',
        cooldownSessions: 15,
        isRelevant: async () => true,
    },
    {
        id: 'mobile-app',
        content: async () => '/mobile to use Claude Code from the Claude app on your phone',
        cooldownSessions: 15,
        isRelevant: async () => true,
    },
    {
        id: 'opusplan-mode-reminder',
        content: async () => `Your default model setting is Opus Plan Mode. Press ${(0, shortcutFormat_js_1.getShortcutDisplay)('chat:cycleMode', 'Chat', 'shift+tab')} twice to activate Plan Mode and plan with Claude Opus.`,
        cooldownSessions: 2,
        async isRelevant() {
            if (process.env.USER_TYPE === 'ant')
                return false;
            const config = (0, config_js_1.getGlobalConfig)();
            const modelSetting = (0, model_js_1.getUserSpecifiedModelSetting)();
            const hasOpusPlanMode = modelSetting === 'opusplan';
            // Show reminder if they have Opus Plan Mode and haven't used plan mode recently (3+ days)
            const daysSinceLastUse = config.lastPlanModeUse
                ? (Date.now() - config.lastPlanModeUse) / (1000 * 60 * 60 * 24)
                : Infinity;
            return hasOpusPlanMode && daysSinceLastUse > 3;
        },
    },
    {
        id: 'frontend-design-plugin',
        content: async (ctx) => {
            const blue = (0, color_js_1.color)('suggestion', ctx.theme);
            return `Working with HTML/CSS? Install the frontend-design plugin:\n${blue(`/plugin install frontend-design@${officialMarketplace_js_1.OFFICIAL_MARKETPLACE_NAME}`)}`;
        },
        cooldownSessions: 3,
        isRelevant: async (context) => isMarketplacePluginRelevant('frontend-design', context, {
            filePath: /\.(html|css|htm)$/i,
        }),
    },
    {
        id: 'vercel-plugin',
        content: async (ctx) => {
            const blue = (0, color_js_1.color)('suggestion', ctx.theme);
            return `Working with Vercel? Install the vercel plugin:\n${blue(`/plugin install vercel@${officialMarketplace_js_1.OFFICIAL_MARKETPLACE_NAME}`)}`;
        },
        cooldownSessions: 3,
        isRelevant: async (context) => isMarketplacePluginRelevant('vercel', context, {
            filePath: /(?:^|[/\\])vercel\.json$/i,
            cli: ['vercel'],
        }),
    },
    {
        id: 'effort-high-nudge',
        content: async (ctx) => {
            const blue = (0, color_js_1.color)('suggestion', ctx.theme);
            const cmd = blue('/effort high');
            const variant = (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_tide_elm', 'off');
            return variant === 'copy_b'
                ? `Use ${cmd} for better one-shot answers. Claude thinks it through first.`
                : `Working on something tricky? ${cmd} gives better first answers`;
        },
        cooldownSessions: 3,
        isRelevant: async () => {
            if (!(0, auth_js_1.is1PApiCustomer)())
                return false;
            if (!(0, effort_js_1.modelSupportsEffort)((0, model_js_1.getMainLoopModel)()))
                return false;
            if ((0, settings_js_1.getSettingsForSource)('policySettings')?.effortLevel !== undefined) {
                return false;
            }
            if ((0, effort_js_1.getEffortEnvOverride)() !== undefined)
                return false;
            const persisted = (0, settings_js_1.getInitialSettings)().effortLevel;
            if (persisted === 'high' || persisted === 'max')
                return false;
            return ((0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_tide_elm', 'off') !== 'off');
        },
    },
    {
        id: 'subagent-fanout-nudge',
        content: async (ctx) => {
            const blue = (0, color_js_1.color)('suggestion', ctx.theme);
            const variant = (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_tern_alloy', 'off');
            return variant === 'copy_b'
                ? `For big tasks, tell Claude to ${blue('use subagents')}. They work in parallel and keep your main thread clean.`
                : `Say ${blue('"fan out subagents"')} and Claude sends a team. Each one digs deep so nothing gets missed.`;
        },
        cooldownSessions: 3,
        isRelevant: async () => {
            if (!(0, auth_js_1.is1PApiCustomer)())
                return false;
            return ((0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_tern_alloy', 'off') !== 'off');
        },
    },
    {
        id: 'loop-command-nudge',
        content: async (ctx) => {
            const blue = (0, color_js_1.color)('suggestion', ctx.theme);
            const variant = (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_timber_lark', 'off');
            return variant === 'copy_b'
                ? `Use ${blue('/loop 5m check the deploy')} to run any prompt on a schedule. Set it and forget it.`
                : `${blue('/loop')} runs any prompt on a recurring schedule. Great for monitoring deploys, babysitting PRs, or polling status.`;
        },
        cooldownSessions: 3,
        isRelevant: async () => {
            if (!(0, auth_js_1.is1PApiCustomer)())
                return false;
            if (!(0, prompt_js_1.isKairosCronEnabled)())
                return false;
            return ((0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_timber_lark', 'off') !== 'off');
        },
    },
    {
        id: 'guest-passes',
        content: async (ctx) => {
            const claude = (0, color_js_1.color)('claude', ctx.theme);
            const reward = (0, referral_js_1.getCachedReferrerReward)();
            return reward
                ? `Share Claude Code and earn ${claude((0, referral_js_1.formatCreditAmount)(reward))} of extra usage · ${claude('/passes')}`
                : `You have free guest passes to share · ${claude('/passes')}`;
        },
        cooldownSessions: 3,
        isRelevant: async () => {
            const config = (0, config_js_1.getGlobalConfig)();
            if (config.hasVisitedPasses) {
                return false;
            }
            const { eligible } = (0, referral_js_1.checkCachedPassesEligibility)();
            return eligible;
        },
    },
    {
        id: 'overage-credit',
        content: async (ctx) => {
            const claude = (0, color_js_1.color)('claude', ctx.theme);
            const info = (0, overageCreditGrant_js_1.getCachedOverageCreditGrant)();
            const amount = info ? (0, overageCreditGrant_js_1.formatGrantAmount)(info) : null;
            if (!amount)
                return '';
            // Copy from "OC & Bulk Overages copy" doc (#5 — CLI Rotating tip)
            return `${claude(`${amount} in extra usage, on us`)} · third-party apps · ${claude('/extra-usage')}`;
        },
        cooldownSessions: 3,
        isRelevant: async () => (0, OverageCreditUpsell_js_1.shouldShowOverageCreditUpsell)(),
    },
    {
        id: 'feedback-command',
        content: async () => 'Use /feedback to help us improve!',
        cooldownSessions: 15,
        async isRelevant() {
            if (process.env.USER_TYPE === 'ant') {
                return false;
            }
            const config = (0, config_js_1.getGlobalConfig)();
            return config.numStartups > 5;
        },
    },
];
const internalOnlyTips = process.env.USER_TYPE === 'ant'
    ? [
        {
            id: 'important-claudemd',
            content: async () => '[ANT-ONLY] Use "IMPORTANT:" prefix for must-follow CLAUDE.md rules',
            cooldownSessions: 30,
            isRelevant: async () => true,
        },
        {
            id: 'skillify',
            content: async () => '[ANT-ONLY] Use /skillify at the end of a workflow to turn it into a reusable skill',
            cooldownSessions: 15,
            isRelevant: async () => true,
        },
    ]
    : [];
function getCustomTips() {
    const settings = (0, settings_js_1.getInitialSettings)();
    const override = settings.spinnerTipsOverride;
    if (!override?.tips?.length)
        return [];
    return override.tips.map((content, i) => ({
        id: `custom-tip-${i}`,
        content: async () => content,
        cooldownSessions: 0,
        isRelevant: async () => true,
    }));
}
async function getRelevantTips(context) {
    const settings = (0, settings_js_1.getInitialSettings)();
    const override = settings.spinnerTipsOverride;
    const customTips = getCustomTips();
    // If excludeDefault is true and there are custom tips, skip built-in tips entirely
    if (override?.excludeDefault && customTips.length > 0) {
        return customTips;
    }
    // Otherwise, filter built-in tips as before and combine with custom
    const tips = [...externalTips, ...internalOnlyTips];
    const isRelevant = await Promise.all(tips.map(_ => _.isRelevant(context)));
    const filtered = tips
        .filter((_, index) => isRelevant[index])
        .filter(_ => (0, tipHistory_js_1.getSessionsSinceLastShown)(_.id) >= _.cooldownSessions);
    return [...filtered, ...customTips];
}
