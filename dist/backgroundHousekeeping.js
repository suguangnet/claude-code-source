"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startBackgroundHousekeeping = startBackgroundHousekeeping;
const bun_bundle_1 = require("bun:bundle");
const autoDream_js_1 = require("../services/autoDream/autoDream.js");
const magicDocs_js_1 = require("../services/MagicDocs/magicDocs.js");
const skillImprovement_js_1 = require("./hooks/skillImprovement.js");
/* eslint-disable @typescript-eslint/no-require-imports */
const extractMemoriesModule = (0, bun_bundle_1.feature)('EXTRACT_MEMORIES')
    ? require('../services/extractMemories/extractMemories.js')
    : null;
const registerProtocolModule = (0, bun_bundle_1.feature)('LODESTONE')
    ? require('./deepLink/registerProtocol.js')
    : null;
/* eslint-enable @typescript-eslint/no-require-imports */
const state_js_1 = require("../bootstrap/state.js");
const cleanup_js_1 = require("./cleanup.js");
const index_js_1 = require("./nativeInstaller/index.js");
const pluginAutoupdate_js_1 = require("./plugins/pluginAutoupdate.js");
// 24 hours in milliseconds
const RECURRING_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
// 10 minutes after start.
const DELAY_VERY_SLOW_OPERATIONS_THAT_HAPPEN_EVERY_SESSION = 10 * 60 * 1000;
function startBackgroundHousekeeping() {
    void (0, magicDocs_js_1.initMagicDocs)();
    void (0, skillImprovement_js_1.initSkillImprovement)();
    if ((0, bun_bundle_1.feature)('EXTRACT_MEMORIES')) {
        extractMemoriesModule.initExtractMemories();
    }
    (0, autoDream_js_1.initAutoDream)();
    void (0, pluginAutoupdate_js_1.autoUpdateMarketplacesAndPluginsInBackground)();
    if ((0, bun_bundle_1.feature)('LODESTONE') && (0, state_js_1.getIsInteractive)()) {
        void registerProtocolModule.ensureDeepLinkProtocolRegistered();
    }
    let needsCleanup = true;
    async function runVerySlowOps() {
        // If the user did something in the last minute, don't make them wait for these slow operations to run.
        if ((0, state_js_1.getIsInteractive)() &&
            (0, state_js_1.getLastInteractionTime)() > Date.now() - 1000 * 60) {
            setTimeout(runVerySlowOps, DELAY_VERY_SLOW_OPERATIONS_THAT_HAPPEN_EVERY_SESSION).unref();
            return;
        }
        if (needsCleanup) {
            needsCleanup = false;
            await (0, cleanup_js_1.cleanupOldMessageFilesInBackground)();
        }
        // If the user did something in the last minute, don't make them wait for these slow operations to run.
        if ((0, state_js_1.getIsInteractive)() &&
            (0, state_js_1.getLastInteractionTime)() > Date.now() - 1000 * 60) {
            setTimeout(runVerySlowOps, DELAY_VERY_SLOW_OPERATIONS_THAT_HAPPEN_EVERY_SESSION).unref();
            return;
        }
        await (0, index_js_1.cleanupOldVersions)();
    }
    setTimeout(runVerySlowOps, DELAY_VERY_SLOW_OPERATIONS_THAT_HAPPEN_EVERY_SESSION).unref();
    // For long-running sessions, schedule recurring cleanup every 24 hours.
    // Both cleanup functions use marker files and locks to throttle to once per day
    // and skip immediately if another process holds the lock.
    if (process.env.USER_TYPE === 'ant') {
        const interval = setInterval(() => {
            void (0, cleanup_js_1.cleanupNpmCacheForAnthropicPackages)();
            void (0, cleanup_js_1.cleanupOldVersionsThrottled)();
        }, RECURRING_CLEANUP_INTERVAL_MS);
        // Don't let this interval keep the process alive
        interval.unref();
    }
}
