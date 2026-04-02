"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTerminalTaskStatus = isTerminalTaskStatus;
exports.generateTaskId = generateTaskId;
exports.createTaskStateBase = createTaskStateBase;
const crypto_1 = require("crypto");
const diskOutput_js_1 = require("./utils/task/diskOutput.js");
/**
 * True when a task is in a terminal state and will not transition further.
 * Used to guard against injecting messages into dead teammates, evicting
 * finished tasks from AppState, and orphan-cleanup paths.
 */
function isTerminalTaskStatus(status) {
    return status === 'completed' || status === 'failed' || status === 'killed';
}
// Task ID prefixes
const TASK_ID_PREFIXES = {
    local_bash: 'b', // Keep as 'b' for backward compatibility
    local_agent: 'a',
    remote_agent: 'r',
    in_process_teammate: 't',
    local_workflow: 'w',
    monitor_mcp: 'm',
    dream: 'd',
};
// Get task ID prefix
function getTaskIdPrefix(type) {
    return TASK_ID_PREFIXES[type] ?? 'x';
}
// Case-insensitive-safe alphabet (digits + lowercase) for task IDs.
// 36^8 ≈ 2.8 trillion combinations, sufficient to resist brute-force symlink attacks.
const TASK_ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
function generateTaskId(type) {
    const prefix = getTaskIdPrefix(type);
    const bytes = (0, crypto_1.randomBytes)(8);
    let id = prefix;
    for (let i = 0; i < 8; i++) {
        id += TASK_ID_ALPHABET[bytes[i] % TASK_ID_ALPHABET.length];
    }
    return id;
}
function createTaskStateBase(id, type, description, toolUseId) {
    return {
        id,
        type,
        status: 'pending',
        description,
        toolUseId,
        startTime: Date.now(),
        outputFile: (0, diskOutput_js_1.getTaskOutputPath)(id),
        outputOffset: 0,
        notified: false,
    };
}
