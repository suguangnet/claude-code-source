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
exports.getImageProcessor = getImageProcessor;
exports.getImageCreator = getImageCreator;
const bundledMode_js_1 = require("../../utils/bundledMode.js");
let imageProcessorModule = null;
let imageCreatorModule = null;
async function getImageProcessor() {
    if (imageProcessorModule) {
        return imageProcessorModule.default;
    }
    if ((0, bundledMode_js_1.isInBundledMode)()) {
        // Try to load the native image processor first
        try {
            // Use the native image processor module
            const imageProcessor = await Promise.resolve().then(() => __importStar(require('image-processor-napi')));
            const sharp = imageProcessor.sharp || imageProcessor.default;
            imageProcessorModule = { default: sharp };
            return sharp;
        }
        catch {
            // Fall back to sharp if native module is not available
            // biome-ignore lint/suspicious/noConsole: intentional warning
            console.warn('Native image processor not available, falling back to sharp');
        }
    }
    // Use sharp for non-bundled builds or as fallback.
    // Single structural cast: our SharpFunction is a subset of sharp's actual type surface.
    const imported = (await Promise.resolve().then(() => __importStar(require('sharp'))));
    const sharp = unwrapDefault(imported);
    imageProcessorModule = { default: sharp };
    return sharp;
}
/**
 * Get image creator for generating new images from scratch.
 * Note: image-processor-napi doesn't support image creation,
 * so this always uses sharp directly.
 */
async function getImageCreator() {
    if (imageCreatorModule) {
        return imageCreatorModule.default;
    }
    const imported = (await Promise.resolve().then(() => __importStar(require('sharp'))));
    const sharp = unwrapDefault(imported);
    imageCreatorModule = { default: sharp };
    return sharp;
}
function unwrapDefault(mod) {
    return typeof mod === 'function' ? mod : mod.default;
}
