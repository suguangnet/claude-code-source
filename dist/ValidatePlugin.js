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
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePluginManifest = validatePluginManifest;
exports.validateMarketplaceManifest = validateMarketplaceManifest;
exports.validatePluginContents = validatePluginContents;
exports.validateManifest = validateManifest;
const promises_1 = require("fs/promises");
const path = __importStar(require("path"));
const v4_1 = require("zod/v4");
const errors_js_1 = require("../errors.js");
const frontmatterParser_js_1 = require("../frontmatterParser.js");
const slowOperations_js_1 = require("../slowOperations.js");
const yaml_js_1 = require("../yaml.js");
const schemas_js_1 = require("./schemas.js");
/**
 * Fields that belong in marketplace.json entries (PluginMarketplaceEntrySchema)
 * but not plugin.json (PluginManifestSchema). Plugin authors reasonably copy
 * one into the other. Surfaced as warnings by `claude plugin validate` since
 * they're a known confusion point — the load path silently strips all unknown
 * keys via zod's default behavior, so they're harmless at runtime but worth
 * flagging to authors.
 */
const MARKETPLACE_ONLY_MANIFEST_FIELDS = new Set([
    'category',
    'source',
    'tags',
    'strict',
    'id',
]);
/**
 * Detect whether a file is a plugin manifest or marketplace manifest
 */
function detectManifestType(filePath) {
    const fileName = path.basename(filePath);
    const dirName = path.basename(path.dirname(filePath));
    // Check filename patterns
    if (fileName === 'plugin.json')
        return 'plugin';
    if (fileName === 'marketplace.json')
        return 'marketplace';
    // Check if it's in .claude-plugin directory
    if (dirName === '.claude-plugin') {
        return 'plugin'; // Most likely plugin.json
    }
    return 'unknown';
}
/**
 * Format Zod validation errors into a readable format
 */
function formatZodErrors(zodError) {
    return zodError.issues.map(error => ({
        path: error.path.join('.') || 'root',
        message: error.message,
        code: error.code,
    }));
}
/**
 * Check for parent-directory segments ('..') in a path string.
 *
 * For plugin.json component paths this is a security concern (escaping the plugin dir).
 * For marketplace.json source paths it's almost always a resolution-base misunderstanding:
 * paths resolve from the marketplace repo root, not from marketplace.json itself, so the
 * '..' a user added to "climb out of .claude-plugin/" is unnecessary. Callers pass `hint`
 * to attach the right explanation.
 */
function checkPathTraversal(p, field, errors, hint) {
    if (p.includes('..')) {
        errors.push({
            path: field,
            message: hint
                ? `Path contains "..": ${p}. ${hint}`
                : `Path contains ".." which could be a path traversal attempt: ${p}`,
        });
    }
}
// Shown when a marketplace plugin source contains '..'. Most users hit this because
// they expect paths to resolve relative to marketplace.json (inside .claude-plugin/),
// but resolution actually starts at the marketplace repo root — see gh-29485.
// Computes a tailored "use X instead of Y" suggestion from the user's actual path
// rather than a hardcoded example (review feedback on #20895).
function marketplaceSourceHint(p) {
    // Strip leading ../ segments: the '..' a user added to "climb out of
    // .claude-plugin/" is unnecessary since paths already start at the repo root.
    // If '..' appears mid-path (rare), fall back to a generic example.
    const stripped = p.replace(/^(\.\.\/)+/, '');
    const corrected = stripped !== p ? `./${stripped}` : './plugins/my-plugin';
    return ('Plugin source paths are resolved relative to the marketplace root (the directory ' +
        'containing .claude-plugin/), not relative to marketplace.json. ' +
        `Use "${corrected}" instead of "${p}".`);
}
/**
 * Validate a plugin manifest file (plugin.json)
 */
