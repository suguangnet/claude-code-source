"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prefetchOfficialMcpUrls = prefetchOfficialMcpUrls;
exports.isOfficialMcpUrl = isOfficialMcpUrl;
exports.resetOfficialMcpUrlsForTesting = resetOfficialMcpUrlsForTesting;
const axios_1 = __importDefault(require("axios"));
const debug_js_1 = require("../../utils/debug.js");
const errors_js_1 = require("../../utils/errors.js");
// URLs stripped of query string and trailing slash — matches the normalization
// done by getLoggingSafeMcpBaseUrl so direct Set.has() lookup works.
let officialUrls = undefined;
function normalizeUrl(url) {
    try {
        const u = new URL(url);
        u.search = '';
        return u.toString().replace(/\/$/, '');
    }
    catch {
        return undefined;
    }
}
/**
 * Fire-and-forget fetch of the official MCP registry.
 * Populates officialUrls for isOfficialMcpUrl lookups.
 */
async function prefetchOfficialMcpUrls() {
    if (process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC) {
        return;
    }
    try {
        const response = await axios_1.default.get('https://api.anthropic.com/mcp-registry/v0/servers?version=latest&visibility=commercial', { timeout: 5000 });
        const urls = new Set();
        for (const entry of response.data.servers) {
            for (const remote of entry.server.remotes ?? []) {
                const normalized = normalizeUrl(remote.url);
                if (normalized) {
                    urls.add(normalized);
                }
            }
        }
        officialUrls = urls;
        (0, debug_js_1.logForDebugging)(`[mcp-registry] Loaded ${urls.size} official MCP URLs`);
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`Failed to fetch MCP registry: ${(0, errors_js_1.errorMessage)(error)}`, {
            level: 'error',
        });
    }
}
/**
 * Returns true iff the given (already-normalized via getLoggingSafeMcpBaseUrl)
 * URL is in the official MCP registry. Undefined registry → false (fail-closed).
 */
function isOfficialMcpUrl(normalizedUrl) {
    return officialUrls?.has(normalizedUrl) ?? false;
}
function resetOfficialMcpUrlsForTesting() {
    officialUrls = undefined;
}
