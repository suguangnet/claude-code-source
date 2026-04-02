"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logUnaryEvent = logUnaryEvent;
const index_js_1 = require("src/services/analytics/index.js");
async function logUnaryEvent(event) {
    (0, index_js_1.logEvent)('tengu_unary_event', {
        event: event.event,
        completion_type: event.completion_type,
        language_name: (await event.metadata
            .language_name),
        message_id: event.metadata
            .message_id,
        platform: event.metadata
            .platform,
        ...(event.metadata.hasFeedback !== undefined && {
            hasFeedback: event.metadata.hasFeedback,
        }),
    });
}
