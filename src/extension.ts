import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import which from 'which';
import { SettingsWebviewProvider } from './settingsWebview';
import {
    trackCursorExtInstallFailed,
    trackCursorExtInstalled,
    trackCursorExtMcpInstallFailed,
    trackCursorExtMcpInstalled,
    trackCursorExtUninstallFailed,
    trackCursorExtUninstalled,
    writeTelemetryEnabledToConfig,
} from './telemetry';

// Configuration key prefix
const CONFIG_PREFIX = 'browserDevtoolsMcp';

// GitHub repo for issue reporting when install fails
const GITHUB_ISSUES_BASE = 'https://github.com/serkan-ozal/browser-devtools-mcp-vscode-extension/issues/new';

// MCP server installed at runtime (like Playwright browsers); avoids bundling sharp for all platforms
const MCP_SERVER_INSTALL_DIR = 'mcp-server';
const MCP_SERVER_EXTENSION_VERSION_MARKER = '.extension-version';
const MCP_INSTALL_LOCK_FILE = '.mcp-install.lock';
const DEFAULT_MCP_SERVER_VERSION = 'latest';
/** If lock file is older than this, a waiter may remove it (stale lock). */
const MCP_INSTALL_LOCK_STALE_MS = 5 * 60 * 1000;
/** How long waiters poll for installer to finish. */
const MCP_INSTALL_WAITER_TIMEOUT_MS = 5 * 60 * 1000;
const MCP_INSTALL_POLL_INTERVAL_MS = 1500;

/** File under globalStorage to track extension version for first-run / upgrade; only one activate runs onInstall. */
const EXTENSION_VERSION_FILE = '.extension-version';

/** Cursor rule file copied to ~/.cursor/rules/ on install and removed on uninstall. */
const CURSOR_RULE_FILE_NAME = 'browser-devtools-use.mdc';
/** How long to show "Cursor rule installed" in the status bar after onInstall. */
const CURSOR_RULE_STATUS_DURATION_MS = 5000;

/** MCP server name used for Cursor register/unregister and VS Code provider definition. */
const MCP_SERVER_NAME = 'browser-devtools';
/** CLI arg added when we start the MCP server so we can identify our processes for kill (avoids killing extension host). */
const CURSOR_MCP_SERVER_ARG = '--cursor-mcp-server';

let cachedMcpServerPath: string | null = null;

/** Set in activate; deactivate receives no context so we keep these for .obsolete check and runUninstallIfNeeded. */
let extensionPathForDeactivate: string | null = null;
let globalStoragePathForDeactivate: string | null = null;
let extensionVersionForDeactivate: string = '';

// Map VS Code settings to environment variables
const SETTINGS_TO_ENV: Record<string, string> = {
    'browser.headless': 'BROWSER_HEADLESS_ENABLE',
    'browser.persistent': 'BROWSER_PERSISTENT_ENABLE',
    'browser.userDataDir': 'BROWSER_PERSISTENT_USER_DATA_DIR',
    'browser.useSystemBrowser': 'BROWSER_USE_INSTALLED_ON_SYSTEM',
    'browser.executablePath': 'BROWSER_EXECUTABLE_PATH',
    'browser.locale': 'BROWSER_LOCALE',
    'browser.consoleMessagesBufferSize': 'BROWSER_CONSOLE_MESSAGES_BUFFER_SIZE',
    'browser.httpRequestsBufferSize': 'BROWSER_HTTP_REQUESTS_BUFFER_SIZE',
    platform: 'PLATFORM',
    'node.inspectorHost': 'NODE_INSPECTOR_HOST',
    'node.consoleMessagesBufferSize': 'NODE_CONSOLE_MESSAGES_BUFFER_SIZE',
    'opentelemetry.enable': 'OTEL_ENABLE',
    'opentelemetry.serviceName': 'OTEL_SERVICE_NAME',
    'opentelemetry.serviceVersion': 'OTEL_SERVICE_VERSION',
    'opentelemetry.assetsDir': 'OTEL_ASSETS_DIR',
    'opentelemetry.instrumentationUserInteractionEvents': 'OTEL_INSTRUMENTATION_USER_INTERACTION_EVENTS',
    'opentelemetry.exporterType': 'OTEL_EXPORTER_TYPE',
    'opentelemetry.exporterUrl': 'OTEL_EXPORTER_HTTP_URL',
    'opentelemetry.exporterHeaders': 'OTEL_EXPORTER_HTTP_HEADERS',
    'aws.region': 'AWS_REGION',
    'aws.profile': 'AWS_PROFILE',
    'bedrock.enable': 'AMAZON_BEDROCK_ENABLE',
    'bedrock.imageModelId': 'AMAZON_BEDROCK_IMAGE_EMBED_MODEL_ID',
    'bedrock.textModelId': 'AMAZON_BEDROCK_TEXT_EMBED_MODEL_ID',
    'bedrock.visionModelId': 'AMAZON_BEDROCK_VISION_MODEL_ID',
    'figma.accessToken': 'FIGMA_ACCESS_TOKEN',
    'figma.apiBaseUrl': 'FIGMA_API_BASE_URL',
    toolOutputSchemaDisable: 'TOOL_OUTPUT_SCHEMA_DISABLE',
    availableToolDomains: 'AVAILABLE_TOOL_DOMAINS',
};

