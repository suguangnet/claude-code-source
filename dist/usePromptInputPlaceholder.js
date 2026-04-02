"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePromptInputPlaceholder = usePromptInputPlaceholder;
const bun_bundle_1 = require("bun:bundle");
const react_1 = require("react");
const useCommandQueue_js_1 = require("src/hooks/useCommandQueue.js");
const AppState_js_1 = require("src/state/AppState.js");
const config_js_1 = require("src/utils/config.js");
const exampleCommands_js_1 = require("src/utils/exampleCommands.js");
const messageQueueManager_js_1 = require("src/utils/messageQueueManager.js");
// Dead code elimination: conditional import for proactive mode
/* eslint-disable @typescript-eslint/no-require-imports */
const proactiveModule = (0, bun_bundle_1.feature)('PROACTIVE') || (0, bun_bundle_1.feature)('KAIROS')
    ? require('../../proactive/index.js')
    : null;
const NUM_TIMES_QUEUE_HINT_SHOWN = 3;
const MAX_TEAMMATE_NAME_LENGTH = 20;
function usePromptInputPlaceholder({ input, submitCount, viewingAgentName, }) {
    const queuedCommands = (0, useCommandQueue_js_1.useCommandQueue)();
    const promptSuggestionEnabled = (0, AppState_js_1.useAppState)(s => s.promptSuggestionEnabled);
    const placeholder = (0, react_1.useMemo)(() => {
        if (input !== '') {
            return;
        }
        // Show teammate hint when viewing teammate
        if (viewingAgentName) {
            const displayName = viewingAgentName.length > MAX_TEAMMATE_NAME_LENGTH
                ? viewingAgentName.slice(0, MAX_TEAMMATE_NAME_LENGTH - 3) + '...'
                : viewingAgentName;
            return `Message @${displayName}…`;
        }
        // Show queue hint if user has not seen it yet.
        // Only count user-editable commands — task-notification and isMeta
        // are hidden from the prompt area (see PromptInputQueuedCommands).
        if (queuedCommands.some(messageQueueManager_js_1.isQueuedCommandEditable) &&
            ((0, config_js_1.getGlobalConfig)().queuedCommandUpHintCount || 0) <
                NUM_TIMES_QUEUE_HINT_SHOWN) {
            return 'Press up to edit queued messages';
        }
        // Show example command if user has not submitted yet and suggestions are enabled.
        // Skip in proactive mode — the model drives the conversation so onboarding
        // examples are irrelevant and block prompt suggestions from showing.
        if (submitCount < 1 &&
            promptSuggestionEnabled &&
            !proactiveModule?.isProactiveActive()) {
            return (0, exampleCommands_js_1.getExampleCommandFromCache)();
        }
    }, [
        input,
        queuedCommands,
        submitCount,
        promptSuggestionEnabled,
        viewingAgentName,
    ]);
    return placeholder;
}
