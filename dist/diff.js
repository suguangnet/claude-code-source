"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DIFF_TIMEOUT_MS = exports.CONTEXT_LINES = void 0;
exports.adjustHunkLineNumbers = adjustHunkLineNumbers;
exports.countLinesChanged = countLinesChanged;
exports.getPatchFromContents = getPatchFromContents;
exports.getPatchForDisplay = getPatchForDisplay;
const diff_1 = require("diff");
const index_js_1 = require("src/services/analytics/index.js");
const state_js_1 = require("../bootstrap/state.js");
const cost_tracker_js_1 = require("../cost-tracker.js");
const array_js_1 = require("./array.js");
const file_js_1 = require("./file.js");
exports.CONTEXT_LINES = 3;
exports.DIFF_TIMEOUT_MS = 5000;
/**
 * Shifts hunk line numbers by offset. Use when getPatchForDisplay received
 * a slice of the file (e.g. readEditContext) rather than the whole file —
 * callers pass `ctx.lineOffset - 1` to convert slice-relative to file-relative.
 */
function adjustHunkLineNumbers(hunks, offset) {
    if (offset === 0)
        return hunks;
    return hunks.map(h => ({
        ...h,
        oldStart: h.oldStart + offset,
        newStart: h.newStart + offset,
    }));
}
// For some reason, & confuses the diff library, so we replace it with a token,
// then substitute it back in after the diff is computed.
const AMPERSAND_TOKEN = '<<:AMPERSAND_TOKEN:>>';
const DOLLAR_TOKEN = '<<:DOLLAR_TOKEN:>>';
function escapeForDiff(s) {
    return s.replaceAll('&', AMPERSAND_TOKEN).replaceAll('$', DOLLAR_TOKEN);
}
function unescapeFromDiff(s) {
    return s.replaceAll(AMPERSAND_TOKEN, '&').replaceAll(DOLLAR_TOKEN, '$');
}
/**
 * Count lines added and removed in a patch and update the total
 * For new files, pass the content string as the second parameter
 * @param patch Array of diff hunks
 * @param newFileContent Optional content string for new files
 */
function countLinesChanged(patch, newFileContent) {
    let numAdditions = 0;
    let numRemovals = 0;
    if (patch.length === 0 && newFileContent) {
        // For new files, count all lines as additions
        numAdditions = newFileContent.split(/\r?\n/).length;
    }
    else {
        numAdditions = patch.reduce((acc, hunk) => acc + (0, array_js_1.count)(hunk.lines, _ => _.startsWith('+')), 0);
        numRemovals = patch.reduce((acc, hunk) => acc + (0, array_js_1.count)(hunk.lines, _ => _.startsWith('-')), 0);
    }
    (0, cost_tracker_js_1.addToTotalLinesChanged)(numAdditions, numRemovals);
    (0, state_js_1.getLocCounter)()?.add(numAdditions, { type: 'added' });
    (0, state_js_1.getLocCounter)()?.add(numRemovals, { type: 'removed' });
    (0, index_js_1.logEvent)('tengu_file_changed', {
        lines_added: numAdditions,
        lines_removed: numRemovals,
    });
}
function getPatchFromContents({ filePath, oldContent, newContent, ignoreWhitespace = false, singleHunk = false, }) {
    const result = (0, diff_1.structuredPatch)(filePath, filePath, escapeForDiff(oldContent), escapeForDiff(newContent), undefined, undefined, {
        ignoreWhitespace,
        context: singleHunk ? 100000 : exports.CONTEXT_LINES,
        timeout: exports.DIFF_TIMEOUT_MS,
    });
    if (!result) {
        return [];
    }
    return result.hunks.map(_ => ({
        ..._,
        lines: _.lines.map(unescapeFromDiff),
    }));
}
/**
 * Get a patch for display with edits applied
 * @param filePath The path to the file
 * @param fileContents The contents of the file
 * @param edits An array of edits to apply to the file
 * @param ignoreWhitespace Whether to ignore whitespace changes
 * @returns An array of hunks representing the diff
 *
 * NOTE: This function will return the diff with all leading tabs
 * rendered as spaces for display
 */
function getPatchForDisplay({ filePath, fileContents, edits, ignoreWhitespace = false, }) {
    const preparedFileContents = escapeForDiff((0, file_js_1.convertLeadingTabsToSpaces)(fileContents));
    const result = (0, diff_1.structuredPatch)(filePath, filePath, preparedFileContents, edits.reduce((p, edit) => {
        const { old_string, new_string } = edit;
        const replace_all = 'replace_all' in edit ? edit.replace_all : false;
        const escapedOldString = escapeForDiff((0, file_js_1.convertLeadingTabsToSpaces)(old_string));
        const escapedNewString = escapeForDiff((0, file_js_1.convertLeadingTabsToSpaces)(new_string));
        if (replace_all) {
            return p.replaceAll(escapedOldString, () => escapedNewString);
        }
        else {
            return p.replace(escapedOldString, () => escapedNewString);
        }
    }, preparedFileContents), undefined, undefined, {
        context: exports.CONTEXT_LINES,
        ignoreWhitespace,
        timeout: exports.DIFF_TIMEOUT_MS,
    });
    if (!result) {
        return [];
    }
    return result.hunks.map(_ => ({
        ..._,
        lines: _.lines.map(unescapeFromDiff),
    }));
}
