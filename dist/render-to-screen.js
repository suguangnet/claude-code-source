"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderToScreen = renderToScreen;
exports.scanPositions = scanPositions;
exports.applyPositionedHighlight = applyPositionedHighlight;
const noop_js_1 = __importDefault(require("lodash-es/noop.js"));
const constants_js_1 = require("react-reconciler/constants.js");
const debug_js_1 = require("../utils/debug.js");
const dom_js_1 = require("./dom.js");
const focus_js_1 = require("./focus.js");
const output_js_1 = __importDefault(require("./output.js"));
const reconciler_js_1 = __importDefault(require("./reconciler.js"));
const render_node_to_output_js_1 = __importStar(require("./render-node-to-output.js"));
const screen_js_1 = require("./screen.js");
// Shared across calls. Pools accumulate style/char interns — reusing them
// means later calls hit cache more. Root/container reuse saves the
// createContainer cost (~1ms). LegacyRoot: all work sync, no scheduling —
// ConcurrentRoot's scheduler backlog leaks across roots via flushSyncWork.
let root;
let container;
let stylePool;
let charPool;
let hyperlinkPool;
let output;
const timing = { reconcile: 0, yoga: 0, paint: 0, scan: 0, calls: 0 };
const LOG_EVERY = 20;
/** Render a React element (wrapped in all contexts the component needs —
 *  caller's job) to an isolated Screen buffer at the given width. Returns
 *  the Screen + natural height (from yoga). Used for search: render ONE
 *  message, scan its Screen for the query, get exact (row, col) positions.
 *
 *  ~1-3ms per call (yoga alloc + calculateLayout + paint). The
 *  flushSyncWork cross-root leak measured ~0.0003ms/call growth — fine
 *  for on-demand single-message rendering, pathological for render-all-
 *  8k-upfront. Cache per (msg, query, width) upstream.
 *
 *  Unmounts between calls. Root/container/pools persist for reuse. */
function renderToScreen(el, width) {
    if (!root) {
        root = (0, dom_js_1.createNode)('ink-root');
        root.focusManager = new focus_js_1.FocusManager(() => false);
        stylePool = new screen_js_1.StylePool();
        charPool = new screen_js_1.CharPool();
        hyperlinkPool = new screen_js_1.HyperlinkPool();
        // @ts-expect-error react-reconciler 0.33 takes 10 args; @types says 11
        container = reconciler_js_1.default.createContainer(root, constants_js_1.LegacyRoot, null, false, null, 'search-render', noop_js_1.default, noop_js_1.default, noop_js_1.default, noop_js_1.default);
    }
    const t0 = performance.now();
    // @ts-expect-error updateContainerSync exists but not in @types
    reconciler_js_1.default.updateContainerSync(el, container, null, noop_js_1.default);
    // @ts-expect-error flushSyncWork exists but not in @types
    reconciler_js_1.default.flushSyncWork();
    const t1 = performance.now();
    // Yoga layout. Root might not have a yogaNode if the tree is empty.
    root.yogaNode?.setWidth(width);
    root.yogaNode?.calculateLayout(width);
    const height = Math.ceil(root.yogaNode?.getComputedHeight() ?? 0);
    const t2 = performance.now();
    // Paint to a fresh Screen. Width = given, height = yoga's natural.
    // No alt-screen, no prevScreen (every call is fresh).
    const screen = (0, screen_js_1.createScreen)(width, Math.max(1, height), // avoid 0-height Screen (createScreen may choke)
    stylePool, charPool, hyperlinkPool);
    if (!output) {
        output = new output_js_1.default({ width, height, stylePool: stylePool, screen });
    }
    else {
        output.reset(width, height, screen);
    }
    (0, render_node_to_output_js_1.resetLayoutShifted)();
    (0, render_node_to_output_js_1.default)(root, output, { prevScreen: undefined });
    // renderNodeToOutput queues writes into Output; .get() flushes the
    // queue into the Screen's cell arrays. Without this the screen is
    // blank (constructor-zero).
    const rendered = output.get();
    const t3 = performance.now();
    // Unmount so next call gets a fresh tree. Leaves root/container/pools.
    // @ts-expect-error updateContainerSync exists but not in @types
    reconciler_js_1.default.updateContainerSync(null, container, null, noop_js_1.default);
    // @ts-expect-error flushSyncWork exists but not in @types
    reconciler_js_1.default.flushSyncWork();
    timing.reconcile += t1 - t0;
    timing.yoga += t2 - t1;
    timing.paint += t3 - t2;
    if (++timing.calls % LOG_EVERY === 0) {
        const total = timing.reconcile + timing.yoga + timing.paint + timing.scan;
        (0, debug_js_1.logForDebugging)(`renderToScreen: ${timing.calls} calls · ` +
            `reconcile=${timing.reconcile.toFixed(1)}ms yoga=${timing.yoga.toFixed(1)}ms ` +
            `paint=${timing.paint.toFixed(1)}ms scan=${timing.scan.toFixed(1)}ms · ` +
            `total=${total.toFixed(1)}ms · avg ${(total / timing.calls).toFixed(2)}ms/call`);
    }
    return { screen: rendered, height };
}
/** Scan a Screen buffer for all occurrences of query. Returns positions
 *  relative to the buffer (row 0 = buffer top). Same cell-skip logic as
 *  applySearchHighlight (SpacerTail/SpacerHead/noSelect) so positions
 *  match what the overlay highlight would find. Case-insensitive.
 *
 *  For the side-render use: this Screen is the FULL message (natural
 *  height, not viewport-clipped). Positions are stable — to highlight
 *  on the real screen, add the message's screen offset (lo). */
