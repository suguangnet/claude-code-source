"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getModelCapability = getModelCapability;
exports.refreshModelCapabilities = refreshModelCapabilities;
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const isEqual_js_1 = __importDefault(require("lodash-es/isEqual.js"));
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const path_1 = require("path");
const v4_1 = require("zod/v4");
const oauth_js_1 = require("../../constants/oauth.js");
const client_js_1 = require("../../services/api/client.js");
const auth_js_1 = require("../auth.js");
const debug_js_1 = require("../debug.js");
const envUtils_js_1 = require("../envUtils.js");
const json_js_1 = require("../json.js");
const lazySchema_js_1 = require("../lazySchema.js");
const privacyLevel_js_1 = require("../privacyLevel.js");
const slowOperations_js_1 = require("../slowOperations.js");
const providers_js_1 = require("./providers.js");
// .strip() — don't persist internal-only fields (mycro_deployments etc.) to disk
const ModelCapabilitySchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z
    .object({
    id: v4_1.z.string(),
    max_input_tokens: v4_1.z.number().optional(),
    max_tokens: v4_1.z.number().optional(),
})
    .strip());
const CacheFileSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    models: v4_1.z.array(ModelCapabilitySchema()),
    timestamp: v4_1.z.number(),
}));
function getCacheDir() {
    return (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), 'cache');
}
function getCachePath() {
    return (0, path_1.join)(getCacheDir(), 'model-capabilities.json');
}
function isModelCapabilitiesEligible() {
    if (process.env.USER_TYPE !== 'ant')
        return false;
    if ((0, providers_js_1.getAPIProvider)() !== 'firstParty')
        return false;
    if (!(0, providers_js_1.isFirstPartyAnthropicBaseUrl)())
        return false;
    return true;
}
// Longest-id-first so substring match prefers most specific; secondary key for stable isEqual
function sortForMatching(models) {
    return [...models].sort((a, b) => b.id.length - a.id.length || a.id.localeCompare(b.id));
}
// Keyed on cache path so tests that set CLAUDE_CONFIG_DIR get a fresh read
const loadCache = (0, memoize_js_1.default)((path) => {
    try {
        // eslint-disable-next-line custom-rules/no-sync-fs -- memoized; called from sync getContextWindowForModel
        const raw = (0, fs_1.readFileSync)(path, 'utf-8');
        const parsed = CacheFileSchema().safeParse((0, json_js_1.safeParseJSON)(raw, false));
        return parsed.success ? parsed.data.models : null;
    }
    catch {
        return null;
    }
}, path => path);
function getModelCapability(model) {
    if (!isModelCapabilitiesEligible())
        return undefined;
    const cached = loadCache(getCachePath());
    if (!cached || cached.length === 0)
        return undefined;
    const m = model.toLowerCase();
    const exact = cached.find(c => c.id.toLowerCase() === m);
    if (exact)
        return exact;
    return cached.find(c => m.includes(c.id.toLowerCase()));
}
async function refreshModelCapabilities() {
    if (!isModelCapabilitiesEligible())
        return;
    if ((0, privacyLevel_js_1.isEssentialTrafficOnly)())
        return;
    try {
        const anthropic = await (0, client_js_1.getAnthropicClient)({ maxRetries: 1 });
        const betas = (0, auth_js_1.isClaudeAISubscriber)() ? [oauth_js_1.OAUTH_BETA_HEADER] : undefined;
        const parsed = [];
        for await (const entry of anthropic.models.list({ betas })) {
            const result = ModelCapabilitySchema().safeParse(entry);
            if (result.success)
                parsed.push(result.data);
        }
        if (parsed.length === 0)
            return;
        const path = getCachePath();
        const models = sortForMatching(parsed);
        if ((0, isEqual_js_1.default)(loadCache(path), models)) {
            (0, debug_js_1.logForDebugging)('[modelCapabilities] cache unchanged, skipping write');
            return;
        }
        await (0, promises_1.mkdir)(getCacheDir(), { recursive: true });
        await (0, promises_1.writeFile)(path, (0, slowOperations_js_1.jsonStringify)({ models, timestamp: Date.now() }), {
            encoding: 'utf-8',
            mode: 0o600,
        });
        loadCache.cache.delete(path);
        (0, debug_js_1.logForDebugging)(`[modelCapabilities] cached ${models.length} models`);
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`[modelCapabilities] fetch failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
}
