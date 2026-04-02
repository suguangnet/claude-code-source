"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useClipboardImageHint = useClipboardImageHint;
const react_1 = require("react");
const notifications_js_1 = require("../context/notifications.js");
const shortcutFormat_js_1 = require("../keybindings/shortcutFormat.js");
const imagePaste_js_1 = require("../utils/imagePaste.js");
const NOTIFICATION_KEY = 'clipboard-image-hint';
// Small debounce to batch rapid focus changes
const FOCUS_CHECK_DEBOUNCE_MS = 1000;
// Don't show the hint more than once per this interval
const HINT_COOLDOWN_MS = 30000;
/**
 * Hook that shows a notification when the terminal regains focus
 * and the clipboard contains an image.
 *
 * @param isFocused - Whether the terminal is currently focused
 * @param enabled - Whether image paste is enabled (onImagePaste is defined)
 */
function useClipboardImageHint(isFocused, enabled) {
    const { addNotification } = (0, notifications_js_1.useNotifications)();
    const lastFocusedRef = (0, react_1.useRef)(isFocused);
    const lastHintTimeRef = (0, react_1.useRef)(0);
    const checkTimeoutRef = (0, react_1.useRef)(null);
    (0, react_1.useEffect)(() => {
        // Only trigger on focus regain (was unfocused, now focused)
        const wasFocused = lastFocusedRef.current;
        lastFocusedRef.current = isFocused;
        if (!enabled || !isFocused || wasFocused) {
            return;
        }
        // Clear any pending check
        if (checkTimeoutRef.current) {
            clearTimeout(checkTimeoutRef.current);
        }
        // Small debounce to batch rapid focus changes
        checkTimeoutRef.current = setTimeout(async (checkTimeoutRef, lastHintTimeRef, addNotification) => {
            checkTimeoutRef.current = null;
            // Check cooldown to avoid spamming the user
            const now = Date.now();
            if (now - lastHintTimeRef.current < HINT_COOLDOWN_MS) {
                return;
            }
            // Check if clipboard has an image (async osascript call)
            if (await (0, imagePaste_js_1.hasImageInClipboard)()) {
                lastHintTimeRef.current = now;
                addNotification({
                    key: NOTIFICATION_KEY,
                    text: `Image in clipboard · ${(0, shortcutFormat_js_1.getShortcutDisplay)('chat:imagePaste', 'Chat', 'ctrl+v')} to paste`,
                    priority: 'immediate',
                    timeoutMs: 8000,
                });
            }
        }, FOCUS_CHECK_DEBOUNCE_MS, checkTimeoutRef, lastHintTimeRef, addNotification);
        return () => {
            if (checkTimeoutRef.current) {
                clearTimeout(checkTimeoutRef.current);
                checkTimeoutRef.current = null;
            }
        };
    }, [isFocused, enabled, addNotification]);
}
