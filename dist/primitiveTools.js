"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getReplPrimitiveTools = getReplPrimitiveTools;
const AgentTool_js_1 = require("../AgentTool/AgentTool.js");
const BashTool_js_1 = require("../BashTool/BashTool.js");
const FileEditTool_js_1 = require("../FileEditTool/FileEditTool.js");
const FileReadTool_js_1 = require("../FileReadTool/FileReadTool.js");
const FileWriteTool_js_1 = require("../FileWriteTool/FileWriteTool.js");
const GlobTool_js_1 = require("../GlobTool/GlobTool.js");
const GrepTool_js_1 = require("../GrepTool/GrepTool.js");
const NotebookEditTool_js_1 = require("../NotebookEditTool/NotebookEditTool.js");
let _primitiveTools;
/**
 * Primitive tools hidden from direct model use when REPL mode is on
 * (REPL_ONLY_TOOLS) but still accessible inside the REPL VM context.
 * Exported so display-side code (collapseReadSearch, renderers) can
 * classify/render virtual messages for these tools even when they're
 * absent from the filtered execution tools list.
 *
 * Lazy getter — the import chain collapseReadSearch.ts → primitiveTools.ts
 * → FileReadTool.tsx → ... loops back through the tool registry, so a
 * top-level const hits "Cannot access before initialization". Deferring
 * to call time avoids the TDZ.
 *
 * Referenced directly rather than via getAllBaseTools() because that
 * excludes Glob/Grep when hasEmbeddedSearchTools() is true.
 */
function getReplPrimitiveTools() {
    return (_primitiveTools ?? (_primitiveTools = [
        FileReadTool_js_1.FileReadTool,
        FileWriteTool_js_1.FileWriteTool,
        FileEditTool_js_1.FileEditTool,
        GlobTool_js_1.GlobTool,
        GrepTool_js_1.GrepTool,
        BashTool_js_1.BashTool,
        NotebookEditTool_js_1.NotebookEditTool,
        AgentTool_js_1.AgentTool,
    ]));
}
