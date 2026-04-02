"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerVerifySkill = registerVerifySkill;
const frontmatterParser_js_1 = require("../../utils/frontmatterParser.js");
const bundledSkills_js_1 = require("../bundledSkills.js");
const verifyContent_js_1 = require("./verifyContent.js");
const { frontmatter, content: SKILL_BODY } = (0, frontmatterParser_js_1.parseFrontmatter)(verifyContent_js_1.SKILL_MD);
const DESCRIPTION = typeof frontmatter.description === 'string'
    ? frontmatter.description
    : 'Verify a code change does what it should by running the app.';
function registerVerifySkill() {
    if (process.env.USER_TYPE !== 'ant') {
        return;
    }
    (0, bundledSkills_js_1.registerBundledSkill)({
        name: 'verify',
        description: DESCRIPTION,
        userInvocable: true,
        files: verifyContent_js_1.SKILL_FILES,
        async getPromptForCommand(args) {
            const parts = [SKILL_BODY.trimStart()];
            if (args) {
                parts.push(`## User Request\n\n${args}`);
            }
            return [{ type: 'text', text: parts.join('\n\n') }];
        },
    });
}
