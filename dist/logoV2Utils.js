"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLayoutMode = getLayoutMode;
exports.calculateLayoutDimensions = calculateLayoutDimensions;
exports.calculateOptimalLeftWidth = calculateOptimalLeftWidth;
exports.formatWelcomeMessage = formatWelcomeMessage;
exports.truncatePath = truncatePath;
exports.getRecentActivity = getRecentActivity;
exports.getRecentActivitySync = getRecentActivitySync;
exports.formatReleaseNoteForDisplay = formatReleaseNoteForDisplay;
exports.getLogoDisplayData = getLogoDisplayData;
exports.formatModelAndBilling = formatModelAndBilling;
exports.getRecentReleaseNotesSync = getRecentReleaseNotesSync;
const state_js_1 = require("../bootstrap/state.js");
const stringWidth_js_1 = require("../ink/stringWidth.js");
const auth_js_1 = require("./auth.js");
const cwd_js_1 = require("./cwd.js");
const file_js_1 = require("./file.js");
const format_js_1 = require("./format.js");
const releaseNotes_js_1 = require("./releaseNotes.js");
const semver_js_1 = require("./semver.js");
const sessionStorage_js_1 = require("./sessionStorage.js");
const settings_js_1 = require("./settings/settings.js");
// Layout constants
const MAX_LEFT_WIDTH = 50;
const MAX_USERNAME_LENGTH = 20;
const BORDER_PADDING = 4;
const DIVIDER_WIDTH = 1;
const CONTENT_PADDING = 2;
/**
 * Determines the layout mode based on terminal width
 */
function getLayoutMode(columns) {
    if (columns >= 70)
        return 'horizontal';
    return 'compact';
}
/**
 * Calculates layout dimensions for the LogoV2 component
 */
function calculateLayoutDimensions(columns, layoutMode, optimalLeftWidth) {
    if (layoutMode === 'horizontal') {
        const leftWidth = optimalLeftWidth;
        const usedSpace = BORDER_PADDING + CONTENT_PADDING + DIVIDER_WIDTH + leftWidth;
        const availableForRight = columns - usedSpace;
        let rightWidth = Math.max(30, availableForRight);
        const totalWidth = Math.min(leftWidth + rightWidth + DIVIDER_WIDTH + CONTENT_PADDING, columns - BORDER_PADDING);
        // Recalculate right width if we had to cap the total
        if (totalWidth < leftWidth + rightWidth + DIVIDER_WIDTH + CONTENT_PADDING) {
            rightWidth = totalWidth - leftWidth - DIVIDER_WIDTH - CONTENT_PADDING;
        }
        return { leftWidth, rightWidth, totalWidth };
    }
    // Vertical mode
    const totalWidth = Math.min(columns - BORDER_PADDING, MAX_LEFT_WIDTH + 20);
    return {
        leftWidth: totalWidth,
        rightWidth: totalWidth,
        totalWidth,
    };
}
/**
 * Calculates optimal left panel width based on content
 */
function calculateOptimalLeftWidth(welcomeMessage, truncatedCwd, modelLine) {
    const contentWidth = Math.max((0, stringWidth_js_1.stringWidth)(welcomeMessage), (0, stringWidth_js_1.stringWidth)(truncatedCwd), (0, stringWidth_js_1.stringWidth)(modelLine), 20);
    return Math.min(contentWidth + 4, MAX_LEFT_WIDTH); // +4 for padding
}
/**
 * Formats the welcome message based on username
 */
function formatWelcomeMessage(username) {
    if (!username || username.length > MAX_USERNAME_LENGTH) {
        return 'Welcome back!';
    }
    return `Welcome back ${username}!`;
}
/**
 * Truncates a path in the middle if it's too long.
 * Width-aware: uses stringWidth() for correct CJK/emoji measurement.
 */
function truncatePath(path, maxLength) {
    if ((0, stringWidth_js_1.stringWidth)(path) <= maxLength)
        return path;
    const separator = '/';
    const ellipsis = '…';
    const ellipsisWidth = 1; // '…' is always 1 column
    const separatorWidth = 1;
    const parts = path.split(separator);
    const first = parts[0] || '';
    const last = parts[parts.length - 1] || '';
    const firstWidth = (0, stringWidth_js_1.stringWidth)(first);
    const lastWidth = (0, stringWidth_js_1.stringWidth)(last);
    // Only one part, so show as much of it as we can
    if (parts.length === 1) {
        return (0, format_js_1.truncateToWidth)(path, maxLength);
    }
    // We don't have enough space to show the last part, so truncate it
    // But since firstPart is empty (unix) we don't want the extra ellipsis
    if (first === '' && ellipsisWidth + separatorWidth + lastWidth >= maxLength) {
        return `${separator}${(0, format_js_1.truncateToWidth)(last, Math.max(1, maxLength - separatorWidth))}`;
    }
    // We have a first part so let's show the ellipsis and truncate last part
    if (first !== '' &&
        ellipsisWidth * 2 + separatorWidth + lastWidth >= maxLength) {
        return `${ellipsis}${separator}${(0, format_js_1.truncateToWidth)(last, Math.max(1, maxLength - ellipsisWidth - separatorWidth))}`;
    }
    // Truncate first and leave last
    if (parts.length === 2) {
        const availableForFirst = maxLength - ellipsisWidth - separatorWidth - lastWidth;
        return `${(0, format_js_1.truncateToWidthNoEllipsis)(first, availableForFirst)}${ellipsis}${separator}${last}`;
    }
    // Now we start removing middle parts
    let available = maxLength - firstWidth - lastWidth - ellipsisWidth - 2 * separatorWidth;
    // Just the first and last are too long, so truncate first
    if (available <= 0) {
        const availableForFirst = Math.max(0, maxLength - lastWidth - ellipsisWidth - 2 * separatorWidth);
        const truncatedFirst = (0, format_js_1.truncateToWidthNoEllipsis)(first, availableForFirst);
        return `${truncatedFirst}${separator}${ellipsis}${separator}${last}`;
    }
    // Try to keep as many middle parts as possible
    const middleParts = [];
    for (let i = parts.length - 2; i > 0; i--) {
        const part = parts[i];
        if (part && (0, stringWidth_js_1.stringWidth)(part) + separatorWidth <= available) {
            middleParts.unshift(part);
            available -= (0, stringWidth_js_1.stringWidth)(part) + separatorWidth;
        }
        else {
            break;
        }
    }
    if (middleParts.length === 0) {
        return `${first}${separator}${ellipsis}${separator}${last}`;
    }
    return `${first}${separator}${ellipsis}${separator}${middleParts.join(separator)}${separator}${last}`;
}
// Simple cache for preloaded activity
let cachedActivity = [];
let cachePromise = null;
/**
 * Preloads recent conversations for display in Logo v2
 */
