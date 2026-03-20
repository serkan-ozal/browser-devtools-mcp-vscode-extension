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

const CHROMIUM_BROWSER_NAME_SET: ReadonlySet<string> = new Set(CHROMIUM_BROWSERS);

export type PlaywrightBrowserInstallGroup = 'chromium' | 'firefox' | 'webkit';

/** Telemetry + optional config scope so install failures can offer “use system Chrome”. */
export type PlaywrightBrowserInstallCallOptions = BrowserInstallTelemetryContext & {
    configPrefix?: string;
};

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

function namesIncludeChromiumStack(names: string[]): boolean {
    return names.some((n: string) => CHROMIUM_BROWSER_NAME_SET.has(n));
}

async function promptUseSystemChromeAfterDownloadFailure(configPrefix: string, errorDetail: string): Promise<void> {
    const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(configPrefix);
    if (config.get<boolean>('browser.useSystemBrowser', false)) {
        return;
    }
    if (config.get<string>('platform', 'browser') !== 'browser') {
        return;
    }
    const detail: string = errorDetail.length > 800 ? `${errorDetail.slice(0, 797)}...` : errorDetail;
    const choice: 'Use Google Chrome' | 'Not now' | undefined = await vscode.window.showWarningMessage(
        'Browser DevTools MCP: Playwright browser download failed. Switch to installed Google Chrome for automation? (Google Chrome must be installed on this machine.)',
        { modal: false, detail },
        'Use Google Chrome',
        'Not now'
    );
    if (choice !== 'Use Google Chrome') {
        return;
    }
    await config.update('browser.useSystemBrowser', true, vscode.ConfigurationTarget.Global);
    void vscode.window.showInformationMessage(
        'Browser DevTools MCP: Using installed Google Chrome. Restart the MCP session or run "Browser DevTools MCP: Restart Server" to apply.'
    );
}

export type RunPlaywrightBrowserInstallOptions = {
    telemetry?: BrowserInstallTelemetryContext;
    /** When set, a failed Chromium download may prompt to enable `browser.useSystemBrowser`. */
    configPrefix?: string;
};

/**
 * Download the given Playwright browser binaries into the default cache.
 * Does not read settings (no platform / system-browser skip).
 * @returns whether the install completed without error
 */
export async function runPlaywrightBrowserInstall(
    extensionPath: string,
    names: string[],
    opts?: RunPlaywrightBrowserInstallOptions
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
        if (opts?.telemetry) {
            void trackCursorExtBrowserInstallFailed(
                opts.telemetry.extensionVersion,
                opts.telemetry.trigger,
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
        if (opts?.telemetry) {
            void trackCursorExtBrowserInstallFailed(opts.telemetry.extensionVersion, opts.telemetry.trigger, msg);
        }
        return false;
    }

    let ok: boolean = false;
    let downloadExecutionFailed: boolean = false;
    let installErrorMessage: string = '';
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
                installErrorMessage = msg;
                downloadExecutionFailed = true;
                console.error('[Browser DevTools MCP] Playwright browser install failed:', msg);
                if (opts?.telemetry) {
                    void trackCursorExtBrowserInstallFailed(
                        opts.telemetry.extensionVersion,
                        opts.telemetry.trigger,
                        msg
                    );
                }
            } finally {
                if (hadSkip !== undefined) {
                    process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = hadSkip;
                }
            }
            progress.report({ message: 'Playwright browser step finished.' });
        }
    );
    if (!ok && downloadExecutionFailed && installErrorMessage) {
        if (opts?.configPrefix && namesIncludeChromiumStack(names)) {
            await promptUseSystemChromeAfterDownloadFailure(opts.configPrefix, installErrorMessage);
        } else {
            void vscode.window.showWarningMessage(
                `Browser DevTools MCP: Playwright browser install failed. ${installErrorMessage} Try again or check your network / disk space / proxy.`
            );
        }
    }
    if (ok && opts?.telemetry) {
        void trackCursorExtBrowserInstalled(opts.telemetry.extensionVersion, opts.telemetry.trigger, names.join(','));
    }
    return ok;
}

/**
 * Install browsers for the selected groups (used by the "Install Playwright Browsers" command).
 */
export async function installPlaywrightBrowsersByGroups(
    extensionPath: string,
    groups: PlaywrightBrowserInstallGroup[],
    options?: PlaywrightBrowserInstallCallOptions
): Promise<boolean> {
    const names: string[] = browserNamesForGroups(groups);
    return runPlaywrightBrowserInstall(extensionPath, names, {
        telemetry:
            options !== undefined
                ? { extensionVersion: options.extensionVersion, trigger: options.trigger }
                : undefined,
        configPrefix: options?.configPrefix,
    });
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

    const names: string[] = collectBrowserNames(config);
    await runPlaywrightBrowserInstall(extensionPath, names, {
        telemetry,
        configPrefix,
    });
}
