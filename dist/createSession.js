"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBridgeSession = createBridgeSession;
exports.getBridgeSession = getBridgeSession;
exports.archiveBridgeSession = archiveBridgeSession;
exports.updateBridgeSessionTitle = updateBridgeSessionTitle;
const debug_js_1 = require("../utils/debug.js");
const errors_js_1 = require("../utils/errors.js");
const debugUtils_js_1 = require("./debugUtils.js");
const sessionIdCompat_js_1 = require("./sessionIdCompat.js");
/**
 * Create a session on a bridge environment via POST /v1/sessions.
 *
 * Used by both `claude remote-control` (empty session so the user has somewhere to
 * type immediately) and `/remote-control` (session pre-populated with conversation
 * history).
 *
 * Returns the session ID on success, or null if creation fails (non-fatal).
 */
async function createBridgeSession({ environmentId, title, events, gitRepoUrl, branch, signal, baseUrl: baseUrlOverride, getAccessToken, permissionMode, }) {
    const { getClaudeAIOAuthTokens } = await Promise.resolve().then(() => __importStar(require('../utils/auth.js')));
    const { getOrganizationUUID } = await Promise.resolve().then(() => __importStar(require('../services/oauth/client.js')));
    const { getOauthConfig } = await Promise.resolve().then(() => __importStar(require('../constants/oauth.js')));
    const { getOAuthHeaders } = await Promise.resolve().then(() => __importStar(require('../utils/teleport/api.js')));
    const { parseGitHubRepository } = await Promise.resolve().then(() => __importStar(require('../utils/detectRepository.js')));
    const { getDefaultBranch } = await Promise.resolve().then(() => __importStar(require('../utils/git.js')));
    const { getMainLoopModel } = await Promise.resolve().then(() => __importStar(require('../utils/model/model.js')));
    const { default: axios } = await Promise.resolve().then(() => __importStar(require('axios')));
    const accessToken = getAccessToken?.() ?? getClaudeAIOAuthTokens()?.accessToken;
    if (!accessToken) {
        (0, debug_js_1.logForDebugging)('[bridge] No access token for session creation');
        return null;
    }
    const orgUUID = await getOrganizationUUID();
    if (!orgUUID) {
        (0, debug_js_1.logForDebugging)('[bridge] No org UUID for session creation');
        return null;
    }
    // Build git source and outcome context
    let gitSource = null;
    let gitOutcome = null;
    if (gitRepoUrl) {
        const { parseGitRemote } = await Promise.resolve().then(() => __importStar(require('../utils/detectRepository.js')));
        const parsed = parseGitRemote(gitRepoUrl);
        if (parsed) {
            const { host, owner, name } = parsed;
            const revision = branch || (await getDefaultBranch()) || undefined;
            gitSource = {
                type: 'git_repository',
                url: `https://${host}/${owner}/${name}`,
                revision,
            };
            gitOutcome = {
                type: 'git_repository',
                git_info: {
                    type: 'github',
                    repo: `${owner}/${name}`,
                    branches: [`claude/${branch || 'task'}`],
                },
            };
        }
        else {
            // Fallback: try parseGitHubRepository for owner/repo format
            const ownerRepo = parseGitHubRepository(gitRepoUrl);
            if (ownerRepo) {
                const [owner, name] = ownerRepo.split('/');
                if (owner && name) {
                    const revision = branch || (await getDefaultBranch()) || undefined;
                    gitSource = {
                        type: 'git_repository',
                        url: `https://github.com/${owner}/${name}`,
                        revision,
                    };
                    gitOutcome = {
                        type: 'git_repository',
                        git_info: {
                            type: 'github',
                            repo: `${owner}/${name}`,
                            branches: [`claude/${branch || 'task'}`],
                        },
                    };
                }
            }
        }
    }
    const requestBody = {
        ...(title !== undefined && { title }),
        events,
        session_context: {
            sources: gitSource ? [gitSource] : [],
            outcomes: gitOutcome ? [gitOutcome] : [],
            model: getMainLoopModel(),
        },
        environment_id: environmentId,
        source: 'remote-control',
        ...(permissionMode && { permission_mode: permissionMode }),
    };
    const headers = {
        ...getOAuthHeaders(accessToken),
        'anthropic-beta': 'ccr-byoc-2025-07-29',
        'x-organization-uuid': orgUUID,
    };
    const url = `${baseUrlOverride ?? getOauthConfig().BASE_API_URL}/v1/sessions`;
    let response;
    try {
        response = await axios.post(url, requestBody, {
            headers,
            signal,
            validateStatus: s => s < 500,
        });
    }
    catch (err) {
        (0, debug_js_1.logForDebugging)(`[bridge] Session creation request failed: ${(0, errors_js_1.errorMessage)(err)}`);
        return null;
    }
    const isSuccess = response.status === 200 || response.status === 201;
    if (!isSuccess) {
        const detail = (0, debugUtils_js_1.extractErrorDetail)(response.data);
        (0, debug_js_1.logForDebugging)(`[bridge] Session creation failed with status ${response.status}${detail ? `: ${detail}` : ''}`);
        return null;
    }
    const sessionData = response.data;
    if (!sessionData ||
        typeof sessionData !== 'object' ||
        !('id' in sessionData) ||
        typeof sessionData.id !== 'string') {
        (0, debug_js_1.logForDebugging)('[bridge] No session ID in response');
        return null;
    }
    return sessionData.id;
}
/**
 * Fetch a bridge session via GET /v1/sessions/{id}.
 *
 * Returns the session's environment_id (for `--session-id` resume) and title.
 * Uses the same org-scoped headers as create/archive — the environments-level
 * client in bridgeApi.ts uses a different beta header and no org UUID, which
 * makes the Sessions API return 404.
 */
