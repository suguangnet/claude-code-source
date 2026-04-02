"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMcpHeadersFromHelper = getMcpHeadersFromHelper;
exports.getMcpServerHeaders = getMcpServerHeaders;
const state_js_1 = require("../../bootstrap/state.js");
const config_js_1 = require("../../utils/config.js");
const debug_js_1 = require("../../utils/debug.js");
const errors_js_1 = require("../../utils/errors.js");
const execFileNoThrow_js_1 = require("../../utils/execFileNoThrow.js");
const log_js_1 = require("../../utils/log.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const index_js_1 = require("../analytics/index.js");
/**
 * Check if the MCP server config comes from project settings (projectSettings or localSettings)
 * This is important for security checks
 */
function isMcpServerFromProjectOrLocalSettings(config) {
    return config.scope === 'project' || config.scope === 'local';
}
/**
 * Get dynamic headers for an MCP server using the headersHelper script
 * @param serverName The name of the MCP server
 * @param config The MCP server configuration
 * @returns Headers object or null if not configured or failed
 */
async function getMcpHeadersFromHelper(serverName, config) {
    if (!config.headersHelper) {
        return null;
    }
    // Security check for project/local settings
    // Skip trust check in non-interactive mode (e.g., CI/CD, automation)
    if ('scope' in config &&
        isMcpServerFromProjectOrLocalSettings(config) &&
        !(0, state_js_1.getIsNonInteractiveSession)()) {
        // Check if trust has been established for this project
        const hasTrust = (0, config_js_1.checkHasTrustDialogAccepted)();
        if (!hasTrust) {
            const error = new Error(`Security: headersHelper for MCP server '${serverName}' executed before workspace trust is confirmed. If you see this message, post in ${MACRO.FEEDBACK_CHANNEL}.`);
            (0, debug_js_1.logAntError)('MCP headersHelper invoked before trust check', error);
            (0, index_js_1.logEvent)('tengu_mcp_headersHelper_missing_trust', {});
            return null;
        }
    }
    try {
        (0, log_js_1.logMCPDebug)(serverName, 'Executing headersHelper to get dynamic headers');
        const execResult = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)(config.headersHelper, [], {
            shell: true,
            timeout: 10000,
            // Pass server context so one helper script can serve multiple MCP servers
            // (git credential-helper style). See deshaw/anthropic-issues#28.
            env: {
                ...process.env,
                CLAUDE_CODE_MCP_SERVER_NAME: serverName,
                CLAUDE_CODE_MCP_SERVER_URL: config.url,
            },
        });
        if (execResult.code !== 0 || !execResult.stdout) {
            throw new Error(`headersHelper for MCP server '${serverName}' did not return a valid value`);
        }
        const result = execResult.stdout.trim();
        const headers = (0, slowOperations_js_1.jsonParse)(result);
        if (typeof headers !== 'object' ||
            headers === null ||
            Array.isArray(headers)) {
            throw new Error(`headersHelper for MCP server '${serverName}' must return a JSON object with string key-value pairs`);
        }
        // Validate all values are strings
        for (const [key, value] of Object.entries(headers)) {
            if (typeof value !== 'string') {
                throw new Error(`headersHelper for MCP server '${serverName}' returned non-string value for key "${key}": ${typeof value}`);
            }
        }
        (0, log_js_1.logMCPDebug)(serverName, `Successfully retrieved ${Object.keys(headers).length} headers from headersHelper`);
        return headers;
    }
    catch (error) {
        (0, log_js_1.logMCPError)(serverName, `Error getting headers from headersHelper: ${(0, errors_js_1.errorMessage)(error)}`);
        (0, log_js_1.logError)(new Error(`Error getting MCP headers from headersHelper for server '${serverName}': ${(0, errors_js_1.errorMessage)(error)}`));
        // Return null instead of throwing to avoid blocking the connection
        return null;
    }
}
/**
 * Get combined headers for an MCP server (static + dynamic)
 * @param serverName The name of the MCP server
 * @param config The MCP server configuration
 * @returns Combined headers object
 */
async function getMcpServerHeaders(serverName, config) {
    const staticHeaders = config.headers || {};
    const dynamicHeaders = (await getMcpHeadersFromHelper(serverName, config)) || {};
    // Dynamic headers override static headers if both are present
    return {
        ...staticHeaders,
        ...dynamicHeaders,
    };
}
