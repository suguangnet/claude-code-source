"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findRelevantMemories = findRelevantMemories;
const bun_bundle_1 = require("bun:bundle");
const debug_js_1 = require("../utils/debug.js");
const errors_js_1 = require("../utils/errors.js");
const model_js_1 = require("../utils/model/model.js");
const sideQuery_js_1 = require("../utils/sideQuery.js");
const slowOperations_js_1 = require("../utils/slowOperations.js");
const memoryScan_js_1 = require("./memoryScan.js");
const SELECT_MEMORIES_SYSTEM_PROMPT = `You are selecting memories that will be useful to Claude Code as it processes a user's query. You will be given the user's query and a list of available memory files with their filenames and descriptions.

Return a list of filenames for the memories that will clearly be useful to Claude Code as it processes the user's query (up to 5). Only include memories that you are certain will be helpful based on their name and description.
- If you are unsure if a memory will be useful in processing the user's query, then do not include it in your list. Be selective and discerning.
- If there are no memories in the list that would clearly be useful, feel free to return an empty list.
- If a list of recently-used tools is provided, do not select memories that are usage reference or API documentation for those tools (Claude Code is already exercising them). DO still select memories containing warnings, gotchas, or known issues about those tools — active use is exactly when those matter.
`;
/**
 * Find memory files relevant to a query by scanning memory file headers
 * and asking Sonnet to select the most relevant ones.
 *
 * Returns absolute file paths + mtime of the most relevant memories
 * (up to 5). Excludes MEMORY.md (already loaded in system prompt).
 * mtime is threaded through so callers can surface freshness to the
 * main model without a second stat.
 *
 * `alreadySurfaced` filters paths shown in prior turns before the
 * Sonnet call, so the selector spends its 5-slot budget on fresh
 * candidates instead of re-picking files the caller will discard.
 */
async function findRelevantMemories(query, memoryDir, signal, recentTools = [], alreadySurfaced = new Set()) {
    const memories = (await (0, memoryScan_js_1.scanMemoryFiles)(memoryDir, signal)).filter(m => !alreadySurfaced.has(m.filePath));
    if (memories.length === 0) {
        return [];
    }
    const selectedFilenames = await selectRelevantMemories(query, memories, signal, recentTools);
    const byFilename = new Map(memories.map(m => [m.filename, m]));
    const selected = selectedFilenames
        .map(filename => byFilename.get(filename))
        .filter((m) => m !== undefined);
    // Fires even on empty selection: selection-rate needs the denominator,
    // and -1 ages distinguish "ran, picked nothing" from "never ran".
    if ((0, bun_bundle_1.feature)('MEMORY_SHAPE_TELEMETRY')) {
        /* eslint-disable @typescript-eslint/no-require-imports */
        const { logMemoryRecallShape } = require('./memoryShapeTelemetry.js');
        /* eslint-enable @typescript-eslint/no-require-imports */
        logMemoryRecallShape(memories, selected);
    }
    return selected.map(m => ({ path: m.filePath, mtimeMs: m.mtimeMs }));
}
async function selectRelevantMemories(query, memories, signal, recentTools) {
    const validFilenames = new Set(memories.map(m => m.filename));
    const manifest = (0, memoryScan_js_1.formatMemoryManifest)(memories);
    // When Claude Code is actively using a tool (e.g. mcp__X__spawn),
    // surfacing that tool's reference docs is noise — the conversation
    // already contains working usage.  The selector otherwise matches
    // on keyword overlap ("spawn" in query + "spawn" in a memory
    // description → false positive).
    const toolsSection = recentTools.length > 0
        ? `\n\nRecently used tools: ${recentTools.join(', ')}`
        : '';
    try {
        const result = await (0, sideQuery_js_1.sideQuery)({
            model: (0, model_js_1.getDefaultSonnetModel)(),
            system: SELECT_MEMORIES_SYSTEM_PROMPT,
            skipSystemPromptPrefix: true,
            messages: [
                {
                    role: 'user',
                    content: `Query: ${query}\n\nAvailable memories:\n${manifest}${toolsSection}`,
                },
            ],
            max_tokens: 256,
            output_format: {
                type: 'json_schema',
                schema: {
                    type: 'object',
                    properties: {
                        selected_memories: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['selected_memories'],
                    additionalProperties: false,
                },
            },
            signal,
            querySource: 'memdir_relevance',
        });
        const textBlock = result.content.find(block => block.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
            return [];
        }
        const parsed = (0, slowOperations_js_1.jsonParse)(textBlock.text);
        return parsed.selected_memories.filter(f => validFilenames.has(f));
    }
    catch (e) {
        if (signal.aborted) {
            return [];
        }
        (0, debug_js_1.logForDebugging)(`[memdir] selectRelevantMemories failed: ${(0, errors_js_1.errorMessage)(e)}`, { level: 'warn' });
        return [];
    }
}
