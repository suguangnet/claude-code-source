"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPluginLspServers = loadPluginLspServers;
exports.resolvePluginLspEnvironment = resolvePluginLspEnvironment;
exports.addPluginScopeToLspServers = addPluginScopeToLspServers;
exports.getPluginLspServers = getPluginLspServers;
exports.extractLspServersFromPlugins = extractLspServersFromPlugins;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const v4_1 = require("zod/v4");
const envExpansion_js_1 = require("../../services/mcp/envExpansion.js");
const debug_js_1 = require("../debug.js");
const errors_js_1 = require("../errors.js");
const log_js_1 = require("../log.js");
const slowOperations_js_1 = require("../slowOperations.js");
const pluginDirectories_js_1 = require("./pluginDirectories.js");
const pluginOptionsStorage_js_1 = require("./pluginOptionsStorage.js");
const schemas_js_1 = require("./schemas.js");
/**
 * Validate that a resolved path stays within the plugin directory.
 * Prevents path traversal attacks via .. or absolute paths.
 */
function validatePathWithinPlugin(pluginPath, relativePath) {
    // Resolve both paths to absolute paths
    const resolvedPluginPath = (0, path_1.resolve)(pluginPath);
    const resolvedFilePath = (0, path_1.resolve)(pluginPath, relativePath);
    // Check if the resolved file path is within the plugin directory
    const rel = (0, path_1.relative)(resolvedPluginPath, resolvedFilePath);
    // If relative path starts with .. or is absolute, it's outside the plugin dir
    if (rel.startsWith('..') || (0, path_1.resolve)(rel) === rel) {
        return null;
    }
    return resolvedFilePath;
}
/**
 * Load LSP server configurations from a plugin.
 * Checks for:
 * 1. .lsp.json file in plugin directory
 * 2. manifest.lspServers field
 *
 * @param plugin - The loaded plugin
 * @param errors - Array to collect any errors encountered
 * @returns Record of server name to config, or undefined if no servers
 */
async function loadPluginLspServers(plugin, errors = []) {
    const servers = {};
    // 1. Check for .lsp.json file in plugin directory
    const lspJsonPath = (0, path_1.join)(plugin.path, '.lsp.json');
    try {
        const content = await (0, promises_1.readFile)(lspJsonPath, 'utf-8');
        const parsed = (0, slowOperations_js_1.jsonParse)(content);
        const result = v4_1.z
            .record(v4_1.z.string(), (0, schemas_js_1.LspServerConfigSchema)())
            .safeParse(parsed);
        if (result.success) {
            Object.assign(servers, result.data);
        }
        else {
            const errorMsg = `LSP config validation failed for .lsp.json in plugin ${plugin.name}: ${result.error.message}`;
            (0, log_js_1.logError)(new Error(errorMsg));
            errors.push({
                type: 'lsp-config-invalid',
                plugin: plugin.name,
                serverName: '.lsp.json',
                validationError: result.error.message,
                source: 'plugin',
            });
        }
    }
    catch (error) {
        // .lsp.json is optional, ignore if it doesn't exist
        if (!(0, errors_js_1.isENOENT)(error)) {
            const _errorMsg = error instanceof Error
                ? `Failed to read/parse .lsp.json in plugin ${plugin.name}: ${error.message}`
                : `Failed to read/parse .lsp.json file in plugin ${plugin.name}`;
            (0, log_js_1.logError)((0, errors_js_1.toError)(error));
            errors.push({
                type: 'lsp-config-invalid',
                plugin: plugin.name,
                serverName: '.lsp.json',
                validationError: error instanceof Error
                    ? `Failed to parse JSON: ${error.message}`
                    : 'Failed to parse JSON file',
                source: 'plugin',
            });
        }
    }
    // 2. Check manifest.lspServers field
    if (plugin.manifest.lspServers) {
        const manifestServers = await loadLspServersFromManifest(plugin.manifest.lspServers, plugin.path, plugin.name, errors);
        if (manifestServers) {
            Object.assign(servers, manifestServers);
        }
    }
    return Object.keys(servers).length > 0 ? servers : undefined;
}
/**
 * Load LSP servers from manifest declaration (handles multiple formats).
 */
