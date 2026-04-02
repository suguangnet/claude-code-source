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
exports.ConfigTool = void 0;
const bun_bundle_1 = require("bun:bundle");
const v4_1 = require("zod/v4");
const index_js_1 = require("../../services/analytics/index.js");
const Tool_js_1 = require("../../Tool.js");
const config_js_1 = require("../../utils/config.js");
const errors_js_1 = require("../../utils/errors.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const log_js_1 = require("../../utils/log.js");
const settings_js_1 = require("../../utils/settings/settings.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const constants_js_1 = require("./constants.js");
const prompt_js_1 = require("./prompt.js");
const supportedSettings_js_1 = require("./supportedSettings.js");
const UI_js_1 = require("./UI.js");
const inputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.strictObject({
    setting: v4_1.z
        .string()
        .describe('The setting key (e.g., "theme", "model", "permissions.defaultMode")'),
    value: v4_1.z
        .union([v4_1.z.string(), v4_1.z.boolean(), v4_1.z.number()])
        .optional()
        .describe('The new value. Omit to get current value.'),
}));
const outputSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    success: v4_1.z.boolean(),
    operation: v4_1.z.enum(['get', 'set']).optional(),
    setting: v4_1.z.string().optional(),
    value: v4_1.z.unknown().optional(),
    previousValue: v4_1.z.unknown().optional(),
    newValue: v4_1.z.unknown().optional(),
    error: v4_1.z.string().optional(),
}));
exports.ConfigTool = (0, Tool_js_1.buildTool)({
    name: constants_js_1.CONFIG_TOOL_NAME,
    searchHint: 'get or set Claude Code settings (theme, model)',
    maxResultSizeChars: 100000,
    async description() {
        return prompt_js_1.DESCRIPTION;
    },
    async prompt() {
        return (0, prompt_js_1.generatePrompt)();
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    userFacingName() {
        return 'Config';
    },
    shouldDefer: true,
    isConcurrencySafe() {
        return true;
    },
    isReadOnly(input) {
        return input.value === undefined;
    },
    toAutoClassifierInput(input) {
        return input.value === undefined
            ? input.setting
            : `${input.setting} = ${input.value}`;
    },
    async checkPermissions(input) {
        // Auto-allow reading configs
        if (input.value === undefined) {
            return { behavior: 'allow', updatedInput: input };
        }
        return {
            behavior: 'ask',
            message: `Set ${input.setting} to ${(0, slowOperations_js_1.jsonStringify)(input.value)}`,
        };
    },
    renderToolUseMessage: UI_js_1.renderToolUseMessage,
    renderToolResultMessage: UI_js_1.renderToolResultMessage,
    renderToolUseRejectedMessage: UI_js_1.renderToolUseRejectedMessage,
    async call({ setting, value }, context) {
        // 1. Check if setting is supported
        // Voice settings are registered at build-time (feature('VOICE_MODE')), but
        // must also be gated at runtime. When the kill-switch is on, treat
        // voiceEnabled as an unknown setting so no voice-specific strings leak.
        if ((0, bun_bundle_1.feature)('VOICE_MODE') && setting === 'voiceEnabled') {
            const { isVoiceGrowthBookEnabled } = await Promise.resolve().then(() => __importStar(require('../../voice/voiceModeEnabled.js')));
            if (!isVoiceGrowthBookEnabled()) {
                return {
                    data: { success: false, error: `Unknown setting: "${setting}"` },
                };
            }
        }
        if (!(0, supportedSettings_js_1.isSupported)(setting)) {
            return {
                data: { success: false, error: `Unknown setting: "${setting}"` },
            };
        }
        const config = (0, supportedSettings_js_1.getConfig)(setting);
        const path = (0, supportedSettings_js_1.getPath)(setting);
        // 2. GET operation
        if (value === undefined) {
            const currentValue = getValue(config.source, path);
            const displayValue = config.formatOnRead
                ? config.formatOnRead(currentValue)
                : currentValue;
            return {
                data: { success: true, operation: 'get', setting, value: displayValue },
            };
        }
        // 3. SET operation
        // Handle "default" — unset the config key so it falls back to the
        // platform-aware default (determined by the bridge feature gate).
        if (setting === 'remoteControlAtStartup' &&
            typeof value === 'string' &&
            value.toLowerCase().trim() === 'default') {
            (0, config_js_1.saveGlobalConfig)(prev => {
                if (prev.remoteControlAtStartup === undefined)
                    return prev;
                const next = { ...prev };
                delete next.remoteControlAtStartup;
                return next;
            });
            const resolved = (0, config_js_1.getRemoteControlAtStartup)();
            // Sync to AppState so useReplBridge reacts immediately
            context.setAppState(prev => {
                if (prev.replBridgeEnabled === resolved && !prev.replBridgeOutboundOnly)
                    return prev;
                return {
                    ...prev,
                    replBridgeEnabled: resolved,
                    replBridgeOutboundOnly: false,
                };
            });
            return {
                data: {
                    success: true,
                    operation: 'set',
                    setting,
                    value: resolved,
                },
            };
        }
        let finalValue = value;
        // Coerce and validate boolean values
        if (config.type === 'boolean') {
            if (typeof value === 'string') {
                const lower = value.toLowerCase().trim();
                if (lower === 'true')
                    finalValue = true;
                else if (lower === 'false')
                    finalValue = false;
            }
            if (typeof finalValue !== 'boolean') {
                return {
                    data: {
                        success: false,
                        operation: 'set',
                        setting,
                        error: `${setting} requires true or false.`,
                    },
                };
            }
        }
        // Check options
        const options = (0, supportedSettings_js_1.getOptionsForSetting)(setting);
        if (options && !options.includes(String(finalValue))) {
            return {
                data: {
                    success: false,
                    operation: 'set',
                    setting,
                    error: `Invalid value "${value}". Options: ${options.join(', ')}`,
                },
            };
        }
        // Async validation (e.g., model API check)
        if (config.validateOnWrite) {
            const result = await config.validateOnWrite(finalValue);
            if (!result.valid) {
                return {
                    data: {
                        success: false,
                        operation: 'set',
                        setting,
                        error: result.error,
                    },
                };
            }
        }
        // Pre-flight checks for voice mode
        if ((0, bun_bundle_1.feature)('VOICE_MODE') &&
            setting === 'voiceEnabled' &&
            finalValue === true) {
            const { isVoiceModeEnabled } = await Promise.resolve().then(() => __importStar(require('../../voice/voiceModeEnabled.js')));
            if (!isVoiceModeEnabled()) {
                const { isAnthropicAuthEnabled } = await Promise.resolve().then(() => __importStar(require('../../utils/auth.js')));
                return {
                    data: {
                        success: false,
                        error: !isAnthropicAuthEnabled()
                            ? 'Voice mode requires a Claude.ai account. Please run /login to sign in.'
                            : 'Voice mode is not available.',
                    },
                };
            }
            const { isVoiceStreamAvailable } = await Promise.resolve().then(() => __importStar(require('../../services/voiceStreamSTT.js')));
            const { checkRecordingAvailability, checkVoiceDependencies, requestMicrophonePermission, } = await Promise.resolve().then(() => __importStar(require('../../services/voice.js')));
            const recording = await checkRecordingAvailability();
            if (!recording.available) {
                return {
                    data: {
                        success: false,
                        error: recording.reason ??
                            'Voice mode is not available in this environment.',
                    },
                };
            }
            if (!isVoiceStreamAvailable()) {
                return {
                    data: {
                        success: false,
                        error: 'Voice mode requires a Claude.ai account. Please run /login to sign in.',
                    },
                };
            }
            const deps = await checkVoiceDependencies();
            if (!deps.available) {
                return {
                    data: {
                        success: false,
                        error: 'No audio recording tool found.' +
                            (deps.installCommand ? ` Run: ${deps.installCommand}` : ''),
                    },
                };
            }
            if (!(await requestMicrophonePermission())) {
                let guidance;
                if (process.platform === 'win32') {
                    guidance = 'Settings \u2192 Privacy \u2192 Microphone';
                }
                else if (process.platform === 'linux') {
                    guidance = "your system's audio settings";
                }
                else {
                    guidance =
                        'System Settings \u2192 Privacy & Security \u2192 Microphone';
                }
                return {
                    data: {
                        success: false,
                        error: `Microphone access is denied. To enable it, go to ${guidance}, then try again.`,
                    },
                };
            }
        }
        const previousValue = getValue(config.source, path);
        // 4. Write to storage
        try {
            if (config.source === 'global') {
                const key = path[0];
                if (!key) {
                    return {
                        data: {
                            success: false,
                            operation: 'set',
                            setting,
                            error: 'Invalid setting path',
                        },
                    };
                }
                (0, config_js_1.saveGlobalConfig)(prev => {
                    if (prev[key] === finalValue)
                        return prev;
                    return { ...prev, [key]: finalValue };
                });
            }
            else {
                const update = buildNestedObject(path, finalValue);
                const result = (0, settings_js_1.updateSettingsForSource)('userSettings', update);
                if (result.error) {
                    return {
                        data: {
                            success: false,
                            operation: 'set',
                            setting,
                            error: result.error.message,
                        },
                    };
                }
            }
            // 5a. Voice needs notifyChange so applySettingsChange resyncs
            // AppState.settings (useVoiceEnabled reads settings.voiceEnabled)
            // and the settings cache resets for the next /voice read.
            if ((0, bun_bundle_1.feature)('VOICE_MODE') && setting === 'voiceEnabled') {
                const { settingsChangeDetector } = await Promise.resolve().then(() => __importStar(require('../../utils/settings/changeDetector.js')));
                settingsChangeDetector.notifyChange('userSettings');
            }
            // 5b. Sync to AppState if needed for immediate UI effect
            if (config.appStateKey) {
                const appKey = config.appStateKey;
                context.setAppState(prev => {
                    if (prev[appKey] === finalValue)
                        return prev;
                    return { ...prev, [appKey]: finalValue };
                });
            }
            // Sync remoteControlAtStartup to AppState so the bridge reacts
            // immediately (the config key differs from the AppState field name,
            // so the generic appStateKey mechanism can't handle this).
            if (setting === 'remoteControlAtStartup') {
                const resolved = (0, config_js_1.getRemoteControlAtStartup)();
                context.setAppState(prev => {
                    if (prev.replBridgeEnabled === resolved &&
                        !prev.replBridgeOutboundOnly)
                        return prev;
                    return {
                        ...prev,
                        replBridgeEnabled: resolved,
                        replBridgeOutboundOnly: false,
                    };
                });
            }
            (0, index_js_1.logEvent)('tengu_config_tool_changed', {
                setting: setting,
                value: String(finalValue),
            });
            return {
                data: {
                    success: true,
                    operation: 'set',
                    setting,
                    previousValue,
                    newValue: finalValue,
                },
            };
        }
        catch (error) {
            (0, log_js_1.logError)(error);
            return {
                data: {
                    success: false,
                    operation: 'set',
                    setting,
                    error: (0, errors_js_1.errorMessage)(error),
                },
            };
        }
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        if (content.success) {
            if (content.operation === 'get') {
                return {
                    tool_use_id: toolUseID,
                    type: 'tool_result',
                    content: `${content.setting} = ${(0, slowOperations_js_1.jsonStringify)(content.value)}`,
                };
            }
            return {
                tool_use_id: toolUseID,
                type: 'tool_result',
                content: `Set ${content.setting} to ${(0, slowOperations_js_1.jsonStringify)(content.newValue)}`,
            };
        }
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: `Error: ${content.error}`,
            is_error: true,
        };
    },
});
function getValue(source, path) {
    if (source === 'global') {
        const config = (0, config_js_1.getGlobalConfig)();
        const key = path[0];
        if (!key)
            return undefined;
        return config[key];
    }
    const settings = (0, settings_js_1.getInitialSettings)();
    let current = settings;
    for (const key of path) {
        if (current && typeof current === 'object' && key in current) {
            current = current[key];
        }
        else {
            return undefined;
        }
    }
    return current;
}
function buildNestedObject(path, value) {
    if (path.length === 0) {
        return {};
    }
    const key = path[0];
    if (path.length === 1) {
        return { [key]: value };
    }
    return { [key]: buildNestedObject(path.slice(1), value) };
}
