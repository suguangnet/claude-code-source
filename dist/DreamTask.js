"use strict";
// Background task entry for auto-dream (memory consolidation subagent).
// Makes the otherwise-invisible forked agent visible in the footer pill and
// Shift+Down dialog. The dream agent itself is unchanged — this is pure UI
// surfacing via the existing task registry.
Object.defineProperty(exports, "__esModule", { value: true });
exports.DreamTask = void 0;
exports.isDreamTask = isDreamTask;
exports.registerDreamTask = registerDreamTask;
exports.addDreamTurn = addDreamTurn;
exports.completeDreamTask = completeDreamTask;
exports.failDreamTask = failDreamTask;
const consolidationLock_js_1 = require("../../services/autoDream/consolidationLock.js");
const Task_js_1 = require("../../Task.js");
const framework_js_1 = require("../../utils/task/framework.js");
// Keep only the N most recent turns for live display.
const MAX_TURNS = 30;
function isDreamTask(task) {
    return (typeof task === 'object' &&
        task !== null &&
        'type' in task &&
        task.type === 'dream');
}
function registerDreamTask(setAppState, opts) {
    const id = (0, Task_js_1.generateTaskId)('dream');
    const task = {
        ...(0, Task_js_1.createTaskStateBase)(id, 'dream', 'dreaming'),
        type: 'dream',
        status: 'running',
        phase: 'starting',
        sessionsReviewing: opts.sessionsReviewing,
        filesTouched: [],
        turns: [],
        abortController: opts.abortController,
        priorMtime: opts.priorMtime,
    };
    (0, framework_js_1.registerTask)(task, setAppState);
    return id;
}
function addDreamTurn(taskId, turn, touchedPaths, setAppState) {
    (0, framework_js_1.updateTaskState)(taskId, setAppState, task => {
        const seen = new Set(task.filesTouched);
        const newTouched = touchedPaths.filter(p => !seen.has(p) && seen.add(p));
        // Skip the update entirely if the turn is empty AND nothing new was
        // touched. Avoids re-rendering on pure no-ops.
        if (turn.text === '' &&
            turn.toolUseCount === 0 &&
            newTouched.length === 0) {
            return task;
        }
        return {
            ...task,
            phase: newTouched.length > 0 ? 'updating' : task.phase,
            filesTouched: newTouched.length > 0
                ? [...task.filesTouched, ...newTouched]
                : task.filesTouched,
            turns: task.turns.slice(-(MAX_TURNS - 1)).concat(turn),
        };
    });
}
function completeDreamTask(taskId, setAppState) {
    // notified: true immediately — dream has no model-facing notification path
    // (it's UI-only), and eviction requires terminal + notified. The inline
    // appendSystemMessage completion note IS the user surface.
    (0, framework_js_1.updateTaskState)(taskId, setAppState, task => ({
        ...task,
        status: 'completed',
        endTime: Date.now(),
        notified: true,
        abortController: undefined,
    }));
}
function failDreamTask(taskId, setAppState) {
    (0, framework_js_1.updateTaskState)(taskId, setAppState, task => ({
        ...task,
        status: 'failed',
        endTime: Date.now(),
        notified: true,
        abortController: undefined,
    }));
}
exports.DreamTask = {
    name: 'DreamTask',
    type: 'dream',
    async kill(taskId, setAppState) {
        let priorMtime;
        (0, framework_js_1.updateTaskState)(taskId, setAppState, task => {
            if (task.status !== 'running')
                return task;
            task.abortController?.abort();
            priorMtime = task.priorMtime;
            return {
                ...task,
                status: 'killed',
                endTime: Date.now(),
                notified: true,
                abortController: undefined,
            };
        });
        // Rewind the lock mtime so the next session can retry. Same path as the
        // fork-failure catch in autoDream.ts. If updateTaskState was a no-op
        // (already terminal), priorMtime stays undefined and we skip.
        if (priorMtime !== undefined) {
            await (0, consolidationLock_js_1.rollbackConsolidationLock)(priorMtime);
        }
    },
};
