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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParsedCommand = exports.RegexParsedCommand_DEPRECATED = void 0;
exports.buildParsedCommandFromRoot = buildParsedCommandFromRoot;
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const commands_js_1 = require("./commands.js");
const treeSitterAnalysis_js_1 = require("./treeSitterAnalysis.js");
/**
 * @deprecated Legacy regex/shell-quote path. Only used when tree-sitter is
 * unavailable. The primary gate is parseForSecurity (ast.ts).
 *
 * Regex-based fallback implementation using shell-quote parser.
 * Used when tree-sitter is not available.
 * Exported for testing purposes.
 */
class RegexParsedCommand_DEPRECATED {
    constructor(command) {
        this.originalCommand = command;
    }
    toString() {
        return this.originalCommand;
    }
    getPipeSegments() {
        try {
            const parts = (0, commands_js_1.splitCommandWithOperators)(this.originalCommand);
            const segments = [];
            let currentSegment = [];
            for (const part of parts) {
                if (part === '|') {
                    if (currentSegment.length > 0) {
                        segments.push(currentSegment.join(' '));
                        currentSegment = [];
                    }
                }
                else {
                    currentSegment.push(part);
                }
            }
            if (currentSegment.length > 0) {
                segments.push(currentSegment.join(' '));
            }
            return segments.length > 0 ? segments : [this.originalCommand];
        }
        catch {
            return [this.originalCommand];
        }
    }
    withoutOutputRedirections() {
        if (!this.originalCommand.includes('>')) {
            return this.originalCommand;
        }
        const { commandWithoutRedirections, redirections } = (0, commands_js_1.extractOutputRedirections)(this.originalCommand);
        return redirections.length > 0
            ? commandWithoutRedirections
            : this.originalCommand;
    }
    getOutputRedirections() {
        const { redirections } = (0, commands_js_1.extractOutputRedirections)(this.originalCommand);
        return redirections;
    }
    getTreeSitterAnalysis() {
        return null;
    }
}
exports.RegexParsedCommand_DEPRECATED = RegexParsedCommand_DEPRECATED;
function visitNodes(node, visitor) {
    visitor(node);
    for (const child of node.children) {
        visitNodes(child, visitor);
    }
}
function extractPipePositions(rootNode) {
    const pipePositions = [];
    visitNodes(rootNode, node => {
        if (node.type === 'pipeline') {
            for (const child of node.children) {
                if (child.type === '|') {
                    pipePositions.push(child.startIndex);
                }
            }
        }
    });
    // visitNodes is depth-first. For `a | b && c | d`, the outer `list` nests
    // the second pipeline as a sibling of the first, so the outer `|` is
    // visited before the inner one — positions arrive out of order.
    // getPipeSegments iterates them to slice left-to-right, so sort here.
    return pipePositions.sort((a, b) => a - b);
}
function extractRedirectionNodes(rootNode) {
    const redirections = [];
    visitNodes(rootNode, node => {
        if (node.type === 'file_redirect') {
            const children = node.children;
            const op = children.find(c => c.type === '>' || c.type === '>>');
            const target = children.find(c => c.type === 'word');
            if (op && target) {
                redirections.push({
                    startIndex: node.startIndex,
                    endIndex: node.endIndex,
                    target: target.text,
                    operator: op.type,
                });
            }
        }
    });
    return redirections;
}
class TreeSitterParsedCommand {
    constructor(command, pipePositions, redirectionNodes, treeSitterAnalysis) {
        this.originalCommand = command;
        this.commandBytes = Buffer.from(command, 'utf8');
        this.pipePositions = pipePositions;
        this.redirectionNodes = redirectionNodes;
        this.treeSitterAnalysis = treeSitterAnalysis;
    }
    toString() {
        return this.originalCommand;
    }
    getPipeSegments() {
        if (this.pipePositions.length === 0) {
            return [this.originalCommand];
        }
        const segments = [];
        let currentStart = 0;
        for (const pipePos of this.pipePositions) {
            const segment = this.commandBytes
                .subarray(currentStart, pipePos)
                .toString('utf8')
                .trim();
            if (segment) {
                segments.push(segment);
            }
            currentStart = pipePos + 1;
        }
        const lastSegment = this.commandBytes
            .subarray(currentStart)
            .toString('utf8')
            .trim();
        if (lastSegment) {
            segments.push(lastSegment);
        }
        return segments;
    }
    withoutOutputRedirections() {
        if (this.redirectionNodes.length === 0)
            return this.originalCommand;
        const sorted = [...this.redirectionNodes].sort((a, b) => b.startIndex - a.startIndex);
        let result = this.commandBytes;
        for (const redir of sorted) {
            result = Buffer.concat([
                result.subarray(0, redir.startIndex),
                result.subarray(redir.endIndex),
            ]);
        }
        return result.toString('utf8').trim().replace(/\s+/g, ' ');
    }
    getOutputRedirections() {
        return this.redirectionNodes.map(({ target, operator }) => ({
            target,
            operator,
        }));
    }
    getTreeSitterAnalysis() {
        return this.treeSitterAnalysis;
    }
}
const getTreeSitterAvailable = (0, memoize_js_1.default)(async () => {
    try {
        const { parseCommand } = await Promise.resolve().then(() => __importStar(require('./parser.js')));
        const testResult = await parseCommand('echo test');
        return testResult !== null;
    }
    catch {
        return false;
    }
});
/**
 * Build a TreeSitterParsedCommand from a pre-parsed AST root. Lets callers
 * that already have the tree skip the redundant native.parse that
 * ParsedCommand.parse would do.
 */
function buildParsedCommandFromRoot(command, root) {
    const pipePositions = extractPipePositions(root);
    const redirectionNodes = extractRedirectionNodes(root);
    const analysis = (0, treeSitterAnalysis_js_1.analyzeCommand)(root, command);
    return new TreeSitterParsedCommand(command, pipePositions, redirectionNodes, analysis);
}
async function doParse(command) {
    if (!command)
        return null;
    const treeSitterAvailable = await getTreeSitterAvailable();
    if (treeSitterAvailable) {
        try {
            const { parseCommand } = await Promise.resolve().then(() => __importStar(require('./parser.js')));
            const data = await parseCommand(command);
            if (data) {
                // Native NAPI parser returns plain JS objects (no WASM handles);
                // nothing to free — extract directly.
                return buildParsedCommandFromRoot(command, data.rootNode);
            }
        }
        catch {
            // Fall through to regex implementation
        }
    }
    // Fallback to regex implementation
    return new RegexParsedCommand_DEPRECATED(command);
}
// Single-entry cache: legacy callers (bashCommandIsSafeAsync,
// buildSegmentWithoutRedirections) may call ParsedCommand.parse repeatedly
// with the same command string. Each parse() is ~1 native.parse + ~6 tree
// walks, so caching the most recent command skips the redundant work.
// Size-1 bound avoids leaking TreeSitterParsedCommand instances.
let lastCmd;
let lastResult;
/**
 * ParsedCommand provides methods for working with shell commands.
 * Uses tree-sitter when available for quote-aware parsing,
 * falls back to regex-based parsing otherwise.
 */
exports.ParsedCommand = {
    /**
     * Parse a command string and return a ParsedCommand instance.
     * Returns null if parsing fails completely.
     */
    parse(command) {
        if (command === lastCmd && lastResult !== undefined) {
            return lastResult;
        }
        lastCmd = command;
        lastResult = doParse(command);
        return lastResult;
    },
};
