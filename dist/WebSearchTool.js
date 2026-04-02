"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSearchTool = void 0;
const providers_js_1 = require("src/utils/model/providers.js");
const v4_1 = require("zod/v4");
const growthbook_js_1 = require("../../services/analytics/growthbook.js");
const claude_js_1 = require("../../services/api/claude.js");
const Tool_js_1 = require("../../Tool.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const log_js_1 = require("../../utils/log.js");
const messages_js_1 = require("../../utils/messages.js");
const model_js_1 = require("../../utils/model/model.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const systemPromptType_js_1 = require("../../utils/systemPromptType.js");
const prompt_js_1 = require("./prompt.js");
const UI_js_1 = require("./UI.js");
const inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.strictObject({
    query: v4_1.z.string().min(2).describe('The search query to use'),
    allowed_domains: v4_1.z
        .array(v4_1.z.string())
        .optional()
        .describe('Only include search results from these domains'),
    blocked_domains: v4_1.z
        .array(v4_1.z.string())
        .optional()
        .describe('Never include search results from these domains'),
}));
const searchResultSchema = (0, lazySchema_js_1.lazySchema)(() => {
    const searchHitSchema = v4_1.z.object({
        title: v4_1.z.string().describe('The title of the search result'),
        url: v4_1.z.string().describe('The URL of the search result'),
    });
    return v4_1.z.object({
        tool_use_id: v4_1.z.string().describe('ID of the tool use'),
        content: v4_1.z.array(searchHitSchema).describe('Array of search hits'),
    });
});
const outputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    query: v4_1.z.string().describe('The search query that was executed'),
    results: v4_1.z
        .array(v4_1.z.union([searchResultSchema(), v4_1.z.string()]))
        .describe('Search results and/or text commentary from the model'),
    durationSeconds: v4_1.z
        .number()
        .describe('Time taken to complete the search operation'),
}));
function makeToolSchema(input) {
    return {
        type: 'web_search_20250305',
        name: 'web_search',
        allowed_domains: input.allowed_domains,
        blocked_domains: input.blocked_domains,
        max_uses: 8, // Hardcoded to 8 searches maximum
    };
}
function makeOutputFromSearchResponse(result, query, durationSeconds) {
    // The result is a sequence of these blocks:
    // - text to start -- always?
    // [
    //    - server_tool_use
    //    - web_search_tool_result
    //    - text and citation blocks intermingled
    //  ]+  (this block repeated for each search)
    const results = [];
    let textAcc = '';
    let inText = true;
    for (const block of result) {
        if (block.type === 'server_tool_use') {
            if (inText) {
                inText = false;
                if (textAcc.trim().length > 0) {
                    results.push(textAcc.trim());
                }
                textAcc = '';
            }
            continue;
        }
        if (block.type === 'web_search_tool_result') {
            // Handle error case - content is a WebSearchToolResultError
            if (!Array.isArray(block.content)) {
                const errorMessage = `Web search error: ${block.content.error_code}`;
                (0, log_js_1.logError)(new Error(errorMessage));
                results.push(errorMessage);
                continue;
            }
            // Success case - add results to our collection
            const hits = block.content.map(r => ({ title: r.title, url: r.url }));
            results.push({
                tool_use_id: block.tool_use_id,
                content: hits,
            });
        }
        if (block.type === 'text') {
            if (inText) {
                textAcc += block.text;
            }
            else {
                inText = true;
                textAcc = block.text;
            }
        }
    }
    if (textAcc.length) {
        results.push(textAcc.trim());
    }
    return {
        query,
        results,
        durationSeconds,
    };
}
exports.WebSearchTool = (0, Tool_js_1.buildTool)({
    name: prompt_js_1.WEB_SEARCH_TOOL_NAME,
    searchHint: 'search the web for current information',
    maxResultSizeChars: 100000,
    shouldDefer: true,
    async description(input) {
        return `Claude wants to search the web for: ${input.query}`;
    },
    userFacingName() {
        return 'Web Search';
    },
    getToolUseSummary: UI_js_1.getToolUseSummary,
    getActivityDescription(input) {
        const summary = (0, UI_js_1.getToolUseSummary)(input);
        return summary ? `Searching for ${summary}` : 'Searching the web';
    },
    isEnabled() {
        const provider = (0, providers_js_1.getAPIProvider)();
        const model = (0, model_js_1.getMainLoopModel)();
        // Enable for firstParty
        if (provider === 'firstParty') {
            return true;
        }
        // Enable for Vertex AI with supported models (Claude 4.0+)
        if (provider === 'vertex') {
            const supportsWebSearch = model.includes('claude-opus-4') ||
                model.includes('claude-sonnet-4') ||
                model.includes('claude-haiku-4');
            return supportsWebSearch;
        }
        // Foundry only ships models that already support Web Search
        if (provider === 'foundry') {
            return true;
        }
        return false;
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    isConcurrencySafe() {
        return true;
    },
    isReadOnly() {
        return true;
    },
    toAutoClassifierInput(input) {
        return input.query;
    },
    async checkPermissions(_input) {
        return {
            behavior: 'passthrough',
            message: 'WebSearchTool requires permission.',
            suggestions: [
                {
                    type: 'addRules',
                    rules: [{ toolName: prompt_js_1.WEB_SEARCH_TOOL_NAME }],
                    behavior: 'allow',
                    destination: 'localSettings',
                },
            ],
        };
    },
    async prompt() {
        return (0, prompt_js_1.getWebSearchPrompt)();
    },
    renderToolUseMessage: UI_js_1.renderToolUseMessage,
    renderToolUseProgressMessage: UI_js_1.renderToolUseProgressMessage,
    renderToolResultMessage: UI_js_1.renderToolResultMessage,
    extractSearchText() {
        // renderToolResultMessage shows only "Did N searches in Xs" chrome —
        // the results[] content never appears on screen. Heuristic would index
        // string entries in results[] (phantom match). Nothing to search.
        return '';
    },
    async validateInput(input) {
        const { query, allowed_domains, blocked_domains } = input;
        if (!query.length) {
            return {
                result: false,
                message: 'Error: Missing query',
                errorCode: 1,
            };
        }
        if (allowed_domains?.length && blocked_domains?.length) {
            return {
                result: false,
                message: 'Error: Cannot specify both allowed_domains and blocked_domains in the same request',
                errorCode: 2,
            };
        }
        return { result: true };
    },
    async call(input, context, _canUseTool, _parentMessage, onProgress) {
        const startTime = performance.now();
        const { query } = input;
        const userMessage = (0, messages_js_1.createUserMessage)({
            content: 'Perform a web search for the query: ' + query,
        });
        const toolSchema = makeToolSchema(input);
        const useHaiku = (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_plum_vx3', false);
        const appState = context.getAppState();
        const queryStream = (0, claude_js_1.queryModelWithStreaming)({
            messages: [userMessage],
            systemPrompt: (0, systemPromptType_js_1.asSystemPrompt)([
                'You are an assistant for performing a web search tool use',
            ]),
            thinkingConfig: useHaiku
                ? { type: 'disabled' }
                : context.options.thinkingConfig,
            tools: [],
            signal: context.abortController.signal,
            options: {
                getToolPermissionContext: async () => appState.toolPermissionContext,
                model: useHaiku ? (0, model_js_1.getSmallFastModel)() : context.options.mainLoopModel,
                toolChoice: useHaiku ? { type: 'tool', name: 'web_search' } : undefined,
                isNonInteractiveSession: context.options.isNonInteractiveSession,
                hasAppendSystemPrompt: !!context.options.appendSystemPrompt,
                extraToolSchemas: [toolSchema],
                querySource: 'web_search_tool',
                agents: context.options.agentDefinitions.activeAgents,
                mcpTools: [],
                agentId: context.agentId,
                effortValue: appState.effortValue,
            },
        });
        const allContentBlocks = [];
        let currentToolUseId = null;
        let currentToolUseJson = '';
        let progressCounter = 0;
        const toolUseQueries = new Map(); // Map of tool_use_id to query
        for await (const event of queryStream) {
            if (event.type === 'assistant') {
                allContentBlocks.push(...event.message.content);
                continue;
            }
            // Track tool use ID when server_tool_use starts
            if (event.type === 'stream_event' &&
                event.event?.type === 'content_block_start') {
                const contentBlock = event.event.content_block;
                if (contentBlock && contentBlock.type === 'server_tool_use') {
                    currentToolUseId = contentBlock.id;
                    currentToolUseJson = '';
                    // Note: The ServerToolUseBlock doesn't contain input.query
                    // The actual query comes through input_json_delta events
                    continue;
                }
            }
            // Accumulate JSON for current tool use
            if (currentToolUseId &&
                event.type === 'stream_event' &&
                event.event?.type === 'content_block_delta') {
                const delta = event.event.delta;
                if (delta?.type === 'input_json_delta' && delta.partial_json) {
                    currentToolUseJson += delta.partial_json;
                    // Try to extract query from partial JSON for progress updates
                    try {
                        // Look for a complete query field
                        const queryMatch = currentToolUseJson.match(/"query"\s*:\s*"((?:[^"\\]|\\.)*)"/);
                        if (queryMatch && queryMatch[1]) {
                            // The regex properly handles escaped characters
                            const query = (0, slowOperations_js_1.jsonParse)('"' + queryMatch[1] + '"');
                            if (!toolUseQueries.has(currentToolUseId) ||
                                toolUseQueries.get(currentToolUseId) !== query) {
                                toolUseQueries.set(currentToolUseId, query);
                                progressCounter++;
                                if (onProgress) {
                                    onProgress({
                                        toolUseID: `search-progress-${progressCounter}`,
                                        data: {
                                            type: 'query_update',
                                            query,
                                        },
                                    });
                                }
                            }
                        }
                    }
                    catch {
                        // Ignore parsing errors for partial JSON
                    }
                }
            }
            // Yield progress when search results come in
            if (event.type === 'stream_event' &&
                event.event?.type === 'content_block_start') {
                const contentBlock = event.event.content_block;
                if (contentBlock && contentBlock.type === 'web_search_tool_result') {
                    // Get the actual query that was used for this search
                    const toolUseId = contentBlock.tool_use_id;
                    const actualQuery = toolUseQueries.get(toolUseId) || query;
                    const content = contentBlock.content;
                    progressCounter++;
                    if (onProgress) {
                        onProgress({
                            toolUseID: toolUseId || `search-progress-${progressCounter}`,
                            data: {
                                type: 'search_results_received',
                                resultCount: Array.isArray(content) ? content.length : 0,
                                query: actualQuery,
                            },
                        });
                    }
                }
            }
        }
        // Process the final result
        const endTime = performance.now();
        const durationSeconds = (endTime - startTime) / 1000;
        const data = makeOutputFromSearchResponse(allContentBlocks, query, durationSeconds);
        return { data };
    },
    mapToolResultToToolResultBlockParam(output, toolUseID) {
        const { query, results } = output;
        let formattedOutput = `Web search results for query: "${query}"\n\n`;
        (results ?? []).forEach(result => {
            if (result == null) {
                return;
            }
            if (typeof result === 'string') {
                // Text summary
                formattedOutput += result + '\n\n';
            }
            else {
                // Search result with links
                if (result.content?.length > 0) {
                    formattedOutput += `Links: ${(0, slowOperations_js_1.jsonStringify)(result.content)}\n\n`;
                }
                else {
                    formattedOutput += 'No links found.\n\n';
                }
            }
        });
        formattedOutput +=
            '\nREMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.';
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: formattedOutput.trim(),
        };
    },
});
