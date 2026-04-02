"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAgentDefinitionsWithOverrides = void 0;
exports.isBuiltInAgent = isBuiltInAgent;
exports.isCustomAgent = isCustomAgent;
exports.isPluginAgent = isPluginAgent;
exports.getActiveAgentsFromList = getActiveAgentsFromList;
exports.hasRequiredMcpServers = hasRequiredMcpServers;
exports.filterAgentsByMcpRequirements = filterAgentsByMcpRequirements;
exports.clearAgentDefinitionsCache = clearAgentDefinitionsCache;
exports.parseAgentFromJson = parseAgentFromJson;
exports.parseAgentsFromJson = parseAgentsFromJson;
exports.parseAgentFromMarkdown = parseAgentFromMarkdown;
const bun_bundle_1 = require("bun:bundle");
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const path_1 = require("path");
const v4_1 = require("zod/v4");
const paths_js_1 = require("../../memdir/paths.js");
const index_js_1 = require("../../services/analytics/index.js");
const types_js_1 = require("../../services/mcp/types.js");
const debug_js_1 = require("../../utils/debug.js");
const effort_js_1 = require("../../utils/effort.js");
const envUtils_js_1 = require("../../utils/envUtils.js");
const frontmatterParser_js_1 = require("../../utils/frontmatterParser.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const log_js_1 = require("../../utils/log.js");
const markdownConfigLoader_js_1 = require("../../utils/markdownConfigLoader.js");
const PermissionMode_js_1 = require("../../utils/permissions/PermissionMode.js");
const loadPluginAgents_js_1 = require("../../utils/plugins/loadPluginAgents.js");
const types_js_2 = require("../../utils/settings/types.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const constants_js_1 = require("../FileEditTool/constants.js");
const prompt_js_1 = require("../FileReadTool/prompt.js");
const prompt_js_2 = require("../FileWriteTool/prompt.js");
const agentColorManager_js_1 = require("./agentColorManager.js");
const agentMemory_js_1 = require("./agentMemory.js");
const agentMemorySnapshot_js_1 = require("./agentMemorySnapshot.js");
const builtInAgents_js_1 = require("./builtInAgents.js");
// Zod schema for agent MCP server specs
const AgentMcpServerSpecSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.union([
    v4_1.z.string(), // Reference by name
    v4_1.z.record(v4_1.z.string(), (0, types_js_1.McpServerConfigSchema)()), // Inline as { name: config }
]));
// Zod schemas for JSON agent validation
// Note: HooksSchema is lazy so the circular chain AppState -> loadAgentsDir -> settings/types
// is broken at module load time
const AgentJsonSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    description: v4_1.z.string().min(1, 'Description cannot be empty'),
    tools: v4_1.z.array(v4_1.z.string()).optional(),
    disallowedTools: v4_1.z.array(v4_1.z.string()).optional(),
    prompt: v4_1.z.string().min(1, 'Prompt cannot be empty'),
    model: v4_1.z
        .string()
        .trim()
        .min(1, 'Model cannot be empty')
        .transform(m => (m.toLowerCase() === 'inherit' ? 'inherit' : m))
        .optional(),
    effort: v4_1.z.union([v4_1.z.enum(effort_js_1.EFFORT_LEVELS), v4_1.z.number().int()]).optional(),
    permissionMode: v4_1.z.enum(PermissionMode_js_1.PERMISSION_MODES).optional(),
    mcpServers: v4_1.z.array(AgentMcpServerSpecSchema()).optional(),
    hooks: (0, types_js_2.HooksSchema)().optional(),
    maxTurns: v4_1.z.number().int().positive().optional(),
    skills: v4_1.z.array(v4_1.z.string()).optional(),
    initialPrompt: v4_1.z.string().optional(),
    memory: v4_1.z.enum(['user', 'project', 'local']).optional(),
    background: v4_1.z.boolean().optional(),
    isolation: (process.env.USER_TYPE === 'ant'
        ? v4_1.z.enum(['worktree', 'remote'])
        : v4_1.z.enum(['worktree'])).optional(),
}));
const AgentsJsonSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.record(v4_1.z.string(), AgentJsonSchema()));
// Type guards for runtime type checking
function isBuiltInAgent(agent) {
    return agent.source === 'built-in';
}
function isCustomAgent(agent) {
    return agent.source !== 'built-in' && agent.source !== 'plugin';
}
function isPluginAgent(agent) {
    return agent.source === 'plugin';
}
function getActiveAgentsFromList(allAgents) {
    const builtInAgents = allAgents.filter(a => a.source === 'built-in');
    const pluginAgents = allAgents.filter(a => a.source === 'plugin');
    const userAgents = allAgents.filter(a => a.source === 'userSettings');
    const projectAgents = allAgents.filter(a => a.source === 'projectSettings');
    const managedAgents = allAgents.filter(a => a.source === 'policySettings');
    const flagAgents = allAgents.filter(a => a.source === 'flagSettings');
    const agentGroups = [
        builtInAgents,
        pluginAgents,
        userAgents,
        projectAgents,
        flagAgents,
        managedAgents,
    ];
    const agentMap = new Map();
    for (const agents of agentGroups) {
        for (const agent of agents) {
            agentMap.set(agent.agentType, agent);
        }
    }
    return Array.from(agentMap.values());
}
/**
 * Checks if an agent's required MCP servers are available.
 * Returns true if no requirements or all requirements are met.
 * @param agent The agent to check
 * @param availableServers List of available MCP server names (e.g., from mcp.clients)
 */
