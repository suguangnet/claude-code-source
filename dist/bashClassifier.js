"use strict";
// Stub for external builds - classifier permissions feature is ANT-ONLY
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROMPT_PREFIX = void 0;
exports.extractPromptDescription = extractPromptDescription;
exports.createPromptRuleContent = createPromptRuleContent;
exports.isClassifierPermissionsEnabled = isClassifierPermissionsEnabled;
exports.getBashPromptDenyDescriptions = getBashPromptDenyDescriptions;
exports.getBashPromptAskDescriptions = getBashPromptAskDescriptions;
exports.getBashPromptAllowDescriptions = getBashPromptAllowDescriptions;
exports.classifyBashCommand = classifyBashCommand;
exports.generateGenericDescription = generateGenericDescription;
exports.PROMPT_PREFIX = 'prompt:';
function extractPromptDescription(_ruleContent) {
    return null;
}
function createPromptRuleContent(description) {
    return `${exports.PROMPT_PREFIX} ${description.trim()}`;
}
function isClassifierPermissionsEnabled() {
    return false;
}
function getBashPromptDenyDescriptions(_context) {
    return [];
}
function getBashPromptAskDescriptions(_context) {
    return [];
}
function getBashPromptAllowDescriptions(_context) {
    return [];
}
async function classifyBashCommand(_command, _cwd, _descriptions, _behavior, _signal, _isNonInteractiveSession) {
    return {
        matches: false,
        confidence: 'high',
        reason: 'This feature is disabled',
    };
}
async function generateGenericDescription(_command, specificDescription, _signal) {
    return specificDescription || null;
}
