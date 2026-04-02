"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sdkCompatToolName = sdkCompatToolName;
exports.buildSystemInitMessage = buildSystemInitMessage;
const bun_bundle_1 = require("bun:bundle");
const crypto_1 = require("crypto");
const state_js_1 = require("src/bootstrap/state.js");
const outputStyles_js_1 = require("src/constants/outputStyles.js");
const constants_js_1 = require("src/tools/AgentTool/constants.js");
const auth_js_1 = require("../auth.js");
const cwd_js_1 = require("../cwd.js");
const fastMode_js_1 = require("../fastMode.js");
const settings_js_1 = require("../settings/settings.js");
// TODO(next-minor): remove this translation once SDK consumers have migrated
// to the 'Agent' tool name. The wire name was renamed Task → Agent in #19647,
// but emitting the new name in init/result events broke SDK consumers on a
// patch-level release. Keep emitting 'Task' until the next minor.
function sdkCompatToolName(name) {
    return name === constants_js_1.AGENT_TOOL_NAME ? constants_js_1.LEGACY_AGENT_TOOL_NAME : name;
}
/**
 * Build the `system/init` SDKMessage — the first message on the SDK stream
 * carrying session metadata (cwd, tools, model, commands, etc.) that remote
 * clients use to render pickers and gate UI.
 *
 * Called from two paths that must produce identical shapes:
 *   - QueryEngine (spawn-bridge / print-mode / SDK) — yielded as the first
 *     stream message per query turn
 *   - useReplBridge (REPL Remote Control) — sent via writeSdkMessages() on
 *     bridge connect, since REPL uses query() directly and never hits the
 *     QueryEngine SDKMessage layer
 */
function buildSystemInitMessage(inputs) {
    const settings = (0, settings_js_1.getSettings_DEPRECATED)();
    const outputStyle = settings?.outputStyle ?? outputStyles_js_1.DEFAULT_OUTPUT_STYLE_NAME;
    const initMessage = {
        type: 'system',
        subtype: 'init',
        cwd: (0, cwd_js_1.getCwd)(),
        session_id: (0, state_js_1.getSessionId)(),
        tools: inputs.tools.map(tool => sdkCompatToolName(tool.name)),
        mcp_servers: inputs.mcpClients.map(client => ({
            name: client.name,
            status: client.type,
        })),
        model: inputs.model,
        permissionMode: inputs.permissionMode,
        slash_commands: inputs.commands
            .filter(c => c.userInvocable !== false)
            .map(c => c.name),
        apiKeySource: (0, auth_js_1.getAnthropicApiKeyWithSource)().source,
        betas: (0, state_js_1.getSdkBetas)(),
        claude_code_version: MACRO.VERSION,
        output_style: outputStyle,
        agents: inputs.agents.map(agent => agent.agentType),
        skills: inputs.skills
            .filter(s => s.userInvocable !== false)
            .map(skill => skill.name),
        plugins: inputs.plugins.map(plugin => ({
            name: plugin.name,
            path: plugin.path,
            source: plugin.source,
        })),
        uuid: (0, crypto_1.randomUUID)(),
    };
    // Hidden from public SDK types — ant-only UDS messaging socket path
    if ((0, bun_bundle_1.feature)('UDS_INBOX')) {
        /* eslint-disable @typescript-eslint/no-require-imports */
        ;
        initMessage.messaging_socket_path =
            require('../udsMessaging.js').getUdsMessagingSocketPath();
        /* eslint-enable @typescript-eslint/no-require-imports */
    }
    initMessage.fast_mode_state = (0, fastMode_js_1.getFastModeState)(inputs.model, inputs.fastMode);
    return initMessage;
}
