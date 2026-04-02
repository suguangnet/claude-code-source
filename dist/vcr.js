"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.withVCR = withVCR;
exports.withStreamingVCR = withStreamingVCR;
exports.withTokenCountVCR = withTokenCountVCR;
const crypto_1 = require("crypto");
const promises_1 = require("fs/promises");
const isPlainObject_js_1 = __importDefault(require("lodash-es/isPlainObject.js"));
const mapValues_js_1 = __importDefault(require("lodash-es/mapValues.js"));
const path_1 = require("path");
const cost_tracker_js_1 = require("src/cost-tracker.js");
const modelCost_js_1 = require("src/utils/modelCost.js");
const cwd_js_1 = require("../utils/cwd.js");
const env_js_1 = require("../utils/env.js");
const envUtils_js_1 = require("../utils/envUtils.js");
const errors_js_1 = require("../utils/errors.js");
const messages_js_1 = require("../utils/messages.js");
const slowOperations_js_1 = require("../utils/slowOperations.js");
function shouldUseVCR() {
    if (process.env.NODE_ENV === 'test') {
        return true;
    }
    if (process.env.USER_TYPE === 'ant' && (0, envUtils_js_1.isEnvTruthy)(process.env.FORCE_VCR)) {
        return true;
    }
    return false;
}
/**
 * Generic fixture management helper
 * Handles caching, reading, writing fixtures for any data type
 */
