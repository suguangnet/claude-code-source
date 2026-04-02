"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractRules = extractRules;
exports.hasRules = hasRules;
exports.applyPermissionUpdate = applyPermissionUpdate;
exports.applyPermissionUpdates = applyPermissionUpdates;
exports.supportsPersistence = supportsPersistence;
exports.persistPermissionUpdate = persistPermissionUpdate;
exports.persistPermissionUpdates = persistPermissionUpdates;
exports.createReadRuleSuggestion = createReadRuleSuggestion;
const path_1 = require("path");
const debug_js_1 = require("../debug.js");
const settings_js_1 = require("../settings/settings.js");
const slowOperations_js_1 = require("../slowOperations.js");
const filesystem_js_1 = require("./filesystem.js");
const permissionRuleParser_js_1 = require("./permissionRuleParser.js");
const permissionsLoader_js_1 = require("./permissionsLoader.js");
function extractRules(updates) {
    if (!updates)
        return [];
    return updates.flatMap(update => {
        switch (update.type) {
            case 'addRules':
                return update.rules;
            default:
                return [];
        }
    });
}
function hasRules(updates) {
    return extractRules(updates).length > 0;
}
/**
 * Applies a single permission update to the context and returns the updated context
 * @param context The current permission context
 * @param update The permission update to apply
 * @returns The updated permission context
 */
function applyPermissionUpdate(context, update) {
    switch (update.type) {
        case 'setMode':
            (0, debug_js_1.logForDebugging)(`Applying permission update: Setting mode to '${update.mode}'`);
            return {
                ...context,
                mode: update.mode,
            };
        case 'addRules': {
            const ruleStrings = update.rules.map(rule => (0, permissionRuleParser_js_1.permissionRuleValueToString)(rule));
            (0, debug_js_1.logForDebugging)(`Applying permission update: Adding ${update.rules.length} ${update.behavior} rule(s) to destination '${update.destination}': ${(0, slowOperations_js_1.jsonStringify)(ruleStrings)}`);
            // Determine which collection to update based on behavior
            const ruleKind = update.behavior === 'allow'
                ? 'alwaysAllowRules'
                : update.behavior === 'deny'
                    ? 'alwaysDenyRules'
                    : 'alwaysAskRules';
            return {
                ...context,
                [ruleKind]: {
                    ...context[ruleKind],
                    [update.destination]: [
                        ...(context[ruleKind][update.destination] || []),
                        ...ruleStrings,
                    ],
                },
            };
        }
        case 'replaceRules': {
            const ruleStrings = update.rules.map(rule => (0, permissionRuleParser_js_1.permissionRuleValueToString)(rule));
            (0, debug_js_1.logForDebugging)(`Replacing all ${update.behavior} rules for destination '${update.destination}' with ${update.rules.length} rule(s): ${(0, slowOperations_js_1.jsonStringify)(ruleStrings)}`);
            // Determine which collection to update based on behavior
            const ruleKind = update.behavior === 'allow'
                ? 'alwaysAllowRules'
                : update.behavior === 'deny'
                    ? 'alwaysDenyRules'
                    : 'alwaysAskRules';
            return {
                ...context,
                [ruleKind]: {
                    ...context[ruleKind],
                    [update.destination]: ruleStrings, // Replace all rules for this source
                },
            };
        }
        case 'addDirectories': {
            (0, debug_js_1.logForDebugging)(`Applying permission update: Adding ${update.directories.length} director${update.directories.length === 1 ? 'y' : 'ies'} with destination '${update.destination}': ${(0, slowOperations_js_1.jsonStringify)(update.directories)}`);
            const newAdditionalDirs = new Map(context.additionalWorkingDirectories);
            for (const directory of update.directories) {
                newAdditionalDirs.set(directory, {
                    path: directory,
                    source: update.destination,
                });
            }
            return {
                ...context,
                additionalWorkingDirectories: newAdditionalDirs,
            };
        }
        case 'removeRules': {
            const ruleStrings = update.rules.map(rule => (0, permissionRuleParser_js_1.permissionRuleValueToString)(rule));
            (0, debug_js_1.logForDebugging)(`Applying permission update: Removing ${update.rules.length} ${update.behavior} rule(s) from source '${update.destination}': ${(0, slowOperations_js_1.jsonStringify)(ruleStrings)}`);
            // Determine which collection to update based on behavior
            const ruleKind = update.behavior === 'allow'
                ? 'alwaysAllowRules'
                : update.behavior === 'deny'
                    ? 'alwaysDenyRules'
                    : 'alwaysAskRules';
            // Filter out the rules to be removed
            const existingRules = context[ruleKind][update.destination] || [];
            const rulesToRemove = new Set(ruleStrings);
            const filteredRules = existingRules.filter(rule => !rulesToRemove.has(rule));
            return {
                ...context,
                [ruleKind]: {
                    ...context[ruleKind],
                    [update.destination]: filteredRules,
                },
            };
        }
        case 'removeDirectories': {
            (0, debug_js_1.logForDebugging)(`Applying permission update: Removing ${update.directories.length} director${update.directories.length === 1 ? 'y' : 'ies'}: ${(0, slowOperations_js_1.jsonStringify)(update.directories)}`);
            const newAdditionalDirs = new Map(context.additionalWorkingDirectories);
            for (const directory of update.directories) {
                newAdditionalDirs.delete(directory);
            }
            return {
                ...context,
                additionalWorkingDirectories: newAdditionalDirs,
            };
        }
        default:
            return context;
    }
}
/**
 * Applies multiple permission updates to the context and returns the updated context
 * @param context The current permission context
 * @param updates The permission updates to apply
 * @returns The updated permission context
 */
