"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.editFileInEditor = editFileInEditor;
exports.editPromptInEditor = editPromptInEditor;
const history_js_1 = require("../history.js");
const instances_js_1 = __importDefault(require("../ink/instances.js"));
const editor_js_1 = require("./editor.js");
const execSyncWrapper_js_1 = require("./execSyncWrapper.js");
const fsOperations_js_1 = require("./fsOperations.js");
const ide_js_1 = require("./ide.js");
const slowOperations_js_1 = require("./slowOperations.js");
const tempfile_js_1 = require("./tempfile.js");
// Map of editor command overrides (e.g., to add wait flags)
const EDITOR_OVERRIDES = {
    code: 'code -w', // VS Code: wait for file to be closed
    subl: 'subl --wait', // Sublime Text: wait for file to be closed
};
function isGuiEditor(editor) {
    return (0, editor_js_1.classifyGuiEditor)(editor) !== undefined;
}
// sync IO: called from sync context (React components, sync command handlers)
function editFileInEditor(filePath) {
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    const inkInstance = instances_js_1.default.get(process.stdout);
    if (!inkInstance) {
        throw new Error('Ink instance not found - cannot pause rendering');
    }
    const editor = (0, editor_js_1.getExternalEditor)();
    if (!editor) {
        return { content: null };
    }
    try {
        fs.statSync(filePath);
    }
    catch {
        return { content: null };
    }
    const useAlternateScreen = !isGuiEditor(editor);
    if (useAlternateScreen) {
        // Terminal editors (vi, nano, etc.) take over the terminal. Delegate to
        // Ink's alt-screen-aware handoff so fullscreen mode (where <AlternateScreen>
        // already entered alt screen) doesn't get knocked back to the main buffer
        // by a hardcoded ?1049l. enterAlternateScreen() internally calls pause()
        // and suspendStdin(); exitAlternateScreen() undoes both and resets frame
        // state so the next render writes from scratch.
        inkInstance.enterAlternateScreen();
    }
    else {
        // GUI editors (code, subl, etc.) open in a separate window — just pause
        // Ink and release stdin while they're open.
        inkInstance.pause();
        inkInstance.suspendStdin();
    }
    try {
        // Use override command if available, otherwise use the editor as-is
        const editorCommand = EDITOR_OVERRIDES[editor] ?? editor;
        (0, execSyncWrapper_js_1.execSync_DEPRECATED)(`${editorCommand} "${filePath}"`, {
            stdio: 'inherit',
        });
        // Read the edited content
        const editedContent = fs.readFileSync(filePath, { encoding: 'utf-8' });
        return { content: editedContent };
    }
    catch (err) {
        if (typeof err === 'object' &&
            err !== null &&
            'status' in err &&
            typeof err.status === 'number') {
            const status = err.status;
            if (status !== 0) {
                const editorName = (0, ide_js_1.toIDEDisplayName)(editor);
                return {
                    content: null,
                    error: `${editorName} exited with code ${status}`,
                };
            }
        }
        return { content: null };
    }
    finally {
        if (useAlternateScreen) {
            inkInstance.exitAlternateScreen();
        }
        else {
            inkInstance.resumeStdin();
            inkInstance.resume();
        }
    }
}
/**
 * Re-collapse expanded pasted text by finding content that matches
 * pastedContents and replacing it with references.
 */
function recollapsePastedContent(editedPrompt, originalPrompt, pastedContents) {
    let collapsed = editedPrompt;
    // Find pasted content in the edited text and re-collapse it
    for (const [id, content] of Object.entries(pastedContents)) {
        if (content.type === 'text') {
            const pasteId = parseInt(id);
            const contentStr = content.content;
            // Check if this exact content exists in the edited prompt
            const contentIndex = collapsed.indexOf(contentStr);
            if (contentIndex !== -1) {
                // Replace with reference
                const numLines = (0, history_js_1.getPastedTextRefNumLines)(contentStr);
                const ref = (0, history_js_1.formatPastedTextRef)(pasteId, numLines);
                collapsed =
                    collapsed.slice(0, contentIndex) +
                        ref +
                        collapsed.slice(contentIndex + contentStr.length);
            }
        }
    }
    return collapsed;
}
// sync IO: called from sync context (React components, sync command handlers)
function editPromptInEditor(currentPrompt, pastedContents) {
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    const tempFile = (0, tempfile_js_1.generateTempFilePath)();
    try {
        // Expand any pasted text references before editing
        const expandedPrompt = pastedContents
            ? (0, history_js_1.expandPastedTextRefs)(currentPrompt, pastedContents)
            : currentPrompt;
        // Write expanded prompt to temp file
        (0, slowOperations_js_1.writeFileSync_DEPRECATED)(tempFile, expandedPrompt, {
            encoding: 'utf-8',
            flush: true,
        });
        // Delegate to editFileInEditor
        const result = editFileInEditor(tempFile);
        if (result.content === null) {
            return result;
        }
        // Trim a single trailing newline if present (common editor behavior)
        let finalContent = result.content;
        if (finalContent.endsWith('\n') && !finalContent.endsWith('\n\n')) {
            finalContent = finalContent.slice(0, -1);
        }
        // Re-collapse pasted content if it wasn't edited
        if (pastedContents) {
            finalContent = recollapsePastedContent(finalContent, currentPrompt, pastedContents);
        }
        return { content: finalContent };
    }
    finally {
        // Clean up temp file
        try {
            fs.unlinkSync(tempFile);
        }
        catch {
            // Ignore cleanup errors
        }
    }
}