// Status bar item
let statusBarItem: vscode.StatusBarItem;

function isExtensionEnabled(): boolean {
    const config = vscode.workspace.getConfiguration(CONFIG_PREFIX);
    return config.get<boolean>('enable', true);
}

function updateStatusBar(): void {
    const enabled = isExtensionEnabled();
    if (enabled) {
        statusBarItem.text = '$(globe) Browser DevTools';
        statusBarItem.tooltip = 'Browser DevTools MCP is enabled. Click to disable.';
        statusBarItem.backgroundColor = undefined;
    } else {
        statusBarItem.text = '$(circle-slash) Browser DevTools';
        statusBarItem.tooltip = 'Browser DevTools MCP is disabled. Click to enable.';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
}

/** Read telemetry.enable from settings and write to ~/.browser-devtools-mcp/config.json. Call on activate and when the setting changes. */
function syncTelemetryConfigFromVscodeSetting(): void {
    const enabled = vscode.workspace.getConfiguration(CONFIG_PREFIX).get<boolean>('telemetry.enable', true);
    writeTelemetryEnabledToConfig(enabled);
}

async function toggleExtension(): Promise<void> {
    const config = vscode.workspace.getConfiguration(CONFIG_PREFIX);
    const currentState = config.get<boolean>('enable', true);
    await config.update('enable', !currentState, vscode.ConfigurationTarget.Global);
}

/** Cursor-specific MCP API (not in VS Code typings). Resolved at call time so Cursor can inject it after extension load. */
function getCursorMcp():
    | { registerServer: (config: unknown) => void; unregisterServer: (name: string) => void }
    | undefined {
    const v = vscode as unknown as {
        cursor?: { mcp?: { registerServer: (config: unknown) => void; unregisterServer: (name: string) => void } };
    };
    return v?.cursor?.mcp;
}

/** True when running in Cursor. In Cursor we must not call vscode.lm.registerMcpServerDefinitionProvider. */
function isCursor(): boolean {
    const v = vscode as unknown as { cursor?: unknown };
    if (v.cursor !== undefined) {
        return true;
    }
    const appName = (vscode.env as { appName?: string }).appName ?? '';
    return appName.toLowerCase().includes('cursor');
}

function getMcpServerInstallDir(context: vscode.ExtensionContext): string {
    return path.join(context.globalStoragePath, MCP_SERVER_INSTALL_DIR);
}

/**
 * Remove the MCP server install directory (globalStorage/mcp-server) for a clean reinstall.
 */
function removeMcpServerInstallDir(installDir: string): void {
    if (fs.existsSync(installDir)) {
        fs.rmSync(installDir, { recursive: true, force: true });
    }
}

/** Path to the MCP install lock file (shared across extension host processes). */
function getMcpInstallLockPath(context: vscode.ExtensionContext): string {
    return path.join(context.globalStoragePath, MCP_INSTALL_LOCK_FILE);
}

/**
 * Try to acquire the MCP install lock. Returns true if we own the lock, false if another process holds it.
 * Call releaseMcpInstallLock when done (install success or failure).
 */
function tryAcquireMcpInstallLock(context: vscode.ExtensionContext): boolean {
    const lockPath = getMcpInstallLockPath(context);
    fs.mkdirSync(context.globalStoragePath, { recursive: true });
    try {
        fs.writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
        return true;
    } catch (e: unknown) {
        const err = e as NodeJS.ErrnoException;
        if (err?.code === 'EEXIST') {
            return false;
        }
        throw e;
    }
}

/** Release the MCP install lock so other processes can install or proceed. */
function releaseMcpInstallLock(context: vscode.ExtensionContext): void {
    try {
        fs.unlinkSync(getMcpInstallLockPath(context));
    } catch {
        // ignore
    }
}

/** Hint shown when npm is not found (PATH / GUI launch). Covers macOS, Linux, Windows. */
const NPM_NOT_FOUND_HINT =
    'npm was not found. This often happens when Cursor was opened from the dock/taskbar instead of a terminal. ' +
    'Try opening Cursor from a terminal (e.g. run "cursor ." from a folder). ' +
    'On macOS, add PATH for GUI apps by editing /etc/paths and restarting Finder. ' +
    'On Linux, ensure Node/npm are in PATH or launch from a terminal. ' +
    'On Windows, ensure Node.js is installed and its folder is in System PATH.';

/**
 * Resolve npm executable path from PATH (so we can run it even when extension host env is limited).
 * Uses the same logic as npm (which package). Returns null if npm is not found.
 */
function resolveNpmPath(): string | null {
    try {
        return which.sync('npm', { nothrow: true }) ?? null;
    } catch {
        return null;
    }
}

/**
 * Run npm with the given args. Uses resolved npm path if available (avoids PATH issues when Cursor is launched from GUI).
 * Falls back to "npm" with shell: true so the system shell's PATH is used. Throws on failure.
 */
function runNpm(cwd: string, env: Record<string, string>, args: string[], options: { timeout?: number } = {}): void {
    const { timeout = 60_000 } = options;
    const npmPath = resolveNpmPath();
    const opts = { cwd, encoding: 'utf8' as const, timeout, stdio: 'pipe' as const, env };
    if (npmPath) {
        // On Windows, .cmd/.bat must run via shell or spawnSync returns EINVAL
        const execFileOpts = process.platform === 'win32' ? { ...opts, shell: true } : opts;
        cp.execFileSync(npmPath, args, execFileOpts);
    } else {
        // shell: true uses system shell PATH; @types/node ExecOptions has shell?: string but runtime accepts boolean
        cp.execSync(`npm ${args.join(' ')}`, {
            ...opts,
            shell: true,
        } as unknown as cp.ExecSyncOptionsWithStringEncoding);
    }
}

/**
 * Run npm and return stdout. Same resolution as runNpm (resolve path or shell: true). Throws on failure.
 */
function runNpmWithOutput(
    cwd: string,
    env: Record<string, string>,
    args: string[],
    options: { timeout?: number } = {}
): string {
    const { timeout = 60_000 } = options;
    const npmPath = resolveNpmPath();
    const opts = { cwd, encoding: 'utf8' as const, timeout, stdio: 'pipe' as const, env };
    if (npmPath) {
        // On Windows, .cmd/.bat must run via shell or spawnSync returns EINVAL
        const execFileOpts = process.platform === 'win32' ? { ...opts, shell: true } : opts;
        return cp.execFileSync(npmPath, args, execFileOpts) as string;
    }
    // shell: true uses system shell PATH; @types/node ExecOptions has shell?: string but runtime accepts boolean
    return cp.execSync(`npm ${args.join(' ')}`, {
        ...opts,
        shell: true,
    } as unknown as cp.ExecSyncOptionsWithStringEncoding);
}

/** True if the error looks like npm/node not found (command not found, not recognized, ENOENT). */
function isNpmNotFoundError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    const stderr = (err as { stderr?: Buffer | string }).stderr;
    const stderrStr = typeof stderr === 'string' ? stderr : (stderr?.toString?.() ?? '');
    const combined = `${msg} ${stderrStr}`.toLowerCase();
    return (
        combined.includes('command not found') ||
        combined.includes('not found') ||
        combined.includes('is not recognized as an internal or external command') ||
        combined.includes('npm: command not found') ||
        combined.includes('node: command not found') ||
        combined.includes("'npm' is not recognized") ||
        combined.includes("'node' is not recognized") ||
        combined.includes('enoent') ||
        /spawn\s+.*\s+enoent/i.test(combined)
    );
}

