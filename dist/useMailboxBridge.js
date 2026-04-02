"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useMailboxBridge = useMailboxBridge;
const react_1 = require("react");
const mailbox_js_1 = require("../context/mailbox.js");
function useMailboxBridge({ isLoading, onSubmitMessage }) {
    const mailbox = (0, mailbox_js_1.useMailbox)();
    const subscribe = (0, react_1.useMemo)(() => mailbox.subscribe.bind(mailbox), [mailbox]);
    const getSnapshot = (0, react_1.useCallback)(() => mailbox.revision, [mailbox]);
    const revision = (0, react_1.useSyncExternalStore)(subscribe, getSnapshot);
    (0, react_1.useEffect)(() => {
        if (isLoading)
            return;
        const msg = mailbox.poll();
        if (msg)
            onSubmitMessage(msg.content);
    }, [isLoading, revision, mailbox, onSubmitMessage]);
}
