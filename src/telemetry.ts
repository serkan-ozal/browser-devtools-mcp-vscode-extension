/**
 * Telemetry for Browser DevTools MCP VS Code extension.
 * - cursor_ext_installed: from extension activate (first install)
 * - cursor_ext_uninstalled: from extension deactivate when .obsolete indicates uninstall
 * Uses ~/.browser-devtools-mcp/config.json for anonymousId (same as browser-devtools-mcp).
 * Opt-out: TELEMETRY_ENABLE=false or config.telemetryEnabled.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as https from 'node:https';
import * as os from 'node:os';
import * as path from 'node:path';

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY || 'phc_ekFEnQ9ipk0F1BbO0KCkaD8OaYPa4bIqqUoxsCfeFsy';
const POSTHOG_HOST = 'us.i.posthog.com';
const POSTHOG_PATH = '/i/v0/e/';

const CONFIG_DIR = path.join(os.homedir(), '.browser-devtools-mcp');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

interface Config {
    anonymousId?: string;
    telemetryEnabled?: boolean;
    telemetryNoticeShown?: boolean;
}

function readOrCreateConfig(): Config {
    try {
        let existing: Config = {};
        if (fs.existsSync(CONFIG_FILE)) {
            try {
                existing = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as Config;
            } catch {
                /* corrupt */
            }
        }
        let dirty = false;
        if (!existing.anonymousId) {
            existing.anonymousId = crypto.randomUUID();
            dirty = true;
        }
        if (existing.telemetryEnabled === undefined) {
            existing.telemetryEnabled = true;
            dirty = true;
        }
        if (existing.telemetryNoticeShown === undefined) {
            existing.telemetryNoticeShown = false;
            dirty = true;
        }
        if (dirty) {
            try {
                if (!fs.existsSync(CONFIG_DIR)) {
                    fs.mkdirSync(CONFIG_DIR, { recursive: true });
                }
                fs.writeFileSync(
                    CONFIG_FILE,
                    JSON.stringify(
                        {
                            anonymousId: existing.anonymousId,
                            telemetryEnabled: existing.telemetryEnabled,
                            telemetryNoticeShown: existing.telemetryNoticeShown,
                        },
                        null,
                        2
                    ),
                    'utf8'
                );
            } catch {
                /* non-fatal */
            }
        }
        return existing;
    } catch {
        return { anonymousId: '', telemetryEnabled: false, telemetryNoticeShown: false };
    }
}

export function isTelemetryEnabled(): boolean {
    try {
        if (process.env.TELEMETRY_ENABLE === 'false') {
            return false;
        }
        return readOrCreateConfig().telemetryEnabled === true;
    } catch {
        return false;
    }
}

/**
 * Write telemetryEnabled to ~/.browser-devtools-mcp/config.json. Used by the extension to sync the telemetry.enable setting.
 */
export function writeTelemetryEnabledToConfig(enabled: boolean): void {
    try {
        const config = readOrCreateConfig();
        config.telemetryEnabled = enabled;
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
        }
        fs.writeFileSync(
            CONFIG_FILE,
            JSON.stringify(
                {
                    anonymousId: config.anonymousId,
                    telemetryEnabled: config.telemetryEnabled,
                    telemetryNoticeShown: config.telemetryNoticeShown,
                },
                null,
                2
            ),
            'utf8'
        );
    } catch (err) {
        console.error('[Browser DevTools MCP] Failed to write telemetry enabled to config:', err);
    }
}

function captureEvent(event: string, distinctId: string, properties: Record<string, unknown>): Promise<void> {
    return new Promise((resolve) => {
        try {
            const body = JSON.stringify({
                api_key: POSTHOG_API_KEY,
                event,
                distinct_id: distinctId,
                properties,
            });
            const req = https.request(
                {
                    hostname: POSTHOG_HOST,
                    path: POSTHOG_PATH,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
                },
                (res) => {
                    res.on('data', () => {});
                    res.on('end', () => resolve());
                    res.on('close', () => resolve());
                }
            );
            req.on('error', () => resolve());
            req.write(body);
            req.end();
        } catch {
            resolve();
        }
    });
}

function buildBaseProperties(extensionVersion: string): Record<string, unknown> {
    return {
        source: 'cursor-ext',
        extension_version: extensionVersion,
        node_version: process.version,
        os_platform: process.platform,
        os_arch: process.arch,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timestamp: new Date().toISOString(),
    };
}

export async function trackCursorExtInstalled(extensionVersion: string): Promise<void> {
    if (!isTelemetryEnabled()) {
        return;
    }
    const config = readOrCreateConfig();
    if (!config.anonymousId) {
        return;
    }
    await captureEvent('cursor_ext_installed', config.anonymousId, buildBaseProperties(extensionVersion));
}

export async function trackCursorExtInstallFailed(extensionVersion: string, errorMessage: string): Promise<void> {
    if (!isTelemetryEnabled()) {
        return;
    }
    const config = readOrCreateConfig();
    if (!config.anonymousId) {
        return;
    }
    await captureEvent('cursor_ext_install_failed', config.anonymousId, {
        ...buildBaseProperties(extensionVersion),
        error_message: errorMessage,
    });
}

export async function trackCursorExtMcpInstalled(extensionVersion: string, mcpVersion: string): Promise<void> {
    if (!isTelemetryEnabled()) {
        return;
    }
    const config = readOrCreateConfig();
    if (!config.anonymousId) {
        return;
    }
    await captureEvent('cursor_ext_mcp_installed', config.anonymousId, {
        ...buildBaseProperties(extensionVersion),
        mcp_version: mcpVersion,
    });
}

export async function trackCursorExtMcpInstallFailed(
    extensionVersion: string,
    mcpVersion: string,
    errorMessage: string
): Promise<void> {
    if (!isTelemetryEnabled()) {
        return;
    }
    const config = readOrCreateConfig();
    if (!config.anonymousId) {
        return;
    }
    await captureEvent('cursor_ext_mcp_install_failed', config.anonymousId, {
        ...buildBaseProperties(extensionVersion),
        mcp_version: mcpVersion,
        error_message: errorMessage,
    });
}

/**
 * Send cursor_ext_uninstalled. Await in deactivate when .obsolete indicates uninstall so request completes before process exits.
 */
export async function trackCursorExtUninstalled(): Promise<void> {
    if (!isTelemetryEnabled()) {
        return;
    }
    let config: Config;
    try {
        if (!fs.existsSync(CONFIG_FILE)) {
            return;
        }
        config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as Config;
    } catch {
        return;
    }
    if (!config.anonymousId || config.telemetryEnabled === false) {
        return;
    }
    const properties = {
        source: 'cursor-ext',
        node_version: process.version,
        os_platform: process.platform,
        os_arch: process.arch,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timestamp: new Date().toISOString(),
    };
    await captureEvent('cursor_ext_uninstalled', config.anonymousId, properties);
}

/**
 * Send cursor_ext_uninstall_failed when extension uninstall path fails (e.g. rule remove or trackCursorExtUninstalled).
 */
export async function trackCursorExtUninstallFailed(extensionVersion: string, errorMessage: string): Promise<void> {
    if (!isTelemetryEnabled()) {
        return;
    }
    const config = readOrCreateConfig();
    if (!config.anonymousId) {
        return;
    }
    await captureEvent('cursor_ext_uninstall_failed', config.anonymousId, {
        ...buildBaseProperties(extensionVersion),
        error_message: errorMessage,
    });
}