/** User-facing install error message; appends NPM_NOT_FOUND_HINT when the error indicates npm was not found. */
function getInstallErrorMessage(baseMessage: string, err: unknown): string {
    if (isNpmNotFoundError(err)) {
        return `${baseMessage}\n\n${NPM_NOT_FOUND_HINT}`;
    }
    return baseMessage;
}

/**
 * Run npm install browser-devtools-mcp@version in installDir. Throws on failure.
 * Env PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 so Playwright's postinstall skips; BROWSER_DEVTOOLS_INSTALL_* from settings
 * so browser-devtools-mcp postinstall installs only the selected browsers (it unsets SKIP before calling installBrowsersForNpmInstall).
 */
function doMcpServerInstall(installDir: string, version: string): void {
    fs.mkdirSync(installDir, { recursive: true });
    const pkgPath = path.join(installDir, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        fs.writeFileSync(pkgPath, JSON.stringify({ name: MCP_SERVER_INSTALL_DIR, private: true }, null, 2));
    }
    const config = vscode.workspace.getConfiguration(CONFIG_PREFIX);
    const installChromium = config.get<boolean>('install.chromium', true);
    const installFirefox = config.get<boolean>('install.firefox', false);
    const installWebkit = config.get<boolean>('install.webkit', false);
    const installEnv: Record<string, string> = {
        ...process.env,
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    };
    if (installChromium) {
        installEnv['BROWSER_DEVTOOLS_INSTALL_CHROMIUM'] = 'true';
    }
    if (installFirefox) {
        installEnv['BROWSER_DEVTOOLS_INSTALL_FIREFOX'] = 'true';
    }
    if (installWebkit) {
        installEnv['BROWSER_DEVTOOLS_INSTALL_WEBKIT'] = 'true';
    }
    runNpm(installDir, installEnv, ['install', `browser-devtools-mcp@${version}`], { timeout: 300_000 });
}