function hasRequiredMcpServers(agent, availableServers) {
    if (!agent.requiredMcpServers || agent.requiredMcpServers.length === 0) {
        return true;
    }
    // Each required pattern must match at least one available server (case-insensitive)
    return agent.requiredMcpServers.every(pattern => availableServers.some(server => server.toLowerCase().includes(pattern.toLowerCase())));
}
/**
 * Filters agents based on MCP server requirements.
 * Only returns agents whose required MCP servers are available.
 * @param agents List of agents to filter
 * @param availableServers List of available MCP server names
 */
function filterAgentsByMcpRequirements(agents, availableServers) {
    return agents.filter(agent => hasRequiredMcpServers(agent, availableServers));
}
/**
 * Check for and initialize agent memory from project snapshots.
 * For agents with memory enabled, copies snapshot to local if no local memory exists.
 * For agents with newer snapshots, logs a debug message (user prompt TODO).
 */
async function initializeAgentMemorySnapshots(agents) {
    await Promise.all(agents.map(async (agent) => {
        if (agent.memory !== 'user')
            return;
        const result = await (0, agentMemorySnapshot_js_1.checkAgentMemorySnapshot)(agent.agentType, agent.memory);
        switch (result.action) {
            case 'initialize':
                (0, debug_js_1.logForDebugging)(`Initializing ${agent.agentType} memory from project snapshot`);
                await (0, agentMemorySnapshot_js_1.initializeFromSnapshot)(agent.agentType, agent.memory, result.snapshotTimestamp);
                break;
            case 'prompt-update':
                agent.pendingSnapshotUpdate = {
                    snapshotTimestamp: result.snapshotTimestamp,
                };
                (0, debug_js_1.logForDebugging)(`Newer snapshot available for ${agent.agentType} memory (snapshot: ${result.snapshotTimestamp})`);
                break;
        }
    }));
}
exports.getAgentDefinitionsWithOverrides = (0, memoize_js_1.default)(async (cwd) => {
    // Simple mode: skip custom agents, only return built-ins
    if ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_SIMPLE)) {
        const builtInAgents = (0, builtInAgents_js_1.getBuiltInAgents)();
        return {
            activeAgents: builtInAgents,
            allAgents: builtInAgents,
        };
    }
    try {
        const markdownFiles = await (0, markdownConfigLoader_js_1.loadMarkdownFilesForSubdir)('agents', cwd);
        const failedFiles = [];
        const customAgents = markdownFiles
            .map(({ filePath, baseDir, frontmatter, content, source }) => {
            const agent = parseAgentFromMarkdown(filePath, baseDir, frontmatter, content, source);
            if (!agent) {
                // Skip non-agent markdown files silently (e.g., reference docs
                // co-located with agent definitions). Only report errors for files
                // that look like agent attempts (have a 'name' field in frontmatter).
                if (!frontmatter['name']) {
                    return null;
                }
                const errorMsg = getParseError(frontmatter);
                failedFiles.push({ path: filePath, error: errorMsg });
                (0, debug_js_1.logForDebugging)(`Failed to parse agent from ${filePath}: ${errorMsg}`);
                (0, index_js_1.logEvent)('tengu_agent_parse_error', {
                    error: errorMsg,
                    location: source,
                });
                return null;
            }
            return agent;
        })
            .filter(agent => agent !== null);
        // Kick off plugin agent loading concurrently with memory snapshot init —
        // loadPluginAgents is memoized and takes no args, so it's independent.
        // Join both so neither becomes a floating promise if the other throws.
        let pluginAgentsPromise = (0, loadPluginAgents_js_1.loadPluginAgents)();
        if ((0, bun_bundle_1.feature)('AGENT_MEMORY_SNAPSHOT') && (0, paths_js_1.isAutoMemoryEnabled)()) {
            const [pluginAgents_] = await Promise.all([
                pluginAgentsPromise,
                initializeAgentMemorySnapshots(customAgents),
            ]);
            pluginAgentsPromise = Promise.resolve(pluginAgents_);
        }
        const pluginAgents = await pluginAgentsPromise;
        const builtInAgents = (0, builtInAgents_js_1.getBuiltInAgents)();
        const allAgentsList = [
            ...builtInAgents,
            ...pluginAgents,
            ...customAgents,
        ];
        const activeAgents = getActiveAgentsFromList(allAgentsList);
        // Initialize colors for all active agents
        for (const agent of activeAgents) {
            if (agent.color) {
                (0, agentColorManager_js_1.setAgentColor)(agent.agentType, agent.color);
            }
        }
        return {
            activeAgents,
            allAgents: allAgentsList,
            failedFiles: failedFiles.length > 0 ? failedFiles : undefined,
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        (0, debug_js_1.logForDebugging)(`Error loading agent definitions: ${errorMessage}`);
        (0, log_js_1.logError)(error);
        // Even on error, return the built-in agents
        const builtInAgents = (0, builtInAgents_js_1.getBuiltInAgents)();
        return {
            activeAgents: builtInAgents,
            allAgents: builtInAgents,
            failedFiles: [{ path: 'unknown', error: errorMessage }],
        };
    }
});
function clearAgentDefinitionsCache() {
    exports.getAgentDefinitionsWithOverrides.cache.clear?.();
    (0, loadPluginAgents_js_1.clearPluginAgentCache)();
}
/**
 * Helper to determine the specific parsing error for an agent file
 */
