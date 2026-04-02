"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLastApiRequests = getLastApiRequests;
exports.clearApiRequestCache = clearApiRequestCache;
exports.clearDumpState = clearDumpState;
exports.clearAllDumpState = clearAllDumpState;
exports.addApiRequestToCache = addApiRequestToCache;
exports.getDumpPromptsPath = getDumpPromptsPath;
exports.createDumpPromptsFetch = createDumpPromptsFetch;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const state_js_1 = require("src/bootstrap/state.js");
const envUtils_js_1 = require("../../utils/envUtils.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
function hashString(str) {
    return (0, crypto_1.createHash)('sha256').update(str).digest('hex');
}
// Cache last few API requests for ant users (e.g., for /issue command)
const MAX_CACHED_REQUESTS = 5;
const cachedApiRequests = [];
// Track state per session to avoid duplicating data
const dumpState = new Map();
function getLastApiRequests() {
    return [...cachedApiRequests];
}
function clearApiRequestCache() {
    cachedApiRequests.length = 0;
}
function clearDumpState(agentIdOrSessionId) {
    dumpState.delete(agentIdOrSessionId);
}
function clearAllDumpState() {
    dumpState.clear();
}
function addApiRequestToCache(requestData) {
    if (process.env.USER_TYPE !== 'ant')
        return;
    cachedApiRequests.push({
        timestamp: new Date().toISOString(),
        request: requestData,
    });
    if (cachedApiRequests.length > MAX_CACHED_REQUESTS) {
        cachedApiRequests.shift();
    }
}
function getDumpPromptsPath(agentIdOrSessionId) {
    return (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), 'dump-prompts', `${agentIdOrSessionId ?? (0, state_js_1.getSessionId)()}.jsonl`);
}
function appendToFile(filePath, entries) {
    if (entries.length === 0)
        return;
    fs_1.promises.mkdir((0, path_1.dirname)(filePath), { recursive: true })
        .then(() => fs_1.promises.appendFile(filePath, entries.join('\n') + '\n'))
        .catch(() => { });
}
function initFingerprint(req) {
    const tools = req.tools;
    const system = req.system;
    const sysLen = typeof system === 'string'
        ? system.length
        : Array.isArray(system)
            ? system.reduce((n, b) => n + (b.text?.length ?? 0), 0)
            : 0;
    const toolNames = tools?.map(t => t.name ?? '').join(',') ?? '';
    return `${req.model}|${toolNames}|${sysLen}`;
}
function dumpRequest(body, ts, state, filePath) {
    try {
        const req = (0, slowOperations_js_1.jsonParse)(body);
        addApiRequestToCache(req);
        if (process.env.USER_TYPE !== 'ant')
            return;
        const entries = [];
        const messages = (req.messages ?? []);
        // Write init data (system, tools, metadata) on first request,
        // and a system_update entry whenever it changes.
        // Cheap fingerprint first: system+tools don't change between turns,
        // so skip the 300ms stringify when the shape is unchanged.
        const fingerprint = initFingerprint(req);
        if (!state.initialized || fingerprint !== state.lastInitFingerprint) {
            const { messages: _, ...initData } = req;
            const initDataStr = (0, slowOperations_js_1.jsonStringify)(initData);
            const initDataHash = hashString(initDataStr);
            state.lastInitFingerprint = fingerprint;
            if (!state.initialized) {
                state.initialized = true;
                state.lastInitDataHash = initDataHash;
                // Reuse initDataStr rather than re-serializing initData inside a wrapper.
                // timestamp from toISOString() contains no chars needing JSON escaping.
                entries.push(`{"type":"init","timestamp":"${ts}","data":${initDataStr}}`);
            }
            else if (initDataHash !== state.lastInitDataHash) {
                state.lastInitDataHash = initDataHash;
                entries.push(`{"type":"system_update","timestamp":"${ts}","data":${initDataStr}}`);
            }
        }
        // Write only new user messages (assistant messages captured in response)
        for (const msg of messages.slice(state.messageCountSeen)) {
            if (msg.role === 'user') {
                entries.push((0, slowOperations_js_1.jsonStringify)({ type: 'message', timestamp: ts, data: msg }));
            }
        }
        state.messageCountSeen = messages.length;
        appendToFile(filePath, entries);
    }
    catch {
        // Ignore parsing errors
    }
}
function createDumpPromptsFetch(agentIdOrSessionId) {
    const filePath = getDumpPromptsPath(agentIdOrSessionId);
    return async (input, init) => {
        const state = dumpState.get(agentIdOrSessionId) ?? {
            initialized: false,
            messageCountSeen: 0,
            lastInitDataHash: '',
            lastInitFingerprint: '',
        };
        dumpState.set(agentIdOrSessionId, state);
        let timestamp;
        if (init?.method === 'POST' && init.body) {
            timestamp = new Date().toISOString();
            // Parsing + stringifying the request (system prompt + tool schemas = MBs)
            // takes hundreds of ms. Defer so it doesn't block the actual API call —
            // this is debug tooling for /issue, not on the critical path.
            setImmediate(dumpRequest, init.body, timestamp, state, filePath);
        }
        // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
        const response = await globalThis.fetch(input, init);
        // Save response async
        if (timestamp && response.ok && process.env.USER_TYPE === 'ant') {
            const cloned = response.clone();
            void (async () => {
                try {
                    const isStreaming = cloned.headers
                        .get('content-type')
                        ?.includes('text/event-stream');
                    let data;
                    if (isStreaming && cloned.body) {
                        // Parse SSE stream into chunks
                        const reader = cloned.body.getReader();
                        const decoder = new TextDecoder();
                        let buffer = '';
                        try {
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done)
                                    break;
                                buffer += decoder.decode(value, { stream: true });
                            }
                        }
                        finally {
                            reader.releaseLock();
                        }
                        const chunks = [];
                        for (const event of buffer.split('\n\n')) {
                            for (const line of event.split('\n')) {
                                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                                    try {
                                        chunks.push((0, slowOperations_js_1.jsonParse)(line.slice(6)));
                                    }
                                    catch {
                                        // Ignore parse errors
                                    }
                                }
                            }
                        }
                        data = { stream: true, chunks };
                    }
                    else {
                        data = await cloned.json();
                    }
                    await fs_1.promises.appendFile(filePath, (0, slowOperations_js_1.jsonStringify)({ type: 'response', timestamp, data }) + '\n');
                }
                catch {
                    // Best effort
                }
            })();
        }
        return response;
    };
}
