"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMCPSkillBuilders = registerMCPSkillBuilders;
exports.getMCPSkillBuilders = getMCPSkillBuilders;
let builders = null;
function registerMCPSkillBuilders(b) {
    builders = b;
}
function getMCPSkillBuilders() {
    if (!builders) {
        throw new Error('MCP skill builders not registered — loadSkillsDir.ts has not been evaluated yet');
    }
    return builders;
}
