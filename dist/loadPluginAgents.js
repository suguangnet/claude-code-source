"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPluginAgents = void 0;
exports.clearPluginAgentCache = clearPluginAgentCache;
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const path_1 = require("path");
const paths_js_1 = require("../../memdir/paths.js");
const agentMemory_js_1 = require("../../tools/AgentTool/agentMemory.js");
const constants_js_1 = require("../../tools/FileEditTool/constants.js");
const prompt_js_1 = require("../../tools/FileReadTool/prompt.js");
const prompt_js_2 = require("../../tools/FileWriteTool/prompt.js");
const plugin_js_1 = require("../../types/plugin.js");
const debug_js_1 = require("../debug.js");
const effort_js_1 = require("../effort.js");
const frontmatterParser_js_1 = require("../frontmatterParser.js");
const fsOperations_js_1 = require("../fsOperations.js");
const markdownConfigLoader_js_1 = require("../markdownConfigLoader.js");
const pluginLoader_js_1 = require("./pluginLoader.js");
const pluginOptionsStorage_js_1 = require("./pluginOptionsStorage.js");
const walkPluginMarkdown_js_1 = require("./walkPluginMarkdown.js");
const VALID_MEMORY_SCOPES = ['user', 'project', 'local'];
async function loadAgentsFromDirectory(agentsPath, pluginName, sourceName, pluginPath, pluginManifest, loadedPaths) {
    const agents = [];
    await (0, walkPluginMarkdown_js_1.walkPluginMarkdown)(agentsPath, async (fullPath, namespace) => {
        const agent = await loadAgentFromFile(fullPath, pluginName, namespace, sourceName, pluginPath, pluginManifest, loadedPaths);
        if (agent)
            agents.push(agent);
    }, { logLabel: 'agents' });
    return agents;
}
async function loadAgentFromFile(filePath, pluginName, namespace, sourceName, pluginPath, pluginManifest, loadedPaths) {
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    if ((0, fsOperations_js_1.isDuplicatePath)(fs, filePath, loadedPaths)) {
        return null;
    }
    try {
        const content = await fs.readFile(filePath, { encoding: 'utf-8' });
        const { frontmatter, content: markdownContent } = (0, frontmatterParser_js_1.parseFrontmatter)(content, filePath);
        const baseAgentName = frontmatter.name || (0, path_1.basename)(filePath).replace(/\.md$/, '');
        // Apply namespace prefixing like we do for commands
        const nameParts = [pluginName, ...namespace, baseAgentName];
        const agentType = nameParts.join(':');
        // Parse agent metadata from frontmatter
        const whenToUse = (0, frontmatterParser_js_1.coerceDescriptionToString)(frontmatter.description, agentType) ??
            (0, frontmatterParser_js_1.coerceDescriptionToString)(frontmatter['when-to-use'], agentType) ??
            `Agent from ${pluginName} plugin`;
        let tools = (0, markdownConfigLoader_js_1.parseAgentToolsFromFrontmatter)(frontmatter.tools);
        const skills = (0, markdownConfigLoader_js_1.parseSlashCommandToolsFromFrontmatter)(frontmatter.skills);
        const color = frontmatter.color;
        const modelRaw = frontmatter.model;
        let model;
        if (typeof modelRaw === 'string' && modelRaw.trim().length > 0) {
            const trimmed = modelRaw.trim();
            model = trimmed.toLowerCase() === 'inherit' ? 'inherit' : trimmed;
        }
        const backgroundRaw = frontmatter.background;
        const background = backgroundRaw === 'true' || backgroundRaw === true ? true : undefined;
        // Substitute ${CLAUDE_PLUGIN_ROOT} so agents can reference bundled files,
        // and ${user_config.X} (non-sensitive only) so they can embed configured
        // usernames, endpoints, etc. Sensitive refs resolve to a placeholder.
        let systemPrompt = (0, pluginOptionsStorage_js_1.substitutePluginVariables)(markdownContent.trim(), {
            path: pluginPath,
            source: sourceName,
        });
        if (pluginManifest.userConfig) {
            systemPrompt = (0, pluginOptionsStorage_js_1.substituteUserConfigInContent)(systemPrompt, (0, pluginOptionsStorage_js_1.loadPluginOptions)(sourceName), pluginManifest.userConfig);
        }
        // Parse memory scope
        const memoryRaw = frontmatter.memory;
        let memory;
        if (memoryRaw !== undefined) {
            if (VALID_MEMORY_SCOPES.includes(memoryRaw)) {
                memory = memoryRaw;
            }
            else {
                (0, debug_js_1.logForDebugging)(`Plugin agent file ${filePath} has invalid memory value '${memoryRaw}'. Valid options: ${VALID_MEMORY_SCOPES.join(', ')}`);
            }
        }
        // Parse isolation mode
        const isolationRaw = frontmatter.isolation;
        const isolation = isolationRaw === 'worktree' ? 'worktree' : undefined;
        // Parse effort (string level or integer)
        const effortRaw = frontmatter.effort;
        const effort = effortRaw !== undefined ? (0, effort_js_1.parseEffortValue)(effortRaw) : undefined;
        if (effortRaw !== undefined && effort === undefined) {
            (0, debug_js_1.logForDebugging)(`Plugin agent file ${filePath} has invalid effort '${effortRaw}'. Valid options: ${effort_js_1.EFFORT_LEVELS.join(', ')} or an integer`);
        }
        // permissionMode, hooks, and mcpServers are intentionally NOT parsed for
        // plugin agents. Plugins are third-party marketplace code; these fields
        // escalate what the agent can do beyond what the user approved at install
        // time. For this level of control, define the agent in .claude/agents/
        // where the user explicitly wrote the frontmatter. (Note: plugins can
        // still ship hooks and MCP servers at the manifest level — that's the
        // install-time trust boundary. Per-agent declarations would let a single
        // agent file buried in agents/ silently add them.) See PR #22558 review.
        for (const field of ['permissionMode', 'hooks', 'mcpServers']) {
            if (frontmatter[field] !== undefined) {
                (0, debug_js_1.logForDebugging)(`Plugin agent file ${filePath} sets ${field}, which is ignored for plugin agents. Use .claude/agents/ for this level of control.`, { level: 'warn' });
            }
        }
        // Parse maxTurns
        const maxTurnsRaw = frontmatter.maxTurns;
        const maxTurns = (0, frontmatterParser_js_1.parsePositiveIntFromFrontmatter)(maxTurnsRaw);
        if (maxTurnsRaw !== undefined && maxTurns === undefined) {
            (0, debug_js_1.logForDebugging)(`Plugin agent file ${filePath} has invalid maxTurns '${maxTurnsRaw}'. Must be a positive integer.`);
        }
        // Parse disallowedTools
        const disallowedTools = frontmatter.disallowedTools !== undefined
            ? (0, markdownConfigLoader_js_1.parseAgentToolsFromFrontmatter)(frontmatter.disallowedTools)
            : undefined;
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
        return {
            agentType,
            whenToUse,
            tools,
            ...(disallowedTools !== undefined ? { disallowedTools } : {}),
            ...(skills !== undefined ? { skills } : {}),
            getSystemPrompt: () => {
                if ((0, paths_js_1.isAutoMemoryEnabled)() && memory) {
                    const memoryPrompt = (0, agentMemory_js_1.loadAgentMemoryPrompt)(agentType, memory);
                    return systemPrompt + '\n\n' + memoryPrompt;
                }
                return systemPrompt;
            },
            source: 'plugin',
            color,
            model,
            filename: baseAgentName,
            plugin: sourceName,
            ...(background ? { background } : {}),
            ...(memory ? { memory } : {}),
            ...(isolation ? { isolation } : {}),
            ...(effort !== undefined ? { effort } : {}),
            ...(maxTurns !== undefined ? { maxTurns } : {}),
        };
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`Failed to load agent from ${filePath}: ${error}`, {
            level: 'error',
        });
        return null;
    }
}
exports.loadPluginAgents = (0, memoize_js_1.default)(async () => {
    // Only load agents from enabled plugins
    const { enabled, errors } = await (0, pluginLoader_js_1.loadAllPluginsCacheOnly)();
    if (errors.length > 0) {
        (0, debug_js_1.logForDebugging)(`Plugin loading errors: ${errors.map(e => (0, plugin_js_1.getPluginErrorMessage)(e)).join(', ')}`);
    }
    // Process plugins in parallel; each plugin has its own loadedPaths scope
    const perPluginAgents = await Promise.all(enabled.map(async (plugin) => {
        // Track loaded file paths to prevent duplicates within this plugin
        const loadedPaths = new Set();
        const pluginAgents = [];
        // Load agents from default agents directory
        if (plugin.agentsPath) {
            try {
                const agents = await loadAgentsFromDirectory(plugin.agentsPath, plugin.name, plugin.source, plugin.path, plugin.manifest, loadedPaths);
                pluginAgents.push(...agents);
                if (agents.length > 0) {
                    (0, debug_js_1.logForDebugging)(`Loaded ${agents.length} agents from plugin ${plugin.name} default directory`);
                }
            }
            catch (error) {
                (0, debug_js_1.logForDebugging)(`Failed to load agents from plugin ${plugin.name} default directory: ${error}`, { level: 'error' });
            }
        }
        // Load agents from additional paths specified in manifest
        if (plugin.agentsPaths) {
            // Process all agentsPaths in parallel. isDuplicatePath is synchronous
            // (check-and-add), so concurrent access to loadedPaths is safe.
            const pathResults = await Promise.all(plugin.agentsPaths.map(async (agentPath) => {
                try {
                    const fs = (0, fsOperations_js_1.getFsImplementation)();
                    const stats = await fs.stat(agentPath);
                    if (stats.isDirectory()) {
                        // Load all .md files from directory
                        const agents = await loadAgentsFromDirectory(agentPath, plugin.name, plugin.source, plugin.path, plugin.manifest, loadedPaths);
                        if (agents.length > 0) {
                            (0, debug_js_1.logForDebugging)(`Loaded ${agents.length} agents from plugin ${plugin.name} custom path: ${agentPath}`);
                        }
                        return agents;
                    }
                    else if (stats.isFile() && agentPath.endsWith('.md')) {
                        // Load single agent file
                        const agent = await loadAgentFromFile(agentPath, plugin.name, [], plugin.source, plugin.path, plugin.manifest, loadedPaths);
                        if (agent) {
                            (0, debug_js_1.logForDebugging)(`Loaded agent from plugin ${plugin.name} custom file: ${agentPath}`);
                            return [agent];
                        }
                    }
                    return [];
                }
                catch (error) {
                    (0, debug_js_1.logForDebugging)(`Failed to load agents from plugin ${plugin.name} custom path ${agentPath}: ${error}`, { level: 'error' });
                    return [];
                }
            }));
            for (const agents of pathResults) {
                pluginAgents.push(...agents);
            }
        }
        return pluginAgents;
    }));
    const allAgents = perPluginAgents.flat();
    (0, debug_js_1.logForDebugging)(`Total plugin agents loaded: ${allAgents.length}`);
    return allAgents;
});
function clearPluginAgentCache() {
    exports.loadPluginAgents.cache?.clear?.();
}
