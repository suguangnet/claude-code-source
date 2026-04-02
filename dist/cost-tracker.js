"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUsageForModel = exports.getModelUsage = exports.setHasUnknownModelCost = exports.resetCostState = exports.resetStateForTests = exports.hasUnknownModelCost = exports.getTotalWebSearchRequests = exports.getTotalCacheCreationInputTokens = exports.getTotalCacheReadInputTokens = exports.getTotalOutputTokens = exports.getTotalInputTokens = exports.getTotalLinesRemoved = exports.getTotalLinesAdded = exports.addToTotalLinesChanged = exports.getTotalAPIDurationWithoutRetries = exports.getTotalAPIDuration = exports.getTotalDuration = exports.getTotalCost = void 0;
exports.formatCost = formatCost;
exports.getStoredSessionCosts = getStoredSessionCosts;
exports.restoreCostStateForSession = restoreCostStateForSession;
exports.saveCurrentSessionCosts = saveCurrentSessionCosts;
exports.formatTotalCost = formatTotalCost;
exports.addToTotalSessionCost = addToTotalSessionCost;
const chalk_1 = __importDefault(require("chalk"));
const state_js_1 = require("./bootstrap/state.js");
Object.defineProperty(exports, "addToTotalLinesChanged", { enumerable: true, get: function () { return state_js_1.addToTotalLinesChanged; } });
Object.defineProperty(exports, "getModelUsage", { enumerable: true, get: function () { return state_js_1.getModelUsage; } });
Object.defineProperty(exports, "getTotalAPIDuration", { enumerable: true, get: function () { return state_js_1.getTotalAPIDuration; } });
Object.defineProperty(exports, "getTotalAPIDurationWithoutRetries", { enumerable: true, get: function () { return state_js_1.getTotalAPIDurationWithoutRetries; } });
Object.defineProperty(exports, "getTotalCacheCreationInputTokens", { enumerable: true, get: function () { return state_js_1.getTotalCacheCreationInputTokens; } });
Object.defineProperty(exports, "getTotalCacheReadInputTokens", { enumerable: true, get: function () { return state_js_1.getTotalCacheReadInputTokens; } });
Object.defineProperty(exports, "getTotalCost", { enumerable: true, get: function () { return state_js_1.getTotalCostUSD; } });
Object.defineProperty(exports, "getTotalDuration", { enumerable: true, get: function () { return state_js_1.getTotalDuration; } });
Object.defineProperty(exports, "getTotalInputTokens", { enumerable: true, get: function () { return state_js_1.getTotalInputTokens; } });
Object.defineProperty(exports, "getTotalLinesAdded", { enumerable: true, get: function () { return state_js_1.getTotalLinesAdded; } });
Object.defineProperty(exports, "getTotalLinesRemoved", { enumerable: true, get: function () { return state_js_1.getTotalLinesRemoved; } });
Object.defineProperty(exports, "getTotalOutputTokens", { enumerable: true, get: function () { return state_js_1.getTotalOutputTokens; } });
Object.defineProperty(exports, "getTotalWebSearchRequests", { enumerable: true, get: function () { return state_js_1.getTotalWebSearchRequests; } });
Object.defineProperty(exports, "getUsageForModel", { enumerable: true, get: function () { return state_js_1.getUsageForModel; } });
Object.defineProperty(exports, "hasUnknownModelCost", { enumerable: true, get: function () { return state_js_1.hasUnknownModelCost; } });
Object.defineProperty(exports, "resetCostState", { enumerable: true, get: function () { return state_js_1.resetCostState; } });
Object.defineProperty(exports, "resetStateForTests", { enumerable: true, get: function () { return state_js_1.resetStateForTests; } });
Object.defineProperty(exports, "setHasUnknownModelCost", { enumerable: true, get: function () { return state_js_1.setHasUnknownModelCost; } });
const index_js_1 = require("./services/analytics/index.js");
const advisor_js_1 = require("./utils/advisor.js");
const config_js_1 = require("./utils/config.js");
const context_js_1 = require("./utils/context.js");
const fastMode_js_1 = require("./utils/fastMode.js");
const format_js_1 = require("./utils/format.js");
const model_js_1 = require("./utils/model/model.js");
const modelCost_js_1 = require("./utils/modelCost.js");
/**
 * Gets stored cost state from project config for a specific session.
 * Returns the cost data if the session ID matches, or undefined otherwise.
 * Use this to read costs BEFORE overwriting the config with saveCurrentSessionCosts().
 */
