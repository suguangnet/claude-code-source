"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_UPDATE_SCOPES = exports.VALID_INSTALLABLE_SCOPES = void 0;
exports.installPlugin = installPlugin;
exports.uninstallPlugin = uninstallPlugin;
exports.enablePlugin = enablePlugin;
exports.disablePlugin = disablePlugin;
exports.disableAllPlugins = disableAllPlugins;
exports.updatePluginCli = updatePluginCli;
/**
 * CLI command wrappers for plugin operations
 *
 * This module provides thin wrappers around the core plugin operations
 * that handle CLI-specific concerns like console output and process exit.
 *
 * For the core operations (without CLI side effects), see pluginOperations.ts
 */
const figures_1 = __importDefault(require("figures"));
const errors_js_1 = require("../../utils/errors.js");
const gracefulShutdown_js_1 = require("../../utils/gracefulShutdown.js");
const log_js_1 = require("../../utils/log.js");
const managedPlugins_js_1 = require("../../utils/plugins/managedPlugins.js");
const pluginIdentifier_js_1 = require("../../utils/plugins/pluginIdentifier.js");
const process_js_1 = require("../../utils/process.js");
const pluginTelemetry_js_1 = require("../../utils/telemetry/pluginTelemetry.js");
const index_js_1 = require("../analytics/index.js");
const pluginOperations_js_1 = require("./pluginOperations.js");
Object.defineProperty(exports, "VALID_INSTALLABLE_SCOPES", { enumerable: true, get: function () { return pluginOperations_js_1.VALID_INSTALLABLE_SCOPES; } });
Object.defineProperty(exports, "VALID_UPDATE_SCOPES", { enumerable: true, get: function () { return pluginOperations_js_1.VALID_UPDATE_SCOPES; } });
/**
 * Generic error handler for plugin CLI commands. Emits
 * tengu_plugin_command_failed before exit so dashboards can compute a
 * success rate against the corresponding success events.
 */
function handlePluginCommandError(error, command, plugin) {
    (0, log_js_1.logError)(error);
    const operation = plugin
        ? `${command} plugin "${plugin}"`
        : command === 'disable-all'
            ? 'disable all plugins'
            : `${command} plugins`;
    // biome-ignore lint/suspicious/noConsole:: intentional console output
    console.error(`${figures_1.default.cross} Failed to ${operation}: ${(0, errors_js_1.errorMessage)(error)}`);
    const telemetryFields = plugin
        ? (() => {
            const { name, marketplace } = (0, pluginIdentifier_js_1.parsePluginIdentifier)(plugin);
            return {
                _PROTO_plugin_name: name,
                ...(marketplace && {
                    _PROTO_marketplace_name: marketplace,
                }),
                ...(0, pluginTelemetry_js_1.buildPluginTelemetryFields)(name, marketplace, (0, managedPlugins_js_1.getManagedPluginNames)()),
            };
        })()
        : {};
    (0, index_js_1.logEvent)('tengu_plugin_command_failed', {
        command: command,
        error_category: (0, pluginTelemetry_js_1.classifyPluginCommandError)(error),
        ...telemetryFields,
    });
    // eslint-disable-next-line custom-rules/no-process-exit
    process.exit(1);
}
/**
 * CLI command: Install a plugin non-interactively
 * @param plugin Plugin identifier (name or plugin@marketplace)
 * @param scope Installation scope: user, project, or local (defaults to 'user')
 */
async function installPlugin(plugin, scope = 'user') {
    try {
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.log(`Installing plugin "${plugin}"...`);
        const result = await (0, pluginOperations_js_1.installPluginOp)(plugin, scope);
        if (!result.success) {
            throw new Error(result.message);
        }
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.log(`${figures_1.default.tick} ${result.message}`);
        // _PROTO_* routes to PII-tagged plugin_name/marketplace_name BQ columns.
        // Unredacted plugin_id was previously logged to general-access
        // additional_metadata for all users — dropped in favor of the privileged
        // column route.
        const { name, marketplace } = (0, pluginIdentifier_js_1.parsePluginIdentifier)(result.pluginId || plugin);
        (0, index_js_1.logEvent)('tengu_plugin_installed_cli', {
            _PROTO_plugin_name: name,
            ...(marketplace && {
                _PROTO_marketplace_name: marketplace,
            }),
            scope: (result.scope ||
                scope),
            install_source: 'cli-explicit',
            ...(0, pluginTelemetry_js_1.buildPluginTelemetryFields)(name, marketplace, (0, managedPlugins_js_1.getManagedPluginNames)()),
        });
        // eslint-disable-next-line custom-rules/no-process-exit
        process.exit(0);
    }
    catch (error) {
        handlePluginCommandError(error, 'install', plugin);
    }
}
/**
 * CLI command: Uninstall a plugin non-interactively
 * @param plugin Plugin name or plugin@marketplace identifier
 * @param scope Uninstall from scope: user, project, or local (defaults to 'user')
 */
