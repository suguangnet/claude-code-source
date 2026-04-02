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
exports.launchRepl = launchRepl;
const react_1 = __importDefault(require("react"));
async function launchRepl(root, appProps, replProps, renderAndRun) {
    const { App } = await Promise.resolve().then(() => __importStar(require('./components/App.js')));
    const { REPL } = await Promise.resolve().then(() => __importStar(require('./screens/REPL.js')));
    await renderAndRun(root, react_1.default.createElement(App, { ...appProps },
        react_1.default.createElement(REPL, { ...replProps })));
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsIlN0YXRzU3RvcmUiLCJSb290IiwiUHJvcHMiLCJSRVBMUHJvcHMiLCJBcHBTdGF0ZSIsIkZwc01ldHJpY3MiLCJBcHBXcmFwcGVyUHJvcHMiLCJnZXRGcHNNZXRyaWNzIiwic3RhdHMiLCJpbml0aWFsU3RhdGUiLCJsYXVuY2hSZXBsIiwicm9vdCIsImFwcFByb3BzIiwicmVwbFByb3BzIiwicmVuZGVyQW5kUnVuIiwiZWxlbWVudCIsIlJlYWN0Tm9kZSIsIlByb21pc2UiLCJBcHAiLCJSRVBMIl0sInNvdXJjZXMiOlsicmVwbExhdW5jaGVyLnRzeCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgUmVhY3QgZnJvbSAncmVhY3QnXG5pbXBvcnQgdHlwZSB7IFN0YXRzU3RvcmUgfSBmcm9tICcuL2NvbnRleHQvc3RhdHMuanMnXG5pbXBvcnQgdHlwZSB7IFJvb3QgfSBmcm9tICcuL2luay5qcydcbmltcG9ydCB0eXBlIHsgUHJvcHMgYXMgUkVQTFByb3BzIH0gZnJvbSAnLi9zY3JlZW5zL1JFUEwuanMnXG5pbXBvcnQgdHlwZSB7IEFwcFN0YXRlIH0gZnJvbSAnLi9zdGF0ZS9BcHBTdGF0ZVN0b3JlLmpzJ1xuaW1wb3J0IHR5cGUgeyBGcHNNZXRyaWNzIH0gZnJvbSAnLi91dGlscy9mcHNUcmFja2VyLmpzJ1xuXG50eXBlIEFwcFdyYXBwZXJQcm9wcyA9IHtcbiAgZ2V0RnBzTWV0cmljczogKCkgPT4gRnBzTWV0cmljcyB8IHVuZGVmaW5lZFxuICBzdGF0cz86IFN0YXRzU3RvcmVcbiAgaW5pdGlhbFN0YXRlOiBBcHBTdGF0ZVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbGF1bmNoUmVwbChcbiAgcm9vdDogUm9vdCxcbiAgYXBwUHJvcHM6IEFwcFdyYXBwZXJQcm9wcyxcbiAgcmVwbFByb3BzOiBSRVBMUHJvcHMsXG4gIHJlbmRlckFuZFJ1bjogKHJvb3Q6IFJvb3QsIGVsZW1lbnQ6IFJlYWN0LlJlYWN0Tm9kZSkgPT4gUHJvbWlzZTx2b2lkPixcbik6IFByb21pc2U8dm9pZD4ge1xuICBjb25zdCB7IEFwcCB9ID0gYXdhaXQgaW1wb3J0KCcuL2NvbXBvbmVudHMvQXBwLmpzJylcbiAgY29uc3QgeyBSRVBMIH0gPSBhd2FpdCBpbXBvcnQoJy4vc2NyZWVucy9SRVBMLmpzJylcbiAgYXdhaXQgcmVuZGVyQW5kUnVuKFxuICAgIHJvb3QsXG4gICAgPEFwcCB7Li4uYXBwUHJvcHN9PlxuICAgICAgPFJFUEwgey4uLnJlcGxQcm9wc30gLz5cbiAgICA8L0FwcD4sXG4gIClcbn1cbiJdLCJtYXBwaW5ncyI6IkFBQUEsT0FBT0EsS0FBSyxNQUFNLE9BQU87QUFDekIsY0FBY0MsVUFBVSxRQUFRLG9CQUFvQjtBQUNwRCxjQUFjQyxJQUFJLFFBQVEsVUFBVTtBQUNwQyxjQUFjQyxLQUFLLElBQUlDLFNBQVMsUUFBUSxtQkFBbUI7QUFDM0QsY0FBY0MsUUFBUSxRQUFRLDBCQUEwQjtBQUN4RCxjQUFjQyxVQUFVLFFBQVEsdUJBQXVCO0FBRXZELEtBQUtDLGVBQWUsR0FBRztFQUNyQkMsYUFBYSxFQUFFLEdBQUcsR0FBR0YsVUFBVSxHQUFHLFNBQVM7RUFDM0NHLEtBQUssQ0FBQyxFQUFFUixVQUFVO0VBQ2xCUyxZQUFZLEVBQUVMLFFBQVE7QUFDeEIsQ0FBQztBQUVELE9BQU8sZUFBZU0sVUFBVUEsQ0FDOUJDLElBQUksRUFBRVYsSUFBSSxFQUNWVyxRQUFRLEVBQUVOLGVBQWUsRUFDekJPLFNBQVMsRUFBRVYsU0FBUyxFQUNwQlcsWUFBWSxFQUFFLENBQUNILElBQUksRUFBRVYsSUFBSSxFQUFFYyxPQUFPLEVBQUVoQixLQUFLLENBQUNpQixTQUFTLEVBQUUsR0FBR0MsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUN0RSxFQUFFQSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7RUFDZixNQUFNO0lBQUVDO0VBQUksQ0FBQyxHQUFHLE1BQU0sTUFBTSxDQUFDLHFCQUFxQixDQUFDO0VBQ25ELE1BQU07SUFBRUM7RUFBSyxDQUFDLEdBQUcsTUFBTSxNQUFNLENBQUMsbUJBQW1CLENBQUM7RUFDbEQsTUFBTUwsWUFBWSxDQUNoQkgsSUFBSSxFQUNKLENBQUMsR0FBRyxDQUFDLElBQUlDLFFBQVEsQ0FBQztBQUN0QixNQUFNLENBQUMsSUFBSSxDQUFDLElBQUlDLFNBQVMsQ0FBQztBQUMxQixJQUFJLEVBQUUsR0FBRyxDQUNQLENBQUM7QUFDSCIsImlnbm9yZUxpc3QiOltdfQ==