function getStoredSessionCosts(sessionId) {
    const projectConfig = (0, config_js_1.getCurrentProjectConfig)();
    // Only return costs if this is the same session that was last saved
    if (projectConfig.lastSessionId !== sessionId) {
        return undefined;
    }
    // Build model usage with context windows
    let modelUsage;
    if (projectConfig.lastModelUsage) {
        modelUsage = Object.fromEntries(Object.entries(projectConfig.lastModelUsage).map(([model, usage]) => [
            model,
            {
                ...usage,
                contextWindow: (0, context_js_1.getContextWindowForModel)(model, (0, state_js_1.getSdkBetas)()),
                maxOutputTokens: (0, context_js_1.getModelMaxOutputTokens)(model).default,
            },
        ]));
    }
    return {
        totalCostUSD: projectConfig.lastCost ?? 0,
        totalAPIDuration: projectConfig.lastAPIDuration ?? 0,
        totalAPIDurationWithoutRetries: projectConfig.lastAPIDurationWithoutRetries ?? 0,
        totalToolDuration: projectConfig.lastToolDuration ?? 0,
        totalLinesAdded: projectConfig.lastLinesAdded ?? 0,
        totalLinesRemoved: projectConfig.lastLinesRemoved ?? 0,
        lastDuration: projectConfig.lastDuration,
        modelUsage,
    };
}
/**
 * Restores cost state from project config when resuming a session.
 * Only restores if the session ID matches the last saved session.
 * @returns true if cost state was restored, false otherwise
 */
function restoreCostStateForSession(sessionId) {
    const data = getStoredSessionCosts(sessionId);
    if (!data) {
        return false;
    }
    (0, state_js_1.setCostStateForRestore)(data);
    return true;
}
/**
 * Saves the current session's costs to project config.
 * Call this before switching sessions to avoid losing accumulated costs.
 */
