"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.call = call;
const path_1 = require("path");
const installedPluginsManager_js_1 = require("../../utils/plugins/installedPluginsManager.js");
const officialMarketplace_js_1 = require("../../utils/plugins/officialMarketplace.js");
const thinkback_js_1 = require("../thinkback/thinkback.js");
const INTERNAL_MARKETPLACE_NAME = 'claude-code-marketplace';
const SKILL_NAME = 'thinkback';
function getPluginId() {
    const marketplaceName = process.env.USER_TYPE === 'ant'
        ? INTERNAL_MARKETPLACE_NAME
        : officialMarketplace_js_1.OFFICIAL_MARKETPLACE_NAME;
    return `thinkback@${marketplaceName}`;
}
async function call() {
    // Get skill directory from installed plugins config
    const v2Data = (0, installedPluginsManager_js_1.loadInstalledPluginsV2)();
    const pluginId = getPluginId();
    const installations = v2Data.plugins[pluginId];
    if (!installations || installations.length === 0) {
        return {
            type: 'text',
            value: 'Thinkback plugin not installed. Run /think-back first to install it.',
        };
    }
    const firstInstall = installations[0];
    if (!firstInstall?.installPath) {
        return {
            type: 'text',
            value: 'Thinkback plugin installation path not found.',
        };
    }
    const skillDir = (0, path_1.join)(firstInstall.installPath, 'skills', SKILL_NAME);
    const result = await (0, thinkback_js_1.playAnimation)(skillDir);
    return { type: 'text', value: result.message };
}
