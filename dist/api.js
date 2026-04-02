"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toolToAPISchema = toolToAPISchema;
exports.logAPIPrefix = logAPIPrefix;
exports.splitSysPromptPrefix = splitSysPromptPrefix;
exports.appendSystemContext = appendSystemContext;
exports.prependUserContext = prependUserContext;
exports.logContextMetrics = logContextMetrics;
exports.normalizeToolInput = normalizeToolInput;
exports.normalizeToolInputForAPI = normalizeToolInputForAPI;
const crypto_1 = require("crypto");
const prompts_js_1 = require("src/constants/prompts.js");
const context_js_1 = require("src/context.js");
const config_js_1 = require("src/services/analytics/config.js");
const growthbook_js_1 = require("src/services/analytics/growthbook.js");
const index_js_1 = require("src/services/analytics/index.js");
const client_js_1 = require("src/services/mcp/client.js");
const BashTool_js_1 = require("src/tools/BashTool/BashTool.js");
const FileEditTool_js_1 = require("src/tools/FileEditTool/FileEditTool.js");
const utils_js_1 = require("src/tools/FileEditTool/utils.js");
const FileWriteTool_js_1 = require("src/tools/FileWriteTool/FileWriteTool.js");
const tools_js_1 = require("src/tools.js");
const system_js_1 = require("../constants/system.js");
const tokenEstimation_js_1 = require("../services/tokenEstimation.js");
const constants_js_1 = require("../tools/AgentTool/constants.js");
const constants_js_2 = require("../tools/ExitPlanModeTool/constants.js");
const constants_js_3 = require("../tools/TaskOutputTool/constants.js");
const agentSwarmsEnabled_js_1 = require("./agentSwarmsEnabled.js");
const betas_js_1 = require("./betas.js");
const cwd_js_1 = require("./cwd.js");
const debug_js_1 = require("./debug.js");
const envUtils_js_1 = require("./envUtils.js");
const messages_js_1 = require("./messages.js");
const providers_js_1 = require("./model/providers.js");
const filesystem_js_1 = require("./permissions/filesystem.js");
const plans_js_1 = require("./plans.js");
const platform_js_1 = require("./platform.js");
const ripgrep_js_1 = require("./ripgrep.js");
const slowOperations_js_1 = require("./slowOperations.js");
const toolSchemaCache_js_1 = require("./toolSchemaCache.js");
const windowsPaths_js_1 = require("./windowsPaths.js");
const zodToJsonSchema_js_1 = require("./zodToJsonSchema.js");
// Fields to filter from tool schemas when swarms are not enabled
const SWARM_FIELDS_BY_TOOL = {
    [constants_js_2.EXIT_PLAN_MODE_V2_TOOL_NAME]: ['launchSwarm', 'teammateCount'],
    [constants_js_1.AGENT_TOOL_NAME]: ['name', 'team_name', 'mode'],
};
/**
 * Filter swarm-related fields from a tool's input schema.
 * Called at runtime when isAgentSwarmsEnabled() returns false.
 */
