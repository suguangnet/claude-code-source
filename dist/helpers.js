"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateManifest = validateManifest;
exports.parseAndValidateManifestFromText = parseAndValidateManifestFromText;
exports.parseAndValidateManifestFromBytes = parseAndValidateManifestFromBytes;
exports.generateExtensionId = generateExtensionId;
const errors_js_1 = require("../errors.js");
const slowOperations_js_1 = require("../slowOperations.js");
/**
 * Parses and validates a DXT manifest from a JSON object.
 *
 * Lazy-imports @anthropic-ai/mcpb: that package uses zod v3 which eagerly
 * creates 24 .bind(this) closures per schema instance (~300 instances between
 * schemas.js and schemas-loose.js). Deferring the import keeps ~700KB of bound
 * closures out of the startup heap for sessions that never touch .dxt/.mcpb.
 */
async function validateManifest(manifestJson) {
    const { McpbManifestSchema } = await Promise.resolve().then(() => __importStar(require('@anthropic-ai/mcpb')));
    const parseResult = McpbManifestSchema.safeParse(manifestJson);
    if (!parseResult.success) {
        const errors = parseResult.error.flatten();
        const errorMessages = [
            ...Object.entries(errors.fieldErrors).map(([field, errs]) => `${field}: ${errs?.join(', ')}`),
            ...(errors.formErrors || []),
        ]
            .filter(Boolean)
            .join('; ');
        throw new Error(`Invalid manifest: ${errorMessages}`);
    }
    return parseResult.data;
}
/**
 * Parses and validates a DXT manifest from raw text data.
 */
async function parseAndValidateManifestFromText(manifestText) {
    let manifestJson;
    try {
        manifestJson = (0, slowOperations_js_1.jsonParse)(manifestText);
    }
    catch (error) {
        throw new Error(`Invalid JSON in manifest.json: ${(0, errors_js_1.errorMessage)(error)}`);
    }
    return validateManifest(manifestJson);
}
/**
 * Parses and validates a DXT manifest from raw binary data.
 */
async function parseAndValidateManifestFromBytes(manifestData) {
    const manifestText = new TextDecoder().decode(manifestData);
    return parseAndValidateManifestFromText(manifestText);
}
/**
 * Generates an extension ID from author name and extension name.
 * Uses the same algorithm as the directory backend for consistency.
 */
function generateExtensionId(manifest, prefix) {
    const sanitize = (str) => str
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_.]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    const authorName = manifest.author.name;
    const extensionName = manifest.name;
    const sanitizedAuthor = sanitize(authorName);
    const sanitizedName = sanitize(extensionName);
    return prefix
        ? `${prefix}.${sanitizedAuthor}.${sanitizedName}`
        : `${sanitizedAuthor}.${sanitizedName}`;
}
