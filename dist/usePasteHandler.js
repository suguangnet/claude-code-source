"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePasteHandler = usePasteHandler;
const path_1 = require("path");
const react_1 = __importDefault(require("react"));
const log_js_1 = require("src/utils/log.js");
const usehooks_ts_1 = require("usehooks-ts");
const imagePaste_js_1 = require("../utils/imagePaste.js");
const platform_js_1 = require("../utils/platform.js");
const CLIPBOARD_CHECK_DEBOUNCE_MS = 50;
const PASTE_COMPLETION_TIMEOUT_MS = 100;
function usePasteHandler({ onPaste, onInput, onImagePaste, }) {
    const [pasteState, setPasteState] = react_1.default.useState({ chunks: [], timeoutId: null });
    const [isPasting, setIsPasting] = react_1.default.useState(false);
    const isMountedRef = react_1.default.useRef(true);
    // Mirrors pasteState.timeoutId but updated synchronously. When paste + a
    // keystroke arrive in the same stdin chunk, both wrappedOnInput calls run
    // in the same discreteUpdates batch before React commits — the second call
    // reads stale pasteState.timeoutId (null) and takes the onInput path. If
    // that key is Enter, it submits the old input and the paste is lost.
    const pastePendingRef = react_1.default.useRef(false);
    const isMacOS = react_1.default.useMemo(() => (0, platform_js_1.getPlatform)() === 'macos', []);
    react_1.default.useEffect(() => {
        return () => {
            isMountedRef.current = false;
        };
    }, []);
    const checkClipboardForImageImpl = react_1.default.useCallback(() => {
        if (!onImagePaste || !isMountedRef.current)
            return;
        void (0, imagePaste_js_1.getImageFromClipboard)()
            .then(imageData => {
            if (imageData && isMountedRef.current) {
                onImagePaste(imageData.base64, imageData.mediaType, undefined, // no filename for clipboard images
                imageData.dimensions);
            }
        })
            .catch(error => {
            if (isMountedRef.current) {
                (0, log_js_1.logError)(error);
            }
        })
            .finally(() => {
            if (isMountedRef.current) {
                setIsPasting(false);
            }
        });
    }, [onImagePaste]);
    const checkClipboardForImage = (0, usehooks_ts_1.useDebounceCallback)(checkClipboardForImageImpl, CLIPBOARD_CHECK_DEBOUNCE_MS);
    const resetPasteTimeout = react_1.default.useCallback((currentTimeoutId) => {
        if (currentTimeoutId) {
            clearTimeout(currentTimeoutId);
        }
        return setTimeout((setPasteState, onImagePaste, onPaste, setIsPasting, checkClipboardForImage, isMacOS, pastePendingRef) => {
            pastePendingRef.current = false;
            setPasteState(({ chunks }) => {
                // Join chunks and filter out orphaned focus sequences
                // These can appear when focus events split during paste
                const pastedText = chunks
                    .join('')
                    .replace(/\[I$/, '')
                    .replace(/\[O$/, '');
                // Check if the pasted text contains image file paths
                // When dragging multiple images, they may come as:
                // 1. Newline-separated paths (common in some terminals)
                // 2. Space-separated paths (common when dragging from Finder)
                // For space-separated paths, we split on spaces that precede absolute paths:
                // - Unix: space followed by `/` (e.g., `/Users/...`)
                // - Windows: space followed by drive letter and `:\` (e.g., `C:\Users\...`)
                // This works because spaces within paths are escaped (e.g., `file\ name.png`)
                const lines = pastedText
                    .split(/ (?=\/|[A-Za-z]:\\)/)
                    .flatMap(part => part.split('\n'))
                    .filter(line => line.trim());
                const imagePaths = lines.filter(line => (0, imagePaste_js_1.isImageFilePath)(line));
                if (onImagePaste && imagePaths.length > 0) {
                    const isTempScreenshot = /\/TemporaryItems\/.*screencaptureui.*\/Screenshot/i.test(pastedText);
                    // Process all image paths
                    void Promise.all(imagePaths.map(imagePath => (0, imagePaste_js_1.tryReadImageFromPath)(imagePath))).then(results => {
                        const validImages = results.filter((r) => r !== null);
                        if (validImages.length > 0) {
                            // Successfully read at least one image
                            for (const imageData of validImages) {
                                const filename = (0, path_1.basename)(imageData.path);
                                onImagePaste(imageData.base64, imageData.mediaType, filename, imageData.dimensions, imageData.path);
                            }
                            // If some paths weren't images, paste them as text
                            const nonImageLines = lines.filter(line => !(0, imagePaste_js_1.isImageFilePath)(line));
                            if (nonImageLines.length > 0 && onPaste) {
                                onPaste(nonImageLines.join('\n'));
                            }
                            setIsPasting(false);
                        }
                        else if (isTempScreenshot && isMacOS) {
                            // For temporary screenshot files that no longer exist, try clipboard
                            checkClipboardForImage();
                        }
                        else {
                            if (onPaste) {
                                onPaste(pastedText);
                            }
                            setIsPasting(false);
                        }
                    });
                    return { chunks: [], timeoutId: null };
                }
                // If paste is empty (common when trying to paste images with Cmd+V),
                // check if clipboard has an image (macOS only)
                if (isMacOS && onImagePaste && pastedText.length === 0) {
                    checkClipboardForImage();
                    return { chunks: [], timeoutId: null };
                }
                // Handle regular paste
                if (onPaste) {
                    onPaste(pastedText);
                }
                // Reset isPasting state after paste is complete
                setIsPasting(false);
                return { chunks: [], timeoutId: null };
            });
        }, PASTE_COMPLETION_TIMEOUT_MS, setPasteState, onImagePaste, onPaste, setIsPasting, checkClipboardForImage, isMacOS, pastePendingRef);
    }, [checkClipboardForImage, isMacOS, onImagePaste, onPaste]);
    // Paste detection is now done via the InputEvent's keypress.isPasted flag,
    // which is set by the keypress parser when it detects bracketed paste mode.
    // This avoids the race condition caused by having multiple listeners on stdin.
    // Previously, we had a stdin.on('data') listener here which competed with
    // the 'readable' listener in App.tsx, causing dropped characters.
    const wrappedOnInput = (input, key, event) => {
        // Detect paste from the parsed keypress event.
        // The keypress parser sets isPasted=true for content within bracketed paste.
        const isFromPaste = event.keypress.isPasted;
        // If this is pasted content, set isPasting state for UI feedback
        if (isFromPaste) {
            setIsPasting(true);
        }
        // Handle large pastes (>PASTE_THRESHOLD chars)
        // Usually we get one or two input characters at a time. If we
        // get more than the threshold, the user has probably pasted.
        // Unfortunately node batches long pastes, so it's possible
        // that we would see e.g. 1024 characters and then just a few
        // more in the next frame that belong with the original paste.
        // This batching number is not consistent.
        // Handle potential image filenames (even if they're shorter than paste threshold)
        // When dragging multiple images, they may come as newline-separated or
        // space-separated paths. Split on spaces preceding absolute paths:
        // - Unix: ` /` - Windows: ` C:\` etc.
        const hasImageFilePath = input
            .split(/ (?=\/|[A-Za-z]:\\)/)
            .flatMap(part => part.split('\n'))
            .some(line => (0, imagePaste_js_1.isImageFilePath)(line.trim()));
        // Handle empty paste (clipboard image on macOS)
        // When the user pastes an image with Cmd+V, the terminal sends an empty
        // bracketed paste sequence. The keypress parser emits this as isPasted=true
        // with empty input.
        if (isFromPaste && input.length === 0 && isMacOS && onImagePaste) {
            checkClipboardForImage();
            // Reset isPasting since there's no text content to process
            setIsPasting(false);
            return;
        }
        // Check if we should handle as paste (from bracketed paste, large input, or continuation)
        const shouldHandleAsPaste = onPaste &&
            (input.length > imagePaste_js_1.PASTE_THRESHOLD ||
                pastePendingRef.current ||
                hasImageFilePath ||
                isFromPaste);
        if (shouldHandleAsPaste) {
            pastePendingRef.current = true;
            setPasteState(({ chunks, timeoutId }) => {
                return {
                    chunks: [...chunks, input],
                    timeoutId: resetPasteTimeout(timeoutId),
                };
            });
            return;
        }
        onInput(input, key);
        if (input.length > 10) {
            // Ensure that setIsPasting is turned off on any other multicharacter
            // input, because the stdin buffer may chunk at arbitrary points and split
            // the closing escape sequence if the input length is too long for the
            // stdin buffer.
            setIsPasting(false);
        }
    };
    return {
        wrappedOnInput,
        pasteState,
        isPasting,
    };
}
