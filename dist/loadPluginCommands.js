"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPluginSkills = exports.getPluginCommands = void 0;
exports.clearPluginCommandCache = clearPluginCommandCache;
exports.clearPluginSkillsCache = clearPluginSkillsCache;
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const path_1 = require("path");
const state_js_1 = require("../../bootstrap/state.js");
const plugin_js_1 = require("../../types/plugin.js");
const argumentSubstitution_js_1 = require("../argumentSubstitution.js");
const debug_js_1 = require("../debug.js");
const effort_js_1 = require("../effort.js");
const envUtils_js_1 = require("../envUtils.js");
const errors_js_1 = require("../errors.js");
const frontmatterParser_js_1 = require("../frontmatterParser.js");
const fsOperations_js_1 = require("../fsOperations.js");
const markdownConfigLoader_js_1 = require("../markdownConfigLoader.js");
const model_js_1 = require("../model/model.js");
const promptShellExecution_js_1 = require("../promptShellExecution.js");
const pluginLoader_js_1 = require("./pluginLoader.js");
const pluginOptionsStorage_js_1 = require("./pluginOptionsStorage.js");
const walkPluginMarkdown_js_1 = require("./walkPluginMarkdown.js");
/**
 * Check if a file path is a skill file (SKILL.md)
 */
function isSkillFile(filePath) {
    return /^skill\.md$/i.test((0, path_1.basename)(filePath));
}
/**
 * Get command name from file path, handling both regular files and skills
 */