function filterSwarmFieldsFromSchema(toolName, schema) {
    const fieldsToRemove = SWARM_FIELDS_BY_TOOL[toolName];
    if (!fieldsToRemove || fieldsToRemove.length === 0) {
        return schema;
    }
    // Clone the schema to avoid mutating the original
    const filtered = { ...schema };
    const props = filtered.properties;
    if (props && typeof props === 'object') {
        const filteredProps = { ...props };
        for (const field of fieldsToRemove) {
            delete filteredProps[field];
        }
        filtered.properties = filteredProps;
    }
    return filtered;
}
async function toolToAPISchema(tool, options) {
    // Session-stable base schema: name, description, input_schema, strict,
    // eager_input_streaming. These are computed once per session and cached to
    // prevent mid-session GrowthBook flips (tengu_tool_pear, tengu_fgts) or
    // tool.prompt() drift from churning the serialized tool array bytes.
    // See toolSchemaCache.ts for rationale.
    //
    // Cache key includes inputJSONSchema when present. StructuredOutput instances
    // share the name 'StructuredOutput' but carry different schemas per workflow
    // call — name-only keying returned a stale schema (5.4% → 51% err rate, see
    // PR#25424). MCP tools also set inputJSONSchema but each has a stable schema,
    // so including it preserves their GB-flip cache stability.
    const cacheKey = 'inputJSONSchema' in tool && tool.inputJSONSchema
        ? `${tool.name}:${(0, slowOperations_js_1.jsonStringify)(tool.inputJSONSchema)}`
        : tool.name;
    const cache = (0, toolSchemaCache_js_1.getToolSchemaCache)();
    let base = cache.get(cacheKey);
    if (!base) {
        const strictToolsEnabled = (0, growthbook_js_1.checkStatsigFeatureGate_CACHED_MAY_BE_STALE)('tengu_tool_pear');
        // Use tool's JSON schema directly if provided, otherwise convert Zod schema
        let input_schema = ('inputJSONSchema' in tool && tool.inputJSONSchema
            ? tool.inputJSONSchema
            : (0, zodToJsonSchema_js_1.zodToJsonSchema)(tool.inputSchema));
        // Filter out swarm-related fields when swarms are not enabled
        // This ensures external non-EAP users don't see swarm features in the schema
        if (!(0, agentSwarmsEnabled_js_1.isAgentSwarmsEnabled)()) {
            input_schema = filterSwarmFieldsFromSchema(tool.name, input_schema);
        }
        base = {
            name: tool.name,
            description: await tool.prompt({
                getToolPermissionContext: options.getToolPermissionContext,
                tools: options.tools,
                agents: options.agents,
                allowedAgentTypes: options.allowedAgentTypes,
            }),
            input_schema,
        };
        // Only add strict if:
        // 1. Feature flag is enabled
        // 2. Tool has strict: true
        // 3. Model is provided and supports it (not all models support it right now)
        //    (if model is not provided, assume we can't use strict tools)
        if (strictToolsEnabled &&
            tool.strict === true &&
            options.model &&
            (0, betas_js_1.modelSupportsStructuredOutputs)(options.model)) {
            base.strict = true;
        }
        // Enable fine-grained tool streaming via per-tool API field.
        // Without FGTS, the API buffers entire tool input parameters before sending
        // input_json_delta events, causing multi-minute hangs on large tool inputs.
        // Gated to direct api.anthropic.com: proxies (LiteLLM etc.) and Bedrock/Vertex
        // with Claude 4.5 reject this field with 400. See GH#32742, PR #21729.
        if ((0, providers_js_1.getAPIProvider)() === 'firstParty' &&
            (0, providers_js_1.isFirstPartyAnthropicBaseUrl)() &&
            ((0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_fgts', false) ||
                (0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_ENABLE_FINE_GRAINED_TOOL_STREAMING))) {
            base.eager_input_streaming = true;
        }
        cache.set(cacheKey, base);
    }
    // Per-request overlay: defer_loading and cache_control vary by call
    // (tool search defers different tools per turn; cache markers move).
    // Explicit field copy avoids mutating the cached base and sidesteps
    // BetaTool.cache_control's `| null` clashing with our narrower type.
    const schema = {
        name: base.name,
        description: base.description,
        input_schema: base.input_schema,
        ...(base.strict && { strict: true }),
        ...(base.eager_input_streaming && { eager_input_streaming: true }),
    };
    // Add defer_loading if requested (for tool search feature)
    if (options.deferLoading) {
        schema.defer_loading = true;
    }
    if (options.cacheControl) {
        schema.cache_control = options.cacheControl;
    }
    // CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS is the kill switch for beta API
    // shapes. Proxy gateways (ANTHROPIC_BASE_URL → LiteLLM → Bedrock) reject
    // fields like defer_loading with "Extra inputs are not permitted". The gates
    // above each field are scattered and not all provider-aware, so this strips
    // everything not in the base-tool allowlist at the one choke point all tool
    // schemas pass through — including fields added in the future.
    // cache_control is allowlisted: the base {type: 'ephemeral'} shape is
    // standard prompt caching (Bedrock/Vertex supported); the beta sub-fields
    // (scope, ttl) are already gated upstream by shouldIncludeFirstPartyOnlyBetas
    // which independently respects this kill switch.
    // github.com/anthropics/claude-code/issues/20031
    if ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS)) {
        const allowed = new Set([
            'name',
            'description',
            'input_schema',
            'cache_control',
        ]);
        const stripped = Object.keys(schema).filter(k => !allowed.has(k));
        if (stripped.length > 0) {
            logStripOnce(stripped);
            return {
                name: schema.name,
                description: schema.description,
                input_schema: schema.input_schema,
                ...(schema.cache_control && { cache_control: schema.cache_control }),
            };
        }
    }
    // Note: We cast to BetaTool but the extra fields are still present at runtime
    // and will be serialized in the API request, even though they're not in the SDK's
    // BetaTool type definition. This is intentional for beta features.
    return schema;
}
let loggedStrip = false;
function logStripOnce(stripped) {
    if (loggedStrip)
        return;
    loggedStrip = true;
    (0, debug_js_1.logForDebugging)(`[betas] Stripped from tool schemas: [${stripped.join(', ')}] (CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1)`);
}
/**
 * Log stats about first block for analyzing prefix matching config
 * (see https://console.statsig.com/4aF3Ewatb6xPVpCwxb5nA3/dynamic_configs/claude_cli_system_prompt_prefixes)
 */
