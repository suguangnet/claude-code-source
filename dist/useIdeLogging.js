"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useIdeLogging = useIdeLogging;
const react_1 = require("react");
const index_js_1 = require("src/services/analytics/index.js");
const v4_1 = require("zod/v4");
const ide_js_1 = require("../utils/ide.js");
const lazySchema_js_1 = require("../utils/lazySchema.js");
const LogEventSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    method: v4_1.z.literal('log_event'),
    params: v4_1.z.object({
        eventName: v4_1.z.string(),
        eventData: v4_1.z.object({}).passthrough(),
    }),
}));
function useIdeLogging(mcpClients) {
    (0, react_1.useEffect)(() => {
        // Skip if there are no clients
        if (!mcpClients.length) {
            return;
        }
        // Find the IDE client from the MCP clients list
        const ideClient = (0, ide_js_1.getConnectedIdeClient)(mcpClients);
        if (ideClient) {
            // Register the log event handler
            ideClient.client.setNotificationHandler(LogEventSchema(), notification => {
                const { eventName, eventData } = notification.params;
                (0, index_js_1.logEvent)(`tengu_ide_${eventName}`, eventData);
            });
        }
    }, [mcpClients]);
}
