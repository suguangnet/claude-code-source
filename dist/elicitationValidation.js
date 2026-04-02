"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEnumSchema = void 0;
exports.isMultiSelectEnumSchema = isMultiSelectEnumSchema;
exports.getMultiSelectValues = getMultiSelectValues;
exports.getMultiSelectLabels = getMultiSelectLabels;
exports.getMultiSelectLabel = getMultiSelectLabel;
exports.getEnumValues = getEnumValues;
exports.getEnumLabels = getEnumLabels;
exports.getEnumLabel = getEnumLabel;
exports.validateElicitationInput = validateElicitationInput;
exports.getFormatHint = getFormatHint;
exports.isDateTimeSchema = isDateTimeSchema;
exports.validateElicitationInputAsync = validateElicitationInputAsync;
const v4_1 = require("zod/v4");
const slowOperations_js_1 = require("../slowOperations.js");
const stringUtils_js_1 = require("../stringUtils.js");
const dateTimeParser_js_1 = require("./dateTimeParser.js");
const STRING_FORMATS = {
    email: {
        description: 'email address',
        example: 'user@example.com',
    },
    uri: {
        description: 'URI',
        example: 'https://example.com',
    },
    date: {
        description: 'date',
        example: '2024-03-15',
    },
    'date-time': {
        description: 'date-time',
        example: '2024-03-15T14:30:00Z',
    },
};
/**
 * Check if schema is a single-select enum (either legacy `enum` format or new `oneOf` format)
 */
const isEnumSchema = (schema) => {
    return schema.type === 'string' && ('enum' in schema || 'oneOf' in schema);
};
exports.isEnumSchema = isEnumSchema;
/**
 * Check if schema is a multi-select enum (`type: "array"` with `items.enum` or `items.anyOf`)
 */
function isMultiSelectEnumSchema(schema) {
    return (schema.type === 'array' &&
        'items' in schema &&
        typeof schema.items === 'object' &&
        schema.items !== null &&
        ('enum' in schema.items || 'anyOf' in schema.items));
}
/**
 * Get values from a multi-select enum schema
 */
function getMultiSelectValues(schema) {
    if ('anyOf' in schema.items) {
        return schema.items.anyOf.map(item => item.const);
    }
    if ('enum' in schema.items) {
        return schema.items.enum;
    }
    return [];
}
/**
 * Get display labels from a multi-select enum schema
 */
function getMultiSelectLabels(schema) {
    if ('anyOf' in schema.items) {
        return schema.items.anyOf.map(item => item.title);
    }
    if ('enum' in schema.items) {
        return schema.items.enum;
    }
    return [];
}
/**
 * Get label for a specific value in a multi-select enum
 */
function getMultiSelectLabel(schema, value) {
    const index = getMultiSelectValues(schema).indexOf(value);
    return index >= 0 ? (getMultiSelectLabels(schema)[index] ?? value) : value;
}
/**
 * Get enum values from EnumSchema (handles both legacy `enum` and new `oneOf` formats)
 */
function getEnumValues(schema) {
    if ('oneOf' in schema) {
        return schema.oneOf.map(item => item.const);
    }
    if ('enum' in schema) {
        return schema.enum;
    }
    return [];
}
/**
 * Get enum display labels from EnumSchema
 */
function getEnumLabels(schema) {
    if ('oneOf' in schema) {
        return schema.oneOf.map(item => item.title);
    }
    if ('enum' in schema) {
        return ('enumNames' in schema ? schema.enumNames : undefined) ?? schema.enum;
    }
    return [];
}
/**
 * Get label for a specific enum value
 */
