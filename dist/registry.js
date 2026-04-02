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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCommandSpec = void 0;
exports.loadFigSpec = loadFigSpec;
const memoize_js_1 = require("../memoize.js");
const index_js_1 = __importDefault(require("./specs/index.js"));
async function loadFigSpec(command) {
    if (!command || command.includes('/') || command.includes('\\'))
        return null;
    if (command.includes('..'))
        return null;
    if (command.startsWith('-') && command !== '-')
        return null;
    try {
        const module = await Promise.resolve(`${`@withfig/autocomplete/build/${command}.js`}`).then(s => __importStar(require(s)));
        return module.default || module;
    }
    catch {
        return null;
    }
}
exports.getCommandSpec = (0, memoize_js_1.memoizeWithLRU)(async (command) => {
    const spec = index_js_1.default.find(s => s.name === command) ||
        (await loadFigSpec(command)) ||
        null;
    return spec;
}, (command) => command);
