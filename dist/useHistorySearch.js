"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useHistorySearch = useHistorySearch;
const bun_bundle_1 = require("bun:bundle");
const react_1 = require("react");
const inputModes_js_1 = require("../components/PromptInput/inputModes.js");
const history_js_1 = require("../history.js");
const keyboard_event_js_1 = require("../ink/events/keyboard-event.js");
// eslint-disable-next-line custom-rules/prefer-use-keybindings -- backward-compat bridge until consumers wire handleKeyDown to <Box onKeyDown>
const ink_js_1 = require("../ink.js");
const useKeybinding_js_1 = require("../keybindings/useKeybinding.js");
function useHistorySearch(onAcceptHistory, currentInput, onInputChange, onCursorChange, currentCursorOffset, onModeChange, currentMode, isSearching, setIsSearching, setPastedContents, currentPastedContents) {
    const [historyQuery, setHistoryQuery] = (0, react_1.useState)('');
    const [historyFailedMatch, setHistoryFailedMatch] = (0, react_1.useState)(false);
    const [originalInput, setOriginalInput] = (0, react_1.useState)('');
    const [originalCursorOffset, setOriginalCursorOffset] = (0, react_1.useState)(0);
    const [originalMode, setOriginalMode] = (0, react_1.useState)('prompt');
    const [originalPastedContents, setOriginalPastedContents] = (0, react_1.useState)({});
    const [historyMatch, setHistoryMatch] = (0, react_1.useState)(undefined);
    const historyReader = (0, react_1.useRef)(undefined);
    const seenPrompts = (0, react_1.useRef)(new Set());
    const searchAbortController = (0, react_1.useRef)(null);
    const closeHistoryReader = (0, react_1.useCallback)(() => {
        if (historyReader.current) {
            // Must explicitly call .return() to trigger the finally block in readLinesReverse,
            // which closes the file handle. Without this, file descriptors leak.
            void historyReader.current.return(undefined);
            historyReader.current = undefined;
        }
    }, []);
    const reset = (0, react_1.useCallback)(() => {
        setIsSearching(false);
        setHistoryQuery('');
        setHistoryFailedMatch(false);
        setOriginalInput('');
        setOriginalCursorOffset(0);
        setOriginalMode('prompt');
        setOriginalPastedContents({});
        setHistoryMatch(undefined);
        closeHistoryReader();
        seenPrompts.current.clear();
    }, [setIsSearching, closeHistoryReader]);
    const searchHistory = (0, react_1.useCallback)(async (resume, signal) => {
        if (!isSearching) {
            return;
        }
        if (historyQuery.length === 0) {
            closeHistoryReader();
            seenPrompts.current.clear();
            setHistoryMatch(undefined);
            setHistoryFailedMatch(false);
            onInputChange(originalInput);
            onCursorChange(originalCursorOffset);
            onModeChange(originalMode);
            setPastedContents(originalPastedContents);
            return;
        }
        if (!resume) {
            closeHistoryReader();
            historyReader.current = (0, history_js_1.makeHistoryReader)();
            seenPrompts.current.clear();
        }
        if (!historyReader.current) {
            return;
        }
        while (true) {
            if (signal?.aborted) {
                return;
            }
            const item = await historyReader.current.next();
            if (item.done) {
                // No match found - keep last match but mark as failed
                setHistoryFailedMatch(true);
                return;
            }
            const display = item.value.display;
            const matchPosition = display.lastIndexOf(historyQuery);
            if (matchPosition !== -1 && !seenPrompts.current.has(display)) {
                seenPrompts.current.add(display);
                setHistoryMatch(item.value);
                setHistoryFailedMatch(false);
                const mode = (0, inputModes_js_1.getModeFromInput)(display);
                onModeChange(mode);
                onInputChange(display);
                setPastedContents(item.value.pastedContents);
                // Position cursor relative to the clean value, not the display
                const value = (0, inputModes_js_1.getValueFromInput)(display);
                const cleanMatchPosition = value.lastIndexOf(historyQuery);
                onCursorChange(cleanMatchPosition !== -1 ? cleanMatchPosition : matchPosition);
                return;
            }
        }
    }, [
        isSearching,
        historyQuery,
        closeHistoryReader,
        onInputChange,
        onCursorChange,
        onModeChange,
        setPastedContents,
        originalInput,
        originalCursorOffset,
        originalMode,
        originalPastedContents,
    ]);
    // Handler: Start history search (when not searching)
    const handleStartSearch = (0, react_1.useCallback)(() => {
        setIsSearching(true);
        setOriginalInput(currentInput);
        setOriginalCursorOffset(currentCursorOffset);
        setOriginalMode(currentMode);
        setOriginalPastedContents(currentPastedContents);
        historyReader.current = (0, history_js_1.makeHistoryReader)();
        seenPrompts.current.clear();
    }, [
        setIsSearching,
        currentInput,
        currentCursorOffset,
        currentMode,
        currentPastedContents,
    ]);
    // Handler: Find next match (when searching)
    const handleNextMatch = (0, react_1.useCallback)(() => {
        void searchHistory(true);
    }, [searchHistory]);
    // Handler: Accept current match and exit search
    const handleAccept = (0, react_1.useCallback)(() => {
        if (historyMatch) {
            const mode = (0, inputModes_js_1.getModeFromInput)(historyMatch.display);
            const value = (0, inputModes_js_1.getValueFromInput)(historyMatch.display);
            onInputChange(value);
            onModeChange(mode);
            setPastedContents(historyMatch.pastedContents);
        }
        else {
            // No match - restore original pasted contents
            setPastedContents(originalPastedContents);
        }
        reset();
    }, [
        historyMatch,
        onInputChange,
        onModeChange,
        setPastedContents,
        originalPastedContents,
        reset,
    ]);
    // Handler: Cancel search and restore original input
    const handleCancel = (0, react_1.useCallback)(() => {
        onInputChange(originalInput);
        onCursorChange(originalCursorOffset);
        setPastedContents(originalPastedContents);
        reset();
    }, [
        onInputChange,
        onCursorChange,
        setPastedContents,
        originalInput,
        originalCursorOffset,
        originalPastedContents,
        reset,
    ]);
    // Handler: Execute (accept and submit)
    const handleExecute = (0, react_1.useCallback)(() => {
        if (historyQuery.length === 0) {
            onAcceptHistory({
                display: originalInput,
                pastedContents: originalPastedContents,
            });
        }
        else if (historyMatch) {
            const mode = (0, inputModes_js_1.getModeFromInput)(historyMatch.display);
            const value = (0, inputModes_js_1.getValueFromInput)(historyMatch.display);
            onModeChange(mode);
            onAcceptHistory({
                display: value,
                pastedContents: historyMatch.pastedContents,
            });
        }
        reset();
    }, [
        historyQuery,
        historyMatch,
        onAcceptHistory,
        onModeChange,
        originalInput,
        originalPastedContents,
        reset,
    ]);
    // Gated off under HISTORY_PICKER — the modal dialog owns ctrl+r there.
    (0, useKeybinding_js_1.useKeybinding)('history:search', handleStartSearch, {
        context: 'Global',
        isActive: (0, bun_bundle_1.feature)('HISTORY_PICKER') ? false : !isSearching,
    });
    // History search context keybindings (only active when searching)
    const historySearchHandlers = (0, react_1.useMemo)(() => ({
        'historySearch:next': handleNextMatch,
        'historySearch:accept': handleAccept,
        'historySearch:cancel': handleCancel,
        'historySearch:execute': handleExecute,
    }), [handleNextMatch, handleAccept, handleCancel, handleExecute]);
    (0, useKeybinding_js_1.useKeybindings)(historySearchHandlers, {
        context: 'HistorySearch',
        isActive: isSearching,
    });
    // Handle backspace when query is empty (cancels search)
    // This is a conditional behavior that doesn't fit the keybinding model
    // well (backspace only cancels when query is empty)
    const handleKeyDown = (e) => {
        if (!isSearching)
            return;
        if (e.key === 'backspace' && historyQuery === '') {
            e.preventDefault();
            handleCancel();
        }
    };
    // Backward-compat bridge: PromptInput doesn't yet wire handleKeyDown to
    // <Box onKeyDown>. Subscribe via useInput and adapt InputEvent →
    // KeyboardEvent until the consumer is migrated (separate PR).
    // TODO(onKeyDown-migration): remove once PromptInput passes handleKeyDown.
    (0, ink_js_1.useInput)((_input, _key, event) => {
        handleKeyDown(new keyboard_event_js_1.KeyboardEvent(event.keypress));
    }, { isActive: isSearching });
    // Keep a ref to searchHistory to avoid it being a dependency of useEffect
    const searchHistoryRef = (0, react_1.useRef)(searchHistory);
    searchHistoryRef.current = searchHistory;
    // Reset history search when query changes
    (0, react_1.useEffect)(() => {
        searchAbortController.current?.abort();
        const controller = new AbortController();
        searchAbortController.current = controller;
        void searchHistoryRef.current(false, controller.signal);
        return () => {
            controller.abort();
        };
    }, [historyQuery]);
    return {
        historyQuery,
        setHistoryQuery,
        historyMatch,
        historyFailedMatch,
        handleKeyDown,
    };
}
