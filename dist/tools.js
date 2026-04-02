"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTools = exports.TOOL_PRESETS = exports.REPL_ONLY_TOOLS = exports.COORDINATOR_MODE_ALLOWED_TOOLS = exports.ASYNC_AGENT_ALLOWED_TOOLS = exports.CUSTOM_AGENT_DISALLOWED_TOOLS = exports.ALL_AGENT_DISALLOWED_TOOLS = void 0;
exports.parseToolPreset = parseToolPreset;
exports.getToolsForDefaultPreset = getToolsForDefaultPreset;
exports.getAllBaseTools = getAllBaseTools;
exports.filterToolsByDenyRules = filterToolsByDenyRules;
exports.assembleToolPool = assembleToolPool;
exports.getMergedTools = getMergedTools;
// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
const Tool_js_1 = require("./Tool.js");
const AgentTool_js_1 = require("./tools/AgentTool/AgentTool.js");
const SkillTool_js_1 = require("./tools/SkillTool/SkillTool.js");
const BashTool_js_1 = require("./tools/BashTool/BashTool.js");
const FileEditTool_js_1 = require("./tools/FileEditTool/FileEditTool.js");
const FileReadTool_js_1 = require("./tools/FileReadTool/FileReadTool.js");
const FileWriteTool_js_1 = require("./tools/FileWriteTool/FileWriteTool.js");
const GlobTool_js_1 = require("./tools/GlobTool/GlobTool.js");
const NotebookEditTool_js_1 = require("./tools/NotebookEditTool/NotebookEditTool.js");
const WebFetchTool_js_1 = require("./tools/WebFetchTool/WebFetchTool.js");
const TaskStopTool_js_1 = require("./tools/TaskStopTool/TaskStopTool.js");
const BriefTool_js_1 = require("./tools/BriefTool/BriefTool.js");
// Dead code elimination: conditional import for ant-only tools
/* eslint-disable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
const REPLTool = process.env.USER_TYPE === 'ant'
    ? require('./tools/REPLTool/REPLTool.js').REPLTool
    : null;
const SuggestBackgroundPRTool = process.env.USER_TYPE === 'ant'
    ? require('./tools/SuggestBackgroundPRTool/SuggestBackgroundPRTool.js')
        .SuggestBackgroundPRTool
    : null;
const SleepTool = (0, bun_bundle_1.feature)('PROACTIVE') || (0, bun_bundle_1.feature)('KAIROS')
    ? require('./tools/SleepTool/SleepTool.js').SleepTool
    : null;
const cronTools = (0, bun_bundle_1.feature)('AGENT_TRIGGERS')
    ? [
        require('./tools/ScheduleCronTool/CronCreateTool.js').CronCreateTool,
        require('./tools/ScheduleCronTool/CronDeleteTool.js').CronDeleteTool,
        require('./tools/ScheduleCronTool/CronListTool.js').CronListTool,
    ]
    : [];
const RemoteTriggerTool = (0, bun_bundle_1.feature)('AGENT_TRIGGERS_REMOTE')
    ? require('./tools/RemoteTriggerTool/RemoteTriggerTool.js').RemoteTriggerTool
    : null;
const MonitorTool = (0, bun_bundle_1.feature)('MONITOR_TOOL')
    ? require('./tools/MonitorTool/MonitorTool.js').MonitorTool
    : null;
const SendUserFileTool = (0, bun_bundle_1.feature)('KAIROS')
    ? require('./tools/SendUserFileTool/SendUserFileTool.js').SendUserFileTool
    : null;
const PushNotificationTool = (0, bun_bundle_1.feature)('KAIROS') || (0, bun_bundle_1.feature)('KAIROS_PUSH_NOTIFICATION')
    ? require('./tools/PushNotificationTool/PushNotificationTool.js')
        .PushNotificationTool
    : null;
const SubscribePRTool = (0, bun_bundle_1.feature)('KAIROS_GITHUB_WEBHOOKS')
    ? require('./tools/SubscribePRTool/SubscribePRTool.js').SubscribePRTool
    : null;
/* eslint-enable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
const TaskOutputTool_js_1 = require("./tools/TaskOutputTool/TaskOutputTool.js");
const WebSearchTool_js_1 = require("./tools/WebSearchTool/WebSearchTool.js");
const TodoWriteTool_js_1 = require("./tools/TodoWriteTool/TodoWriteTool.js");
const ExitPlanModeV2Tool_js_1 = require("./tools/ExitPlanModeTool/ExitPlanModeV2Tool.js");
const TestingPermissionTool_js_1 = require("./tools/testing/TestingPermissionTool.js");
const GrepTool_js_1 = require("./tools/GrepTool/GrepTool.js");
const TungstenTool_js_1 = require("./tools/TungstenTool/TungstenTool.js");
// Lazy require to break circular dependency: tools.ts -> TeamCreateTool/TeamDeleteTool -> ... -> tools.ts
/* eslint-disable @typescript-eslint/no-require-imports */
const getTeamCreateTool = () => require('./tools/TeamCreateTool/TeamCreateTool.js')
    .TeamCreateTool;
