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
exports.call = void 0;
const useVoice_js_1 = require("../../hooks/useVoice.js");
const shortcutFormat_js_1 = require("../../keybindings/shortcutFormat.js");
const index_js_1 = require("../../services/analytics/index.js");
const auth_js_1 = require("../../utils/auth.js");
const config_js_1 = require("../../utils/config.js");
const changeDetector_js_1 = require("../../utils/settings/changeDetector.js");
const settings_js_1 = require("../../utils/settings/settings.js");
const voiceModeEnabled_js_1 = require("../../voice/voiceModeEnabled.js");
const LANG_HINT_MAX_SHOWS = 2;
const call = async () => {
    // Check auth and kill-switch before allowing voice mode
    if (!(0, voiceModeEnabled_js_1.isVoiceModeEnabled)()) {
        // Differentiate: OAuth-less users get an auth hint, everyone else
        // gets nothing (command shouldn't be reachable when the kill-switch is on).
        if (!(0, auth_js_1.isAnthropicAuthEnabled)()) {
            return {
                type: 'text',
                value: 'Voice mode requires a Claude.ai account. Please run /login to sign in.',
            };
        }
        return {
            type: 'text',
            value: 'Voice mode is not available.',
        };
    }
    const currentSettings = (0, settings_js_1.getInitialSettings)();
    const isCurrentlyEnabled = currentSettings.voiceEnabled === true;
    // Toggle OFF — no checks needed
    if (isCurrentlyEnabled) {
        const result = (0, settings_js_1.updateSettingsForSource)('userSettings', {
            voiceEnabled: false,
        });
        if (result.error) {
            return {
                type: 'text',
                value: 'Failed to update settings. Check your settings file for syntax errors.',
            };
        }
        changeDetector_js_1.settingsChangeDetector.notifyChange('userSettings');
        (0, index_js_1.logEvent)('tengu_voice_toggled', { enabled: false });
        return {
            type: 'text',
            value: 'Voice mode disabled.',
        };
    }
    // Toggle ON — run pre-flight checks first
    const { isVoiceStreamAvailable } = await Promise.resolve().then(() => __importStar(require('../../services/voiceStreamSTT.js')));
    const { checkRecordingAvailability } = await Promise.resolve().then(() => __importStar(require('../../services/voice.js')));
    // Check recording availability (microphone access)
    const recording = await checkRecordingAvailability();
    if (!recording.available) {
        return {
            type: 'text',
            value: recording.reason ?? 'Voice mode is not available in this environment.',
        };
    }
    // Check for API key
    if (!isVoiceStreamAvailable()) {
        return {
            type: 'text',
            value: 'Voice mode requires a Claude.ai account. Please run /login to sign in.',
        };
    }
    // Check for recording tools
    const { checkVoiceDependencies, requestMicrophonePermission } = await Promise.resolve().then(() => __importStar(require('../../services/voice.js')));
    const deps = await checkVoiceDependencies();
    if (!deps.available) {
        const hint = deps.installCommand
            ? `\nInstall audio recording tools? Run: ${deps.installCommand}`
            : '\nInstall SoX manually for audio recording.';
        return {
            type: 'text',
            value: `No audio recording tool found.${hint}`,
        };
    }
    // Probe mic access so the OS permission dialog fires now rather than
    // on the user's first hold-to-talk activation.
    if (!(await requestMicrophonePermission())) {
        let guidance;
        if (process.platform === 'win32') {
            guidance = 'Settings \u2192 Privacy \u2192 Microphone';
        }
        else if (process.platform === 'linux') {
            guidance = "your system's audio settings";
        }
        else {
            guidance = 'System Settings \u2192 Privacy & Security \u2192 Microphone';
        }
        return {
            type: 'text',
            value: `Microphone access is denied. To enable it, go to ${guidance}, then run /voice again.`,
        };
    }
    // All checks passed — enable voice
    const result = (0, settings_js_1.updateSettingsForSource)('userSettings', { voiceEnabled: true });
    if (result.error) {
        return {
            type: 'text',
            value: 'Failed to update settings. Check your settings file for syntax errors.',
        };
    }
    changeDetector_js_1.settingsChangeDetector.notifyChange('userSettings');
    (0, index_js_1.logEvent)('tengu_voice_toggled', { enabled: true });
    const key = (0, shortcutFormat_js_1.getShortcutDisplay)('voice:pushToTalk', 'Chat', 'Space');
    const stt = (0, useVoice_js_1.normalizeLanguageForSTT)(currentSettings.language);
    const cfg = (0, config_js_1.getGlobalConfig)();
    // Reset the hint counter whenever the resolved STT language changes
    // (including first-ever enable, where lastLanguage is undefined).
    const langChanged = cfg.voiceLangHintLastLanguage !== stt.code;
    const priorCount = langChanged ? 0 : (cfg.voiceLangHintShownCount ?? 0);
    const showHint = !stt.fellBackFrom && priorCount < LANG_HINT_MAX_SHOWS;
    let langNote = '';
    if (stt.fellBackFrom) {
        langNote = ` Note: "${stt.fellBackFrom}" is not a supported dictation language; using English. Change it via /config.`;
    }
    else if (showHint) {
        langNote = ` Dictation language: ${stt.code} (/config to change).`;
    }
    if (langChanged || showHint) {
        (0, config_js_1.saveGlobalConfig)(prev => ({
            ...prev,
            voiceLangHintShownCount: priorCount + (showHint ? 1 : 0),
            voiceLangHintLastLanguage: stt.code,
        }));
    }
    return {
        type: 'text',
        value: `Voice mode enabled. Hold ${key} to record.${langNote}`,
    };
};
exports.call = call;
