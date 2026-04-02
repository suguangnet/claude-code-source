"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClaudeDesktopConfigPath = getClaudeDesktopConfigPath;
exports.readClaudeDesktopMcpServers = readClaudeDesktopMcpServers;
const promises_1 = require("fs/promises");
const os_1 = require("os");
const path_1 = require("path");
const types_js_1 = require("../services/mcp/types.js");
const errors_js_1 = require("./errors.js");
const json_js_1 = require("./json.js");
const log_js_1 = require("./log.js");
const platform_js_1 = require("./platform.js");
async function getClaudeDesktopConfigPath() {
    const platform = (0, platform_js_1.getPlatform)();
    if (!platform_js_1.SUPPORTED_PLATFORMS.includes(platform)) {
        throw new Error(`Unsupported platform: ${platform} - Claude Desktop integration only works on macOS and WSL.`);
    }
    if (platform === 'macos') {
        return (0, path_1.join)((0, os_1.homedir)(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    }
    // First, try using USERPROFILE environment variable if available
    const windowsHome = process.env.USERPROFILE
        ? process.env.USERPROFILE.replace(/\\/g, '/') // Convert Windows backslashes to forward slashes
        : null;
    if (windowsHome) {
        // Remove drive letter and convert to WSL path format
        const wslPath = windowsHome.replace(/^[A-Z]:/, '');
        const configPath = `/mnt/c${wslPath}/AppData/Roaming/Claude/claude_desktop_config.json`;
        // Check if the file exists
        try {
            await (0, promises_1.stat)(configPath);
            return configPath;
        }
        catch {
            // File doesn't exist, continue
        }
    }
    // Alternative approach - try to construct path based on typical Windows user location
    try {
        // List the /mnt/c/Users directory to find potential user directories
        const usersDir = '/mnt/c/Users';
        try {
            const userDirs = await (0, promises_1.readdir)(usersDir, { withFileTypes: true });
            // Look for Claude Desktop config in each user directory
            for (const user of userDirs) {
                if (user.name === 'Public' ||
                    user.name === 'Default' ||
                    user.name === 'Default User' ||
                    user.name === 'All Users') {
                    continue; // Skip system directories
                }
                const potentialConfigPath = (0, path_1.join)(usersDir, user.name, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
                try {
                    await (0, promises_1.stat)(potentialConfigPath);
                    return potentialConfigPath;
                }
                catch {
                    // File doesn't exist, continue
                }
            }
        }
        catch {
            // usersDir doesn't exist or can't be read
        }
    }
    catch (dirError) {
        (0, log_js_1.logError)(dirError);
    }
    throw new Error('Could not find Claude Desktop config file in Windows. Make sure Claude Desktop is installed on Windows.');
}
async function readClaudeDesktopMcpServers() {
    if (!platform_js_1.SUPPORTED_PLATFORMS.includes((0, platform_js_1.getPlatform)())) {
        throw new Error('Unsupported platform - Claude Desktop integration only works on macOS and WSL.');
    }
    try {
        const configPath = await getClaudeDesktopConfigPath();
        let configContent;
        try {
            configContent = await (0, promises_1.readFile)(configPath, { encoding: 'utf8' });
        }
        catch (e) {
            const code = (0, errors_js_1.getErrnoCode)(e);
            if (code === 'ENOENT') {
                return {};
            }
            throw e;
        }
        const config = (0, json_js_1.safeParseJSON)(configContent);
        if (!config || typeof config !== 'object') {
            return {};
        }
        const mcpServers = config.mcpServers;
        if (!mcpServers || typeof mcpServers !== 'object') {
            return {};
        }
        const servers = {};
        for (const [name, serverConfig] of Object.entries(mcpServers)) {
            if (!serverConfig || typeof serverConfig !== 'object') {
                continue;
            }
            const result = (0, types_js_1.McpStdioServerConfigSchema)().safeParse(serverConfig);
            if (result.success) {
                servers[name] = result.data;
            }
        }
        return servers;
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return {};
    }
}
