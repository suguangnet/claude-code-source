"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useDiffData = useDiffData;
const react_1 = require("react");
const gitDiff_js_1 = require("../utils/gitDiff.js");
const MAX_LINES_PER_FILE = 400;
/**
 * Hook to fetch current git diff data on demand.
 * Fetches both stats and hunks when component mounts.
 */
function useDiffData() {
    const [diffResult, setDiffResult] = (0, react_1.useState)(null);
    const [hunks, setHunks] = (0, react_1.useState)(new Map());
    const [loading, setLoading] = (0, react_1.useState)(true);
    // Fetch diff data on mount
    (0, react_1.useEffect)(() => {
        let cancelled = false;
        async function loadDiffData() {
            try {
                // Fetch both stats and hunks
                const [statsResult, hunksResult] = await Promise.all([
                    (0, gitDiff_js_1.fetchGitDiff)(),
                    (0, gitDiff_js_1.fetchGitDiffHunks)(),
                ]);
                if (!cancelled) {
                    setDiffResult(statsResult);
                    setHunks(hunksResult);
                    setLoading(false);
                }
            }
            catch (_error) {
                if (!cancelled) {
                    setDiffResult(null);
                    setHunks(new Map());
                    setLoading(false);
                }
            }
        }
        void loadDiffData();
        return () => {
            cancelled = true;
        };
    }, []);
    return (0, react_1.useMemo)(() => {
        if (!diffResult) {
            return { stats: null, files: [], hunks: new Map(), loading };
        }
        const { stats, perFileStats } = diffResult;
        const files = [];
        // Iterate over perFileStats to get all files including large/skipped ones
        for (const [path, fileStats] of perFileStats) {
            const fileHunks = hunks.get(path);
            const isUntracked = fileStats.isUntracked ?? false;
            // Detect large file (in perFileStats but not in hunks, and not binary/untracked)
            const isLargeFile = !fileStats.isBinary && !isUntracked && !fileHunks;
            // Detect truncated file (total > limit means we truncated)
            const totalLines = fileStats.added + fileStats.removed;
            const isTruncated = !isLargeFile && !fileStats.isBinary && totalLines > MAX_LINES_PER_FILE;
            files.push({
                path,
                linesAdded: fileStats.added,
                linesRemoved: fileStats.removed,
                isBinary: fileStats.isBinary,
                isLargeFile,
                isTruncated,
                isUntracked,
            });
        }
        files.sort((a, b) => a.path.localeCompare(b.path));
        return { stats, files, hunks, loading: false };
    }, [diffResult, hunks, loading]);
}
