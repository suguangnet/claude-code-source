"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useMultipleChoiceState = useMultipleChoiceState;
const react_1 = require("react");
function reducer(state, action) {
    switch (action.type) {
        case 'next-question':
            return {
                ...state,
                currentQuestionIndex: state.currentQuestionIndex + 1,
                isInTextInput: false,
            };
        case 'prev-question':
            return {
                ...state,
                currentQuestionIndex: Math.max(0, state.currentQuestionIndex - 1),
                isInTextInput: false,
            };
        case 'update-question-state': {
            const existing = state.questionStates[action.questionText];
            const newState = {
                selectedValue: action.updates.selectedValue ??
                    existing?.selectedValue ??
                    (action.isMultiSelect ? [] : undefined),
                textInputValue: action.updates.textInputValue ?? existing?.textInputValue ?? '',
            };
            return {
                ...state,
                questionStates: {
                    ...state.questionStates,
                    [action.questionText]: newState,
                },
            };
        }
        case 'set-answer': {
            const newState = {
                ...state,
                answers: {
                    ...state.answers,
                    [action.questionText]: action.answer,
                },
            };
            if (action.shouldAdvance) {
                return {
                    ...newState,
                    currentQuestionIndex: newState.currentQuestionIndex + 1,
                    isInTextInput: false,
                };
            }
            return newState;
        }
        case 'set-text-input-mode':
            return {
                ...state,
                isInTextInput: action.isInInput,
            };
    }
}
const INITIAL_STATE = {
    currentQuestionIndex: 0,
    answers: {},
    questionStates: {},
    isInTextInput: false,
};
function useMultipleChoiceState() {
    const [state, dispatch] = (0, react_1.useReducer)(reducer, INITIAL_STATE);
    const nextQuestion = (0, react_1.useCallback)(() => {
        dispatch({ type: 'next-question' });
    }, []);
    const prevQuestion = (0, react_1.useCallback)(() => {
        dispatch({ type: 'prev-question' });
    }, []);
    const updateQuestionState = (0, react_1.useCallback)((questionText, updates, isMultiSelect) => {
        dispatch({
            type: 'update-question-state',
            questionText,
            updates,
            isMultiSelect,
        });
    }, []);
    const setAnswer = (0, react_1.useCallback)((questionText, answer, shouldAdvance = true) => {
        dispatch({
            type: 'set-answer',
            questionText,
            answer,
            shouldAdvance,
        });
    }, []);
    const setTextInputMode = (0, react_1.useCallback)((isInInput) => {
        dispatch({ type: 'set-text-input-mode', isInInput });
    }, []);
    return {
        currentQuestionIndex: state.currentQuestionIndex,
        answers: state.answers,
        questionStates: state.questionStates,
        isInTextInput: state.isInTextInput,
        nextQuestion,
        prevQuestion,
        updateQuestionState,
        setAnswer,
        setTextInputMode,
    };
}
