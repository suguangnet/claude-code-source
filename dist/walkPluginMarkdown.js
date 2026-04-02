"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walkPluginMarkdown = walkPluginMarkdown;
const path_1 = require("path");
const debug_js_1 = require("../debug.js");
const fsOperations_js_1 = require("../fsOperations.js");
const SKILL_MD_RE = /^skill\.md$/i;
/**
 * Recursively walk a plugin directory, invoking onFile for each .md file.
 *
 * The namespace array tracks the subdirectory path relative to the root
 * (e.g., ['foo', 'bar'] for root/foo/bar/file.md). Callers that don't need
 * namespacing can ignore the second argument.
 *
 * When stopAtSkillDir is true and a directory contains SKILL.md, onFile is
 * called for all .md files in that directory but subdirectories are not
 * scanned — skill directories are leaf containers.
 *
 * Readdir errors are swallowed with a debug log so one bad directory doesn't
 * abort a plugin load.
 */
async function walkPluginMarkdown(rootDir, onFile, opts = {}) {
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    const label = opts.logLabel ?? 'plugin';
    async function scan(dirPath, namespace) {
        try {
            const entries = await fs.readdir(dirPath);
            if (opts.stopAtSkillDir &&
                entries.some(e => e.isFile() && SKILL_MD_RE.test(e.name))) {
                // Skill directory: collect .md files here, don't recurse.
                await Promise.all(entries.map(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md')
                    ? onFile((0, path_1.join)(dirPath, entry.name), namespace)
                    : undefined));
                return;
            }
            await Promise.all(entries.map(entry => {
                const fullPath = (0, path_1.join)(dirPath, entry.name);
                if (entry.isDirectory()) {
                    return scan(fullPath, [...namespace, entry.name]);
                }
                if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
                    return onFile(fullPath, namespace);
                }
                return undefined;
            }));
        }
        catch (error) {
            (0, debug_js_1.logForDebugging)(`Failed to scan ${label} directory ${dirPath}: ${error}`, { level: 'error' });
        }
    }
    await scan(rootDir, []);
}
