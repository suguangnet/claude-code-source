"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getContainerId = void 0;
exports.logPermissionContextForAnts = logPermissionContextForAnts;
const promises_1 = require("fs/promises");
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const slowOperations_js_1 = require("../utils/slowOperations.js");
const index_js_1 = require("./analytics/index.js");
/**
 * Get the current Kubernetes namespace:
 * Returns null on laptops/local development,
 * "default" for devboxes in default namespace,
 * "ts" for devboxes in ts namespace,
 * ...
 */
const getKubernetesNamespace = (0, memoize_js_1.default)(async () => {
    if (process.env.USER_TYPE !== 'ant') {
        return null;
    }
    const namespacePath = '/var/run/secrets/kubernetes.io/serviceaccount/namespace';
    const namespaceNotFound = 'namespace not found';
    try {
        const content = await (0, promises_1.readFile)(namespacePath, { encoding: 'utf8' });
        return content.trim();
    }
    catch {
        return namespaceNotFound;
    }
});
/**
 * Get the OCI container ID from within a running container
 */
exports.getContainerId = (0, memoize_js_1.default)(async () => {
    if (process.env.USER_TYPE !== 'ant') {
        return null;
    }
    const containerIdPath = '/proc/self/mountinfo';
    const containerIdNotFound = 'container ID not found';
    const containerIdNotFoundInMountinfo = 'container ID not found in mountinfo';
    try {
        const mountinfo = (await (0, promises_1.readFile)(containerIdPath, { encoding: 'utf8' })).trim();
        // Pattern to match both Docker and containerd/CRI-O container IDs
        // Docker: /docker/containers/[64-char-hex]
        // Containerd: /sandboxes/[64-char-hex]
        const containerIdPattern = /(?:\/docker\/containers\/|\/sandboxes\/)([0-9a-f]{64})/;
        const lines = mountinfo.split('\n');
        for (const line of lines) {
            const match = line.match(containerIdPattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        return containerIdNotFoundInMountinfo;
    }
    catch {
        return containerIdNotFound;
    }
});
/**
 * Logs an event with the current namespace and tool permission context
 */
async function logPermissionContextForAnts(toolPermissionContext, moment) {
    if (process.env.USER_TYPE !== 'ant') {
        return;
    }
    void (0, index_js_1.logEvent)('tengu_internal_record_permission_context', {
        moment: moment,
        namespace: (await getKubernetesNamespace()),
        toolPermissionContext: (0, slowOperations_js_1.jsonStringify)(toolPermissionContext),
        containerId: (await (0, exports.getContainerId)()),
    });
}
