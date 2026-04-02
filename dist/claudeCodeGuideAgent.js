"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLAUDE_CODE_GUIDE_AGENT = exports.CLAUDE_CODE_GUIDE_AGENT_TYPE = void 0;
const toolName_js_1 = require("src/tools/BashTool/toolName.js");
const prompt_js_1 = require("src/tools/FileReadTool/prompt.js");
const prompt_js_2 = require("src/tools/GlobTool/prompt.js");
const prompt_js_3 = require("src/tools/GrepTool/prompt.js");
const constants_js_1 = require("src/tools/SendMessageTool/constants.js");
const prompt_js_4 = require("src/tools/WebFetchTool/prompt.js");
const prompt_js_5 = require("src/tools/WebSearchTool/prompt.js");
const auth_js_1 = require("src/utils/auth.js");
const embeddedTools_js_1 = require("src/utils/embeddedTools.js");
const settings_js_1 = require("src/utils/settings/settings.js");
const slowOperations_js_1 = require("../../../utils/slowOperations.js");
const CLAUDE_CODE_DOCS_MAP_URL = 'https://code.claude.com/docs/en/claude_code_docs_map.md';
const CDP_DOCS_MAP_URL = 'https://platform.claude.com/llms.txt';
exports.CLAUDE_CODE_GUIDE_AGENT_TYPE = 'claude-code-guide';
function getClaudeCodeGuideBasePrompt() {
    // Ant-native builds alias find/grep to embedded bfs/ugrep and remove the
    // dedicated Glob/Grep tools, so point at find/grep instead.
    const localSearchHint = (0, embeddedTools_js_1.hasEmbeddedSearchTools)()
        ? `${prompt_js_1.FILE_READ_TOOL_NAME}, \`find\`, and \`grep\``
        : `${prompt_js_1.FILE_READ_TOOL_NAME}, ${prompt_js_2.GLOB_TOOL_NAME}, and ${prompt_js_3.GREP_TOOL_NAME}`;
    return `You are the Claude guide agent. Your primary responsibility is helping users understand and use Claude Code, the Claude Agent SDK, and the Claude API (formerly the Anthropic API) effectively.

**Your expertise spans three domains:**

1. **Claude Code** (the CLI tool): Installation, configuration, hooks, skills, MCP servers, keyboard shortcuts, IDE integrations, settings, and workflows.

2. **Claude Agent SDK**: A framework for building custom AI agents based on Claude Code technology. Available for Node.js/TypeScript and Python.

3. **Claude API**: The Claude API (formerly known as the Anthropic API) for direct model interaction, tool use, and integrations.

**Documentation sources:**

- **Claude Code docs** (${CLAUDE_CODE_DOCS_MAP_URL}): Fetch this for questions about the Claude Code CLI tool, including:
  - Installation, setup, and getting started
  - Hooks (pre/post command execution)
  - Custom skills
  - MCP server configuration
  - IDE integrations (VS Code, JetBrains)
  - Settings files and configuration
  - Keyboard shortcuts and hotkeys
  - Subagents and plugins
  - Sandboxing and security

- **Claude Agent SDK docs** (${CDP_DOCS_MAP_URL}): Fetch this for questions about building agents with the SDK, including:
  - SDK overview and getting started (Python and TypeScript)
  - Agent configuration + custom tools
  - Session management and permissions
  - MCP integration in agents
  - Hosting and deployment
  - Cost tracking and context management
  Note: Agent SDK docs are part of the Claude API documentation at the same URL.

- **Claude API docs** (${CDP_DOCS_MAP_URL}): Fetch this for questions about the Claude API (formerly the Anthropic API), including:
  - Messages API and streaming
  - Tool use (function calling) and Anthropic-defined tools (computer use, code execution, web search, text editor, bash, programmatic tool calling, tool search tool, context editing, Files API, structured outputs)
  - Vision, PDF support, and citations
  - Extended thinking and structured outputs
  - MCP connector for remote MCP servers
  - Cloud provider integrations (Bedrock, Vertex AI, Foundry)

**Approach:**
1. Determine which domain the user's question falls into
2. Use ${prompt_js_4.WEB_FETCH_TOOL_NAME} to fetch the appropriate docs map
3. Identify the most relevant documentation URLs from the map
4. Fetch the specific documentation pages
5. Provide clear, actionable guidance based on official documentation
6. Use ${prompt_js_5.WEB_SEARCH_TOOL_NAME} if docs don't cover the topic
7. Reference local project files (CLAUDE.md, .claude/ directory) when relevant using ${localSearchHint}

**Guidelines:**
- Always prioritize official documentation over assumptions
- Keep responses concise and actionable
- Include specific examples or code snippets when helpful
- Reference exact documentation URLs in your responses
- Help users discover features by proactively suggesting related commands, shortcuts, or capabilities

Complete the user's request by providing accurate, documentation-based guidance.`;
}
function getFeedbackGuideline() {
    // For 3P services (Bedrock/Vertex/Foundry), /feedback command is disabled
    // Direct users to the appropriate feedback channel instead
    if ((0, auth_js_1.isUsing3PServices)()) {
        return `- When you cannot find an answer or the feature doesn't exist, direct the user to ${MACRO.ISSUES_EXPLAINER}`;
    }
    return "- When you cannot find an answer or the feature doesn't exist, direct the user to use /feedback to report a feature request or bug";
}
exports.CLAUDE_CODE_GUIDE_AGENT = {
    agentType: exports.CLAUDE_CODE_GUIDE_AGENT_TYPE,
    whenToUse: `Use this agent when the user asks questions ("Can Claude...", "Does Claude...", "How do I...") about: (1) Claude Code (the CLI tool) - features, hooks, slash commands, MCP servers, settings, IDE integrations, keyboard shortcuts; (2) Claude Agent SDK - building custom agents; (3) Claude API (formerly Anthropic API) - API usage, tool use, Anthropic SDK usage. **IMPORTANT:** Before spawning a new agent, check if there is already a running or recently completed claude-code-guide agent that you can continue via ${constants_js_1.SEND_MESSAGE_TOOL_NAME}.`,
    // Ant-native builds: Glob/Grep tools are removed; use Bash (with embedded
    // bfs/ugrep via find/grep aliases) for local file search instead.
    tools: (0, embeddedTools_js_1.hasEmbeddedSearchTools)()
        ? [
            toolName_js_1.BASH_TOOL_NAME,
            prompt_js_1.FILE_READ_TOOL_NAME,
            prompt_js_4.WEB_FETCH_TOOL_NAME,
            prompt_js_5.WEB_SEARCH_TOOL_NAME,
        ]
        : [
            prompt_js_2.GLOB_TOOL_NAME,
            prompt_js_3.GREP_TOOL_NAME,
            prompt_js_1.FILE_READ_TOOL_NAME,
            prompt_js_4.WEB_FETCH_TOOL_NAME,
            prompt_js_5.WEB_SEARCH_TOOL_NAME,
        ],
    source: 'built-in',
    baseDir: 'built-in',
    model: 'haiku',
    permissionMode: 'dontAsk',
    getSystemPrompt({ toolUseContext }) {
        const commands = toolUseContext.options.commands;
        // Build context sections
        const contextSections = [];
        // 1. Custom skills
        const customCommands = commands.filter(cmd => cmd.type === 'prompt');
        if (customCommands.length > 0) {
            const commandList = customCommands
                .map(cmd => `- /${cmd.name}: ${cmd.description}`)
                .join('\n');
            contextSections.push(`**Available custom skills in this project:**\n${commandList}`);
        }
        // 2. Custom agents from .claude/agents/
        const customAgents = toolUseContext.options.agentDefinitions.activeAgents.filter((a) => a.source !== 'built-in');
        if (customAgents.length > 0) {
            const agentList = customAgents
                .map((a) => `- ${a.agentType}: ${a.whenToUse}`)
                .join('\n');
            contextSections.push(`**Available custom agents configured:**\n${agentList}`);
        }
        // 3. MCP servers
        const mcpClients = toolUseContext.options.mcpClients;
        if (mcpClients && mcpClients.length > 0) {
            const mcpList = mcpClients
                .map((client) => `- ${client.name}`)
                .join('\n');
            contextSections.push(`**Configured MCP servers:**\n${mcpList}`);
        }
        // 4. Plugin commands
        const pluginCommands = commands.filter(cmd => cmd.type === 'prompt' && cmd.source === 'plugin');
        if (pluginCommands.length > 0) {
            const pluginList = pluginCommands
                .map(cmd => `- /${cmd.name}: ${cmd.description}`)
                .join('\n');
            contextSections.push(`**Available plugin skills:**\n${pluginList}`);
        }
        // 5. User settings
        const settings = (0, settings_js_1.getSettings_DEPRECATED)();
        if (Object.keys(settings).length > 0) {
            // eslint-disable-next-line no-restricted-syntax -- human-facing UI, not tool_result
            const settingsJson = (0, slowOperations_js_1.jsonStringify)(settings, null, 2);
            contextSections.push(`**User's settings.json:**\n\`\`\`json\n${settingsJson}\n\`\`\``);
        }
        // Add the feedback guideline (conditional based on whether user is using 3P services)
        const feedbackGuideline = getFeedbackGuideline();
        const basePromptWithFeedback = `${getClaudeCodeGuideBasePrompt()}
${feedbackGuideline}`;
        // If we have any context to add, append it to the base system prompt
        if (contextSections.length > 0) {
            return `${basePromptWithFeedback}

---

# User's Current Configuration

The user has the following custom setup in their environment:

${contextSections.join('\n\n')}

When answering questions, consider these configured features and proactively suggest them when relevant.`;
        }
        // Return the base prompt if no context to add
        return basePromptWithFeedback;
    },
};
