"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldAllowManagedPermissionRulesOnly = shouldAllowManagedPermissionRulesOnly;
exports.shouldShowAlwaysAllowOptions = shouldShowAlwaysAllowOptions;
exports.loadAllPermissionRulesFromDisk = loadAllPermissionRulesFromDisk;
exports.getPermissionRulesForSource = getPermissionRulesForSource;
exports.deletePermissionRuleFromSettings = deletePermissionRuleFromSettings;
exports.addPermissionRulesToSettings = addPermissionRulesToSettings;
const fileRead_js_1 = require("../fileRead.js");
const fsOperations_js_1 = require("../fsOperations.js");
const json_js_1 = require("../json.js");
const log_js_1 = require("../log.js");
const constants_js_1 = require("../settings/constants.js");
const settings_js_1 = require("../settings/settings.js");
const permissionRuleParser_js_1 = require("./permissionRuleParser.js");
/**
 * Returns true if allowManagedPermissionRulesOnly is enabled in managed settings (policySettings).
 * When enabled, only permission rules from managed settings are respected.
 */
function shouldAllowManagedPermissionRulesOnly() {
    return ((0, settings_js_1.getSettingsForSource)('policySettings')?.allowManagedPermissionRulesOnly ===
        true);
}
/**
 * Returns true if "always allow" options should be shown in permission prompts.
 * When allowManagedPermissionRulesOnly is enabled, these options are hidden.
 */
function shouldShowAlwaysAllowOptions() {
    return !shouldAllowManagedPermissionRulesOnly();
}
const SUPPORTED_RULE_BEHAVIORS = [
    'allow',
    'deny',
    'ask',
];
/**
 * Lenient version of getSettingsForSource that doesn't fail on ANY validation errors.
 * Simply parses the JSON and returns it as-is without schema validation.
 *
 * Used when loading settings to append new rules (avoids losing existing rules
 * due to validation failures in unrelated fields like hooks).
 *
 * FOR EDITING ONLY - do not use this for reading settings for execution.
 */
function getSettingsForSourceLenient_FOR_EDITING_ONLY_NOT_FOR_READING(source) {
    const filePath = (0, settings_js_1.getSettingsFilePathForSource)(source);
    if (!filePath) {
        return null;
    }
    try {
        const { resolvedPath } = (0, fsOperations_js_1.safeResolvePath)((0, fsOperations_js_1.getFsImplementation)(), filePath);
        const content = (0, fileRead_js_1.readFileSync)(resolvedPath);
        if (content.trim() === '') {
            return {};
        }
        const data = (0, json_js_1.safeParseJSON)(content, false);
        // Return raw parsed JSON without validation to preserve all existing settings
        // This is safe because we're only using this for reading/appending, not for execution
        return data && typeof data === 'object' ? data : null;
    }
    catch {
        return null;
    }
}
/**
 * Converts permissions JSON to an array of PermissionRule objects
 * @param data The parsed permissions data
 * @param source The source of these rules
 * @returns Array of PermissionRule objects
 */
function settingsJsonToRules(data, source) {
    if (!data || !data.permissions) {
        return [];
    }
    const { permissions } = data;
    const rules = [];
    for (const behavior of SUPPORTED_RULE_BEHAVIORS) {
        const behaviorArray = permissions[behavior];
        if (behaviorArray) {
            for (const ruleString of behaviorArray) {
                rules.push({
                    source,
                    ruleBehavior: behavior,
                    ruleValue: (0, permissionRuleParser_js_1.permissionRuleValueFromString)(ruleString),
                });
            }
        }
    }
    return rules;
}
/**
 * Loads all permission rules from all relevant sources (managed and project settings)
 * @returns Array of all permission rules
 */
function loadAllPermissionRulesFromDisk() {
    // If allowManagedPermissionRulesOnly is set, only use managed permission rules
    if (shouldAllowManagedPermissionRulesOnly()) {
        return getPermissionRulesForSource('policySettings');
    }
    // Otherwise, load from all enabled sources (backwards compatible)
    const rules = [];
    for (const source of (0, constants_js_1.getEnabledSettingSources)()) {
        rules.push(...getPermissionRulesForSource(source));
    }
    return rules;
}
/**
 * Loads permission rules from a specific source
 * @param source The source to load from
 * @returns Array of permission rules from that source
 */
