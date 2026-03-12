import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { SettingsWebviewProvider } from './settingsWebview';

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
 * npm expects a package.json in the target dir; we create a minimal one so install has a valid project root.
 */
function doMcpServerInstall(installDir: string, version: string): void {
    fs.mkdirSync(installDir, { recursive: true });
    const pkgPath = path.join(installDir, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        fs.writeFileSync(pkgPath, JSON.stringify({ name: MCP_SERVER_INSTALL_DIR, private: true }, null, 2));
    }
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    cp.execSync(`${npmCmd} install browser-devtools-mcp@${version}`, {
        cwd: installDir,
        encoding: 'utf8',
        timeout: 120_000,
        stdio: 'pipe',
    });
}

function getExtensionVersion(context: vscode.ExtensionContext): string {
    const v = context.extension?.packageJSON?.version;
    return typeof v === 'string' ? v : '';
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
                showErrorWithIssueLink(
                    `Browser DevTools MCP: Install failed. ${msg} Check network and try again.`,
                    false,
                    err
                );
                throw err;
            }
            if (!fs.existsSync(serverPath)) {
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
                doMcpServerInstall(installDir, version);
                const serverPath = path.join(installDir, 'node_modules', 'browser-devtools-mcp', 'dist', 'index.js');
                if (fs.existsSync(serverPath)) {
                    cachedMcpServerPath = serverPath;
                }
                void vscode.window.showInformationMessage(
                    `Browser DevTools MCP: Installed browser-devtools-mcp@${version}. Restart the MCP server to use it.`
                );
            } catch (err) {
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
 */
function getPidsOfCursorMcpProcesses(): number[] {
    const pids: number[] = [];
    const marker = CURSOR_MCP_SERVER_ARG.toLowerCase();
    try {
        const platform = os.platform();
        if (platform === 'darwin' || platform === 'linux') {
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
    for (const pid of pids) {
        try {
            process.kill(pid, 'SIGTERM');
        } catch {
            // process may already be gone
        }
    }
    if (pids.length === 0) {
        return;
    }
    const deadline = Date.now() + KILL_MCP_PROCESSES_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const stillAlive = pids.filter((pid) => isProcessAlive(pid));
        if (stillAlive.length === 0) {
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

export async function activate(context: vscode.ExtensionContext) {
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
        await unregisterCursorMcp();
        // Kill any lingering MCP processes from a previous run, wait for them to exit, then register (same as Restart Server).
        await killCursorMcpProcesses();
        await registerCursorMcp();
        // Extension host kapanınca (Cursor kapanınca veya reload) MCP process'lerini de sonlandır.
        process.once('exit', async () => {
            await killCursorMcpProcesses();
        });
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
    console.log('Browser DevTools MCP extension deactivated');
}
