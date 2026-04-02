"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldShowProjectOnboarding = void 0;
exports.getSteps = getSteps;
exports.isProjectOnboardingComplete = isProjectOnboardingComplete;
exports.maybeMarkProjectOnboardingComplete = maybeMarkProjectOnboardingComplete;
exports.incrementProjectOnboardingSeenCount = incrementProjectOnboardingSeenCount;
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const path_1 = require("path");
const config_js_1 = require("./utils/config.js");
const cwd_js_1 = require("./utils/cwd.js");
const file_js_1 = require("./utils/file.js");
const fsOperations_js_1 = require("./utils/fsOperations.js");
function getSteps() {
    const hasClaudeMd = (0, fsOperations_js_1.getFsImplementation)().existsSync((0, path_1.join)((0, cwd_js_1.getCwd)(), 'CLAUDE.md'));
    const isWorkspaceDirEmpty = (0, file_js_1.isDirEmpty)((0, cwd_js_1.getCwd)());
    return [
        {
            key: 'workspace',
            text: 'Ask Claude to create a new app or clone a repository',
            isComplete: false,
            isCompletable: true,
            isEnabled: isWorkspaceDirEmpty,
        },
        {
            key: 'claudemd',
            text: 'Run /init to create a CLAUDE.md file with instructions for Claude',
            isComplete: hasClaudeMd,
            isCompletable: true,
            isEnabled: !isWorkspaceDirEmpty,
        },
    ];
}
function isProjectOnboardingComplete() {
    return getSteps()
        .filter(({ isCompletable, isEnabled }) => isCompletable && isEnabled)
        .every(({ isComplete }) => isComplete);
}
function maybeMarkProjectOnboardingComplete() {
    // Short-circuit on cached config — isProjectOnboardingComplete() hits
    // the filesystem, and REPL.tsx calls this on every prompt submit.
    if ((0, config_js_1.getCurrentProjectConfig)().hasCompletedProjectOnboarding) {
        return;
    }
    if (isProjectOnboardingComplete()) {
        (0, config_js_1.saveCurrentProjectConfig)(current => ({
            ...current,
            hasCompletedProjectOnboarding: true,
        }));
    }
}
exports.shouldShowProjectOnboarding = (0, memoize_js_1.default)(() => {
    const projectConfig = (0, config_js_1.getCurrentProjectConfig)();
    // Short-circuit on cached config before isProjectOnboardingComplete()
    // hits the filesystem — this runs during first render.
    if (projectConfig.hasCompletedProjectOnboarding ||
        projectConfig.projectOnboardingSeenCount >= 4 ||
        process.env.IS_DEMO) {
        return false;
    }
    return !isProjectOnboardingComplete();
});
function incrementProjectOnboardingSeenCount() {
    (0, config_js_1.saveCurrentProjectConfig)(current => ({
        ...current,
        projectOnboardingSeenCount: current.projectOnboardingSeenCount + 1,
    }));
}
