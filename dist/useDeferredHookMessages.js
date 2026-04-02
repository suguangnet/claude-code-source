"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useDeferredHookMessages = useDeferredHookMessages;
const react_1 = require("react");
/**
 * Manages deferred SessionStart hook messages so the REPL can render
 * immediately instead of blocking on hook execution (~500ms).
 *
 * Hook messages are injected asynchronously when the promise resolves.
 * Returns a callback that onSubmit should call before the first API
 * request to ensure the model always sees hook context.
 */
function useDeferredHookMessages(pendingHookMessages, setMessages) {
    const pendingRef = (0, react_1.useRef)(pendingHookMessages ?? null);
    const resolvedRef = (0, react_1.useRef)(!pendingHookMessages);
    (0, react_1.useEffect)(() => {
        const promise = pendingRef.current;
        if (!promise)
            return;
        let cancelled = false;
        promise.then(msgs => {
            if (cancelled)
                return;
            resolvedRef.current = true;
            pendingRef.current = null;
            if (msgs.length > 0) {
                setMessages(prev => [...msgs, ...prev]);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [setMessages]);
    return (0, react_1.useCallback)(async () => {
        if (resolvedRef.current || !pendingRef.current)
            return;
        const msgs = await pendingRef.current;
        if (resolvedRef.current)
            return;
        resolvedRef.current = true;
        pendingRef.current = null;
        if (msgs.length > 0) {
            setMessages(prev => [...msgs, ...prev]);
        }
    }, [setMessages]);
}