async function getBridgeSession(sessionId, opts) {
    const { getClaudeAIOAuthTokens } = await Promise.resolve().then(() => __importStar(require('../utils/auth.js')));
    const { getOrganizationUUID } = await Promise.resolve().then(() => __importStar(require('../services/oauth/client.js')));
    const { getOauthConfig } = await Promise.resolve().then(() => __importStar(require('../constants/oauth.js')));
    const { getOAuthHeaders } = await Promise.resolve().then(() => __importStar(require('../utils/teleport/api.js')));
    const { default: axios } = await Promise.resolve().then(() => __importStar(require('axios')));
    const accessToken = opts?.getAccessToken?.() ?? getClaudeAIOAuthTokens()?.accessToken;
    if (!accessToken) {
        (0, debug_js_1.logForDebugging)('[bridge] No access token for session fetch');
        return null;
    }
    const orgUUID = await getOrganizationUUID();
    if (!orgUUID) {
        (0, debug_js_1.logForDebugging)('[bridge] No org UUID for session fetch');
        return null;
    }
    const headers = {
        ...getOAuthHeaders(accessToken),
        'anthropic-beta': 'ccr-byoc-2025-07-29',
        'x-organization-uuid': orgUUID,
    };
    const url = `${opts?.baseUrl ?? getOauthConfig().BASE_API_URL}/v1/sessions/${sessionId}`;
    (0, debug_js_1.logForDebugging)(`[bridge] Fetching session ${sessionId}`);
    let response;
    try {
        response = await axios.get(url, { headers, timeout: 10000, validateStatus: s => s < 500 });
    }
    catch (err) {
        (0, debug_js_1.logForDebugging)(`[bridge] Session fetch request failed: ${(0, errors_js_1.errorMessage)(err)}`);
        return null;
    }
    if (response.status !== 200) {
        const detail = (0, debugUtils_js_1.extractErrorDetail)(response.data);
        (0, debug_js_1.logForDebugging)(`[bridge] Session fetch failed with status ${response.status}${detail ? `: ${detail}` : ''}`);
        return null;
    }
    return response.data;
}
/**
 * Archive a bridge session via POST /v1/sessions/{id}/archive.
 *
 * The CCR server never auto-archives sessions — archival is always an
 * explicit client action. Both `claude remote-control` (standalone bridge) and the
 * always-on `/remote-control` REPL bridge call this during shutdown to archive any
 * sessions that are still alive.
 *
 * The archive endpoint accepts sessions in any status (running, idle,
 * requires_action, pending) and returns 409 if already archived, making
 * it safe to call even if the server-side runner already archived the
 * session.
 *
 * Callers must handle errors — this function has no try/catch; 5xx,
 * timeouts, and network errors throw. Archival is best-effort during
 * cleanup; call sites wrap with .catch().
 */
