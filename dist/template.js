"use strict";
/**
 * Keybindings template generator.
 * Generates a well-documented template file for ~/.claude/keybindings.json
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateKeybindingsTemplate = generateKeybindingsTemplate;
const slowOperations_js_1 = require("../utils/slowOperations.js");
const defaultBindings_js_1 = require("./defaultBindings.js");
const reservedShortcuts_js_1 = require("./reservedShortcuts.js");
/**
 * Filter out reserved shortcuts that cannot be rebound.
 * These would cause /doctor to warn, so we exclude them from the template.
 */
function filterReservedShortcuts(blocks) {
    const reservedKeys = new Set(reservedShortcuts_js_1.NON_REBINDABLE.map(r => (0, reservedShortcuts_js_1.normalizeKeyForComparison)(r.key)));
    return blocks
        .map(block => {
        const filteredBindings = {};
        for (const [key, action] of Object.entries(block.bindings)) {
            if (!reservedKeys.has((0, reservedShortcuts_js_1.normalizeKeyForComparison)(key))) {
                filteredBindings[key] = action;
            }
        }
        return { context: block.context, bindings: filteredBindings };
    })
        .filter(block => Object.keys(block.bindings).length > 0);
}
/**
 * Generate a template keybindings.json file content.
 * Creates a fully valid JSON file with all default bindings that users can customize.
 */
function generateKeybindingsTemplate() {
    // Filter out reserved shortcuts that cannot be rebound
    const bindings = filterReservedShortcuts(defaultBindings_js_1.DEFAULT_BINDINGS);
    // Format as object wrapper with bindings array
    const config = {
        $schema: 'https://www.schemastore.org/claude-code-keybindings.json',
        $docs: 'https://code.claude.com/docs/en/keybindings',
        bindings,
    };
    return (0, slowOperations_js_1.jsonStringify)(config, null, 2) + '\n';
}
