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
exports.init = void 0;
exports.initializeTelemetryAfterTrust = initializeTelemetryAfterTrust;
const startupProfiler_js_1 = require("../utils/startupProfiler.js");
require("../bootstrap/state.js");
require("../utils/config.js");
const memoize_js_1 = __importDefault(require("lodash-es/memoize.js"));
const state_js_1 = require("src/bootstrap/state.js");
const state_js_2 = require("../bootstrap/state.js");
const manager_js_1 = require("../services/lsp/manager.js");
const client_js_1 = require("../services/oauth/client.js");
const index_js_1 = require("../services/policyLimits/index.js");
const index_js_2 = require("../services/remoteManagedSettings/index.js");
const apiPreconnect_js_1 = require("../utils/apiPreconnect.js");
const caCertsConfig_js_1 = require("../utils/caCertsConfig.js");
const cleanupRegistry_js_1 = require("../utils/cleanupRegistry.js");
const config_js_1 = require("../utils/config.js");
const debug_js_1 = require("../utils/debug.js");
const detectRepository_js_1 = require("../utils/detectRepository.js");
const diagLogs_js_1 = require("../utils/diagLogs.js");
const envDynamic_js_1 = require("../utils/envDynamic.js");
const envUtils_js_1 = require("../utils/envUtils.js");
const errors_js_1 = require("../utils/errors.js");
// showInvalidConfigDialog is dynamically imported in the error path to avoid loading React at init
const gracefulShutdown_js_1 = require("../utils/gracefulShutdown.js");
const managedEnv_js_1 = require("../utils/managedEnv.js");
const mtls_js_1 = require("../utils/mtls.js");
const filesystem_js_1 = require("../utils/permissions/filesystem.js");
// initializeTelemetry is loaded lazily via import() in setMeterState() to defer
// ~400KB of OpenTelemetry + protobuf modules until telemetry is actually initialized.
// gRPC exporters (~700KB via @grpc/grpc-js) are further lazy-loaded within instrumentation.ts.
const proxy_js_1 = require("../utils/proxy.js");
const betaSessionTracing_js_1 = require("../utils/telemetry/betaSessionTracing.js");
const telemetryAttributes_js_1 = require("../utils/telemetryAttributes.js");
const windowsPaths_js_1 = require("../utils/windowsPaths.js");
// initialize1PEventLogging is dynamically imported to defer OpenTelemetry sdk-logs/resources
// Track if telemetry has been initialized to prevent double initialization
let telemetryInitialized = false;
exports.init = (0, memoize_js_1.default)(async () => {
    const initStartTime = Date.now();
    (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'init_started');
    (0, startupProfiler_js_1.profileCheckpoint)('init_function_start');
    // Validate configs are valid and enable configuration system
    try {
        const configsStart = Date.now();
        (0, config_js_1.enableConfigs)();
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'init_configs_enabled', {
            duration_ms: Date.now() - configsStart,
        });
        (0, startupProfiler_js_1.profileCheckpoint)('init_configs_enabled');
        // Apply only safe environment variables before trust dialog
        // Full environment variables are applied after trust is established
        const envVarsStart = Date.now();
        (0, managedEnv_js_1.applySafeConfigEnvironmentVariables)();
        // Apply NODE_EXTRA_CA_CERTS from settings.json to process.env early,
        // before any TLS connections. Bun caches the TLS cert store at boot
        // via BoringSSL, so this must happen before the first TLS handshake.
        (0, caCertsConfig_js_1.applyExtraCACertsFromConfig)();
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'init_safe_env_vars_applied', {
            duration_ms: Date.now() - envVarsStart,
        });
        (0, startupProfiler_js_1.profileCheckpoint)('init_safe_env_vars_applied');
        // Make sure things get flushed on exit
        (0, gracefulShutdown_js_1.setupGracefulShutdown)();
        (0, startupProfiler_js_1.profileCheckpoint)('init_after_graceful_shutdown');
        // Initialize 1P event logging (no security concerns, but deferred to avoid
        // loading OpenTelemetry sdk-logs at startup). growthbook.js is already in
        // the module cache by this point (firstPartyEventLogger imports it), so the
        // second dynamic import adds no load cost.
        void Promise.all([
            Promise.resolve().then(() => __importStar(require('../services/analytics/firstPartyEventLogger.js'))),
            Promise.resolve().then(() => __importStar(require('../services/analytics/growthbook.js'))),
        ]).then(([fp, gb]) => {
            fp.initialize1PEventLogging();
            // Rebuild the logger provider if tengu_1p_event_batch_config changes
            // mid-session. Change detection (isEqual) is inside the handler so
            // unchanged refreshes are no-ops.
            gb.onGrowthBookRefresh(() => {
                void fp.reinitialize1PEventLoggingIfConfigChanged();
            });
        });
        (0, startupProfiler_js_1.profileCheckpoint)('init_after_1p_event_logging');
        // Populate OAuth account info if it is not already cached in config. This is needed since the
        // OAuth account info may not be populated when logging in through the VSCode extension.
        void (0, client_js_1.populateOAuthAccountInfoIfNeeded)();
        (0, startupProfiler_js_1.profileCheckpoint)('init_after_oauth_populate');
        // Initialize JetBrains IDE detection asynchronously (populates cache for later sync access)
        void (0, envDynamic_js_1.initJetBrainsDetection)();
        (0, startupProfiler_js_1.profileCheckpoint)('init_after_jetbrains_detection');
        // Detect GitHub repository asynchronously (populates cache for gitDiff PR linking)
        void (0, detectRepository_js_1.detectCurrentRepository)();
        // Initialize the loading promise early so that other systems (like plugin hooks)
        // can await remote settings loading. The promise includes a timeout to prevent
        // deadlocks if loadRemoteManagedSettings() is never called (e.g., Agent SDK tests).
        if ((0, index_js_2.isEligibleForRemoteManagedSettings)()) {
            (0, index_js_2.initializeRemoteManagedSettingsLoadingPromise)();
        }
        if ((0, index_js_1.isPolicyLimitsEligible)()) {
            (0, index_js_1.initializePolicyLimitsLoadingPromise)();
        }
        (0, startupProfiler_js_1.profileCheckpoint)('init_after_remote_settings_check');
        // Record the first start time
        (0, config_js_1.recordFirstStartTime)();
        // Configure global mTLS settings
        const mtlsStart = Date.now();
        (0, debug_js_1.logForDebugging)('[init] configureGlobalMTLS starting');
        (0, mtls_js_1.configureGlobalMTLS)();
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'init_mtls_configured', {
            duration_ms: Date.now() - mtlsStart,
        });
        (0, debug_js_1.logForDebugging)('[init] configureGlobalMTLS complete');
        // Configure global HTTP agents (proxy and/or mTLS)
        const proxyStart = Date.now();
        (0, debug_js_1.logForDebugging)('[init] configureGlobalAgents starting');
        (0, proxy_js_1.configureGlobalAgents)();
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'init_proxy_configured', {
            duration_ms: Date.now() - proxyStart,
        });
        (0, debug_js_1.logForDebugging)('[init] configureGlobalAgents complete');
        (0, startupProfiler_js_1.profileCheckpoint)('init_network_configured');
        // Preconnect to the Anthropic API — overlap TCP+TLS handshake
        // (~100-200ms) with the ~100ms of action-handler work before the API
        // request. After CA certs + proxy agents are configured so the warmed
        // connection uses the right transport. Fire-and-forget; skipped for
        // proxy/mTLS/unix/cloud-provider where the SDK's dispatcher wouldn't
        // reuse the global pool.
        (0, apiPreconnect_js_1.preconnectAnthropicApi)();
        // CCR upstreamproxy: start the local CONNECT relay so agent subprocesses
        // can reach org-configured upstreams with credential injection. Gated on
        // CLAUDE_CODE_REMOTE + GrowthBook; fail-open on any error. Lazy import so
        // non-CCR startups don't pay the module load. The getUpstreamProxyEnv
        // function is registered with subprocessEnv.ts so subprocess spawning can
        // inject proxy vars without a static import of the upstreamproxy module.
        if ((0, envUtils_js_1.isEnvTruthy)(process.env.CLAUDE_CODE_REMOTE)) {
            try {
                const { initUpstreamProxy, getUpstreamProxyEnv } = await Promise.resolve().then(() => __importStar(require('../upstreamproxy/upstreamproxy.js')));
                const { registerUpstreamProxyEnvFn } = await Promise.resolve().then(() => __importStar(require('../utils/subprocessEnv.js')));
                registerUpstreamProxyEnvFn(getUpstreamProxyEnv);
                await initUpstreamProxy();
            }
            catch (err) {
                (0, debug_js_1.logForDebugging)(`[init] upstreamproxy init failed: ${err instanceof Error ? err.message : String(err)}; continuing without proxy`, { level: 'warn' });
            }
        }
        // Set up git-bash if relevant
        (0, windowsPaths_js_1.setShellIfWindows)();
        // Register LSP manager cleanup (initialization happens in main.tsx after --plugin-dir is processed)
        (0, cleanupRegistry_js_1.registerCleanup)(manager_js_1.shutdownLspServerManager);
        // gh-32730: teams created by subagents (or main agent without
        // explicit TeamDelete) were left on disk forever. Register cleanup
        // for all teams created this session. Lazy import: swarm code is
        // behind feature gate and most sessions never create teams.
        (0, cleanupRegistry_js_1.registerCleanup)(async () => {
            const { cleanupSessionTeams } = await Promise.resolve().then(() => __importStar(require('../utils/swarm/teamHelpers.js')));
            await cleanupSessionTeams();
        });
        // Initialize scratchpad directory if enabled
        if ((0, filesystem_js_1.isScratchpadEnabled)()) {
            const scratchpadStart = Date.now();
            await (0, filesystem_js_1.ensureScratchpadDir)();
            (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'init_scratchpad_created', {
                duration_ms: Date.now() - scratchpadStart,
            });
        }
        (0, diagLogs_js_1.logForDiagnosticsNoPII)('info', 'init_completed', {
            duration_ms: Date.now() - initStartTime,
        });
        (0, startupProfiler_js_1.profileCheckpoint)('init_function_end');
    }
    catch (error) {
        if (error instanceof errors_js_1.ConfigParseError) {
            // Skip the interactive Ink dialog when we can't safely render it.
            // The dialog breaks JSON consumers (e.g. desktop marketplace plugin
            // manager running `plugin marketplace list --json` in a VM sandbox).
            if ((0, state_js_1.getIsNonInteractiveSession)()) {
                process.stderr.write(`Configuration error in ${error.filePath}: ${error.message}\n`);
                (0, gracefulShutdown_js_1.gracefulShutdownSync)(1);
                return;
            }
            // Show the invalid config dialog with the error object and wait for it to complete
            return Promise.resolve().then(() => __importStar(require('../components/InvalidConfigDialog.js'))).then(m => m.showInvalidConfigDialog({ error }));
            // Dialog itself handles process.exit, so we don't need additional cleanup here
        }
        else {
            // For non-config errors, rethrow them
            throw error;
        }
    }
});
/**
 * Initialize telemetry after trust has been granted.
 * For remote-settings-eligible users, waits for settings to load (non-blocking),
 * then re-applies env vars (to include remote settings) before initializing telemetry.
 * For non-eligible users, initializes telemetry immediately.
 * This should only be called once, after the trust dialog has been accepted.
 */