async function validatePluginManifest(filePath) {
    const errors = [];
    const warnings = [];
    const absolutePath = path.resolve(filePath);
    // Read file content — handle ENOENT / EISDIR / permission errors directly
    let content;
    try {
        content = await (0, promises_1.readFile)(absolutePath, { encoding: 'utf-8' });
    }
    catch (error) {
        const code = (0, errors_js_1.getErrnoCode)(error);
        let message;
        if (code === 'ENOENT') {
            message = `File not found: ${absolutePath}`;
        }
        else if (code === 'EISDIR') {
            message = `Path is not a file: ${absolutePath}`;
        }
        else {
            message = `Failed to read file: ${(0, errors_js_1.errorMessage)(error)}`;
        }
        return {
            success: false,
            errors: [{ path: 'file', message, code }],
            warnings: [],
            filePath: absolutePath,
            fileType: 'plugin',
        };
    }
    let parsed;
    try {
        parsed = (0, slowOperations_js_1.jsonParse)(content);
    }
    catch (error) {
        return {
            success: false,
            errors: [
                {
                    path: 'json',
                    message: `Invalid JSON syntax: ${(0, errors_js_1.errorMessage)(error)}`,
                },
            ],
            warnings: [],
            filePath: absolutePath,
            fileType: 'plugin',
        };
    }
    // Check for path traversal in the parsed JSON before schema validation
    // This ensures we catch security issues even if schema validation fails
    if (parsed && typeof parsed === 'object') {
        const obj = parsed;
        // Check commands
        if (obj.commands) {
            const commands = Array.isArray(obj.commands)
                ? obj.commands
                : [obj.commands];
            commands.forEach((cmd, i) => {
                if (typeof cmd === 'string') {
                    checkPathTraversal(cmd, `commands[${i}]`, errors);
                }
            });
        }
        // Check agents
        if (obj.agents) {
            const agents = Array.isArray(obj.agents) ? obj.agents : [obj.agents];
            agents.forEach((agent, i) => {
                if (typeof agent === 'string') {
                    checkPathTraversal(agent, `agents[${i}]`, errors);
                }
            });
        }
        // Check skills
        if (obj.skills) {
            const skills = Array.isArray(obj.skills) ? obj.skills : [obj.skills];
            skills.forEach((skill, i) => {
                if (typeof skill === 'string') {
                    checkPathTraversal(skill, `skills[${i}]`, errors);
                }
            });
        }
    }
    // Surface marketplace-only fields as a warning BEFORE validation flags
    // them. `claude plugin validate` is a developer tool — authors running it
    // want to know these fields don't belong here. But it's a warning, not an
    // error: the plugin loads fine at runtime (the base schema strips unknown
    // keys). We strip them here so the .strict() call below doesn't double-
    // report them as unrecognized-key errors on top of the targeted warnings.
    let toValidate = parsed;
    if (typeof parsed === 'object' && parsed !== null) {
        const obj = parsed;
        const strayKeys = Object.keys(obj).filter(k => MARKETPLACE_ONLY_MANIFEST_FIELDS.has(k));
        if (strayKeys.length > 0) {
            const stripped = { ...obj };
            for (const key of strayKeys) {
                delete stripped[key];
                warnings.push({
                    path: key,
                    message: `Field '${key}' belongs in the marketplace entry (marketplace.json), ` +
                        `not plugin.json. It's harmless here but unused — Claude Code ` +
                        `ignores it at load time.`,
                });
            }
            toValidate = stripped;
        }
    }
    // Validate against schema (post-strip, so marketplace fields don't fail it).
    // We call .strict() locally here even though the base schema is lenient —
    // the runtime load path silently strips unknown keys for resilience, but
    // this is a developer tool and authors running it want typo feedback.
    const result = (0, schemas_js_1.PluginManifestSchema)().strict().safeParse(toValidate);
    if (!result.success) {
        errors.push(...formatZodErrors(result.error));
    }
    // Check for common issues and add warnings
    if (result.success) {
        const manifest = result.data;
        // Warn if name isn't strict kebab-case. CC's schema only rejects spaces,
        // but the Claude.ai marketplace sync rejects non-kebab names. Surfacing
        // this here lets authors catch it in CI before the sync fails on them.
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(manifest.name)) {
            warnings.push({
                path: 'name',
                message: `Plugin name "${manifest.name}" is not kebab-case. Claude Code accepts ` +
                    `it, but the Claude.ai marketplace sync requires kebab-case ` +
                    `(lowercase letters, digits, and hyphens only, e.g., "my-plugin").`,
            });
        }
        // Warn if no version specified
        if (!manifest.version) {
            warnings.push({
                path: 'version',
                message: 'No version specified. Consider adding a version following semver (e.g., "1.0.0")',
            });
        }
        // Warn if no description
        if (!manifest.description) {
            warnings.push({
                path: 'description',
                message: 'No description provided. Adding a description helps users understand what your plugin does',
            });
        }
        // Warn if no author
        if (!manifest.author) {
            warnings.push({
                path: 'author',
                message: 'No author information provided. Consider adding author details for plugin attribution',
            });
        }
    }
    return {
        success: errors.length === 0,
        errors,
        warnings,
        filePath: absolutePath,
        fileType: 'plugin',
    };
}
/**
 * Validate a marketplace manifest file (marketplace.json)
 */