const getTeamDeleteTool = () => require('./tools/TeamDeleteTool/TeamDeleteTool.js')
    .TeamDeleteTool;
const getSendMessageTool = () => require('./tools/SendMessageTool/SendMessageTool.js')
    .SendMessageTool;
/* eslint-enable @typescript-eslint/no-require-imports */
const AskUserQuestionTool_js_1 = require("./tools/AskUserQuestionTool/AskUserQuestionTool.js");
const LSPTool_js_1 = require("./tools/LSPTool/LSPTool.js");
const ListMcpResourcesTool_js_1 = require("./tools/ListMcpResourcesTool/ListMcpResourcesTool.js");
const ReadMcpResourceTool_js_1 = require("./tools/ReadMcpResourceTool/ReadMcpResourceTool.js");
const ToolSearchTool_js_1 = require("./tools/ToolSearchTool/ToolSearchTool.js");
const EnterPlanModeTool_js_1 = require("./tools/EnterPlanModeTool/EnterPlanModeTool.js");
const EnterWorktreeTool_js_1 = require("./tools/EnterWorktreeTool/EnterWorktreeTool.js");
const ExitWorktreeTool_js_1 = require("./tools/ExitWorktreeTool/ExitWorktreeTool.js");
const ConfigTool_js_1 = require("./tools/ConfigTool/ConfigTool.js");
const TaskCreateTool_js_1 = require("./tools/TaskCreateTool/TaskCreateTool.js");
const TaskGetTool_js_1 = require("./tools/TaskGetTool/TaskGetTool.js");
const TaskUpdateTool_js_1 = require("./tools/TaskUpdateTool/TaskUpdateTool.js");
const TaskListTool_js_1 = require("./tools/TaskListTool/TaskListTool.js");
const uniqBy_js_1 = __importDefault(require("lodash-es/uniqBy.js"));
const toolSearch_js_1 = require("./utils/toolSearch.js");
const tasks_js_1 = require("./utils/tasks.js");
// Dead code elimination: conditional import for CLAUDE_CODE_VERIFY_PLAN
/* eslint-disable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
const VerifyPlanExecutionTool = process.env.CLAUDE_CODE_VERIFY_PLAN === 'true'
    ? require('./tools/VerifyPlanExecutionTool/VerifyPlanExecutionTool.js')
        .VerifyPlanExecutionTool
    : null;
/* eslint-enable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
const SyntheticOutputTool_js_1 = require("./tools/SyntheticOutputTool/SyntheticOutputTool.js");
var tools_js_1 = require("./constants/tools.js");
Object.defineProperty(exports, "ALL_AGENT_DISALLOWED_TOOLS", { enumerable: true, get: function () { return tools_js_1.ALL_AGENT_DISALLOWED_TOOLS; } });
Object.defineProperty(exports, "CUSTOM_AGENT_DISALLOWED_TOOLS", { enumerable: true, get: function () { return tools_js_1.CUSTOM_AGENT_DISALLOWED_TOOLS; } });
Object.defineProperty(exports, "ASYNC_AGENT_ALLOWED_TOOLS", { enumerable: true, get: function () { return tools_js_1.ASYNC_AGENT_ALLOWED_TOOLS; } });
Object.defineProperty(exports, "COORDINATOR_MODE_ALLOWED_TOOLS", { enumerable: true, get: function () { return tools_js_1.COORDINATOR_MODE_ALLOWED_TOOLS; } });
const bun_bundle_1 = require("bun:bundle");
// Dead code elimination: conditional import for OVERFLOW_TEST_TOOL
/* eslint-disable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
const OverflowTestTool = (0, bun_bundle_1.feature)('OVERFLOW_TEST_TOOL')
    ? require('./tools/OverflowTestTool/OverflowTestTool.js').OverflowTestTool
    : null;
const CtxInspectTool = (0, bun_bundle_1.feature)('CONTEXT_COLLAPSE')
    ? require('./tools/CtxInspectTool/CtxInspectTool.js').CtxInspectTool
    : null;
const TerminalCaptureTool = (0, bun_bundle_1.feature)('TERMINAL_PANEL')
    ? require('./tools/TerminalCaptureTool/TerminalCaptureTool.js')
        .TerminalCaptureTool
    : null;
const WebBrowserTool = (0, bun_bundle_1.feature)('WEB_BROWSER_TOOL')
    ? require('./tools/WebBrowserTool/WebBrowserTool.js').WebBrowserTool
    : null;
const coordinatorModeModule = (0, bun_bundle_1.feature)('COORDINATOR_MODE')
    ? require('./coordinator/coordinatorMode.js')
    : null;
const SnipTool = (0, bun_bundle_1.feature)('HISTORY_SNIP')
    ? require('./tools/SnipTool/SnipTool.js').SnipTool
    : null;
const ListPeersTool = (0, bun_bundle_1.feature)('UDS_INBOX')
    ? require('./tools/ListPeersTool/ListPeersTool.js').ListPeersTool
    : null;
const WorkflowTool = (0, bun_bundle_1.feature)('WORKFLOW_SCRIPTS')
    ? (() => {
        require('./tools/WorkflowTool/bundled/index.js').initBundledWorkflows();
        return require('./tools/WorkflowTool/WorkflowTool.js').WorkflowTool;
    })()
    : null;
const permissions_js_1 = require("./utils/permissions/permissions.js");
const embeddedTools_js_1 = require("./utils/embeddedTools.js");
const envUtils_js_1 = require("./utils/envUtils.js");
const shellToolUtils_js_1 = require("./utils/shell/shellToolUtils.js");
const agentSwarmsEnabled_js_1 = require("./utils/agentSwarmsEnabled.js");
const worktreeModeEnabled_js_1 = require("./utils/worktreeModeEnabled.js");
const constants_js_1 = require("./tools/REPLTool/constants.js");
Object.defineProperty(exports, "REPL_ONLY_TOOLS", { enumerable: true, get: function () { return constants_js_1.REPL_ONLY_TOOLS; } });
/* eslint-disable @typescript-eslint/no-require-imports */
const getPowerShellTool = () => {
    if (!(0, shellToolUtils_js_1.isPowerShellToolEnabled)())
        return null;
    return require('./tools/PowerShellTool/PowerShellTool.js').PowerShellTool;
};
/* eslint-enable @typescript-eslint/no-require-imports */
/**
 * Predefined tool presets that can be used with --tools flag
 */
