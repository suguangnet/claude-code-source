"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.call = void 0;
const index_js_1 = require("../../services/analytics/index.js");
const config_js_1 = require("../../utils/config.js");
const call = async () => {
    const config = (0, config_js_1.getGlobalConfig)();
    let currentMode = config.editorMode || 'normal';
    // Handle backward compatibility - treat 'emacs' as 'normal'
    if (currentMode === 'emacs') {
        currentMode = 'normal';
    }
    const newMode = currentMode === 'normal' ? 'vim' : 'normal';
    (0, config_js_1.saveGlobalConfig)(current => ({
        ...current,
        editorMode: newMode,
    }));
    (0, index_js_1.logEvent)('tengu_editor_mode_changed', {
        mode: newMode,
        source: 'command',
    });
    return {
        type: 'text',
        value: `Editor mode set to ${newMode}. ${newMode === 'vim'
            ? 'Use Escape key to toggle between INSERT and NORMAL modes.'
            : 'Using standard (readline) keyboard bindings.'}`,
    };
};
exports.call = call;
