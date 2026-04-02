"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSessionContainerCompatible = isSessionContainerCompatible;
exports.hasFrictionSignal = hasFrictionSignal;
exports.useIssueFlagBanner = useIssueFlagBanner;
const react_1 = require("react");
const toolName_js_1 = require("../tools/BashTool/toolName.js");
const messages_js_1 = require("../utils/messages.js");
const EXTERNAL_COMMAND_PATTERNS = [
    /\bcurl\b/,
    /\bwget\b/,
    /\bssh\b/,
    /\bkubectl\b/,
    /\bsrun\b/,
    /\bdocker\b/,
    /\bbq\b/,
    /\bgsutil\b/,
    /\bgcloud\b/,
    /\baws\b/,
    /\bgit\s+push\b/,
    /\bgit\s+pull\b/,
    /\bgit\s+fetch\b/,
    /\bgh\s+(pr|issue)\b/,
    /\bnc\b/,
    /\bncat\b/,
    /\btelnet\b/,
    /\bftp\b/,
];
const FRICTION_PATTERNS = [
    // "No," or "No!" at start — comma/exclamation implies correction tone
    // (avoids "No problem", "No thanks", "No I think we should...")
    /^no[,!]\s/i,
    // Direct corrections about Claude's output
    /\bthat'?s (wrong|incorrect|not (what|right|correct))\b/i,
    /\bnot what I (asked|wanted|meant|said)\b/i,
    // Referencing prior instructions Claude missed
    /\bI (said|asked|wanted|told you|already said)\b/i,
    // Questioning Claude's actions
    /\bwhy did you\b/i,
    /\byou should(n'?t| not)? have\b/i,
    /\byou were supposed to\b/i,
    // Explicit retry/revert of Claude's work
    /\btry again\b/i,
    /\b(undo|revert) (that|this|it|what you)\b/i,
];
function isSessionContainerCompatible(messages) {
    for (const msg of messages) {
        if (msg.type !== 'assistant') {
            continue;
        }
        const content = msg.message.content;
        if (!Array.isArray(content)) {
            continue;
        }
        for (const block of content) {
            if (block.type !== 'tool_use' || !('name' in block)) {
                continue;
            }
            const toolName = block.name;
            if (toolName.startsWith('mcp__')) {
                return false;
            }
            if (toolName === toolName_js_1.BASH_TOOL_NAME) {
                const input = block.input;
                const command = input?.command || '';
                if (EXTERNAL_COMMAND_PATTERNS.some(p => p.test(command))) {
                    return false;
                }
            }
        }
    }
    return true;
}
function hasFrictionSignal(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.type !== 'user') {
            continue;
        }
        const text = (0, messages_js_1.getUserMessageText)(msg);
        if (!text) {
            continue;
        }
        return FRICTION_PATTERNS.some(p => p.test(text));
    }
    return false;
}
const MIN_SUBMIT_COUNT = 3;
const COOLDOWN_MS = 30 * 60 * 1000;
function useIssueFlagBanner(messages, submitCount) {
    if (process.env.USER_TYPE !== 'ant') {
        return false;
    }
    // biome-ignore lint/correctness/useHookAtTopLevel: process.env.USER_TYPE is a compile-time constant
    const lastTriggeredAtRef = (0, react_1.useRef)(0);
    // biome-ignore lint/correctness/useHookAtTopLevel: process.env.USER_TYPE is a compile-time constant
    const activeForSubmitRef = (0, react_1.useRef)(-1);
    // Memoize the O(messages) scans. This hook runs on every REPL render
    // (including every keystroke), but messages is stable during typing.
    // isSessionContainerCompatible walks all messages + regex-tests each
    // bash command — by far the heaviest work here.
    // biome-ignore lint/correctness/useHookAtTopLevel: process.env.USER_TYPE is a compile-time constant
    const shouldTrigger = (0, react_1.useMemo)(() => isSessionContainerCompatible(messages) && hasFrictionSignal(messages), [messages]);
    // Keep showing the banner until the user submits another message
    if (activeForSubmitRef.current === submitCount) {
        return true;
    }
    if (Date.now() - lastTriggeredAtRef.current < COOLDOWN_MS) {
        return false;
    }
    if (submitCount < MIN_SUBMIT_COUNT) {
        return false;
    }
    if (!shouldTrigger) {
        return false;
    }
    lastTriggeredAtRef.current = Date.now();
    activeForSubmitRef.current = submitCount;
    return true;
}
