"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSettingsJSONSchema = generateSettingsJSONSchema;
const v4_1 = require("zod/v4");
const slowOperations_js_1 = require("../slowOperations.js");
const types_js_1 = require("./types.js");
function generateSettingsJSONSchema() {
    const jsonSchema = (0, v4_1.toJSONSchema)((0, types_js_1.SettingsSchema)(), { unrepresentable: 'any' });
    return (0, slowOperations_js_1.jsonStringify)(jsonSchema, null, 2);
}
