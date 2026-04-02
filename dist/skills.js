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
const SkillsMenu_js_1 = require("../../components/skills/SkillsMenu.js");
async function call(onDone, context) {
    return React.createElement(SkillsMenu_js_1.SkillsMenu, { onExit: onDone, commands: context.options.commands });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSZWFjdCIsIkxvY2FsSlNYQ29tbWFuZENvbnRleHQiLCJTa2lsbHNNZW51IiwiTG9jYWxKU1hDb21tYW5kT25Eb25lIiwiY2FsbCIsIm9uRG9uZSIsImNvbnRleHQiLCJQcm9taXNlIiwiUmVhY3ROb2RlIiwib3B0aW9ucyIsImNvbW1hbmRzIl0sInNvdXJjZXMiOlsic2tpbGxzLnRzeCJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBSZWFjdCBmcm9tICdyZWFjdCdcbmltcG9ydCB0eXBlIHsgTG9jYWxKU1hDb21tYW5kQ29udGV4dCB9IGZyb20gJy4uLy4uL2NvbW1hbmRzLmpzJ1xuaW1wb3J0IHsgU2tpbGxzTWVudSB9IGZyb20gJy4uLy4uL2NvbXBvbmVudHMvc2tpbGxzL1NraWxsc01lbnUuanMnXG5pbXBvcnQgdHlwZSB7IExvY2FsSlNYQ29tbWFuZE9uRG9uZSB9IGZyb20gJy4uLy4uL3R5cGVzL2NvbW1hbmQuanMnXG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjYWxsKFxuICBvbkRvbmU6IExvY2FsSlNYQ29tbWFuZE9uRG9uZSxcbiAgY29udGV4dDogTG9jYWxKU1hDb21tYW5kQ29udGV4dCxcbik6IFByb21pc2U8UmVhY3QuUmVhY3ROb2RlPiB7XG4gIHJldHVybiA8U2tpbGxzTWVudSBvbkV4aXQ9e29uRG9uZX0gY29tbWFuZHM9e2NvbnRleHQub3B0aW9ucy5jb21tYW5kc30gLz5cbn1cbiJdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxLQUFLQSxLQUFLLE1BQU0sT0FBTztBQUM5QixjQUFjQyxzQkFBc0IsUUFBUSxtQkFBbUI7QUFDL0QsU0FBU0MsVUFBVSxRQUFRLHVDQUF1QztBQUNsRSxjQUFjQyxxQkFBcUIsUUFBUSx3QkFBd0I7QUFFbkUsT0FBTyxlQUFlQyxJQUFJQSxDQUN4QkMsTUFBTSxFQUFFRixxQkFBcUIsRUFDN0JHLE9BQU8sRUFBRUwsc0JBQXNCLENBQ2hDLEVBQUVNLE9BQU8sQ0FBQ1AsS0FBSyxDQUFDUSxTQUFTLENBQUMsQ0FBQztFQUMxQixPQUFPLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDSCxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQ0MsT0FBTyxDQUFDRyxPQUFPLENBQUNDLFFBQVEsQ0FBQyxHQUFHO0FBQzNFIiwiaWdub3JlTGlzdCI6W119