async function uninstallPlugin(plugin, scope = 'user', keepData = false) {
    try {
        const result = await (0, pluginOperations_js_1.uninstallPluginOp)(plugin, scope, !keepData);
        if (!result.success) {
            throw new Error(result.message);
        }
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.log(`${figures_1.default.tick} ${result.message}`);
        const { name, marketplace } = (0, pluginIdentifier_js_1.parsePluginIdentifier)(result.pluginId || plugin);
        (0, index_js_1.logEvent)('tengu_plugin_uninstalled_cli', {
            _PROTO_plugin_name: name,
            ...(marketplace && {
                _PROTO_marketplace_name: marketplace,
            }),
            scope: (result.scope ||
                scope),
            ...(0, pluginTelemetry_js_1.buildPluginTelemetryFields)(name, marketplace, (0, managedPlugins_js_1.getManagedPluginNames)()),
        });
        // eslint-disable-next-line custom-rules/no-process-exit
        process.exit(0);
    }
    catch (error) {
        handlePluginCommandError(error, 'uninstall', plugin);
    }
}
/**
 * CLI command: Enable a plugin non-interactively
 * @param plugin Plugin name or plugin@marketplace identifier
 * @param scope Optional scope. If not provided, finds the most specific scope for the current project.
 */
async function enablePlugin(plugin, scope) {
    try {
        const result = await (0, pluginOperations_js_1.enablePluginOp)(plugin, scope);
        if (!result.success) {
            throw new Error(result.message);
        }
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.log(`${figures_1.default.tick} ${result.message}`);
        const { name, marketplace } = (0, pluginIdentifier_js_1.parsePluginIdentifier)(result.pluginId || plugin);
        (0, index_js_1.logEvent)('tengu_plugin_enabled_cli', {
            _PROTO_plugin_name: name,
            ...(marketplace && {
                _PROTO_marketplace_name: marketplace,
            }),
            scope: result.scope,
            ...(0, pluginTelemetry_js_1.buildPluginTelemetryFields)(name, marketplace, (0, managedPlugins_js_1.getManagedPluginNames)()),
        });
        // eslint-disable-next-line custom-rules/no-process-exit
        process.exit(0);
    }
    catch (error) {
        handlePluginCommandError(error, 'enable', plugin);
    }
}
/**
 * CLI command: Disable a plugin non-interactively
 * @param plugin Plugin name or plugin@marketplace identifier
 * @param scope Optional scope. If not provided, finds the most specific scope for the current project.
 */
async function disablePlugin(plugin, scope) {
    try {
        const result = await (0, pluginOperations_js_1.disablePluginOp)(plugin, scope);
        if (!result.success) {
            throw new Error(result.message);
        }
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.log(`${figures_1.default.tick} ${result.message}`);
        const { name, marketplace } = (0, pluginIdentifier_js_1.parsePluginIdentifier)(result.pluginId || plugin);
        (0, index_js_1.logEvent)('tengu_plugin_disabled_cli', {
            _PROTO_plugin_name: name,
            ...(marketplace && {
                _PROTO_marketplace_name: marketplace,
            }),
            scope: result.scope,
            ...(0, pluginTelemetry_js_1.buildPluginTelemetryFields)(name, marketplace, (0, managedPlugins_js_1.getManagedPluginNames)()),
        });
        // eslint-disable-next-line custom-rules/no-process-exit
        process.exit(0);
    }
    catch (error) {
        handlePluginCommandError(error, 'disable', plugin);
    }
}
/**
 * CLI command: Disable all enabled plugins non-interactively
 */
async function disableAllPlugins() {
    try {
        const result = await (0, pluginOperations_js_1.disableAllPluginsOp)();
        if (!result.success) {
            throw new Error(result.message);
        }
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.log(`${figures_1.default.tick} ${result.message}`);
        (0, index_js_1.logEvent)('tengu_plugin_disabled_all_cli', {});
        // eslint-disable-next-line custom-rules/no-process-exit
        process.exit(0);
    }
    catch (error) {
        handlePluginCommandError(error, 'disable-all');
    }
}
/**
 * CLI command: Update a plugin non-interactively
 * @param plugin Plugin name or plugin@marketplace identifier
 * @param scope Scope to update
 */
async function updatePluginCli(plugin, scope) {
    try {
        (0, process_js_1.writeToStdout)(`Checking for updates for plugin "${plugin}" at ${scope} scope…\n`);
        const result = await (0, pluginOperations_js_1.updatePluginOp)(plugin, scope);
        if (!result.success) {
            throw new Error(result.message);
        }
        (0, process_js_1.writeToStdout)(`${figures_1.default.tick} ${result.message}\n`);
        if (!result.alreadyUpToDate) {
            const { name, marketplace } = (0, pluginIdentifier_js_1.parsePluginIdentifier)(result.pluginId || plugin);
            (0, index_js_1.logEvent)('tengu_plugin_updated_cli', {
                _PROTO_plugin_name: name,
                ...(marketplace && {
                    _PROTO_marketplace_name: marketplace,
                }),
                old_version: (result.oldVersion ||
                    'unknown'),
                new_version: (result.newVersion ||
                    'unknown'),
                ...(0, pluginTelemetry_js_1.buildPluginTelemetryFields)(name, marketplace, (0, managedPlugins_js_1.getManagedPluginNames)()),
            });
        }
        await (0, gracefulShutdown_js_1.gracefulShutdown)(0);
    }
    catch (error) {
        handlePluginCommandError(error, 'update', plugin);
    }
}
