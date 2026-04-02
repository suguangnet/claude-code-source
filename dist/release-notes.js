"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.call = call;
const releaseNotes_js_1 = require("../../utils/releaseNotes.js");
function formatReleaseNotes(notes) {
    return notes
        .map(([version, notes]) => {
        const header = `Version ${version}:`;
        const bulletPoints = notes.map(note => `· ${note}`).join('\n');
        return `${header}\n${bulletPoints}`;
    })
        .join('\n\n');
}
async function call() {
    // Try to fetch the latest changelog with a 500ms timeout
    let freshNotes = [];
    try {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(rej => rej(new Error('Timeout')), 500, reject);
        });
        await Promise.race([(0, releaseNotes_js_1.fetchAndStoreChangelog)(), timeoutPromise]);
        freshNotes = (0, releaseNotes_js_1.getAllReleaseNotes)(await (0, releaseNotes_js_1.getStoredChangelog)());
    }
    catch {
        // Either fetch failed or timed out - just use cached notes
    }
    // If we have fresh notes from the quick fetch, use those
    if (freshNotes.length > 0) {
        return { type: 'text', value: formatReleaseNotes(freshNotes) };
    }
    // Otherwise check cached notes
    const cachedNotes = (0, releaseNotes_js_1.getAllReleaseNotes)(await (0, releaseNotes_js_1.getStoredChangelog)());
    if (cachedNotes.length > 0) {
        return { type: 'text', value: formatReleaseNotes(cachedNotes) };
    }
    // Nothing available, show link
    return {
        type: 'text',
        value: `See the full changelog at: ${releaseNotes_js_1.CHANGELOG_URL}`,
    };
}