function getCommandNameFromFile(filePath, baseDir, pluginName) {
    const isSkill = isSkillFile(filePath);
    if (isSkill) {
        // For skills, use the parent directory name
        const skillDirectory = (0, path_1.dirname)(filePath);
        const parentOfSkillDir = (0, path_1.dirname)(skillDirectory);
        const commandBaseName = (0, path_1.basename)(skillDirectory);
        // Build namespace from parent of skill directory
        const relativePath = parentOfSkillDir.startsWith(baseDir)
            ? parentOfSkillDir.slice(baseDir.length).replace(/^\//, '')
            : '';
        const namespace = relativePath ? relativePath.split('/').join(':') : '';
        return namespace
            ? `${pluginName}:${namespace}:${commandBaseName}`
            : `${pluginName}:${commandBaseName}`;
    }
    else {
        // For regular files, use filename without .md
        const fileDirectory = (0, path_1.dirname)(filePath);
        const commandBaseName = (0, path_1.basename)(filePath).replace(/\.md$/, '');
        // Build namespace from file directory
        const relativePath = fileDirectory.startsWith(baseDir)
            ? fileDirectory.slice(baseDir.length).replace(/^\//, '')
            : '';
        const namespace = relativePath ? relativePath.split('/').join(':') : '';
        return namespace
            ? `${pluginName}:${namespace}:${commandBaseName}`
            : `${pluginName}:${commandBaseName}`;
    }
}
/**
 * Recursively collects all markdown files from a directory
 */
async function collectMarkdownFiles(dirPath, baseDir, loadedPaths) {
    const files = [];
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    await (0, walkPluginMarkdown_js_1.walkPluginMarkdown)(dirPath, async (fullPath) => {
        if ((0, fsOperations_js_1.isDuplicatePath)(fs, fullPath, loadedPaths))
            return;
        const content = await fs.readFile(fullPath, { encoding: 'utf-8' });
        const { frontmatter, content: markdownContent } = (0, frontmatterParser_js_1.parseFrontmatter)(content, fullPath);
        files.push({
            filePath: fullPath,
            baseDir,
            frontmatter,
            content: markdownContent,
        });
    }, { stopAtSkillDir: true, logLabel: 'commands' });
    return files;
}
/**
 * Transforms plugin markdown files to handle skill directories
 */
function transformPluginSkillFiles(files) {
    const filesByDir = new Map();
    for (const file of files) {
        const dir = (0, path_1.dirname)(file.filePath);
        const dirFiles = filesByDir.get(dir) ?? [];
        dirFiles.push(file);
        filesByDir.set(dir, dirFiles);
    }
    const result = [];
    for (const [dir, dirFiles] of filesByDir) {
        const skillFiles = dirFiles.filter(f => isSkillFile(f.filePath));
        if (skillFiles.length > 0) {
            // Use the first skill file if multiple exist
            const skillFile = skillFiles[0];
            if (skillFiles.length > 1) {
                (0, debug_js_1.logForDebugging)(`Multiple skill files found in ${dir}, using ${(0, path_1.basename)(skillFile.filePath)}`);
            }
            // Directory has a skill - only include the skill file
            result.push(skillFile);
        }
        else {
            result.push(...dirFiles);
        }
    }
    return result;
}
async function loadCommandsFromDirectory(commandsPath, pluginName, sourceName, pluginManifest, pluginPath, config = { isSkillMode: false }, loadedPaths = new Set()) {
    // Collect all markdown files
    const markdownFiles = await collectMarkdownFiles(commandsPath, commandsPath, loadedPaths);
    // Apply skill transformation
    const processedFiles = transformPluginSkillFiles(markdownFiles);
    // Convert to commands
    const commands = [];
    for (const file of processedFiles) {
        const commandName = getCommandNameFromFile(file.filePath, file.baseDir, pluginName);
        const command = createPluginCommand(commandName, file, sourceName, pluginManifest, pluginPath, isSkillFile(file.filePath), config);
        if (command) {
            commands.push(command);
        }
    }
    return commands;
}
/**
 * Create a Command from a plugin markdown file
 */
function createPluginCommand(commandName, file, sourceName, pluginManifest, pluginPath, isSkill, config = { isSkillMode: false }) {
    try {
        const { frontmatter, content } = file;
        const validatedDescription = (0, frontmatterParser_js_1.coerceDescriptionToString)(frontmatter.description, commandName);
        const description = validatedDescription ??
            (0, markdownConfigLoader_js_1.extractDescriptionFromMarkdown)(content, isSkill ? 'Plugin skill' : 'Plugin command');
        // Substitute ${CLAUDE_PLUGIN_ROOT} in allowed-tools before parsing
        const rawAllowedTools = frontmatter['allowed-tools'];
        const substitutedAllowedTools = typeof rawAllowedTools === 'string'
            ? (0, pluginOptionsStorage_js_1.substitutePluginVariables)(rawAllowedTools, {
                path: pluginPath,
                source: sourceName,
            })
            : Array.isArray(rawAllowedTools)
                ? rawAllowedTools.map(tool => typeof tool === 'string'
                    ? (0, pluginOptionsStorage_js_1.substitutePluginVariables)(tool, {
                        path: pluginPath,
                        source: sourceName,
                    })
                    : tool)
                : rawAllowedTools;
        const allowedTools = (0, markdownConfigLoader_js_1.parseSlashCommandToolsFromFrontmatter)(substitutedAllowedTools);
        const argumentHint = frontmatter['argument-hint'];
        const argumentNames = (0, argumentSubstitution_js_1.parseArgumentNames)(frontmatter.arguments);
        const whenToUse = frontmatter.when_to_use;
        const version = frontmatter.version;
        const displayName = frontmatter.name;
        // Handle model configuration, resolving aliases like 'haiku', 'sonnet', 'opus'
        const model = frontmatter.model === 'inherit'
            ? undefined
            : frontmatter.model
                ? (0, model_js_1.parseUserSpecifiedModel)(frontmatter.model)
                : undefined;
        const effortRaw = frontmatter['effort'];
        const effort = effortRaw !== undefined ? (0, effort_js_1.parseEffortValue)(effortRaw) : undefined;
        if (effortRaw !== undefined && effort === undefined) {
            (0, debug_js_1.logForDebugging)(`Plugin command ${commandName} has invalid effort '${effortRaw}'. Valid options: ${effort_js_1.EFFORT_LEVELS.join(', ')} or an integer`);
        }
        const disableModelInvocation = (0, frontmatterParser_js_1.parseBooleanFrontmatter)(frontmatter['disable-model-invocation']);
        const userInvocableValue = frontmatter['user-invocable'];
        const userInvocable = userInvocableValue === undefined
            ? true
            : (0, frontmatterParser_js_1.parseBooleanFrontmatter)(userInvocableValue);
        const shell = (0, frontmatterParser_js_1.parseShellFrontmatter)(frontmatter.shell, commandName);
        return {
            type: 'prompt',
            name: commandName,
            description,
            hasUserSpecifiedDescription: validatedDescription !== null,
            allowedTools,
            argumentHint,
            argNames: argumentNames.length > 0 ? argumentNames : undefined,
            whenToUse,
            version,
            model,
            effort,
            disableModelInvocation,
            userInvocable,
            contentLength: content.length,
            source: 'plugin',
            loadedFrom: isSkill || config.isSkillMode ? 'plugin' : undefined,
            pluginInfo: {
                pluginManifest,
                repository: sourceName,
            },
            isHidden: !userInvocable,
            progressMessage: isSkill || config.isSkillMode ? 'loading' : 'running',
            userFacingName() {
                return displayName || commandName;
            },
            async getPromptForCommand(args, context) {
                // For skills from skills/ directory, include base directory
                let finalContent = config.isSkillMode
                    ? `Base directory for this skill: ${(0, path_1.dirname)(file.filePath)}\n\n${content}`
                    : content;
                finalContent = (0, argumentSubstitution_js_1.substituteArguments)(finalContent, args, true, argumentNames);
                // Replace ${CLAUDE_PLUGIN_ROOT} and ${CLAUDE_PLUGIN_DATA} with their paths
                finalContent = (0, pluginOptionsStorage_js_1.substitutePluginVariables)(finalContent, {
                    path: pluginPath,
                    source: sourceName,
                });
                // Replace ${user_config.X} with saved option values. Sensitive keys
                // resolve to a descriptive placeholder instead — skill content goes to
                // the model prompt and we don't put secrets there.
                if (pluginManifest.userConfig) {
                    finalContent = (0, pluginOptionsStorage_js_1.substituteUserConfigInContent)(finalContent, (0, pluginOptionsStorage_js_1.loadPluginOptions)(sourceName), pluginManifest.userConfig);
                }
                // Replace ${CLAUDE_SKILL_DIR} with this specific skill's directory.
                // Distinct from ${CLAUDE_PLUGIN_ROOT}: a plugin can contain multiple
                // skills, so CLAUDE_PLUGIN_ROOT points to the plugin root while
                // CLAUDE_SKILL_DIR points to the individual skill's subdirectory.
                if (config.isSkillMode) {
                    const rawSkillDir = (0, path_1.dirname)(file.filePath);
                    const skillDir = process.platform === 'win32'
                        ? rawSkillDir.replace(/\\/g, '/')
                        : rawSkillDir;
                    finalContent = finalContent.replace(/\$\{CLAUDE_SKILL_DIR\}/g, skillDir);
                }
                // Replace ${CLAUDE_SESSION_ID} with the current session ID
                finalContent = finalContent.replace(/\$\{CLAUDE_SESSION_ID\}/g, (0, state_js_1.getSessionId)());
                finalContent = await (0, promptShellExecution_js_1.executeShellCommandsInPrompt)(finalContent, {
                    ...context,
                    getAppState() {
                        const appState = context.getAppState();
                        return {
                            ...appState,
                            toolPermissionContext: {
                                ...appState.toolPermissionContext,
                                alwaysAllowRules: {
                                    ...appState.toolPermissionContext.alwaysAllowRules,
                                    command: allowedTools,
                                },
                            },
                        };
                    },
                }, `/${commandName}`, shell);
                return [{ type: 'text', text: finalContent }];
            },
        };
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`Failed to create command from ${file.filePath}: ${error}`, {
            level: 'error',
        });
        return null;
    }
}
exports.getPluginCommands = (0, memoize_js_1.default)(async () => {
    // --bare: skip marketplace plugin auto-load. Explicit --plugin-dir still
    // works — getInlinePlugins() is set by main.tsx from --plugin-dir.
    // loadAllPluginsCacheOnly already short-circuits to inline-only when
    // inlinePlugins.length > 0.
    if ((0, envUtils_js_1.isBareMode)() && (0, state_js_1.getInlinePlugins)().length === 0) {
        return [];
    }
    // Only load commands from enabled plugins
    const { enabled, errors } = await (0, pluginLoader_js_1.loadAllPluginsCacheOnly)();
    if (errors.length > 0) {
        (0, debug_js_1.logForDebugging)(`Plugin loading errors: ${errors.map(e => (0, plugin_js_1.getPluginErrorMessage)(e)).join(', ')}`);
    }
    // Process plugins in parallel; each plugin has its own loadedPaths scope
    const perPluginCommands = await Promise.all(enabled.map(async (plugin) => {
        // Track loaded file paths to prevent duplicates within this plugin
        const loadedPaths = new Set();
        const pluginCommands = [];
        // Load commands from default commands directory
        if (plugin.commandsPath) {
            try {
                const commands = await loadCommandsFromDirectory(plugin.commandsPath, plugin.name, plugin.source, plugin.manifest, plugin.path, { isSkillMode: false }, loadedPaths);
                pluginCommands.push(...commands);
                if (commands.length > 0) {
                    (0, debug_js_1.logForDebugging)(`Loaded ${commands.length} commands from plugin ${plugin.name} default directory`);
                }
            }
            catch (error) {
                (0, debug_js_1.logForDebugging)(`Failed to load commands from plugin ${plugin.name} default directory: ${error}`, { level: 'error' });
            }
        }
        // Load commands from additional paths specified in manifest
        if (plugin.commandsPaths) {
            (0, debug_js_1.logForDebugging)(`Plugin ${plugin.name} has commandsPaths: ${plugin.commandsPaths.join(', ')}`);
            // Process all commandsPaths in parallel. isDuplicatePath is synchronous
            // (check-and-add), so concurrent access to loadedPaths is safe.
            const pathResults = await Promise.all(plugin.commandsPaths.map(async (commandPath) => {
                try {
                    const fs = (0, fsOperations_js_1.getFsImplementation)();
                    const stats = await fs.stat(commandPath);
                    (0, debug_js_1.logForDebugging)(`Checking commandPath ${commandPath} - isDirectory: ${stats.isDirectory()}, isFile: ${stats.isFile()}`);
                    if (stats.isDirectory()) {
                        // Load all .md files and skill directories from directory
                        const commands = await loadCommandsFromDirectory(commandPath, plugin.name, plugin.source, plugin.manifest, plugin.path, { isSkillMode: false }, loadedPaths);
                        if (commands.length > 0) {
                            (0, debug_js_1.logForDebugging)(`Loaded ${commands.length} commands from plugin ${plugin.name} custom path: ${commandPath}`);
                        }
                        else {
                            (0, debug_js_1.logForDebugging)(`Warning: No commands found in plugin ${plugin.name} custom directory: ${commandPath}. Expected .md files or SKILL.md in subdirectories.`, { level: 'warn' });
                        }
                        return commands;
                    }
                    else if (stats.isFile() && commandPath.endsWith('.md')) {
                        if ((0, fsOperations_js_1.isDuplicatePath)(fs, commandPath, loadedPaths)) {
                            return [];
                        }
                        // Load single command file
                        const content = await fs.readFile(commandPath, {
                            encoding: 'utf-8',
                        });
                        const { frontmatter, content: markdownContent } = (0, frontmatterParser_js_1.parseFrontmatter)(content, commandPath);
                        // Check if there's metadata for this command (object-mapping format)
                        let commandName;
                        let metadataOverride;
                        if (plugin.commandsMetadata) {
                            // Find metadata by matching the command's absolute path to the metadata source
                            // Convert metadata.source (relative to plugin root) to absolute path for comparison
                            for (const [name, metadata] of Object.entries(plugin.commandsMetadata)) {
                                if (metadata.source) {
                                    const fullMetadataPath = (0, path_1.join)(plugin.path, metadata.source);
                                    if (commandPath === fullMetadataPath) {
                                        commandName = `${plugin.name}:${name}`;
                                        metadataOverride = metadata;
                                        break;
                                    }
                                }
                            }
                        }
                        // Fall back to filename-based naming if no metadata
                        if (!commandName) {
                            commandName = `${plugin.name}:${(0, path_1.basename)(commandPath).replace(/\.md$/, '')}`;
                        }
                        // Apply metadata overrides to frontmatter
                        const finalFrontmatter = metadataOverride
                            ? {
                                ...frontmatter,
                                ...(metadataOverride.description && {
                                    description: metadataOverride.description,
                                }),
                                ...(metadataOverride.argumentHint && {
                                    'argument-hint': metadataOverride.argumentHint,
                                }),
                                ...(metadataOverride.model && {
                                    model: metadataOverride.model,
                                }),
                                ...(metadataOverride.allowedTools && {
                                    'allowed-tools': metadataOverride.allowedTools.join(','),
                                }),
                            }
                            : frontmatter;
                        const file = {
                            filePath: commandPath,
                            baseDir: (0, path_1.dirname)(commandPath),
                            frontmatter: finalFrontmatter,
                            content: markdownContent,
                        };
                        const command = createPluginCommand(commandName, file, plugin.source, plugin.manifest, plugin.path, false);
                        if (command) {
                            (0, debug_js_1.logForDebugging)(`Loaded command from plugin ${plugin.name} custom file: ${commandPath}${metadataOverride ? ' (with metadata override)' : ''}`);
                            return [command];
                        }
                    }
                    return [];
                }
                catch (error) {
                    (0, debug_js_1.logForDebugging)(`Failed to load commands from plugin ${plugin.name} custom path ${commandPath}: ${error}`, { level: 'error' });
                    return [];
                }
            }));
            for (const commands of pathResults) {
                pluginCommands.push(...commands);
            }
        }
        // Load commands with inline content (no source file)
        // Note: Commands with source files were already loaded in the previous loop
        // when iterating through commandsPaths. This loop handles metadata entries
        // that specify inline content instead of file references.
        if (plugin.commandsMetadata) {
            for (const [name, metadata] of Object.entries(plugin.commandsMetadata)) {
                // Only process entries with inline content (no source)
                if (metadata.content && !metadata.source) {
                    try {
                        // Parse inline content for frontmatter
                        const { frontmatter, content: markdownContent } = (0, frontmatterParser_js_1.parseFrontmatter)(metadata.content, `<inline:${plugin.name}:${name}>`);
                        // Apply metadata overrides to frontmatter
                        const finalFrontmatter = {
                            ...frontmatter,
                            ...(metadata.description && {
                                description: metadata.description,
                            }),
                            ...(metadata.argumentHint && {
                                'argument-hint': metadata.argumentHint,
                            }),
                            ...(metadata.model && {
                                model: metadata.model,
                            }),
                            ...(metadata.allowedTools && {
                                'allowed-tools': metadata.allowedTools.join(','),
                            }),
                        };
                        const commandName = `${plugin.name}:${name}`;
                        const file = {
                            filePath: `<inline:${commandName}>`, // Virtual path for inline content
                            baseDir: plugin.path, // Use plugin root as base directory
                            frontmatter: finalFrontmatter,
                            content: markdownContent,
                        };
                        const command = createPluginCommand(commandName, file, plugin.source, plugin.manifest, plugin.path, false);
                        if (command) {
                            pluginCommands.push(command);
                            (0, debug_js_1.logForDebugging)(`Loaded inline content command from plugin ${plugin.name}: ${commandName}`);
                        }
                    }
                    catch (error) {
                        (0, debug_js_1.logForDebugging)(`Failed to load inline content command ${name} from plugin ${plugin.name}: ${error}`, { level: 'error' });
                    }
                }
            }
        }
        return pluginCommands;
    }));
    const allCommands = perPluginCommands.flat();
    (0, debug_js_1.logForDebugging)(`Total plugin commands loaded: ${allCommands.length}`);
    return allCommands;
});
function clearPluginCommandCache() {
    exports.getPluginCommands.cache?.clear?.();
}
/**
 * Loads skills from plugin skills directories
 * Skills are directories containing SKILL.md files
 */
async function loadSkillsFromDirectory(skillsPath, pluginName, sourceName, pluginManifest, pluginPath, loadedPaths) {
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    const skills = [];
    // First, check if skillsPath itself contains SKILL.md (direct skill directory)
    const directSkillPath = (0, path_1.join)(skillsPath, 'SKILL.md');
    let directSkillContent = null;
    try {
        directSkillContent = await fs.readFile(directSkillPath, {
            encoding: 'utf-8',
        });
    }
    catch (e) {
        if (!(0, errors_js_1.isENOENT)(e)) {
            (0, debug_js_1.logForDebugging)(`Failed to load skill from ${directSkillPath}: ${e}`, {
                level: 'error',
            });
            return skills;
        }
        // ENOENT: no direct SKILL.md, fall through to scan subdirectories
    }
    if (directSkillContent !== null) {
        // This is a direct skill directory, load the skill from here
        if ((0, fsOperations_js_1.isDuplicatePath)(fs, directSkillPath, loadedPaths)) {
            return skills;
        }
        try {
            const { frontmatter, content: markdownContent } = (0, frontmatterParser_js_1.parseFrontmatter)(directSkillContent, directSkillPath);
            const skillName = `${pluginName}:${(0, path_1.basename)(skillsPath)}`;
            const file = {
                filePath: directSkillPath,
                baseDir: (0, path_1.dirname)(directSkillPath),
                frontmatter,
                content: markdownContent,
            };
            const skill = createPluginCommand(skillName, file, sourceName, pluginManifest, pluginPath, true, // isSkill
            { isSkillMode: true });
            if (skill) {
                skills.push(skill);
            }
        }
        catch (error) {
            (0, debug_js_1.logForDebugging)(`Failed to load skill from ${directSkillPath}: ${error}`, {
                level: 'error',
            });
        }
        return skills;
    }
    // Otherwise, scan for subdirectories containing SKILL.md files
    let entries;
    try {
        entries = await fs.readdir(skillsPath);
    }
    catch (e) {
        if (!(0, errors_js_1.isENOENT)(e)) {
            (0, debug_js_1.logForDebugging)(`Failed to load skills from directory ${skillsPath}: ${e}`, { level: 'error' });
        }
        return skills;
    }
    await Promise.all(entries.map(async (entry) => {
        // Accept both directories and symlinks (symlinks may point to skill directories)
        if (!entry.isDirectory() && !entry.isSymbolicLink()) {
            return;
        }
        const skillDirPath = (0, path_1.join)(skillsPath, entry.name);
        const skillFilePath = (0, path_1.join)(skillDirPath, 'SKILL.md');
        // Try to read SKILL.md directly; skip if it doesn't exist
        let content;
        try {
            content = await fs.readFile(skillFilePath, { encoding: 'utf-8' });
        }
        catch (e) {
            if (!(0, errors_js_1.isENOENT)(e)) {
                (0, debug_js_1.logForDebugging)(`Failed to load skill from ${skillFilePath}: ${e}`, {
                    level: 'error',
                });
            }
            return;
        }
        if ((0, fsOperations_js_1.isDuplicatePath)(fs, skillFilePath, loadedPaths)) {
            return;
        }
        try {
            const { frontmatter, content: markdownContent } = (0, frontmatterParser_js_1.parseFrontmatter)(content, skillFilePath);
            const skillName = `${pluginName}:${entry.name}`;
            const file = {
                filePath: skillFilePath,
                baseDir: (0, path_1.dirname)(skillFilePath),
                frontmatter,
                content: markdownContent,
            };
            const skill = createPluginCommand(skillName, file, sourceName, pluginManifest, pluginPath, true, // isSkill
            { isSkillMode: true });
            if (skill) {
                skills.push(skill);
            }
        }
        catch (error) {
            (0, debug_js_1.logForDebugging)(`Failed to load skill from ${skillFilePath}: ${error}`, { level: 'error' });
        }
    }));
    return skills;
}
exports.getPluginSkills = (0, memoize_js_1.default)(async () => {
    // --bare: same gate as getPluginCommands above — honor explicit
    // --plugin-dir, skip marketplace auto-load.
    if ((0, envUtils_js_1.isBareMode)() && (0, state_js_1.getInlinePlugins)().length === 0) {
        return [];
    }
    // Only load skills from enabled plugins
    const { enabled, errors } = await (0, pluginLoader_js_1.loadAllPluginsCacheOnly)();
    if (errors.length > 0) {
        (0, debug_js_1.logForDebugging)(`Plugin loading errors: ${errors.map(e => (0, plugin_js_1.getPluginErrorMessage)(e)).join(', ')}`);
    }
    (0, debug_js_1.logForDebugging)(`getPluginSkills: Processing ${enabled.length} enabled plugins`);
    // Process plugins in parallel; each plugin has its own loadedPaths scope
    const perPluginSkills = await Promise.all(enabled.map(async (plugin) => {
        // Track loaded file paths to prevent duplicates within this plugin
        const loadedPaths = new Set();
        const pluginSkills = [];
        (0, debug_js_1.logForDebugging)(`Checking plugin ${plugin.name}: skillsPath=${plugin.skillsPath ? 'exists' : 'none'}, skillsPaths=${plugin.skillsPaths ? plugin.skillsPaths.length : 0} paths`);
        // Load skills from default skills directory
        if (plugin.skillsPath) {
            (0, debug_js_1.logForDebugging)(`Attempting to load skills from plugin ${plugin.name} default skillsPath: ${plugin.skillsPath}`);
            try {
                const skills = await loadSkillsFromDirectory(plugin.skillsPath, plugin.name, plugin.source, plugin.manifest, plugin.path, loadedPaths);
                pluginSkills.push(...skills);
                (0, debug_js_1.logForDebugging)(`Loaded ${skills.length} skills from plugin ${plugin.name} default directory`);
            }
            catch (error) {
                (0, debug_js_1.logForDebugging)(`Failed to load skills from plugin ${plugin.name} default directory: ${error}`, { level: 'error' });
            }
        }
        // Load skills from additional paths specified in manifest
        if (plugin.skillsPaths) {
            (0, debug_js_1.logForDebugging)(`Attempting to load skills from plugin ${plugin.name} skillsPaths: ${plugin.skillsPaths.join(', ')}`);
            // Process all skillsPaths in parallel. isDuplicatePath is synchronous
            // (check-and-add), so concurrent access to loadedPaths is safe.
            const pathResults = await Promise.all(plugin.skillsPaths.map(async (skillPath) => {
                try {
                    (0, debug_js_1.logForDebugging)(`Loading from skillPath: ${skillPath} for plugin ${plugin.name}`);
                    const skills = await loadSkillsFromDirectory(skillPath, plugin.name, plugin.source, plugin.manifest, plugin.path, loadedPaths);
                    (0, debug_js_1.logForDebugging)(`Loaded ${skills.length} skills from plugin ${plugin.name} custom path: ${skillPath}`);
                    return skills;
                }
                catch (error) {
                    (0, debug_js_1.logForDebugging)(`Failed to load skills from plugin ${plugin.name} custom path ${skillPath}: ${error}`, { level: 'error' });
                    return [];
                }
            }));
            for (const skills of pathResults) {
                pluginSkills.push(...skills);
            }
        }
        return pluginSkills;
    }));
    const allSkills = perPluginSkills.flat();
    (0, debug_js_1.logForDebugging)(`Total plugin skills loaded: ${allSkills.length}`);
    return allSkills;
});
function clearPluginSkillsCache() {
    exports.getPluginSkills.cache?.clear?.();
}
