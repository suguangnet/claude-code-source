"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLAUDE_AI_LOCAL_BASE_URL = exports.CLAUDE_AI_STAGING_BASE_URL = exports.CLAUDE_AI_BASE_URL = exports.PRODUCT_URL = void 0;
exports.isRemoteSessionStaging = isRemoteSessionStaging;
exports.isRemoteSessionLocal = isRemoteSessionLocal;
exports.getClaudeAiBaseUrl = getClaudeAiBaseUrl;
exports.getRemoteSessionUrl = getRemoteSessionUrl;
exports.PRODUCT_URL = 'https://claude.com/claude-code';
// Claude Code Remote session URLs
exports.CLAUDE_AI_BASE_URL = 'https://claude.ai';
exports.CLAUDE_AI_STAGING_BASE_URL = 'https://claude-ai.staging.ant.dev';
exports.CLAUDE_AI_LOCAL_BASE_URL = 'http://localhost:4000';
/**
 * Determine if we're in a staging environment for remote sessions.
 * Checks session ID format and ingress URL.
 */
function isRemoteSessionStaging(sessionId, ingressUrl) {
    return (sessionId?.includes('_staging_') === true ||
        ingressUrl?.includes('staging') === true);
}
/**
 * Determine if we're in a local-dev environment for remote sessions.
 * Checks session ID format (e.g. `session_local_...`) and ingress URL.
 */
function isRemoteSessionLocal(sessionId, ingressUrl) {
    return (sessionId?.includes('_local_') === true ||
        ingressUrl?.includes('localhost') === true);
}
/**
 * Get the base URL for Claude AI based on environment.
 */
function getClaudeAiBaseUrl(sessionId, ingressUrl) {
    if (isRemoteSessionLocal(sessionId, ingressUrl)) {
        return exports.CLAUDE_AI_LOCAL_BASE_URL;
    }
    if (isRemoteSessionStaging(sessionId, ingressUrl)) {
        return exports.CLAUDE_AI_STAGING_BASE_URL;
    }
    return exports.CLAUDE_AI_BASE_URL;
}
/**
 * Get the full session URL for a remote session.
 *
 * The cse_→session_ translation is a temporary shim gated by
 * tengu_bridge_repl_v2_cse_shim_enabled (see isCseShimEnabled). Worker
 * endpoints (/v1/code/sessions/{id}/worker/*) want `cse_*` but the claude.ai
 * frontend currently routes on `session_*` (compat/convert.go:27 validates
 * TagSession). Same UUID body, different tag prefix. Once the server tags by
 * environment_kind and the frontend accepts `cse_*` directly, flip the gate
 * off. No-op for IDs already in `session_*` form. See toCompatSessionId in
 * src/bridge/sessionIdCompat.ts for the canonical helper (lazy-required here
 * to keep constants/ leaf-of-DAG at module-load time).
 */
function getRemoteSessionUrl(sessionId, ingressUrl) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { toCompatSessionId } = require('../bridge/sessionIdCompat.js');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const compatId = toCompatSessionId(sessionId);
    const baseUrl = getClaudeAiBaseUrl(compatId, ingressUrl);
    return `${baseUrl}/code/${compatId}`;
}
