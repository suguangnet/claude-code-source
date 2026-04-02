"use strict";
/**
 * REPL integration hook for `claude ssh` sessions.
 *
 * Sibling to useDirectConnect — same shape (isRemoteMode/sendMessage/
 * cancelRequest/disconnect), same REPL wiring, but drives an SSH child
 * process instead of a WebSocket. Kept separate rather than generalizing
 * useDirectConnect because the lifecycle differs: the ssh process and auth
 * proxy are created BEFORE this hook runs (during startup, in main.tsx) and
 * handed in; useDirectConnect creates its WebSocket inside the effect.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSSHSession = useSSHSession;
const crypto_1 = require("crypto");
const react_1 = require("react");
const remotePermissionBridge_js_1 = require("../remote/remotePermissionBridge.js");
const sdkMessageAdapter_js_1 = require("../remote/sdkMessageAdapter.js");
const Tool_js_1 = require("../Tool.js");
const debug_js_1 = require("../utils/debug.js");
const gracefulShutdown_js_1 = require("../utils/gracefulShutdown.js");
function useSSHSession({ session, setMessages, setIsLoading, setToolUseConfirmQueue, tools, }) {
    const isRemoteMode = !!session;
    const managerRef = (0, react_1.useRef)(null);
    const hasReceivedInitRef = (0, react_1.useRef)(false);
    const isConnectedRef = (0, react_1.useRef)(false);
    const toolsRef = (0, react_1.useRef)(tools);
    (0, react_1.useEffect)(() => {
        toolsRef.current = tools;
    }, [tools]);
    (0, react_1.useEffect)(() => {
        if (!session)
            return;
        hasReceivedInitRef.current = false;
        (0, debug_js_1.logForDebugging)('[useSSHSession] wiring SSH session manager');
        const manager = session.createManager({
            onMessage: sdkMessage => {
                if ((0, sdkMessageAdapter_js_1.isSessionEndMessage)(sdkMessage)) {
                    setIsLoading(false);
                }
                // Skip duplicate init messages (one per turn from stream-json mode).
                if (sdkMessage.type === 'system' && sdkMessage.subtype === 'init') {
                    if (hasReceivedInitRef.current)
                        return;
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
                (0, debug_js_1.logForDebugging)(`[useSSHSession] permission request: ${request.tool_name}`);
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
                    onUserInteraction() { },
                    onAbort() {
                        manager.respondToPermissionRequest(requestId, {
                            behavior: 'deny',
                            message: 'User aborted',
                        });
                        setToolUseConfirmQueue(q => q.filter(i => i.toolUseID !== request.tool_use_id));
                    },
                    onAllow(updatedInput) {
                        manager.respondToPermissionRequest(requestId, {
                            behavior: 'allow',
                            updatedInput,
                        });
                        setToolUseConfirmQueue(q => q.filter(i => i.toolUseID !== request.tool_use_id));
                        setIsLoading(true);
                    },
                    onReject(feedback) {
                        manager.respondToPermissionRequest(requestId, {
                            behavior: 'deny',
                            message: feedback ?? 'User denied permission',
                        });
                        setToolUseConfirmQueue(q => q.filter(i => i.toolUseID !== request.tool_use_id));
                    },
                    async recheckPermission() { },
                };
                setToolUseConfirmQueue(q => [...q, toolUseConfirm]);
                setIsLoading(false);
            },
            onConnected: () => {
                (0, debug_js_1.logForDebugging)('[useSSHSession] connected');
                isConnectedRef.current = true;
            },
            onReconnecting: (attempt, max) => {
                (0, debug_js_1.logForDebugging)(`[useSSHSession] ssh dropped, reconnecting (${attempt}/${max})`);
                isConnectedRef.current = false;
                // Surface a transient system message in the transcript so the user
                // knows what's happening — the next onConnected clears the state.
                // Any in-flight request is lost; the remote's --continue reloads
                // history but there's no turn in progress to resume.
                setIsLoading(false);
                const msg = {
                    type: 'system',
                    subtype: 'informational',
                    content: `SSH connection dropped — reconnecting (attempt ${attempt}/${max})...`,
                    timestamp: new Date().toISOString(),
                    uuid: (0, crypto_1.randomUUID)(),
                    level: 'warning',
                };
                setMessages(prev => [...prev, msg]);
            },
            onDisconnected: () => {
                (0, debug_js_1.logForDebugging)('[useSSHSession] ssh process exited (giving up)');
                const stderr = session.getStderrTail().trim();
                const connected = isConnectedRef.current;
                const exitCode = session.proc.exitCode;
                isConnectedRef.current = false;
                setIsLoading(false);
                let msg = connected
                    ? 'Remote session ended.'
                    : 'SSH session failed before connecting.';
                // Surface remote stderr if it looks like an error (pre-connect always,
                // post-connect only on nonzero exit — normal --verbose noise otherwise).
                if (stderr && (!connected || exitCode !== 0)) {
                    msg += `\nRemote stderr (exit ${exitCode ?? 'signal ' + session.proc.signalCode}):\n${stderr}`;
                }
                void (0, gracefulShutdown_js_1.gracefulShutdown)(1, 'other', { finalMessage: msg });
            },
            onError: error => {
                (0, debug_js_1.logForDebugging)(`[useSSHSession] error: ${error.message}`);
            },
        });
        managerRef.current = manager;
        manager.connect();
        return () => {
            (0, debug_js_1.logForDebugging)('[useSSHSession] cleanup');
            manager.disconnect();
            session.proxy.stop();
            managerRef.current = null;
        };
    }, [session, setMessages, setIsLoading, setToolUseConfirmQueue]);
    const sendMessage = (0, react_1.useCallback)(async (content) => {
        const m = managerRef.current;
        if (!m)
            return false;
        setIsLoading(true);
        return m.sendMessage(content);
    }, [setIsLoading]);
    const cancelRequest = (0, react_1.useCallback)(() => {
        managerRef.current?.sendInterrupt();
        setIsLoading(false);
    }, [setIsLoading]);
    const disconnect = (0, react_1.useCallback)(() => {
        managerRef.current?.disconnect();
        managerRef.current = null;
        isConnectedRef.current = false;
    }, []);
    return (0, react_1.useMemo)(() => ({ isRemoteMode, sendMessage, cancelRequest, disconnect }), [isRemoteMode, sendMessage, cancelRequest, disconnect]);
}
