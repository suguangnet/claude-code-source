"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activityManager = exports.ActivityManager = void 0;
const state_js_1 = require("../bootstrap/state.js");
/**
 * ActivityManager handles generic activity tracking for both user and CLI operations.
 * It automatically deduplicates overlapping activities and provides separate metrics
 * for user vs CLI active time.
 */
class ActivityManager {
    constructor(options) {
        this.activeOperations = new Set();
        this.lastUserActivityTime = 0; // Start with 0 to indicate no activity yet
        this.isCLIActive = false;
        this.USER_ACTIVITY_TIMEOUT_MS = 5000; // 5 seconds
        this.getNow = options?.getNow ?? (() => Date.now());
        this.getActiveTimeCounter =
            options?.getActiveTimeCounter ?? state_js_1.getActiveTimeCounter;
        this.lastCLIRecordedTime = this.getNow();
    }
    static getInstance() {
        if (!ActivityManager.instance) {
            ActivityManager.instance = new ActivityManager();
        }
        return ActivityManager.instance;
    }
    /**
     * Reset the singleton instance (for testing purposes)
     */
    static resetInstance() {
        ActivityManager.instance = null;
    }
    /**
     * Create a new instance with custom options (for testing purposes)
     */
    static createInstance(options) {
        ActivityManager.instance = new ActivityManager(options);
        return ActivityManager.instance;
    }
    /**
     * Called when user interacts with the CLI (typing, commands, etc.)
     */
    recordUserActivity() {
        // Don't record user time if CLI is active (CLI takes precedence)
        if (!this.isCLIActive && this.lastUserActivityTime !== 0) {
            const now = this.getNow();
            const timeSinceLastActivity = (now - this.lastUserActivityTime) / 1000;
            if (timeSinceLastActivity > 0) {
                const activeTimeCounter = this.getActiveTimeCounter();
                if (activeTimeCounter) {
                    const timeoutSeconds = this.USER_ACTIVITY_TIMEOUT_MS / 1000;
                    // Only record time if within the timeout window
                    if (timeSinceLastActivity < timeoutSeconds) {
                        activeTimeCounter.add(timeSinceLastActivity, { type: 'user' });
                    }
                }
            }
        }
        // Update the last user activity timestamp
        this.lastUserActivityTime = this.getNow();
    }
    /**
     * Starts tracking CLI activity (tool execution, AI response, etc.)
     */
    startCLIActivity(operationId) {
        // If operation already exists, it likely means the previous one didn't clean up
        // properly (e.g., component crashed/unmounted without calling end). Force cleanup
        // to avoid overestimating time - better to underestimate than overestimate.
        if (this.activeOperations.has(operationId)) {
            this.endCLIActivity(operationId);
        }
        const wasEmpty = this.activeOperations.size === 0;
        this.activeOperations.add(operationId);
        if (wasEmpty) {
            this.isCLIActive = true;
            this.lastCLIRecordedTime = this.getNow();
        }
    }
    /**
     * Stops tracking CLI activity
     */
    endCLIActivity(operationId) {
        this.activeOperations.delete(operationId);
        if (this.activeOperations.size === 0) {
            // Last operation ended - CLI becoming inactive
            // Record the CLI time before switching to inactive
            const now = this.getNow();
            const timeSinceLastRecord = (now - this.lastCLIRecordedTime) / 1000;
            if (timeSinceLastRecord > 0) {
                const activeTimeCounter = this.getActiveTimeCounter();
                if (activeTimeCounter) {
                    activeTimeCounter.add(timeSinceLastRecord, { type: 'cli' });
                }
            }
            this.lastCLIRecordedTime = now;
            this.isCLIActive = false;
        }
    }
    /**
     * Convenience method to track an async operation automatically (mainly for testing/debugging)
     */
    async trackOperation(operationId, fn) {
        this.startCLIActivity(operationId);
        try {
            return await fn();
        }
        finally {
            this.endCLIActivity(operationId);
        }
    }
    /**
     * Gets current activity states (mainly for testing/debugging)
     */
    getActivityStates() {
        const now = this.getNow();
        const timeSinceUserActivity = (now - this.lastUserActivityTime) / 1000;
        const isUserActive = timeSinceUserActivity < this.USER_ACTIVITY_TIMEOUT_MS / 1000;
        return {
            isUserActive,
            isCLIActive: this.isCLIActive,
            activeOperationCount: this.activeOperations.size,
        };
    }
}
exports.ActivityManager = ActivityManager;
ActivityManager.instance = null;
// Export singleton instance
exports.activityManager = ActivityManager.getInstance();