function applyPermissionUpdates(context, updates) {
    let updatedContext = context;
    for (const update of updates) {
        updatedContext = applyPermissionUpdate(updatedContext, update);
    }
    return updatedContext;
}
function supportsPersistence(destination) {
    return (destination === 'localSettings' ||
        destination === 'userSettings' ||
        destination === 'projectSettings');
}
/**
 * Persists a permission update to the appropriate settings source
 * @param update The permission update to persist
 */
function persistPermissionUpdate(update) {
    if (!supportsPersistence(update.destination))
        return;
    (0, debug_js_1.logForDebugging)(`Persisting permission update: ${update.type} to source '${update.destination}'`);
    switch (update.type) {
        case 'addRules': {
            (0, debug_js_1.logForDebugging)(`Persisting ${update.rules.length} ${update.behavior} rule(s) to ${update.destination}`);
            (0, permissionsLoader_js_1.addPermissionRulesToSettings)({
                ruleValues: update.rules,
                ruleBehavior: update.behavior,
            }, update.destination);
            break;
        }
        case 'addDirectories': {
            (0, debug_js_1.logForDebugging)(`Persisting ${update.directories.length} director${update.directories.length === 1 ? 'y' : 'ies'} to ${update.destination}`);
            const existingSettings = (0, settings_js_1.getSettingsForSource)(update.destination);
            const existingDirs = existingSettings?.permissions?.additionalDirectories || [];
            // Add new directories, avoiding duplicates
            const dirsToAdd = update.directories.filter(dir => !existingDirs.includes(dir));
            if (dirsToAdd.length > 0) {
                const updatedDirs = [...existingDirs, ...dirsToAdd];
                (0, settings_js_1.updateSettingsForSource)(update.destination, {
                    permissions: {
                        additionalDirectories: updatedDirs,
                    },
                });
            }
            break;
        }
        case 'removeRules': {
            // Handle rule removal
            (0, debug_js_1.logForDebugging)(`Removing ${update.rules.length} ${update.behavior} rule(s) from ${update.destination}`);
            const existingSettings = (0, settings_js_1.getSettingsForSource)(update.destination);
            const existingPermissions = existingSettings?.permissions || {};
            const existingRules = existingPermissions[update.behavior] || [];
            // Convert rules to normalized strings for comparison
            // Normalize via parse→serialize roundtrip so "Bash(*)" and "Bash" match
            const rulesToRemove = new Set(update.rules.map(permissionRuleParser_js_1.permissionRuleValueToString));
            const filteredRules = existingRules.filter(rule => {
                const normalized = (0, permissionRuleParser_js_1.permissionRuleValueToString)((0, permissionRuleParser_js_1.permissionRuleValueFromString)(rule));
                return !rulesToRemove.has(normalized);
            });
            (0, settings_js_1.updateSettingsForSource)(update.destination, {
                permissions: {
                    [update.behavior]: filteredRules,
                },
            });
            break;
        }
        case 'removeDirectories': {
            (0, debug_js_1.logForDebugging)(`Removing ${update.directories.length} director${update.directories.length === 1 ? 'y' : 'ies'} from ${update.destination}`);
            const existingSettings = (0, settings_js_1.getSettingsForSource)(update.destination);
            const existingDirs = existingSettings?.permissions?.additionalDirectories || [];
            // Remove specified directories
            const dirsToRemove = new Set(update.directories);
            const filteredDirs = existingDirs.filter(dir => !dirsToRemove.has(dir));
            (0, settings_js_1.updateSettingsForSource)(update.destination, {
                permissions: {
                    additionalDirectories: filteredDirs,
                },
            });
            break;
        }
        case 'setMode': {
            (0, debug_js_1.logForDebugging)(`Persisting mode '${update.mode}' to ${update.destination}`);
            (0, settings_js_1.updateSettingsForSource)(update.destination, {
                permissions: {
                    defaultMode: update.mode,
                },
            });
            break;
        }
        case 'replaceRules': {
            (0, debug_js_1.logForDebugging)(`Replacing all ${update.behavior} rules in ${update.destination} with ${update.rules.length} rule(s)`);
            const ruleStrings = update.rules.map(permissionRuleParser_js_1.permissionRuleValueToString);
            (0, settings_js_1.updateSettingsForSource)(update.destination, {
                permissions: {
                    [update.behavior]: ruleStrings,
                },
            });
            break;
        }
    }
}
/**
 * Persists multiple permission updates to the appropriate settings sources
 * Only persists updates with persistable sources
 * @param updates The permission updates to persist
 */
function persistPermissionUpdates(updates) {
    for (const update of updates) {
        persistPermissionUpdate(update);
    }
}
/**
 * Creates a Read rule suggestion for a directory.
 * @param dirPath The directory path to create a rule for
 * @param destination The destination for the permission rule (defaults to 'session')
 * @returns A PermissionUpdate for a Read rule, or undefined for the root directory
 */
function createReadRuleSuggestion(dirPath, destination = 'session') {
    // Convert to POSIX format for pattern matching (handles Windows internally)
    const pathForPattern = (0, filesystem_js_1.toPosixPath)(dirPath);
    // Root directory is too broad to be a reasonable permission target
    if (pathForPattern === '/') {
        return undefined;
    }
    // For absolute paths, prepend an extra / to create //path/** pattern
    const ruleContent = path_1.posix.isAbsolute(pathForPattern)
        ? `/${pathForPattern}/**`
        : `${pathForPattern}/**`;
    return {
        type: 'addRules',
        rules: [
            {
                toolName: 'Read',
                ruleContent,
            },
        ],
        behavior: 'allow',
        destination,
    };
}
