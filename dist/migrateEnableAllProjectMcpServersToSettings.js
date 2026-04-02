"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateEnableAllProjectMcpServersToSettings = migrateEnableAllProjectMcpServersToSettings;
const index_js_1 = require("src/services/analytics/index.js");
const config_js_1 = require("../utils/config.js");
const log_js_1 = require("../utils/log.js");
const settings_js_1 = require("../utils/settings/settings.js");
/**
 * Migration: Move MCP server approval fields from project config to local settings
 * This migrates both enableAllProjectMcpServers and enabledMcpjsonServers to the
 * settings system for better management and consistency.
 */
function migrateEnableAllProjectMcpServersToSettings() {
    const projectConfig = (0, config_js_1.getCurrentProjectConfig)();
    // Check if any field exists in project config
    const hasEnableAll = projectConfig.enableAllProjectMcpServers !== undefined;
    const hasEnabledServers = projectConfig.enabledMcpjsonServers &&
        projectConfig.enabledMcpjsonServers.length > 0;
    const hasDisabledServers = projectConfig.disabledMcpjsonServers &&
        projectConfig.disabledMcpjsonServers.length > 0;
    if (!hasEnableAll && !hasEnabledServers && !hasDisabledServers) {
        return;
    }
    try {
        const existingSettings = (0, settings_js_1.getSettingsForSource)('localSettings') || {};
        const updates = {};
        const fieldsToRemove = [];
        // Migrate enableAllProjectMcpServers if it exists and hasn't been migrated
        if (hasEnableAll &&
            existingSettings.enableAllProjectMcpServers === undefined) {
            updates.enableAllProjectMcpServers =
                projectConfig.enableAllProjectMcpServers;
            fieldsToRemove.push('enableAllProjectMcpServers');
        }
        else if (hasEnableAll) {
            // Already migrated, just mark for removal
            fieldsToRemove.push('enableAllProjectMcpServers');
        }
        // Migrate enabledMcpjsonServers if it exists
        if (hasEnabledServers && projectConfig.enabledMcpjsonServers) {
            const existingEnabledServers = existingSettings.enabledMcpjsonServers || [];
            // Merge the servers (avoiding duplicates)
            updates.enabledMcpjsonServers = [
                ...new Set([
                    ...existingEnabledServers,
                    ...projectConfig.enabledMcpjsonServers,
                ]),
            ];
            fieldsToRemove.push('enabledMcpjsonServers');
        }
        // Migrate disabledMcpjsonServers if it exists
        if (hasDisabledServers && projectConfig.disabledMcpjsonServers) {
            const existingDisabledServers = existingSettings.disabledMcpjsonServers || [];
            // Merge the servers (avoiding duplicates)
            updates.disabledMcpjsonServers = [
                ...new Set([
                    ...existingDisabledServers,
                    ...projectConfig.disabledMcpjsonServers,
                ]),
            ];
            fieldsToRemove.push('disabledMcpjsonServers');
        }
        // Update settings if there are any updates
        if (Object.keys(updates).length > 0) {
            (0, settings_js_1.updateSettingsForSource)('localSettings', updates);
        }
        // Remove migrated fields from project config
        if (fieldsToRemove.includes('enableAllProjectMcpServers') ||
            fieldsToRemove.includes('enabledMcpjsonServers') ||
            fieldsToRemove.includes('disabledMcpjsonServers')) {
            (0, config_js_1.saveCurrentProjectConfig)(current => {
                const { enableAllProjectMcpServers: _enableAll, enabledMcpjsonServers: _enabledServers, disabledMcpjsonServers: _disabledServers, ...configWithoutFields } = current;
                return configWithoutFields;
            });
        }
        // Log the migration event
        (0, index_js_1.logEvent)('tengu_migrate_mcp_approval_fields_success', {
            migratedCount: fieldsToRemove.length,
        });
    }
    catch (e) {
        // Log migration failure but don't throw to avoid breaking startup
        (0, log_js_1.logError)(e);
        (0, index_js_1.logEvent)('tengu_migrate_mcp_approval_fields_error', {});
    }
}
