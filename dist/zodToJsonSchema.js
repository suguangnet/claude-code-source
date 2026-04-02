"use strict";
/**
 * Converts Zod v4 schemas to JSON Schema using native toJSONSchema.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.zodToJsonSchema = zodToJsonSchema;
const v4_1 = require("zod/v4");
// toolToAPISchema() runs this for every tool on every API request (~60-250
// times/turn). Tool schemas are wrapped with lazySchema() which guarantees the
// same ZodTypeAny reference per session, so we can cache by identity.
const cache = new WeakMap();
/**
 * Converts a Zod v4 schema to JSON Schema format.
 */
function zodToJsonSchema(schema) {
    const hit = cache.get(schema);
    if (hit)
        return hit;
    const result = (0, v4_1.toJSONSchema)(schema);
    cache.set(schema, result);
    return result;
}