function getExtensionVersion(context: vscode.ExtensionContext): string {
    const v = context.extension?.packageJSON?.version;
    return typeof v === 'string' ? v : '';
}

/**
 * Called once on first install or when extension version changes. Copies Cursor rule to ~/.cursor/rules/ so browser automation uses only this MCP.
 */
async function onInstall(context: vscode.ExtensionContext): Promise<void> {
    try {
        const source = path.join(context.extensionPath, 'rules', CURSOR_RULE_FILE_NAME);
        if (!fs.existsSync(source)) {
            return;
        }
        const destDir = path.join(os.homedir(), '.cursor', 'rules');
        const dest = path.join(destDir, CURSOR_RULE_FILE_NAME);
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(source, dest);
        if (statusBarItem) {
            statusBarItem.text = '$(globe) Browser DevTools · Cursor rule installed';
            statusBarItem.tooltip = 'Browser DevTools MCP: Cursor rule added to ~/.cursor/rules';
            setTimeout(() => updateStatusBar(), CURSOR_RULE_STATUS_DURATION_MS);
        }
    } catch (err) {
        console.error('[Browser DevTools MCP] Failed to copy Cursor rule to ~/.cursor/rules:', err);
        const msg = err instanceof Error ? err.message : String(err);
        void trackCursorExtInstallFailed(
            (context.extension.packageJSON as { version?: string }).version ?? '0.0.0',
            msg
        );
    }

    try {
        trackCursorExtInstalled((context.extension.packageJSON as { version?: string }).version ?? '0.0.0');
    } catch (err) {
        console.error('[Browser DevTools MCP] Failed to track cursor extension installed:', err);
        const msg = err instanceof Error ? err.message : String(err);
        void trackCursorExtInstallFailed(
            (context.extension.packageJSON as { version?: string }).version ?? '0.0.0',
            msg
        );
    }
}

/**
 * If globalStorage .extension-version is missing or differs from current version, write it and call onInstall().
 * TODO: If multiple windows (separate extension host processes) can activate at once and only one must run onInstall(),
 * use a file lock: create a .extension-version.lock file with fs.writeFileSync(..., { flag: 'wx' }); only one process succeeds;
 * others poll until the lock is removed, then re-read .extension-version and skip if already current.
 */
async function runInstallIfNeeded(context: vscode.ExtensionContext): Promise<void> {
    const versionFilePath = path.join(context.globalStoragePath, EXTENSION_VERSION_FILE);
    const currentVersion = getExtensionVersion(context);
    const stored = fs.existsSync(versionFilePath) ? fs.readFileSync(versionFilePath, 'utf8').trim() : '';
    if (stored === currentVersion) {
        return;
    }
    try {
        fs.mkdirSync(context.globalStoragePath, { recursive: true });
        fs.writeFileSync(versionFilePath, currentVersion, 'utf8');
        await onInstall(context);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        void trackCursorExtInstallFailed(currentVersion, msg);
        throw err;
    }
}

/**
 * Ensure browser-devtools-mcp is installed (globalStorage or bundled for dev). Returns path to dist/index.js.
 * Installs at runtime so sharp and native deps match user's platform.
 * If server exists but was installed by a different extension version (update/reinstall), we reinstall latest.
 */
