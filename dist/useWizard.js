"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useWizard = useWizard;
const react_1 = require("react");
const WizardProvider_js_1 = require("./WizardProvider.js");
function useWizard() {
    const context = (0, react_1.useContext)(WizardProvider_js_1.WizardContext);
    if (!context) {
        throw new Error('useWizard must be used within a WizardProvider');
    }
    return context;
}
