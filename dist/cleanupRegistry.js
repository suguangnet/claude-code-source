"use strict";
/**
 * Global registry for cleanup functions that should run during graceful shutdown.
 * This module is separate from gracefulShutdown.ts to avoid circular dependencies.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCleanup = registerCleanup;
exports.runCleanupFunctions = runCleanupFunctions;
// Global registry for cleanup functions
const cleanupFunctions = new Set();
/**
 * Register a cleanup function to run during graceful shutdown.
 * @param cleanupFn - Function to run during cleanup (can be sync or async)
 * @returns Unregister function that removes the cleanup handler
 */
function registerCleanup(cleanupFn) {
    cleanupFunctions.add(cleanupFn);
    return () => cleanupFunctions.delete(cleanupFn); // Return unregister function
}
/**
 * Run all registered cleanup functions.
 * Used internally by gracefulShutdown.
 */
async function runCleanupFunctions() {
    await Promise.all(Array.from(cleanupFunctions).map(fn => fn()));
}