function logAPIPrefix(systemPrompt) {
    const [firstSyspromptBlock] = splitSysPromptPrefix(systemPrompt);
    const firstSystemPrompt = firstSyspromptBlock?.text;
    (0, index_js_1.logEvent)('tengu_sysprompt_block', {
        snippet: firstSystemPrompt?.slice(0, 20),
        length: firstSystemPrompt?.length ?? 0,
        hash: (firstSystemPrompt
            ? (0, crypto_1.createHash)('sha256').update(firstSystemPrompt).digest('hex')
            : ''),
    });
}
/**
 * Split system prompt blocks by content type for API matching and cache control.
 * See https://console.statsig.com/4aF3Ewatb6xPVpCwxb5nA3/dynamic_configs/claude_cli_system_prompt_prefixes
 *
 * Behavior depends on feature flags and options:
 *
 * 1. MCP tools present (skipGlobalCacheForSystemPrompt=true):
 *    Returns up to 3 blocks with org-level caching (no global cache on system prompt):
 *    - Attribution header (cacheScope=null)
 *    - System prompt prefix (cacheScope='org')
 *    - Everything else concatenated (cacheScope='org')
 *
 * 2. Global cache mode with boundary marker (1P only, boundary found):
 *    Returns up to 4 blocks:
 *    - Attribution header (cacheScope=null)
 *    - System prompt prefix (cacheScope=null)
 *    - Static content before boundary (cacheScope='global')
 *    - Dynamic content after boundary (cacheScope=null)
 *
 * 3. Default mode (3P providers, or boundary missing):
 *    Returns up to 3 blocks with org-level caching:
 *    - Attribution header (cacheScope=null)
 *    - System prompt prefix (cacheScope='org')
 *    - Everything else concatenated (cacheScope='org')
 */
