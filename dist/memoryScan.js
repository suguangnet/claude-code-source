"use strict";
/**
 * Memory-directory scanning primitives. Split out of findRelevantMemories.ts
 * so extractMemories can import the scan without pulling in sideQuery and
 * the API-client chain (which closed a cycle through memdir.ts — #25372).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanMemoryFiles = scanMemoryFiles;
exports.formatMemoryManifest = formatMemoryManifest;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const frontmatterParser_js_1 = require("../utils/frontmatterParser.js");
const readFileInRange_js_1 = require("../utils/readFileInRange.js");
const memoryTypes_js_1 = require("./memoryTypes.js");
const MAX_MEMORY_FILES = 200;
const FRONTMATTER_MAX_LINES = 30;
/**
 * Scan a memory directory for .md files, read their frontmatter, and return
 * a header list sorted newest-first (capped at MAX_MEMORY_FILES). Shared by
 * findRelevantMemories (query-time recall) and extractMemories (pre-injects
 * the listing so the extraction agent doesn't spend a turn on `ls`).
 *
 * Single-pass: readFileInRange stats internally and returns mtimeMs, so we
 * read-then-sort rather than stat-sort-read. For the common case (N ≤ 200)
 * this halves syscalls vs a separate stat round; for large N we read a few
 * extra small files but still avoid the double-stat on the surviving 200.
 */
async function scanMemoryFiles(memoryDir, signal) {
    try {
        const entries = await (0, promises_1.readdir)(memoryDir, { recursive: true });
        const mdFiles = entries.filter(f => f.endsWith('.md') && (0, path_1.basename)(f) !== 'MEMORY.md');
        const headerResults = await Promise.allSettled(mdFiles.map(async (relativePath) => {
            const filePath = (0, path_1.join)(memoryDir, relativePath);
            const { content, mtimeMs } = await (0, readFileInRange_js_1.readFileInRange)(filePath, 0, FRONTMATTER_MAX_LINES, undefined, signal);
            const { frontmatter } = (0, frontmatterParser_js_1.parseFrontmatter)(content, filePath);
            return {
                filename: relativePath,
                filePath,
                mtimeMs,
                description: frontmatter.description || null,
                type: (0, memoryTypes_js_1.parseMemoryType)(frontmatter.type),
            };
        }));
        return headerResults
            .filter((r) => r.status === 'fulfilled')
            .map(r => r.value)
            .sort((a, b) => b.mtimeMs - a.mtimeMs)
            .slice(0, MAX_MEMORY_FILES);
    }
    catch {
        return [];
    }
}
/**
 * Format memory headers as a text manifest: one line per file with
 * [type] filename (timestamp): description. Used by both the recall
 * selector prompt and the extraction-agent prompt.
 */
function formatMemoryManifest(memories) {
    return memories
        .map(m => {
        const tag = m.type ? `[${m.type}] ` : '';
        const ts = new Date(m.mtimeMs).toISOString();
        return m.description
            ? `- ${tag}${m.filename} (${ts}): ${m.description}`
            : `- ${tag}${m.filename} (${ts})`;
    })
        .join('\n');
}
