"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logSkillsLoaded = logSkillsLoaded;
const commands_js_1 = require("../../commands.js");
const index_js_1 = require("../../services/analytics/index.js");
const prompt_js_1 = require("../../tools/SkillTool/prompt.js");
/**
 * Logs a tengu_skill_loaded event for each skill available at session startup.
 * This enables analytics on which skills are available across sessions.
 */
async function logSkillsLoaded(cwd, contextWindowTokens) {
    const skills = await (0, commands_js_1.getSkillToolCommands)(cwd);
    const skillBudget = (0, prompt_js_1.getCharBudget)(contextWindowTokens);
    for (const skill of skills) {
        if (skill.type !== 'prompt')
            continue;
        (0, index_js_1.logEvent)('tengu_skill_loaded', {
            // _PROTO_skill_name routes to the privileged skill_name BQ column.
            // Unredacted names don't go in additional_metadata.
            _PROTO_skill_name: skill.name,
            skill_source: skill.source,
            skill_loaded_from: skill.loadedFrom,
            skill_budget: skillBudget,
            ...(skill.kind && {
                skill_kind: skill.kind,
            }),
        });
    }
}
