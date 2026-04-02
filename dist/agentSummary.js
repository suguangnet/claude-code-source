"use strict";
/**
 * Periodic background summarization for coordinator mode sub-agents.
 *
 * Forks the sub-agent's conversation every ~30s using runForkedAgent()
 * to generate a 1-2 sentence progress summary. The summary is stored
 * on AgentProgress for UI display.
 *
 * Cache sharing: uses the same CacheSafeParams as the parent agent
 * to share the prompt cache. Tools are kept in the request for cache
 * key matching but denied via canUseTool callback.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAgentSummarization = startAgentSummarization;
const LocalAgentTask_js_1 = require("../../tasks/LocalAgentTask/LocalAgentTask.js");
const runAgent_js_1 = require("../../tools/AgentTool/runAgent.js");
const debug_js_1 = require("../../utils/debug.js");
const forkedAgent_js_1 = require("../../utils/forkedAgent.js");
const log_js_1 = require("../../utils/log.js");
const messages_js_1 = require("../../utils/messages.js");
const sessionStorage_js_1 = require("../../utils/sessionStorage.js");
const SUMMARY_INTERVAL_MS = 30000;
function buildSummaryPrompt(previousSummary) {
    const prevLine = previousSummary
        ? `\nPrevious: "${previousSummary}" — say something NEW.\n`
        : '';
    return `Describe your most recent action in 3-5 words using present tense (-ing). Name the file or function, not the branch. Do not use tools.
${prevLine}
Good: "Reading runAgent.ts"
Good: "Fixing null check in validate.ts"
Good: "Running auth module tests"
Good: "Adding retry logic to fetchUser"

Bad (past tense): "Analyzed the branch diff"
Bad (too vague): "Investigating the issue"
Bad (too long): "Reviewing full branch diff and AgentTool.tsx integration"
Bad (branch name): "Analyzed adam/background-summary branch diff"`;
}
function startAgentSummarization(taskId, agentId, cacheSafeParams, setAppState) {
    // Drop forkContextMessages from the closure — runSummary rebuilds it each
    // tick from getAgentTranscript(). Without this, the original fork messages
    // (passed from AgentTool.tsx) are pinned for the lifetime of the timer.
    const { forkContextMessages: _drop, ...baseParams } = cacheSafeParams;
    let summaryAbortController = null;
    let timeoutId = null;
    let stopped = false;
    let previousSummary = null;
    async function runSummary() {
        if (stopped)
            return;
        (0, debug_js_1.logForDebugging)(`[AgentSummary] Timer fired for agent ${agentId}`);
        try {
            // Read current messages from transcript
            const transcript = await (0, sessionStorage_js_1.getAgentTranscript)(agentId);
            if (!transcript || transcript.messages.length < 3) {
                // Not enough context yet — finally block will schedule next attempt
                (0, debug_js_1.logForDebugging)(`[AgentSummary] Skipping summary for ${taskId}: not enough messages (${transcript?.messages.length ?? 0})`);
                return;
            }
            // Filter to clean message state
            const cleanMessages = (0, runAgent_js_1.filterIncompleteToolCalls)(transcript.messages);
            // Build fork params with current messages
            const forkParams = {
                ...baseParams,
                forkContextMessages: cleanMessages,
            };
            (0, debug_js_1.logForDebugging)(`[AgentSummary] Forking for summary, ${cleanMessages.length} messages in context`);
            // Create abort controller for this summary
            summaryAbortController = new AbortController();
            // Deny tools via callback, NOT by passing tools:[] - that busts cache
            const canUseTool = async () => ({
                behavior: 'deny',
                message: 'No tools needed for summary',
                decisionReason: { type: 'other', reason: 'summary only' },
            });
            // DO NOT set maxOutputTokens here. The fork piggybacks on the main
            // thread's prompt cache by sending identical cache-key params (system,
            // tools, model, messages prefix, thinking config). Setting maxOutputTokens
            // would clamp budget_tokens, creating a thinking config mismatch that
            // invalidates the cache.
            //
            // ContentReplacementState is cloned by default in createSubagentContext
            // from forkParams.toolUseContext (the subagent's LIVE state captured at
            // onCacheSafeParams time). No explicit override needed.
            const result = await (0, forkedAgent_js_1.runForkedAgent)({
                promptMessages: [
                    (0, messages_js_1.createUserMessage)({ content: buildSummaryPrompt(previousSummary) }),
                ],
                cacheSafeParams: forkParams,
                canUseTool,
                querySource: 'agent_summary',
                forkLabel: 'agent_summary',
                overrides: { abortController: summaryAbortController },
                skipTranscript: true,
            });
            if (stopped)
                return;
            // Extract summary text from result
            for (const msg of result.messages) {
                if (msg.type !== 'assistant')
                    continue;
                // Skip API error messages
                if (msg.isApiErrorMessage) {
                    (0, debug_js_1.logForDebugging)(`[AgentSummary] Skipping API error message for ${taskId}`);
                    continue;
                }
                const textBlock = msg.message.content.find(b => b.type === 'text');
                if (textBlock?.type === 'text' && textBlock.text.trim()) {
                    const summaryText = textBlock.text.trim();
                    (0, debug_js_1.logForDebugging)(`[AgentSummary] Summary result for ${taskId}: ${summaryText}`);
                    previousSummary = summaryText;
                    (0, LocalAgentTask_js_1.updateAgentSummary)(taskId, summaryText, setAppState);
                    break;
                }
            }
        }
        catch (e) {
            if (!stopped && e instanceof Error) {
                (0, log_js_1.logError)(e);
            }
        }
        finally {
            summaryAbortController = null;
            // Reset timer on completion (not initiation) to prevent overlapping summaries
            if (!stopped) {
                scheduleNext();
            }
        }
    }
    function scheduleNext() {
        if (stopped)
            return;
        timeoutId = setTimeout(runSummary, SUMMARY_INTERVAL_MS);
    }
    function stop() {
        (0, debug_js_1.logForDebugging)(`[AgentSummary] Stopping summarization for ${taskId}`);
        stopped = true;
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        if (summaryAbortController) {
            summaryAbortController.abort();
            summaryAbortController = null;
        }
    }
    // Start the first timer
    scheduleNext();
    return { stop };
}