async function withFixture(input, fixtureName, f) {
    if (!shouldUseVCR()) {
        return await f();
    }
    // Create hash of input for fixture filename
    const hash = (0, crypto_1.createHash)('sha1')
        .update((0, slowOperations_js_1.jsonStringify)(input))
        .digest('hex')
        .slice(0, 12);
    const filename = (0, path_1.join)(process.env.CLAUDE_CODE_TEST_FIXTURES_ROOT ?? (0, cwd_js_1.getCwd)(), `fixtures/${fixtureName}-${hash}.json`);
    // Fetch cached fixture
    try {
        const cached = (0, slowOperations_js_1.jsonParse)(await (0, promises_1.readFile)(filename, { encoding: 'utf8' }));
        return cached;
    }
    catch (e) {
        const code = (0, errors_js_1.getErrnoCode)(e);
        if (code !== 'ENOENT') {
            throw e;
        }
    }
    if ((env_js_1.env.isCI || process.env.CI) && !(0, envUtils_js_1.isEnvTruthy)(process.env.VCR_RECORD)) {
        throw new Error(`Fixture missing: ${filename}. Re-run tests with VCR_RECORD=1, then commit the result.`);
    }
    // Create & write new fixture
    const result = await f();
    await (0, promises_1.mkdir)((0, path_1.dirname)(filename), { recursive: true });
    await (0, promises_1.writeFile)(filename, (0, slowOperations_js_1.jsonStringify)(result, null, 2), {
        encoding: 'utf8',
    });
    return result;
}
async function withVCR(messages, f) {
    if (!shouldUseVCR()) {
        return await f();
    }
    const messagesForAPI = (0, messages_js_1.normalizeMessagesForAPI)(messages.filter(_ => {
        if (_.type !== 'user') {
            return true;
        }
        if (_.isMeta) {
            return false;
        }
        return true;
    }));
    const dehydratedInput = mapMessages(messagesForAPI.map(_ => _.message.content), dehydrateValue);
    const filename = (0, path_1.join)(process.env.CLAUDE_CODE_TEST_FIXTURES_ROOT ?? (0, cwd_js_1.getCwd)(), `fixtures/${dehydratedInput.map(_ => (0, crypto_1.createHash)('sha1').update((0, slowOperations_js_1.jsonStringify)(_)).digest('hex').slice(0, 6)).join('-')}.json`);
    // Fetch cached fixture
    try {
        const cached = (0, slowOperations_js_1.jsonParse)(await (0, promises_1.readFile)(filename, { encoding: 'utf8' }));
        cached.output.forEach(addCachedCostToTotalSessionCost);
        return cached.output.map((message, index) => mapMessage(message, hydrateValue, index, (0, crypto_1.randomUUID)()));
    }
    catch (e) {
        const code = (0, errors_js_1.getErrnoCode)(e);
        if (code !== 'ENOENT') {
            throw e;
        }
    }
    if (env_js_1.env.isCI && !(0, envUtils_js_1.isEnvTruthy)(process.env.VCR_RECORD)) {
        throw new Error(`Anthropic API fixture missing: ${filename}. Re-run tests with VCR_RECORD=1, then commit the result. Input messages:\n${(0, slowOperations_js_1.jsonStringify)(dehydratedInput, null, 2)}`);
    }
    // Create & write new fixture
    const results = await f();
    if (env_js_1.env.isCI && !(0, envUtils_js_1.isEnvTruthy)(process.env.VCR_RECORD)) {
        return results;
    }
    await (0, promises_1.mkdir)((0, path_1.dirname)(filename), { recursive: true });
    await (0, promises_1.writeFile)(filename, (0, slowOperations_js_1.jsonStringify)({
        input: dehydratedInput,
        output: results.map((message, index) => mapMessage(message, dehydrateValue, index)),
    }, null, 2), { encoding: 'utf8' });
    return results;
}
function addCachedCostToTotalSessionCost(message) {
    if (message.type === 'stream_event') {
        return;
    }
    const model = message.message.model;
    const usage = message.message.usage;
    const costUSD = (0, modelCost_js_1.calculateUSDCost)(model, usage);
    (0, cost_tracker_js_1.addToTotalSessionCost)(costUSD, usage, model);
}
function mapMessages(messages, f) {
    return messages.map(_ => {
        if (typeof _ === 'string') {
            return f(_);
        }
        return _.map(_ => {
            switch (_.type) {
                case 'tool_result':
                    if (typeof _.content === 'string') {
                        return { ..._, content: f(_.content) };
                    }
                    if (Array.isArray(_.content)) {
                        return {
                            ..._,
                            content: _.content.map(_ => {
                                switch (_.type) {
                                    case 'text':
                                        return { ..._, text: f(_.text) };
                                    case 'image':
                                        return _;
                                    default:
                                        return undefined;
                                }
                            }),
                        };
                    }
                    return _;
                case 'text':
                    return { ..._, text: f(_.text) };
                case 'tool_use':
                    return {
                        ..._,
                        input: mapValuesDeep(_.input, f),
                    };
                case 'image':
                    return _;
                default:
                    return undefined;
            }
        });
    });
}
function mapValuesDeep(obj, f) {
    return (0, mapValues_js_1.default)(obj, (val, key) => {
        if (Array.isArray(val)) {
            return val.map(_ => mapValuesDeep(_, f));
        }
        if ((0, isPlainObject_js_1.default)(val)) {
            return mapValuesDeep(val, f);
        }
        return f(val, key, obj);
    });
}
function mapAssistantMessage(message, f, index, uuid) {
    return {
        // Use provided UUID if given (hydrate path uses randomUUID for globally unique IDs),
        // otherwise fall back to deterministic index-based UUID (dehydrate/fixture path).
        // sessionStorage.ts deduplicates messages by UUID, so without unique UUIDs across
        // VCR calls, resumed sessions would treat different responses as duplicates.
        uuid: uuid ?? `UUID-${index}`,
        requestId: 'REQUEST_ID',
        timestamp: message.timestamp,
        message: {
            ...message.message,
            content: message.message.content
                .map(_ => {
                switch (_.type) {
                    case 'text':
                        return {
                            ..._,
                            text: f(_.text),
                            citations: _.citations || [],
                        }; // Ensure citations
                    case 'tool_use':
                        return {
                            ..._,
                            input: mapValuesDeep(_.input, f),
                        };
                    default:
                        return _; // Handle other block types unchanged
                }
            })
                .filter(Boolean),
        },
        type: 'assistant',
    };
}
function mapMessage(message, f, index, uuid) {
    if (message.type === 'assistant') {
        return mapAssistantMessage(message, f, index, uuid);
    }
    else {
        return message;
    }
}
function dehydrateValue(s) {
    if (typeof s !== 'string') {
        return s;
    }
    const cwd = (0, cwd_js_1.getCwd)();
    const configHome = (0, envUtils_js_1.getClaudeConfigHomeDir)();
    let s1 = s
        .replace(/num_files="\d+"/g, 'num_files="[NUM]"')
        .replace(/duration_ms="\d+"/g, 'duration_ms="[DURATION]"')
        .replace(/cost_usd="\d+"/g, 'cost_usd="[COST]"')
        // Note: We intentionally don't replace all forward slashes with path.sep here.
        // That would corrupt XML-like tags (e.g., </system-reminder> -> <\system-reminder>).
        // The [CONFIG_HOME] and [CWD] replacements below handle path normalization.
        .replaceAll(configHome, '[CONFIG_HOME]')
        .replaceAll(cwd, '[CWD]')
        .replace(/Available commands:.+/, 'Available commands: [COMMANDS]');
    // On Windows, paths may appear in multiple forms:
    // 1. Forward-slash variants (Git, some Node APIs)
    // 2. JSON-escaped variants (backslashes doubled in serialized JSON within messages)
    if (process.platform === 'win32') {
        const cwdFwd = cwd.replaceAll('\\', '/');
        const configHomeFwd = configHome.replaceAll('\\', '/');
        // jsonStringify escapes \ to \\ - match paths embedded in JSON strings
        const cwdJsonEscaped = (0, slowOperations_js_1.jsonStringify)(cwd).slice(1, -1);
        const configHomeJsonEscaped = (0, slowOperations_js_1.jsonStringify)(configHome).slice(1, -1);
        s1 = s1
            .replaceAll(cwdJsonEscaped, '[CWD]')
            .replaceAll(configHomeJsonEscaped, '[CONFIG_HOME]')
            .replaceAll(cwdFwd, '[CWD]')
            .replaceAll(configHomeFwd, '[CONFIG_HOME]');
    }
    // Normalize backslash path separators after placeholders so VCR fixture
    // hashes match across platforms (e.g., [CWD]\foo\bar -> [CWD]/foo/bar)
    // Handle both single backslashes and JSON-escaped double backslashes (\\)
    s1 = s1
        .replace(/\[CWD\][^\s"'<>]*/g, match => match.replaceAll('\\\\', '/').replaceAll('\\', '/'))
        .replace(/\[CONFIG_HOME\][^\s"'<>]*/g, match => match.replaceAll('\\\\', '/').replaceAll('\\', '/'));
    if (s1.includes('Files modified by user:')) {
        return 'Files modified by user: [FILES]';
    }
    return s1;
}
function hydrateValue(s) {
    if (typeof s !== 'string') {
        return s;
    }
    return s
        .replaceAll('[NUM]', '1')
        .replaceAll('[DURATION]', '100')
        .replaceAll('[CONFIG_HOME]', (0, envUtils_js_1.getClaudeConfigHomeDir)())
        .replaceAll('[CWD]', (0, cwd_js_1.getCwd)());
}
async function* withStreamingVCR(messages, f) {
    if (!shouldUseVCR()) {
        return yield* f();
    }
    // Compute and yield messages
    const buffer = [];
    // Record messages (or fetch from cache)
    const cachedBuffer = await withVCR(messages, async () => {
        for await (const message of f()) {
            buffer.push(message);
        }
        return buffer;
    });
    if (cachedBuffer.length > 0) {
        yield* cachedBuffer;
        return;
    }
    yield* buffer;
}
async function withTokenCountVCR(messages, tools, f) {
    // Dehydrate before hashing so fixture keys survive cwd/config-home/tempdir
    // variation and message UUID/timestamp churn. System prompts embed the
    // working directory (both raw and as a slash→dash project slug in the
    // auto-memory path) and messages carry fresh UUIDs per run; without this,
    // every test run produces a new hash and fixtures never hit in CI.
    const cwdSlug = (0, cwd_js_1.getCwd)().replace(/[^a-zA-Z0-9]/g, '-');
    const dehydrated = dehydrateValue((0, slowOperations_js_1.jsonStringify)({ messages, tools }))
        .replaceAll(cwdSlug, '[CWD_SLUG]')
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[UUID]')
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, '[TIMESTAMP]');
    const result = await withFixture(dehydrated, 'token-count', async () => ({
        tokenCount: await f(),
    }));
    return result.tokenCount;
}
