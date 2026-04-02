"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useIdeAtMentioned = useIdeAtMentioned;
const react_1 = require("react");
const log_js_1 = require("src/utils/log.js");
const v4_1 = require("zod/v4");
const ide_js_1 = require("../utils/ide.js");
const lazySchema_js_1 = require("../utils/lazySchema.js");
const NOTIFICATION_METHOD = 'at_mentioned';
const AtMentionedSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    method: v4_1.z.literal(NOTIFICATION_METHOD),
    params: v4_1.z.object({
        filePath: v4_1.z.string(),
        lineStart: v4_1.z.number().optional(),
        lineEnd: v4_1.z.number().optional(),
    }),
}));
/**
 * A hook that tracks IDE at-mention notifications by directly registering
 * with MCP client notification handlers,
 */
function useIdeAtMentioned(mcpClients, onAtMentioned) {
    const ideClientRef = (0, react_1.useRef)(undefined);
    (0, react_1.useEffect)(() => {
        // Find the IDE client from the MCP clients list
        const ideClient = (0, ide_js_1.getConnectedIdeClient)(mcpClients);
        if (ideClientRef.current !== ideClient) {
            ideClientRef.current = ideClient;
        }
        // If we found a connected IDE client, register our handler
        if (ideClient) {
            ideClient.client.setNotificationHandler(AtMentionedSchema(), notification => {
                if (ideClientRef.current !== ideClient) {
                    return;
                }
                try {
                    const data = notification.params;
                    // Adjust line numbers to be 1-based instead of 0-based
                    const lineStart = data.lineStart !== undefined ? data.lineStart + 1 : undefined;
                    const lineEnd = data.lineEnd !== undefined ? data.lineEnd + 1 : undefined;
                    onAtMentioned({
                        filePath: data.filePath,
                        lineStart: lineStart,
                        lineEnd: lineEnd,
                    });
                }
                catch (error) {
                    (0, log_js_1.logError)(error);
                }
            });
        }
        // No cleanup needed as MCP clients manage their own lifecycle
    }, [mcpClients, onAtMentioned]);
}