async function ensureMcpServerInstalled(context: vscode.ExtensionContext): Promise<string> {
    if (cachedMcpServerPath !== null) {
        return cachedMcpServerPath;
    }
    const installDir = getMcpServerInstallDir(context);
    const serverPath = path.join(installDir, 'node_modules', 'browser-devtools-mcp', 'dist', 'index.js');
    const markerPath = path.join(installDir, MCP_SERVER_EXTENSION_VERSION_MARKER);
    // Dev only: extension's node_modules (published VSIX has no node_modules, so this is never used by end users)
    const bundledPath = path.join(context.extensionPath, 'node_modules', 'browser-devtools-mcp', 'dist', 'index.js');

    if (fs.existsSync(bundledPath)) {
        cachedMcpServerPath = bundledPath;
        console.log('[Browser DevTools MCP] Using bundled server (dev):', bundledPath);
        return bundledPath;
    }

    const currentVersion = getExtensionVersion(context);
    const needInstall =
        !fs.existsSync(serverPath) ||
        (currentVersion !== '' &&
            (!fs.existsSync(markerPath) || fs.readFileSync(markerPath, 'utf8').trim() !== currentVersion));

    if (fs.existsSync(serverPath) && !needInstall) {
        cachedMcpServerPath = serverPath;
        console.log('[Browser DevTools MCP] Using installed server:', serverPath);
        return serverPath;
    }

    function isServerReady(): boolean {
        if (!fs.existsSync(serverPath)) {
            return false;
        }
        if (currentVersion === '') {
            return true;
        }
        return fs.existsSync(markerPath) && fs.readFileSync(markerPath, 'utf8').trim() === currentVersion;
    }

    const lockPath = getMcpInstallLockPath(context);
    const acquired = tryAcquireMcpInstallLock(context);
    if (acquired) {
        try {
            return await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Browser DevTools MCP',
                    cancellable: false,
                },
                async (progress) => {
                    progress.report({ message: `Installing browser-devtools-mcp@${DEFAULT_MCP_SERVER_VERSION}…` });
                    try {
                        doMcpServerInstall(installDir, DEFAULT_MCP_SERVER_VERSION);
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        console.error('[Browser DevTools MCP] npm install failed:', msg);
                        void trackCursorExtMcpInstallFailed(currentVersion, DEFAULT_MCP_SERVER_VERSION, msg);
                        showErrorWithIssueLink(
                            getInstallErrorMessage(
                                `Browser DevTools MCP: Install failed. ${msg} Check network and try again.`,
                                err
                            ),
                            false,
                            err
                        );
                        throw err;
                    }
                    if (!fs.existsSync(serverPath)) {
                        const msg = 'MCP server not found after install.';
                        void trackCursorExtMcpInstallFailed(currentVersion, DEFAULT_MCP_SERVER_VERSION, msg);
                        const err = new Error(msg);
                        showErrorWithIssueLink(
                            getInstallErrorMessage(
                                `Browser DevTools MCP: Install failed. ${msg} Check network and try again.`,
                                err
                            ),
                            false,
                            err
                        );
                        throw err;
                    }
                    if (currentVersion !== '') {
                        fs.mkdirSync(installDir, { recursive: true });
                        fs.writeFileSync(markerPath, currentVersion, 'utf8');
                    }
                    cachedMcpServerPath = serverPath;
                    console.log('[Browser DevTools MCP] Installed server:', serverPath);
                    void trackCursorExtMcpInstalled(currentVersion, DEFAULT_MCP_SERVER_VERSION);
                    void vscode.window.showInformationMessage(
                        `Browser DevTools MCP: Installed browser-devtools-mcp@${DEFAULT_MCP_SERVER_VERSION}. Ready to use.`
                    );
                    return serverPath;
                }
            );
        } finally {
            releaseMcpInstallLock(context);
        }
    }

    // Another window is installing; wait for it to finish, then use the server (no event from this process).
    const deadline = Date.now() + MCP_INSTALL_WAITER_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (fs.existsSync(lockPath)) {
            try {
                const stat = fs.statSync(lockPath);
                if (Date.now() - stat.mtimeMs > MCP_INSTALL_LOCK_STALE_MS) {
                    fs.unlinkSync(lockPath);
                }
            } catch {
                // ignore
            }
        } else {
            if (isServerReady()) {
                cachedMcpServerPath = serverPath;
                console.log('[Browser DevTools MCP] Using server installed by another window:', serverPath);
                return serverPath;
            }
        }
        await new Promise((r) => setTimeout(r, MCP_INSTALL_POLL_INTERVAL_MS));
    }
    throw new Error(
        'Browser DevTools MCP: Install timed out. Another Cursor window may be installing the MCP server; try again in a moment.'
    );
}

/**
 * Command: install or reinstall browser-devtools-mcp with version picker (npm versions on-demand; first run always uses latest).
 */
async function installMcpServerCommand(context: vscode.ExtensionContext): Promise<void> {
    let versions: string[] = [];
    try {
        const env = process.env as Record<string, string>;
        const out = runNpmWithOutput(process.cwd(), env, ['view', 'browser-devtools-mcp', 'versions', '--json'], {
            timeout: 15_000,
        });
        const parsed = JSON.parse(out.trim()) as string[];
        versions = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        // fallback to just "latest"
    }
    const items: vscode.QuickPickItem[] = [{ label: 'Latest', description: 'latest', detail: 'Use latest from npm' }];
    const reversed = [...versions].reverse();
    for (const v of reversed) {
        items.push({ label: v, description: v });
    }
    const picked = await vscode.window.showQuickPick(items, {
        title: 'Install Browser DevTools MCP server',
        placeHolder: 'Select version to install (default: Latest)',
        matchOnDescription: true,
    });
    if (!picked) {
        return;
    }
    const version = picked.description ?? picked.label ?? DEFAULT_MCP_SERVER_VERSION;
    const installDir = getMcpServerInstallDir(context);
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Browser DevTools MCP',
            cancellable: false,
        },
        async (progress) => {
            progress.report({ message: 'Cleaning previous install…' });
            removeMcpServerInstallDir(installDir);
            cachedMcpServerPath = null;
            progress.report({ message: `Installing browser-devtools-mcp@${version}…` });
            try {
                doMcpServerInstall(installDir, version);
                const serverPath = path.join(installDir, 'node_modules', 'browser-devtools-mcp', 'dist', 'index.js');
                if (fs.existsSync(serverPath)) {
                    cachedMcpServerPath = serverPath;
                }
                void trackCursorExtMcpInstalled(getExtensionVersion(context), version);
                void vscode.window.showInformationMessage(
                    `Browser DevTools MCP: Installed browser-devtools-mcp@${version}. Restart the MCP server to use it.`
                );
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                void trackCursorExtMcpInstallFailed(getExtensionVersion(context), version, msg);
                showErrorWithIssueLink(
                    getInstallErrorMessage(
                        `Browser DevTools MCP: Install failed. ${msg} Check network and try again.`,
                        err
                    ),
                    false,
                    err
                );
                throw err;
            }
        }
    );
}

