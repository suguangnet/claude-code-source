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
exports.call = call;
const state_js_1 = require("../../bootstrap/state.js");
const bridgeConfig_js_1 = require("../../bridge/bridgeConfig.js");
const messages_js_1 = require("../../utils/messages.js");
const sessionStorage_js_1 = require("../../utils/sessionStorage.js");
const teammate_js_1 = require("../../utils/teammate.js");
const generateSessionName_js_1 = require("./generateSessionName.js");
async function call(onDone, context, args) {
    // Prevent teammates from renaming - their names are set by team leader
    if ((0, teammate_js_1.isTeammate)()) {
        onDone('Cannot rename: This session is a swarm teammate. Teammate names are set by the team leader.', { display: 'system' });
        return null;
    }
    let newName;
    if (!args || args.trim() === '') {
        const generated = await (0, generateSessionName_js_1.generateSessionName)((0, messages_js_1.getMessagesAfterCompactBoundary)(context.messages), context.abortController.signal);
        if (!generated) {
            onDone('Could not generate a name: no conversation context yet. Usage: /rename <name>', { display: 'system' });
            return null;
        }
        newName = generated;
    }
    else {
        newName = args.trim();
    }
    const sessionId = (0, state_js_1.getSessionId)();
    const fullPath = (0, sessionStorage_js_1.getTranscriptPath)();
    // Always save the custom title (session name)
    await (0, sessionStorage_js_1.saveCustomTitle)(sessionId, newName, fullPath);
    // Sync title to bridge session on claude.ai/code (best-effort, non-blocking).
    // v2 env-less bridge stores cse_* in replBridgeSessionId —
    // updateBridgeSessionTitle retags internally for the compat endpoint.
    const appState = context.getAppState();
    const bridgeSessionId = appState.replBridgeSessionId;
    if (bridgeSessionId) {
        const tokenOverride = (0, bridgeConfig_js_1.getBridgeTokenOverride)();
        void Promise.resolve().then(() => __importStar(require('../../bridge/createSession.js'))).then(({ updateBridgeSessionTitle }) => updateBridgeSessionTitle(bridgeSessionId, newName, {
            baseUrl: (0, bridgeConfig_js_1.getBridgeBaseUrlOverride)(),
            getAccessToken: tokenOverride ? () => tokenOverride : undefined,
        }).catch(() => { }));
    }
    // Also persist as the session's agent name for prompt-bar display
    await (0, sessionStorage_js_1.saveAgentName)(sessionId, newName, fullPath);
    context.setAppState(prev => ({
        ...prev,
        standaloneAgentContext: {
            ...prev.standaloneAgentContext,
            name: newName,
        },
    }));
    onDone(`Session renamed to: ${newName}`, { display: 'system' });
    return null;
}
