"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChromeContext = createChromeContext;
exports.runClaudeInChromeMcpServer = runClaudeInChromeMcpServer;
const claude_for_chrome_mcp_1 = require("@ant/claude-for-chrome-mcp");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const util_1 = require("util");
const datadog_js_1 = require("../../services/analytics/datadog.js");
const firstPartyEventLogger_js_1 = require("../../services/analytics/firstPartyEventLogger.js");
const growthbook_js_1 = require("../../services/analytics/growthbook.js");
const index_js_1 = require("../../services/analytics/index.js");
const sink_js_1 = require("../../services/analytics/sink.js");
const auth_js_1 = require("../auth.js");
const config_js_1 = require("../config.js");
const debug_js_1 = require("../debug.js");
const envUtils_js_1 = require("../envUtils.js");
const sideQuery_js_1 = require("../sideQuery.js");
const common_js_1 = require("./common.js");
const EXTENSION_DOWNLOAD_URL = 'https://claude.ai/chrome';
const BUG_REPORT_URL = 'https://github.com/anthropics/claude-code/issues/new?labels=bug,claude-in-chrome';
// String metadata keys safe to forward to analytics. Keys like error_message
// are excluded because they could contain page content or user data.
const SAFE_BRIDGE_STRING_KEYS = new Set([
    'bridge_status',
    'error_type',
    'tool_name',
]);
const PERMISSION_MODES = [
    'ask',
    'skip_all_permission_checks',
    'follow_a_plan',
];
function isPermissionMode(raw) {
    return PERMISSION_MODES.some(m => m === raw);
}
/**
 * Resolves the Chrome bridge URL based on environment and feature flag.
 * Bridge is used when the feature flag is enabled; ant users always get
 * bridge. API key / 3P users fall back to native messaging.
 */
