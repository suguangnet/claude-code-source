"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerClaudeInChromeSkill = registerClaudeInChromeSkill;
const claude_for_chrome_mcp_1 = require("@ant/claude-for-chrome-mcp");
const prompt_js_1 = require("../../utils/claudeInChrome/prompt.js");
const setup_js_1 = require("../../utils/claudeInChrome/setup.js");
const bundledSkills_js_1 = require("../bundledSkills.js");
const CLAUDE_IN_CHROME_MCP_TOOLS = claude_for_chrome_mcp_1.BROWSER_TOOLS.map(tool => `mcp__claude-in-chrome__${tool.name}`);
const SKILL_ACTIVATION_MESSAGE = `
Now that this skill is invoked, you have access to Chrome browser automation tools. You can now use the mcp__claude-in-chrome__* tools to interact with web pages.

IMPORTANT: Start by calling mcp__claude-in-chrome__tabs_context_mcp to get information about the user's current browser tabs.
`;
function registerClaudeInChromeSkill() {
    (0, bundledSkills_js_1.registerBundledSkill)({
        name: 'claude-in-chrome',
        description: 'Automates your Chrome browser to interact with web pages - clicking elements, filling forms, capturing screenshots, reading console logs, and navigating sites. Opens pages in new tabs within your existing Chrome session. Requires site-level permissions before executing (configured in the extension).',
        whenToUse: 'When the user wants to interact with web pages, automate browser tasks, capture screenshots, read console logs, or perform any browser-based actions. Always invoke BEFORE attempting to use any mcp__claude-in-chrome__* tools.',
        allowedTools: CLAUDE_IN_CHROME_MCP_TOOLS,
        userInvocable: true,
        isEnabled: () => (0, setup_js_1.shouldAutoEnableClaudeInChrome)(),
        async getPromptForCommand(args) {
            let prompt = `${prompt_js_1.BASE_CHROME_PROMPT}\n${SKILL_ACTIVATION_MESSAGE}`;
            if (args) {
                prompt += `\n## Task\n\n${args}`;
            }
            return [{ type: 'text', text: prompt }];
        },
    });
}
