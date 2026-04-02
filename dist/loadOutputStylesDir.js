"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOutputStyleDirStyles = void 0;
exports.clearOutputStyleCaches = clearOutputStyleCaches;
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const path_1 = require("path");
const debug_js_1 = require("../utils/debug.js");
const frontmatterParser_js_1 = require("../utils/frontmatterParser.js");
const log_js_1 = require("../utils/log.js");
const markdownConfigLoader_js_1 = require("../utils/markdownConfigLoader.js");
const loadPluginOutputStyles_js_1 = require("../utils/plugins/loadPluginOutputStyles.js");
/**
 * Loads markdown files from .claude/output-styles directories throughout the project
 * and from ~/.claude/output-styles directory and converts them to output styles.
 *
 * Each filename becomes a style name, and the file content becomes the style prompt.
 * The frontmatter provides name and description.
 *
 * Structure:
 * - Project .claude/output-styles/*.md -> project styles
 * - User ~/.claude/output-styles/*.md -> user styles (overridden by project styles)
 *
 * @param cwd Current working directory for project directory traversal
 */
exports.getOutputStyleDirStyles = (0, memoize_js_1.default)(async (cwd) => {
    try {
        const markdownFiles = await (0, markdownConfigLoader_js_1.loadMarkdownFilesForSubdir)('output-styles', cwd);
        const styles = markdownFiles
            .map(({ filePath, frontmatter, content, source }) => {
            try {
                const fileName = (0, path_1.basename)(filePath);
                const styleName = fileName.replace(/\.md$/, '');
                // Get style configuration from frontmatter
                const name = (frontmatter['name'] || styleName);
                const description = (0, frontmatterParser_js_1.coerceDescriptionToString)(frontmatter['description'], styleName) ??
                    (0, markdownConfigLoader_js_1.extractDescriptionFromMarkdown)(content, `Custom ${styleName} output style`);
                // Parse keep-coding-instructions flag (supports both boolean and string values)
                const keepCodingInstructionsRaw = frontmatter['keep-coding-instructions'];
                const keepCodingInstructions = keepCodingInstructionsRaw === true ||
                    keepCodingInstructionsRaw === 'true'
                    ? true
                    : keepCodingInstructionsRaw === false ||
                        keepCodingInstructionsRaw === 'false'
                        ? false
                        : undefined;
                // Warn if force-for-plugin is set on non-plugin output style
                if (frontmatter['force-for-plugin'] !== undefined) {
                    (0, debug_js_1.logForDebugging)(`Output style "${name}" has force-for-plugin set, but this option only applies to plugin output styles. Ignoring.`, { level: 'warn' });
                }
                return {
                    name,
                    description,
                    prompt: content.trim(),
                    source,
                    keepCodingInstructions,
                };
            }
            catch (error) {
                (0, log_js_1.logError)(error);
                return null;
            }
        })
            .filter(style => style !== null);
        return styles;
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        return [];
    }
});
function clearOutputStyleCaches() {
    exports.getOutputStyleDirStyles.cache?.clear?.();
    markdownConfigLoader_js_1.loadMarkdownFilesForSubdir.cache?.clear?.();
    (0, loadPluginOutputStyles_js_1.clearPluginOutputStyleCache)();
}