function getPermissionRulesForSource(source) {
    const settingsData = (0, settings_js_1.getSettingsForSource)(source);
    return settingsJsonToRules(settingsData, source);
}
// Editable sources that can be modified (excludes policySettings and flagSettings)
const EDITABLE_SOURCES = [
    'userSettings',
    'projectSettings',
    'localSettings',
];
/**
 * Deletes a rule from the project permissions file
 * @param rule The rule to delete
 * @returns Promise resolving to a boolean indicating success
 */
function deletePermissionRuleFromSettings(rule) {
    // Runtime check to ensure source is actually editable
    if (!EDITABLE_SOURCES.includes(rule.source)) {
        return false;
    }
    const ruleString = (0, permissionRuleParser_js_1.permissionRuleValueToString)(rule.ruleValue);
    const settingsData = (0, settings_js_1.getSettingsForSource)(rule.source);
    // If there's no settings data or permissions, nothing to do
    if (!settingsData || !settingsData.permissions) {
        return false;
    }
    const behaviorArray = settingsData.permissions[rule.ruleBehavior];
    if (!behaviorArray) {
        return false;
    }
    // Normalize raw settings entries via roundtrip parse→serialize so legacy
    // names (e.g. "KillShell") match their canonical form ("TaskStop").
    const normalizeEntry = (raw) => (0, permissionRuleParser_js_1.permissionRuleValueToString)((0, permissionRuleParser_js_1.permissionRuleValueFromString)(raw));
    if (!behaviorArray.some(raw => normalizeEntry(raw) === ruleString)) {
        return false;
    }
    try {
        // Keep a copy of the original permissions data to preserve unrecognized keys
        const updatedSettingsData = {
            ...settingsData,
            permissions: {
                ...settingsData.permissions,
                [rule.ruleBehavior]: behaviorArray.filter(raw => normalizeEntry(raw) !== ruleString),
            },
        };
        const { error } = (0, settings_js_1.updateSettingsForSource)(rule.source, updatedSettingsData);
        if (error) {
            // Error already logged inside updateSettingsForSource
            return false;
        }
        return true;
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return false;
    }
}
function getEmptyPermissionSettingsJson() {
    return {
        permissions: {},
    };
}
/**
 * Adds rules to the project permissions file
 * @param ruleValues The rule values to add
 * @returns Promise resolving to a boolean indicating success
 */
function addPermissionRulesToSettings({ ruleValues, ruleBehavior, }, source) {
    // When allowManagedPermissionRulesOnly is enabled, don't persist new permission rules
    if (shouldAllowManagedPermissionRulesOnly()) {
        return false;
    }
    if (ruleValues.length < 1) {
        // No rules to add
        return true;
    }
    const ruleStrings = ruleValues.map(permissionRuleParser_js_1.permissionRuleValueToString);
    // First try the normal settings loader which validates the schema
    // If validation fails, fall back to lenient loading to preserve existing rules
    // even if some fields (like hooks) have validation errors
    const settingsData = (0, settings_js_1.getSettingsForSource)(source) ||
        getSettingsForSourceLenient_FOR_EDITING_ONLY_NOT_FOR_READING(source) ||
        getEmptyPermissionSettingsJson();
    try {
        // Ensure permissions object exists
        const existingPermissions = settingsData.permissions || {};
        const existingRules = existingPermissions[ruleBehavior] || [];
        // Filter out duplicates - normalize existing entries via roundtrip
        // parse→serialize so legacy names match their canonical form.
        const existingRulesSet = new Set(existingRules.map(raw => (0, permissionRuleParser_js_1.permissionRuleValueToString)((0, permissionRuleParser_js_1.permissionRuleValueFromString)(raw))));
        const newRules = ruleStrings.filter(rule => !existingRulesSet.has(rule));
        // If no new rules to add, return success
        if (newRules.length === 0) {
            return true;
        }
        // Keep a copy of the original settings data to preserve unrecognized keys
        const updatedSettingsData = {
            ...settingsData,
            permissions: {
                ...existingPermissions,
                [ruleBehavior]: [...existingRules, ...newRules],
            },
        };
        const result = (0, settings_js_1.updateSettingsForSource)(source, updatedSettingsData);
        if (result.error) {
            throw result.error;
        }
        return true;
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return false;
    }
}
