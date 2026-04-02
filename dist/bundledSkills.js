"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBundledSkill = registerBundledSkill;
exports.getBundledSkills = getBundledSkills;
exports.clearBundledSkills = clearBundledSkills;
exports.getBundledSkillExtractDir = getBundledSkillExtractDir;
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const debug_js_1 = require("../utils/debug.js");
const filesystem_js_1 = require("../utils/permissions/filesystem.js");
// Internal registry for bundled skills
const bundledSkills = [];
/**
 * Register a bundled skill that will be available to the model.
 * Call this at module initialization or in an init function.
 *
 * Bundled skills are compiled into the CLI binary and available to all users.
 * They follow the same pattern as registerPostSamplingHook() for internal features.
 */
function registerBundledSkill(definition) {
    const { files } = definition;
    let skillRoot;
    let getPromptForCommand = definition.getPromptForCommand;
    if (files && Object.keys(files).length > 0) {
        skillRoot = getBundledSkillExtractDir(definition.name);
        // Closure-local memoization: extract once per process.
        // Memoize the promise (not the result) so concurrent callers await
        // the same extraction instead of racing into separate writes.
        let extractionPromise;
        const inner = definition.getPromptForCommand;
        getPromptForCommand = async (args, ctx) => {
            extractionPromise ?? (extractionPromise = extractBundledSkillFiles(definition.name, files));
            const extractedDir = await extractionPromise;
            const blocks = await inner(args, ctx);
            if (extractedDir === null)
                return blocks;
            return prependBaseDir(blocks, extractedDir);
        };
    }
    const command = {
        type: 'prompt',
        name: definition.name,
        description: definition.description,
        aliases: definition.aliases,
        hasUserSpecifiedDescription: true,
        allowedTools: definition.allowedTools ?? [],
        argumentHint: definition.argumentHint,
        whenToUse: definition.whenToUse,
        model: definition.model,
        disableModelInvocation: definition.disableModelInvocation ?? false,
        userInvocable: definition.userInvocable ?? true,
        contentLength: 0, // Not applicable for bundled skills
        source: 'bundled',
        loadedFrom: 'bundled',
        hooks: definition.hooks,
        skillRoot,
        context: definition.context,
        agent: definition.agent,
        isEnabled: definition.isEnabled,
        isHidden: !(definition.userInvocable ?? true),
        progressMessage: 'running',
        getPromptForCommand,
    };
    bundledSkills.push(command);
}
/**
 * Get all registered bundled skills.
 * Returns a copy to prevent external mutation.
 */
function getBundledSkills() {
    return [...bundledSkills];
}
/**
 * Clear bundled skills registry (for testing).
 */
function clearBundledSkills() {
    bundledSkills.length = 0;
}
/**
 * Deterministic extraction directory for a bundled skill's reference files.
 */
function getBundledSkillExtractDir(skillName) {
    return (0, path_1.join)((0, filesystem_js_1.getBundledSkillsRoot)(), skillName);
}
/**
 * Extract a bundled skill's reference files to disk so the model can
 * Read/Grep them on demand. Called lazily on first skill invocation.
 *
 * Returns the directory written to, or null if write failed (skill
 * continues to work, just without the base-directory prefix).
 */
async function extractBundledSkillFiles(skillName, files) {
    const dir = getBundledSkillExtractDir(skillName);
    try {
        await writeSkillFiles(dir, files);
        return dir;
    }
    catch (e) {
        (0, debug_js_1.logForDebugging)(`Failed to extract bundled skill '${skillName}' to ${dir}: ${e instanceof Error ? e.message : String(e)}`);
        return null;
    }
}
async function writeSkillFiles(dir, files) {
    // Group by parent dir so we mkdir each subtree once, then write.
    const byParent = new Map();
    for (const [relPath, content] of Object.entries(files)) {
        const target = resolveSkillFilePath(dir, relPath);
        const parent = (0, path_1.dirname)(target);
        const entry = [target, content];
        const group = byParent.get(parent);
        if (group)
            group.push(entry);
        else
            byParent.set(parent, [entry]);
    }
    await Promise.all([...byParent].map(async ([parent, entries]) => {
        await (0, promises_1.mkdir)(parent, { recursive: true, mode: 0o700 });
        await Promise.all(entries.map(([p, c]) => safeWriteFile(p, c)));
    }));
}
// The per-process nonce in getBundledSkillsRoot() is the primary defense
// against pre-created symlinks/dirs. Explicit 0o700/0o600 modes keep the
// nonce subtree owner-only even on umask=0, so an attacker who learns the
// nonce via inotify on the predictable parent still can't write into it.
// O_NOFOLLOW|O_EXCL is belt-and-suspenders (O_NOFOLLOW only protects the
// final component); we deliberately do NOT unlink+retry on EEXIST — unlink()
// follows intermediate symlinks too.
const O_NOFOLLOW = fs_1.constants.O_NOFOLLOW ?? 0;
// On Windows, use string flags — numeric O_EXCL can produce EINVAL through libuv.
const SAFE_WRITE_FLAGS = process.platform === 'win32'
    ? 'wx'
    : fs_1.constants.O_WRONLY |
        fs_1.constants.O_CREAT |
        fs_1.constants.O_EXCL |
        O_NOFOLLOW;
async function safeWriteFile(p, content) {
    const fh = await (0, promises_1.open)(p, SAFE_WRITE_FLAGS, 0o600);
    try {
        await fh.writeFile(content, 'utf8');
    }
    finally {
        await fh.close();
    }
}
/** Normalize and validate a skill-relative path; throws on traversal. */
function resolveSkillFilePath(baseDir, relPath) {
    const normalized = (0, path_1.normalize)(relPath);
    if ((0, path_1.isAbsolute)(normalized) ||
        normalized.split(path_1.sep).includes('..') ||
        normalized.split('/').includes('..')) {
        throw new Error(`bundled skill file path escapes skill dir: ${relPath}`);
    }
    return (0, path_1.join)(baseDir, normalized);
}
function prependBaseDir(blocks, baseDir) {
    const prefix = `Base directory for this skill: ${baseDir}\n\n`;
    if (blocks.length > 0 && blocks[0].type === 'text') {
        return [
            { type: 'text', text: prefix + blocks[0].text },
            ...blocks.slice(1),
        ];
    }
    return [{ type: 'text', text: prefix }, ...blocks];
}
