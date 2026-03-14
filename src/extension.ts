import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { SettingsWebviewProvider } from './settingsWebview';
import { trackCursorExtInstalled, trackCursorExtUninstalled } from './telemetry';

// Configuration key prefix
const CONFIG_PREFIX = 'browserDevtoolsMcp';

// GitHub repo for issue reporting when install fails
const GITHUB_ISSUES_BASE = 'https://github.com/serkan-ozal/browser-devtools-mcp-vscode-extension/issues/new';

// MCP server installed at runtime (like Playwright browsers); avoids bundling sharp for all platforms
const MCP_SERVER_INSTALL_DIR = 'mcp-server';
const MCP_SERVER_EXTENSION_VERSION_MARKER = '.extension-version';
const DEFAULT_MCP_SERVER_VERSION = 'latest';
/** MCP server name used for Cursor register/unregister and VS Code provider definition. */
const MCP_SERVER_NAME = 'browser-devtools';
/** CLI arg added when we start the MCP server so we can identify our processes for kill (avoids killing extension host). */
const CURSOR_MCP_SERVER_ARG = '--cursor-mcp-server';

let cachedMcpServerPath: string | null = null;

/** Set in activate so deactivate can detect uninstall (.obsolete) and send uninstall telemetry. */
let extensionPathForDeactivate: string | null = null;

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
 * Run npm install browser-devtools-mcp@version in installDir. Throws on failure.
 * Playwright browser binaries are installed by @playwright/browser-chromium (etc.) postinstall hooks during npm install.
 * @param cleanFirst - If true (manual install only), remove installDir first so install is from scratch. If false, reuse existing folder.
 */
function doMcpServerInstall(installDir: string, version: string, cleanFirst = false): void {
    if (cleanFirst && fs.existsSync(installDir)) {
        fs.rmSync(installDir, { recursive: true, force: true });
    }
    fs.mkdirSync(installDir, { recursive: true });
    const pkgPath = path.join(installDir, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify({ name: MCP_SERVER_INSTALL_DIR, private: true }, null, 2));
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    cp.execSync(`${npmCmd} install browser-devtools-mcp@${version}`, {
        cwd: installDir,
        encoding: 'utf8',
        timeout: 120_000,
        stdio: 'pipe',
    });
}

/** Remove mcp-server folder so next install starts from scratch. Use on install failure to avoid half-installed state. */
function removeMcpServerInstallDir(installDir: string): void {
    try {
        if (fs.existsSync(installDir)) {
            fs.rmSync(installDir, { recursive: true, force: true });
        }
    } catch {
        /* non-fatal */
    }
}

function getExtensionVersion(context: vscode.ExtensionContext): string {
    const v = context.extension?.packageJSON?.version;
    return typeof v === 'string' ? v : '';
}

/**
 * Ensure browser-devtools-mcp is installed (globalStorage or bundled for dev). Returns path to dist/index.js.
 * Installs at runtime so sharp and native deps match user's platform.
 * If server exists but was installed by a different extension version (update/reinstall), we reinstall latest.
 * We always treat globalStorage as source of truth: if the file is missing there (e.g. folder cleared), we reinstall
 * even when bundled server exists, so the mcp-server folder is never left empty.
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

    const currentVersion = getExtensionVersion(context);
    const needInstall =
        !fs.existsSync(serverPath) ||
        (currentVersion !== '' &&
            (!fs.existsSync(markerPath) || fs.readFileSync(markerPath, 'utf8').trim() !== currentVersion));

    // 1) globalStorage has valid server → use it (don't rely on state; trust disk)
    if (fs.existsSync(serverPath) && !needInstall) {
        cachedMcpServerPath = serverPath;
        console.log('[Browser DevTools MCP] Using installed server:', serverPath);
        return serverPath;
    }

    // 2) Bundled exists but globalStorage empty/corrupt → use bundled for this session and populate globalStorage
    if (fs.existsSync(bundledPath)) {
        cachedMcpServerPath = bundledPath;
        console.log('[Browser DevTools MCP] Using bundled server (dev):', bundledPath);
        if (needInstall) {
            void vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Browser DevTools MCP',
                    cancellable: false,
                },
                async (progress) => {
                    progress.report({ message: `Installing browser-devtools-mcp@${DEFAULT_MCP_SERVER_VERSION}…` });
                    try {
                        doMcpServerInstall(installDir, DEFAULT_MCP_SERVER_VERSION);
                        if (currentVersion !== '') {
                            fs.mkdirSync(installDir, { recursive: true });
                            fs.writeFileSync(markerPath, currentVersion, 'utf8');
                        }
                    } catch (err) {
                        console.error('[Browser DevTools MCP] Background install to globalStorage failed:', err);
                        removeMcpServerInstallDir(installDir);
                    }
                }
            );
        }
        return bundledPath;
    }

    // 3) No valid server on disk → install to globalStorage (blocking)
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
                removeMcpServerInstallDir(installDir);
                const msg = err instanceof Error ? err.message : String(err);
                console.error('[Browser DevTools MCP] npm install failed:', msg);
                showErrorWithIssueLink(
                    `Browser DevTools MCP: Install failed. ${msg} Check network and try again.`,
                    false,
                    err
                );
                throw err;
            }
            if (!fs.existsSync(serverPath)) {
                removeMcpServerInstallDir(installDir);
                const msg = 'MCP server not found after install.';
                const err = new Error(msg);
                showErrorWithIssueLink(
                    `Browser DevTools MCP: Install failed. ${msg} Check network and try again.`,
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
            void vscode.window.showInformationMessage(
                `Browser DevTools MCP: Installed browser-devtools-mcp@${DEFAULT_MCP_SERVER_VERSION}. Ready to use.`
            );
            return serverPath;
        }
    );
}

/**
 * Command: install or reinstall browser-devtools-mcp with version picker (npm versions on-demand; first run always uses latest).
 */