function getChromeBridgeUrl() {
    const bridgeEnabled = process.env.USER_TYPE === 'ant' ||
        (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_copper_bridge', false);
    if (!bridgeEnabled) {
        return undefined;
    }
    if ((0, envUtils_js_1.isEnvTruthy)(process.env.USE_LOCAL_OAUTH) ||
        (0, envUtils_js_1.isEnvTruthy)(process.env.LOCAL_BRIDGE)) {
        return 'ws://localhost:8765';
    }
    if ((0, envUtils_js_1.isEnvTruthy)(process.env.USE_STAGING_OAUTH)) {
        return 'wss://bridge-staging.claudeusercontent.com';
    }
    return 'wss://bridge.claudeusercontent.com';
}
function isLocalBridge() {
    return ((0, envUtils_js_1.isEnvTruthy)(process.env.USE_LOCAL_OAUTH) ||
        (0, envUtils_js_1.isEnvTruthy)(process.env.LOCAL_BRIDGE));
}
/**
 * Build the ClaudeForChromeContext used by both the subprocess MCP server
 * and the in-process path in the MCP client.
 */
function createChromeContext(env) {
    const logger = new DebugLogger();
    const chromeBridgeUrl = getChromeBridgeUrl();
    logger.info(`Bridge URL: ${chromeBridgeUrl ?? 'none (using native socket)'}`);
    const rawPermissionMode = env?.CLAUDE_CHROME_PERMISSION_MODE ??
        process.env.CLAUDE_CHROME_PERMISSION_MODE;
    let initialPermissionMode;
    if (rawPermissionMode) {
        if (isPermissionMode(rawPermissionMode)) {
            initialPermissionMode = rawPermissionMode;
        }
        else {
            logger.warn(`Invalid CLAUDE_CHROME_PERMISSION_MODE "${rawPermissionMode}". Valid values: ${PERMISSION_MODES.join(', ')}`);
        }
    }
    return {
        serverName: 'Claude in Chrome',
        logger,
        socketPath: (0, common_js_1.getSecureSocketPath)(),
        getSocketPaths: common_js_1.getAllSocketPaths,
        clientTypeId: 'claude-code',
        onAuthenticationError: () => {
            logger.warn('Authentication error occurred. Please ensure you are logged into the Claude browser extension with the same claude.ai account as Claude Code.');
        },
        onToolCallDisconnected: () => {
            return `Browser extension is not connected. Please ensure the Claude browser extension is installed and running (${EXTENSION_DOWNLOAD_URL}), and that you are logged into claude.ai with the same account as Claude Code. If this is your first time connecting to Chrome, you may need to restart Chrome for the installation to take effect. If you continue to experience issues, please report a bug: ${BUG_REPORT_URL}`;
        },
        onExtensionPaired: (deviceId, name) => {
            (0, config_js_1.saveGlobalConfig)(config => {
                if (config.chromeExtension?.pairedDeviceId === deviceId &&
                    config.chromeExtension?.pairedDeviceName === name) {
                    return config;
                }
                return {
                    ...config,
                    chromeExtension: {
                        pairedDeviceId: deviceId,
                        pairedDeviceName: name,
                    },
                };
            });
            logger.info(`Paired with "${name}" (${deviceId.slice(0, 8)})`);
        },
        getPersistedDeviceId: () => {
            return (0, config_js_1.getGlobalConfig)().chromeExtension?.pairedDeviceId;
        },
        ...(chromeBridgeUrl && {
            bridgeConfig: {
                url: chromeBridgeUrl,
                getUserId: async () => {
                    return (0, config_js_1.getGlobalConfig)().oauthAccount?.accountUuid;
                },
                getOAuthToken: async () => {
                    return (0, auth_js_1.getClaudeAIOAuthTokens)()?.accessToken ?? '';
                },
                ...(isLocalBridge() && { devUserId: 'dev_user_local' }),
            },
        }),
        ...(initialPermissionMode && { initialPermissionMode }),
        // Wire inference for the browser_task tool — the chrome-mcp server runs
        // a lightning-mode agent loop in Node and calls the extension's
        // lightning_turn tool once per iteration for execution.
        //
        // Ant-only: the extension's lightning_turn is build-time-gated via
        // import.meta.env.ANT_ONLY_BUILD — the whole lightning/ module graph is
        // tree-shaken from the public extension build (build:prod greps for a
        // marker to verify). Without this injection, the Node MCP server's
        // ListTools also filters browser_task + lightning_turn out, so external
        // users never see the tools advertised. Three independent gates.
        //
        // Types inlined: AnthropicMessagesRequest/Response live in
        // @ant/claude-for-chrome-mcp@0.4.0 which isn't published yet. CI installs
        // 0.3.0. The callAnthropicMessages field is also 0.4.0-only, but spreading
        // an extra property into ClaudeForChromeContext is fine against either
        // version — 0.3.0 sees an unknown field (allowed in spread), 0.4.0 sees a
        // structurally-matching one. Once 0.4.0 is published, this can switch to
        // the package's exported types and the dep can be bumped.
        ...(process.env.USER_TYPE === 'ant' && {
            callAnthropicMessages: async (req) => {
                // sideQuery handles OAuth attribution fingerprint, proxy, model betas.
                // skipSystemPromptPrefix: the lightning prompt is complete on its own;
                // the CLI prefix would dilute the batching instructions.
                // tools: [] is load-bearing — without it Sonnet emits
                // <function_calls> XML before the text commands. Original
                // lightning-harness.js (apps repo) does the same.
                const response = await (0, sideQuery_js_1.sideQuery)({
                    model: req.model,
                    system: req.system,
                    messages: req.messages,
                    max_tokens: req.max_tokens,
                    stop_sequences: req.stop_sequences,
                    signal: req.signal,
                    skipSystemPromptPrefix: true,
                    tools: [],
                    querySource: 'chrome_mcp',
                });
                // BetaContentBlock is TextBlock | ThinkingBlock | ToolUseBlock | ...
                // Only text blocks carry the model's command output.
                const textBlocks = [];
                for (const b of response.content) {
                    if (b.type === 'text') {
                        textBlocks.push({ type: 'text', text: b.text });
                    }
                }
                return {
                    content: textBlocks,
                    stop_reason: response.stop_reason,
                    usage: {
                        input_tokens: response.usage.input_tokens,
                        output_tokens: response.usage.output_tokens,
                    },
                };
            },
        }),
        trackEvent: (eventName, metadata) => {
            const safeMetadata = {};
            if (metadata) {
                for (const [key, value] of Object.entries(metadata)) {
                    // Rename 'status' to 'bridge_status' to avoid Datadog's reserved field
                    const safeKey = key === 'status' ? 'bridge_status' : key;
                    if (typeof value === 'boolean' || typeof value === 'number') {
                        safeMetadata[safeKey] = value;
                    }
                    else if (typeof value === 'string' &&
                        SAFE_BRIDGE_STRING_KEYS.has(safeKey)) {
                        // Only forward allowlisted string keys — fields like error_message
                        // could contain page content or user data
                        safeMetadata[safeKey] =
                            value;
                    }
                }
            }
            (0, index_js_1.logEvent)(eventName, safeMetadata);
        },
    };
}
async function runClaudeInChromeMcpServer() {
    (0, config_js_1.enableConfigs)();
    (0, sink_js_1.initializeAnalyticsSink)();
    const context = createChromeContext();
    const server = (0, claude_for_chrome_mcp_1.createClaudeForChromeMcpServer)(context);
    const transport = new stdio_js_1.StdioServerTransport();
    // Exit when parent process dies (stdin pipe closes).
    // Flush analytics before exiting so final-batch events (e.g. disconnect) aren't lost.
    let exiting = false;
    const shutdownAndExit = async () => {
        if (exiting) {
            return;
        }
        exiting = true;
        await (0, firstPartyEventLogger_js_1.shutdown1PEventLogging)();
        await (0, datadog_js_1.shutdownDatadog)();
        // eslint-disable-next-line custom-rules/no-process-exit
        process.exit(0);
    };
    process.stdin.on('end', () => void shutdownAndExit());
    process.stdin.on('error', () => void shutdownAndExit());
    (0, debug_js_1.logForDebugging)('[Claude in Chrome] Starting MCP server');
    await server.connect(transport);
    (0, debug_js_1.logForDebugging)('[Claude in Chrome] MCP server started');
}
class DebugLogger {
    silly(message, ...args) {
        (0, debug_js_1.logForDebugging)((0, util_1.format)(message, ...args), { level: 'debug' });
    }
    debug(message, ...args) {
        (0, debug_js_1.logForDebugging)((0, util_1.format)(message, ...args), { level: 'debug' });
    }
    info(message, ...args) {
        (0, debug_js_1.logForDebugging)((0, util_1.format)(message, ...args), { level: 'info' });
    }
    warn(message, ...args) {
        (0, debug_js_1.logForDebugging)((0, util_1.format)(message, ...args), { level: 'warn' });
    }
    error(message, ...args) {
        (0, debug_js_1.logForDebugging)((0, util_1.format)(message, ...args), { level: 'error' });
    }
}