async function archiveBridgeSession(sessionId, opts) {
    const { getClaudeAIOAuthTokens } = await Promise.resolve().then(() => __importStar(require('../utils/auth.js')));
    const { getOrganizationUUID } = await Promise.resolve().then(() => __importStar(require('../services/oauth/client.js')));
    const { getOauthConfig } = await Promise.resolve().then(() => __importStar(require('../constants/oauth.js')));
    const { getOAuthHeaders } = await Promise.resolve().then(() => __importStar(require('../utils/teleport/api.js')));
    const { default: axios } = await Promise.resolve().then(() => __importStar(require('axios')));
    const accessToken = opts?.getAccessToken?.() ?? getClaudeAIOAuthTokens()?.accessToken;
    if (!accessToken) {
        (0, debug_js_1.logForDebugging)('[bridge] No access token for session archive');
        return;
    }
    const orgUUID = await getOrganizationUUID();
    if (!orgUUID) {
        (0, debug_js_1.logForDebugging)('[bridge] No org UUID for session archive');
        return;
    }
    const headers = {
        ...getOAuthHeaders(accessToken),
        'anthropic-beta': 'ccr-byoc-2025-07-29',
        'x-organization-uuid': orgUUID,
    };
    const url = `${opts?.baseUrl ?? getOauthConfig().BASE_API_URL}/v1/sessions/${sessionId}/archive`;
    (0, debug_js_1.logForDebugging)(`[bridge] Archiving session ${sessionId}`);
    const response = await axios.post(url, {}, {
        headers,
        timeout: opts?.timeoutMs ?? 10000,
        validateStatus: s => s < 500,
    });
    if (response.status === 200) {
        (0, debug_js_1.logForDebugging)(`[bridge] Session ${sessionId} archived successfully`);
    }
    else {
        const detail = (0, debugUtils_js_1.extractErrorDetail)(response.data);
        (0, debug_js_1.logForDebugging)(`[bridge] Session archive failed with status ${response.status}${detail ? `: ${detail}` : ''}`);
    }
}
/**
 * Update the title of a bridge session via PATCH /v1/sessions/{id}.
 *
 * Called when the user renames a session via /rename while a bridge
 * connection is active, so the title stays in sync on claude.ai/code.
 *
 * Errors are swallowed — title sync is best-effort.
 */
async function updateBridgeSessionTitle(sessionId, title, opts) {
    const { getClaudeAIOAuthTokens } = await Promise.resolve().then(() => __importStar(require('../utils/auth.js')));
    const { getOrganizationUUID } = await Promise.resolve().then(() => __importStar(require('../services/oauth/client.js')));
    const { getOauthConfig } = await Promise.resolve().then(() => __importStar(require('../constants/oauth.js')));
    const { getOAuthHeaders } = await Promise.resolve().then(() => __importStar(require('../utils/teleport/api.js')));
    const { default: axios } = await Promise.resolve().then(() => __importStar(require('axios')));
    const accessToken = opts?.getAccessToken?.() ?? getClaudeAIOAuthTokens()?.accessToken;
    if (!accessToken) {
        (0, debug_js_1.logForDebugging)('[bridge] No access token for session title update');
        return;
    }
    const orgUUID = await getOrganizationUUID();
    if (!orgUUID) {
        (0, debug_js_1.logForDebugging)('[bridge] No org UUID for session title update');
        return;
    }
    const headers = {
        ...getOAuthHeaders(accessToken),
        'anthropic-beta': 'ccr-byoc-2025-07-29',
        'x-organization-uuid': orgUUID,
    };
    // Compat gateway only accepts session_* (compat/convert.go:27). v2 callers
    // pass raw cse_*; retag here so all callers can pass whatever they hold.
    // Idempotent for v1's session_* and bridgeMain's pre-converted compatSessionId.
    const compatId = (0, sessionIdCompat_js_1.toCompatSessionId)(sessionId);
    const url = `${opts?.baseUrl ?? getOauthConfig().BASE_API_URL}/v1/sessions/${compatId}`;
    (0, debug_js_1.logForDebugging)(`[bridge] Updating session title: ${compatId} → ${title}`);
    try {
        const response = await axios.patch(url, { title }, { headers, timeout: 10000, validateStatus: s => s < 500 });
        if (response.status === 200) {
            (0, debug_js_1.logForDebugging)(`[bridge] Session title updated successfully`);
        }
        else {
            const detail = (0, debugUtils_js_1.extractErrorDetail)(response.data);
            (0, debug_js_1.logForDebugging)(`[bridge] Session title update failed with status ${response.status}${detail ? `: ${detail}` : ''}`);
        }
    }
    catch (err) {
        (0, debug_js_1.logForDebugging)(`[bridge] Session title update request failed: ${(0, errors_js_1.errorMessage)(err)}`);
    }
}
