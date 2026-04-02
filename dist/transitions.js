"use strict";
/**
 * Vim State Transition Table
 *
 * This is the scannable source of truth for state transitions.
 * To understand what happens in any state, look up that state's transition function.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.transition = transition;
const motions_js_1 = require("./motions.js");
const operators_js_1 = require("./operators.js");
const types_js_1 = require("./types.js");
/**
 * Main transition function. Dispatches based on current state type.
 */
function transition(state, input, ctx) {
    switch (state.type) {
        case 'idle':
            return fromIdle(input, ctx);
        case 'count':
            return fromCount(state, input, ctx);
        case 'operator':
            return fromOperator(state, input, ctx);
        case 'operatorCount':
            return fromOperatorCount(state, input, ctx);
        case 'operatorFind':
            return fromOperatorFind(state, input, ctx);
        case 'operatorTextObj':
            return fromOperatorTextObj(state, input, ctx);
        case 'find':
            return fromFind(state, input, ctx);
        case 'g':
            return fromG(state, input, ctx);
        case 'operatorG':
            return fromOperatorG(state, input, ctx);
        case 'replace':
            return fromReplace(state, input, ctx);
        case 'indent':
            return fromIndent(state, input, ctx);
    }
}
// ============================================================================
// Shared Input Handling
// ============================================================================
/**
 * Handle input that's valid in both idle and count states.
 * Returns null if input is not recognized.
 */
function handleNormalInput(input, count, ctx) {
    if ((0, types_js_1.isOperatorKey)(input)) {
        return { next: { type: 'operator', op: types_js_1.OPERATORS[input], count } };
    }
    if (types_js_1.SIMPLE_MOTIONS.has(input)) {
        return {
            execute: () => {
                const target = (0, motions_js_1.resolveMotion)(input, ctx.cursor, count);
                ctx.setOffset(target.offset);
            },
        };
    }
    if (types_js_1.FIND_KEYS.has(input)) {
        return { next: { type: 'find', find: input, count } };
    }
    if (input === 'g')
        return { next: { type: 'g', count } };
    if (input === 'r')
        return { next: { type: 'replace', count } };
    if (input === '>' || input === '<') {
        return { next: { type: 'indent', dir: input, count } };
    }
    if (input === '~') {
        return { execute: () => (0, operators_js_1.executeToggleCase)(count, ctx) };
    }
    if (input === 'x') {
        return { execute: () => (0, operators_js_1.executeX)(count, ctx) };
    }
    if (input === 'J') {
        return { execute: () => (0, operators_js_1.executeJoin)(count, ctx) };
    }
    if (input === 'p' || input === 'P') {
        return { execute: () => (0, operators_js_1.executePaste)(input === 'p', count, ctx) };
    }
    if (input === 'D') {
        return { execute: () => (0, operators_js_1.executeOperatorMotion)('delete', '$', 1, ctx) };
    }
    if (input === 'C') {
        return { execute: () => (0, operators_js_1.executeOperatorMotion)('change', '$', 1, ctx) };
    }
    if (input === 'Y') {
        return { execute: () => (0, operators_js_1.executeLineOp)('yank', count, ctx) };
    }
    if (input === 'G') {
        return {
            execute: () => {
                // count=1 means no count given, go to last line
                // otherwise go to line N
                if (count === 1) {
                    ctx.setOffset(ctx.cursor.startOfLastLine().offset);
                }
                else {
                    ctx.setOffset(ctx.cursor.goToLine(count).offset);
                }
            },
        };
    }
    if (input === '.') {
        return { execute: () => ctx.onDotRepeat?.() };
    }
    if (input === ';' || input === ',') {
        return { execute: () => executeRepeatFind(input === ',', count, ctx) };
    }
    if (input === 'u') {
        return { execute: () => ctx.onUndo?.() };
    }
    if (input === 'i') {
        return { execute: () => ctx.enterInsert(ctx.cursor.offset) };
    }
    if (input === 'I') {
        return {
            execute: () => ctx.enterInsert(ctx.cursor.firstNonBlankInLogicalLine().offset),
        };
    }
    if (input === 'a') {
        return {
            execute: () => {
                const newOffset = ctx.cursor.isAtEnd()
                    ? ctx.cursor.offset
                    : ctx.cursor.right().offset;
                ctx.enterInsert(newOffset);
            },
        };
    }
    if (input === 'A') {
        return {
            execute: () => ctx.enterInsert(ctx.cursor.endOfLogicalLine().offset),
        };
    }
    if (input === 'o') {
        return { execute: () => (0, operators_js_1.executeOpenLine)('below', ctx) };
    }
    if (input === 'O') {
        return { execute: () => (0, operators_js_1.executeOpenLine)('above', ctx) };
    }
    return null;
}
/**
 * Handle operator input (motion, find, text object scope).
 * Returns null if input is not recognized.
 */