async function validateMarketplaceManifest(filePath) {
    const errors = [];
    const warnings = [];
    const absolutePath = path.resolve(filePath);
    // Read file content — handle ENOENT / EISDIR / permission errors directly
    let content;
    try {
        content = await (0, promises_1.readFile)(absolutePath, { encoding: 'utf-8' });
    }
    catch (error) {
        const code = (0, errors_js_1.getErrnoCode)(error);
        let message;
        if (code === 'ENOENT') {
            message = `File not found: ${absolutePath}`;
        }
        else if (code === 'EISDIR') {
            message = `Path is not a file: ${absolutePath}`;
        }
        else {
            message = `Failed to read file: ${(0, errors_js_1.errorMessage)(error)}`;
        }
        return {
            success: false,
            errors: [{ path: 'file', message, code }],
            warnings: [],
            filePath: absolutePath,
            fileType: 'marketplace',
        };
    }
    let parsed;
    try {
        parsed = (0, slowOperations_js_1.jsonParse)(content);
    }
    catch (error) {
        return {
            success: false,
            errors: [
                {
                    path: 'json',
                    message: `Invalid JSON syntax: ${(0, errors_js_1.errorMessage)(error)}`,
                },
            ],
            warnings: [],
            filePath: absolutePath,
            fileType: 'marketplace',
        };
    }
    // Check for path traversal in plugin sources before schema validation
    // This ensures we catch security issues even if schema validation fails
    if (parsed && typeof parsed === 'object') {
        const obj = parsed;
        if (Array.isArray(obj.plugins)) {
            obj.plugins.forEach((plugin, i) => {
                if (plugin && typeof plugin === 'object' && 'source' in plugin) {
                    const source = plugin.source;
                    // Check string sources (relative paths)
                    if (typeof source === 'string') {
                        checkPathTraversal(source, `plugins[${i}].source`, errors, marketplaceSourceHint(source));
                    }
                    // Check object-source .path (git-subdir: subdirectory within the
                    // remote repo, sparse-cloned). '..' here is a genuine traversal attempt
                    // within the remote repo tree, not a marketplace-root misunderstanding —
                    // keep the security framing (no marketplaceSourceHint). See #20895 review.
                    if (source &&
                        typeof source === 'object' &&
                        'path' in source &&
                        typeof source.path === 'string') {
                        checkPathTraversal(source.path, `plugins[${i}].source.path`, errors);
                    }
                }
            });
        }
    }
    // Validate against schema.
    // The base schemas are lenient (strip unknown keys) for runtime resilience,
    // but this is a developer tool — authors want typo feedback. We rebuild the
    // schema with .strict() here. Note .strict() on the outer object does NOT
    // propagate into z.array() elements, so we also override the plugins array
    // with strict entries to catch typos inside individual plugin entries too.
    const strictMarketplaceSchema = (0, schemas_js_1.PluginMarketplaceSchema)()
        .extend({
        plugins: v4_1.z.array((0, schemas_js_1.PluginMarketplaceEntrySchema)().strict()),
    })
        .strict();
    const result = strictMarketplaceSchema.safeParse(parsed);
    if (!result.success) {
        errors.push(...formatZodErrors(result.error));
    }
    // Check for common issues and add warnings
    if (result.success) {
        const marketplace = result.data;
        // Warn if no plugins
        if (!marketplace.plugins || marketplace.plugins.length === 0) {
            warnings.push({
                path: 'plugins',
                message: 'Marketplace has no plugins defined',
            });
        }
        // Check each plugin entry
        if (marketplace.plugins) {
            marketplace.plugins.forEach((plugin, i) => {
                // Check for duplicate plugin names
                const duplicates = marketplace.plugins.filter(p => p.name === plugin.name);
                if (duplicates.length > 1) {
                    errors.push({
                        path: `plugins[${i}].name`,
                        message: `Duplicate plugin name "${plugin.name}" found in marketplace`,
                    });
                }
            });
            // Version-mismatch check: for local-source entries that declare a
            // version, compare against the plugin's own plugin.json. At install
            // time, calculatePluginVersion (pluginVersioning.ts) prefers the
            // manifest version and silently ignores the entry version — so a
            // stale entry.version is invisible user confusion (marketplace UI
            // shows one version, /status shows another after install).
            // Only local sources: remote sources would need cloning to check.
            const manifestDir = path.dirname(absolutePath);
            const marketplaceRoot = path.basename(manifestDir) === '.claude-plugin'
                ? path.dirname(manifestDir)
                : manifestDir;
            for (const [i, entry] of marketplace.plugins.entries()) {
                if (!entry.version ||
                    typeof entry.source !== 'string' ||
                    !entry.source.startsWith('./')) {
                    continue;
                }
                const pluginJsonPath = path.join(marketplaceRoot, entry.source, '.claude-plugin', 'plugin.json');
                let manifestVersion;
                try {
                    const raw = await (0, promises_1.readFile)(pluginJsonPath, { encoding: 'utf-8' });
                    const parsed = (0, slowOperations_js_1.jsonParse)(raw);
                    if (typeof parsed.version === 'string') {
                        manifestVersion = parsed.version;
                    }
                }
                catch {
                    // Missing/unreadable plugin.json is someone else's error to report
                    continue;
                }
                if (manifestVersion && manifestVersion !== entry.version) {
                    warnings.push({
                        path: `plugins[${i}].version`,
                        message: `Entry declares version "${entry.version}" but ${entry.source}/.claude-plugin/plugin.json says "${manifestVersion}". ` +
                            `At install time, plugin.json wins (calculatePluginVersion precedence) — the entry version is silently ignored. ` +
                            `Update this entry to "${manifestVersion}" to match.`,
                    });
                }
            }
        }
        // Warn if no description in metadata
        if (!marketplace.metadata?.description) {
            warnings.push({
                path: 'metadata.description',
                message: 'No marketplace description provided. Adding a description helps users understand what this marketplace offers',
            });
        }
    }
    return {
        success: errors.length === 0,
        errors,
        warnings,
        filePath: absolutePath,
        fileType: 'marketplace',
    };
}
/**
 * Validate the YAML frontmatter in a plugin component markdown file.
 *
 * The runtime loader (parseFrontmatter) silently drops unparseable YAML to a
 * debug log and returns an empty object. That's the right resilience choice
 * for the load path, but authors running `claude plugin validate` want a hard
 * signal. This re-parses the frontmatter block and surfaces what the loader
 * would silently swallow.
 */
