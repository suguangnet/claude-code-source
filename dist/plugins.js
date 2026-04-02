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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_UPDATE_SCOPES = exports.VALID_INSTALLABLE_SCOPES = void 0;
exports.handleMarketplaceError = handleMarketplaceError;
exports.pluginValidateHandler = pluginValidateHandler;
exports.pluginListHandler = pluginListHandler;
exports.marketplaceAddHandler = marketplaceAddHandler;
exports.marketplaceListHandler = marketplaceListHandler;
exports.marketplaceRemoveHandler = marketplaceRemoveHandler;
exports.marketplaceUpdateHandler = marketplaceUpdateHandler;
exports.pluginInstallHandler = pluginInstallHandler;
exports.pluginUninstallHandler = pluginUninstallHandler;
exports.pluginEnableHandler = pluginEnableHandler;
exports.pluginDisableHandler = pluginDisableHandler;
exports.pluginUpdateHandler = pluginUpdateHandler;
/**
 * Plugin and marketplace subcommand handlers — extracted from main.tsx for lazy loading.
 * These are dynamically imported only when `claude plugin *` or `claude plugin marketplace *` runs.
 */
/* eslint-disable custom-rules/no-process-exit -- CLI subcommand handlers intentionally exit */
const figures_1 = __importDefault(require("figures"));
const path_1 = require("path");
const state_js_1 = require("../../bootstrap/state.js");
const index_js_1 = require("../../services/analytics/index.js");
const pluginCliCommands_js_1 = require("../../services/plugins/pluginCliCommands.js");
Object.defineProperty(exports, "VALID_INSTALLABLE_SCOPES", { enumerable: true, get: function () { return pluginCliCommands_js_1.VALID_INSTALLABLE_SCOPES; } });
Object.defineProperty(exports, "VALID_UPDATE_SCOPES", { enumerable: true, get: function () { return pluginCliCommands_js_1.VALID_UPDATE_SCOPES; } });
const plugin_js_1 = require("../../types/plugin.js");
const errors_js_1 = require("../../utils/errors.js");
const log_js_1 = require("../../utils/log.js");
const cacheUtils_js_1 = require("../../utils/plugins/cacheUtils.js");
const installCounts_js_1 = require("../../utils/plugins/installCounts.js");
const installedPluginsManager_js_1 = require("../../utils/plugins/installedPluginsManager.js");
const marketplaceHelpers_js_1 = require("../../utils/plugins/marketplaceHelpers.js");
const marketplaceManager_js_1 = require("../../utils/plugins/marketplaceManager.js");
const mcpPluginIntegration_js_1 = require("../../utils/plugins/mcpPluginIntegration.js");
const parseMarketplaceInput_js_1 = require("../../utils/plugins/parseMarketplaceInput.js");
const pluginIdentifier_js_1 = require("../../utils/plugins/pluginIdentifier.js");
const pluginLoader_js_1 = require("../../utils/plugins/pluginLoader.js");
const validatePlugin_js_1 = require("../../utils/plugins/validatePlugin.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const stringUtils_js_1 = require("../../utils/stringUtils.js");
const exit_js_1 = require("../exit.js");
/**
 * Helper function to handle marketplace command errors consistently.
 */
function handleMarketplaceError(error, action) {
    (0, log_js_1.logError)(error);
    (0, exit_js_1.cliError)(`${figures_1.default.cross} Failed to ${action}: ${(0, errors_js_1.errorMessage)(error)}`);
}
function printValidationResult(result) {
    if (result.errors.length > 0) {
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.log(`${figures_1.default.cross} Found ${result.errors.length} ${(0, stringUtils_js_1.plural)(result.errors.length, 'error')}:\n`);
        result.errors.forEach(error => {
            // biome-ignore lint/suspicious/noConsole:: intentional console output
            console.log(`  ${figures_1.default.pointer} ${error.path}: ${error.message}`);
        });
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.log('');
    }
    if (result.warnings.length > 0) {
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.log(`${figures_1.default.warning} Found ${result.warnings.length} ${(0, stringUtils_js_1.plural)(result.warnings.length, 'warning')}:\n`);
        result.warnings.forEach(warning => {
            // biome-ignore lint/suspicious/noConsole:: intentional console output
            console.log(`  ${figures_1.default.pointer} ${warning.path}: ${warning.message}`);
        });
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.log('');
    }
}
// plugin validate
async function pluginValidateHandler(manifestPath, options) {
    if (options.cowork)
        (0, state_js_1.setUseCoworkPlugins)(true);
    try {
        const result = await (0, validatePlugin_js_1.validateManifest)(manifestPath);
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.log(`Validating ${result.fileType} manifest: ${result.filePath}\n`);
        printValidationResult(result);
        // If this is a plugin manifest located inside a .claude-plugin directory,
        // also validate the plugin's content files (skills, agents, commands,
        // hooks). Works whether the user passed a directory or the plugin.json
        // path directly.
        let contentResults = [];
        if (result.fileType === 'plugin') {
            const manifestDir = (0, path_1.dirname)(result.filePath);
            if ((0, path_1.basename)(manifestDir) === '.claude-plugin') {
                contentResults = await (0, validatePlugin_js_1.validatePluginContents)((0, path_1.dirname)(manifestDir));
                for (const r of contentResults) {
                    // biome-ignore lint/suspicious/noConsole:: intentional console output
                    console.log(`Validating ${r.fileType}: ${r.filePath}\n`);
                    printValidationResult(r);
                }
            }
        }
        const allSuccess = result.success && contentResults.every(r => r.success);
        const hasWarnings = result.warnings.length > 0 ||
            contentResults.some(r => r.warnings.length > 0);
        if (allSuccess) {
            (0, exit_js_1.cliOk)(hasWarnings
                ? `${figures_1.default.tick} Validation passed with warnings`
                : `${figures_1.default.tick} Validation passed`);
        }
        else {
            // biome-ignore lint/suspicious/noConsole:: intentional console output
            console.log(`${figures_1.default.cross} Validation failed`);
            process.exit(1);
        }
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.error(`${figures_1.default.cross} Unexpected error during validation: ${(0, errors_js_1.errorMessage)(error)}`);
        process.exit(2);
    }
}
// plugin list (lines 5217–5416)
async function pluginListHandler(options) {
    if (options.cowork)
        (0, state_js_1.setUseCoworkPlugins)(true);
    (0, index_js_1.logEvent)('tengu_plugin_list_command', {});
    const installedData = (0, installedPluginsManager_js_1.loadInstalledPluginsV2)();
    const { getPluginEditableScopes } = await Promise.resolve().then(() => __importStar(require('../../utils/plugins/pluginStartupCheck.js')));
    const enabledPlugins = getPluginEditableScopes();
    const pluginIds = Object.keys(installedData.plugins);
    // Load all plugins once. The JSON and human paths both need:
    //  - loadErrors (to show load failures per plugin)
    //  - inline plugins (session-only via --plugin-dir, source='name@inline')
    //    which are NOT in installedData.plugins (V2 bookkeeping) — they must
    //    be surfaced separately or `plugin list` silently ignores --plugin-dir.
    const { enabled: loadedEnabled, disabled: loadedDisabled, errors: loadErrors, } = await (0, pluginLoader_js_1.loadAllPlugins)();
    const allLoadedPlugins = [...loadedEnabled, ...loadedDisabled];
    const inlinePlugins = allLoadedPlugins.filter(p => p.source.endsWith('@inline'));
    // Path-level inline failures (dir doesn't exist, parse error before
    // manifest is read) use source='inline[N]'. Plugin-level errors after
    // manifest read use source='name@inline'. Collect both for the session
    // section — these are otherwise invisible since they have no pluginId.
    const inlineLoadErrors = loadErrors.filter(e => e.source.endsWith('@inline') || e.source.startsWith('inline['));
    if (options.json) {
        // Create a map of plugin source to loaded plugin for quick lookup
        const loadedPluginMap = new Map(allLoadedPlugins.map(p => [p.source, p]));
        const plugins = [];
        for (const pluginId of pluginIds.sort()) {
            const installations = installedData.plugins[pluginId];
            if (!installations || installations.length === 0)
                continue;
            // Find loading errors for this plugin
            const pluginName = (0, pluginIdentifier_js_1.parsePluginIdentifier)(pluginId).name;
            const pluginErrors = loadErrors
                .filter(e => e.source === pluginId || ('plugin' in e && e.plugin === pluginName))
                .map(plugin_js_1.getPluginErrorMessage);
            for (const installation of installations) {
                // Try to find the loaded plugin to get MCP servers
                const loadedPlugin = loadedPluginMap.get(pluginId);
                let mcpServers;
                if (loadedPlugin) {
                    // Load MCP servers if not already cached
                    const servers = loadedPlugin.mcpServers ||
                        (await (0, mcpPluginIntegration_js_1.loadPluginMcpServers)(loadedPlugin));
                    if (servers && Object.keys(servers).length > 0) {
                        mcpServers = servers;
                    }
                }
                plugins.push({
                    id: pluginId,
                    version: installation.version || 'unknown',
                    scope: installation.scope,
                    enabled: enabledPlugins.has(pluginId),
                    installPath: installation.installPath,
                    installedAt: installation.installedAt,
                    lastUpdated: installation.lastUpdated,
                    projectPath: installation.projectPath,
                    mcpServers,
                    errors: pluginErrors.length > 0 ? pluginErrors : undefined,
                });
            }
        }
        // Session-only plugins: scope='session', no install metadata.
        // Filter from inlineLoadErrors (not loadErrors) so an installed plugin
        // with the same manifest name doesn't cross-contaminate via e.plugin.
        // The e.plugin fallback catches the dirName≠manifestName case:
        // createPluginFromPath tags errors with `${dirName}@inline` but
        // plugin.source is reassigned to `${manifest.name}@inline` afterward
        // (pluginLoader.ts loadInlinePlugins), so e.source !== p.source when
        // a dev checkout dir like ~/code/my-fork/ has manifest name 'cool-plugin'.
        for (const p of inlinePlugins) {
            const servers = p.mcpServers || (await (0, mcpPluginIntegration_js_1.loadPluginMcpServers)(p));
            const pErrors = inlineLoadErrors
                .filter(e => e.source === p.source || ('plugin' in e && e.plugin === p.name))
                .map(plugin_js_1.getPluginErrorMessage);
            plugins.push({
                id: p.source,
                version: p.manifest.version ?? 'unknown',
                scope: 'session',
                enabled: p.enabled !== false,
                installPath: p.path,
                mcpServers: servers && Object.keys(servers).length > 0 ? servers : undefined,
                errors: pErrors.length > 0 ? pErrors : undefined,
            });
        }
        // Path-level inline failures (--plugin-dir /nonexistent): no LoadedPlugin
        // exists so the loop above can't surface them. Mirror the human-path
        // handling so JSON consumers see the failure instead of silent omission.
        for (const e of inlineLoadErrors.filter(e => e.source.startsWith('inline['))) {
            plugins.push({
                id: e.source,
                version: 'unknown',
                scope: 'session',
                enabled: false,
                installPath: 'path' in e ? e.path : '',
                errors: [(0, plugin_js_1.getPluginErrorMessage)(e)],
            });
        }
        // If --available is set, also load available plugins from marketplaces
        if (options.available) {
            const available = [];
            try {
                const [config, installCounts] = await Promise.all([
                    (0, marketplaceManager_js_1.loadKnownMarketplacesConfig)(),
                    (0, installCounts_js_1.getInstallCounts)(),
                ]);
                const { marketplaces } = await (0, marketplaceHelpers_js_1.loadMarketplacesWithGracefulDegradation)(config);
                for (const { name: marketplaceName, data: marketplace, } of marketplaces) {
                    if (marketplace) {
                        for (const entry of marketplace.plugins) {
                            const pluginId = (0, marketplaceHelpers_js_1.createPluginId)(entry.name, marketplaceName);
                            // Only include plugins that are not already installed
                            if (!(0, installedPluginsManager_js_1.isPluginInstalled)(pluginId)) {
                                available.push({
                                    pluginId,
                                    name: entry.name,
                                    description: entry.description,
                                    marketplaceName,
                                    version: entry.version,
                                    source: entry.source,
                                    installCount: installCounts?.get(pluginId),
                                });
                            }
                        }
                    }
                }
            }
            catch {
                // Silently ignore marketplace loading errors
            }
            (0, exit_js_1.cliOk)((0, slowOperations_js_1.jsonStringify)({ installed: plugins, available }, null, 2));
        }
        else {
            (0, exit_js_1.cliOk)((0, slowOperations_js_1.jsonStringify)(plugins, null, 2));
        }
    }
    if (pluginIds.length === 0 && inlinePlugins.length === 0) {
        // inlineLoadErrors can exist with zero inline plugins (e.g. --plugin-dir
        // points at a nonexistent path). Don't early-exit over them — fall
        // through to the session section so the failure is visible.
        if (inlineLoadErrors.length === 0) {
            (0, exit_js_1.cliOk)('No plugins installed. Use `claude plugin install` to install a plugin.');
        }
    }
    if (pluginIds.length > 0) {
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.log('Installed plugins:\n');
    }
    for (const pluginId of pluginIds.sort()) {
        const installations = installedData.plugins[pluginId];
        if (!installations || installations.length === 0)
            continue;
        // Find loading errors for this plugin
        const pluginName = (0, pluginIdentifier_js_1.parsePluginIdentifier)(pluginId).name;
        const pluginErrors = loadErrors.filter(e => e.source === pluginId || ('plugin' in e && e.plugin === pluginName));
        for (const installation of installations) {
            const isEnabled = enabledPlugins.has(pluginId);
            const status = pluginErrors.length > 0
                ? `${figures_1.default.cross} failed to load`
                : isEnabled
                    ? `${figures_1.default.tick} enabled`
                    : `${figures_1.default.cross} disabled`;
            const version = installation.version || 'unknown';
            const scope = installation.scope;
            // biome-ignore lint/suspicious/noConsole:: intentional console output
            console.log(`  ${figures_1.default.pointer} ${pluginId}`);
            // biome-ignore lint/suspicious/noConsole:: intentional console output
            console.log(`    Version: ${version}`);
            // biome-ignore lint/suspicious/noConsole:: intentional console output
            console.log(`    Scope: ${scope}`);
            // biome-ignore lint/suspicious/noConsole:: intentional console output
            console.log(`    Status: ${status}`);
            for (const error of pluginErrors) {
                // biome-ignore lint/suspicious/noConsole:: intentional console output
                console.log(`    Error: ${(0, plugin_js_1.getPluginErrorMessage)(error)}`);
            }
            // biome-ignore lint/suspicious/noConsole:: intentional console output
            console.log('');
        }
    }
    if (inlinePlugins.length > 0 || inlineLoadErrors.length > 0) {
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.log('Session-only plugins (--plugin-dir):\n');
        for (const p of inlinePlugins) {
            // Same dirName≠manifestName fallback as the JSON path above — error
            // sources use the dir basename but p.source uses the manifest name.
            const pErrors = inlineLoadErrors.filter(e => e.source === p.source || ('plugin' in e && e.plugin === p.name));
            const status = pErrors.length > 0
                ? `${figures_1.default.cross} loaded with errors`
                : `${figures_1.default.tick} loaded`;
            // biome-ignore lint/suspicious/noConsole:: intentional console output
            console.log(`  ${figures_1.default.pointer} ${p.source}`);
            // biome-ignore lint/suspicious/noConsole:: intentional console output
            console.log(`    Version: ${p.manifest.version ?? 'unknown'}`);
            // biome-ignore lint/suspicious/noConsole:: intentional console output
            console.log(`    Path: ${p.path}`);
            // biome-ignore lint/suspicious/noConsole:: intentional console output
            console.log(`    Status: ${status}`);
            for (const e of pErrors) {
                // biome-ignore lint/suspicious/noConsole:: intentional console output
                console.log(`    Error: ${(0, plugin_js_1.getPluginErrorMessage)(e)}`);
            }
            // biome-ignore lint/suspicious/noConsole:: intentional console output
            console.log('');
        }
        // Path-level failures: no LoadedPlugin object exists. Show them so
        // `--plugin-dir /typo` doesn't just silently produce nothing.
        for (const e of inlineLoadErrors.filter(e => e.source.startsWith('inline['))) {
            // biome-ignore lint/suspicious/noConsole:: intentional console output
            console.log(`  ${figures_1.default.pointer} ${e.source}: ${figures_1.default.cross} ${(0, plugin_js_1.getPluginErrorMessage)(e)}\n`);
        }
    }
    (0, exit_js_1.cliOk)();
}
// marketplace add (lines 5433–5487)
async function marketplaceAddHandler(source, options) {
    if (options.cowork)
        (0, state_js_1.setUseCoworkPlugins)(true);
    try {
        const parsed = await (0, parseMarketplaceInput_js_1.parseMarketplaceInput)(source);
        if (!parsed) {
            (0, exit_js_1.cliError)(`${figures_1.default.cross} Invalid marketplace source format. Try: owner/repo, https://..., or ./path`);
        }
        if ('error' in parsed) {
            (0, exit_js_1.cliError)(`${figures_1.default.cross} ${parsed.error}`);
        }
        // Validate scope
        const scope = options.scope ?? 'user';
        if (scope !== 'user' && scope !== 'project' && scope !== 'local') {
            (0, exit_js_1.cliError)(`${figures_1.default.cross} Invalid scope '${scope}'. Use: user, project, or local`);
        }
        const settingSource = (0, pluginIdentifier_js_1.scopeToSettingSource)(scope);
        let marketplaceSource = parsed;
        if (options.sparse && options.sparse.length > 0) {
            if (marketplaceSource.source === 'github' ||
                marketplaceSource.source === 'git') {
                marketplaceSource = {
                    ...marketplaceSource,
                    sparsePaths: options.sparse,
                };
            }
            else {
                (0, exit_js_1.cliError)(`${figures_1.default.cross} --sparse is only supported for github and git marketplace sources (got: ${marketplaceSource.source})`);
            }
        }
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.log('Adding marketplace...');
        const { name, alreadyMaterialized, resolvedSource } = await (0, marketplaceManager_js_1.addMarketplaceSource)(marketplaceSource, message => {
            // biome-ignore lint/suspicious/noConsole:: intentional console output
            console.log(message);
        });
        // Write intent to settings at the requested scope
        (0, marketplaceManager_js_1.saveMarketplaceToSettings)(name, { source: resolvedSource }, settingSource);
        (0, cacheUtils_js_1.clearAllCaches)();
        let sourceType = marketplaceSource.source;
        if (marketplaceSource.source === 'github') {
            sourceType =
                marketplaceSource.repo;
        }
        (0, index_js_1.logEvent)('tengu_marketplace_added', {
            source_type: sourceType,
        });
        (0, exit_js_1.cliOk)(alreadyMaterialized
            ? `${figures_1.default.tick} Marketplace '${name}' already on disk — declared in ${scope} settings`
            : `${figures_1.default.tick} Successfully added marketplace: ${name} (declared in ${scope} settings)`);
    }
    catch (error) {
        handleMarketplaceError(error, 'add marketplace');
    }
}
// marketplace list (lines 5497–5565)
async function marketplaceListHandler(options) {
    if (options.cowork)
        (0, state_js_1.setUseCoworkPlugins)(true);
    try {
        const config = await (0, marketplaceManager_js_1.loadKnownMarketplacesConfig)();
        const names = Object.keys(config);
        if (options.json) {
            const marketplaces = names.sort().map(name => {
                const marketplace = config[name];
                const source = marketplace?.source;
                return {
                    name,
                    source: source?.source,
                    ...(source?.source === 'github' && { repo: source.repo }),
                    ...(source?.source === 'git' && { url: source.url }),
                    ...(source?.source === 'url' && { url: source.url }),
                    ...(source?.source === 'directory' && { path: source.path }),
                    ...(source?.source === 'file' && { path: source.path }),
                    installLocation: marketplace?.installLocation,
                };
            });
            (0, exit_js_1.cliOk)((0, slowOperations_js_1.jsonStringify)(marketplaces, null, 2));
        }
        if (names.length === 0) {
            (0, exit_js_1.cliOk)('No marketplaces configured');
        }
        // biome-ignore lint/suspicious/noConsole:: intentional console output
        console.log('Configured marketplaces:\n');
        names.forEach(name => {
            const marketplace = config[name];
            // biome-ignore lint/suspicious/noConsole:: intentional console output
            console.log(`  ${figures_1.default.pointer} ${name}`);
            if (marketplace?.source) {
                const src = marketplace.source;
                if (src.source === 'github') {
                    // biome-ignore lint/suspicious/noConsole:: intentional console output
                    console.log(`    Source: GitHub (${src.repo})`);
                }
                else if (src.source === 'git') {
                    // biome-ignore lint/suspicious/noConsole:: intentional console output
                    console.log(`    Source: Git (${src.url})`);
                }
                else if (src.source === 'url') {
                    // biome-ignore lint/suspicious/noConsole:: intentional console output
                    console.log(`    Source: URL (${src.url})`);
                }
                else if (src.source === 'directory') {
                    // biome-ignore lint/suspicious/noConsole:: intentional console output
                    console.log(`    Source: Directory (${src.path})`);
                }
                else if (src.source === 'file') {
                    // biome-ignore lint/suspicious/noConsole:: intentional console output
                    console.log(`    Source: File (${src.path})`);
                }
            }
            // biome-ignore lint/suspicious/noConsole:: intentional console output
            console.log('');
        });
        (0, exit_js_1.cliOk)();
    }
    catch (error) {
        handleMarketplaceError(error, 'list marketplaces');
    }
}
// marketplace remove (lines 5576–5598)
async function marketplaceRemoveHandler(name, options) {
    if (options.cowork)
        (0, state_js_1.setUseCoworkPlugins)(true);
    try {
        await (0, marketplaceManager_js_1.removeMarketplaceSource)(name);
        (0, cacheUtils_js_1.clearAllCaches)();
        (0, index_js_1.logEvent)('tengu_marketplace_removed', {
            marketplace_name: name,
        });
        (0, exit_js_1.cliOk)(`${figures_1.default.tick} Successfully removed marketplace: ${name}`);
    }
    catch (error) {
        handleMarketplaceError(error, 'remove marketplace');
    }
}
// marketplace update (lines 5609–5672)
async function marketplaceUpdateHandler(name, options) {
    if (options.cowork)
        (0, state_js_1.setUseCoworkPlugins)(true);
    try {
        if (name) {
            // biome-ignore lint/suspicious/noConsole:: intentional console output
            console.log(`Updating marketplace: ${name}...`);
            await (0, marketplaceManager_js_1.refreshMarketplace)(name, message => {
                // biome-ignore lint/suspicious/noConsole:: intentional console output
                console.log(message);
            });
            (0, cacheUtils_js_1.clearAllCaches)();
            (0, index_js_1.logEvent)('tengu_marketplace_updated', {
                marketplace_name: name,
            });
            (0, exit_js_1.cliOk)(`${figures_1.default.tick} Successfully updated marketplace: ${name}`);
        }
        else {
            const config = await (0, marketplaceManager_js_1.loadKnownMarketplacesConfig)();
            const marketplaceNames = Object.keys(config);
            if (marketplaceNames.length === 0) {
                (0, exit_js_1.cliOk)('No marketplaces configured');
            }
            // biome-ignore lint/suspicious/noConsole:: intentional console output
            console.log(`Updating ${marketplaceNames.length} marketplace(s)...`);
            await (0, marketplaceManager_js_1.refreshAllMarketplaces)();
            (0, cacheUtils_js_1.clearAllCaches)();
            (0, index_js_1.logEvent)('tengu_marketplace_updated_all', {
                count: marketplaceNames.length,
            });
            (0, exit_js_1.cliOk)(`${figures_1.default.tick} Successfully updated ${marketplaceNames.length} marketplace(s)`);
        }
    }
    catch (error) {
        handleMarketplaceError(error, 'update marketplace(s)');
    }
}
// plugin install (lines 5690–5721)
async function pluginInstallHandler(plugin, options) {
    if (options.cowork)
        (0, state_js_1.setUseCoworkPlugins)(true);
    const scope = options.scope || 'user';
    if (options.cowork && scope !== 'user') {
        (0, exit_js_1.cliError)('--cowork can only be used with user scope');
    }
    if (!pluginCliCommands_js_1.VALID_INSTALLABLE_SCOPES.includes(scope)) {
        (0, exit_js_1.cliError)(`Invalid scope: ${scope}. Must be one of: ${pluginCliCommands_js_1.VALID_INSTALLABLE_SCOPES.join(', ')}.`);
    }
    // _PROTO_* routes to PII-tagged plugin_name/marketplace_name BQ columns.
    // Unredacted plugin arg was previously logged to general-access
    // additional_metadata for all users — dropped in favor of the privileged
    // column route. marketplace may be undefined (fires before resolution).
    const { name, marketplace } = (0, pluginIdentifier_js_1.parsePluginIdentifier)(plugin);
    (0, index_js_1.logEvent)('tengu_plugin_install_command', {
        _PROTO_plugin_name: name,
        ...(marketplace && {
            _PROTO_marketplace_name: marketplace,
        }),
        scope: scope,
    });
    await (0, pluginCliCommands_js_1.installPlugin)(plugin, scope);
}
// plugin uninstall (lines 5738–5769)
async function pluginUninstallHandler(plugin, options) {
    if (options.cowork)
        (0, state_js_1.setUseCoworkPlugins)(true);
    const scope = options.scope || 'user';
    if (options.cowork && scope !== 'user') {
        (0, exit_js_1.cliError)('--cowork can only be used with user scope');
    }
    if (!pluginCliCommands_js_1.VALID_INSTALLABLE_SCOPES.includes(scope)) {
        (0, exit_js_1.cliError)(`Invalid scope: ${scope}. Must be one of: ${pluginCliCommands_js_1.VALID_INSTALLABLE_SCOPES.join(', ')}.`);
    }
    const { name, marketplace } = (0, pluginIdentifier_js_1.parsePluginIdentifier)(plugin);
    (0, index_js_1.logEvent)('tengu_plugin_uninstall_command', {
        _PROTO_plugin_name: name,
        ...(marketplace && {
            _PROTO_marketplace_name: marketplace,
        }),
        scope: scope,
    });
    await (0, pluginCliCommands_js_1.uninstallPlugin)(plugin, scope, options.keepData);
}
// plugin enable (lines 5783–5818)
async function pluginEnableHandler(plugin, options) {
    if (options.cowork)
        (0, state_js_1.setUseCoworkPlugins)(true);
    let scope;
    if (options.scope) {
        if (!pluginCliCommands_js_1.VALID_INSTALLABLE_SCOPES.includes(options.scope)) {
            (0, exit_js_1.cliError)(`Invalid scope "${options.scope}". Valid scopes: ${pluginCliCommands_js_1.VALID_INSTALLABLE_SCOPES.join(', ')}`);
        }
        scope = options.scope;
    }
    if (options.cowork && scope !== undefined && scope !== 'user') {
        (0, exit_js_1.cliError)('--cowork can only be used with user scope');
    }
    // --cowork always operates at user scope
    if (options.cowork && scope === undefined) {
        scope = 'user';
    }
    const { name, marketplace } = (0, pluginIdentifier_js_1.parsePluginIdentifier)(plugin);
    (0, index_js_1.logEvent)('tengu_plugin_enable_command', {
        _PROTO_plugin_name: name,
        ...(marketplace && {
            _PROTO_marketplace_name: marketplace,
        }),
        scope: (scope ??
            'auto'),
    });
    await (0, pluginCliCommands_js_1.enablePlugin)(plugin, scope);
}
// plugin disable (lines 5833–5902)
async function pluginDisableHandler(plugin, options) {
    if (options.all && plugin) {
        (0, exit_js_1.cliError)('Cannot use --all with a specific plugin');
    }
    if (!options.all && !plugin) {
        (0, exit_js_1.cliError)('Please specify a plugin name or use --all to disable all plugins');
    }
    if (options.cowork)
        (0, state_js_1.setUseCoworkPlugins)(true);
    if (options.all) {
        if (options.scope) {
            (0, exit_js_1.cliError)('Cannot use --scope with --all');
        }
        // No _PROTO_plugin_name here — --all disables all plugins.
        // Distinguishable from the specific-plugin branch by plugin_name IS NULL.
        (0, index_js_1.logEvent)('tengu_plugin_disable_command', {});
        await (0, pluginCliCommands_js_1.disableAllPlugins)();
        return;
    }
    let scope;
    if (options.scope) {
        if (!pluginCliCommands_js_1.VALID_INSTALLABLE_SCOPES.includes(options.scope)) {
            (0, exit_js_1.cliError)(`Invalid scope "${options.scope}". Valid scopes: ${pluginCliCommands_js_1.VALID_INSTALLABLE_SCOPES.join(', ')}`);
        }
        scope = options.scope;
    }
    if (options.cowork && scope !== undefined && scope !== 'user') {
        (0, exit_js_1.cliError)('--cowork can only be used with user scope');
    }
    // --cowork always operates at user scope
    if (options.cowork && scope === undefined) {
        scope = 'user';
    }
    const { name, marketplace } = (0, pluginIdentifier_js_1.parsePluginIdentifier)(plugin);
    (0, index_js_1.logEvent)('tengu_plugin_disable_command', {
        _PROTO_plugin_name: name,
        ...(marketplace && {
            _PROTO_marketplace_name: marketplace,
        }),
        scope: (scope ??
            'auto'),
    });
    await (0, pluginCliCommands_js_1.disablePlugin)(plugin, scope);
}
// plugin update (lines 5918–5948)
async function pluginUpdateHandler(plugin, options) {
    if (options.cowork)
        (0, state_js_1.setUseCoworkPlugins)(true);
    const { name, marketplace } = (0, pluginIdentifier_js_1.parsePluginIdentifier)(plugin);
    (0, index_js_1.logEvent)('tengu_plugin_update_command', {
        _PROTO_plugin_name: name,
        ...(marketplace && {
            _PROTO_marketplace_name: marketplace,
        }),
    });
    let scope = 'user';
    if (options.scope) {
        if (!pluginCliCommands_js_1.VALID_UPDATE_SCOPES.includes(options.scope)) {
            (0, exit_js_1.cliError)(`Invalid scope "${options.scope}". Valid scopes: ${pluginCliCommands_js_1.VALID_UPDATE_SCOPES.join(', ')}`);
        }
        scope = options.scope;
    }
    if (options.cowork && scope !== 'user') {
        (0, exit_js_1.cliError)('--cowork can only be used with user scope');
    }
    await (0, pluginCliCommands_js_1.updatePluginCli)(plugin, scope);
}
