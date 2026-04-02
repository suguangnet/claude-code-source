"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSkillImprovementSurvey = useSkillImprovementSurvey;
const react_1 = require("react");
const index_js_1 = require("../services/analytics/index.js");
const AppState_js_1 = require("../state/AppState.js");
const skillImprovement_js_1 = require("../utils/hooks/skillImprovement.js");
const messages_js_1 = require("../utils/messages.js");
function useSkillImprovementSurvey(setMessages) {
    const suggestion = (0, AppState_js_1.useAppState)(s => s.skillImprovement.suggestion);
    const setAppState = (0, AppState_js_1.useSetAppState)();
    const [isOpen, setIsOpen] = (0, react_1.useState)(false);
    const lastSuggestionRef = (0, react_1.useRef)(suggestion);
    const loggedAppearanceRef = (0, react_1.useRef)(false);
    // Track the suggestion for display even after clearing AppState
    if (suggestion) {
        lastSuggestionRef.current = suggestion;
    }
    // Open when a new suggestion arrives
    if (suggestion && !isOpen) {
        setIsOpen(true);
        if (!loggedAppearanceRef.current) {
            loggedAppearanceRef.current = true;
            (0, index_js_1.logEvent)('tengu_skill_improvement_survey', {
                event_type: 'appeared',
                // _PROTO_skill_name routes to the privileged skill_name BQ column.
                // Unredacted names don't go in additional_metadata.
                _PROTO_skill_name: (suggestion.skillName ??
                    'unknown'),
            });
        }
    }
    const handleSelect = (0, react_1.useCallback)((selected) => {
        const current = lastSuggestionRef.current;
        if (!current)
            return;
        const applied = selected !== 'dismissed';
        (0, index_js_1.logEvent)('tengu_skill_improvement_survey', {
            event_type: 'responded',
            response: (applied
                ? 'applied'
                : 'dismissed'),
            // _PROTO_skill_name routes to the privileged skill_name BQ column.
            // Unredacted names don't go in additional_metadata.
            _PROTO_skill_name: current.skillName,
        });
        if (applied) {
            void (0, skillImprovement_js_1.applySkillImprovement)(current.skillName, current.updates).then(() => {
                setMessages(prev => [
                    ...prev,
                    (0, messages_js_1.createSystemMessage)(`Skill "${current.skillName}" updated with improvements.`, 'suggestion'),
                ]);
            });
        }
        // Close and clear
        setIsOpen(false);
        loggedAppearanceRef.current = false;
        setAppState(prev => {
            if (!prev.skillImprovement.suggestion)
                return prev;
            return {
                ...prev,
                skillImprovement: { suggestion: null },
            };
        });
    }, [setAppState, setMessages]);
    return {
        isOpen,
        suggestion: lastSuggestionRef.current,
        handleSelect,
    };
}
