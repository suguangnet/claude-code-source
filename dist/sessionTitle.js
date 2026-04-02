"use strict";
/**
 * Session title generation via Haiku.
 *
 * Standalone module with minimal dependencies so it can be imported from
 * print.ts (SDK control request handler) without pulling in the React/chalk/
 * git dependency chain that teleport.tsx carries.
 *
 * This is the single source of truth for AI-generated session titles across
 * all surfaces. Previously there were separate Haiku title generators:
 * - teleport.tsx generateTitleAndBranch (6-word title + branch for CCR)
 * - rename/generateSessionName.ts (kebab-case name for /rename)
 * Each remains for backwards compat; new callers should use this module.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractConversationText = extractConversationText;
exports.generateSessionTitle = generateSessionTitle;
const v4_1 = require("zod/v4");
const state_js_1 = require("../bootstrap/state.js");
const index_js_1 = require("../services/analytics/index.js");
const claude_js_1 = require("../services/api/claude.js");
const debug_js_1 = require("./debug.js");
const json_js_1 = require("./json.js");
const lazySchema_js_1 = require("./lazySchema.js");
const messages_js_1 = require("./messages.js");
const systemPromptType_js_1 = require("./systemPromptType.js");
const MAX_CONVERSATION_TEXT = 1000;
/**
 * Flatten a message array into a single text string for Haiku title input.
 * Skips meta/non-human messages. Tail-slices to the last 1000 chars so
 * recent context wins when the conversation is long.
 */
function extractConversationText(messages) {
    const parts = [];
    for (const msg of messages) {
        if (msg.type !== 'user' && msg.type !== 'assistant')
            continue;
        if ('isMeta' in msg && msg.isMeta)
            continue;
        if ('origin' in msg && msg.origin && msg.origin.kind !== 'human')
            continue;
        const content = msg.message.content;
        if (typeof content === 'string') {
            parts.push(content);
        }
        else if (Array.isArray(content)) {
            for (const block of content) {
                if ('type' in block && block.type === 'text' && 'text' in block) {
                    parts.push(block.text);
                }
            }
        }
    }
    const text = parts.join('\n');
    return text.length > MAX_CONVERSATION_TEXT
        ? text.slice(-MAX_CONVERSATION_TEXT)
        : text;
}
const SESSION_TITLE_PROMPT = `Generate a concise, sentence-case title (3-7 words) that captures the main topic or goal of this coding session. The title should be clear enough that the user recognizes the session in a list. Use sentence case: capitalize only the first word and proper nouns.

Return JSON with a single "title" field.

Good examples:
{"title": "Fix login button on mobile"}
{"title": "Add OAuth authentication"}
{"title": "Debug failing CI tests"}
{"title": "Refactor API client error handling"}

Bad (too vague): {"title": "Code changes"}
Bad (too long): {"title": "Investigate and fix the issue where the login button does not respond on mobile devices"}
Bad (wrong case): {"title": "Fix Login Button On Mobile"}`;
const titleSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({ title: v4_1.z.string() }));
/**
 * Generate a sentence-case session title from a description or first message.
 * Returns null on error or if Haiku returns an unparseable response.
 *
 * @param description - The user's first message or a description of the session
 * @param signal - Abort signal for cancellation
 */
async function generateSessionTitle(description, signal) {
    const trimmed = description.trim();
    if (!trimmed)
        return null;
    try {
        const result = await (0, claude_js_1.queryHaiku)({
            systemPrompt: (0, systemPromptType_js_1.asSystemPrompt)([SESSION_TITLE_PROMPT]),
            userPrompt: trimmed,
            outputFormat: {
                type: 'json_schema',
                schema: {
                    type: 'object',
                    properties: {
                        title: { type: 'string' },
                    },
                    required: ['title'],
                    additionalProperties: false,
                },
            },
            signal,
            options: {
                querySource: 'generate_session_title',
                agents: [],
                // Reflect the actual session mode — this module is called from
                // both the SDK print path (non-interactive) and the CCR remote
                // session path via useRemoteSession (interactive).
                isNonInteractiveSession: (0, state_js_1.getIsNonInteractiveSession)(),
                hasAppendSystemPrompt: false,
                mcpTools: [],
            },
        });
        const text = (0, messages_js_1.extractTextContent)(result.message.content);
        const parsed = titleSchema().safeParse((0, json_js_1.safeParseJSON)(text));
        const title = parsed.success ? parsed.data.title.trim() || null : null;
        (0, index_js_1.logEvent)('tengu_session_title_generated', { success: title !== null });
        return title;
    }
    catch (error) {
        (0, debug_js_1.logForDebugging)(`generateSessionTitle failed: ${error}`, {
            level: 'error',
        });
        (0, index_js_1.logEvent)('tengu_session_title_generated', { success: false });
        return null;
    }
}