async function loadLspServersFromManifest(declaration, pluginPath, pluginName, errors) {
    const servers = {};
    // Normalize to array
    const declarations = Array.isArray(declaration) ? declaration : [declaration];
    for (const decl of declarations) {
        if (typeof decl === 'string') {
            // Validate path to prevent directory traversal
            const validatedPath = validatePathWithinPlugin(pluginPath, decl);
            if (!validatedPath) {
                const securityMsg = `Security: Path traversal attempt blocked in plugin ${pluginName}: ${decl}`;
                (0, log_js_1.logError)(new Error(securityMsg));
                (0, debug_js_1.logForDebugging)(securityMsg, { level: 'warn' });
                errors.push({
                    type: 'lsp-config-invalid',
                    plugin: pluginName,
                    serverName: decl,
                    validationError: 'Invalid path: must be relative and within plugin directory',
                    source: 'plugin',
                });
                continue;
            }
            // Load from file
            try {
                const content = await (0, promises_1.readFile)(validatedPath, 'utf-8');
                const parsed = (0, slowOperations_js_1.jsonParse)(content);
                const result = v4_1.z
                    .record(v4_1.z.string(), (0, schemas_js_1.LspServerConfigSchema)())
                    .safeParse(parsed);
                if (result.success) {
                    Object.assign(servers, result.data);
                }
                else {
                    const errorMsg = `LSP config validation failed for ${decl} in plugin ${pluginName}: ${result.error.message}`;
                    (0, log_js_1.logError)(new Error(errorMsg));
                    errors.push({
                        type: 'lsp-config-invalid',
                        plugin: pluginName,
                        serverName: decl,
                        validationError: result.error.message,
                        source: 'plugin',
                    });
                }
            }
            catch (error) {
                const _errorMsg = error instanceof Error
                    ? `Failed to read/parse LSP config from ${decl} in plugin ${pluginName}: ${error.message}`
                    : `Failed to read/parse LSP config file ${decl} in plugin ${pluginName}`;
                (0, log_js_1.logError)((0, errors_js_1.toError)(error));
                errors.push({
                    type: 'lsp-config-invalid',
                    plugin: pluginName,
                    serverName: decl,
                    validationError: error instanceof Error
                        ? `Failed to parse JSON: ${error.message}`
                        : 'Failed to parse JSON file',
                    source: 'plugin',
                });
            }
        }
        else {
            // Inline configs
            for (const [serverName, config] of Object.entries(decl)) {
                const result = (0, schemas_js_1.LspServerConfigSchema)().safeParse(config);
                if (result.success) {
                    servers[serverName] = result.data;
                }
                else {
                    const errorMsg = `LSP config validation failed for inline server "${serverName}" in plugin ${pluginName}: ${result.error.message}`;
                    (0, log_js_1.logError)(new Error(errorMsg));
                    errors.push({
                        type: 'lsp-config-invalid',
                        plugin: pluginName,
                        serverName,
                        validationError: result.error.message,
                        source: 'plugin',
                    });
                }
            }
        }
    }
    return Object.keys(servers).length > 0 ? servers : undefined;
}
/**
 * Resolve environment variables for plugin LSP servers.
 * Handles ${CLAUDE_PLUGIN_ROOT}, ${user_config.X}, and general ${VAR}
 * substitution. Tracks missing environment variables for error reporting.
 */
