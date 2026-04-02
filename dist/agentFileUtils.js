"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatAgentAsMarkdown = formatAgentAsMarkdown;
exports.getNewAgentFilePath = getNewAgentFilePath;
exports.getActualAgentFilePath = getActualAgentFilePath;
exports.getNewRelativeAgentFilePath = getNewRelativeAgentFilePath;
exports.getActualRelativeAgentFilePath = getActualRelativeAgentFilePath;
exports.saveAgentToFile = saveAgentToFile;
exports.updateAgentFile = updateAgentFile;
exports.deleteAgentFromFile = deleteAgentFromFile;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const managedPath_js_1 = require("src/utils/settings/managedPath.js");
const loadAgentsDir_js_1 = require("../../tools/AgentTool/loadAgentsDir.js");
const cwd_js_1 = require("../../utils/cwd.js");
const envUtils_js_1 = require("../../utils/envUtils.js");
const errors_js_1 = require("../../utils/errors.js");
const types_js_1 = require("./types.js");
/**
 * Formats agent data as markdown file content
 */
function formatAgentAsMarkdown(agentType, whenToUse, tools, systemPrompt, color, model, memory, effort) {
    // For YAML double-quoted strings, we need to escape:
    // - Backslashes: \ -> \\
    // - Double quotes: " -> \"
    // - Newlines: \n -> \\n (so yaml reads it as literal backslash-n, not newline)
    const escapedWhenToUse = whenToUse
        .replace(/\\/g, '\\\\') // Escape backslashes first
        .replace(/"/g, '\\"') // Escape double quotes
        .replace(/\n/g, '\\\\n'); // Escape newlines as \\n so yaml preserves them as \n
    // Omit tools field entirely when tools is undefined or ['*'] (all tools allowed)
    const isAllTools = tools === undefined || (tools.length === 1 && tools[0] === '*');
    const toolsLine = isAllTools ? '' : `\ntools: ${tools.join(', ')}`;
    const modelLine = model ? `\nmodel: ${model}` : '';
    const effortLine = effort !== undefined ? `\neffort: ${effort}` : '';
    const colorLine = color ? `\ncolor: ${color}` : '';
    const memoryLine = memory ? `\nmemory: ${memory}` : '';
    return `---
name: ${agentType}
description: "${escapedWhenToUse}"${toolsLine}${modelLine}${effortLine}${colorLine}${memoryLine}
---

${systemPrompt}
`;
}
/**
 * Gets the directory path for an agent location
 */
function getAgentDirectoryPath(location) {
    switch (location) {
        case 'flagSettings':
            throw new Error(`Cannot get directory path for ${location} agents`);
        case 'userSettings':
            return (0, path_1.join)((0, envUtils_js_1.getClaudeConfigHomeDir)(), types_js_1.AGENT_PATHS.AGENTS_DIR);
        case 'projectSettings':
            return (0, path_1.join)((0, cwd_js_1.getCwd)(), types_js_1.AGENT_PATHS.FOLDER_NAME, types_js_1.AGENT_PATHS.AGENTS_DIR);
        case 'policySettings':
            return (0, path_1.join)((0, managedPath_js_1.getManagedFilePath)(), types_js_1.AGENT_PATHS.FOLDER_NAME, types_js_1.AGENT_PATHS.AGENTS_DIR);
        case 'localSettings':
            return (0, path_1.join)((0, cwd_js_1.getCwd)(), types_js_1.AGENT_PATHS.FOLDER_NAME, types_js_1.AGENT_PATHS.AGENTS_DIR);
    }
}
function getRelativeAgentDirectoryPath(location) {
    switch (location) {
        case 'projectSettings':
            return (0, path_1.join)('.', types_js_1.AGENT_PATHS.FOLDER_NAME, types_js_1.AGENT_PATHS.AGENTS_DIR);
        default:
            return getAgentDirectoryPath(location);
    }
}
/**
 * Gets the file path for a new agent based on its name
 * Used when creating new agent files
 */
function getNewAgentFilePath(agent) {
    const dirPath = getAgentDirectoryPath(agent.source);
    return (0, path_1.join)(dirPath, `${agent.agentType}.md`);
}
/**
 * Gets the actual file path for an agent (handles filename vs agentType mismatch)
 * Always use this for existing agents to get their real file location
 */
function getActualAgentFilePath(agent) {
    if (agent.source === 'built-in') {
        return 'Built-in';
    }
    if (agent.source === 'plugin') {
        throw new Error('Cannot get file path for plugin agents');
    }
    const dirPath = getAgentDirectoryPath(agent.source);
    const filename = agent.filename || agent.agentType;
    return (0, path_1.join)(dirPath, `${filename}.md`);
}
/**
 * Gets the relative file path for a new agent based on its name
 * Used for displaying where new agent files will be created
 */
function getNewRelativeAgentFilePath(agent) {
    if (agent.source === 'built-in') {
        return 'Built-in';
    }
    const dirPath = getRelativeAgentDirectoryPath(agent.source);
    return (0, path_1.join)(dirPath, `${agent.agentType}.md`);
}
/**
 * Gets the actual relative file path for an agent (handles filename vs agentType mismatch)
 */
function getActualRelativeAgentFilePath(agent) {
    if ((0, loadAgentsDir_js_1.isBuiltInAgent)(agent)) {
        return 'Built-in';
    }
    if ((0, loadAgentsDir_js_1.isPluginAgent)(agent)) {
        return `Plugin: ${agent.plugin || 'Unknown'}`;
    }
    if (agent.source === 'flagSettings') {
        return 'CLI argument';
    }
    const dirPath = getRelativeAgentDirectoryPath(agent.source);
    const filename = agent.filename || agent.agentType;
    return (0, path_1.join)(dirPath, `${filename}.md`);
}
/**
 * Ensures the directory for an agent location exists
 */
async function ensureAgentDirectoryExists(source) {
    const dirPath = getAgentDirectoryPath(source);
    await (0, promises_1.mkdir)(dirPath, { recursive: true });
    return dirPath;
}
/**
 * Saves an agent to the filesystem
 * @param checkExists - If true, throws error if file already exists
 */
async function saveAgentToFile(source, agentType, whenToUse, tools, systemPrompt, checkExists = true, color, model, memory, effort) {
    if (source === 'built-in') {
        throw new Error('Cannot save built-in agents');
    }
    await ensureAgentDirectoryExists(source);
    const filePath = getNewAgentFilePath({ source, agentType });
    const content = formatAgentAsMarkdown(agentType, whenToUse, tools, systemPrompt, color, model, memory, effort);
    try {
        await writeFileAndFlush(filePath, content, checkExists ? 'wx' : 'w');
    }
    catch (e) {
        if ((0, errors_js_1.getErrnoCode)(e) === 'EEXIST') {
            throw new Error(`Agent file already exists: ${filePath}`);
        }
        throw e;
    }
}
/**
 * Updates an existing agent file
 */
async function updateAgentFile(agent, newWhenToUse, newTools, newSystemPrompt, newColor, newModel, newMemory, newEffort) {
    if (agent.source === 'built-in') {
        throw new Error('Cannot update built-in agents');
    }
    const filePath = getActualAgentFilePath(agent);
    const content = formatAgentAsMarkdown(agent.agentType, newWhenToUse, newTools, newSystemPrompt, newColor, newModel, newMemory, newEffort);
    await writeFileAndFlush(filePath, content);
}
/**
 * Deletes an agent file
 */
async function deleteAgentFromFile(agent) {
    if (agent.source === 'built-in') {
        throw new Error('Cannot delete built-in agents');
    }
    const filePath = getActualAgentFilePath(agent);
    try {
        await (0, promises_1.unlink)(filePath);
    }
    catch (e) {
        const code = (0, errors_js_1.getErrnoCode)(e);
        if (code !== 'ENOENT') {
            throw e;
        }
    }
}
async function writeFileAndFlush(filePath, content, flag = 'w') {
    const handle = await (0, promises_1.open)(filePath, flag);
    try {
        await handle.writeFile(content, { encoding: 'utf-8' });
        await handle.datasync();
    }
    finally {
        await handle.close();
    }
}