exports.TOOL_PRESETS = ['default'];
function parseToolPreset(preset) {
    const presetString = preset.toLowerCase();
    if (!exports.TOOL_PRESETS.includes(presetString)) {
        return null;
    }
    return presetString;
}
/**
 * Get the list of tool names for a given preset
 * Filters out tools that are disabled via isEnabled() check
 * @param preset The preset name
 * @returns Array of tool names
 */
function getToolsForDefaultPreset() {
    const tools = getAllBaseTools();
    const isEnabled = tools.map(tool => tool.isEnabled());
    return tools.filter((_, i) => isEnabled[i]).map(tool => tool.name);
}
/**
 * Get the complete exhaustive list of all tools that could be available
 * in the current environment (respecting process.env flags).
 * This is the source of truth for ALL tools.
 */
/**
 * NOTE: This MUST stay in sync with https://console.statsig.com/4aF3Ewatb6xPVpCwxb5nA3/dynamic_configs/claude_code_global_system_caching, in order to cache the system prompt across users.
 */
function getAllBaseTools() {
    return [
        AgentTool_js_1.AgentTool,
        TaskOutputTool_js_1.TaskOutputTool,
        BashTool_js_1.BashTool,
        // Ant-native builds have bfs/ugrep embedded in the bun binary (same ARGV0
        // trick as ripgrep). When available, find/grep in Claude's shell are aliased
        // to these fast tools, so the dedicated Glob/Grep tools are unnecessary.
        ...((0, embeddedTools_js_1.hasEmbeddedSearchTools)() ? [] : [GlobTool_js_1.GlobTool, GrepTool_js_1.GrepTool]),
        ExitPlanModeV2Tool_js_1.ExitPlanModeV2Tool,
        FileReadTool_js_1.FileReadTool,
        FileEditTool_js_1.FileEditTool,
        FileWriteTool_js_1.FileWriteTool,
        NotebookEditTool_js_1.NotebookEditTool,
        WebFetchTool_js_1.WebFetchTool,
        TodoWriteTool_js_1.TodoWriteTool,
        WebSearchTool_js_1.WebSearchTool,
        TaskStopTool_js_1.TaskStopTool,
        AskUserQuestionTool_js_1.AskUserQuestionTool,
        SkillTool_js_1.SkillTool,
        EnterPlanModeTool_js_1.EnterPlanModeTool,
        ...(process.env.USER_TYPE === 'ant' ? [ConfigTool_js_1.ConfigTool] : []),
        ...(process.env.USER_TYPE === 'ant' ? [TungstenTool_js_1.TungstenTool] : []),
        ...(SuggestBackgroundPRTool ? [SuggestBackgroundPRTool] : []),
        ...(WebBrowserTool ? [WebBrowserTool] : []),
        ...((0, tasks_js_1.isTodoV2Enabled)()
            ? [TaskCreateTool_js_1.TaskCreateTool, TaskGetTool_js_1.TaskGetTool, TaskUpdateTool_js_1.TaskUpdateTool, TaskListTool_js_1.TaskListTool]
            : []),
        ...(OverflowTestTool ? [OverflowTestTool] : []),
        ...(CtxInspectTool ? [CtxInspectTool] : []),
        ...(TerminalCaptureTool ? [TerminalCaptureTool] : []),
        ...((0, envUtils_js_1.isEnvTruthy)(process.env.ENABLE_LSP_TOOL) ? [LSPTool_js_1.LSPTool] : []),
        ...((0, worktreeModeEnabled_js_1.isWorktreeModeEnabled)() ? [EnterWorktreeTool_js_1.EnterWorktreeTool, ExitWorktreeTool_js_1.ExitWorktreeTool] : []),
        getSendMessageTool(),
        ...(ListPeersTool ? [ListPeersTool] : []),
        ...((0, agentSwarmsEnabled_js_1.isAgentSwarmsEnabled)()
            ? [getTeamCreateTool(), getTeamDeleteTool()]
            : []),
        ...(VerifyPlanExecutionTool ? [VerifyPlanExecutionTool] : []),
        ...(process.env.USER_TYPE === 'ant' && REPLTool ? [REPLTool] : []),
        ...(WorkflowTool ? [WorkflowTool] : []),
        ...(SleepTool ? [SleepTool] : []),
        ...cronTools,
        ...(RemoteTriggerTool ? [RemoteTriggerTool] : []),
        ...(MonitorTool ? [MonitorTool] : []),
        BriefTool_js_1.BriefTool,
        ...(SendUserFileTool ? [SendUserFileTool] : []),
        ...(PushNotificationTool ? [PushNotificationTool] : []),
        ...(SubscribePRTool ? [SubscribePRTool] : []),
        ...(getPowerShellTool() ? [getPowerShellTool()] : []),
        ...(SnipTool ? [SnipTool] : []),
        ...(process.env.NODE_ENV === 'test' ? [TestingPermissionTool_js_1.TestingPermissionTool] : []),
        ListMcpResourcesTool_js_1.ListMcpResourcesTool,
        ReadMcpResourceTool_js_1.ReadMcpResourceTool,
        // Include ToolSearchTool when tool search might be enabled (optimistic check)
        // The actual decision to defer tools happens at request time in claude.ts
        ...((0, toolSearch_js_1.isToolSearchEnabledOptimistic)() ? [ToolSearchTool_js_1.ToolSearchTool] : []),
    ];
}
/**
 * Filters out tools that are blanket-denied by the permission context.
 * A tool is filtered out if there's a deny rule matching its name with no
 * ruleContent (i.e., a blanket deny for that tool).
 *
 * Uses the same matcher as the runtime permission check (step 1a), so MCP
 * server-prefix rules like `mcp__server` strip all tools from that server
 * before the model sees them — not just at call time.
 */
