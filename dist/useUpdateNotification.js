"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSemverPart = getSemverPart;
exports.shouldShowUpdateNotification = shouldShowUpdateNotification;
exports.useUpdateNotification = useUpdateNotification;
const react_1 = require("react");
const semver_1 = require("semver");
function getSemverPart(version) {
    return `${(0, semver_1.major)(version, { loose: true })}.${(0, semver_1.minor)(version, { loose: true })}.${(0, semver_1.patch)(version, { loose: true })}`;
}
function shouldShowUpdateNotification(updatedVersion, lastNotifiedSemver) {
    const updatedSemver = getSemverPart(updatedVersion);
    return updatedSemver !== lastNotifiedSemver;
}
function useUpdateNotification(updatedVersion, initialVersion = MACRO.VERSION) {
    const [lastNotifiedSemver, setLastNotifiedSemver] = (0, react_1.useState)(() => getSemverPart(initialVersion));
    if (!updatedVersion) {
        return null;
    }
    const updatedSemver = getSemverPart(updatedVersion);
    if (updatedSemver !== lastNotifiedSemver) {
        setLastNotifiedSemver(updatedSemver);
        return updatedSemver;
    }
    return null;
}
