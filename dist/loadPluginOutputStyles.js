"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPluginOutputStyles = void 0;
exports.clearPluginOutputStyleCache = clearPluginOutputStyleCache;
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const path_1 = require("path");
const plugin_js_1 = require("../../types/plugin.js");
const debug_js_1 = require("../debug.js");
const frontmatterParser_js_1 = require("../frontmatterParser.js");
const fsOperations_js_1 = require("../fsOperations.js");
const markdownConfigLoader_js_1 = require("../markdownConfigLoader.js");
const pluginLoader_js_1 = require("./pluginLoader.js");
const walkPluginMarkdown_js_1 = require("./walkPluginMarkdown.js");
async function loadOutputStylesFromDirectory(outputStylesPath, pluginName, loadedPaths) {
    const styles = [];
    await (0, walkPluginMarkdown_js_1.walkPluginMarkdown)(outputStylesPath, async (fullPath) => {
        const style = await loadOutputStyleFromFile(fullPath, pluginName, loadedPaths);
        if (style)
            styles.push(style);
    }, { logLabel: 'output-styles' });
    return styles;
}
async function loadOutputStyleFromFile(filePath, pluginName, loadedPaths) {
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    if ((0, fsOperations_js_1.isDuplicatePath)(fs, filePath, loadedPaths)) {
        return null;
    }
    try {
        const content = await fs.readFile(filePath, { encoding: 'utf-8' });
        const { frontmatter, content: markdownContent } = (0, frontmatterParser_js_1.parseFrontmatter)(content, filePath);
        const fileName = (0, path_1.basename)(filePath, '.md');
        const baseStyleName = frontmatter.name || fileName;
        // Namespace output styles with plugin name, consistent with commands and agents
        const name = `${pluginName}:${baseStyleName}`;
        const description = (0, frontmatterParser_js_1.coerceDescriptionToString)(frontmatter.description, name) ??
            (0, markdownConfigLoader_js_1.extractDescriptionFromMarkdown)(markdownContent, `Output style from ${pluginName} plugin`);
        // Parse forceForPlugin flag (supports both boolean and string values)
        const forceRaw = frontmatter['force-for-plugin'];
        const forceForPlugin = forceRaw === true || forceRaw === 'true'
            ? true
            : forceRaw === false || forceRaw === 'false'
                ? false
                : undefined;
        return {
            name,
            description,
            prompt: markdownContent.trim(),
            source: 'plugin',
            forceForPlugin,
        };
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`Failed to load output style from ${filePath}: ${error}`, {
            level: 'error',
        });
        return null;
    }
}
exports.loadPluginOutputStyles = (0, memoize_js_1.default)(async () => {
    // Only load output styles from enabled plugins
    const { enabled, errors } = await (0, pluginLoader_js_1.loadAllPluginsCacheOnly)();
    const allStyles = [];
    if (errors.length > 0) {
        (0, debug_js_1.logForDebugging)(`Plugin loading errors: ${errors.map(e => (0, plugin_js_1.getPluginErrorMessage)(e)).join(', ')}`);
    }
    for (const plugin of enabled) {
        // Track loaded file paths to prevent duplicates within this plugin
        const loadedPaths = new Set();
        // Load output styles from default output-styles directory
        if (plugin.outputStylesPath) {
            try {
                const styles = await loadOutputStylesFromDirectory(plugin.outputStylesPath, plugin.name, loadedPaths);
                allStyles.push(...styles);
                if (styles.length > 0) {
                    (0, debug_js_1.logForDebugging)(`Loaded ${styles.length} output styles from plugin ${plugin.name} default directory`);
                }
            }
            catch (error) {
                (0, debug_js_1.logForDebugging)(`Failed to load output styles from plugin ${plugin.name} default directory: ${error}`, { level: 'error' });
            }
        }
        // Load output styles from additional paths specified in manifest
        if (plugin.outputStylesPaths) {
            for (const stylePath of plugin.outputStylesPaths) {
                try {
                    const fs = (0, fsOperations_js_1.getFsImplementation)();
                    const stats = await fs.stat(stylePath);
                    if (stats.isDirectory()) {
                        // Load all .md files from directory
                        const styles = await loadOutputStylesFromDirectory(stylePath, plugin.name, loadedPaths);
                        allStyles.push(...styles);
                        if (styles.length > 0) {
                            (0, debug_js_1.logForDebugging)(`Loaded ${styles.length} output styles from plugin ${plugin.name} custom path: ${stylePath}`);
                        }
                    }
                    else if (stats.isFile() && stylePath.endsWith('.md')) {
                        // Load single output style file
                        const style = await loadOutputStyleFromFile(stylePath, plugin.name, loadedPaths);
                        if (style) {
                            allStyles.push(style);
                            (0, debug_js_1.logForDebugging)(`Loaded output style from plugin ${plugin.name} custom file: ${stylePath}`);
                        }
                    }
                }
                catch (error) {
                    (0, debug_js_1.logForDebugging)(`Failed to load output styles from plugin ${plugin.name} custom path ${stylePath}: ${error}`, { level: 'error' });
                }
            }
        }
    }
    (0, debug_js_1.logForDebugging)(`Total plugin output styles loaded: ${allStyles.length}`);
    return allStyles;
});
function clearPluginOutputStyleCache() {
    exports.loadPluginOutputStyles.cache?.clear?.();
}