function scanPositions(screen, query) {
    const lq = query.toLowerCase();
    if (!lq)
        return [];
    const qlen = lq.length;
    const w = screen.width;
    const h = screen.height;
    const noSelect = screen.noSelect;
    const positions = [];
    const t0 = performance.now();
    for (let row = 0; row < h; row++) {
        const rowOff = row * w;
        // Same text-build as applySearchHighlight. Keep in sync — or extract
        // to a shared helper (TODO once both are stable). codeUnitToCell
        // maps indexOf positions (code units in the LOWERCASED text) to cell
        // indices in colOf — surrogate pairs (emoji) and multi-unit lowercase
        // (Turkish İ → i + U+0307) make text.length > colOf.length.
        let text = '';
        const colOf = [];
        const codeUnitToCell = [];
        for (let col = 0; col < w; col++) {
            const idx = rowOff + col;
            const cell = (0, screen_js_1.cellAtIndex)(screen, idx);
            if (cell.width === 2 /* CellWidth.SpacerTail */ ||
                cell.width === 3 /* CellWidth.SpacerHead */ ||
                noSelect[idx] === 1) {
                continue;
            }
            const lc = cell.char.toLowerCase();
            const cellIdx = colOf.length;
            for (let i = 0; i < lc.length; i++) {
                codeUnitToCell.push(cellIdx);
            }
            text += lc;
            colOf.push(col);
        }
        // Non-overlapping — same advance as applySearchHighlight.
        let pos = text.indexOf(lq);
        while (pos >= 0) {
            const startCi = codeUnitToCell[pos];
            const endCi = codeUnitToCell[pos + qlen - 1];
            const col = colOf[startCi];
            const endCol = colOf[endCi] + 1;
            positions.push({ row, col, len: endCol - col });
            pos = text.indexOf(lq, pos + qlen);
        }
    }
    timing.scan += performance.now() - t0;
    return positions;
}
/** Write CURRENT (yellow+bold+underline) at positions[currentIdx] +
 *  rowOffset. OTHER positions are NOT styled here — the scan-highlight
 *  (applySearchHighlight with null hint) does inverse for all visible
 *  matches, including these. Two-layer: scan = 'you could go here',
 *  position = 'you ARE here'. Writing inverse again here would be a
 *  no-op (withInverse idempotent) but wasted work.
 *
 *  Positions are message-relative (row 0 = message top). rowOffset =
 *  message's current screen-top (lo). Clips outside [0, height). */
function applyPositionedHighlight(screen, stylePool, positions, rowOffset, currentIdx) {
    if (currentIdx < 0 || currentIdx >= positions.length)
        return false;
    const p = positions[currentIdx];
    const row = p.row + rowOffset;
    if (row < 0 || row >= screen.height)
        return false;
    const transform = (id) => stylePool.withCurrentMatch(id);
    const rowOff = row * screen.width;
    for (let col = p.col; col < p.col + p.len; col++) {
        if (col < 0 || col >= screen.width)
            continue;
        const cell = (0, screen_js_1.cellAtIndex)(screen, rowOff + col);
        (0, screen_js_1.setCellStyleId)(screen, col, row, transform(cell.styleId));
    }
    return true;
}
