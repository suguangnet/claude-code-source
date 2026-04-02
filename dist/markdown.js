"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureMarked = configureMarked;
exports.applyMarkdown = applyMarkdown;
exports.formatToken = formatToken;
exports.padAligned = padAligned;
const chalk_1 = __importDefault(require("chalk"));
const marked_1 = require("marked");
const strip_ansi_1 = __importDefault(require("strip-ansi"));
const color_js_1 = require("../components/design-system/color.js");
const figures_js_1 = require("../constants/figures.js");
const stringWidth_js_1 = require("../ink/stringWidth.js");
const supports_hyperlinks_js_1 = require("../ink/supports-hyperlinks.js");
const debug_js_1 = require("./debug.js");
const hyperlink_js_1 = require("./hyperlink.js");
const messages_js_1 = require("./messages.js");
// Use \n unconditionally — os.EOL is \r\n on Windows, and the extra \r
// breaks the character-to-segment mapping in applyStylesToWrappedText,
// causing styled text to shift right.
const EOL = '\n';
let markedConfigured = false;
function configureMarked() {
    if (markedConfigured)
        return;
    markedConfigured = true;
    // Disable strikethrough parsing - the model often uses ~ for "approximate"
    // (e.g., ~100) and rarely intends actual strikethrough formatting
    marked_1.marked.use({
        tokenizer: {
            del() {
                return undefined;
            },
        },
    });
}
function applyMarkdown(content, theme, highlight = null) {
    configureMarked();
    return marked_1.marked
        .lexer((0, messages_js_1.stripPromptXMLTags)(content))
        .map(_ => formatToken(_, theme, 0, null, null, highlight))
        .join('')
        .trim();
}
function formatToken(token, theme, listDepth = 0, orderedListNumber = null, parent = null, highlight = null) {
    switch (token.type) {
        case 'blockquote': {
            const inner = (token.tokens ?? [])
                .map(_ => formatToken(_, theme, 0, null, null, highlight))
                .join('');
            // Prefix each line with a dim vertical bar. Keep text italic but at
            // normal brightness — chalk.dim is nearly invisible on dark themes.
            const bar = chalk_1.default.dim(figures_js_1.BLOCKQUOTE_BAR);
            return inner
                .split(EOL)
                .map(line => (0, strip_ansi_1.default)(line).trim() ? `${bar} ${chalk_1.default.italic(line)}` : line)
                .join(EOL);
        }
        case 'code': {
            if (!highlight) {
                return token.text + EOL;
            }
            let language = 'plaintext';
            if (token.lang) {
                if (highlight.supportsLanguage(token.lang)) {
                    language = token.lang;
                }
                else {
                    (0, debug_js_1.logForDebugging)(`Language not supported while highlighting code, falling back to plaintext: ${token.lang}`);
                }
            }
            return highlight.highlight(token.text, { language }) + EOL;
        }
        case 'codespan': {
            // inline code
            return (0, color_js_1.color)('permission', theme)(token.text);
        }
        case 'em':
            return chalk_1.default.italic((token.tokens ?? [])
                .map(_ => formatToken(_, theme, 0, null, parent, highlight))
                .join(''));
        case 'strong':
            return chalk_1.default.bold((token.tokens ?? [])
                .map(_ => formatToken(_, theme, 0, null, parent, highlight))
                .join(''));
        case 'heading':
            switch (token.depth) {
                case 1: // h1
                    return (chalk_1.default.bold.italic.underline((token.tokens ?? [])
                        .map(_ => formatToken(_, theme, 0, null, null, highlight))
                        .join('')) +
                        EOL +
                        EOL);
                case 2: // h2
                    return (chalk_1.default.bold((token.tokens ?? [])
                        .map(_ => formatToken(_, theme, 0, null, null, highlight))
                        .join('')) +
                        EOL +
                        EOL);
                default: // h3+
                    return (chalk_1.default.bold((token.tokens ?? [])
                        .map(_ => formatToken(_, theme, 0, null, null, highlight))
                        .join('')) +
                        EOL +
                        EOL);
            }
        case 'hr':
            return '---';
        case 'image':
            return token.href;
        case 'link': {
            // Prevent mailto links from being displayed as clickable links
            if (token.href.startsWith('mailto:')) {
                // Extract email from mailto: link and display as plain text
                const email = token.href.replace(/^mailto:/, '');
                return email;
            }
            // Extract display text from the link's child tokens
            const linkText = (token.tokens ?? [])
                .map(_ => formatToken(_, theme, 0, null, token, highlight))
                .join('');
            const plainLinkText = (0, strip_ansi_1.default)(linkText);
            // If the link has meaningful display text (different from the URL),
            // show it as a clickable hyperlink. In terminals that support OSC 8,
            // users see the text and can hover/click to see the URL.
            if (plainLinkText && plainLinkText !== token.href) {
                return (0, hyperlink_js_1.createHyperlink)(token.href, linkText);
            }
            // When the display text matches the URL (or is empty), just show the URL
            return (0, hyperlink_js_1.createHyperlink)(token.href);
        }
        case 'list': {
            return token.items
                .map((_, index) => formatToken(_, theme, listDepth, token.ordered ? token.start + index : null, token, highlight))
                .join('');
        }
        case 'list_item':
            return (token.tokens ?? [])
                .map(_ => `${'  '.repeat(listDepth)}${formatToken(_, theme, listDepth + 1, orderedListNumber, token, highlight)}`)
                .join('');
        case 'paragraph':
            return ((token.tokens ?? [])
                .map(_ => formatToken(_, theme, 0, null, null, highlight))
                .join('') + EOL);
        case 'space':
            return EOL;
        case 'br':
            return EOL;
        case 'text':
            if (parent?.type === 'link') {
                // Already inside a markdown link — the link handler will wrap this
                // in an OSC 8 hyperlink. Linkifying here would nest a second OSC 8
                // sequence, and terminals honor the innermost one, overriding the
                // link's actual href.
                return token.text;
            }
            if (parent?.type === 'list_item') {
                return `${orderedListNumber === null ? '-' : getListNumber(listDepth, orderedListNumber) + '.'} ${token.tokens ? token.tokens.map(_ => formatToken(_, theme, listDepth, orderedListNumber, token, highlight)).join('') : linkifyIssueReferences(token.text)}${EOL}`;
            }
            return linkifyIssueReferences(token.text);
        case 'table': {
            const tableToken = token;
            // Helper function to get the text content that will be displayed (after stripAnsi)
            function getDisplayText(tokens) {
                return (0, strip_ansi_1.default)(tokens
                    ?.map(_ => formatToken(_, theme, 0, null, null, highlight))
                    .join('') ?? '');
            }
            // Determine column widths based on displayed content (without formatting)
            const columnWidths = tableToken.header.map((header, index) => {
                let maxWidth = (0, stringWidth_js_1.stringWidth)(getDisplayText(header.tokens));
                for (const row of tableToken.rows) {
                    const cellLength = (0, stringWidth_js_1.stringWidth)(getDisplayText(row[index]?.tokens));
                    maxWidth = Math.max(maxWidth, cellLength);
                }
                return Math.max(maxWidth, 3); // Minimum width of 3
            });
            // Format header row
            let tableOutput = '| ';
            tableToken.header.forEach((header, index) => {
                const content = header.tokens
                    ?.map(_ => formatToken(_, theme, 0, null, null, highlight))
                    .join('') ?? '';
                const displayText = getDisplayText(header.tokens);
                const width = columnWidths[index];
                const align = tableToken.align?.[index];
                tableOutput +=
                    padAligned(content, (0, stringWidth_js_1.stringWidth)(displayText), width, align) + ' | ';
            });
            tableOutput = tableOutput.trimEnd() + EOL;
            // Add separator row
            tableOutput += '|';
            columnWidths.forEach(width => {
                // Always use dashes, don't show alignment colons in the output
                const separator = '-'.repeat(width + 2); // +2 for spaces on each side
                tableOutput += separator + '|';
            });
            tableOutput += EOL;
            // Format data rows
            tableToken.rows.forEach(row => {
                tableOutput += '| ';
                row.forEach((cell, index) => {
                    const content = cell.tokens
                        ?.map(_ => formatToken(_, theme, 0, null, null, highlight))
                        .join('') ?? '';
                    const displayText = getDisplayText(cell.tokens);
                    const width = columnWidths[index];
                    const align = tableToken.align?.[index];
                    tableOutput +=
                        padAligned(content, (0, stringWidth_js_1.stringWidth)(displayText), width, align) + ' | ';
                });
                tableOutput = tableOutput.trimEnd() + EOL;
            });
            return tableOutput + EOL;
        }
        case 'escape':
            // Markdown escape: \) → ), \\ → \, etc.
            return token.text;
        case 'def':
        case 'del':
        case 'html':
            // These token types are not rendered
            return '';
    }
    return '';
}
// Matches owner/repo#NNN style GitHub issue/PR references. The qualified form
// is unambiguous — bare #NNN was removed because it guessed the current repo
// and was wrong whenever the assistant discussed a different one.
// Owner segment disallows dots (GitHub usernames are alphanumerics + hyphens
// only) so hostnames like docs.github.io/guide#42 don't false-positive. Repo
// segment allows dots (e.g. cc.kurs.web). Lookbehind is avoided — it defeats
// YARR JIT in JSC.
const ISSUE_REF_PATTERN = /(^|[^\w./-])([A-Za-z0-9][\w-]*\/[A-Za-z0-9][\w.-]*)#(\d+)\b/g;
/**
 * Replaces owner/repo#123 references with clickable hyperlinks to GitHub.
 */
