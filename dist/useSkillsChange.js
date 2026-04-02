"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSkillsChange = useSkillsChange;
const react_1 = require("react");
const commands_js_1 = require("../commands.js");
const growthbook_js_1 = require("../services/analytics/growthbook.js");
const log_js_1 = require("../utils/log.js");
const skillChangeDetector_js_1 = require("../utils/skills/skillChangeDetector.js");
/**
 * Keep the commands list fresh across two triggers:
 *
 * 1. Skill file changes (watcher) — full cache clear + disk re-scan, since
 *    skill content changed on disk.
 * 2. GrowthBook init/refresh — memo-only clear, since only `isEnabled()`
 *    predicates may have changed. Handles commands like /btw whose gate
 *    reads a flag that isn't in the disk cache yet on first session after
 *    a flag rename: getCommands() runs before GB init (main.tsx:2855 vs
 *    showSetupScreens at :3106), so the memoized list is baked with the
 *    default. Once init populates remoteEvalFeatureValues, re-filter.
 */
function useSkillsChange(cwd, onCommandsChange) {
    const handleChange = (0, react_1.useCallback)(async () => {
        if (!cwd)
            return;
        try {
            // Clear all command caches to ensure fresh load
            (0, commands_js_1.clearCommandsCache)();
            const commands = await (0, commands_js_1.getCommands)(cwd);
            onCommandsChange(commands);
        }
        catch (error) {
            // Errors during reload are non-fatal - log and continue
            if (error instanceof Error) {
                (0, log_js_1.logError)(error);
            }
        }
    }, [cwd, onCommandsChange]);
    (0, react_1.useEffect)(() => skillChangeDetector_js_1.skillChangeDetector.subscribe(handleChange), [handleChange]);
    const handleGrowthBookRefresh = (0, react_1.useCallback)(async () => {
        if (!cwd)
            return;
        try {
            (0, commands_js_1.clearCommandMemoizationCaches)();
            const commands = await (0, commands_js_1.getCommands)(cwd);
            onCommandsChange(commands);
        }
        catch (error) {
            if (error instanceof Error) {
                (0, log_js_1.logError)(error);
            }
        }
    }, [cwd, onCommandsChange]);
    (0, react_1.useEffect)(() => (0, growthbook_js_1.onGrowthBookRefresh)(handleGrowthBookRefresh), [handleGrowthBookRefresh]);
}
