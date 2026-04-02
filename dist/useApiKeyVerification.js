"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useApiKeyVerification = useApiKeyVerification;
const react_1 = require("react");
const state_js_1 = require("../bootstrap/state.js");
const claude_js_1 = require("../services/api/claude.js");
const auth_js_1 = require("../utils/auth.js");
function useApiKeyVerification() {
    const [status, setStatus] = (0, react_1.useState)(() => {
        if (!(0, auth_js_1.isAnthropicAuthEnabled)() || (0, auth_js_1.isClaudeAISubscriber)()) {
            return 'valid';
        }
        // Use skipRetrievingKeyFromApiKeyHelper to avoid executing apiKeyHelper
        // before trust dialog is shown (security: prevents RCE via settings.json)
        const { key, source } = (0, auth_js_1.getAnthropicApiKeyWithSource)({
            skipRetrievingKeyFromApiKeyHelper: true,
        });
        // If apiKeyHelper is configured, we have a key source even though we
        // haven't executed it yet - return 'loading' to indicate we'll verify later
        if (key || source === 'apiKeyHelper') {
            return 'loading';
        }
        return 'missing';
    });
    const [error, setError] = (0, react_1.useState)(null);
    const verify = (0, react_1.useCallback)(async () => {
        if (!(0, auth_js_1.isAnthropicAuthEnabled)() || (0, auth_js_1.isClaudeAISubscriber)()) {
            setStatus('valid');
            return;
        }
        // Warm the apiKeyHelper cache (no-op if not configured), then read from
        // all sources. getAnthropicApiKeyWithSource() reads the now-warm cache.
        await (0, auth_js_1.getApiKeyFromApiKeyHelper)((0, state_js_1.getIsNonInteractiveSession)());
        const { key: apiKey, source } = (0, auth_js_1.getAnthropicApiKeyWithSource)();
        if (!apiKey) {
            if (source === 'apiKeyHelper') {
                setStatus('error');
                setError(new Error('API key helper did not return a valid key'));
                return;
            }
            const newStatus = 'missing';
            setStatus(newStatus);
            return;
        }
        try {
            const isValid = await (0, claude_js_1.verifyApiKey)(apiKey, false);
            const newStatus = isValid ? 'valid' : 'invalid';
            setStatus(newStatus);
            return;
        }
        catch (error) {
            // This happens when there an error response from the API but it's not an invalid API key error
            // In this case, we still mark the API key as invalid - but we also log the error so we can
            // display it to the user to be more helpful
            setError(error);
            const newStatus = 'error';
            setStatus(newStatus);
            return;
        }
    }, []);
    return {
        status,
        reverify: verify,
        error,
    };
}
