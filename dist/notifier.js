"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendNotification = sendNotification;
const config_js_1 = require("../utils/config.js");
const env_js_1 = require("../utils/env.js");
const execFileNoThrow_js_1 = require("../utils/execFileNoThrow.js");
const hooks_js_1 = require("../utils/hooks.js");
const log_js_1 = require("../utils/log.js");
const index_js_1 = require("./analytics/index.js");
async function sendNotification(notif, terminal) {
    const config = (0, config_js_1.getGlobalConfig)();
    const channel = config.preferredNotifChannel;
    await (0, hooks_js_1.executeNotificationHooks)(notif);
    const methodUsed = await sendToChannel(channel, notif, terminal);
    (0, index_js_1.logEvent)('tengu_notification_method_used', {
        configured_channel: channel,
        method_used: methodUsed,
        term: env_js_1.env.terminal,
    });
}
const DEFAULT_TITLE = 'Claude Code';
async function sendToChannel(channel, opts, terminal) {
    const title = opts.title || DEFAULT_TITLE;
    try {
        switch (channel) {
            case 'auto':
                return sendAuto(opts, terminal);
            case 'iterm2':
                terminal.notifyITerm2(opts);
                return 'iterm2';
            case 'iterm2_with_bell':
                terminal.notifyITerm2(opts);
                terminal.notifyBell();
                return 'iterm2_with_bell';
            case 'kitty':
                terminal.notifyKitty({ ...opts, title, id: generateKittyId() });
                return 'kitty';
            case 'ghostty':
                terminal.notifyGhostty({ ...opts, title });
                return 'ghostty';
            case 'terminal_bell':
                terminal.notifyBell();
                return 'terminal_bell';
            case 'notifications_disabled':
                return 'disabled';
            default:
                return 'none';
        }
    }
    catch {
        return 'error';
    }
}
async function sendAuto(opts, terminal) {
    const title = opts.title || DEFAULT_TITLE;
    switch (env_js_1.env.terminal) {
        case 'Apple_Terminal': {
            const bellDisabled = await isAppleTerminalBellDisabled();
            if (bellDisabled) {
                terminal.notifyBell();
                return 'terminal_bell';
            }
            return 'no_method_available';
        }
        case 'iTerm.app':
            terminal.notifyITerm2(opts);
            return 'iterm2';
        case 'kitty':
            terminal.notifyKitty({ ...opts, title, id: generateKittyId() });
            return 'kitty';
        case 'ghostty':
            terminal.notifyGhostty({ ...opts, title });
            return 'ghostty';
        default:
            return 'no_method_available';
    }
}
function generateKittyId() {
    return Math.floor(Math.random() * 10000);
}
async function isAppleTerminalBellDisabled() {
    try {
        if (env_js_1.env.terminal !== 'Apple_Terminal') {
            return false;
        }
        const osascriptResult = await (0, execFileNoThrow_js_1.execFileNoThrow)('osascript', [
            '-e',
            'tell application "Terminal" to name of current settings of front window',
        ]);
        const currentProfile = osascriptResult.stdout.trim();
        if (!currentProfile) {
            return false;
        }
        const defaultsOutput = await (0, execFileNoThrow_js_1.execFileNoThrow)('defaults', [
            'export',
            'com.apple.Terminal',
            '-',
        ]);
        if (defaultsOutput.code !== 0) {
            return false;
        }
        // Lazy-load plist (~280KB with xmlbuilder+@xmldom) — only hit on
        // Apple_Terminal with auto-channel, which is a small fraction of users.
        const plist = await Promise.resolve().then(() => __importStar(require('plist')));
        const parsed = plist.parse(defaultsOutput.stdout);
        const windowSettings = parsed?.['Window Settings'];
        const profileSettings = windowSettings?.[currentProfile];
        if (!profileSettings) {
            return false;
        }
        return profileSettings.Bell === false;
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return false;
    }
}
