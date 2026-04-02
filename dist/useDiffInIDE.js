"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useDiffInIDE = useDiffInIDE;
exports.computeEditsFromContents = computeEditsFromContents;
const crypto_1 = require("crypto");
const path_1 = require("path");
const react_1 = require("react");
const index_js_1 = require("src/services/analytics/index.js");
const fileRead_js_1 = require("src/utils/fileRead.js");
const path_js_1 = require("src/utils/path.js");
const utils_js_1 = require("../tools/FileEditTool/utils.js");
const config_js_1 = require("../utils/config.js");
const diff_js_1 = require("../utils/diff.js");
const errors_js_1 = require("../utils/errors.js");
const ide_js_1 = require("../utils/ide.js");
const idePathConversion_js_1 = require("../utils/idePathConversion.js");
const log_js_1 = require("../utils/log.js");
const platform_js_1 = require("../utils/platform.js");
function useDiffInIDE({ onChange, toolUseContext, filePath, edits, editMode, }) {
    const isUnmounted = (0, react_1.useRef)(false);
    const [hasError, setHasError] = (0, react_1.useState)(false);
    const sha = (0, react_1.useMemo)(() => (0, crypto_1.randomUUID)().slice(0, 6), []);
    const tabName = (0, react_1.useMemo)(() => `✻ [Claude Code] ${(0, path_1.basename)(filePath)} (${sha}) ⧉`, [filePath, sha]);
    const shouldShowDiffInIDE = (0, ide_js_1.hasAccessToIDEExtensionDiffFeature)(toolUseContext.options.mcpClients) &&
        (0, config_js_1.getGlobalConfig)().diffTool === 'auto' &&
        // Diffs should only be for file edits.
        // File writes may come through here but are not supported for diffs.
        !filePath.endsWith('.ipynb');
    const ideName = (0, ide_js_1.getConnectedIdeName)(toolUseContext.options.mcpClients) ?? 'IDE';
    async function showDiff() {
        if (!shouldShowDiffInIDE) {
            return;
        }
        try {
            (0, index_js_1.logEvent)('tengu_ext_will_show_diff', {});
            const { oldContent, newContent } = await showDiffInIDE(filePath, edits, toolUseContext, tabName);
            // Skip if component has been unmounted
            if (isUnmounted.current) {
                return;
            }
            (0, index_js_1.logEvent)('tengu_ext_diff_accepted', {});
            const newEdits = computeEditsFromContents(filePath, oldContent, newContent, editMode);
            if (newEdits.length === 0) {
                // No changes -- edit was rejected (eg. reverted)
                (0, index_js_1.logEvent)('tengu_ext_diff_rejected', {});
                // We close the tab here because 'no' no longer auto-closes
                const ideClient = (0, ide_js_1.getConnectedIdeClient)(toolUseContext.options.mcpClients);
                if (ideClient) {
                    // Close the tab in the IDE
                    await closeTabInIDE(tabName, ideClient);
                }
                onChange({ type: 'reject' }, {
                    file_path: filePath,
                    edits: edits,
                });
                return;
            }
            // File was modified - edit was accepted
            onChange({ type: 'accept-once' }, {
                file_path: filePath,
                edits: newEdits,
            });
        }
        catch (error) {
            (0, log_js_1.logError)(error);
            setHasError(true);
        }
    }
    (0, react_1.useEffect)(() => {
        void showDiff();
        // Set flag on unmount
        return () => {
            isUnmounted.current = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return {
        closeTabInIDE() {
            const ideClient = (0, ide_js_1.getConnectedIdeClient)(toolUseContext.options.mcpClients);
            if (!ideClient) {
                return Promise.resolve();
            }
            return closeTabInIDE(tabName, ideClient);
        },
        showingDiffInIDE: shouldShowDiffInIDE && !hasError,
        ideName: ideName,
        hasError,
    };
}
/**
 * Re-computes the edits from the old and new contents. This is necessary
 * to apply any edits the user may have made to the new contents.
 */
function computeEditsFromContents(filePath, oldContent, newContent, editMode) {
    // Use unformatted patches, otherwise the edits will be formatted.
    const singleHunk = editMode === 'single';
    const patch = (0, diff_js_1.getPatchFromContents)({
        filePath,
        oldContent,
        newContent,
        singleHunk,
    });
    if (patch.length === 0) {
        return [];
    }
    // For single edit mode, verify we only got one hunk
    if (singleHunk && patch.length > 1) {
        (0, log_js_1.logError)(new Error(`Unexpected number of hunks: ${patch.length}. Expected 1 hunk.`));
    }
    // Re-compute the edits to match the patch
    return (0, utils_js_1.getEditsForPatch)(patch);
}
/**
 * Done if:
 *
 * 1. Tab is closed in IDE
 * 2. Tab is saved in IDE (we then close the tab)
 * 3. User selected an option in IDE
 * 4. User selected an option in terminal (or hit esc)
 *
 * Resolves with the new file content.
 *
 * TODO: Time out after 5 mins of inactivity?
 * TODO: Update auto-approval UI when IDE exits
 * TODO: Close the IDE tab when the approval prompt is unmounted
 */
async function showDiffInIDE(file_path, edits, toolUseContext, tabName) {
    let isCleanedUp = false;
    const oldFilePath = (0, path_js_1.expandPath)(file_path);
    let oldContent = '';
    try {
        oldContent = (0, fileRead_js_1.readFileSync)(oldFilePath);
    }
    catch (e) {
        if (!(0, errors_js_1.isENOENT)(e)) {
            throw e;
        }
    }
    async function cleanup() {
        // Careful to avoid race conditions, since this
        // function can be called from multiple places.
        if (isCleanedUp) {
            return;
        }
        isCleanedUp = true;
        // Don't fail if this fails
        try {
            await closeTabInIDE(tabName, ideClient);
        }
        catch (e) {
            (0, log_js_1.logError)(e);
        }
        process.off('beforeExit', cleanup);
        toolUseContext.abortController.signal.removeEventListener('abort', cleanup);
    }
    // Cleanup if the user hits esc to cancel the tool call - or on exit
    toolUseContext.abortController.signal.addEventListener('abort', cleanup);
    process.on('beforeExit', cleanup);
    // Open the diff in the IDE
    const ideClient = (0, ide_js_1.getConnectedIdeClient)(toolUseContext.options.mcpClients);
    try {
        const { updatedFile } = (0, utils_js_1.getPatchForEdits)({
            filePath: oldFilePath,
            fileContents: oldContent,
            edits,
        });
        if (!ideClient || ideClient.type !== 'connected') {
            throw new Error('IDE client not available');
        }
        let ideOldPath = oldFilePath;
        // Only convert paths if we're in WSL and IDE is on Windows
        const ideRunningInWindows = ideClient.config
            .ideRunningInWindows === true;
        if ((0, platform_js_1.getPlatform)() === 'wsl' &&
            ideRunningInWindows &&
            process.env.WSL_DISTRO_NAME) {
            const converter = new idePathConversion_js_1.WindowsToWSLConverter(process.env.WSL_DISTRO_NAME);
            ideOldPath = converter.toIDEPath(oldFilePath);
        }
        const rpcResult = await (0, ide_js_1.callIdeRpc)('openDiff', {
            old_file_path: ideOldPath,
            new_file_path: ideOldPath,
            new_file_contents: updatedFile,
            tab_name: tabName,
        }, ideClient);
        // Convert the raw RPC result to a ToolCallResponse format
        const data = Array.isArray(rpcResult) ? rpcResult : [rpcResult];
        // If the user saved the file then take the new contents and resolve with that.
        if (isSaveMessage(data)) {
            void cleanup();
            return {
                oldContent: oldContent,
                newContent: data[1].text,
            };
        }
        else if (isClosedMessage(data)) {
            void cleanup();
            return {
                oldContent: oldContent,
                newContent: updatedFile,
            };
        }
        else if (isRejectedMessage(data)) {
            void cleanup();
            return {
                oldContent: oldContent,
                newContent: oldContent,
            };
        }
        // Indicates that the tool call completed with none of the expected
        // results. Did the user close the IDE?
        throw new Error('Not accepted');
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        void cleanup();
        throw error;
    }
}
async function closeTabInIDE(tabName, ideClient) {
    try {
        if (!ideClient || ideClient.type !== 'connected') {
            throw new Error('IDE client not available');
        }
        // Use direct RPC to close the tab
        await (0, ide_js_1.callIdeRpc)('close_tab', { tab_name: tabName }, ideClient);
    }
    catch (error) {
        (0, log_js_1.logError)(error);
        // Don't throw - this is a cleanup operation
    }
}
function isClosedMessage(data) {
    return (Array.isArray(data) &&
        typeof data[0] === 'object' &&
        data[0] !== null &&
        'type' in data[0] &&
        data[0].type === 'text' &&
        'text' in data[0] &&
        data[0].text === 'TAB_CLOSED');
}
function isRejectedMessage(data) {
    return (Array.isArray(data) &&
        typeof data[0] === 'object' &&
        data[0] !== null &&
        'type' in data[0] &&
        data[0].type === 'text' &&
        'text' in data[0] &&
        data[0].text === 'DIFF_REJECTED');
}
function isSaveMessage(data) {
    return (Array.isArray(data) &&
        data[0]?.type === 'text' &&
        data[0].text === 'FILE_SAVED' &&
        typeof data[1].text === 'string');
}