function getEnumLabel(schema, value) {
    const index = getEnumValues(schema).indexOf(value);
    return index >= 0 ? (getEnumLabels(schema)[index] ?? value) : value;
}
function getZodSchema(schema) {
    if ((0, exports.isEnumSchema)(schema)) {
        const [first, ...rest] = getEnumValues(schema);
        if (!first) {
            return v4_1.z.never();
        }
        return v4_1.z.enum([first, ...rest]);
    }
    if (schema.type === 'string') {
        let stringSchema = v4_1.z.string();
        if (schema.minLength !== undefined) {
            stringSchema = stringSchema.min(schema.minLength, {
                message: `Must be at least ${schema.minLength} ${(0, stringUtils_js_1.plural)(schema.minLength, 'character')}`,
            });
        }
        if (schema.maxLength !== undefined) {
            stringSchema = stringSchema.max(schema.maxLength, {
                message: `Must be at most ${schema.maxLength} ${(0, stringUtils_js_1.plural)(schema.maxLength, 'character')}`,
            });
        }
        switch (schema.format) {
            case 'email':
                stringSchema = stringSchema.email({
                    message: 'Must be a valid email address, e.g. user@example.com',
                });
                break;
            case 'uri':
                stringSchema = stringSchema.url({
                    message: 'Must be a valid URI, e.g. https://example.com',
                });
                break;
            case 'date':
                stringSchema = stringSchema.date('Must be a valid date, e.g. 2024-03-15, today, next Monday');
                break;
            case 'date-time':
                stringSchema = stringSchema.datetime({
                    offset: true,
                    message: 'Must be a valid date-time, e.g. 2024-03-15T14:30:00Z, tomorrow at 3pm',
                });
                break;
            default:
                // No specific format validation
                break;
        }
        return stringSchema;
    }
    if (schema.type === 'number' || schema.type === 'integer') {
        const typeLabel = schema.type === 'integer' ? 'an integer' : 'a number';
        const isInteger = schema.type === 'integer';
        const formatNum = (n) => Number.isInteger(n) && !isInteger ? `${n}.0` : String(n);
        // Build a single descriptive error message for range violations
        const rangeMsg = schema.minimum !== undefined && schema.maximum !== undefined
            ? `Must be ${typeLabel} between ${formatNum(schema.minimum)} and ${formatNum(schema.maximum)}`
            : schema.minimum !== undefined
                ? `Must be ${typeLabel} >= ${formatNum(schema.minimum)}`
                : schema.maximum !== undefined
                    ? `Must be ${typeLabel} <= ${formatNum(schema.maximum)}`
                    : `Must be ${typeLabel}`;
        let numberSchema = v4_1.z.coerce.number({
            error: rangeMsg,
        });
        if (schema.type === 'integer') {
            numberSchema = numberSchema.int({ message: rangeMsg });
        }
        if (schema.minimum !== undefined) {
            numberSchema = numberSchema.min(schema.minimum, {
                message: rangeMsg,
            });
        }
        if (schema.maximum !== undefined) {
            numberSchema = numberSchema.max(schema.maximum, {
                message: rangeMsg,
            });
        }
        return numberSchema;
    }
    if (schema.type === 'boolean') {
        return v4_1.z.coerce.boolean();
    }
    throw new Error(`Unsupported schema: ${(0, slowOperations_js_1.jsonStringify)(schema)}`);
}
function validateElicitationInput(stringValue, schema) {
    const zodSchema = getZodSchema(schema);
    const parseResult = zodSchema.safeParse(stringValue);
    if (parseResult.success) {
        // zodSchema always produces primitive types for elicitation
        return {
            value: parseResult.data,
            isValid: true,
        };
    }
    return {
        isValid: false,
        error: parseResult.error.issues.map(e => e.message).join('; '),
    };
}
const hasStringFormat = (schema) => {
    return (schema.type === 'string' &&
        'format' in schema &&
        typeof schema.format === 'string');
};
/**
 * Returns a helpful placeholder/hint for a given format
 */
function getFormatHint(schema) {
    if (schema.type === 'string') {
        if (!hasStringFormat(schema)) {
            return undefined;
        }
        const { description, example } = STRING_FORMATS[schema.format] || {};
        return `${description}, e.g. ${example}`;
    }
    if (schema.type === 'number' || schema.type === 'integer') {
        const isInteger = schema.type === 'integer';
        const formatNum = (n) => Number.isInteger(n) && !isInteger ? `${n}.0` : String(n);
        if (schema.minimum !== undefined && schema.maximum !== undefined) {
            return `(${schema.type} between ${formatNum(schema.minimum)} and ${formatNum(schema.maximum)})`;
        }
        else if (schema.minimum !== undefined) {
            return `(${schema.type} >= ${formatNum(schema.minimum)})`;
        }
        else if (schema.maximum !== undefined) {
            return `(${schema.type} <= ${formatNum(schema.maximum)})`;
        }
        else {
            const example = schema.type === 'integer' ? '42' : '3.14';
            return `(${schema.type}, e.g. ${example})`;
        }
    }
    return undefined;
}
/**
 * Check if a schema is a date or date-time format that supports NL parsing
 */
function isDateTimeSchema(schema) {
    return (schema.type === 'string' &&
        'format' in schema &&
        (schema.format === 'date' || schema.format === 'date-time'));
}
/**
 * Async validation that attempts NL date/time parsing via Haiku
 * when the input doesn't look like ISO 8601.
 */
async function validateElicitationInputAsync(stringValue, schema, signal) {
    const syncResult = validateElicitationInput(stringValue, schema);
    if (syncResult.isValid) {
        return syncResult;
    }
    if (isDateTimeSchema(schema) && !(0, dateTimeParser_js_1.looksLikeISO8601)(stringValue)) {
        const parseResult = await (0, dateTimeParser_js_1.parseNaturalLanguageDateTime)(stringValue, schema.format, signal);
        if (parseResult.success) {
            const validatedParsed = validateElicitationInput(parseResult.value, schema);
            if (validatedParsed.isValid) {
                return validatedParsed;
            }
        }
    }
    return syncResult;
}