function getParseError(frontmatter) {
    const agentType = frontmatter['name'];
    const description = frontmatter['description'];
    if (!agentType || typeof agentType !== 'string') {
        return 'Missing required "name" field in frontmatter';
    }
    if (!description || typeof description !== 'string') {
        return 'Missing required "description" field in frontmatter';
    }
    return 'Unknown parsing error';
}
/**
 * Parse hooks from frontmatter using the HooksSchema
 * @param frontmatter The frontmatter object containing potential hooks
 * @param agentType The agent type for logging purposes
 * @returns Parsed hooks settings or undefined if invalid/missing
 */
function parseHooksFromFrontmatter(frontmatter, agentType) {
    if (!frontmatter.hooks) {
        return undefined;
    }
    const result = (0, types_js_2.HooksSchema)().safeParse(frontmatter.hooks);
    if (!result.success) {
        (0, debug_js_1.logForDebugging)(`Invalid hooks in agent '${agentType}': ${result.error.message}`);
        return undefined;
    }
    return result.data;
}
/**
 * Parses agent definition from JSON data
 */
function parseAgentFromJson(name, definition, source = 'flagSettings') {
    try {
        const parsed = AgentJsonSchema().parse(definition);
        let tools = (0, markdownConfigLoader_js_1.parseAgentToolsFromFrontmatter)(parsed.tools);
        // If memory is enabled, inject Write/Edit/Read tools for memory access
        if ((0, paths_js_1.isAutoMemoryEnabled)() && parsed.memory && tools !== undefined) {
            const toolSet = new Set(tools);
            for (const tool of [
                prompt_js_2.FILE_WRITE_TOOL_NAME,
                constants_js_1.FILE_EDIT_TOOL_NAME,
                prompt_js_1.FILE_READ_TOOL_NAME,
            ]) {
                if (!toolSet.has(tool)) {
                    tools = [...tools, tool];
                }
            }
        }
        const disallowedTools = parsed.disallowedTools !== undefined
            ? (0, markdownConfigLoader_js_1.parseAgentToolsFromFrontmatter)(parsed.disallowedTools)
            : undefined;
        const systemPrompt = parsed.prompt;
        const agent = {
            agentType: name,
            whenToUse: parsed.description,
            ...(tools !== undefined ? { tools } : {}),
            ...(disallowedTools !== undefined ? { disallowedTools } : {}),
            getSystemPrompt: () => {
                if ((0, paths_js_1.isAutoMemoryEnabled)() && parsed.memory) {
                    return (systemPrompt + '\n\n' + (0, agentMemory_js_1.loadAgentMemoryPrompt)(name, parsed.memory));
                }
                return systemPrompt;
            },
            source,
            ...(parsed.model ? { model: parsed.model } : {}),
            ...(parsed.effort !== undefined ? { effort: parsed.effort } : {}),
            ...(parsed.permissionMode
                ? { permissionMode: parsed.permissionMode }
                : {}),
            ...(parsed.mcpServers && parsed.mcpServers.length > 0
                ? { mcpServers: parsed.mcpServers }
                : {}),
            ...(parsed.hooks ? { hooks: parsed.hooks } : {}),
            ...(parsed.maxTurns !== undefined ? { maxTurns: parsed.maxTurns } : {}),
            ...(parsed.skills && parsed.skills.length > 0
                ? { skills: parsed.skills }
                : {}),
            ...(parsed.initialPrompt ? { initialPrompt: parsed.initialPrompt } : {}),
            ...(parsed.background ? { background: parsed.background } : {}),
            ...(parsed.memory ? { memory: parsed.memory } : {}),
            ...(parsed.isolation ? { isolation: parsed.isolation } : {}),
        };
        return agent;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        (0, debug_js_1.logForDebugging)(`Error parsing agent '${name}' from JSON: ${errorMessage}`);
        (0, log_js_1.logError)(error);
        return null;
    }
}
/**
 * Parses multiple agents from a JSON object
 */