function filterToolsByDenyRules(tools, permissionContext) {
    return tools.filter(tool => !(0, permissions_js_1.getDenyRuleForTool)(permissionContext, tool));
}
const getTools = (permissionContext) => {
    // Simple mode: only Bash, Read, and Edit tools
    if ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_SIMPLE)) {
        // --bare + REPL mode: REPL wraps Bash/Read/Edit/etc inside the VM, so
        // return REPL instead of the raw primitives. Matches the non-bare path
        // below which also hides REPL_ONLY_TOOLS when REPL is enabled.
        if ((0, constants_js_1.isReplModeEnabled)() && REPLTool) {
            const replSimple = [REPLTool];
            if ((0, bun_bundle_1.feature)('COORDINATOR_MODE') &&
                coordinatorModeModule?.isCoordinatorMode()) {
                replSimple.push(TaskStopTool_js_1.TaskStopTool, getSendMessageTool());
            }
            return filterToolsByDenyRules(replSimple, permissionContext);
        }
        const simpleTools = [BashTool_js_1.BashTool, FileReadTool_js_1.FileReadTool, FileEditTool_js_1.FileEditTool];
        // When coordinator mode is also active, include AgentTool and TaskStopTool
        // so the coordinator gets Task+TaskStop (via useMergedTools filtering) and
        // workers get Bash/Read/Edit (via filterToolsForAgent filtering).
        if ((0, bun_bundle_1.feature)('COORDINATOR_MODE') &&
            coordinatorModeModule?.isCoordinatorMode()) {
            simpleTools.push(AgentTool_js_1.AgentTool, TaskStopTool_js_1.TaskStopTool, getSendMessageTool());
        }
        return filterToolsByDenyRules(simpleTools, permissionContext);
    }
    // Get all base tools and filter out special tools that get added conditionally
    const specialTools = new Set([
        ListMcpResourcesTool_js_1.ListMcpResourcesTool.name,
        ReadMcpResourceTool_js_1.ReadMcpResourceTool.name,
        SyntheticOutputTool_js_1.SYNTHETIC_OUTPUT_TOOL_NAME,
    ]);
    const tools = getAllBaseTools().filter(tool => !specialTools.has(tool.name));
    // Filter out tools that are denied by the deny rules
    let allowedTools = filterToolsByDenyRules(tools, permissionContext);
    // When REPL mode is enabled, hide primitive tools from direct use.
    // They're still accessible inside REPL via the VM context.
    if ((0, constants_js_1.isReplModeEnabled)()) {
        const replEnabled = allowedTools.some(tool => (0, Tool_js_1.toolMatchesName)(tool, constants_js_1.REPL_TOOL_NAME));
        if (replEnabled) {
            allowedTools = allowedTools.filter(tool => !constants_js_1.REPL_ONLY_TOOLS.has(tool.name));
        }
    }
    const isEnabled = allowedTools.map(_ => _.isEnabled());
    return allowedTools.filter((_, i) => isEnabled[i]);
};
exports.getTools = getTools;
/**
 * Assemble the full tool pool for a given permission context and MCP tools.
 *
 * This is the single source of truth for combining built-in tools with MCP tools.
 * Both REPL.tsx (via useMergedTools hook) and runAgent.ts (for coordinator workers)
 * use this function to ensure consistent tool pool assembly.
 *
 * The function:
 * 1. Gets built-in tools via getTools() (respects mode filtering)
 * 2. Filters MCP tools by deny rules
 * 3. Deduplicates by tool name (built-in tools take precedence)
 *
 * @param permissionContext - Permission context for filtering built-in tools
 * @param mcpTools - MCP tools from appState.mcp.tools
 * @returns Combined, deduplicated array of built-in and MCP tools
 */