function saveCurrentSessionCosts(fpsMetrics) {
    (0, config_js_1.saveCurrentProjectConfig)(current => ({
        ...current,
        lastCost: (0, state_js_1.getTotalCostUSD)(),
        lastAPIDuration: (0, state_js_1.getTotalAPIDuration)(),
        lastAPIDurationWithoutRetries: (0, state_js_1.getTotalAPIDurationWithoutRetries)(),
        lastToolDuration: (0, state_js_1.getTotalToolDuration)(),
        lastDuration: (0, state_js_1.getTotalDuration)(),
        lastLinesAdded: (0, state_js_1.getTotalLinesAdded)(),
        lastLinesRemoved: (0, state_js_1.getTotalLinesRemoved)(),
        lastTotalInputTokens: (0, state_js_1.getTotalInputTokens)(),
        lastTotalOutputTokens: (0, state_js_1.getTotalOutputTokens)(),
        lastTotalCacheCreationInputTokens: (0, state_js_1.getTotalCacheCreationInputTokens)(),
        lastTotalCacheReadInputTokens: (0, state_js_1.getTotalCacheReadInputTokens)(),
        lastTotalWebSearchRequests: (0, state_js_1.getTotalWebSearchRequests)(),
        lastFpsAverage: fpsMetrics?.averageFps,
        lastFpsLow1Pct: fpsMetrics?.low1PctFps,
        lastModelUsage: Object.fromEntries(Object.entries((0, state_js_1.getModelUsage)()).map(([model, usage]) => [
            model,
            {
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                cacheReadInputTokens: usage.cacheReadInputTokens,
                cacheCreationInputTokens: usage.cacheCreationInputTokens,
                webSearchRequests: usage.webSearchRequests,
                costUSD: usage.costUSD,
            },
        ])),
        lastSessionId: (0, state_js_1.getSessionId)(),
    }));
}
function formatCost(cost, maxDecimalPlaces = 4) {
    return `$${cost > 0.5 ? round(cost, 100).toFixed(2) : cost.toFixed(maxDecimalPlaces)}`;
}
function formatModelUsage() {
    const modelUsageMap = (0, state_js_1.getModelUsage)();
    if (Object.keys(modelUsageMap).length === 0) {
        return 'Usage:                 0 input, 0 output, 0 cache read, 0 cache write';
    }
    // Accumulate usage by short name
    const usageByShortName = {};
    for (const [model, usage] of Object.entries(modelUsageMap)) {
        const shortName = (0, model_js_1.getCanonicalName)(model);
        if (!usageByShortName[shortName]) {
            usageByShortName[shortName] = {
                inputTokens: 0,
                outputTokens: 0,
                cacheReadInputTokens: 0,
                cacheCreationInputTokens: 0,
                webSearchRequests: 0,
                costUSD: 0,
                contextWindow: 0,
                maxOutputTokens: 0,
            };
        }
        const accumulated = usageByShortName[shortName];
        accumulated.inputTokens += usage.inputTokens;
        accumulated.outputTokens += usage.outputTokens;
        accumulated.cacheReadInputTokens += usage.cacheReadInputTokens;
        accumulated.cacheCreationInputTokens += usage.cacheCreationInputTokens;
        accumulated.webSearchRequests += usage.webSearchRequests;
        accumulated.costUSD += usage.costUSD;
    }
    let result = 'Usage by model:';
    for (const [shortName, usage] of Object.entries(usageByShortName)) {
        const usageString = `  ${(0, format_js_1.formatNumber)(usage.inputTokens)} input, ` +
            `${(0, format_js_1.formatNumber)(usage.outputTokens)} output, ` +
            `${(0, format_js_1.formatNumber)(usage.cacheReadInputTokens)} cache read, ` +
            `${(0, format_js_1.formatNumber)(usage.cacheCreationInputTokens)} cache write` +
            (usage.webSearchRequests > 0
                ? `, ${(0, format_js_1.formatNumber)(usage.webSearchRequests)} web search`
                : '') +
            ` (${formatCost(usage.costUSD)})`;
        result += `\n` + `${shortName}:`.padStart(21) + usageString;
    }
    return result;
}
function formatTotalCost() {
    const costDisplay = formatCost((0, state_js_1.getTotalCostUSD)()) +
        ((0, state_js_1.hasUnknownModelCost)()
            ? ' (costs may be inaccurate due to usage of unknown models)'
            : '');
    const modelUsageDisplay = formatModelUsage();
    return chalk_1.default.dim(`Total cost:            ${costDisplay}\n` +
        `Total duration (API):  ${(0, format_js_1.formatDuration)((0, state_js_1.getTotalAPIDuration)())}
Total duration (wall): ${(0, format_js_1.formatDuration)((0, state_js_1.getTotalDuration)())}
Total code changes:    ${(0, state_js_1.getTotalLinesAdded)()} ${(0, state_js_1.getTotalLinesAdded)() === 1 ? 'line' : 'lines'} added, ${(0, state_js_1.getTotalLinesRemoved)()} ${(0, state_js_1.getTotalLinesRemoved)() === 1 ? 'line' : 'lines'} removed
${modelUsageDisplay}`);
}
function round(number, precision) {
    return Math.round(number * precision) / precision;
}
function addToTotalModelUsage(cost, usage, model) {
    const modelUsage = (0, state_js_1.getUsageForModel)(model) ?? {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        webSearchRequests: 0,
        costUSD: 0,
        contextWindow: 0,
        maxOutputTokens: 0,
    };
    modelUsage.inputTokens += usage.input_tokens;
    modelUsage.outputTokens += usage.output_tokens;
    modelUsage.cacheReadInputTokens += usage.cache_read_input_tokens ?? 0;
    modelUsage.cacheCreationInputTokens += usage.cache_creation_input_tokens ?? 0;
    modelUsage.webSearchRequests +=
        usage.server_tool_use?.web_search_requests ?? 0;
    modelUsage.costUSD += cost;
    modelUsage.contextWindow = (0, context_js_1.getContextWindowForModel)(model, (0, state_js_1.getSdkBetas)());
    modelUsage.maxOutputTokens = (0, context_js_1.getModelMaxOutputTokens)(model).default;
    return modelUsage;
}
function addToTotalSessionCost(cost, usage, model) {
    const modelUsage = addToTotalModelUsage(cost, usage, model);
    (0, state_js_1.addToTotalCostState)(cost, modelUsage, model);
    const attrs = (0, fastMode_js_1.isFastModeEnabled)() && usage.speed === 'fast'
        ? { model, speed: 'fast' }
        : { model };
    (0, state_js_1.getCostCounter)()?.add(cost, attrs);
    (0, state_js_1.getTokenCounter)()?.add(usage.input_tokens, { ...attrs, type: 'input' });
    (0, state_js_1.getTokenCounter)()?.add(usage.output_tokens, { ...attrs, type: 'output' });
    (0, state_js_1.getTokenCounter)()?.add(usage.cache_read_input_tokens ?? 0, {
        ...attrs,
        type: 'cacheRead',
    });
    (0, state_js_1.getTokenCounter)()?.add(usage.cache_creation_input_tokens ?? 0, {
        ...attrs,
        type: 'cacheCreation',
    });
    let totalCost = cost;
    for (const advisorUsage of (0, advisor_js_1.getAdvisorUsage)(usage)) {
        const advisorCost = (0, modelCost_js_1.calculateUSDCost)(advisorUsage.model, advisorUsage);
        (0, index_js_1.logEvent)('tengu_advisor_tool_token_usage', {
            advisor_model: advisorUsage.model,
            input_tokens: advisorUsage.input_tokens,
            output_tokens: advisorUsage.output_tokens,
            cache_read_input_tokens: advisorUsage.cache_read_input_tokens ?? 0,
            cache_creation_input_tokens: advisorUsage.cache_creation_input_tokens ?? 0,
            cost_usd_micros: Math.round(advisorCost * 1000000),
        });
        totalCost += addToTotalSessionCost(advisorCost, advisorUsage, advisorUsage.model);
    }
    return totalCost;
}