async function getRecentActivity() {
    // Return existing promise if already loading
    if (cachePromise) {
        return cachePromise;
    }
    const currentSessionId = (0, state_js_1.getSessionId)();
    cachePromise = (0, sessionStorage_js_1.loadMessageLogs)(10)
        .then(logs => {
        cachedActivity = logs
            .filter(log => {
            if (log.isSidechain)
                return false;
            if (log.sessionId === currentSessionId)
                return false;
            if (log.summary?.includes('I apologize'))
                return false;
            // Filter out sessions where both summary and firstPrompt are "No prompt" or missing
            const hasSummary = log.summary && log.summary !== 'No prompt';
            const hasFirstPrompt = log.firstPrompt && log.firstPrompt !== 'No prompt';
            return hasSummary || hasFirstPrompt;
        })
            .slice(0, 3);
        return cachedActivity;
    })
        .catch(() => {
        cachedActivity = [];
        return cachedActivity;
    });
    return cachePromise;
}
/**
 * Gets cached activity synchronously
 */
function getRecentActivitySync() {
    return cachedActivity;
}
/**
 * Formats release notes for display, with smart truncation
 */
function formatReleaseNoteForDisplay(note, maxWidth) {
    // Simply truncate at the max width, same as Recent Activity descriptions
    return (0, format_js_1.truncate)(note, maxWidth);
}
/**
 * Gets the common logo display data used by both LogoV2 and CondensedLogo
 */
function getLogoDisplayData() {
    const version = process.env.DEMO_VERSION ?? MACRO.VERSION;
    const serverUrl = (0, state_js_1.getDirectConnectServerUrl)();
    const displayPath = process.env.DEMO_VERSION
        ? '/code/claude'
        : (0, file_js_1.getDisplayPath)((0, cwd_js_1.getCwd)());
    const cwd = serverUrl
        ? `${displayPath} in ${serverUrl.replace(/^https?:\/\//, '')}`
        : displayPath;
    const billingType = (0, auth_js_1.isClaudeAISubscriber)()
        ? (0, auth_js_1.getSubscriptionName)()
        : 'API Usage Billing';
    const agentName = (0, settings_js_1.getInitialSettings)().agent;
    return {
        version,
        cwd,
        billingType,
        agentName,
    };
}
/**
 * Determines how to display model and billing information based on available width
 */
function formatModelAndBilling(modelName, billingType, availableWidth) {
    const separator = ' · ';
    const combinedWidth = (0, stringWidth_js_1.stringWidth)(modelName) + separator.length + (0, stringWidth_js_1.stringWidth)(billingType);
    const shouldSplit = combinedWidth > availableWidth;
    if (shouldSplit) {
        return {
            shouldSplit: true,
            truncatedModel: (0, format_js_1.truncate)(modelName, availableWidth),
            truncatedBilling: (0, format_js_1.truncate)(billingType, availableWidth),
        };
    }
    return {
        shouldSplit: false,
        truncatedModel: (0, format_js_1.truncate)(modelName, Math.max(availableWidth - (0, stringWidth_js_1.stringWidth)(billingType) - separator.length, 10)),
        truncatedBilling: billingType,
    };
}
/**
 * Gets recent release notes for Logo v2 display
 * For ants, uses commits bundled at build time
 * For external users, uses public changelog
 */
function getRecentReleaseNotesSync(maxItems) {
    // For ants, use bundled changelog
    if (process.env.USER_TYPE === 'ant') {
        const changelog = MACRO.VERSION_CHANGELOG;
        if (changelog) {
            const commits = changelog.trim().split('\n').filter(Boolean);
            return commits.slice(0, maxItems);
        }
        return [];
    }
    const changelog = (0, releaseNotes_js_1.getStoredChangelogFromMemory)();
    if (!changelog) {
        return [];
    }
    let parsed;
    try {
        parsed = (0, releaseNotes_js_1.parseChangelog)(changelog);
    }
    catch {
        return [];
    }
    // Get notes from recent versions
    const allNotes = [];
    const versions = Object.keys(parsed)
        .sort((a, b) => ((0, semver_js_1.gt)(a, b) ? -1 : 1))
        .slice(0, 3); // Look at top 3 recent versions
    for (const version of versions) {
        const notes = parsed[version];
        if (notes) {
            allNotes.push(...notes);
        }
    }
    // Return raw notes without filtering or premature truncation
    return allNotes.slice(0, maxItems);
}