function handleOperatorInput(op, count, input, ctx) {
    if ((0, types_js_1.isTextObjScopeKey)(input)) {
        return {
            next: {
                type: 'operatorTextObj',
                op,
                count,
                scope: types_js_1.TEXT_OBJ_SCOPES[input],
            },
        };
    }
    if (types_js_1.FIND_KEYS.has(input)) {
        return {
            next: { type: 'operatorFind', op, count, find: input },
        };
    }
    if (types_js_1.SIMPLE_MOTIONS.has(input)) {
        return { execute: () => (0, operators_js_1.executeOperatorMotion)(op, input, count, ctx) };
    }
    if (input === 'G') {
        return { execute: () => (0, operators_js_1.executeOperatorG)(op, count, ctx) };
    }
    if (input === 'g') {
        return { next: { type: 'operatorG', op, count } };
    }
    return null;
}
// ============================================================================
// Transition Functions - One per state type
// ============================================================================
function fromIdle(input, ctx) {
    // 0 is line-start motion, not a count prefix
    if (/[1-9]/.test(input)) {
        return { next: { type: 'count', digits: input } };
    }
    if (input === '0') {
        return {
            execute: () => ctx.setOffset(ctx.cursor.startOfLogicalLine().offset),
        };
    }
    const result = handleNormalInput(input, 1, ctx);
    if (result)
        return result;
    return {};
}
function fromCount(state, input, ctx) {
    if (/[0-9]/.test(input)) {
        const newDigits = state.digits + input;
        const count = Math.min(parseInt(newDigits, 10), types_js_1.MAX_VIM_COUNT);
        return { next: { type: 'count', digits: String(count) } };
    }
    const count = parseInt(state.digits, 10);
    const result = handleNormalInput(input, count, ctx);
    if (result)
        return result;
    return { next: { type: 'idle' } };
}
function fromOperator(state, input, ctx) {
    // dd, cc, yy = line operation
    if (input === state.op[0]) {
        return { execute: () => (0, operators_js_1.executeLineOp)(state.op, state.count, ctx) };
    }
    if (/[0-9]/.test(input)) {
        return {
            next: {
                type: 'operatorCount',
                op: state.op,
                count: state.count,
                digits: input,
            },
        };
    }
    const result = handleOperatorInput(state.op, state.count, input, ctx);
    if (result)
        return result;
    return { next: { type: 'idle' } };
}
function fromOperatorCount(state, input, ctx) {
    if (/[0-9]/.test(input)) {
        const newDigits = state.digits + input;
        const parsedDigits = Math.min(parseInt(newDigits, 10), types_js_1.MAX_VIM_COUNT);
        return { next: { ...state, digits: String(parsedDigits) } };
    }
    const motionCount = parseInt(state.digits, 10);
    const effectiveCount = state.count * motionCount;
    const result = handleOperatorInput(state.op, effectiveCount, input, ctx);
    if (result)
        return result;
    return { next: { type: 'idle' } };
}
function fromOperatorFind(state, input, ctx) {
    return {
        execute: () => (0, operators_js_1.executeOperatorFind)(state.op, state.find, input, state.count, ctx),
    };
}
function fromOperatorTextObj(state, input, ctx) {
    if (types_js_1.TEXT_OBJ_TYPES.has(input)) {
        return {
            execute: () => (0, operators_js_1.executeOperatorTextObj)(state.op, state.scope, input, state.count, ctx),
        };
    }
    return { next: { type: 'idle' } };
}
function fromFind(state, input, ctx) {
    return {
        execute: () => {
            const result = ctx.cursor.findCharacter(input, state.find, state.count);
            if (result !== null) {
                ctx.setOffset(result);
                ctx.setLastFind(state.find, input);
            }
        },
    };
}
function fromG(state, input, ctx) {
    if (input === 'j' || input === 'k') {
        return {
            execute: () => {
                const target = (0, motions_js_1.resolveMotion)(`g${input}`, ctx.cursor, state.count);
                ctx.setOffset(target.offset);
            },
        };
    }
    if (input === 'g') {
        // If count provided (e.g., 5gg), go to that line. Otherwise go to first line.
        if (state.count > 1) {
            return {
                execute: () => {
                    const lines = ctx.text.split('\n');
                    const targetLine = Math.min(state.count - 1, lines.length - 1);
                    let offset = 0;
                    for (let i = 0; i < targetLine; i++) {
                        offset += (lines[i]?.length ?? 0) + 1; // +1 for newline
                    }
                    ctx.setOffset(offset);
                },
            };
        }
        return {
            execute: () => ctx.setOffset(ctx.cursor.startOfFirstLine().offset),
        };
    }
    return { next: { type: 'idle' } };
}
function fromOperatorG(state, input, ctx) {
    if (input === 'j' || input === 'k') {
        return {
            execute: () => (0, operators_js_1.executeOperatorMotion)(state.op, `g${input}`, state.count, ctx),
        };
    }
    if (input === 'g') {
        return { execute: () => (0, operators_js_1.executeOperatorGg)(state.op, state.count, ctx) };
    }
    // Any other input cancels the operator
    return { next: { type: 'idle' } };
}
function fromReplace(state, input, ctx) {
    // Backspace/Delete arrive as empty input in literal-char states. In vim,
    // r<BS> cancels the replace; without this guard, executeReplace("") would
    // delete the character under the cursor instead.
    if (input === '')
        return { next: { type: 'idle' } };
    return { execute: () => (0, operators_js_1.executeReplace)(input, state.count, ctx) };
}
function fromIndent(state, input, ctx) {
    if (input === state.dir) {
        return { execute: () => (0, operators_js_1.executeIndent)(state.dir, state.count, ctx) };
    }
    return { next: { type: 'idle' } };
}
// ============================================================================
// Helper functions for special commands
// ============================================================================
function executeRepeatFind(reverse, count, ctx) {
    const lastFind = ctx.getLastFind();
    if (!lastFind)
        return;
    // Determine the effective find type based on reverse
    let findType = lastFind.type;
    if (reverse) {
        // Flip the direction
        const flipMap = {
            f: 'F',
            F: 'f',
            t: 'T',
            T: 't',
        };
        findType = flipMap[findType];
    }
    const result = ctx.cursor.findCharacter(lastFind.char, findType, count);
    if (result !== null) {
        ctx.setOffset(result);
    }
}
