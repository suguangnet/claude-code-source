"use strict";
/**
 * Auto mode subcommand handlers — dump default/merged classifier rules and
 * critique user-written rules. Dynamically imported when `claude auto-mode ...` runs.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.autoModeDefaultsHandler = autoModeDefaultsHandler;
exports.autoModeConfigHandler = autoModeConfigHandler;
exports.autoModeCritiqueHandler = autoModeCritiqueHandler;
const errors_js_1 = require("../../utils/errors.js");
const model_js_1 = require("../../utils/model/model.js");
const yoloClassifier_js_1 = require("../../utils/permissions/yoloClassifier.js");
const settings_js_1 = require("../../utils/settings/settings.js");
const sideQuery_js_1 = require("../../utils/sideQuery.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
function writeRules(rules) {
    process.stdout.write((0, slowOperations_js_1.jsonStringify)(rules, null, 2) + '\n');
}
function autoModeDefaultsHandler() {
    writeRules((0, yoloClassifier_js_1.getDefaultExternalAutoModeRules)());
}
/**
 * Dump the effective auto mode config: user settings where provided, external
 * defaults otherwise. Per-section REPLACE semantics — matches how
 * buildYoloSystemPrompt resolves the external template (a non-empty user
 * section replaces that section's defaults entirely; an empty/absent section
 * falls through to defaults).
 */
function autoModeConfigHandler() {
    const config = (0, settings_js_1.getAutoModeConfig)();
    const defaults = (0, yoloClassifier_js_1.getDefaultExternalAutoModeRules)();
    writeRules({
        allow: config?.allow?.length ? config.allow : defaults.allow,
        soft_deny: config?.soft_deny?.length
            ? config.soft_deny
            : defaults.soft_deny,
        environment: config?.environment?.length
            ? config.environment
            : defaults.environment,
    });
}
const CRITIQUE_SYSTEM_PROMPT = 'You are an expert reviewer of auto mode classifier rules for Claude Code.\n' +
    '\n' +
    'Claude Code has an "auto mode" that uses an AI classifier to decide whether ' +
    'tool calls should be auto-approved or require user confirmation. Users can ' +
    'write custom rules in three categories:\n' +
    '\n' +
    '- **allow**: Actions the classifier should auto-approve\n' +
    '- **soft_deny**: Actions the classifier should block (require user confirmation)\n' +
    "- **environment**: Context about the user's setup that helps the classifier make decisions\n" +
    '\n' +
    "Your job is to critique the user's custom rules for clarity, completeness, " +
    'and potential issues. The classifier is an LLM that reads these rules as ' +
    'part of its system prompt.\n' +
    '\n' +
    'For each rule, evaluate:\n' +
    '1. **Clarity**: Is the rule unambiguous? Could the classifier misinterpret it?\n' +
    "2. **Completeness**: Are there gaps or edge cases the rule doesn't cover?\n" +
    '3. **Conflicts**: Do any of the rules conflict with each other?\n' +
    '4. **Actionability**: Is the rule specific enough for the classifier to act on?\n' +
    '\n' +
    'Be concise and constructive. Only comment on rules that could be improved. ' +
    'If all rules look good, say so.';
async function autoModeCritiqueHandler(options) {
    const config = (0, settings_js_1.getAutoModeConfig)();
    const hasCustomRules = (config?.allow?.length ?? 0) > 0 ||
        (config?.soft_deny?.length ?? 0) > 0 ||
        (config?.environment?.length ?? 0) > 0;
    if (!hasCustomRules) {
        process.stdout.write('No custom auto mode rules found.\n\n' +
            'Add rules to your settings file under autoMode.{allow, soft_deny, environment}.\n' +
            'Run `claude auto-mode defaults` to see the default rules for reference.\n');
        return;
    }
    const model = options.model
        ? (0, model_js_1.parseUserSpecifiedModel)(options.model)
        : (0, model_js_1.getMainLoopModel)();
    const defaults = (0, yoloClassifier_js_1.getDefaultExternalAutoModeRules)();
    const classifierPrompt = (0, yoloClassifier_js_1.buildDefaultExternalSystemPrompt)();
    const userRulesSummary = formatRulesForCritique('allow', config?.allow ?? [], defaults.allow) +
        formatRulesForCritique('soft_deny', config?.soft_deny ?? [], defaults.soft_deny) +
        formatRulesForCritique('environment', config?.environment ?? [], defaults.environment);
    process.stdout.write('Analyzing your auto mode rules…\n\n');
    let response;
    try {
        response = await (0, sideQuery_js_1.sideQuery)({
            querySource: 'auto_mode_critique',
            model,
            system: CRITIQUE_SYSTEM_PROMPT,
            skipSystemPromptPrefix: true,
            max_tokens: 4096,
            messages: [
                {
                    role: 'user',
                    content: 'Here is the full classifier system prompt that the auto mode classifier receives:\n\n' +
                        '<classifier_system_prompt>\n' +
                        classifierPrompt +
                        '\n</classifier_system_prompt>\n\n' +
                        "Here are the user's custom rules that REPLACE the corresponding default sections:\n\n" +
                        userRulesSummary +
                        '\nPlease critique these custom rules.',
                },
            ],
        });
    }
    catch (error) {
        process.stderr.write('Failed to analyze rules: ' + (0, errors_js_1.errorMessage)(error) + '\n');
        process.exitCode = 1;
        return;
    }
    const textBlock = response.content.find(block => block.type === 'text');
    if (textBlock?.type === 'text') {
        process.stdout.write(textBlock.text + '\n');
    }
    else {
        process.stdout.write('No critique was generated. Please try again.\n');
    }
}
function formatRulesForCritique(section, userRules, defaultRules) {
    if (userRules.length === 0)
        return '';
    const customLines = userRules.map(r => '- ' + r).join('\n');
    const defaultLines = defaultRules.map(r => '- ' + r).join('\n');
    return ('## ' +
        section +
        ' (custom rules replacing defaults)\n' +
        'Custom:\n' +
        customLines +
        '\n\n' +
        'Defaults being replaced:\n' +
        defaultLines +
        '\n\n');
}