function assembleToolPool(permissionContext, mcpTools) {
    const builtInTools = (0, exports.getTools)(permissionContext);
    // Filter out MCP tools that are in the deny list
    const allowedMcpTools = filterToolsByDenyRules(mcpTools, permissionContext);
    // Sort each partition for prompt-cache stability, keeping built-ins as a
    // contiguous prefix. The server's claude_code_system_cache_policy places a
    // global cache breakpoint after the last prefix-matched built-in tool; a flat
    // sort would interleave MCP tools into built-ins and invalidate all downstream
    // cache keys whenever an MCP tool sorts between existing built-ins. uniqBy
    // preserves insertion order, so built-ins win on name conflict.
    // Avoid Array.toSorted (Node 20+) — we support Node 18. builtInTools is
    // readonly so copy-then-sort; allowedMcpTools is a fresh .filter() result.
    const byName = (a, b) => a.name.localeCompare(b.name);
    return (0, uniqBy_js_1.default)([...builtInTools].sort(byName).concat(allowedMcpTools.sort(byName)), 'name');
}
/**
 * Get all tools including both built-in tools and MCP tools.
 *
 * This is the preferred function when you need the complete tools list for:
 * - Tool search threshold calculations (isToolSearchEnabled)
 * - Token counting that includes MCP tools
 * - Any context where MCP tools should be considered
 *
 * Use getTools() only when you specifically need just built-in tools.
 *
 * @param permissionContext - Permission context for filtering built-in tools
 * @param mcpTools - MCP tools from appState.mcp.tools
 * @returns Combined array of built-in and MCP tools
 */
function getMergedTools(permissionContext, mcpTools) {
    const builtInTools = (0, exports.getTools)(permissionContext);
    return [...builtInTools, ...mcpTools];
}
