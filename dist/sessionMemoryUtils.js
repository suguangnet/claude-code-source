"use strict";
/**
 * Session Memory utility functions that can be imported without circular dependencies.
 * These are separate from the main sessionMemory.ts to avoid importing runAgent.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SESSION_MEMORY_CONFIG = void 0;
exports.getLastSummarizedMessageId = getLastSummarizedMessageId;
exports.setLastSummarizedMessageId = setLastSummarizedMessageId;
exports.markExtractionStarted = markExtractionStarted;
exports.markExtractionCompleted = markExtractionCompleted;
exports.waitForSessionMemoryExtraction = waitForSessionMemoryExtraction;
exports.getSessionMemoryContent = getSessionMemoryContent;
exports.setSessionMemoryConfig = setSessionMemoryConfig;
exports.getSessionMemoryConfig = getSessionMemoryConfig;
exports.recordExtractionTokenCount = recordExtractionTokenCount;
exports.isSessionMemoryInitialized = isSessionMemoryInitialized;
exports.markSessionMemoryInitialized = markSessionMemoryInitialized;
exports.hasMetInitializationThreshold = hasMetInitializationThreshold;
exports.hasMetUpdateThreshold = hasMetUpdateThreshold;
exports.getToolCallsBetweenUpdates = getToolCallsBetweenUpdates;
exports.resetSessionMemoryState = resetSessionMemoryState;
const errors_js_1 = require("../../utils/errors.js");
const fsOperations_js_1 = require("../../utils/fsOperations.js");
const filesystem_js_1 = require("../../utils/permissions/filesystem.js");
const sleep_js_1 = require("../../utils/sleep.js");
const index_js_1 = require("../analytics/index.js");
const EXTRACTION_WAIT_TIMEOUT_MS = 15000;
const EXTRACTION_STALE_THRESHOLD_MS = 60000; // 1 minute
// Default configuration values
exports.DEFAULT_SESSION_MEMORY_CONFIG = {
    minimumMessageTokensToInit: 10000,
    minimumTokensBetweenUpdate: 5000,
    toolCallsBetweenUpdates: 3,
};
// Current session memory configuration
let sessionMemoryConfig = {
    ...exports.DEFAULT_SESSION_MEMORY_CONFIG,
};
// Track the last summarized message ID (shared state)
let lastSummarizedMessageId;
// Track extraction state with timestamp (set by sessionMemory.ts)
let extractionStartedAt;
// Track context size at last memory extraction (for minimumTokensBetweenUpdate)
let tokensAtLastExtraction = 0;
// Track whether session memory has been initialized (met minimumMessageTokensToInit)
let sessionMemoryInitialized = false;
/**
 * Get the message ID up to which the session memory is current
 */
function getLastSummarizedMessageId() {
    return lastSummarizedMessageId;
}
/**
 * Set the last summarized message ID (called from sessionMemory.ts)
 */
function setLastSummarizedMessageId(messageId) {
    lastSummarizedMessageId = messageId;
}
/**
 * Mark extraction as started (called from sessionMemory.ts)
 */
function markExtractionStarted() {
    extractionStartedAt = Date.now();
}
/**
 * Mark extraction as completed (called from sessionMemory.ts)
 */
function markExtractionCompleted() {
    extractionStartedAt = undefined;
}
/**
 * Wait for any in-progress session memory extraction to complete (with 15s timeout)
 * Returns immediately if no extraction is in progress or if extraction is stale (>1min old).
 */
async function waitForSessionMemoryExtraction() {
    const startTime = Date.now();
    while (extractionStartedAt) {
        const extractionAge = Date.now() - extractionStartedAt;
        if (extractionAge > EXTRACTION_STALE_THRESHOLD_MS) {
            // Extraction is stale, don't wait
            return;
        }
        if (Date.now() - startTime > EXTRACTION_WAIT_TIMEOUT_MS) {
            // Timeout - continue anyway
            return;
        }
        await (0, sleep_js_1.sleep)(1000);
    }
}
/**
 * Get the current session memory content
 */
async function getSessionMemoryContent() {
    const fs = (0, fsOperations_js_1.getFsImplementation)();
    const memoryPath = (0, filesystem_js_1.getSessionMemoryPath)();
    try {
        const content = await fs.readFile(memoryPath, { encoding: 'utf-8' });
        (0, index_js_1.logEvent)('tengu_session_memory_loaded', {
            content_length: content.length,
        });
        return content;
    }
    catch (e) {
        if ((0, errors_js_1.isFsInaccessible)(e))
            return null;
        throw e;
    }
}
/**
 * Set the session memory configuration
 */
function setSessionMemoryConfig(config) {
    sessionMemoryConfig = {
        ...sessionMemoryConfig,
        ...config,
    };
}
/**
 * Get the current session memory configuration
 */
function getSessionMemoryConfig() {
    return { ...sessionMemoryConfig };
}
/**
 * Record the context size at the time of extraction.
 * Used to measure context growth for minimumTokensBetweenUpdate threshold.
 */
function recordExtractionTokenCount(currentTokenCount) {
    tokensAtLastExtraction = currentTokenCount;
}
/**
 * Check if session memory has been initialized (met minimumTokensToInit threshold)
 */
function isSessionMemoryInitialized() {
    return sessionMemoryInitialized;
}
/**
 * Mark session memory as initialized
 */
function markSessionMemoryInitialized() {
    sessionMemoryInitialized = true;
}
/**
 * Check if we've met the threshold to initialize session memory.
 * Uses total context window tokens (same as autocompact) for consistent behavior.
 */
function hasMetInitializationThreshold(currentTokenCount) {
    return currentTokenCount >= sessionMemoryConfig.minimumMessageTokensToInit;
}
/**
 * Check if we've met the threshold for the next update.
 * Measures actual context window growth since last extraction
 * (same metric as autocompact and initialization threshold).
 */
function hasMetUpdateThreshold(currentTokenCount) {
    const tokensSinceLastExtraction = currentTokenCount - tokensAtLastExtraction;
    return (tokensSinceLastExtraction >= sessionMemoryConfig.minimumTokensBetweenUpdate);
}
/**
 * Get the configured number of tool calls between updates
 */
function getToolCallsBetweenUpdates() {
    return sessionMemoryConfig.toolCallsBetweenUpdates;
}
/**
 * Reset session memory state (useful for testing)
 */
function resetSessionMemoryState() {
    sessionMemoryConfig = { ...exports.DEFAULT_SESSION_MEMORY_CONFIG };
    tokensAtLastExtraction = 0;
    sessionMemoryInitialized = false;
    lastSummarizedMessageId = undefined;
    extractionStartedAt = undefined;
}
