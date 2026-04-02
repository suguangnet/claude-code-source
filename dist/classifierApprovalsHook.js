"use strict";
/**
 * React hook for classifierApprovals store.
 * Split from classifierApprovals.ts so pure-state importers (permissions.ts,
 * toolExecution.ts, postCompactCleanup.ts) do not pull React into print.ts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.useIsClassifierChecking = useIsClassifierChecking;
const react_1 = require("react");
const classifierApprovals_js_1 = require("./classifierApprovals.js");
function useIsClassifierChecking(toolUseID) {
    return (0, react_1.useSyncExternalStore)(classifierApprovals_js_1.subscribeClassifierChecking, () => (0, classifierApprovals_js_1.isClassifierChecking)(toolUseID));
}
