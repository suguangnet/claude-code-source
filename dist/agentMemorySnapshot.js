"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSnapshotDirForAgent = getSnapshotDirForAgent;
exports.checkAgentMemorySnapshot = checkAgentMemorySnapshot;
exports.initializeFromSnapshot = initializeFromSnapshot;
exports.replaceFromSnapshot = replaceFromSnapshot;
exports.markSnapshotSynced = markSnapshotSynced;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const v4_1 = require("zod/v4");
const cwd_js_1 = require("../../utils/cwd.js");
const debug_js_1 = require("../../utils/debug.js");
const lazySchema_js_1 = require("../../utils/lazySchema.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const agentMemory_js_1 = require("./agentMemory.js");
const SNAPSHOT_BASE = 'agent-memory-snapshots';
const SNAPSHOT_JSON = 'snapshot.json';
const SYNCED_JSON = '.snapshot-synced.json';
const snapshotMetaSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    updatedAt: v4_1.z.string().min(1),
}));
const syncedMetaSchema = (0, lazySchema_js_1.lazySchema)(() => v4_1.z.object({
    syncedFrom: v4_1.z.string().min(1),
}));
/**
 * Returns the path to the snapshot directory for an agent in the current project.
 * e.g., <cwd>/.claude/agent-memory-snapshots/<agentType>/
 */
function getSnapshotDirForAgent(agentType) {
    return (0, path_1.join)((0, cwd_js_1.getCwd)(), '.claude', SNAPSHOT_BASE, agentType);
}
function getSnapshotJsonPath(agentType) {
    return (0, path_1.join)(getSnapshotDirForAgent(agentType), SNAPSHOT_JSON);
}
function getSyncedJsonPath(agentType, scope) {
    return (0, path_1.join)((0, agentMemory_js_1.getAgentMemoryDir)(agentType, scope), SYNCED_JSON);
}
async function readJsonFile(path, schema) {
    try {
        const content = await (0, promises_1.readFile)(path, { encoding: 'utf-8' });
        const result = schema.safeParse((0, slowOperations_js_1.jsonParse)(content));
        return result.success ? result.data : null;
    }
    catch {
        return null;
    }
}
async function copySnapshotToLocal(agentType, scope) {
    const snapshotMemDir = getSnapshotDirForAgent(agentType);
    const localMemDir = (0, agentMemory_js_1.getAgentMemoryDir)(agentType, scope);
    await (0, promises_1.mkdir)(localMemDir, { recursive: true });
    try {
        const files = await (0, promises_1.readdir)(snapshotMemDir, { withFileTypes: true });
        for (const dirent of files) {
            if (!dirent.isFile() || dirent.name === SNAPSHOT_JSON)
                continue;
            const content = await (0, promises_1.readFile)((0, path_1.join)(snapshotMemDir, dirent.name), {
                encoding: 'utf-8',
            });
            await (0, promises_1.writeFile)((0, path_1.join)(localMemDir, dirent.name), content);
        }
    }
    catch (e) {
        (0, debug_js_1.logForDebugging)(`Failed to copy snapshot to local agent memory: ${e}`);
    }
}
async function saveSyncedMeta(agentType, scope, snapshotTimestamp) {
    const syncedPath = getSyncedJsonPath(agentType, scope);
    const localMemDir = (0, agentMemory_js_1.getAgentMemoryDir)(agentType, scope);
    await (0, promises_1.mkdir)(localMemDir, { recursive: true });
    const meta = { syncedFrom: snapshotTimestamp };
    try {
        await (0, promises_1.writeFile)(syncedPath, (0, slowOperations_js_1.jsonStringify)(meta));
    }
    catch (e) {
        (0, debug_js_1.logForDebugging)(`Failed to save snapshot sync metadata: ${e}`);
    }
}
/**
 * Check if a snapshot exists and whether it's newer than what we last synced.
 */
async function checkAgentMemorySnapshot(agentType, scope) {
    const snapshotMeta = await readJsonFile(getSnapshotJsonPath(agentType), snapshotMetaSchema());
    if (!snapshotMeta) {
        return { action: 'none' };
    }
    const localMemDir = (0, agentMemory_js_1.getAgentMemoryDir)(agentType, scope);
    let hasLocalMemory = false;
    try {
        const dirents = await (0, promises_1.readdir)(localMemDir, { withFileTypes: true });
        hasLocalMemory = dirents.some(d => d.isFile() && d.name.endsWith('.md'));
    }
    catch {
        // Directory doesn't exist
    }
    if (!hasLocalMemory) {
        return { action: 'initialize', snapshotTimestamp: snapshotMeta.updatedAt };
    }
    const syncedMeta = await readJsonFile(getSyncedJsonPath(agentType, scope), syncedMetaSchema());
    if (!syncedMeta ||
        new Date(snapshotMeta.updatedAt) > new Date(syncedMeta.syncedFrom)) {
        return {
            action: 'prompt-update',
            snapshotTimestamp: snapshotMeta.updatedAt,
        };
    }
    return { action: 'none' };
}
/**
 * Initialize local agent memory from a snapshot (first-time setup).
 */
async function initializeFromSnapshot(agentType, scope, snapshotTimestamp) {
    (0, debug_js_1.logForDebugging)(`Initializing agent memory for ${agentType} from project snapshot`);
    await copySnapshotToLocal(agentType, scope);
    await saveSyncedMeta(agentType, scope, snapshotTimestamp);
}
/**
 * Replace local agent memory with the snapshot.
 */
async function replaceFromSnapshot(agentType, scope, snapshotTimestamp) {
    (0, debug_js_1.logForDebugging)(`Replacing agent memory for ${agentType} with project snapshot`);
    // Remove existing .md files before copying to avoid orphans
    const localMemDir = (0, agentMemory_js_1.getAgentMemoryDir)(agentType, scope);
    try {
        const existing = await (0, promises_1.readdir)(localMemDir, { withFileTypes: true });
        for (const dirent of existing) {
            if (dirent.isFile() && dirent.name.endsWith('.md')) {
                await (0, promises_1.unlink)((0, path_1.join)(localMemDir, dirent.name));
            }
        }
    }
    catch {
        // Directory may not exist yet
    }
    await copySnapshotToLocal(agentType, scope);
    await saveSyncedMeta(agentType, scope, snapshotTimestamp);
}
/**
 * Mark the current snapshot as synced without changing local memory.
 */
async function markSnapshotSynced(agentType, scope, snapshotTimestamp) {
    await saveSyncedMeta(agentType, scope, snapshotTimestamp);
}
