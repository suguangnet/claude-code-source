"use strict";
/* eslint-disable custom-rules/no-process-exit -- CLI subcommand handler intentionally exits */
Object.defineProperty(exports, "__esModule", { value: true });
exports.installOAuthTokens = installOAuthTokens;
exports.authLogin = authLogin;
exports.authStatus = authStatus;
exports.authLogout = authLogout;
const logout_js_1 = require("../../commands/logout/logout.js");
const index_js_1 = require("../../services/analytics/index.js");
const errorUtils_js_1 = require("../../services/api/errorUtils.js");
const firstTokenDate_js_1 = require("../../services/api/firstTokenDate.js");
const client_js_1 = require("../../services/oauth/client.js");
const getOauthProfile_js_1 = require("../../services/oauth/getOauthProfile.js");
const index_js_2 = require("../../services/oauth/index.js");
const auth_js_1 = require("../../utils/auth.js");
const config_js_1 = require("../../utils/config.js");
const debug_js_1 = require("../../utils/debug.js");
const envUtils_js_1 = require("../../utils/envUtils.js");
const errors_js_1 = require("../../utils/errors.js");
const log_js_1 = require("../../utils/log.js");
const providers_js_1 = require("../../utils/model/providers.js");
const settings_js_1 = require("../../utils/settings/settings.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const status_js_1 = require("../../utils/status.js");
/**
 * Shared post-token-acquisition logic. Saves tokens, fetches profile/roles,
 * and sets up the local auth state.
 */
async function installOAuthTokens(tokens) {
    // Clear old state before saving new credentials
    await (0, logout_js_1.performLogout)({ clearOnboarding: false });
    // Reuse pre-fetched profile if available, otherwise fetch fresh
    const profile = tokens.profile ?? (await (0, getOauthProfile_js_1.getOauthProfileFromOauthToken)(tokens.accessToken));
    if (profile) {
        (0, client_js_1.storeOAuthAccountInfo)({
            accountUuid: profile.account.uuid,
            emailAddress: profile.account.email,
            organizationUuid: profile.organization.uuid,
            displayName: profile.account.display_name || undefined,
            hasExtraUsageEnabled: profile.organization.has_extra_usage_enabled ?? undefined,
            billingType: profile.organization.billing_type ?? undefined,
            subscriptionCreatedAt: profile.organization.subscription_created_at ?? undefined,
            accountCreatedAt: profile.account.created_at,
        });
    }
    else if (tokens.tokenAccount) {
        // Fallback to token exchange account data when profile endpoint fails
        (0, client_js_1.storeOAuthAccountInfo)({
            accountUuid: tokens.tokenAccount.uuid,
            emailAddress: tokens.tokenAccount.emailAddress,
            organizationUuid: tokens.tokenAccount.organizationUuid,
        });
    }
    const storageResult = (0, auth_js_1.saveOAuthTokensIfNeeded)(tokens);
    (0, auth_js_1.clearOAuthTokenCache)();
    if (storageResult.warning) {
        (0, index_js_1.logEvent)('tengu_oauth_storage_warning', {
            warning: storageResult.warning,
        });
    }
    // Roles and first-token-date may fail for limited-scope tokens (e.g.
    // inference-only from setup-token). They're not required for core auth.
    await (0, client_js_1.fetchAndStoreUserRoles)(tokens.accessToken).catch(err => (0, debug_js_1.logForDebugging)(String(err), { level: 'error' }));
    if ((0, client_js_1.shouldUseClaudeAIAuth)(tokens.scopes)) {
        await (0, firstTokenDate_js_1.fetchAndStoreClaudeCodeFirstTokenDate)().catch(err => (0, debug_js_1.logForDebugging)(String(err), { level: 'error' }));
    }
    else {
        // API key creation is critical for Console users — let it throw.
        const apiKey = await (0, client_js_1.createAndStoreApiKey)(tokens.accessToken);
        if (!apiKey) {
            throw new Error('Unable to create API key. The server accepted the request but did not return a key.');
        }
    }
    await (0, logout_js_1.clearAuthRelatedCaches)();
}
async function authLogin({ email, sso, console: useConsole, claudeai, }) {
    if (useConsole && claudeai) {
        process.stderr.write('Error: --console and --claudeai cannot be used together.\n');
        process.exit(1);
    }
    const settings = (0, settings_js_1.getInitialSettings)();
    // forceLoginMethod is a hard constraint (enterprise setting) — matches ConsoleOAuthFlow behavior.
    // Without it, --console selects Console; --claudeai (or no flag) selects claude.ai.
    const loginWithClaudeAi = settings.forceLoginMethod
        ? settings.forceLoginMethod === 'claudeai'
        : !useConsole;
    const orgUUID = settings.forceLoginOrgUUID;
    // Fast path: if a refresh token is provided via env var, skip the browser
    // OAuth flow and exchange it directly for tokens.
    const envRefreshToken = process.env.CLAUDE_CODE_OAUTH_REFRESH_TOKEN;
    if (envRefreshToken) {
        const envScopes = process.env.CLAUDE_CODE_OAUTH_SCOPES;
        if (!envScopes) {
            process.stderr.write('CLAUDE_CODE_OAUTH_SCOPES is required when using CLAUDE_CODE_OAUTH_REFRESH_TOKEN.\n' +
                'Set it to the space-separated scopes the refresh token was issued with\n' +
                '(e.g. "user:inference" or "user:profile user:inference user:sessions:claude_code user:mcp_servers").\n');
            process.exit(1);
        }
        const scopes = envScopes.split(/\s+/).filter(Boolean);
        try {
            (0, index_js_1.logEvent)('tengu_login_from_refresh_token', {});
            const tokens = await (0, client_js_1.refreshOAuthToken)(envRefreshToken, { scopes });
            await installOAuthTokens(tokens);
            const orgResult = await (0, auth_js_1.validateForceLoginOrg)();
            if (!orgResult.valid) {
                process.stderr.write(orgResult.message + '\n');
                process.exit(1);
            }
            // Mark onboarding complete — interactive paths handle this via
            // the Onboarding component, but the env var path skips it.
            (0, config_js_1.saveGlobalConfig)(current => {
                if (current.hasCompletedOnboarding)
                    return current;
                return { ...current, hasCompletedOnboarding: true };
            });
            (0, index_js_1.logEvent)('tengu_oauth_success', {
                loginWithClaudeAi: (0, client_js_1.shouldUseClaudeAIAuth)(tokens.scopes),
            });
            process.stdout.write('Login successful.\n');
            process.exit(0);
        }
        catch (err) {
            (0, log_js_1.logError)(err);
            const sslHint = (0, errorUtils_js_1.getSSLErrorHint)(err);
            process.stderr.write(`Login failed: ${(0, errors_js_1.errorMessage)(err)}\n${sslHint ? sslHint + '\n' : ''}`);
            process.exit(1);
        }
    }
    const resolvedLoginMethod = sso ? 'sso' : undefined;
    const oauthService = new index_js_2.OAuthService();
    try {
        (0, index_js_1.logEvent)('tengu_oauth_flow_start', { loginWithClaudeAi });
        const result = await oauthService.startOAuthFlow(async (url) => {
            process.stdout.write('Opening browser to sign in…\n');
            process.stdout.write(`If the browser didn't open, visit: ${url}\n`);
        }, {
            loginWithClaudeAi,
            loginHint: email,
            loginMethod: resolvedLoginMethod,
            orgUUID,
        });
        await installOAuthTokens(result);
        const orgResult = await (0, auth_js_1.validateForceLoginOrg)();
        if (!orgResult.valid) {
            process.stderr.write(orgResult.message + '\n');
            process.exit(1);
        }
        (0, index_js_1.logEvent)('tengu_oauth_success', { loginWithClaudeAi });
        process.stdout.write('Login successful.\n');
        process.exit(0);
    }
    catch (err) {
        (0, log_js_1.logError)(err);
        const sslHint = (0, errorUtils_js_1.getSSLErrorHint)(err);
        process.stderr.write(`Login failed: ${(0, errors_js_1.errorMessage)(err)}\n${sslHint ? sslHint + '\n' : ''}`);
        process.exit(1);
    }
    finally {
        oauthService.cleanup();
    }
}
async function authStatus(opts) {
    const { source: authTokenSource, hasToken } = (0, auth_js_1.getAuthTokenSource)();
    const { source: apiKeySource } = (0, auth_js_1.getAnthropicApiKeyWithSource)();
    const hasApiKeyEnvVar = !!process.env.ANTHROPIC_API_KEY && !(0, envUtils_js_1.isRunningOnHomespace)();
    const oauthAccount = (0, auth_js_1.getOauthAccountInfo)();
    const subscriptionType = (0, auth_js_1.getSubscriptionType)();
    const using3P = (0, auth_js_1.isUsing3PServices)();
    const loggedIn = hasToken || apiKeySource !== 'none' || hasApiKeyEnvVar || using3P;
    // Determine auth method
    let authMethod = 'none';
    if (using3P) {
        authMethod = 'third_party';
    }
    else if (authTokenSource === 'claude.ai') {
        authMethod = 'claude.ai';
    }
    else if (authTokenSource === 'apiKeyHelper') {
        authMethod = 'api_key_helper';
    }
    else if (authTokenSource !== 'none') {
        authMethod = 'oauth_token';
    }
    else if (apiKeySource === 'ANTHROPIC_API_KEY' || hasApiKeyEnvVar) {
        authMethod = 'api_key';
    }
    else if (apiKeySource === '/login managed key') {
        authMethod = 'claude.ai';
    }
    if (opts.text) {
        const properties = [
            ...(0, status_js_1.buildAccountProperties)(),
            ...(0, status_js_1.buildAPIProviderProperties)(),
        ];
        let hasAuthProperty = false;
        for (const prop of properties) {
            const value = typeof prop.value === 'string'
                ? prop.value
                : Array.isArray(prop.value)
                    ? prop.value.join(', ')
                    : null;
            if (value === null || value === 'none') {
                continue;
            }
            hasAuthProperty = true;
            if (prop.label) {
                process.stdout.write(`${prop.label}: ${value}\n`);
            }
            else {
                process.stdout.write(`${value}\n`);
            }
        }
        if (!hasAuthProperty && hasApiKeyEnvVar) {
            process.stdout.write('API key: ANTHROPIC_API_KEY\n');
        }
        if (!loggedIn) {
            process.stdout.write('Not logged in. Run claude auth login to authenticate.\n');
        }
    }
    else {
        const apiProvider = (0, providers_js_1.getAPIProvider)();
        const resolvedApiKeySource = apiKeySource !== 'none'
            ? apiKeySource
            : hasApiKeyEnvVar
                ? 'ANTHROPIC_API_KEY'
                : null;
        const output = {
            loggedIn,
            authMethod,
            apiProvider,
        };
        if (resolvedApiKeySource) {
            output.apiKeySource = resolvedApiKeySource;
        }
        if (authMethod === 'claude.ai') {
            output.email = oauthAccount?.emailAddress ?? null;
            output.orgId = oauthAccount?.organizationUuid ?? null;
            output.orgName = oauthAccount?.organizationName ?? null;
            output.subscriptionType = subscriptionType ?? null;
        }
        process.stdout.write((0, slowOperations_js_1.jsonStringify)(output, null, 2) + '\n');
    }
    process.exit(loggedIn ? 0 : 1);
}
async function authLogout() {
    try {
        await (0, logout_js_1.performLogout)({ clearOnboarding: false });
    }
    catch {
        process.stderr.write('Failed to log out.\n');
        process.exit(1);
    }
    process.stdout.write('Successfully logged out from your Anthropic account.\n');
    process.exit(0);
}
