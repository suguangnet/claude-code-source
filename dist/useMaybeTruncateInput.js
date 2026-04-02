"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useMaybeTruncateInput = useMaybeTruncateInput;
const react_1 = require("react");
const inputPaste_js_1 = require("./inputPaste.js");
function useMaybeTruncateInput({ input, pastedContents, onInputChange, setCursorOffset, setPastedContents, }) {
    // Track if we've initialized this specific input value
    const [hasAppliedTruncationToInput, setHasAppliedTruncationToInput] = (0, react_1.useState)(false);
    // Process input for truncation and pasted images from MessageSelector.
    (0, react_1.useEffect)(() => {
        if (hasAppliedTruncationToInput) {
            return;
        }
        if (input.length <= 10000) {
            return;
        }
        const { newInput, newPastedContents } = (0, inputPaste_js_1.maybeTruncateInput)(input, pastedContents);
        onInputChange(newInput);
        setCursorOffset(newInput.length);
        setPastedContents(newPastedContents);
        setHasAppliedTruncationToInput(true);
    }, [
        input,
        hasAppliedTruncationToInput,
        pastedContents,
        onInputChange,
        setPastedContents,
        setCursorOffset,
    ]);
    // Reset hasInitializedInput when input is cleared (e.g., after submission)
    (0, react_1.useEffect)(() => {
        if (input === '') {
            setHasAppliedTruncationToInput(false);
        }
    }, [input]);
}
