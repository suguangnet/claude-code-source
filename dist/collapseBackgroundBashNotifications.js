"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collapseBackgroundBashNotifications = collapseBackgroundBashNotifications;
const xml_js_1 = require("../constants/xml.js");
const LocalShellTask_js_1 = require("../tasks/LocalShellTask/LocalShellTask.js");
const fullscreen_js_1 = require("./fullscreen.js");
const messages_js_1 = require("./messages.js");
function isCompletedBackgroundBash(msg) {
    if (msg.type !== 'user')
        return false;
    const content = msg.message.content[0];
    if (content?.type !== 'text')
        return false;
    if (!content.text.includes(`<${xml_js_1.TASK_NOTIFICATION_TAG}`))
        return false;
    // Only collapse successful completions — failed/killed stay visible individually.
    if ((0, messages_js_1.extractTag)(content.text, xml_js_1.STATUS_TAG) !== 'completed')
        return false;
    // The prefix constant distinguishes bash-kind LocalShellTask completions from
    // agent/workflow/monitor notifications. Monitor-kind completions have their
    // own summary wording and deliberately don't collapse here.
    return ((0, messages_js_1.extractTag)(content.text, xml_js_1.SUMMARY_TAG)?.startsWith(LocalShellTask_js_1.BACKGROUND_BASH_SUMMARY_PREFIX) ?? false);
}
/**
 * Collapses consecutive completed-background-bash task-notifications into a
 * single synthetic "N background commands completed" notification. Failed/killed
 * tasks and agent/workflow notifications are left alone. Monitor stream
 * events (enqueueStreamEvent) have no <status> tag and never match.
 *
 * Pass-through in verbose mode so ctrl+O shows each completion.
 */
function collapseBackgroundBashNotifications(messages, verbose) {
    if (!(0, fullscreen_js_1.isFullscreenEnvEnabled)())
        return messages;
    if (verbose)
        return messages;
    const result = [];
    let i = 0;
    while (i < messages.length) {
        const msg = messages[i];
        if (isCompletedBackgroundBash(msg)) {
            let count = 0;
            while (i < messages.length && isCompletedBackgroundBash(messages[i])) {
                count++;
                i++;
            }
            if (count === 1) {
                result.push(msg);
            }
            else {
                // Synthesize a task-notification that UserAgentNotificationMessage
                // already knows how to render — no new renderer needed.
                result.push({
                    ...msg,
                    message: {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: `<${xml_js_1.TASK_NOTIFICATION_TAG}><${xml_js_1.STATUS_TAG}>completed</${xml_js_1.STATUS_TAG}><${xml_js_1.SUMMARY_TAG}>${count} background commands completed</${xml_js_1.SUMMARY_TAG}></${xml_js_1.TASK_NOTIFICATION_TAG}>`,
                            },
                        ],
                    },
                });
            }
        }
        else {
            result.push(msg);
            i++;
        }
    }
    return result;
}
