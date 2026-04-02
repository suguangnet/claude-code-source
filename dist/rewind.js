"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.call = call;
async function call(_args, context) {
    if (context.openMessageSelector) {
        context.openMessageSelector();
    }
    // Return a skip message to not append any messages.
    return { type: 'skip' };
}