function parseAgentsFromJson(agentsJson, source = 'flagSettings') {
    try {
        const parsed = AgentsJsonSchema().parse(agentsJson);
        return Object.entries(parsed)
            .map(([name, def]) => parseAgentFromJson(name, def, source))
            .filter((agent) => agent !== null);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        (0, debug_js_1.logForDebugging)(`Error parsing agents from JSON: ${errorMessage}`);
        (0, log_js_1.logError)(error);
        return [];
    }
}
/**
 * Parses agent definition from markdown file data
 */
function parseAgentFromMarkdown(filePath, baseDir, frontmatter, content, source) {
    try {
        const agentType = frontmatter['name'];
        let whenToUse = frontmatter['description'];
        // Validate required fields — silently skip files without any agent
        // frontmatter (they're likely co-located reference documentation)
        if (!agentType || typeof agentType !== 'string') {
            return null;
        }
        if (!whenToUse || typeof whenToUse !== 'string') {
            (0, debug_js_1.logForDebugging)(`Agent file ${filePath} is missing required 'description' in frontmatter`);
            return null;
        }
        // Unescape newlines in whenToUse that were escaped for YAML parsing
        whenToUse = whenToUse.replace(/\\n/g, '\n');
        const color = frontmatter['color'];
        const modelRaw = frontmatter['model'];
        let model;
        if (typeof modelRaw === 'string' && modelRaw.trim().length > 0) {
            const trimmed = modelRaw.trim();
            model = trimmed.toLowerCase() === 'inherit' ? 'inherit' : trimmed;
        }
        // Parse background flag
        const backgroundRaw = frontmatter['background'];
        if (backgroundRaw !== undefined &&
            backgroundRaw !== 'true' &&
            backgroundRaw !== 'false' &&
            backgroundRaw !== true &&
            backgroundRaw !== false) {
            (0, debug_js_1.logForDebugging)(`Agent file ${filePath} has invalid background value '${backgroundRaw}'. Must be 'true', 'false', or omitted.`);
        }
        const background = backgroundRaw === 'true' || backgroundRaw === true ? true : undefined;
        // Parse memory scope
        const VALID_MEMORY_SCOPES = ['user', 'project', 'local'];
        const memoryRaw = frontmatter['memory'];
        let memory;
        if (memoryRaw !== undefined) {
            if (VALID_MEMORY_SCOPES.includes(memoryRaw)) {
                memory = memoryRaw;
            }
            else {
                (0, debug_js_1.logForDebugging)(`Agent file ${filePath} has invalid memory value '${memoryRaw}'. Valid options: ${VALID_MEMORY_SCOPES.join(', ')}`);
            }
        }
        const VALID_ISOLATION_MODES = process.env.USER_TYPE === 'ant' ? ['worktree', 'remote'] : ['worktree'];
        const isolationRaw = frontmatter['isolation'];
        let isolation;
        if (isolationRaw !== undefined) {
            if (VALID_ISOLATION_MODES.includes(isolationRaw)) {
                isolation = isolationRaw;
            }
            else {
                (0, debug_js_1.logForDebugging)(`Agent file ${filePath} has invalid isolation value '${isolationRaw}'. Valid options: ${VALID_ISOLATION_MODES.join(', ')}`);
            }
        }
        // Parse effort from frontmatter (supports string levels and integers)
        const effortRaw = frontmatter['effort'];
        const parsedEffort = effortRaw !== undefined ? (0, effort_js_1.parseEffortValue)(effortRaw) : undefined;
        if (effortRaw !== undefined && parsedEffort === undefined) {
            (0, debug_js_1.logForDebugging)(`Agent file ${filePath} has invalid effort '${effortRaw}'. Valid options: ${effort_js_1.EFFORT_LEVELS.join(', ')} or an integer`);
        }
        // Parse permissionMode from frontmatter
        const permissionModeRaw = frontmatter['permissionMode'];
        const isValidPermissionMode = permissionModeRaw &&
            PermissionMode_js_1.PERMISSION_MODES.includes(permissionModeRaw);
        if (permissionModeRaw && !isValidPermissionMode) {
            const errorMsg = `Agent file ${filePath} has invalid permissionMode '${permissionModeRaw}'. Valid options: ${PermissionMode_js_1.PERMISSION_MODES.join(', ')}`;
            (0, debug_js_1.logForDebugging)(errorMsg);
        }
        // Parse maxTurns from frontmatter
        const maxTurnsRaw = frontmatter['maxTurns'];
        const maxTurns = (0, frontmatterParser_js_1.parsePositiveIntFromFrontmatter)(maxTurnsRaw);
        if (maxTurnsRaw !== undefined && maxTurns === undefined) {
            (0, debug_js_1.logForDebugging)(`Agent file ${filePath} has invalid maxTurns '${maxTurnsRaw}'. Must be a positive integer.`);
        }
        // Extract filename without extension
        const filename = (0, path_1.basename)(filePath, '.md');
        // Parse tools from frontmatter
        let tools = (0, markdownConfigLoader_js_1.parseAgentToolsFromFrontmatter)(frontmatter['tools']);
        // If memory is enabled, inject Write/Edit/Read tools for memory access
        if ((0, paths_js_1.isAutoMemoryEnabled)() && memory && tools !== undefined) {
            const toolSet = new Set(tools);
            for (const tool of [
                prompt_js_2.FILE_WRITE_TOOL_NAME,
                constants_js_1.FILE_EDIT_TOOL_NAME,
                prompt_js_1.FILE_READ_TOOL_NAME,
            ]) {
                if (!toolSet.has(tool)) {
                    tools = [...tools, tool];
                }
            }
        }
        // Parse disallowedTools from frontmatter
        const disallowedToolsRaw = frontmatter['disallowedTools'];
        const disallowedTools = disallowedToolsRaw !== undefined
            ? (0, markdownConfigLoader_js_1.parseAgentToolsFromFrontmatter)(disallowedToolsRaw)
            : undefined;
        // Parse skills from frontmatter
        const skills = (0, markdownConfigLoader_js_1.parseSlashCommandToolsFromFrontmatter)(frontmatter['skills']);
        const initialPromptRaw = frontmatter['initialPrompt'];
        const initialPrompt = typeof initialPromptRaw === 'string' && initialPromptRaw.trim()
            ? initialPromptRaw
            : undefined;
        // Parse mcpServers from frontmatter using same Zod validation as JSON agents
        const mcpServersRaw = frontmatter['mcpServers'];
        let mcpServers;
        if (Array.isArray(mcpServersRaw)) {
            mcpServers = mcpServersRaw
                .map(item => {
                const result = AgentMcpServerSpecSchema().safeParse(item);
                if (result.success) {
                    return result.data;
                }
                (0, debug_js_1.logForDebugging)(`Agent file ${filePath} has invalid mcpServers item: ${(0, slowOperations_js_1.jsonStringify)(item)}. Error: ${result.error.message}`);
                return null;
            })
                .filter((item) => item !== null);
        }
        // Parse hooks from frontmatter
        const hooks = parseHooksFromFrontmatter(frontmatter, agentType);
        const systemPrompt = content.trim();
        const agentDef = {
            baseDir,
            agentType: agentType,
            whenToUse: whenToUse,
            ...(tools !== undefined ? { tools } : {}),
            ...(disallowedTools !== undefined ? { disallowedTools } : {}),
            ...(skills !== undefined ? { skills } : {}),
            ...(initialPrompt !== undefined ? { initialPrompt } : {}),
            ...(mcpServers !== undefined && mcpServers.length > 0
                ? { mcpServers }
                : {}),
            ...(hooks !== undefined ? { hooks } : {}),
            getSystemPrompt: () => {
                if ((0, paths_js_1.isAutoMemoryEnabled)() && memory) {
                    const memoryPrompt = (0, agentMemory_js_1.loadAgentMemoryPrompt)(agentType, memory);
                    return systemPrompt + '\n\n' + memoryPrompt;
                }
                return systemPrompt;
            },
            source,
            filename,
            ...(color && typeof color === 'string' && agentColorManager_js_1.AGENT_COLORS.includes(color)
                ? { color }
                : {}),
            ...(model !== undefined ? { model } : {}),
            ...(parsedEffort !== undefined ? { effort: parsedEffort } : {}),
            ...(isValidPermissionMode
                ? { permissionMode: permissionModeRaw }
                : {}),
            ...(maxTurns !== undefined ? { maxTurns } : {}),
            ...(background ? { background } : {}),
            ...(memory ? { memory } : {}),
            ...(isolation ? { isolation } : {}),
        };
        return agentDef;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        (0, debug_js_1.logForDebugging)(`Error parsing agent from ${filePath}: ${errorMessage}`);
        (0, log_js_1.logError)(error);
        return null;
    }
}