function validateComponentFile(filePath, content, fileType) {
    const errors = [];
    const warnings = [];
    const match = content.match(frontmatterParser_js_1.FRONTMATTER_REGEX);
    if (!match) {
        warnings.push({
            path: 'frontmatter',
            message: 'No frontmatter block found. Add YAML frontmatter between --- delimiters ' +
                'at the top of the file to set description and other metadata.',
        });
        return { success: true, errors, warnings, filePath, fileType };
    }
    const frontmatterText = match[1] || '';
    let parsed;
    try {
        parsed = (0, yaml_js_1.parseYaml)(frontmatterText);
    }
    catch (e) {
        errors.push({
            path: 'frontmatter',
            message: `YAML frontmatter failed to parse: ${(0, errors_js_1.errorMessage)(e)}. ` +
                `At runtime this ${fileType} loads with empty metadata (all frontmatter ` +
                `fields silently dropped).`,
        });
        return { success: false, errors, warnings, filePath, fileType };
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        errors.push({
            path: 'frontmatter',
            message: 'Frontmatter must be a YAML mapping (key: value pairs), got ' +
                `${Array.isArray(parsed) ? 'an array' : parsed === null ? 'null' : typeof parsed}.`,
        });
        return { success: false, errors, warnings, filePath, fileType };
    }
    const fm = parsed;
    // description: must be scalar. coerceDescriptionToString logs+drops arrays/objects at runtime.
    if (fm.description !== undefined) {
        const d = fm.description;
        if (typeof d !== 'string' &&
            typeof d !== 'number' &&
            typeof d !== 'boolean' &&
            d !== null) {
            errors.push({
                path: 'description',
                message: `description must be a string, got ${Array.isArray(d) ? 'array' : typeof d}. ` +
                    `At runtime this value is dropped.`,
            });
        }
    }
    else {
        warnings.push({
            path: 'description',
            message: `No description in frontmatter. A description helps users and Claude ` +
                `understand when to use this ${fileType}.`,
        });
    }
    // name: if present, must be a string (skills/commands use it as displayName;
    // plugin agents use it as the agentType stem — non-strings would stringify to garbage)
    if (fm.name !== undefined &&
        fm.name !== null &&
        typeof fm.name !== 'string') {
        errors.push({
            path: 'name',
            message: `name must be a string, got ${typeof fm.name}.`,
        });
    }
    // allowed-tools: string or array of strings
    const at = fm['allowed-tools'];
    if (at !== undefined && at !== null) {
        if (typeof at !== 'string' && !Array.isArray(at)) {
            errors.push({
                path: 'allowed-tools',
                message: `allowed-tools must be a string or array of strings, got ${typeof at}.`,
            });
        }
        else if (Array.isArray(at) && at.some(t => typeof t !== 'string')) {
            errors.push({
                path: 'allowed-tools',
                message: 'allowed-tools array must contain only strings.',
            });
        }
    }
    // shell: 'bash' | 'powershell' (controls !`cmd` block routing)
    const sh = fm.shell;
    if (sh !== undefined && sh !== null) {
        if (typeof sh !== 'string') {
            errors.push({
                path: 'shell',
                message: `shell must be a string, got ${typeof sh}.`,
            });
        }
        else {
            // Normalize to match parseShellFrontmatter() runtime behavior —
            // `shell: PowerShell` should not fail validation but work at runtime.
            const normalized = sh.trim().toLowerCase();
            if (normalized !== 'bash' && normalized !== 'powershell') {
                errors.push({
                    path: 'shell',
                    message: `shell must be 'bash' or 'powershell', got '${sh}'.`,
                });
            }
        }
    }
    return { success: errors.length === 0, errors, warnings, filePath, fileType };
}
/**
 * Validate a plugin's hooks.json file. Unlike frontmatter, this one HARD-ERRORS
 * at runtime (pluginLoader uses .parse() not .safeParse()) — a bad hooks.json
 * breaks the whole plugin. Surfacing it here is essential.
 */