async function installMcpServerCommand(context: vscode.ExtensionContext): Promise<void> {
    let versions: string[] = [];
    try {
        const out = cp.execSync('npm view browser-devtools-mcp versions --json', {
            encoding: 'utf8',
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
            progress.report({ message: `Installing browser-devtools-mcp@${version}…` });
            try {
                doMcpServerInstall(installDir, version, true);
                const serverPath = path.join(installDir, 'node_modules', 'browser-devtools-mcp', 'dist', 'index.js');
                if (fs.existsSync(serverPath)) {
                    cachedMcpServerPath = serverPath;
                }
                void vscode.window.showInformationMessage(
                    `Browser DevTools MCP: Installed browser-devtools-mcp@${version}. Restart the MCP server to use it.`
                );
            } catch (err) {
                removeMcpServerInstallDir(installDir);
                const msg = err instanceof Error ? err.message : String(err);
                showErrorWithIssueLink(
                    `Browser DevTools MCP: Install failed. ${msg} Check network and try again.`,
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
 * Format error for GitHub issue body: type, message, stack.
 */
function formatErrorForIssueBody(error: unknown): string {
    if (error instanceof Error) {
        const type = error.constructor?.name ?? 'Error';
        const stack = error.stack ?? '(no stack)';
        return [
            '## Error details',
            '',
            `**Type:** \`${type}\``,
            '',
            `**Message:** ${error.message}`,
            '',
            '**Stack:**',
            '```',
            stack,
            '```',
        ].join('\n');
    }
    return `**Message:** ${String(error)}`;
}

/**
 * Show warning/error with GitHub issue link. If `error` is provided, issue body is prefilled with type, message and stack.
 */
function showErrorWithIssueLink(message: string, isWarning = false, error?: unknown): void {
    const show = isWarning ? vscode.window.showWarningMessage : vscode.window.showErrorMessage;
    void show(message, 'Open issue on GitHub').then((choice) => {
        if (choice === 'Open issue on GitHub') {
            const title = message.slice(0, 100).replace(/\s+/g, ' ').trim();
            const body = error !== undefined ? formatErrorForIssueBody(error) : undefined;
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

/**
 * Find PIDs of node processes that we started (have CURSOR_MCP_SERVER_ARG in command line).
 * Used on extension deactivate / restart to kill only our MCP server processes, not extension host.
 * On Darwin/Linux uses pgrep -f first (full command line match); falls back to ps -eo pid,args (may truncate on macOS).
 */
function getPidsOfCursorMcpProcesses(): number[] {
    const pids: number[] = [];
    const marker = CURSOR_MCP_SERVER_ARG.toLowerCase();
    try {
        const platform = os.platform();
        if (platform === 'darwin' || platform === 'linux') {
            try {
                const pgrepOut = cp.execSync(`pgrep -f "${CURSOR_MCP_SERVER_ARG}"`, {
                    encoding: 'utf8',
                    maxBuffer: 64 * 1024,
                });
                for (const line of pgrepOut.trim().split(/\s+/)) {
                    const n = parseInt(line, 10);
                    if (!Number.isNaN(n)) {
                        pids.push(n);
                    }
                }
            } catch {
                // pgrep exits 1 when no match; fall back to ps
            }
            if (pids.length === 0) {
                const out = cp.execSync('ps -eo pid,args', { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
                for (const line of out.split('\n')) {
                    const m = line.match(/^\s*(\d+)\s+(.*)/);
                    if (!m) {
                        continue;
                    }
                    const args = m[2].toLowerCase();
                    if (args.includes(marker)) {
                        pids.push(parseInt(m[1], 10));
                    }
                }
            }
        } else if (platform === 'win32') {
            const out = cp.execSync('wmic process where "name=\'node.exe\'" get processid,commandline /format:list', {
                encoding: 'utf8',
                maxBuffer: 4 * 1024 * 1024,
                windowsHide: true,
            });
            let currentPid: number | null = null;
            for (const line of out.split(/\r?\n/)) {
                const pidMatch = line.match(/ProcessId=(\d+)/);
                if (pidMatch) {
                    currentPid = parseInt(pidMatch[1], 10);
                }
                const cmdMatch = line.match(/CommandLine=(.*)/);
                if (cmdMatch && currentPid !== null) {
                    const args = cmdMatch[1].toLowerCase();
                    if (args.includes(marker)) {
                        pids.push(currentPid);
                    }
                    currentPid = null;
                }
            }
        }
    } catch (_) {
        // ignore: ps/wmic may fail in some environments
    }
    return pids;
}

/** Check if a process is still alive (signal 0 = no kill, just check). */
function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

const KILL_MCP_PROCESSES_TIMEOUT_MS = 30_000;
const KILL_MCP_PROCESSES_POLL_MS = 200;
/** Sleep after register/unregister so Cursor can process the change. */
const REGISTER_UNREGISTER_SLEEP_MS = 3_000;

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * Kill node processes that run our MCP server and were started from Cursor.
 * Sends SIGTERM then waits until they exit (polling). Timeout 30s; on timeout logs error and continues.
 */
async function killCursorMcpProcesses(): Promise<void> {
    const pids = getPidsOfCursorMcpProcesses();
    if (pids.length === 0) {
        console.log('[Browser DevTools MCP] killCursorMcpProcesses: no MCP server PIDs found (process may already exit or not match).');
        return;
    }
    console.log(`[Browser DevTools MCP] killCursorMcpProcesses: found ${pids.length} PID(s), sending SIGTERM:`, pids);
    for (const pid of pids) {
        try {
            process.kill(pid, 'SIGTERM');
        } catch (err) {
            const code = (err as NodeJS.ErrnoException)?.code ?? 'unknown';
            console.warn(`[Browser DevTools MCP] killCursorMcpProcesses: SIGTERM failed for PID ${pid}:`, code, (err as Error)?.message ?? err);
        }
    }
    const deadline = Date.now() + KILL_MCP_PROCESSES_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const stillAlive = pids.filter((pid) => isProcessAlive(pid));
        if (stillAlive.length === 0) {
            console.log('[Browser DevTools MCP] killCursorMcpProcesses: all PIDs exited.');
            return;
        }
        await new Promise((r) => setTimeout(r, KILL_MCP_PROCESSES_POLL_MS));
    }
    const stillAlive = pids.filter((pid) => isProcessAlive(pid));
    if (stillAlive.length > 0) {
        console.error(
            `[Browser DevTools MCP] Timeout (${KILL_MCP_PROCESSES_TIMEOUT_MS / 1000}s) waiting for MCP processes to exit. PIDs still alive:`,
            stillAlive
        );
        console.log('[Browser DevTools MCP] killCursorMcpProcesses: sending SIGKILL to remaining PIDs.');
        for (const pid of stillAlive) {
            try {
                process.kill(pid, 'SIGKILL');
            } catch (err) {
                const code = (err as NodeJS.ErrnoException)?.code ?? 'unknown';
                console.warn(`[Browser DevTools MCP] killCursorMcpProcesses: SIGKILL failed for PID ${pid}:`, code, (err as Error)?.message ?? err);
            }
        }
    }
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

/** Marker file in globalStorage: when present, extension was already activated (install event already sent). Uninstall removes globalStorage so re-install sends again. */
const EXTENSION_ACTIVATED_MARKER = '.extension-activated';

/** Process-local guard so we never send cursor_ext_installed more than once per session. */
let telemetryFirstInstallSentThisSession = false;

/**
 * On activate: if .extension-activated is absent, treat as install and send cursor_ext_installed. Create the file atomically (wx) so concurrent activations only let one succeed.
 * Call once at activate. Never throws; any telemetry error is caught and logged.
 */
function runFirstInstallTelemetryIfNeeded(context: vscode.ExtensionContext): void {
    try {
        if (telemetryFirstInstallSentThisSession) {
            return;
        }
        const markerPath = path.join(context.globalStoragePath, EXTENSION_ACTIVATED_MARKER);
        fs.mkdirSync(context.globalStoragePath, { recursive: true });
        try {
            fs.writeFileSync(markerPath, '', { flag: 'wx' });
        } catch (err) {
            const code = (err as NodeJS.ErrnoException)?.code;
            if (code === 'EEXIST') {
                return;
            }
            console.error('[Browser DevTools MCP] Could not create extension-activated marker:', err);
            return;
        }
        telemetryFirstInstallSentThisSession = true;

        const telemetryEnabled = vscode.workspace
            .getConfiguration(CONFIG_PREFIX)
            .get<boolean>('telemetry.enable', true);
        if (!telemetryEnabled) {
            syncTelemetryDisabledToConfig();
            return;
        }
        trackCursorExtInstalled((context.extension.packageJSON as { version?: string }).version ?? '0.0.0');
    } catch (err) {
        console.error('[Browser DevTools MCP] Telemetry (cursor_ext_installed) failed:', err);
    }
}

/** Sync telemetry disabled state to ~/.browser-devtools-mcp/config.json so telemetry respects opt-out. Never throws. */
function syncTelemetryDisabledToConfig(): void {
    try {
        syncTelemetryEnabledToConfigFile(false);
    } catch (err) {
        console.error('[Browser DevTools MCP] Telemetry sync (disabled) failed:', err);
    }
}

/** Sync telemetry enabled state to ~/.browser-devtools-mcp/config.json so telemetry matches the setting. Never throws. */
function syncTelemetryEnabledToConfig(): void {
    try {
        syncTelemetryEnabledToConfigFile(true);
    } catch (err) {
        console.error('[Browser DevTools MCP] Telemetry sync (enabled) failed:', err);
    }
}

function syncTelemetryEnabledToConfigFile(enabled: boolean): void {
    try {
        const configDir = path.join(os.homedir(), '.browser-devtools-mcp');
        const configPath = path.join(configDir, 'config.json');
        let data: Record<string, unknown> = {};
        if (fs.existsSync(configPath)) {
            data = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
        }
        data.telemetryEnabled = enabled;
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
        /* non-fatal */
    }
}

export async function activate(context: vscode.ExtensionContext) {
    extensionPathForDeactivate = context.extensionPath;

    runFirstInstallTelemetryIfNeeded(context);

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
        const ourExt = vscode.extensions.all.find((ext) => ext.id === context.extension.id);
        const shouldRegisterMcp = ourExt != null && ourExt.isActive;
        if (!shouldRegisterMcp) {
            console.log(
                'Browser DevTools MCP: Extension not in vscode.extensions.all or not active, skipping MCP registration.'
            );
        } else {
            await unregisterCursorMcp();
            // Kill any lingering MCP processes from a previous run, wait for them to exit, then register (same as Restart Server).
            await killCursorMcpProcesses();
            await registerCursorMcp();
            // Extension host kapanınca (Cursor kapanınca veya reload) MCP process'lerini de sonlandır.
            process.once('exit', async () => {
                await killCursorMcpProcesses();
            });
        }
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
                    await killCursorMcpProcesses();
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
                                await killCursorMcpProcesses();
                            })();
                        }
                    }
                    vscode.window.showInformationMessage(
                        `Browser DevTools MCP: Extension ${enabled ? 'enabled' : 'disabled'}. Restart the MCP session to apply changes.`
                    );
                } else if (e.affectsConfiguration(`${CONFIG_PREFIX}.telemetry.enable`)) {
                    try {
                        const telemetryEnabled = vscode.workspace
                            .getConfiguration(CONFIG_PREFIX)
                            .get<boolean>('telemetry.enable', true);
                        if (telemetryEnabled) {
                            syncTelemetryEnabledToConfig();
                        } else {
                            syncTelemetryDisabledToConfig();
                        }
                    } catch (err) {
                        console.error('[Browser DevTools MCP] Telemetry config change handling failed:', err);
                    }
                } else {
                    if (getCursorMcp() && isExtensionEnabled()) {
                        void (async () => {
                            await unregisterCursorMcp();
                            await killCursorMcpProcesses();
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

export async function deactivate(): Promise<void> {
    await unregisterCursorMcp();
    await killCursorMcpProcesses();

    // If we're in .obsolete, host is uninstalling us; send uninstall event (Cursor may not run vscode:uninstall).
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
                    await trackCursorExtUninstalled();
                }
            }
        } catch {
            /* non-fatal */
        }
    }

    console.log('Browser DevTools MCP extension deactivated');
}