function splitSysPromptPrefix(systemPrompt, options) {
    const useGlobalCacheFeature = (0, betas_js_1.shouldUseGlobalCacheScope)();
    if (useGlobalCacheFeature && options?.skipGlobalCacheForSystemPrompt) {
        (0, index_js_1.logEvent)('tengu_sysprompt_using_tool_based_cache', {
            promptBlockCount: systemPrompt.length,
        });
        // Filter out boundary marker, return blocks without global scope
        let attributionHeader;
        let systemPromptPrefix;
        const rest = [];
        for (const prompt of systemPrompt) {
            if (!prompt)
                continue;
            if (prompt === prompts_js_1.SYSTEM_PROMPT_DYNAMIC_BOUNDARY)
                continue; // Skip boundary
            if (prompt.startsWith('x-anthropic-billing-header')) {
                attributionHeader = prompt;
            }
            else if (system_js_1.CLI_SYSPROMPT_PREFIXES.has(prompt)) {
                systemPromptPrefix = prompt;
            }
            else {
                rest.push(prompt);
            }
        }
        const result = [];
        if (attributionHeader) {
            result.push({ text: attributionHeader, cacheScope: null });
        }
        if (systemPromptPrefix) {
            result.push({ text: systemPromptPrefix, cacheScope: 'org' });
        }
        const restJoined = rest.join('\n\n');
        if (restJoined) {
            result.push({ text: restJoined, cacheScope: 'org' });
        }
        return result;
    }
    if (useGlobalCacheFeature) {
        const boundaryIndex = systemPrompt.findIndex(s => s === prompts_js_1.SYSTEM_PROMPT_DYNAMIC_BOUNDARY);
        if (boundaryIndex !== -1) {
            let attributionHeader;
            let systemPromptPrefix;
            const staticBlocks = [];
            const dynamicBlocks = [];
            for (let i = 0; i < systemPrompt.length; i++) {
                const block = systemPrompt[i];
                if (!block || block === prompts_js_1.SYSTEM_PROMPT_DYNAMIC_BOUNDARY)
                    continue;
                if (block.startsWith('x-anthropic-billing-header')) {
                    attributionHeader = block;
                }
                else if (system_js_1.CLI_SYSPROMPT_PREFIXES.has(block)) {
                    systemPromptPrefix = block;
                }
                else if (i < boundaryIndex) {
                    staticBlocks.push(block);
                }
                else {
                    dynamicBlocks.push(block);
                }
            }
            const result = [];
            if (attributionHeader)
                result.push({ text: attributionHeader, cacheScope: null });
            if (systemPromptPrefix)
                result.push({ text: systemPromptPrefix, cacheScope: null });
            const staticJoined = staticBlocks.join('\n\n');
            if (staticJoined)
                result.push({ text: staticJoined, cacheScope: 'global' });
            const dynamicJoined = dynamicBlocks.join('\n\n');
            if (dynamicJoined)
                result.push({ text: dynamicJoined, cacheScope: null });
            (0, index_js_1.logEvent)('tengu_sysprompt_boundary_found', {
                blockCount: result.length,
                staticBlockLength: staticJoined.length,
                dynamicBlockLength: dynamicJoined.length,
            });
            return result;
        }
        else {
            (0, index_js_1.logEvent)('tengu_sysprompt_missing_boundary_marker', {
                promptBlockCount: systemPrompt.length,
            });
        }
    }
    let attributionHeader;
    let systemPromptPrefix;
    const rest = [];
    for (const block of systemPrompt) {
        if (!block)
            continue;
        if (block.startsWith('x-anthropic-billing-header')) {
            attributionHeader = block;
        }
        else if (system_js_1.CLI_SYSPROMPT_PREFIXES.has(block)) {
            systemPromptPrefix = block;
        }
        else {
            rest.push(block);
        }
    }
    const result = [];
    if (attributionHeader)
        result.push({ text: attributionHeader, cacheScope: null });
    if (systemPromptPrefix)
        result.push({ text: systemPromptPrefix, cacheScope: 'org' });
    const restJoined = rest.join('\n\n');
    if (restJoined)
        result.push({ text: restJoined, cacheScope: 'org' });
    return result;
}
function appendSystemContext(systemPrompt, context) {
    return [
        ...systemPrompt,
        Object.entries(context)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n'),
    ].filter(Boolean);
}
function prependUserContext(messages, context) {
    if (process.env.NODE_ENV === 'test') {
        return messages;
    }
    if (Object.entries(context).length === 0) {
        return messages;
    }
    return [
        (0, messages_js_1.createUserMessage)({
            content: `<system-reminder>\nAs you answer the user's questions, you can use the following context:\n${Object.entries(context)
                .map(([key, value]) => `# ${key}\n${value}`)
                .join('\n')}

      IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.\n</system-reminder>\n`,
            isMeta: true,
        }),
        ...messages,
    ];
}
/**
 * Log metrics about context and system prompt size
 */
async function logContextMetrics(mcpConfigs, toolPermissionContext) {
    // Early return if logging is disabled
    if ((0, config_js_1.isAnalyticsDisabled)()) {
        return;
    }
    const [{ tools: mcpTools }, tools, userContext, systemContext] = await Promise.all([
        (0, client_js_1.prefetchAllMcpResources)(mcpConfigs),
        (0, tools_js_1.getTools)(toolPermissionContext),
        (0, context_js_1.getUserContext)(),
        (0, context_js_1.getSystemContext)(),
    ]);
    // Extract individual context sizes and calculate total
    const gitStatusSize = systemContext.gitStatus?.length ?? 0;
    const claudeMdSize = userContext.claudeMd?.length ?? 0;
    // Calculate total context size
    const totalContextSize = gitStatusSize + claudeMdSize;
    // Get file count using ripgrep (rounded to nearest power of 10 for privacy)
    const currentDir = (0, cwd_js_1.getCwd)();
    const ignorePatternsByRoot = (0, filesystem_js_1.getFileReadIgnorePatterns)(toolPermissionContext);
    const normalizedIgnorePatterns = (0, filesystem_js_1.normalizePatternsToPath)(ignorePatternsByRoot, currentDir);
    const fileCount = await (0, ripgrep_js_1.countFilesRoundedRg)(currentDir, AbortSignal.timeout(1000), normalizedIgnorePatterns);
    // Calculate tool metrics
    let mcpToolsCount = 0;
    let mcpServersCount = 0;
    let mcpToolsTokens = 0;
    let nonMcpToolsCount = 0;
    let nonMcpToolsTokens = 0;
    const nonMcpTools = tools.filter(tool => !tool.isMcp);
    mcpToolsCount = mcpTools.length;
    nonMcpToolsCount = nonMcpTools.length;
    // Extract unique server names from MCP tool names (format: mcp__servername__toolname)
    const serverNames = new Set();
    for (const tool of mcpTools) {
        const parts = tool.name.split('__');
        if (parts.length >= 3 && parts[1]) {
            serverNames.add(parts[1]);
        }
    }
    mcpServersCount = serverNames.size;
    // Estimate tool tokens locally for analytics (avoids N API calls per session)
    // Use inputJSONSchema (plain JSON Schema) when available, otherwise convert Zod schema
    for (const tool of mcpTools) {
        const schema = 'inputJSONSchema' in tool && tool.inputJSONSchema
            ? tool.inputJSONSchema
            : (0, zodToJsonSchema_js_1.zodToJsonSchema)(tool.inputSchema);
        mcpToolsTokens += (0, tokenEstimation_js_1.roughTokenCountEstimation)((0, slowOperations_js_1.jsonStringify)(schema));
    }
    for (const tool of nonMcpTools) {
        const schema = 'inputJSONSchema' in tool && tool.inputJSONSchema
            ? tool.inputJSONSchema
            : (0, zodToJsonSchema_js_1.zodToJsonSchema)(tool.inputSchema);
        nonMcpToolsTokens += (0, tokenEstimation_js_1.roughTokenCountEstimation)((0, slowOperations_js_1.jsonStringify)(schema));
    }
    (0, index_js_1.logEvent)('tengu_context_size', {
        git_status_size: gitStatusSize,
        claude_md_size: claudeMdSize,
        total_context_size: totalContextSize,
        project_file_count_rounded: fileCount,
        mcp_tools_count: mcpToolsCount,
        mcp_servers_count: mcpServersCount,
        mcp_tools_tokens: mcpToolsTokens,
        non_mcp_tools_count: nonMcpToolsCount,
        non_mcp_tools_tokens: nonMcpToolsTokens,
    });
}
// TODO: Generalize this to all tools
function normalizeToolInput(tool, input, agentId) {
    switch (tool.name) {
        case constants_js_2.EXIT_PLAN_MODE_V2_TOOL_NAME: {
            // Always inject plan content and file path for ExitPlanModeV2 so hooks/SDK get the plan.
            // The V2 tool reads plan from file instead of input, but hooks/SDK
            const plan = (0, plans_js_1.getPlan)(agentId);
            const planFilePath = (0, plans_js_1.getPlanFilePath)(agentId);
            // Persist file snapshot for CCR sessions so the plan survives pod recycling
            void (0, plans_js_1.persistFileSnapshotIfRemote)();
            return plan !== null ? { ...input, plan, planFilePath } : input;
        }
        case BashTool_js_1.BashTool.name: {
            // Validated upstream, won't throw
            const parsed = BashTool_js_1.BashTool.inputSchema.parse(input);
            const { command, timeout, description } = parsed;
            const cwd = (0, cwd_js_1.getCwd)();
            let normalizedCommand = command.replace(`cd ${cwd} && `, '');
            if ((0, platform_js_1.getPlatform)() === 'windows') {
                normalizedCommand = normalizedCommand.replace(`cd ${(0, windowsPaths_js_1.windowsPathToPosixPath)(cwd)} && `, '');
            }
            // Replace \\; with \; (commonly needed for find -exec commands)
            normalizedCommand = normalizedCommand.replace(/\\\\;/g, '\\;');
            // Logging for commands that are only echoing a string. This is to help us understand how often  Claude talks via bash
            if (/^echo\s+["']?[^|&;><]*["']?$/i.test(normalizedCommand.trim())) {
                (0, index_js_1.logEvent)('tengu_bash_tool_simple_echo', {});
            }
            // Check for run_in_background (may not exist in schema if CLAUDE_CODE_DISABLE_BACKGROUND_TASKS is set)
            const run_in_background = 'run_in_background' in parsed ? parsed.run_in_background : undefined;
            // SAFETY: Cast is safe because input was validated by .parse() above.
            // TypeScript can't narrow the generic T based on switch(tool.name), so it
            // doesn't know the return type matches T['inputSchema']. This is a fundamental
            // TS limitation with generics, not bypassable without major refactoring.
            return {
                command: normalizedCommand,
                description,
                ...(timeout !== undefined && { timeout }),
                ...(description !== undefined && { description }),
                ...(run_in_background !== undefined && { run_in_background }),
                ...('dangerouslyDisableSandbox' in parsed &&
                    parsed.dangerouslyDisableSandbox !== undefined && {
                    dangerouslyDisableSandbox: parsed.dangerouslyDisableSandbox,
                }),
            };
        }
        case FileEditTool_js_1.FileEditTool.name: {
            // Validated upstream, won't throw
            const parsedInput = FileEditTool_js_1.FileEditTool.inputSchema.parse(input);
            // This is a workaround for tokens claude can't see
            const { file_path, edits } = (0, utils_js_1.normalizeFileEditInput)({
                file_path: parsedInput.file_path,
                edits: [
                    {
                        old_string: parsedInput.old_string,
                        new_string: parsedInput.new_string,
                        replace_all: parsedInput.replace_all,
                    },
                ],
            });
            // SAFETY: See comment in BashTool case above
            return {
                replace_all: edits[0].replace_all,
                file_path,
                old_string: edits[0].old_string,
                new_string: edits[0].new_string,
            };
        }
        case FileWriteTool_js_1.FileWriteTool.name: {
            // Validated upstream, won't throw
            const parsedInput = FileWriteTool_js_1.FileWriteTool.inputSchema.parse(input);
            // Markdown uses two trailing spaces as a hard line break — don't strip.
            const isMarkdown = /\.(md|mdx)$/i.test(parsedInput.file_path);
            // SAFETY: See comment in BashTool case above
            return {
                file_path: parsedInput.file_path,
                content: isMarkdown
                    ? parsedInput.content
                    : (0, utils_js_1.stripTrailingWhitespace)(parsedInput.content),
            };
        }
        case constants_js_3.TASK_OUTPUT_TOOL_NAME: {
            // Normalize legacy parameter names from AgentOutputTool/BashOutputTool
            const legacyInput = input;
            const taskId = legacyInput.task_id ?? legacyInput.agentId ?? legacyInput.bash_id;
            const timeout = legacyInput.timeout ??
                (typeof legacyInput.wait_up_to === 'number'
                    ? legacyInput.wait_up_to * 1000
                    : undefined);
            // SAFETY: See comment in BashTool case above
            return {
                task_id: taskId ?? '',
                block: legacyInput.block ?? true,
                timeout: timeout ?? 30000,
            };
        }
        default:
            return input;
    }
}
// Strips fields that were added by normalizeToolInput before sending to API
// (e.g., plan field from ExitPlanModeV2 which has an empty input schema)
function normalizeToolInputForAPI(tool, input) {
    switch (tool.name) {
        case constants_js_2.EXIT_PLAN_MODE_V2_TOOL_NAME: {
            // Strip injected fields before sending to API (schema expects empty object)
            if (input &&
                typeof input === 'object' &&
                ('plan' in input || 'planFilePath' in input)) {
                const { plan, planFilePath, ...rest } = input;
                return rest;
            }
            return input;
        }
        case FileEditTool_js_1.FileEditTool.name: {
            // Strip synthetic old_string/new_string/replace_all from OLD sessions
            // that were resumed from transcripts written before PR #20357, where
            // normalizeToolInput used to synthesize these. Needed so old --resume'd
            // transcripts don't send whole-file copies to the API. New sessions
            // don't need this (synthesis moved to emission time).
            if (input && typeof input === 'object' && 'edits' in input) {
                const { old_string, new_string, replace_all, ...rest } = input;
                return rest;
            }
            return input;
        }
        default:
            return input;
    }
}