/**
 * Get MCP server config (command, args, env). Uses cached server path from ensureMcpServerInstalled.
 * Returns null if extension is disabled or server path not set.
 */
function getMcpServerConfig(): {
    command: string;
    args: string[];
    env: Record<string, string>;
} | null {
    if (!isExtensionEnabled() || cachedMcpServerPath === null) {
        return null;
    }
    const settingsEnv = getEnvironmentFromSettings();
    const mergedEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined && typeof value === 'string') {
            mergedEnv[key] = value;
        }
    }
    for (const [key, value] of Object.entries(settingsEnv)) {
        if (value !== undefined && typeof value === 'string') {
            mergedEnv[key] = value;
        }
    }
    return { command: 'node', args: [cachedMcpServerPath, CURSOR_MCP_SERVER_ARG], env: mergedEnv };
}

/**
 * Build GitHub issue URL with optional title and body (query params are encoded).
 */
function buildGitHubIssueUrl(title: string, body?: string): string {
    const params = new URLSearchParams();
    params.set('title', title);
    if (body) {
        params.set('body', body);
    }
    return `${GITHUB_ISSUES_BASE}?${params.toString()}`;
}

/**
 * Format error for GitHub issue body: extension version, type, message, stack.
 * Uses ** for headings so "##" is not URL-encoded to %23%23 in the issue URL.
 */
function formatErrorForIssueBody(error: unknown, extensionVersion?: string): string {
    const lines: string[] = [];
    if (extensionVersion) {
        lines.push(`**Extension version:** ${extensionVersion}`, '');
    }
    if (error instanceof Error) {
        const type = error.constructor?.name ?? 'Error';
        const stack = error.stack ?? '(no stack)';
        lines.push(
            '**Error details**',
            '',
            `**Type:** \`${type}\``,
            '',
            `**Message:** ${error.message}`,
            '',
            '**Stack:**',
            '```',
            stack,
            '```'
        );
        return lines.join('\n');
    }
    lines.push(`**Message:** ${String(error)}`);
    return lines.join('\n');
}

/**
 * Show warning/error with GitHub issue link. If `error` is provided, issue body is prefilled with extension version, type, message and stack.
 */
function showErrorWithIssueLink(message: string, isWarning = false, error?: unknown): void {
    const show = isWarning ? vscode.window.showWarningMessage : vscode.window.showErrorMessage;
    void show(message, 'Open issue on GitHub').then((choice) => {
        if (choice === 'Open issue on GitHub') {
            const title = message.slice(0, 100).replace(/\s+/g, ' ').trim();
            const ext = vscode.extensions.getExtension('serkan-ozal.browser-devtools-mcp-vscode');
            const extensionVersion = ext?.packageJSON?.version ?? '';
            const body = error !== undefined ? formatErrorForIssueBody(error, extensionVersion) : undefined;
            void vscode.env.openExternal(vscode.Uri.parse(buildGitHubIssueUrl(title, body)));
        }
    });
}

/**
 * Register MCP server with Cursor's API so it appears without user editing mcp.json.
 * Sleeps after register so Cursor can process the change.
 */
async function registerCursorMcp(): Promise<void> {
    const cursorMcp = getCursorMcp();
    if (!cursorMcp) {
        return;
    }
    const config = getMcpServerConfig();
    if (!config) {
        return;
    }
    try {
        const env: Record<string, string> = {};
        for (const [k, v] of Object.entries(config.env)) {
            if (typeof v === 'string') {
                env[k] = v;
            }
        }
        cursorMcp.registerServer({
            name: MCP_SERVER_NAME,
            server: {
                command: config.command ?? 'node',
                args: Array.isArray(config.args) ? config.args : [config.args].filter(Boolean),
                env,
            },
        });
        console.log('[Browser DevTools MCP] Registered MCP server with Cursor.');
        await sleep(REGISTER_UNREGISTER_SLEEP_MS);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[Browser DevTools MCP] Cursor MCP register failed:', msg);
        showErrorWithIssueLink(
            `Browser DevTools MCP: Failed to register MCP server with Cursor. ${msg} Please report the issue if it persists.`,
            true,
            err
        );
    }
}