function linkifyIssueReferences(text) {
    if (!(0, supports_hyperlinks_js_1.supportsHyperlinks)()) {
        return text;
    }
    return text.replace(ISSUE_REF_PATTERN, (_match, prefix, repo, num) => prefix +
        (0, hyperlink_js_1.createHyperlink)(`https://github.com/${repo}/issues/${num}`, `${repo}#${num}`));
}
function numberToLetter(n) {
    let result = '';
    while (n > 0) {
        n--;
        result = String.fromCharCode(97 + (n % 26)) + result;
        n = Math.floor(n / 26);
    }
    return result;
}
const ROMAN_VALUES = [
    [1000, 'm'],
    [900, 'cm'],
    [500, 'd'],
    [400, 'cd'],
    [100, 'c'],
    [90, 'xc'],
    [50, 'l'],
    [40, 'xl'],
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i'],
];
function numberToRoman(n) {
    let result = '';
    for (const [value, numeral] of ROMAN_VALUES) {
        while (n >= value) {
            result += numeral;
            n -= value;
        }
    }
    return result;
}
function getListNumber(listDepth, orderedListNumber) {
    switch (listDepth) {
        case 0:
        case 1:
            return orderedListNumber.toString();
        case 2:
            return numberToLetter(orderedListNumber);
        case 3:
            return numberToRoman(orderedListNumber);
        default:
            return orderedListNumber.toString();
    }
}
/**
 * Pad `content` to `targetWidth` according to alignment. `displayWidth` is the
 * visible width of `content` (caller computes this, e.g. via stringWidth on
 * stripAnsi'd text, so ANSI codes in `content` don't affect padding).
 */
function padAligned(content, displayWidth, targetWidth, align) {
    const padding = Math.max(0, targetWidth - displayWidth);
    if (align === 'center') {
        const leftPad = Math.floor(padding / 2);
        return ' '.repeat(leftPad) + content + ' '.repeat(padding - leftPad);
    }
    if (align === 'right') {
        return ' '.repeat(padding) + content;
    }
    return content + ' '.repeat(padding);
}
