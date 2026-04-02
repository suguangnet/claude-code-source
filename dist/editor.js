"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExternalEditor = void 0;
exports.classifyGuiEditor = classifyGuiEditor;
exports.openFileInExternalEditor = openFileInExternalEditor;
const child_process_1 = require("child_process");
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const path_1 = require("path");
const instances_js_1 = __importDefault(require("../ink/instances.js"));
const debug_js_1 = require("./debug.js");
const which_js_1 = require("./which.js");
function isCommandAvailable(command) {
    return !!(0, which_js_1.whichSync)(command);
}
// GUI editors that open in a separate window and can be spawned detached
// without fighting the TUI for stdin. VS Code forks (cursor, windsurf, codium)
// are listed explicitly since none contain 'code' as a substring.
const GUI_EDITORS = [
    'code',
    'cursor',
    'windsurf',
    'codium',
    'subl',
    'atom',
    'gedit',
    'notepad++',
    'notepad',
];
// Editors that accept +N as a goto-line argument. The Windows default
// ('start /wait notepad') does not — notepad treats +42 as a filename.
const PLUS_N_EDITORS = /\b(vi|vim|nvim|nano|emacs|pico|micro|helix|hx)\b/;
// VS Code and forks use -g file:line. subl uses bare file:line (no -g).
const VSCODE_FAMILY = new Set(['code', 'cursor', 'windsurf', 'codium']);
/**
 * Classify the editor as GUI or not. Returns the matched GUI family name
 * for goto-line argv selection, or undefined for terminal editors.
 * Note: this is classification only — spawn the user's actual binary, not
 * this return value, so `code-insiders` / absolute paths are preserved.
 *
 * Uses basename so /home/alice/code/bin/nvim doesn't match 'code' via the
 * directory component. code-insiders → still matches 'code', /usr/bin/code →
 * 'code' → matches.
 */
function classifyGuiEditor(editor) {
    const base = (0, path_1.basename)(editor.split(' ')[0] ?? '');
    return GUI_EDITORS.find(g => base.includes(g));
}
/**
 * Build goto-line argv for a GUI editor. VS Code family uses -g file:line;
 * subl uses bare file:line; others don't support goto-line.
 */
function guiGotoArgv(guiFamily, filePath, line) {
    if (!line)
        return [filePath];
    if (VSCODE_FAMILY.has(guiFamily))
        return ['-g', `${filePath}:${line}`];
    if (guiFamily === 'subl')
        return [`${filePath}:${line}`];
    return [filePath];
}
/**
 * Launch a file in the user's external editor.
 *
 * For GUI editors (code, subl, etc.): spawns detached — the editor opens
 * in a separate window and Claude Code stays interactive.
 *
 * For terminal editors (vim, nvim, nano, etc.): blocks via Ink's alt-screen
 * handoff until the editor exits. This is the same dance as editFileInEditor()
 * in promptEditor.ts, minus the read-back.
 *
 * Returns true if the editor was launched, false if no editor is available.
 */
function openFileInExternalEditor(filePath, line) {
    const editor = (0, exports.getExternalEditor)();
    if (!editor)
        return false;
    // Spawn the user's actual binary (preserves code-insiders, abs paths, etc.).
    // Split into binary + extra args so multi-word values like 'start /wait
    // notepad' or 'code --wait' propagate all tokens to spawn.
    const parts = editor.split(' ');
    const base = parts[0] ?? editor;
    const editorArgs = parts.slice(1);
    const guiFamily = classifyGuiEditor(editor);
    if (guiFamily) {
        const gotoArgv = guiGotoArgv(guiFamily, filePath, line);
        const detachedOpts = { detached: true, stdio: 'ignore' };
        let child;
        if (process.platform === 'win32') {
            // shell: true on win32 so code.cmd / cursor.cmd / windsurf.cmd resolve —
            // CreateProcess can't execute .cmd/.bat directly. Assemble quoted command
            // string; cmd.exe doesn't expand $() or backticks inside double quotes.
            // Quote each arg so paths with spaces survive the shell join.
            const gotoStr = gotoArgv.map(a => `"${a}"`).join(' ');
            child = (0, child_process_1.spawn)(`${editor} ${gotoStr}`, { ...detachedOpts, shell: true });
        }
        else {
            // POSIX: argv array with no shell — injection-safe. shell: true would
            // expand $() / backticks inside double quotes, and filePath is
            // filesystem-sourced (possible RCE from a malicious repo filename).
            child = (0, child_process_1.spawn)(base, [...editorArgs, ...gotoArgv], detachedOpts);
        }
        // spawn() emits ENOENT asynchronously. ENOENT on $VISUAL/$EDITOR is a
        // user-config error, not an internal bug — don't pollute error telemetry.
        child.on('error', e => (0, debug_js_1.logForDebugging)(`editor spawn failed: ${e}`, { level: 'error' }));
        child.unref();
        return true;
    }
    // Terminal editor — needs alt-screen handoff since it takes over the
    // terminal. Blocks until the editor exits.
    const inkInstance = instances_js_1.default.get(process.stdout);
    if (!inkInstance)
        return false;
    // Only prepend +N for editors known to support it — notepad treats +42 as a
    // filename to open. Test basename so /home/vim/bin/kak doesn't match 'vim'
    // via the directory segment.
    const useGotoLine = line && PLUS_N_EDITORS.test((0, path_1.basename)(base));
    inkInstance.enterAlternateScreen();
    try {
        const syncOpts = { stdio: 'inherit' };
        let result;
        if (process.platform === 'win32') {
            // On Windows use shell: true so cmd.exe builtins like `start` resolve.
            // shell: true joins args unquoted, so assemble the command string with
            // explicit quoting ourselves (matching promptEditor.ts:74). spawnSync
            // returns errors in .error rather than throwing.
            const lineArg = useGotoLine ? `+${line} ` : '';
            result = (0, child_process_1.spawnSync)(`${editor} ${lineArg}"${filePath}"`, {
                ...syncOpts,
                shell: true,
            });
        }
        else {
            // POSIX: spawn directly (no shell), argv array is quote-safe.
            const args = [
                ...editorArgs,
                ...(useGotoLine ? [`+${line}`, filePath] : [filePath]),
            ];
            result = (0, child_process_1.spawnSync)(base, args, syncOpts);
        }
        if (result.error) {
            (0, debug_js_1.logForDebugging)(`editor spawn failed: ${result.error}`, {
                level: 'error',
            });
            return false;
        }
        return true;
    }
    finally {
        inkInstance.exitAlternateScreen();
    }
}
exports.getExternalEditor = (0, memoize_js_1.default)(() => {
    // Prioritize environment variables
    if (process.env.VISUAL?.trim()) {
        return process.env.VISUAL.trim();
    }
    if (process.env.EDITOR?.trim()) {
        return process.env.EDITOR.trim();
    }
    // `isCommandAvailable` breaks the claude process' stdin on Windows
    // as a bandaid, we skip it
    if (process.platform === 'win32') {
        return 'start /wait notepad';
    }
    // Search for available editors in order of preference
    const editors = ['code', 'vi', 'nano'];
    return editors.find(command => isCommandAvailable(command));
});