/** Sleep after register/unregister so Cursor can process the change. */
const REGISTER_UNREGISTER_SLEEP_MS = 3_000;

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * Unregister MCP server from Cursor (on deactivate or disable).
 * Sleeps after unregister so Cursor can process the change.
 */
async function unregisterCursorMcp(): Promise<void> {
    const cursorMcp = getCursorMcp();
    if (!cursorMcp) {
        return;
    }
    try {
        cursorMcp.unregisterServer(MCP_SERVER_NAME);
        console.log('[Browser DevTools MCP] Unregistered MCP server from Cursor.');
        await sleep(REGISTER_UNREGISTER_SLEEP_MS);
    } catch (err) {
        console.warn('[Browser DevTools MCP] Cursor MCP unregister failed:', err);
    }
}

/**
 * Get environment variables from VS Code settings
 */
function getEnvironmentFromSettings(): Record<string, string> {
    const config = vscode.workspace.getConfiguration(CONFIG_PREFIX);
    const env: Record<string, string> = {};

    for (const [settingKey, envVar] of Object.entries(SETTINGS_TO_ENV)) {
        const value = config.get(settingKey);

        const skip = value === undefined || value === null || (typeof value === 'string' && value === '');
        if (!skip) {
            env[envVar] = typeof value === 'boolean' ? value.toString() : String(value);
        }
    }

    return env;
}

/**
 * MCP Server Definition Provider for Browser DevTools
 */
class BrowserDevToolsMcpProvider implements vscode.McpServerDefinitionProvider {
    private readonly extensionPath: string;

    constructor(extensionPath: string) {
        this.extensionPath = extensionPath;
    }

    provideMcpServerDefinitions(): vscode.McpServerDefinition[] {
        const config = getMcpServerConfig();
        if (!config) {
            return [];
        }
        return [new vscode.McpStdioServerDefinition(MCP_SERVER_NAME, config.command, config.args, config.env)];
    }
}

export async function activate(context: vscode.ExtensionContext) {
    extensionPathForDeactivate = context.extensionPath;
    globalStoragePathForDeactivate = context.globalStoragePath;
    extensionVersionForDeactivate = getExtensionVersion(context);

    syncTelemetryConfigFromVscodeSetting();

    // First run or new version: update globalStorage .extension-version and run onInstall() if needed
    await runInstallIfNeeded(context);

    // before status bar uses it
    context.subscriptions.push(vscode.commands.registerCommand('browserDevtoolsMcp.toggleExtension', toggleExtension));

    // after command is registered
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'browserDevtoolsMcp.toggleExtension';
    updateStatusBar();
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Install MCP server at runtime (globalStorage) so sharp/native deps match user platform; fallback to bundled for dev
    await ensureMcpServerInstalled(context);

    // Register MCP: Cursor uses cursor.mcp.registerServer; VS Code uses lm.registerMcpServerDefinitionProvider (VS Code 1.96+).
    if (isCursor()) {
        await registerCursorMcp();
    } else if (vscode.lm?.registerMcpServerDefinitionProvider) {
        const mcpProvider = new BrowserDevToolsMcpProvider(context.extensionPath);
        const mcpDisposable = vscode.lm.registerMcpServerDefinitionProvider('browser-devtools-mcp', mcpProvider);
        context.subscriptions.push(mcpDisposable);
        console.log('[Browser DevTools MCP] Registered MCP server with VS Code.');
    } else {
        const msg = 'No MCP API available. Use VS Code 1.96+ or a recent Cursor version.';
        console.warn('[Browser DevTools MCP]', msg);
        void vscode.window.showWarningMessage(`Browser DevTools MCP: ${msg}`);
    }

    // Register Settings Webview Provider
    const settingsProvider = new SettingsWebviewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SettingsWebviewProvider.viewType, settingsProvider)
    );

    // Register Open Settings Command
    context.subscriptions.push(
        vscode.commands.registerCommand('browserDevtoolsMcp.openSettings', () => {
            vscode.commands.executeCommand(
                'workbench.action.openSettings',
                '@ext:serkan-ozal.browser-devtools-mcp-vscode'
            );
        })
    );

    // Register Install MCP Server Command
    context.subscriptions.push(
        vscode.commands.registerCommand('browserDevtoolsMcp.installMcpServer', () => installMcpServerCommand(context))
    );

    // Register Restart Server Command
    context.subscriptions.push(
        vscode.commands.registerCommand('browserDevtoolsMcp.restartServer', async () => {
            if (isExtensionEnabled()) {
                if (getCursorMcp()) {
                    await unregisterCursorMcp();
                    await registerCursorMcp();
                    void vscode.window.showInformationMessage('Browser DevTools MCP: Server restarted.');
                } else {
                    void vscode.window.showInformationMessage(
                        'Browser DevTools MCP: Restart applied. Reload the window if the server does not update.'
                    );
                }
            } else {
                void vscode.window.showInformationMessage(
                    'Browser DevTools MCP: Extension is disabled. Enable it first.'
                );
            }
        })
    );

    // Watch for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(CONFIG_PREFIX)) {
                if (e.affectsConfiguration(`${CONFIG_PREFIX}.enable`)) {
                    updateStatusBar();
                    const enabled = isExtensionEnabled();
                    if (getCursorMcp()) {
                        if (enabled) {
                            void (async () => {
                                await registerCursorMcp();
                            })();
                        } else {
                            void (async () => {
                                await unregisterCursorMcp();
                            })();
                        }
                    }
                    vscode.window.showInformationMessage(
                        `Browser DevTools MCP: Extension ${enabled ? 'enabled' : 'disabled'}. Restart the MCP session to apply changes.`
                    );
                } else if (
                    e.affectsConfiguration(`${CONFIG_PREFIX}.install.chromium`) ||
                    e.affectsConfiguration(`${CONFIG_PREFIX}.install.firefox`) ||
                    e.affectsConfiguration(`${CONFIG_PREFIX}.install.webkit`)
                ) {
                    vscode.window.showInformationMessage(
                        'Browser DevTools MCP: Install browsers setting changed. Run **Install MCP Server** to reinstall with the new selection.'
                    );
                } else if (e.affectsConfiguration(`${CONFIG_PREFIX}.telemetry.enable`)) {
                    syncTelemetryConfigFromVscodeSetting();
                } else {
                    if (getCursorMcp() && isExtensionEnabled()) {
                        void (async () => {
                            await unregisterCursorMcp();
                            await registerCursorMcp();
                        })();
                    }
                    vscode.window.showInformationMessage(
                        'Browser DevTools MCP: Settings changed. Restart the MCP session to apply changes.'
                    );
                }
            }
        })
    );

    console.log('Browser DevTools MCP extension activated successfully');
}

