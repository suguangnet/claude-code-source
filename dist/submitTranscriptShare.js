"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitTranscriptShare = submitTranscriptShare;
const axios_1 = __importDefault(require("axios"));
const promises_1 = require("fs/promises");
const auth_js_1 = require("../../utils/auth.js");
const debug_js_1 = require("../../utils/debug.js");
const errors_js_1 = require("../../utils/errors.js");
const http_js_1 = require("../../utils/http.js");
const messages_js_1 = require("../../utils/messages.js");
const sessionStorage_js_1 = require("../../utils/sessionStorage.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const Feedback_js_1 = require("../Feedback.js");
async function submitTranscriptShare(messages, trigger, appearanceId) {
    try {
        (0, debug_js_1.logForDebugging)('Collecting transcript for sharing', { level: 'info' });
        const transcript = (0, messages_js_1.normalizeMessagesForAPI)(messages);
        // Collect subagent transcripts
        const agentIds = (0, sessionStorage_js_1.extractAgentIdsFromMessages)(messages);
        const subagentTranscripts = await (0, sessionStorage_js_1.loadSubagentTranscripts)(agentIds);
        // Read raw JSONL transcript (with size guard to prevent OOM)
        let rawTranscriptJsonl;
        try {
            const transcriptPath = (0, sessionStorage_js_1.getTranscriptPath)();
            const { size } = await (0, promises_1.stat)(transcriptPath);
            if (size <= sessionStorage_js_1.MAX_TRANSCRIPT_READ_BYTES) {
                rawTranscriptJsonl = await (0, promises_1.readFile)(transcriptPath, 'utf-8');
            }
            else {
                (0, debug_js_1.logForDebugging)(`Skipping raw transcript read: file too large (${size} bytes)`, { level: 'warn' });
            }
        }
        catch {
            // File may not exist
        }
        const data = {
            trigger,
            version: MACRO.VERSION,
            platform: process.platform,
            transcript,
            subagentTranscripts: Object.keys(subagentTranscripts).length > 0
                ? subagentTranscripts
                : undefined,
            rawTranscriptJsonl,
        };
        const content = (0, Feedback_js_1.redactSensitiveInfo)((0, slowOperations_js_1.jsonStringify)(data));
        await (0, auth_js_1.checkAndRefreshOAuthTokenIfNeeded)();
        const authResult = (0, http_js_1.getAuthHeaders)();
        if (authResult.error) {
            return { success: false };
        }
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': (0, http_js_1.getUserAgent)(),
            ...authResult.headers,
        };
        const response = await axios_1.default.post('https://api.anthropic.com/api/claude_code_shared_session_transcripts', { content, appearance_id: appearanceId }, {
            headers,
            timeout: 30000,
        });
        if (response.status === 200 || response.status === 201) {
            const result = response.data;
            (0, debug_js_1.logForDebugging)('Transcript shared successfully', { level: 'info' });
            return {
                success: true,
                transcriptId: result?.transcript_id,
            };
        }
        return { success: false };
    }
    catch (err) {
        (0, debug_js_1.logForDebugging)((0, errors_js_1.errorMessage)(err), {
            level: 'error',
        });
        return { success: false };
    }
}
