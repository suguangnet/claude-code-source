"use strict";
/**
 * Utility for substituting $ARGUMENTS placeholders in skill/command prompts.
 *
 * Supports:
 * - $ARGUMENTS - replaced with the full arguments string
 * - $ARGUMENTS[0], $ARGUMENTS[1], etc. - replaced with individual indexed arguments
 * - $0, $1, etc. - shorthand for $ARGUMENTS[0], $ARGUMENTS[1]
 * - Named arguments (e.g., $foo, $bar) - when argument names are defined in frontmatter
 *
 * Arguments are parsed using shell-quote for proper shell argument handling.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseArguments = parseArguments;
exports.parseArgumentNames = parseArgumentNames;
exports.generateProgressiveArgumentHint = generateProgressiveArgumentHint;
exports.substituteArguments = substituteArguments;
const shellQuote_js_1 = require("./bash/shellQuote.js");
/**
 * Parse an arguments string into an array of individual arguments.
 * Uses shell-quote for proper shell argument parsing including quoted strings.
 *
 * Examples:
 * - "foo bar baz" => ["foo", "bar", "baz"]
 * - 'foo "hello world" baz' => ["foo", "hello world", "baz"]
 * - "foo 'hello world' baz" => ["foo", "hello world", "baz"]
 */
function parseArguments(args) {
    if (!args || !args.trim()) {
        return [];
    }
    // Return $KEY to preserve variable syntax literally (don't expand variables)
    const result = (0, shellQuote_js_1.tryParseShellCommand)(args, key => `$${key}`);
    if (!result.success) {
        // Fall back to simple whitespace split if parsing fails
        return args.split(/\s+/).filter(Boolean);
    }
    // Filter to only string tokens (ignore shell operators, etc.)
    return result.tokens.filter((token) => typeof token === 'string');
}
/**
 * Parse argument names from the frontmatter 'arguments' field.
 * Accepts either a space-separated string or an array of strings.
 *
 * Examples:
 * - "foo bar baz" => ["foo", "bar", "baz"]
 * - ["foo", "bar", "baz"] => ["foo", "bar", "baz"]
 */
function parseArgumentNames(argumentNames) {
    if (!argumentNames) {
        return [];
    }
    // Filter out empty strings and numeric-only names (which conflict with $0, $1 shorthand)
    const isValidName = (name) => typeof name === 'string' && name.trim() !== '' && !/^\d+$/.test(name);
    if (Array.isArray(argumentNames)) {
        return argumentNames.filter(isValidName);
    }
    if (typeof argumentNames === 'string') {
        return argumentNames.split(/\s+/).filter(isValidName);
    }
    return [];
}
/**
 * Generate argument hint showing remaining unfilled args.
 * @param argNames - Array of argument names from frontmatter
 * @param typedArgs - Arguments the user has typed so far
 * @returns Hint string like "[arg2] [arg3]" or undefined if all filled
 */
function generateProgressiveArgumentHint(argNames, typedArgs) {
    const remaining = argNames.slice(typedArgs.length);
    if (remaining.length === 0)
        return undefined;
    return remaining.map(name => `[${name}]`).join(' ');
}
/**
 * Substitute $ARGUMENTS placeholders in content with actual argument values.
 *
 * @param content - The content containing placeholders
 * @param args - The raw arguments string (may be undefined/null)
 * @param appendIfNoPlaceholder - If true and no placeholders are found, appends "ARGUMENTS: {args}" to content
 * @param argumentNames - Optional array of named arguments (e.g., ["foo", "bar"]) that map to indexed positions
 * @returns The content with placeholders substituted
 */
function substituteArguments(content, args, appendIfNoPlaceholder = true, argumentNames = []) {
    // undefined/null means no args provided - return content unchanged
    // empty string is a valid input that should replace placeholders with empty
    if (args === undefined || args === null) {
        return content;
    }
    const parsedArgs = parseArguments(args);
    const originalContent = content;
    // Replace named arguments (e.g., $foo, $bar) with their values
    // Named arguments map to positions: argumentNames[0] -> parsedArgs[0], etc.
    for (let i = 0; i < argumentNames.length; i++) {
        const name = argumentNames[i];
        if (!name)
            continue;
        // Match $name but not $name[...] or $nameXxx (word chars)
        // Also ensure we match word boundaries to avoid partial matches
        content = content.replace(new RegExp(`\\$${name}(?![\\[\\w])`, 'g'), parsedArgs[i] ?? '');
    }
    // Replace indexed arguments ($ARGUMENTS[0], $ARGUMENTS[1], etc.)
    content = content.replace(/\$ARGUMENTS\[(\d+)\]/g, (_, indexStr) => {
        const index = parseInt(indexStr, 10);
        return parsedArgs[index] ?? '';
    });
    // Replace shorthand indexed arguments ($0, $1, etc.)
    content = content.replace(/\$(\d+)(?!\w)/g, (_, indexStr) => {
        const index = parseInt(indexStr, 10);
        return parsedArgs[index] ?? '';
    });
    // Replace $ARGUMENTS with the full arguments string
    content = content.replaceAll('$ARGUMENTS', args);
    // If no placeholders were found and appendIfNoPlaceholder is true, append
    // But only if args is non-empty (empty string means command invoked with no args)
    if (content === originalContent && appendIfNoPlaceholder && args) {
        content = content + `\n\nARGUMENTS: ${args}`;
    }
    return content;
}
