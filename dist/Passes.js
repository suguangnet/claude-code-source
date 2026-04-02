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
Object.defineProperty(exports, "__esModule", { value: true });
exports.call = call;
const React = __importStar(require("react"));
const Passes_js_1 = require("../../components/Passes/Passes.js");
const index_js_1 = require("../../services/analytics/index.js");
const referral_js_1 = require("../../services/api/referral.js");
const config_js_1 = require("../../utils/config.js");
async function call(onDone) {
    // Mark that user has visited /passes so we stop showing the upsell
    const config = (0, config_js_1.getGlobalConfig)();
    const isFirstVisit = !config.hasVisitedPasses;
    if (isFirstVisit) {
        const remaining = (0, referral_js_1.getCachedRemainingPasses)();
        (0, config_js_1.saveGlobalConfig)(current => ({
            ...current,
            hasVisitedPasses: true,
            passesLastSeenRemaining: remaining ?? current.passesLastSeenRemaining
        }));
    }
    (0, index_js_1.logEvent)('tengu_guest_passes_visited', {
        is_first_visit: isFirstVisit
    });
    return React.createElement(Passes_js_1.Passes, { onDone: onDone });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsIlBhc3NlcyIsImxvZ0V2ZW50IiwiZ2V0Q2FjaGVkUmVtYWluaW5nUGFzc2VzIiwiTG9jYWxKU1hDb21tYW5kT25Eb25lIiwiZ2V0R2xvYmFsQ29uZmlnIiwic2F2ZUdsb2JhbENvbmZpZyIsImNhbGwiLCJvbkRvbmUiLCJQcm9taXNlIiwiUmVhY3ROb2RlIiwiY29uZmlnIiwiaXNGaXJzdFZpc2l0IiwiaGFzVmlzaXRlZFBhc3NlcyIsInJlbWFpbmluZyIsImN1cnJlbnQiLCJwYXNzZXNMYXN0U2VlblJlbWFpbmluZyIsImlzX2ZpcnN0X3Zpc2l0Il0sInNvdXJjZXMiOlsicGFzc2VzLnRzeCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBSZWFjdCBmcm9tICdyZWFjdCdcbmltcG9ydCB7IFBhc3NlcyB9IGZyb20gJy4uLy4uL2NvbXBvbmVudHMvUGFzc2VzL1Bhc3Nlcy5qcydcbmltcG9ydCB7IGxvZ0V2ZW50IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvYW5hbHl0aWNzL2luZGV4LmpzJ1xuaW1wb3J0IHsgZ2V0Q2FjaGVkUmVtYWluaW5nUGFzc2VzIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvYXBpL3JlZmVycmFsLmpzJ1xuaW1wb3J0IHR5cGUgeyBMb2NhbEpTWENvbW1hbmRPbkRvbmUgfSBmcm9tICcuLi8uLi90eXBlcy9jb21tYW5kLmpzJ1xuaW1wb3J0IHsgZ2V0R2xvYmFsQ29uZmlnLCBzYXZlR2xvYmFsQ29uZmlnIH0gZnJvbSAnLi4vLi4vdXRpbHMvY29uZmlnLmpzJ1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY2FsbChcbiAgb25Eb25lOiBMb2NhbEpTWENvbW1hbmRPbkRvbmUsXG4pOiBQcm9taXNlPFJlYWN0LlJlYWN0Tm9kZT4ge1xuICAvLyBNYXJrIHRoYXQgdXNlciBoYXMgdmlzaXRlZCAvcGFzc2VzIHNvIHdlIHN0b3Agc2hvd2luZyB0aGUgdXBzZWxsXG4gIGNvbnN0IGNvbmZpZyA9IGdldEdsb2JhbENvbmZpZygpXG4gIGNvbnN0IGlzRmlyc3RWaXNpdCA9ICFjb25maWcuaGFzVmlzaXRlZFBhc3Nlc1xuICBpZiAoaXNGaXJzdFZpc2l0KSB7XG4gICAgY29uc3QgcmVtYWluaW5nID0gZ2V0Q2FjaGVkUmVtYWluaW5nUGFzc2VzKClcbiAgICBzYXZlR2xvYmFsQ29uZmlnKGN1cnJlbnQgPT4gKHtcbiAgICAgIC4uLmN1cnJlbnQsXG4gICAgICBoYXNWaXNpdGVkUGFzc2VzOiB0cnVlLFxuICAgICAgcGFzc2VzTGFzdFNlZW5SZW1haW5pbmc6IHJlbWFpbmluZyA/PyBjdXJyZW50LnBhc3Nlc0xhc3RTZWVuUmVtYWluaW5nLFxuICAgIH0pKVxuICB9XG4gIGxvZ0V2ZW50KCd0ZW5ndV9ndWVzdF9wYXNzZXNfdmlzaXRlZCcsIHsgaXNfZmlyc3RfdmlzaXQ6IGlzRmlyc3RWaXNpdCB9KVxuICByZXR1cm4gPFBhc3NlcyBvbkRvbmU9e29uRG9uZX0gLz5cbn1cbiJdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxLQUFLQSxLQUFLLE1BQU0sT0FBTztBQUM5QixTQUFTQyxNQUFNLFFBQVEsbUNBQW1DO0FBQzFELFNBQVNDLFFBQVEsUUFBUSxtQ0FBbUM7QUFDNUQsU0FBU0Msd0JBQXdCLFFBQVEsZ0NBQWdDO0FBQ3pFLGNBQWNDLHFCQUFxQixRQUFRLHdCQUF3QjtBQUNuRSxTQUFTQyxlQUFlLEVBQUVDLGdCQUFnQixRQUFRLHVCQUF1QjtBQUV6RSxPQUFPLGVBQWVDLElBQUlBLENBQ3hCQyxNQUFNLEVBQUVKLHFCQUFxQixDQUM5QixFQUFFSyxPQUFPLENBQUNULEtBQUssQ0FBQ1UsU0FBUyxDQUFDLENBQUM7RUFDMUI7RUFDQSxNQUFNQyxNQUFNLEdBQUdOLGVBQWUsQ0FBQyxDQUFDO0VBQ2hDLE1BQU1PLFlBQVksR0FBRyxDQUFDRCxNQUFNLENBQUNFLGdCQUFnQjtFQUM3QyxJQUFJRCxZQUFZLEVBQUU7SUFDaEIsTUFBTUUsU0FBUyxHQUFHWCx3QkFBd0IsQ0FBQyxDQUFDO0lBQzVDRyxnQkFBZ0IsQ0FBQ1MsT0FBTyxLQUFLO01BQzNCLEdBQUdBLE9BQU87TUFDVkYsZ0JBQWdCLEVBQUUsSUFBSTtNQUN0QkcsdUJBQXVCLEVBQUVGLFNBQVMsSUFBSUMsT0FBTyxDQUFDQztJQUNoRCxDQUFDLENBQUMsQ0FBQztFQUNMO0VBQ0FkLFFBQVEsQ0FBQyw0QkFBNEIsRUFBRTtJQUFFZSxjQUFjLEVBQUVMO0VBQWEsQ0FBQyxDQUFDO0VBQ3hFLE9BQU8sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUNKLE1BQU0sQ0FBQyxHQUFHO0FBQ25DIiwiaWdub3JlTGlzdCI6W119