async function validateHooksJson(filePath) {
    let content;
    try {
        content = await (0, promises_1.readFile)(filePath, { encoding: 'utf-8' });
    }
    catch (e) {
        const code = (0, errors_js_1.getErrnoCode)(e);
        // ENOENT is fine — hooks are optional
        if (code === 'ENOENT') {
            return {
                success: true,
                errors: [],
                warnings: [],
                filePath,
                fileType: 'hooks',
            };
        }
        return {
            success: false,
            errors: [
                { path: 'file', message: `Failed to read file: ${(0, errors_js_1.errorMessage)(e)}` },
            ],
            warnings: [],
            filePath,
            fileType: 'hooks',
        };
    }
    let parsed;
    try {
        parsed = (0, slowOperations_js_1.jsonParse)(content);
    }
    catch (e) {
        return {
            success: false,
            errors: [
                {
                    path: 'json',
                    message: `Invalid JSON syntax: ${(0, errors_js_1.errorMessage)(e)}. ` +
                        `At runtime this breaks the entire plugin load.`,
                },
            ],
            warnings: [],
            filePath,
            fileType: 'hooks',
        };
    }
    const result = (0, schemas_js_1.PluginHooksSchema)().safeParse(parsed);
    if (!result.success) {
        return {
            success: false,
            errors: formatZodErrors(result.error),
            warnings: [],
            filePath,
            fileType: 'hooks',
        };
    }
    return {
        success: true,
        errors: [],
        warnings: [],
        filePath,
        fileType: 'hooks',
    };
}
/**
 * Recursively collect .md files under a directory. Uses withFileTypes to
 * avoid a stat per entry. Returns absolute paths so error messages stay
 * readable.
 */
async function collectMarkdown(dir, isSkillsDir) {
    let entries;
    try {
        entries = await (0, promises_1.readdir)(dir, { withFileTypes: true });
    }
    catch (e) {
        const code = (0, errors_js_1.getErrnoCode)(e);
        if (code === 'ENOENT' || code === 'ENOTDIR')
            return [];
        throw e;
    }
    // Skills use <name>/SKILL.md — only descend one level, only collect SKILL.md.
    // Matches the runtime loader: single .md files in skills/ are NOT loaded,
    // and subdirectories of a skill dir aren't scanned. Paths are speculative
    // (the subdir may lack SKILL.md); the caller handles ENOENT.
    if (isSkillsDir) {
        return entries
            .filter(e => e.isDirectory())
            .map(e => path.join(dir, e.name, 'SKILL.md'));
    }
    // Commands/agents: recurse and collect all .md files.
    const out = [];
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...(await collectMarkdown(full, false)));
        }
        else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
            out.push(full);
        }
    }
    return out;
}
/**
 * Validate the content files inside a plugin directory — skills, agents,
 * commands, and hooks.json. Scans the default component directories (the
 * manifest can declare custom paths but the default layout covers the vast
 * majority of plugins; this is a linter, not a loader).
 *
 * Returns one ValidationResult per file that has errors or warnings. A clean
 * plugin returns an empty array.
 */
