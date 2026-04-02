"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.call = void 0;
const conversation_js_1 = require("./conversation.js");
const call = async (_, context) => {
    await (0, conversation_js_1.clearConversation)(context);
    return { type: 'text', value: '' };
};
exports.call = call;