function resolvePluginLspEnvironment(config, plugin, userConfig, _errors) {
    const allMissingVars = [];
    const resolveValue = (value) => {
        // First substitute plugin-specific variables
        let resolved = (0, pluginOptionsStorage_js_1.substitutePluginVariables)(value, plugin);
        // Then substitute user config variables if provided
        if (userConfig) {
            resolved = (0, pluginOptionsStorage_js_1.substituteUserConfigVariables)(resolved, userConfig);
        }
        // Finally expand general environment variables
        const { expanded, missingVars } = (0, envExpansion_js_1.expandEnvVarsInString)(resolved);
        allMissingVars.push(...missingVars);
        return expanded;
    };
    const resolved = { ...config };
    // Resolve command path
    if (resolved.command) {
        resolved.command = resolveValue(resolved.command);
    }
    // Resolve args
    if (resolved.args) {
        resolved.args = resolved.args.map(arg => resolveValue(arg));
    }
    // Resolve environment variables and add CLAUDE_PLUGIN_ROOT / CLAUDE_PLUGIN_DATA
    const resolvedEnv = {
        CLAUDE_PLUGIN_ROOT: plugin.path,
        CLAUDE_PLUGIN_DATA: (0, pluginDirectories_js_1.getPluginDataDir)(plugin.source),
        ...(resolved.env || {}),
    };
    for (const [key, value] of Object.entries(resolvedEnv)) {
        if (key !== 'CLAUDE_PLUGIN_ROOT' && key !== 'CLAUDE_PLUGIN_DATA') {
            resolvedEnv[key] = resolveValue(value);
        }
    }
    resolved.env = resolvedEnv;
    // Resolve workspaceFolder if present
    if (resolved.workspaceFolder) {
        resolved.workspaceFolder = resolveValue(resolved.workspaceFolder);
    }
    // Log missing variables if any were found
    if (allMissingVars.length > 0) {
        const uniqueMissingVars = [...new Set(allMissingVars)];
        const warnMsg = `Missing environment variables in plugin LSP config: ${uniqueMissingVars.join(', ')}`;
        (0, log_js_1.logError)(new Error(warnMsg));
        (0, debug_js_1.logForDebugging)(warnMsg, { level: 'warn' });
    }
    return resolved;
}
/**
 * Add plugin scope to LSP server configs
 * This adds a prefix to server names to avoid conflicts between plugins
 */
function addPluginScopeToLspServers(servers, pluginName) {
    const scopedServers = {};
    for (const [name, config] of Object.entries(servers)) {
        // Add plugin prefix to server name to avoid conflicts
        const scopedName = `plugin:${pluginName}:${name}`;
        scopedServers[scopedName] = {
            ...config,
            scope: 'dynamic', // Use dynamic scope for plugin servers
            source: pluginName,
        };
    }
    return scopedServers;
}
/**
 * Get LSP servers from a specific plugin with environment variable resolution and scoping
 * This function is called when the LSP servers need to be activated and ensures they have
 * the proper environment variables and scope applied
 */
async function getPluginLspServers(plugin, errors = []) {
    if (!plugin.enabled) {
        return undefined;
    }
    // Use cached servers if available
    const servers = plugin.lspServers || (await loadPluginLspServers(plugin, errors));
    if (!servers) {
        return undefined;
    }
    // Resolve environment variables. Top-level manifest.userConfig values
    // become available as ${user_config.KEY} in LSP command/args/env.
    // Gate on manifest.userConfig — same rationale as buildMcpUserConfig:
    // loadPluginOptions always returns {} so without this guard userConfig is
    // truthy for every plugin and substituteUserConfigVariables throws on any
    // unresolved ${user_config.X}. Also skips unneeded keychain reads.
    const userConfig = plugin.manifest.userConfig
        ? (0, pluginOptionsStorage_js_1.loadPluginOptions)((0, pluginOptionsStorage_js_1.getPluginStorageId)(plugin))
        : undefined;
    const resolvedServers = {};
    for (const [name, config] of Object.entries(servers)) {
        resolvedServers[name] = resolvePluginLspEnvironment(config, plugin, userConfig, errors);
    }
    // Add plugin scope
    return addPluginScopeToLspServers(resolvedServers, plugin.name);
}
/**
 * Extract all LSP servers from loaded plugins
 */
async function extractLspServersFromPlugins(plugins, errors = []) {
    const allServers = {};
    for (const plugin of plugins) {
        if (!plugin.enabled)
            continue;
        const servers = await loadPluginLspServers(plugin, errors);
        if (servers) {
            const scopedServers = addPluginScopeToLspServers(servers, plugin.name);
            Object.assign(allServers, scopedServers);
            // Store the servers on the plugin for caching
            plugin.lspServers = servers;
            (0, debug_js_1.logForDebugging)(`Loaded ${Object.keys(servers).length} LSP servers from plugin ${plugin.name}`);
        }
    }
    return allServers;
}