function initializeTelemetryAfterTrust() {
    if ((0, index_js_2.isEligibleForRemoteManagedSettings)()) {
        // For SDK/headless mode with beta tracing, initialize eagerly first
        // to ensure the tracer is ready before the first query runs.
        // The async path below will still run but doInitializeTelemetry() guards against double init.
        if ((0, state_js_1.getIsNonInteractiveSession)() && (0, betaSessionTracing_js_1.isBetaTracingEnabled)()) {
            void doInitializeTelemetry().catch(error => {
                (0, debug_js_1.logForDebugging)(`[3P telemetry] Eager telemetry init failed (beta tracing): ${(0, errors_js_1.errorMessage)(error)}`, { level: 'error' });
            });
        }
        (0, debug_js_1.logForDebugging)('[3P telemetry] Waiting for remote managed settings before telemetry init');
        void (0, index_js_2.waitForRemoteManagedSettingsToLoad)()
            .then(async () => {
            (0, debug_js_1.logForDebugging)('[3P telemetry] Remote managed settings loaded, initializing telemetry');
            // Re-apply env vars to pick up remote settings before initializing telemetry.
            (0, managedEnv_js_1.applyConfigEnvironmentVariables)();
            await doInitializeTelemetry();
        })
            .catch(error => {
            (0, debug_js_1.logForDebugging)(`[3P telemetry] Telemetry init failed (remote settings path): ${(0, errors_js_1.errorMessage)(error)}`, { level: 'error' });
        });
    }
    else {
        void doInitializeTelemetry().catch(error => {
            (0, debug_js_1.logForDebugging)(`[3P telemetry] Telemetry init failed: ${(0, errors_js_1.errorMessage)(error)}`, { level: 'error' });
        });
    }
}
async function doInitializeTelemetry() {
    if (telemetryInitialized) {
        // Already initialized, nothing to do
        return;
    }
    // Set flag before init to prevent double initialization
    telemetryInitialized = true;
    try {
        await setMeterState();
    }
    catch (error) {
        // Reset flag on failure so subsequent calls can retry
        telemetryInitialized = false;
        throw error;
    }
}
async function setMeterState() {
    // Lazy-load instrumentation to defer ~400KB of OpenTelemetry + protobuf
    const { initializeTelemetry } = await Promise.resolve().then(() => __importStar(require('../utils/telemetry/instrumentation.js')));
    // Initialize customer OTLP telemetry (metrics, logs, traces)
    const meter = await initializeTelemetry();
    if (meter) {
        // Create factory function for attributed counters
        const createAttributedCounter = (name, options) => {
            const counter = meter?.createCounter(name, options);
            return {
                add(value, additionalAttributes = {}) {
                    // Always fetch fresh telemetry attributes to ensure they're up to date
                    const currentAttributes = (0, telemetryAttributes_js_1.getTelemetryAttributes)();
                    const mergedAttributes = {
                        ...currentAttributes,
                        ...additionalAttributes,
                    };
                    counter?.add(value, mergedAttributes);
                },
            };
        };
        (0, state_js_2.setMeter)(meter, createAttributedCounter);
        // Increment session counter here because the startup telemetry path
        // runs before this async initialization completes, so the counter
        // would be null there.
        (0, state_js_2.getSessionCounter)()?.add(1);
    }
}
