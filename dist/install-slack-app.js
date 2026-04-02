"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.call = call;
const index_js_1 = require("../../services/analytics/index.js");
const browser_js_1 = require("../../utils/browser.js");
const config_js_1 = require("../../utils/config.js");
const SLACK_APP_URL = 'https://slack.com/marketplace/A08SF47R6P4-claude';
async function call() {
    (0, index_js_1.logEvent)('tengu_install_slack_app_clicked', {});
    // Track that user has clicked to install
    (0, config_js_1.saveGlobalConfig)(current => ({
        ...current,
        slackAppInstallCount: (current.slackAppInstallCount ?? 0) + 1,
    }));
    const success = await (0, browser_js_1.openBrowser)(SLACK_APP_URL);
    if (success) {
        return {
            type: 'text',
            value: 'Opening Slack app installation page in browser…',
        };
    }
    else {
        return {
            type: 'text',
            value: `Couldn't open browser. Visit: ${SLACK_APP_URL}`,
        };
    }
}
