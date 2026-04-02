"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASK_MAX_OUTPUT_DEFAULT = exports.TASK_MAX_OUTPUT_UPPER_LIMIT = void 0;
exports.getMaxTaskOutputLength = getMaxTaskOutputLength;
exports.formatTaskOutput = formatTaskOutput;
const envValidation_js_1 = require("../envValidation.js");
const diskOutput_js_1 = require("./diskOutput.js");
exports.TASK_MAX_OUTPUT_UPPER_LIMIT = 160000;
exports.TASK_MAX_OUTPUT_DEFAULT = 32000;
function getMaxTaskOutputLength() {
    const result = (0, envValidation_js_1.validateBoundedIntEnvVar)('TASK_MAX_OUTPUT_LENGTH', process.env.TASK_MAX_OUTPUT_LENGTH, exports.TASK_MAX_OUTPUT_DEFAULT, exports.TASK_MAX_OUTPUT_UPPER_LIMIT);
    return result.effective;
}
/**
 * Format task output for API consumption, truncating if too large.
 * When truncated, includes a header with the file path and returns
 * the last N characters that fit within the limit.
 */
function formatTaskOutput(output, taskId) {
    const maxLen = getMaxTaskOutputLength();
    if (output.length <= maxLen) {
        return { content: output, wasTruncated: false };
    }
    const filePath = (0, diskOutput_js_1.getTaskOutputPath)(taskId);
    const header = `[Truncated. Full output: ${filePath}]\n\n`;
    const availableSpace = maxLen - header.length;
    const truncated = output.slice(-availableSpace);
    return { content: header + truncated, wasTruncated: true };
}
