"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDiagnosticsForAttachment = formatDiagnosticsForAttachment;
exports.registerLSPNotificationHandlers = registerLSPNotificationHandlers;
const url_1 = require("url");
const debug_js_1 = require("../../utils/debug.js");
const errors_js_1 = require("../../utils/errors.js");
const log_js_1 = require("../../utils/log.js");
const slowOperations_js_1 = require("../../utils/slowOperations.js");
const LSPDiagnosticRegistry_js_1 = require("./LSPDiagnosticRegistry.js");
/**
 * Map LSP severity to Claude diagnostic severity
 *
 * Maps LSP severity numbers to Claude diagnostic severity strings.
 * Accepts numeric severity values (1=Error, 2=Warning, 3=Information, 4=Hint)
 * or undefined, defaulting to 'Error' for invalid/missing values.
 */
function mapLSPSeverity(lspSeverity) {
    // LSP DiagnosticSeverity enum:
    // 1 = Error, 2 = Warning, 3 = Information, 4 = Hint
    switch (lspSeverity) {
        case 1:
            return 'Error';
        case 2:
            return 'Warning';
        case 3:
            return 'Info';
        case 4:
            return 'Hint';
        default:
            return 'Error';
    }
}
/**
 * Convert LSP diagnostics to Claude diagnostic format
 *
 * Converts LSP PublishDiagnosticsParams to DiagnosticFile[] format
 * used by Claude's attachment system.
 */
function formatDiagnosticsForAttachment(params) {
    // Parse URI (may be file:// or plain path) and normalize to file system path
    let uri;
    try {
        // Handle both file:// URIs and plain paths
        uri = params.uri.startsWith('file://')
            ? (0, url_1.fileURLToPath)(params.uri)
            : params.uri;
    }
    catch (error) {
        const err = (0, errors_js_1.toError)(error);
        (0, log_js_1.logError)(err);
        (0, debug_js_1.logForDebugging)(`Failed to convert URI to file path: ${params.uri}. Error: ${err.message}. Using original URI as fallback.`);
        // Gracefully fallback to original URI - LSP servers may send malformed URIs
        uri = params.uri;
    }
    const diagnostics = params.diagnostics.map((diag) => ({
        message: diag.message,
        severity: mapLSPSeverity(diag.severity),
        range: {
            start: {
                line: diag.range.start.line,
                character: diag.range.start.character,
            },
            end: {
                line: diag.range.end.line,
                character: diag.range.end.character,
            },
        },
        source: diag.source,
        code: diag.code !== undefined && diag.code !== null
            ? String(diag.code)
            : undefined,
    }));
    return [
        {
            uri,
            diagnostics,
        },
    ];
}
/**
 * Register LSP notification handlers on all servers
 *
 * Sets up handlers to listen for textDocument/publishDiagnostics notifications
 * from all LSP servers and routes them to Claude's diagnostic system.
 * Uses public getAllServers() API for clean access to server instances.
 *
 * @returns Tracking data for registration status and runtime failures
 */
