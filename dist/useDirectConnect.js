"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useDirectConnect = useDirectConnect;
const react_1 = require("react");
const remotePermissionBridge_js_1 = require("../remote/remotePermissionBridge.js");
const sdkMessageAdapter_js_1 = require("../remote/sdkMessageAdapter.js");
const directConnectManager_js_1 = require("../server/directConnectManager.js");
const Tool_js_1 = require("../Tool.js");
const debug_js_1 = require("../utils/debug.js");
const gracefulShutdown_js_1 = require("../utils/gracefulShutdown.js");
function useDirectConnect({ config, setMessages, setIsLoading, setToolUseConfirmQueue, tools, }) {
    const isRemoteMode = !!config;
    const managerRef = (0, react_1.useRef)(null);
    const hasReceivedInitRef = (0, react_1.useRef)(false);
    const isConnectedRef = (0, react_1.useRef)(false);
    // Keep a ref to tools so the WebSocket callback doesn't go stale
    const toolsRef = (0, react_1.useRef)(tools);
    (0, react_1.useEffect)(() => {
        toolsRef.current = tools;
    }, [tools]);
    (0, react_1.useEffect)(() => {
        if (!config) {
            return;
        }
        hasReceivedInitRef.current = false;
        (0, debug_js_1.logForDebugging)(`[useDirectConnect] Connecting to ${config.wsUrl}`);
        const manager = new directConnectManager_js_1.DirectConnectSessionManager(config, {
            onMessage: sdkMessage => {
                if ((0, sdkMessageAdapter_js_1.isSessionEndMessage)(sdkMessage)) {
                    setIsLoading(false);
                }
                // Skip duplicate init messages (server sends one per turn)
                if (sdkMessage.type === 'system' && sdkMessage.subtype === 'init') {
                    if (hasReceivedInitRef.current) {
                        return;
                    }
                    hasReceivedInitRef.current = true;
                }
                const converted = (0, sdkMessageAdapter_js_1.convertSDKMessage)(sdkMessage, {
                    convertToolResults: true,
                });
                if (converted.type === 'message') {
                    setMessages(prev => [...prev, converted.message]);
                }
            },
            onPermissionRequest: (request, requestId) => {
                (0, debug_js_1.logForDebugging)(`[useDirectConnect] Permission request for tool: ${request.tool_name}`);
                const tool = (0, Tool_js_1.findToolByName)(toolsRef.current, request.tool_name) ??
                    (0, remotePermissionBridge_js_1.createToolStub)(request.tool_name);
                const syntheticMessage = (0, remotePermissionBridge_js_1.createSyntheticAssistantMessage)(request, requestId);
                const permissionResult = {
                    behavior: 'ask',
                    message: request.description ?? `${request.tool_name} requires permission`,
                    suggestions: request.permission_suggestions,
                    blockedPath: request.blocked_path,
                };
                const toolUseConfirm = {
                    assistantMessage: syntheticMessage,
                    tool,
                    description: request.description ?? `${request.tool_name} requires permission`,
                    input: request.input,
                    toolUseContext: {},
                    toolUseID: request.tool_use_id,
                    permissionResult,
                    permissionPromptStartTimeMs: Date.now(),
                    onUserInteraction() {
                        // No-op for remote
                    },
                    onAbort() {
                        const response = {
                            behavior: 'deny',
                            message: 'User aborted',
                        };
                        manager.respondToPermissionRequest(requestId, response);
                        setToolUseConfirmQueue(queue => queue.filter(item => item.toolUseID !== request.tool_use_id));
                    },
                    onAllow(updatedInput, _permissionUpdates, _feedback) {
                        const response = {
                            behavior: 'allow',
                            updatedInput,
                        };
                        manager.respondToPermissionRequest(requestId, response);
                        setToolUseConfirmQueue(queue => queue.filter(item => item.toolUseID !== request.tool_use_id));
                        setIsLoading(true);
                    },
                    onReject(feedback) {
                        const response = {
                            behavior: 'deny',
                            message: feedback ?? 'User denied permission',
                        };
                        manager.respondToPermissionRequest(requestId, response);
                        setToolUseConfirmQueue(queue => queue.filter(item => item.toolUseID !== request.tool_use_id));
                    },
                    async recheckPermission() {
                        // No-op for remote
                    },
                };
                setToolUseConfirmQueue(queue => [...queue, toolUseConfirm]);
                setIsLoading(false);
            },
            onConnected: () => {
                (0, debug_js_1.logForDebugging)('[useDirectConnect] Connected');
                isConnectedRef.current = true;
            },
            onDisconnected: () => {
                (0, debug_js_1.logForDebugging)('[useDirectConnect] Disconnected');
                if (!isConnectedRef.current) {
                    // Never connected — connection failure (e.g. auth rejected)
                    process.stderr.write(`\nFailed to connect to server at ${config.wsUrl}\n`);
                }
                else {
                    // Was connected then lost — server process exited or network dropped
                    process.stderr.write('\nServer disconnected.\n');
                }
                isConnectedRef.current = false;
                void (0, gracefulShutdown_js_1.gracefulShutdown)(1);
                setIsLoading(false);
            },
            onError: error => {
                (0, debug_js_1.logForDebugging)(`[useDirectConnect] Error: ${error.message}`);
            },
        });
        managerRef.current = manager;
        manager.connect();
        return () => {
            (0, debug_js_1.logForDebugging)('[useDirectConnect] Cleanup - disconnecting');
            manager.disconnect();
            managerRef.current = null;
        };
    }, [config, setMessages, setIsLoading, setToolUseConfirmQueue]);
    const sendMessage = (0, react_1.useCallback)(async (content) => {
        const manager = managerRef.current;
        if (!manager) {
            return false;
        }
        setIsLoading(true);
        return manager.sendMessage(content);
    }, [setIsLoading]);
    // Cancel the current request
    const cancelRequest = (0, react_1.useCallback)(() => {
        // Send interrupt signal to the server
        managerRef.current?.sendInterrupt();
        setIsLoading(false);
    }, [setIsLoading]);
    const disconnect = (0, react_1.useCallback)(() => {
        managerRef.current?.disconnect();
        managerRef.current = null;
        isConnectedRef.current = false;
    }, []);
    // Same stability concern as useRemoteSession — memoize so consumers
    // that depend on the result object don't see a fresh reference per render.
    return (0, react_1.useMemo)(() => ({ isRemoteMode, sendMessage, cancelRequest, disconnect }), [isRemoteMode, sendMessage, cancelRequest, disconnect]);
}
