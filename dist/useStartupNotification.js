"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useStartupNotification = useStartupNotification;
const react_1 = require("react");
const state_js_1 = require("../../bootstrap/state.js");
const notifications_js_1 = require("../../context/notifications.js");
const log_js_1 = require("../../utils/log.js");
/**
 * Fires notification(s) once on mount. Encapsulates the remote-mode gate and
 * once-per-session ref guard that was hand-rolled across 10+ notifs/ hooks.
 *
 * The compute fn runs exactly once on first effect. Return null to skip,
 * a Notification to fire one, or an array to fire several. Sync or async.
 * Rejections are routed to logError.
 */
function useStartupNotification(compute) {
    const { addNotification } = (0, notifications_js_1.useNotifications)();
    const hasRunRef = (0, react_1.useRef)(false);
    const computeRef = (0, react_1.useRef)(compute);
    computeRef.current = compute;
    (0, react_1.useEffect)(() => {
        if ((0, state_js_1.getIsRemoteMode)() || hasRunRef.current)
            return;
        hasRunRef.current = true;
        void Promise.resolve()
            .then(() => computeRef.current())
            .then(result => {
            if (!result)
                return;
            for (const n of Array.isArray(result) ? result : [result]) {
                addNotification(n);
            }
        })
            .catch(log_js_1.logError);
    }, [addNotification]);
}
