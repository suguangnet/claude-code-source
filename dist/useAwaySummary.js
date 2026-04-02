"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAwaySummary = useAwaySummary;
const bun_bundle_1 = require("bun:bundle");
const react_1 = require("react");
const terminal_focus_state_js_1 = require("../ink/terminal-focus-state.js");
const growthbook_js_1 = require("../services/analytics/growthbook.js");
const awaySummary_js_1 = require("../services/awaySummary.js");
const messages_js_1 = require("../utils/messages.js");
const BLUR_DELAY_MS = 5 * 60000;
function hasSummarySinceLastUserTurn(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.type === 'user' && !m.isMeta && !m.isCompactSummary)
            return false;
        if (m.type === 'system' && m.subtype === 'away_summary')
            return true;
    }
    return false;
}
/**
 * Appends a "while you were away" summary message after the terminal has been
 * blurred for 5 minutes. Fires only when (a) 5min since blur, (b) no turn in
 * progress, and (c) no existing away_summary since the last user message.
 *
 * Focus state 'unknown' (terminal doesn't support DECSET 1004) is a no-op.
 */
function useAwaySummary(messages, setMessages, isLoading) {
    const timerRef = (0, react_1.useRef)(null);
    const abortRef = (0, react_1.useRef)(null);
    const messagesRef = (0, react_1.useRef)(messages);
    const isLoadingRef = (0, react_1.useRef)(isLoading);
    const pendingRef = (0, react_1.useRef)(false);
    const generateRef = (0, react_1.useRef)(null);
    messagesRef.current = messages;
    isLoadingRef.current = isLoading;
    // 3P default: false
    const gbEnabled = (0, growthbook_js_1.getFeatureValue_CACHED_MAY_BE_STALE)('tengu_sedge_lantern', false);
    (0, react_1.useEffect)(() => {
        if (!(0, bun_bundle_1.feature)('AWAY_SUMMARY'))
            return;
        if (!gbEnabled)
            return;
        function clearTimer() {
            if (timerRef.current !== null) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        }
        function abortInFlight() {
            abortRef.current?.abort();
            abortRef.current = null;
        }
        async function generate() {
            pendingRef.current = false;
            if (hasSummarySinceLastUserTurn(messagesRef.current))
                return;
            abortInFlight();
            const controller = new AbortController();
            abortRef.current = controller;
            const text = await (0, awaySummary_js_1.generateAwaySummary)(messagesRef.current, controller.signal);
            if (controller.signal.aborted || text === null)
                return;
            setMessages(prev => [...prev, (0, messages_js_1.createAwaySummaryMessage)(text)]);
        }
        function onBlurTimerFire() {
            timerRef.current = null;
            if (isLoadingRef.current) {
                pendingRef.current = true;
                return;
            }
            void generate();
        }
        function onFocusChange() {
            const state = (0, terminal_focus_state_js_1.getTerminalFocusState)();
            if (state === 'blurred') {
                clearTimer();
                timerRef.current = setTimeout(onBlurTimerFire, BLUR_DELAY_MS);
            }
            else if (state === 'focused') {
                clearTimer();
                abortInFlight();
                pendingRef.current = false;
            }
            // 'unknown' → no-op
        }
        const unsubscribe = (0, terminal_focus_state_js_1.subscribeTerminalFocus)(onFocusChange);
        // Handle the case where we're already blurred when the effect mounts
        onFocusChange();
        generateRef.current = generate;
        return () => {
            unsubscribe();
            clearTimer();
            abortInFlight();
            generateRef.current = null;
        };
    }, [gbEnabled, setMessages]);
    // Timer fired mid-turn → fire when turn ends (if still blurred)
    (0, react_1.useEffect)(() => {
        if (isLoading)
            return;
        if (!pendingRef.current)
            return;
        if ((0, terminal_focus_state_js_1.getTerminalFocusState)() !== 'blurred')
            return;
        void generateRef.current?.();
    }, [isLoading]);
}
