"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findPowerShell = findPowerShell;
exports.getCachedPowerShellPath = getCachedPowerShellPath;
exports.getPowerShellEdition = getPowerShellEdition;
exports.resetPowerShellCache = resetPowerShellCache;
const promises_1 = require("fs/promises");
const platform_js_1 = require("../platform.js");
const which_js_1 = require("../which.js");
async function probePath(p) {
    try {
        return (await (0, promises_1.stat)(p)).isFile() ? p : null;
    }
    catch {
        return null;
    }
}
/**
 * Attempts to find PowerShell on the system via PATH.
 * Prefers pwsh (PowerShell Core 7+), falls back to powershell (5.1).
 *
 * On Linux, if PATH resolves to a snap launcher (/snap/…) — directly or
 * via a symlink chain like /usr/bin/pwsh → /snap/bin/pwsh — probe known
 * apt/rpm install locations instead: the snap launcher can hang in
 * subprocesses while snapd initializes confinement, but the underlying
 * binary at /opt/microsoft/powershell/7/pwsh is reliable. On
 * Windows/macOS, PATH is sufficient.
 */
async function findPowerShell() {
    const pwshPath = await (0, which_js_1.which)('pwsh');
    if (pwshPath) {
        // Snap launcher hangs in subprocesses. Prefer the direct binary.
        // Check both the resolved PATH entry and its symlink target: on
        // some distros /usr/bin/pwsh is a symlink to /snap/bin/pwsh, which
        // would bypass a naive startsWith('/snap/') on the which() result.
        if ((0, platform_js_1.getPlatform)() === 'linux') {
            const resolved = await (0, promises_1.realpath)(pwshPath).catch(() => pwshPath);
            if (pwshPath.startsWith('/snap/') || resolved.startsWith('/snap/')) {
                const direct = (await probePath('/opt/microsoft/powershell/7/pwsh')) ??
                    (await probePath('/usr/bin/pwsh'));
                if (direct) {
                    const directResolved = await (0, promises_1.realpath)(direct).catch(() => direct);
                    if (!direct.startsWith('/snap/') &&
                        !directResolved.startsWith('/snap/')) {
                        return direct;
                    }
                }
            }
        }
        return pwshPath;
    }
    const powershellPath = await (0, which_js_1.which)('powershell');
    if (powershellPath) {
        return powershellPath;
    }
    return null;
}
let cachedPowerShellPath = null;
/**
 * Gets the cached PowerShell path. Returns a memoized promise that
 * resolves to the PowerShell executable path or null.
 */
function getCachedPowerShellPath() {
    if (!cachedPowerShellPath) {
        cachedPowerShellPath = findPowerShell();
    }
    return cachedPowerShellPath;
}
/**
 * Infers the PowerShell edition from the binary name without spawning.
 * - `pwsh` / `pwsh.exe` → 'core' (PowerShell 7+: supports `&&`, `||`, `?:`, `??`)
 * - `powershell` / `powershell.exe` → 'desktop' (Windows PowerShell 5.1:
 *   no pipeline chain operators, stderr-sets-$? bug, UTF-16 default encoding)
 *
 * PowerShell 6 (also `pwsh`, no `&&`) has been EOL since 2020 and is not
 * a realistic install target, so 'core' safely implies 7+ semantics.
 *
 * Used by the tool prompt to give version-appropriate syntax guidance so
 * the model doesn't emit `cmd1 && cmd2` on 5.1 (parser error) or avoid
 * `&&` on 7+ where it's the correct short-circuiting operator.
 */
async function getPowerShellEdition() {
    const p = await getCachedPowerShellPath();
    if (!p)
        return null;
    // basename without extension, case-insensitive. Covers:
    //   C:\Program Files\PowerShell\7\pwsh.exe
    //   /opt/microsoft/powershell/7/pwsh
    //   C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe
    const base = p
        .split(/[/\\]/)
        .pop()
        .toLowerCase()
        .replace(/\.exe$/, '');
    return base === 'pwsh' ? 'core' : 'desktop';
}
/**
 * Resets the cached PowerShell path. Only for testing.
 */
function resetPowerShellCache() {
    cachedPowerShellPath = null;
}
