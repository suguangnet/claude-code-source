"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.systemPromptSection = systemPromptSection;
exports.DANGEROUS_uncachedSystemPromptSection = DANGEROUS_uncachedSystemPromptSection;
exports.resolveSystemPromptSections = resolveSystemPromptSections;
exports.clearSystemPromptSections = clearSystemPromptSections;
const state_js_1 = require("../bootstrap/state.js");
/**
 * Create a memoized system prompt section.
 * Computed once, cached until /clear or /compact.
 */
function systemPromptSection(name, compute) {
    return { name, compute, cacheBreak: false };
}
/**
 * Create a volatile system prompt section that recomputes every turn.
 * This WILL break the prompt cache when the value changes.
 * Requires a reason explaining why cache-breaking is necessary.
 */
function DANGEROUS_uncachedSystemPromptSection(name, compute, _reason) {
    return { name, compute, cacheBreak: true };
}
/**
 * Resolve all system prompt sections, returning prompt strings.
 */
async function resolveSystemPromptSections(sections) {
    const cache = (0, state_js_1.getSystemPromptSectionCache)();
    return Promise.all(sections.map(async (s) => {
        if (!s.cacheBreak && cache.has(s.name)) {
            return cache.get(s.name) ?? null;
        }
        const value = await s.compute();
        (0, state_js_1.setSystemPromptSectionCacheEntry)(s.name, value);
        return value;
    }));
}
/**
 * Clear all system prompt section state. Called on /clear and /compact.
 * Also resets beta header latches so a fresh conversation gets fresh
 * evaluation of AFK/fast-mode/cache-editing headers.
 */
function clearSystemPromptSections() {
    (0, state_js_1.clearSystemPromptSectionState)();
    (0, state_js_1.clearBetaHeaderLatches)();
}
