"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useMainLoopModel = useMainLoopModel;
const react_1 = require("react");
const growthbook_js_1 = require("../services/analytics/growthbook.js");
const AppState_js_1 = require("../state/AppState.js");
const model_js_1 = require("../utils/model/model.js");
// The value of the selector is a full model name that can be used directly in
// API calls. Use this over getMainLoopModel() when the component needs to
// update upon a model config change.
function useMainLoopModel() {
    const mainLoopModel = (0, AppState_js_1.useAppState)(s => s.mainLoopModel);
    const mainLoopModelForSession = (0, AppState_js_1.useAppState)(s => s.mainLoopModelForSession);
    // parseUserSpecifiedModel reads tengu_ant_model_override via
    // _CACHED_MAY_BE_STALE (in resolveAntModel). Until GB init completes,
    // that's the stale disk cache; after, it's the in-memory remoteEval map.
    // AppState doesn't change when GB init finishes, so we subscribe to the
    // refresh signal and force a re-render to re-resolve with fresh values.
    // Without this, the alias resolution is frozen until something else
    // happens to re-render the component — the API would sample one model
    // while /model (which also re-resolves) displays another.
    const [, forceRerender] = (0, react_1.useReducer)(x => x + 1, 0);
    (0, react_1.useEffect)(() => (0, growthbook_js_1.onGrowthBookRefresh)(forceRerender), []);
    const model = (0, model_js_1.parseUserSpecifiedModel)(mainLoopModelForSession ??
        mainLoopModel ??
        (0, model_js_1.getDefaultMainLoopModelSetting)());
    return model;
}
