"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useIdeConnectionStatus = useIdeConnectionStatus;
const react_1 = require("react");
function useIdeConnectionStatus(mcpClients) {
    return (0, react_1.useMemo)(() => {
        const ideClient = mcpClients?.find(client => client.name === 'ide');
        if (!ideClient) {
            return { status: null, ideName: null };
        }
        // Extract IDE name from config if available
        const config = ideClient.config;
        const ideName = config.type === 'sse-ide' || config.type === 'ws-ide'
            ? config.ideName
            : null;
        if (ideClient.type === 'connected') {
            return { status: 'connected', ideName };
        }
        if (ideClient.type === 'pending') {
            return { status: 'pending', ideName };
        }
        return { status: 'disconnected', ideName };
    }, [mcpClients]);
}
