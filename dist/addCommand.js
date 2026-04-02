"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMcpAddCommand = registerMcpAddCommand;
/**
 * MCP add CLI subcommand
 *
 * Extracted from main.tsx to enable direct testing.
 */
const extra_typings_1 = require("@commander-js/extra-typings");
const exit_js_1 = require("../../cli/exit.js");
const index_js_1 = require("../../services/analytics/index.js");
const auth_js_1 = require("../../services/mcp/auth.js");
const config_js_1 = require("../../services/mcp/config.js");
const utils_js_1 = require("../../services/mcp/utils.js");
const xaaIdpLogin_js_1 = require("../../services/mcp/xaaIdpLogin.js");
const envUtils_js_1 = require("../../utils/envUtils.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
/**
 * Registers the `mcp add` subcommand on the given Commander command.
 */
function registerMcpAddCommand(mcp) {
    mcp
        .command('add <name> <commandOrUrl> [args...]')
        .description('Add an MCP server to Claude Code.\n\n' +
        'Examples:\n' +
        '  # Add HTTP server:\n' +
        '  claude mcp add --transport http sentry https://mcp.sentry.dev/mcp\n\n' +
        '  # Add HTTP server with headers:\n' +
        '  claude mcp add --transport http corridor https://app.corridor.dev/api/mcp --header "Authorization: Bearer ..."\n\n' +
        '  # Add stdio server with environment variables:\n' +
        '  claude mcp add -e API_KEY=xxx my-server -- npx my-mcp-server\n\n' +
        '  # Add stdio server with subprocess flags:\n' +
        '  claude mcp add my-server -- my-command --some-flag arg1')
        .option('-s, --scope <scope>', 'Configuration scope (local, user, or project)', 'local')
        .option('-t, --transport <transport>', 'Transport type (stdio, sse, http). Defaults to stdio if not specified.')
        .option('-e, --env <env...>', 'Set environment variables (e.g. -e KEY=value)')
        .option('-H, --header <header...>', 'Set WebSocket headers (e.g. -H "X-Api-Key: abc123" -H "X-Custom: value")')
        .option('--client-id <clientId>', 'OAuth client ID for HTTP/SSE servers')
        .option('--client-secret', 'Prompt for OAuth client secret (or set MCP_CLIENT_SECRET env var)')
        .option('--callback-port <port>', 'Fixed port for OAuth callback (for servers requiring pre-registered redirect URIs)')
        .helpOption('-h, --help', 'Display help for command')
        .addOption(new extra_typings_1.Option('--xaa', "Enable XAA (SEP-990) for this server. Requires 'claude mcp xaa setup' first. Also requires --client-id and --client-secret (for the MCP server's AS).").hideHelp(!(0, xaaIdpLogin_js_1.isXaaEnabled)()))
        .action(async (name, commandOrUrl, args, options) => {
        // Commander.js handles -- natively: it consumes -- and everything after becomes args
        const actualCommand = commandOrUrl;
        const actualArgs = args;
        // If no name is provided, error
        if (!name) {
            (0, exit_js_1.cliError)('Error: Server name is required.\n' +
                'Usage: claude mcp add <name> <command> [args...]');
        }
        else if (!actualCommand) {
            (0, exit_js_1.cliError)('Error: Command is required when server name is provided.\n' +
                'Usage: claude mcp add <name> <command> [args...]');
        }
        try {
            const scope = (0, utils_js_1.ensureConfigScope)(options.scope);
            const transport = (0, utils_js_1.ensureTransport)(options.transport);
            // XAA fail-fast: validate at add-time, not auth-time.
            if (options.xaa && !(0, xaaIdpLogin_js_1.isXaaEnabled)()) {
                (0, exit_js_1.cliError)('Error: --xaa requires CLAUDE_CODE_ENABLE_XAA=1 in your environment');
            }
            const xaa = Boolean(options.xaa);
            if (xaa) {
                const missing = [];
                if (!options.clientId)
                    missing.push('--client-id');
                if (!options.clientSecret)
                    missing.push('--client-secret');
                if (!(0, xaaIdpLogin_js_1.getXaaIdpSettings)()) {
                    missing.push("'claude mcp xaa setup' (settings.xaaIdp not configured)");
                }
                if (missing.length) {
                    (0, exit_js_1.cliError)(`Error: --xaa requires: ${missing.join(', ')}`);
                }
            }
            // Check if transport was explicitly provided
            const transportExplicit = options.transport !== undefined;
            // Check if the command looks like a URL (likely incorrect usage)
            const looksLikeUrl = actualCommand.startsWith('http://') ||
                actualCommand.startsWith('https://') ||
                actualCommand.startsWith('localhost') ||
                actualCommand.endsWith('/sse') ||
                actualCommand.endsWith('/mcp');
            (0, index_js_1.logEvent)('tengu_mcp_add', {
                type: transport,
                scope: scope,
                source: 'command',
                transport: transport,
                transportExplicit: transportExplicit,
                looksLikeUrl: looksLikeUrl,
            });
            if (transport === 'sse') {
                if (!actualCommand) {
                    (0, exit_js_1.cliError)('Error: URL is required for SSE transport.');
                }
                const headers = options.header
                    ? (0, utils_js_1.parseHeaders)(options.header)
                    : undefined;
                const callbackPort = options.callbackPort
                    ? parseInt(options.callbackPort, 10)
                    : undefined;
                const oauth = options.clientId || callbackPort || xaa
                    ? {
                        ...(options.clientId ? { clientId: options.clientId } : {}),
                        ...(callbackPort ? { callbackPort } : {}),
                        ...(xaa ? { xaa: true } : {}),
                    }
                    : undefined;
                const clientSecret = options.clientSecret && options.clientId
                    ? await (0, auth_js_1.readClientSecret)()
                    : undefined;
                const serverConfig = {
                    type: 'sse',
                    url: actualCommand,
                    headers,
                    oauth,
                };
                await (0, config_js_1.addMcpConfig)(name, serverConfig, scope);
                if (clientSecret) {
                    (0, auth_js_1.saveMcpClientSecret)(name, serverConfig, clientSecret);
                }
                process.stdout.write(`Added SSE MCP server ${name} with URL: ${actualCommand} to ${scope} config\n`);
                if (headers) {
                    process.stdout.write(`Headers: ${(0, slowOperations_js_1.jsonStringify)(headers, null, 2)}\n`);
                }
            }
            else if (transport === 'http') {
                if (!actualCommand) {
                    (0, exit_js_1.cliError)('Error: URL is required for HTTP transport.');
                }
                const headers = options.header
                    ? (0, utils_js_1.parseHeaders)(options.header)
                    : undefined;
                const callbackPort = options.callbackPort
                    ? parseInt(options.callbackPort, 10)
                    : undefined;
                const oauth = options.clientId || callbackPort || xaa
                    ? {
                        ...(options.clientId ? { clientId: options.clientId } : {}),
                        ...(callbackPort ? { callbackPort } : {}),
                        ...(xaa ? { xaa: true } : {}),
                    }
                    : undefined;
                const clientSecret = options.clientSecret && options.clientId
                    ? await (0, auth_js_1.readClientSecret)()
                    : undefined;
                const serverConfig = {
                    type: 'http',
                    url: actualCommand,
                    headers,
                    oauth,
                };
                await (0, config_js_1.addMcpConfig)(name, serverConfig, scope);
                if (clientSecret) {
                    (0, auth_js_1.saveMcpClientSecret)(name, serverConfig, clientSecret);
                }
                process.stdout.write(`Added HTTP MCP server ${name} with URL: ${actualCommand} to ${scope} config\n`);
                if (headers) {
                    process.stdout.write(`Headers: ${(0, slowOperations_js_1.jsonStringify)(headers, null, 2)}\n`);
                }
            }
            else {
                if (options.clientId ||
                    options.clientSecret ||
                    options.callbackPort ||
                    options.xaa) {
                    process.stderr.write(`Warning: --client-id, --client-secret, --callback-port, and --xaa are only supported for HTTP/SSE transports and will be ignored for stdio.\n`);
                }
                // Warn if this looks like a URL but transport wasn't explicitly specified
                if (!transportExplicit && looksLikeUrl) {
                    process.stderr.write(`\nWarning: The command "${actualCommand}" looks like a URL, but is being interpreted as a stdio server as --transport was not specified.\n`);
                    process.stderr.write(`If this is an HTTP server, use: claude mcp add --transport http ${name} ${actualCommand}\n`);
                    process.stderr.write(`If this is an SSE server, use: claude mcp add --transport sse ${name} ${actualCommand}\n`);
                }
                const env = (0, envUtils_js_1.parseEnvVars)(options.env);
                await (0, config_js_1.addMcpConfig)(name, { type: 'stdio', command: actualCommand, args: actualArgs, env }, scope);
                process.stdout.write(`Added stdio MCP server ${name} with command: ${actualCommand} ${actualArgs.join(' ')} to ${scope} config\n`);
            }
            (0, exit_js_1.cliOk)(`File modified: ${(0, utils_js_1.describeMcpConfigFilePath)(scope)}`);
        }
        catch (error) {
            (0, exit_js_1.cliError)(error.message);
        }
    });
}
