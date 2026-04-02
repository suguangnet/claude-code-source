"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEnvironmentSelectionInfo = getEnvironmentSelectionInfo;
const constants_js_1 = require("../settings/constants.js");
const settings_js_1 = require("../settings/settings.js");
const environments_js_1 = require("./environments.js");
/**
 * Gets information about available environments and the currently selected one.
 *
 * @returns Promise<EnvironmentSelectionInfo> containing:
 *   - availableEnvironments: all environments from the API
 *   - selectedEnvironment: the environment that would be used (based on settings or first available),
 *     or null if no environments are available
 *   - selectedEnvironmentSource: the SettingSource where defaultEnvironmentId is configured,
 *     or null if using the default (first environment)
 */
async function getEnvironmentSelectionInfo() {
    // Fetch available environments
    const environments = await (0, environments_js_1.fetchEnvironments)();
    if (environments.length === 0) {
        return {
            availableEnvironments: [],
            selectedEnvironment: null,
            selectedEnvironmentSource: null,
        };
    }
    // Get the merged settings to see what would actually be used
    const mergedSettings = (0, settings_js_1.getSettings_DEPRECATED)();
    const defaultEnvironmentId = mergedSettings?.remote?.defaultEnvironmentId;
    // Find which environment would be selected
    let selectedEnvironment = environments.find(env => env.kind !== 'bridge') ?? environments[0];
    let selectedEnvironmentSource = null;
    if (defaultEnvironmentId) {
        const matchingEnvironment = environments.find(env => env.environment_id === defaultEnvironmentId);
        if (matchingEnvironment) {
            selectedEnvironment = matchingEnvironment;
            // Find which source has this setting
            // Iterate from lowest to highest priority, so the last match wins (highest priority)
            for (let i = constants_js_1.SETTING_SOURCES.length - 1; i >= 0; i--) {
                const source = constants_js_1.SETTING_SOURCES[i];
                if (!source || source === 'flagSettings') {
                    // Skip flagSettings as it's not a normal source we check
                    continue;
                }
                const sourceSettings = (0, settings_js_1.getSettingsForSource)(source);
                if (sourceSettings?.remote?.defaultEnvironmentId === defaultEnvironmentId) {
                    selectedEnvironmentSource = source;
                    break;
                }
            }
        }
    }
    return {
        availableEnvironments: environments,
        selectedEnvironment,
        selectedEnvironmentSource,
    };
}
