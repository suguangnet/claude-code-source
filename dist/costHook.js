"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useCostSummary = useCostSummary;
const react_1 = require("react");
const cost_tracker_js_1 = require("./cost-tracker.js");
const billing_js_1 = require("./utils/billing.js");
function useCostSummary(getFpsMetrics) {
    (0, react_1.useEffect)(() => {
        const f = () => {
            if ((0, billing_js_1.hasConsoleBillingAccess)()) {
                process.stdout.write('\n' + (0, cost_tracker_js_1.formatTotalCost)() + '\n');
            }
            (0, cost_tracker_js_1.saveCurrentSessionCosts)(getFpsMetrics?.());
        };
        process.on('exit', f);
        return () => {
            process.off('exit', f);
        };
    }, []);
}
