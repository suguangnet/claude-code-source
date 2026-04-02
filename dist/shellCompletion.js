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
exports.getShellCompletions = getShellCompletions;
const shellQuote_js_1 = require("../bash/shellQuote.js");
const debug_js_1 = require("../debug.js");
const localInstaller_js_1 = require("../localInstaller.js");
const Shell = __importStar(require("../Shell.js"));
// Constants
const MAX_SHELL_COMPLETIONS = 15;
const SHELL_COMPLETION_TIMEOUT_MS = 1000;
const COMMAND_OPERATORS = ['|', '||', '&&', ';'];
/**
 * Check if a parsed token is a command operator (|, ||, &&, ;)
 */
function isCommandOperator(token) {
    return (typeof token === 'object' &&
        token !== null &&
        'op' in token &&
        COMMAND_OPERATORS.includes(token.op));
}
/**
 * Determine completion type based solely on prefix characteristics
 */
function getCompletionTypeFromPrefix(prefix) {
    if (prefix.startsWith('$')) {
        return 'variable';
    }
    if (prefix.includes('/') ||
        prefix.startsWith('~') ||
        prefix.startsWith('.')) {
        return 'file';
    }
    return 'command';
}
/**
 * Find the last string token and its index in parsed tokens
 */
function findLastStringToken(tokens) {
    const i = tokens.findLastIndex(t => typeof t === 'string');
    return i !== -1 ? { token: tokens[i], index: i } : null;
}
/**
 * Check if we're in a context that expects a new command
 * (at start of input or after a command operator)
 */
function isNewCommandContext(tokens, currentTokenIndex) {
    if (currentTokenIndex === 0) {
        return true;
    }
    const prevToken = tokens[currentTokenIndex - 1];
    return prevToken !== undefined && isCommandOperator(prevToken);
}
/**
 * Parse input to extract completion context
 */
function parseInputContext(input, cursorOffset) {
    const beforeCursor = input.slice(0, cursorOffset);
    // Check if it's a variable prefix, before expanding with shell-quote
    const varMatch = beforeCursor.match(/\$[a-zA-Z_][a-zA-Z0-9_]*$/);
    if (varMatch) {
        return { prefix: varMatch[0], completionType: 'variable' };
    }
    // Parse with shell-quote
    const parseResult = (0, shellQuote_js_1.tryParseShellCommand)(beforeCursor);
    if (!parseResult.success) {
        // Fallback to simple parsing
        const tokens = beforeCursor.split(/\s+/);
        const prefix = tokens[tokens.length - 1] || '';
        const isFirstToken = tokens.length === 1 && !beforeCursor.includes(' ');
        const completionType = isFirstToken
            ? 'command'
            : getCompletionTypeFromPrefix(prefix);
        return { prefix, completionType };
    }
    // Extract current token
    const lastToken = findLastStringToken(parseResult.tokens);
    if (!lastToken) {
        // No string token found - check if after operator
        const lastParsedToken = parseResult.tokens[parseResult.tokens.length - 1];
        const completionType = lastParsedToken && isCommandOperator(lastParsedToken)
            ? 'command'
            : 'command'; // Default to command at start
        return { prefix: '', completionType };
    }
    // If there's a trailing space, the user is starting a new argument
    if (beforeCursor.endsWith(' ')) {
        // After first token (command) with space = file argument expected
        return { prefix: '', completionType: 'file' };
    }
    // Determine completion type from context
    const baseType = getCompletionTypeFromPrefix(lastToken.token);
    // If it's clearly a file or variable based on prefix, use that type
    if (baseType === 'variable' || baseType === 'file') {
        return { prefix: lastToken.token, completionType: baseType };
    }
    // For command-like tokens, check context: are we starting a new command?
    const completionType = isNewCommandContext(parseResult.tokens, lastToken.index)
        ? 'command'
        : 'file'; // Not after operator = file argument
    return { prefix: lastToken.token, completionType };
}
/**
 * Generate bash completion command using compgen
 */
function getBashCompletionCommand(prefix, completionType) {
    if (completionType === 'variable') {
        // Variable completion - remove $ prefix
        const varName = prefix.slice(1);
        return `compgen -v ${(0, shellQuote_js_1.quote)([varName])} 2>/dev/null`;
    }
    else if (completionType === 'file') {
        // File completion with trailing slash for directories and trailing space for files
        // Use 'while read' to prevent command injection from filenames containing newlines
        return `compgen -f ${(0, shellQuote_js_1.quote)([prefix])} 2>/dev/null | head -${MAX_SHELL_COMPLETIONS} | while IFS= read -r f; do [ -d "$f" ] && echo "$f/" || echo "$f "; done`;
    }
    else {
        // Command completion
        return `compgen -c ${(0, shellQuote_js_1.quote)([prefix])} 2>/dev/null`;
    }
}
/**
 * Generate zsh completion command using native zsh commands
 */
function getZshCompletionCommand(prefix, completionType) {
    if (completionType === 'variable') {
        // Variable completion - use zsh pattern matching for safe filtering
        const varName = prefix.slice(1);
        return `print -rl -- \${(k)parameters[(I)${(0, shellQuote_js_1.quote)([varName])}*]} 2>/dev/null`;
    }
    else if (completionType === 'file') {
        // File completion with trailing slash for directories and trailing space for files
        // Note: zsh glob expansion is safe from command injection (unlike bash for-in loops)
        return `for f in ${(0, shellQuote_js_1.quote)([prefix])}*(N[1,${MAX_SHELL_COMPLETIONS}]); do [[ -d "$f" ]] && echo "$f/" || echo "$f "; done`;
    }
    else {
        // Command completion - use zsh pattern matching for safe filtering
        return `print -rl -- \${(k)commands[(I)${(0, shellQuote_js_1.quote)([prefix])}*]} 2>/dev/null`;
    }
}
/**
 * Get completions for the given shell type
 */
async function getCompletionsForShell(shellType, prefix, completionType, abortSignal) {
    let command;
    if (shellType === 'bash') {
        command = getBashCompletionCommand(prefix, completionType);
    }
    else if (shellType === 'zsh') {
        command = getZshCompletionCommand(prefix, completionType);
    }
    else {
        // Unsupported shell type
        return [];
    }
    const shellCommand = await Shell.exec(command, abortSignal, 'bash', {
        timeout: SHELL_COMPLETION_TIMEOUT_MS,
    });
    const result = await shellCommand.result;
    return result.stdout
        .split('\n')
        .filter((line) => line.trim())
        .slice(0, MAX_SHELL_COMPLETIONS)
        .map((text) => ({
        id: text,
        displayText: text,
        description: undefined,
        metadata: { completionType },
    }));
}
/**
 * Get shell completions for the given input
 * Supports bash and zsh shells (matches Shell.ts execution support)
 */
async function getShellCompletions(input, cursorOffset, abortSignal) {
    const shellType = (0, localInstaller_js_1.getShellType)();
    // Only support bash/zsh (matches Shell.ts execution support)
    if (shellType !== 'bash' && shellType !== 'zsh') {
        return [];
    }
    try {
        const { prefix, completionType } = parseInputContext(input, cursorOffset);
        if (!prefix) {
            return [];
        }
        const completions = await getCompletionsForShell(shellType, prefix, completionType, abortSignal);
        // Add inputSnapshot to all suggestions so we can detect when input changes
        return completions.map(suggestion => ({
            ...suggestion,
            metadata: {
                ...suggestion.metadata,
                inputSnapshot: input,
            },
        }));
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`Shell completion failed: ${error}`);
        return []; // Silent fail
    }
}
