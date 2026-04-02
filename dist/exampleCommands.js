"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshExampleCommands = exports.getExampleCommandFromCache = void 0;
exports.countAndSortItems = countAndSortItems;
exports.pickDiverseCoreFiles = pickDiverseCoreFiles;
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const sample_js_1 = __importDefault(require("lodash-es/sample.js"));
const cwd_js_1 = require("../utils/cwd.js");
const config_js_1 = require("./config.js");
const env_js_1 = require("./env.js");
const execFileNoThrow_js_1 = require("./execFileNoThrow.js");
const git_js_1 = require("./git.js");
const log_js_1 = require("./log.js");
const user_js_1 = require("./user.js");
// Patterns that mark a file as non-core (auto-generated, dependency, or config).
// Used to filter example-command filename suggestions deterministically
// instead of shelling out to Haiku.
const NON_CORE_PATTERNS = [
    // lock / dependency manifests
    /(?:^|\/)(?:package-lock\.json|yarn\.lock|bun\.lock|bun\.lockb|pnpm-lock\.yaml|Pipfile\.lock|poetry\.lock|Cargo\.lock|Gemfile\.lock|go\.sum|composer\.lock|uv\.lock)$/,
    // generated / build artifacts
    /\.generated\./,
    /(?:^|\/)(?:dist|build|out|target|node_modules|\.next|__pycache__)\//,
    /\.(?:min\.js|min\.css|map|pyc|pyo)$/,
    // data / docs / config extensions (not "write a test for" material)
    /\.(?:json|ya?ml|toml|xml|ini|cfg|conf|env|lock|txt|md|mdx|rst|csv|log|svg)$/i,
    // configuration / metadata
    /(?:^|\/)\.?(?:eslintrc|prettierrc|babelrc|editorconfig|gitignore|gitattributes|dockerignore|npmrc)/,
    /(?:^|\/)(?:tsconfig|jsconfig|biome|vitest\.config|jest\.config|webpack\.config|vite\.config|rollup\.config)\.[a-z]+$/,
    /(?:^|\/)\.(?:github|vscode|idea|claude)\//,
    // docs / changelogs (not "how does X work" material)
    /(?:^|\/)(?:CHANGELOG|LICENSE|CONTRIBUTING|CODEOWNERS|README)(?:\.[a-z]+)?$/i,
];
function isCoreFile(path) {
    return !NON_CORE_PATTERNS.some(p => p.test(path));
}
/**
 * Counts occurrences of items in an array and returns the top N items
 * sorted by count in descending order, formatted as a string.
 */
function countAndSortItems(items, topN = 20) {
    const counts = new Map();
    for (const item of items) {
        counts.set(item, (counts.get(item) || 0) + 1);
    }
    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([item, count]) => `${count.toString().padStart(6)} ${item}`)
        .join('\n');
}
/**
 * Picks up to `want` basenames from a frequency-sorted list of paths,
 * skipping non-core files and spreading across different directories.
 * Returns empty array if fewer than `want` core files are available.
 */
function pickDiverseCoreFiles(sortedPaths, want) {
    const picked = [];
    const seenBasenames = new Set();
    const dirTally = new Map();
    // Greedy: on each pass allow +1 file per directory. Keeps the
    // top-5 from collapsing into a single hot folder while still
    // letting a dominant folder contribute multiple files if the
    // repo is narrow.
    for (let cap = 1; picked.length < want && cap <= want; cap++) {
        for (const p of sortedPaths) {
            if (picked.length >= want)
                break;
            if (!isCoreFile(p))
                continue;
            const lastSep = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
            const base = lastSep >= 0 ? p.slice(lastSep + 1) : p;
            if (!base || seenBasenames.has(base))
                continue;
            const dir = lastSep >= 0 ? p.slice(0, lastSep) : '.';
            if ((dirTally.get(dir) ?? 0) >= cap)
                continue;
            picked.push(base);
            seenBasenames.add(base);
            dirTally.set(dir, (dirTally.get(dir) ?? 0) + 1);
        }
    }
    return picked.length >= want ? picked : [];
}
async function getFrequentlyModifiedFiles() {
    if (process.env.NODE_ENV === 'test')
        return [];
    if (env_js_1.env.platform === 'win32')
        return [];
    if (!(await (0, git_js_1.getIsGit)()))
        return [];
    try {
        // Collect frequently-modified files, preferring the user's own commits.
        const userEmail = await (0, user_js_1.getGitEmail)();
        const logArgs = [
            'log',
            '-n',
            '1000',
            '--pretty=format:',
            '--name-only',
            '--diff-filter=M',
        ];
        const counts = new Map();
        const tallyInto = (stdout) => {
            for (const line of stdout.split('\n')) {
                const f = line.trim();
                if (f)
                    counts.set(f, (counts.get(f) ?? 0) + 1);
            }
        };
        if (userEmail) {
            const { stdout } = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)('git', [...logArgs, `--author=${userEmail}`], { cwd: (0, cwd_js_1.getCwd)() });
            tallyInto(stdout);
        }
        // Fall back to all authors if the user's own history is thin.
        if (counts.size < 10) {
            const { stdout } = await (0, execFileNoThrow_js_1.execFileNoThrowWithCwd)((0, git_js_1.gitExe)(), logArgs, {
                cwd: (0, cwd_js_1.getCwd)(),
            });
            tallyInto(stdout);
        }
        const sorted = Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([p]) => p);
        return pickDiverseCoreFiles(sorted, 5);
    }
    catch (err) {
        (0, log_js_1.logError)(err);
        return [];
    }
}
const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;
exports.getExampleCommandFromCache = (0, memoize_js_1.default)(() => {
    const projectConfig = (0, config_js_1.getCurrentProjectConfig)();
    const frequentFile = projectConfig.exampleFiles?.length
        ? (0, sample_js_1.default)(projectConfig.exampleFiles)
        : '<filepath>';
    const commands = [
        'fix lint errors',
        'fix typecheck errors',
        `how does ${frequentFile} work?`,
        `refactor ${frequentFile}`,
        'how do I log an error?',
        `edit ${frequentFile} to...`,
        `write a test for ${frequentFile}`,
        'create a util logging.py that...',
    ];
    return `Try "${(0, sample_js_1.default)(commands)}"`;
});
exports.refreshExampleCommands = (0, memoize_js_1.default)(async () => {
    const projectConfig = (0, config_js_1.getCurrentProjectConfig)();
    const now = Date.now();
    const lastGenerated = projectConfig.exampleFilesGeneratedAt ?? 0;
    // Regenerate examples if they're over a week old
    if (now - lastGenerated > ONE_WEEK_IN_MS) {
        projectConfig.exampleFiles = [];
    }
    // If no example files cached, kickstart fetch in background
    if (!projectConfig.exampleFiles?.length) {
        void getFrequentlyModifiedFiles().then(files => {
            if (files.length) {
                (0, config_js_1.saveCurrentProjectConfig)(current => ({
                    ...current,
                    exampleFiles: files,
                    exampleFilesGeneratedAt: Date.now(),
                }));
            }
        });
    }
});
