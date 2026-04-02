"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateContextSuggestions = generateContextSuggestions;
const toolName_js_1 = require("../tools/BashTool/toolName.js");
const prompt_js_1 = require("../tools/FileReadTool/prompt.js");
const prompt_js_2 = require("../tools/GrepTool/prompt.js");
const prompt_js_3 = require("../tools/WebFetchTool/prompt.js");
const file_js_1 = require("./file.js");
const format_js_1 = require("./format.js");
// Thresholds for triggering suggestions
const LARGE_TOOL_RESULT_PERCENT = 15; // tool results > 15% of context
const LARGE_TOOL_RESULT_TOKENS = 10000;
const READ_BLOAT_PERCENT = 5; // Read results > 5% of context
const NEAR_CAPACITY_PERCENT = 80;
const MEMORY_HIGH_PERCENT = 5;
const MEMORY_HIGH_TOKENS = 5000;
// --
function generateContextSuggestions(data) {
    const suggestions = [];
    checkNearCapacity(data, suggestions);
    checkLargeToolResults(data, suggestions);
    checkReadResultBloat(data, suggestions);
    checkMemoryBloat(data, suggestions);
    checkAutoCompactDisabled(data, suggestions);
    // Sort: warnings first, then by savings descending
    suggestions.sort((a, b) => {
        if (a.severity !== b.severity) {
            return a.severity === 'warning' ? -1 : 1;
        }
        return (b.savingsTokens ?? 0) - (a.savingsTokens ?? 0);
    });
    return suggestions;
}
// --
function checkNearCapacity(data, suggestions) {
    if (data.percentage >= NEAR_CAPACITY_PERCENT) {
        suggestions.push({
            severity: 'warning',
            title: `Context is ${data.percentage}% full`,
            detail: data.isAutoCompactEnabled
                ? 'Autocompact will trigger soon, which discards older messages. Use /compact now to control what gets kept.'
                : 'Autocompact is disabled. Use /compact to free space, or enable autocompact in /config.',
        });
    }
}
function checkLargeToolResults(data, suggestions) {
    if (!data.messageBreakdown)
        return;
    for (const tool of data.messageBreakdown.toolCallsByType) {
        const totalToolTokens = tool.callTokens + tool.resultTokens;
        const percent = (totalToolTokens / data.rawMaxTokens) * 100;
        if (percent < LARGE_TOOL_RESULT_PERCENT ||
            totalToolTokens < LARGE_TOOL_RESULT_TOKENS) {
            continue;
        }
        const suggestion = getLargeToolSuggestion(tool.name, totalToolTokens, percent);
        if (suggestion) {
            suggestions.push(suggestion);
        }
    }
}
function getLargeToolSuggestion(toolName, tokens, percent) {
    const tokenStr = (0, format_js_1.formatTokens)(tokens);
    switch (toolName) {
        case toolName_js_1.BASH_TOOL_NAME:
            return {
                severity: 'warning',
                title: `Bash results using ${tokenStr} tokens (${percent.toFixed(0)}%)`,
                detail: 'Pipe output through head, tail, or grep to reduce result size. Avoid cat on large files \u2014 use Read with offset/limit instead.',
                savingsTokens: Math.floor(tokens * 0.5),
            };
        case prompt_js_1.FILE_READ_TOOL_NAME:
            return {
                severity: 'info',
                title: `Read results using ${tokenStr} tokens (${percent.toFixed(0)}%)`,
                detail: 'Use offset and limit parameters to read only the sections you need. Avoid re-reading entire files when you only need a few lines.',
                savingsTokens: Math.floor(tokens * 0.3),
            };
        case prompt_js_2.GREP_TOOL_NAME:
            return {
                severity: 'info',
                title: `Grep results using ${tokenStr} tokens (${percent.toFixed(0)}%)`,
                detail: 'Add more specific patterns or use the glob or type parameter to narrow file types. Consider Glob for file discovery instead of Grep.',
                savingsTokens: Math.floor(tokens * 0.3),
            };
        case prompt_js_3.WEB_FETCH_TOOL_NAME:
            return {
                severity: 'info',
                title: `WebFetch results using ${tokenStr} tokens (${percent.toFixed(0)}%)`,
                detail: 'Web page content can be very large. Consider extracting only the specific information needed.',
                savingsTokens: Math.floor(tokens * 0.4),
            };
        default:
            if (percent >= 20) {
                return {
                    severity: 'info',
                    title: `${toolName} using ${tokenStr} tokens (${percent.toFixed(0)}%)`,
                    detail: `This tool is consuming a significant portion of context.`,
                    savingsTokens: Math.floor(tokens * 0.2),
                };
            }
            return null;
    }
}
function checkReadResultBloat(data, suggestions) {
    if (!data.messageBreakdown)
        return;
    const callsByType = data.messageBreakdown.toolCallsByType;
    const readTool = callsByType.find(t => t.name === prompt_js_1.FILE_READ_TOOL_NAME);
    if (!readTool)
        return;
    const totalReadTokens = readTool.callTokens + readTool.resultTokens;
    const totalReadPercent = (totalReadTokens / data.rawMaxTokens) * 100;
    const readPercent = (readTool.resultTokens / data.rawMaxTokens) * 100;
    // Skip if already covered by checkLargeToolResults (>= 15% band)
    if (totalReadPercent >= LARGE_TOOL_RESULT_PERCENT &&
        totalReadTokens >= LARGE_TOOL_RESULT_TOKENS) {
        return;
    }
    if (readPercent >= READ_BLOAT_PERCENT &&
        readTool.resultTokens >= LARGE_TOOL_RESULT_TOKENS) {
        suggestions.push({
            severity: 'info',
            title: `File reads using ${(0, format_js_1.formatTokens)(readTool.resultTokens)} tokens (${readPercent.toFixed(0)}%)`,
            detail: 'If you are re-reading files, consider referencing earlier reads. Use offset/limit for large files.',
            savingsTokens: Math.floor(readTool.resultTokens * 0.3),
        });
    }
}
function checkMemoryBloat(data, suggestions) {
    const totalMemoryTokens = data.memoryFiles.reduce((sum, f) => sum + f.tokens, 0);
    const memoryPercent = (totalMemoryTokens / data.rawMaxTokens) * 100;
    if (memoryPercent >= MEMORY_HIGH_PERCENT &&
        totalMemoryTokens >= MEMORY_HIGH_TOKENS) {
        const largestFiles = [...data.memoryFiles]
            .sort((a, b) => b.tokens - a.tokens)
            .slice(0, 3)
            .map(f => {
            const name = (0, file_js_1.getDisplayPath)(f.path);
            return `${name} (${(0, format_js_1.formatTokens)(f.tokens)})`;
        })
            .join(', ');
        suggestions.push({
            severity: 'info',
            title: `Memory files using ${(0, format_js_1.formatTokens)(totalMemoryTokens)} tokens (${memoryPercent.toFixed(0)}%)`,
            detail: `Largest: ${largestFiles}. Use /memory to review and prune stale entries.`,
            savingsTokens: Math.floor(totalMemoryTokens * 0.3),
        });
    }
}
function checkAutoCompactDisabled(data, suggestions) {
    if (!data.isAutoCompactEnabled &&
        data.percentage >= 50 &&
        data.percentage < NEAR_CAPACITY_PERCENT) {
        suggestions.push({
            severity: 'info',
            title: 'Autocompact is disabled',
            detail: 'Without autocompact, you will hit context limits and lose the conversation. Enable it in /config or use /compact manually.',
        });
    }
}