/**
 * Called when this process successfully deleted .extension-version in runUninstallIfNeeded (so only one process calls it when many deactivate concurrently).
 */
async function onUninstall(): Promise<void> {
    try {
        const rulePath = path.join(os.homedir(), '.cursor', 'rules', CURSOR_RULE_FILE_NAME);
        if (!fs.existsSync(rulePath)) {
            return;
        }
        fs.unlinkSync(rulePath);
        if (statusBarItem) {
            statusBarItem.text = '$(globe) Browser DevTools · Cursor rule removed';
            statusBarItem.tooltip = 'Browser DevTools MCP: Cursor rule removed from ~/.cursor/rules';
        }
    } catch (err) {
        console.error('[Browser DevTools MCP] Failed to remove Cursor rule from ~/.cursor/rules:', err);
        const msg = err instanceof Error ? err.message : String(err);
        void trackCursorExtUninstallFailed(extensionVersionForDeactivate, msg);
    }

    try {
        await trackCursorExtUninstalled();
    } catch (err) {
        console.error('[Browser DevTools MCP] Failed to track cursor extension uninstalled:', err);
        const msg = err instanceof Error ? err.message : String(err);
        void trackCursorExtUninstallFailed(extensionVersionForDeactivate, msg);
    }
}

/**
 * Try to delete globalStorage .extension-version; only the process that succeeds calls onUninstall(), so concurrent deactivates (e.g. multiple windows) result in a single onUninstall().
 */
async function runUninstallIfNeeded(): Promise<void> {
    if (!globalStoragePathForDeactivate) {
        return;
    }
    const versionFilePath = path.join(globalStoragePathForDeactivate, EXTENSION_VERSION_FILE);
    if (!fs.existsSync(versionFilePath)) {
        return;
    }
    try {
        fs.unlinkSync(versionFilePath);
    } catch (err) {
        const code = err && typeof err === 'object' && 'code' in err ? (err as NodeJS.ErrnoException).code : '';
        if (code === 'ENOENT') {
            return;
        }
        throw err;
    }
    await onUninstall();
}

export async function deactivate(): Promise<void> {
    await unregisterCursorMcp();
    console.log('Browser DevTools MCP extension deactivated');

    // If we're in .obsolete, host is uninstalling us; runUninstallIfNeeded (only one process calls onUninstall when many deactivate).
    if (extensionPathForDeactivate) {
        try {
            const extensionsDir = path.dirname(extensionPathForDeactivate);
            const obsoletePath = path.join(extensionsDir, '.obsolete');
            const folderName = path.basename(extensionPathForDeactivate);
            if (fs.existsSync(obsoletePath)) {
                const content = fs.readFileSync(obsoletePath, 'utf8').trim();
                const obsolete: Record<string, boolean> = content
                    ? (JSON.parse(content) as Record<string, boolean>)
                    : {};
                if (obsolete[folderName] === true) {
                    await runUninstallIfNeeded();
                }
            }
        } catch {
            /* non-fatal */
        }
    }
}
