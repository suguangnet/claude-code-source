"use strict";
// This file represents useful wrappers over node:child_process
// These wrappers ease error handling and cross-platform compatbility
// By using execa, Windows automatically gets shell escaping + BAT / CMD handling
Object.defineProperty(exports, "__esModule", { value: true });
exports.execSyncWithDefaults_DEPRECATED = void 0;
exports.execFileNoThrow = execFileNoThrow;
exports.execFileNoThrowWithCwd = execFileNoThrowWithCwd;
const execa_1 = require("execa");
const cwd_js_1 = require("../utils/cwd.js");
const log_js_1 = require("./log.js");
var execFileNoThrowPortable_js_1 = require("./execFileNoThrowPortable.js");
Object.defineProperty(exports, "execSyncWithDefaults_DEPRECATED", { enumerable: true, get: function () { return execFileNoThrowPortable_js_1.execSyncWithDefaults_DEPRECATED; } });
const MS_IN_SECOND = 1000;
const SECONDS_IN_MINUTE = 60;
function execFileNoThrow(file, args, options = {
    timeout: 10 * SECONDS_IN_MINUTE * MS_IN_SECOND,
    preserveOutputOnError: true,
    useCwd: true,
}) {
    return execFileNoThrowWithCwd(file, args, {
        abortSignal: options.abortSignal,
        timeout: options.timeout,
        preserveOutputOnError: options.preserveOutputOnError,
        cwd: options.useCwd ? (0, cwd_js_1.getCwd)() : undefined,
        env: options.env,
        stdin: options.stdin,
        input: options.input,
    });
}
/**
 * Extracts a human-readable error message from an execa result.
 *
 * Priority order:
 * 1. shortMessage - execa's human-readable error (e.g., "Command failed with exit code 1: ...")
 *    This is preferred because it already includes signal info when a process is killed,
 *    making it more informative than just the signal name.
 * 2. signal - the signal that killed the process (e.g., "SIGTERM")
 * 3. errorCode - fallback to just the numeric exit code
 */
function getErrorMessage(result, errorCode) {
    if (result.shortMessage) {
        return result.shortMessage;
    }
    if (typeof result.signal === 'string') {
        return result.signal;
    }
    return String(errorCode);
}
/**
 * execFile, but always resolves (never throws)
 */
function execFileNoThrowWithCwd(file, args, { abortSignal, timeout: finalTimeout = 10 * SECONDS_IN_MINUTE * MS_IN_SECOND, preserveOutputOnError: finalPreserveOutput = true, cwd: finalCwd, env: finalEnv, maxBuffer, shell, stdin: finalStdin, input: finalInput, } = {
    timeout: 10 * SECONDS_IN_MINUTE * MS_IN_SECOND,
    preserveOutputOnError: true,
    maxBuffer: 1000000,
}) {
    return new Promise(resolve => {
        // Use execa for cross-platform .bat/.cmd compatibility on Windows
        (0, execa_1.execa)(file, args, {
            maxBuffer,
            signal: abortSignal,
            timeout: finalTimeout,
            cwd: finalCwd,
            env: finalEnv,
            shell,
            stdin: finalStdin,
            input: finalInput,
            reject: false, // Don't throw on non-zero exit codes
        })
            .then(result => {
            if (result.failed) {
                if (finalPreserveOutput) {
                    const errorCode = result.exitCode ?? 1;
                    void resolve({
                        stdout: result.stdout || '',
                        stderr: result.stderr || '',
                        code: errorCode,
                        error: getErrorMessage(result, errorCode),
                    });
                }
                else {
                    void resolve({ stdout: '', stderr: '', code: result.exitCode ?? 1 });
                }
            }
            else {
                void resolve({
                    stdout: result.stdout,
                    stderr: result.stderr,
                    code: 0,
                });
            }
        })
            .catch((error) => {
            (0, log_js_1.logError)(error);
            void resolve({ stdout: '', stderr: '', code: 1 });
        });
    });
}