function registerLSPNotificationHandlers(manager) {
    // Register handlers on all configured servers to capture diagnostics from any language
    const servers = manager.getAllServers();
    // Track partial failures - allow successful server registrations even if some fail
    const registrationErrors = [];
    let successCount = 0;
    // Track consecutive failures per server to warn users after 3+ failures
    const diagnosticFailures = new Map();
    for (const [serverName, serverInstance] of servers.entries()) {
        try {
            // Validate server instance has onNotification method
            if (!serverInstance ||
                typeof serverInstance.onNotification !== 'function') {
                const errorMsg = !serverInstance
                    ? 'Server instance is null/undefined'
                    : 'Server instance has no onNotification method';
                registrationErrors.push({ serverName, error: errorMsg });
                const err = new Error(`${errorMsg} for ${serverName}`);
                (0, log_js_1.logError)(err);
                (0, debug_js_1.logForDebugging)(`Skipping handler registration for ${serverName}: ${errorMsg}`);
                continue; // Skip this server but track the failure
            }
            // Errors are isolated to avoid breaking other servers
            serverInstance.onNotification('textDocument/publishDiagnostics', (params) => {
                (0, debug_js_1.logForDebugging)(`[PASSIVE DIAGNOSTICS] Handler invoked for ${serverName}! Params type: ${typeof params}`);
                try {
                    // Validate params structure before casting
                    if (!params ||
                        typeof params !== 'object' ||
                        !('uri' in params) ||
                        !('diagnostics' in params)) {
                        const err = new Error(`LSP server ${serverName} sent invalid diagnostic params (missing uri or diagnostics)`);
                        (0, log_js_1.logError)(err);
                        (0, debug_js_1.logForDebugging)(`Invalid diagnostic params from ${serverName}: ${(0, slowOperations_js_1.jsonStringify)(params)}`);
                        return;
                    }
                    const diagnosticParams = params;
                    (0, debug_js_1.logForDebugging)(`Received diagnostics from ${serverName}: ${diagnosticParams.diagnostics.length} diagnostic(s) for ${diagnosticParams.uri}`);
                    // Convert LSP diagnostics to Claude format (can throw on invalid URIs)
                    const diagnosticFiles = formatDiagnosticsForAttachment(diagnosticParams);
                    // Only send notification if there are diagnostics
                    const firstFile = diagnosticFiles[0];
                    if (!firstFile ||
                        diagnosticFiles.length === 0 ||
                        firstFile.diagnostics.length === 0) {
                        (0, debug_js_1.logForDebugging)(`Skipping empty diagnostics from ${serverName} for ${diagnosticParams.uri}`);
                        return;
                    }
                    // Register diagnostics for async delivery via attachment system
                    // Follows same pattern as AsyncHookRegistry for consistent async attachment delivery
                    try {
                        (0, LSPDiagnosticRegistry_js_1.registerPendingLSPDiagnostic)({
                            serverName,
                            files: diagnosticFiles,
                        });
                        (0, debug_js_1.logForDebugging)(`LSP Diagnostics: Registered ${diagnosticFiles.length} diagnostic file(s) from ${serverName} for async delivery`);
                        // Success - reset failure counter for this server
                        diagnosticFailures.delete(serverName);
                    }
                    catch (error) {
                        const err = (0, errors_js_1.toError)(error);
                        (0, log_js_1.logError)(err);
                        (0, debug_js_1.logForDebugging)(`Error registering LSP diagnostics from ${serverName}: ` +
                            `URI: ${diagnosticParams.uri}, ` +
                            `Diagnostic count: ${firstFile.diagnostics.length}, ` +
                            `Error: ${err.message}`);
                        // Track consecutive failures and warn after 3+
                        const failures = diagnosticFailures.get(serverName) || {
                            count: 0,
                            lastError: '',
                        };
                        failures.count++;
                        failures.lastError = err.message;
                        diagnosticFailures.set(serverName, failures);
                        if (failures.count >= 3) {
                            (0, debug_js_1.logForDebugging)(`WARNING: LSP diagnostic handler for ${serverName} has failed ${failures.count} times consecutively. ` +
                                `Last error: ${failures.lastError}. ` +
                                `This may indicate a problem with the LSP server or diagnostic processing. ` +
                                `Check logs for details.`);
                        }
                    }
                }
                catch (error) {
                    // Catch any unexpected errors from the entire handler to prevent breaking the notification loop
                    const err = (0, errors_js_1.toError)(error);
                    (0, log_js_1.logError)(err);
                    (0, debug_js_1.logForDebugging)(`Unexpected error processing diagnostics from ${serverName}: ${err.message}`);
                    // Track consecutive failures and warn after 3+
                    const failures = diagnosticFailures.get(serverName) || {
                        count: 0,
                        lastError: '',
                    };
                    failures.count++;
                    failures.lastError = err.message;
                    diagnosticFailures.set(serverName, failures);
                    if (failures.count >= 3) {
                        (0, debug_js_1.logForDebugging)(`WARNING: LSP diagnostic handler for ${serverName} has failed ${failures.count} times consecutively. ` +
                            `Last error: ${failures.lastError}. ` +
                            `This may indicate a problem with the LSP server or diagnostic processing. ` +
                            `Check logs for details.`);
                    }
                    // Don't re-throw - isolate errors to this server only
                }
            });
            (0, debug_js_1.logForDebugging)(`Registered diagnostics handler for ${serverName}`);
            successCount++;
        }
        catch (error) {
            const err = (0, errors_js_1.toError)(error);
            registrationErrors.push({
                serverName,
                error: err.message,
            });
            (0, log_js_1.logError)(err);
            (0, debug_js_1.logForDebugging)(`Failed to register diagnostics handler for ${serverName}: ` +
                `Error: ${err.message}`);
        }
    }
    // Report overall registration status
    const totalServers = servers.size;
    if (registrationErrors.length > 0) {
        const failedServers = registrationErrors
            .map(e => `${e.serverName} (${e.error})`)
            .join(', ');
        // Log aggregate failures for tracking
        (0, log_js_1.logError)(new Error(`Failed to register diagnostics for ${registrationErrors.length} LSP server(s): ${failedServers}`));
        (0, debug_js_1.logForDebugging)(`LSP notification handler registration: ${successCount}/${totalServers} succeeded. ` +
            `Failed servers: ${failedServers}. ` +
            `Diagnostics from failed servers will not be delivered.`);
    }
    else {
        (0, debug_js_1.logForDebugging)(`LSP notification handlers registered successfully for all ${totalServers} server(s)`);
    }
    // Return tracking data for monitoring and testing
    return {
        totalServers,
        successCount,
        registrationErrors,
        diagnosticFailures,
    };
}