async function validatePluginContents(pluginDir) {
    const results = [];
    const dirs = [
        ['skill', path.join(pluginDir, 'skills')],
        ['agent', path.join(pluginDir, 'agents')],
        ['command', path.join(pluginDir, 'commands')],
    ];
    for (const [fileType, dir] of dirs) {
        const files = await collectMarkdown(dir, fileType === 'skill');
        for (const filePath of files) {
            let content;
            try {
                content = await (0, promises_1.readFile)(filePath, { encoding: 'utf-8' });
            }
            catch (e) {
                // ENOENT is expected for speculative skill paths (subdirs without SKILL.md)
                if ((0, errors_js_1.isENOENT)(e))
                    continue;
                results.push({
                    success: false,
                    errors: [
                        { path: 'file', message: `Failed to read: ${(0, errors_js_1.errorMessage)(e)}` },
                    ],
                    warnings: [],
                    filePath,
                    fileType,
                });
                continue;
            }
            const r = validateComponentFile(filePath, content, fileType);
            if (r.errors.length > 0 || r.warnings.length > 0) {
                results.push(r);
            }
        }
    }
    const hooksResult = await validateHooksJson(path.join(pluginDir, 'hooks', 'hooks.json'));
    if (hooksResult.errors.length > 0 || hooksResult.warnings.length > 0) {
        results.push(hooksResult);
    }
    return results;
}
/**
 * Validate a manifest file or directory (auto-detects type)
 */
async function validateManifest(filePath) {
    const absolutePath = path.resolve(filePath);
    // Stat path to check if it's a directory — handle ENOENT inline
    let stats = null;
    try {
        stats = await (0, promises_1.stat)(absolutePath);
    }
    catch (e) {
        if (!(0, errors_js_1.isENOENT)(e)) {
            throw e;
        }
    }
    if (stats?.isDirectory()) {
        // Look for manifest files in .claude-plugin directory
        // Prefer marketplace.json over plugin.json
        const marketplacePath = path.join(absolutePath, '.claude-plugin', 'marketplace.json');
        const marketplaceResult = await validateMarketplaceManifest(marketplacePath);
        // Only fall through if the marketplace file was not found (ENOENT)
        if (marketplaceResult.errors[0]?.code !== 'ENOENT') {
            return marketplaceResult;
        }
        const pluginPath = path.join(absolutePath, '.claude-plugin', 'plugin.json');
        const pluginResult = await validatePluginManifest(pluginPath);
        if (pluginResult.errors[0]?.code !== 'ENOENT') {
            return pluginResult;
        }
        return {
            success: false,
            errors: [
                {
                    path: 'directory',
                    message: `No manifest found in directory. Expected .claude-plugin/marketplace.json or .claude-plugin/plugin.json`,
                },
            ],
            warnings: [],
            filePath: absolutePath,
            fileType: 'plugin',
        };
    }
    const manifestType = detectManifestType(filePath);
    switch (manifestType) {
        case 'plugin':
            return validatePluginManifest(filePath);
        case 'marketplace':
            return validateMarketplaceManifest(filePath);
        case 'unknown': {
            // Try to parse and guess based on content
            try {
                const content = await (0, promises_1.readFile)(absolutePath, { encoding: 'utf-8' });
                const parsed = (0, slowOperations_js_1.jsonParse)(content);
                // Heuristic: if it has a "plugins" array, it's probably a marketplace
                if (Array.isArray(parsed.plugins)) {
                    return validateMarketplaceManifest(filePath);
                }
            }
            catch (e) {
                const code = (0, errors_js_1.getErrnoCode)(e);
                if (code === 'ENOENT') {
                    return {
                        success: false,
                        errors: [
                            {
                                path: 'file',
                                message: `File not found: ${absolutePath}`,
                            },
                        ],
                        warnings: [],
                        filePath: absolutePath,
                        fileType: 'plugin', // Default to plugin for error reporting
                    };
                }
                // Fall through to default validation for other errors (e.g., JSON parse)
            }
            // Default: validate as plugin manifest
            return validatePluginManifest(filePath);
        }
    }
}
