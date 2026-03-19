import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
    trackCursorExtBrowserInstallFailed,
    trackCursorExtBrowserInstalled,
    type BrowserInstallTelemetryContext,
} from './telemetry';

const nodeRequire = createRequire(__filename);

/** Same groups as browser-devtools-mcp postinstall.cjs */
const CHROMIUM_BROWSERS = ['chromium', 'chromium-headless-shell', 'ffmpeg'] as const;
const FIREFOX_BROWSERS = ['firefox'] as const;
const WEBKIT_BROWSERS = ['webkit'] as const;

export type PlaywrightBrowserInstallGroup = 'chromium' | 'firefox' | 'webkit';

/**
 * Map high-level groups to Playwright registry names passed to installBrowsersForNpmInstall.
 */
export function browserNamesForGroups(groups: PlaywrightBrowserInstallGroup[]): string[] {
    const names: string[] = [];
    const set = new Set(groups);
    if (set.has('chromium')) {
        names.push(...CHROMIUM_BROWSERS);
    }
    if (set.has('firefox')) {
        names.push(...FIREFOX_BROWSERS);
    }
    if (set.has('webkit')) {
        names.push(...WEBKIT_BROWSERS);
    }
    return names;
}

function collectBrowserNames(config: vscode.WorkspaceConfiguration): string[] {
    const groups: PlaywrightBrowserInstallGroup[] = [];
    if (config.get<boolean>('install.chromium', true)) {
        groups.push('chromium');
    }
    if (config.get<boolean>('install.firefox', false)) {
        groups.push('firefox');
    }
    if (config.get<boolean>('install.webkit', false)) {
        groups.push('webkit');
    }
    return browserNamesForGroups(groups);
}

/**
 * Download the given Playwright browser binaries into the default cache.
 * Does not read settings (no platform / system-browser skip).
 * @returns whether the install completed without error
 */
export async function runPlaywrightBrowserInstall(
    extensionPath: string,
    names: string[],
    telemetry?: BrowserInstallTelemetryContext
): Promise<boolean> {
    if (names.length === 0) {
        return true;
    }

    const serverEntry = path.join(extensionPath, 'node_modules', 'playwright-core', 'lib', 'server', 'index.js');
    if (!fs.existsSync(serverEntry)) {
        console.warn('[Browser DevTools MCP] playwright-core not found under extension; skip browser install');
        void vscode.window.showErrorMessage(
            'Browser DevTools MCP: playwright-core not found in the extension. Reinstall the extension.'
        );
        if (telemetry) {
            void trackCursorExtBrowserInstallFailed(
                telemetry.extensionVersion,
                telemetry.trigger,
                'playwright-core not found under extension'
            );
        }
        return false;
    }

    type InstallFn = (browsers: string[]) => Promise<boolean | void>;
    let installBrowsersForNpmInstall: InstallFn;
    try {
        const mod = nodeRequire(serverEntry) as { installBrowsersForNpmInstall: InstallFn };
        installBrowsersForNpmInstall = mod.installBrowsersForNpmInstall;
    } catch (e) {
        console.warn('[Browser DevTools MCP] Failed to load playwright-core server:', e);
        const msg = e instanceof Error ? e.message : String(e);
        void vscode.window.showErrorMessage(`Browser DevTools MCP: Could not load Playwright installer: ${msg}`);
        if (telemetry) {
            void trackCursorExtBrowserInstallFailed(telemetry.extensionVersion, telemetry.trigger, msg);
        }
        return false;
    }

    let ok = false;
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Browser DevTools MCP',
            cancellable: false,
        },
        async (progress) => {
            progress.report({ message: `Installing Playwright browsers (${names.join(', ')})…` });
            const hadSkip = process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD;
            if (hadSkip !== undefined) {
                delete process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD;
            }
            try {
                await installBrowsersForNpmInstall(names);
                ok = true;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error('[Browser DevTools MCP] Playwright browser install failed:', msg);
                void vscode.window.showWarningMessage(
                    `Browser DevTools MCP: Playwright browser install failed. ${msg} Try again or check your network / disk space.`
                );
                if (telemetry) {
                    void trackCursorExtBrowserInstallFailed(telemetry.extensionVersion, telemetry.trigger, msg);
                }
            } finally {
                if (hadSkip !== undefined) {
                    process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = hadSkip;
                }
            }
            progress.report({ message: 'Playwright browser step finished.' });
        }
    );
    if (ok && telemetry) {
        void trackCursorExtBrowserInstalled(telemetry.extensionVersion, telemetry.trigger, names.join(','));
    }
    return ok;
}

/**
 * Install browsers for the selected groups (used by the "Install Playwright Browsers" command).
 */
export async function installPlaywrightBrowsersByGroups(
    extensionPath: string,
    groups: PlaywrightBrowserInstallGroup[],
    telemetry?: BrowserInstallTelemetryContext
): Promise<boolean> {
    const names = browserNamesForGroups(groups);
    return runPlaywrightBrowserInstall(extensionPath, names, telemetry);
}

/**
 * Download Playwright browser binaries into the default cache (e.g. ~/Library/Caches/ms-playwright).
 * Uses playwright-core's registry (same as `npx playwright install` / npm postinstall).
 * Skipped when using system browser or when platform is not `browser`.
 */
export async function ensurePlaywrightBrowsersInstalled(
    extensionPath: string,
    configPrefix: string,
    telemetry?: BrowserInstallTelemetryContext
): Promise<void> {
    const config = vscode.workspace.getConfiguration(configPrefix);

    if (config.get<boolean>('browser.useSystemBrowser', false)) {
        return;
    }
    if (config.get<string>('platform', 'browser') !== 'browser') {
        return;
    }

    const names = collectBrowserNames(config);
    await runPlaywrightBrowserInstall(extensionPath, names, telemetry);
}
