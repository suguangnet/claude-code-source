"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApiQueryHook = createApiQueryHook;
const crypto_1 = require("crypto");
const claude_js_1 = require("../../services/api/claude.js");
const abortController_js_1 = require("../../utils/abortController.js");
const log_js_1 = require("../../utils/log.js");
const errors_js_1 = require("../errors.js");
const messages_js_1 = require("../messages.js");
const systemPromptType_js_1 = require("../systemPromptType.js");
function createApiQueryHook(config) {
    return async (context) => {
        try {
            const shouldRun = await config.shouldRun(context);
            if (!shouldRun) {
                return;
            }
            const uuid = (0, crypto_1.randomUUID)();
            // Build messages using the config's buildMessages function
            const messages = config.buildMessages(context);
            context.queryMessageCount = messages.length;
            // Use config's system prompt if provided, otherwise use context's
            const systemPrompt = config.systemPrompt
                ? (0, systemPromptType_js_1.asSystemPrompt)([config.systemPrompt])
                : context.systemPrompt;
            // Use config's tools preference (defaults to true = use context tools)
            const useTools = config.useTools ?? true;
            const tools = useTools ? context.toolUseContext.options.tools : [];
            // Get model (lazy loaded)
            const model = config.getModel(context);
            // Make API call
            const response = await (0, claude_js_1.queryModelWithoutStreaming)({
                messages,
                systemPrompt,
                thinkingConfig: { type: 'disabled' },
                tools,
                signal: (0, abortController_js_1.createAbortController)().signal,
                options: {
                    getToolPermissionContext: async () => {
                        const appState = context.toolUseContext.getAppState();
                        return appState.toolPermissionContext;
                    },
                    model,
                    toolChoice: undefined,
                    isNonInteractiveSession: context.toolUseContext.options.isNonInteractiveSession,
                    hasAppendSystemPrompt: !!context.toolUseContext.options.appendSystemPrompt,
                    temperatureOverride: 0,
                    agents: context.toolUseContext.options.agentDefinitions.activeAgents,
                    querySource: config.name,
                    mcpTools: [],
                    agentId: context.toolUseContext.agentId,
                },
            });
            // Parse response
            const content = (0, messages_js_1.extractTextContent)(response.message.content).trim();
            try {
                const result = config.parseResponse(content, context);
                config.logResult({
                    type: 'success',
                    queryName: config.name,
                    result,
                    messageId: response.message.id,
                    model,
                    uuid,
                }, context);
            }
            catch (error) {
                config.logResult({
                    type: 'error',
                    queryName: config.name,
                    error: error,
                    uuid,
                }, context);
            }
        }
        catch (error) {
            (0, log_js_1.logError)((0, errors_js_1.toError)(error));
        }
    };
}
