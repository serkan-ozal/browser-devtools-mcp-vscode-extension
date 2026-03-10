import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { SettingsWebviewProvider } from './settingsWebview';
import { getDefaultChromiumBrowsers, getInstallNamesForChoice, installPlaywrightBrowsers } from './playwrightInstall';

// Configuration key prefix
const CONFIG_PREFIX = 'browserDevtoolsMcp';

// GlobalState key for one-time default Chromium install
const GLOBALSTATE_PLAYWRIGHT_CHROMIUM_INSTALLED = 'playwrightChromiumInstalled';

// GitHub repo for issue reporting when install fails
const GITHUB_ISSUES_URL = 'https://github.com/serkan-ozal/browser-devtools-mcp-vscode-extension/issues/new';

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

/**
 * Run default Chromium install once per machine (background). Uses globalState so we don't run again.
 */
function runFirstTimeChromiumInstall(context: vscode.ExtensionContext): void {
    if (context.globalState.get(GLOBALSTATE_PLAYWRIGHT_CHROMIUM_INSTALLED)) {
        return;
    }
    if (
        process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === '1' ||
        process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === 'true'
    ) {
        return;
    }
    const toInstall = getDefaultChromiumBrowsers();
    void installPlaywrightBrowsers(toInstall)
        .then(() => {
            void context.globalState.update(GLOBALSTATE_PLAYWRIGHT_CHROMIUM_INSTALLED, true);
            console.log('[Browser DevTools MCP] Default Chromium browsers installed.');
        })
        .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn('[Browser DevTools MCP] First-time Chromium install failed:', msg);
            void vscode.window
                .showWarningMessage(
                    `Browser DevTools MCP: Automatic browser install failed. ${msg} Please report the issue if it persists.`,
                    'Open issue on GitHub'
                )
                .then((choice) => {
                    if (choice === 'Open issue on GitHub') {
                        void vscode.env.openExternal(vscode.Uri.parse(GITHUB_ISSUES_URL));
                    }
                });
        });
}

/**
 * Command: let user pick Chromium, Firefox, and/or WebKit and install selected browsers.
 */
async function installBrowsersCommand(): Promise<void> {
    const choices = [
        { label: 'Chromium (default for MCP)', value: 'chromium' },
        { label: 'Firefox', value: 'firefox' },
        { label: 'WebKit', value: 'webkit' },
    ];
    const picked = await vscode.window.showQuickPick(choices, {
        title: 'Install Playwright browsers',
        placeHolder: 'Select one or more browsers to install',
        canPickMany: true,
    });
    if (!picked || picked.length === 0) {
        return;
    }
    const browserNames: string[] = [];
    for (const p of picked) {
        browserNames.push(...getInstallNamesForChoice(p.value));
    }
    const unique = [...new Set(browserNames)];
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Browser DevTools MCP',
            cancellable: false,
        },
        async (progress) => {
            progress.report({ message: `Installing ${unique.join(', ')}...` });
            try {
                await installPlaywrightBrowsers(unique);
                void vscode.window.showInformationMessage(`Browser DevTools MCP: Installed ${unique.join(', ')}.`);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                void vscode.window
                    .showErrorMessage(
                        `Browser DevTools MCP: Install failed. ${msg} Please report the issue if it persists.`,
                        'Open issue on GitHub'
                    )
                    .then((choice) => {
                        if (choice === 'Open issue on GitHub') {
                            void vscode.env.openExternal(vscode.Uri.parse(GITHUB_ISSUES_URL));
                        }
                    });
                throw err;
            }
        }
    );
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
    if (v.cursor !== undefined) return true;
    const appName = (vscode.env as { appName?: string }).appName ?? '';
    return appName.toLowerCase().includes('cursor');
}

/**
 * Get MCP server path and merged env for current settings. Returns null if extension is disabled.
 */
function getMcpServerConfig(extensionPath: string): {
    command: string;
    args: string[];
    env: Record<string, string>;
} | null {
    if (!isExtensionEnabled()) {
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
        if (value !== undefined && typeof value === 'string') mergedEnv[key] = value;
    }

    const serverPath = path.join(extensionPath, 'node_modules', 'browser-devtools-mcp', 'dist', 'index.js');
    if (!fs.existsSync(serverPath)) {
        const msg = 'Bundled MCP server not found. Please reinstall the extension.';
        console.error('[Browser DevTools MCP]', msg, serverPath);
        void vscode.window.showErrorMessage(`Browser DevTools MCP: ${msg}`);
        return null;
    }
    console.log('[Browser DevTools MCP] Using bundled server:', serverPath);
    return { command: 'node', args: [serverPath], env: mergedEnv };
}

/**
 * Show warning with GitHub issue link (for Cursor MCP or other extension errors).
 */
function showErrorWithIssueLink(message: string, isWarning = false): void {
    const show = isWarning ? vscode.window.showWarningMessage : vscode.window.showErrorMessage;
    void show(message, 'Open issue on GitHub').then((choice) => {
        if (choice === 'Open issue on GitHub') {
            void vscode.env.openExternal(vscode.Uri.parse(GITHUB_ISSUES_URL));
        }
    });
}

/**
 * Register MCP server with Cursor's API so it appears without user editing mcp.json.
 * Uses bundled server only (no npx fallback).
 */
function registerCursorMcp(extensionPath: string): void {
    const cursorMcp = getCursorMcp();
    if (!cursorMcp) {
        return;
    }
    const config = getMcpServerConfig(extensionPath);
    if (!config) {
        return;
    }
    try {
        const env: Record<string, string> = {};
        for (const [k, v] of Object.entries(config.env)) {
            if (typeof v === 'string') env[k] = v;
        }
        cursorMcp.registerServer({
            name: 'browser-devtools',
            server: {
                command: config.command ?? 'node',
                args: Array.isArray(config.args) ? config.args : [config.args].filter(Boolean),
                env,
            },
        });
        console.log('[Browser DevTools MCP] Registered MCP server with Cursor.');
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[Browser DevTools MCP] Cursor MCP register failed:', msg);
        showErrorWithIssueLink(
            `Browser DevTools MCP: Failed to register MCP server with Cursor. ${msg} Please report the issue if it persists.`,
            true
        );
    }
}

/**
 * Find PIDs of node processes that run our MCP server and were started from Cursor (path contains "cursor").
 * Used on extension deactivate to kill lingering Cursor MCP processes.
 */
function getPidsOfCursorMcpProcesses(): number[] {
    const pids: number[] = [];
    const cmdLower = 'browser-devtools-mcp';
    const cursorLower = 'cursor';
    try {
        const platform = os.platform();
        if (platform === 'darwin' || platform === 'linux') {
            const out = cp.execSync('ps -eo pid,args', { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
            for (const line of out.split('\n')) {
                const m = line.match(/^\s*(\d+)\s+(.*)/);
                if (!m) continue;
                const args = m[2].toLowerCase();
                if (args.includes(cmdLower) && args.includes(cursorLower)) pids.push(parseInt(m[1], 10));
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
                if (pidMatch) currentPid = parseInt(pidMatch[1], 10);
                const cmdMatch = line.match(/CommandLine=(.*)/);
                if (cmdMatch && currentPid !== null) {
                    const args = cmdMatch[1].toLowerCase();
                    if (args.includes(cmdLower) && args.includes(cursorLower)) pids.push(currentPid);
                    currentPid = null;
                }
            }
        }
    } catch (_) {
        // ignore: ps/wmic may fail in some environments
    }
    return pids;
}

/**
 * Kill node processes that run our MCP server and were started from Cursor (path contains "cursor").
 */
function killCursorMcpProcesses(): void {
    const pids = getPidsOfCursorMcpProcesses();
    for (const pid of pids) {
        try {
            process.kill(pid, 'SIGTERM');
        } catch (_) {
            // process may already be gone
        }
    }
}

/**
 * Unregister MCP server from Cursor (on deactivate or disable).
 */
function unregisterCursorMcp(): void {
    const cursorMcp = getCursorMcp();
    if (!cursorMcp) {
        return;
    }
    try {
        cursorMcp.unregisterServer('browser-devtools');
        console.log('[Browser DevTools MCP] Unregistered MCP server from Cursor.');
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
        const config = getMcpServerConfig(this.extensionPath);
        if (!config) {
            return [];
        }
        return [new vscode.McpStdioServerDefinition('browser-devtools', config.command, config.args, config.env)];
    }
}

export function activate(context: vscode.ExtensionContext) {
    // One-time default Chromium install (background)
    runFirstTimeChromiumInstall(context);

    // before status bar uses it
    context.subscriptions.push(vscode.commands.registerCommand('browserDevtoolsMcp.toggleExtension', toggleExtension));

    // after command is registered
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'browserDevtoolsMcp.toggleExtension';
    updateStatusBar();
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register MCP: Cursor uses cursor.mcp.registerServer; VS Code uses lm.registerMcpServerDefinitionProvider (VS Code 1.96+).
    if (isCursor()) {
        registerCursorMcp(context.extensionPath);
        // Extension host kapanınca (Cursor kapanınca veya reload) MCP process'lerini de sonlandır.
        process.once('exit', () => {
            killCursorMcpProcesses();
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

    // Register Install Browsers Command
    context.subscriptions.push(
        vscode.commands.registerCommand('browserDevtoolsMcp.installBrowsers', installBrowsersCommand)
    );

    // Register Restart Server Command
    const extensionPath = context.extensionPath;
    context.subscriptions.push(
        vscode.commands.registerCommand('browserDevtoolsMcp.restartServer', async () => {
            if (isExtensionEnabled()) {
                if (getCursorMcp()) {
                    unregisterCursorMcp();
                    killCursorMcpProcesses();
                    registerCursorMcp(extensionPath);
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
                            registerCursorMcp(context.extensionPath);
                        } else {
                            unregisterCursorMcp();
                            killCursorMcpProcesses();
                        }
                    }
                    vscode.window.showInformationMessage(
                        `Browser DevTools MCP: Extension ${enabled ? 'enabled' : 'disabled'}. Restart the MCP session to apply changes.`
                    );
                } else {
                    if (getCursorMcp() && isExtensionEnabled()) {
                        unregisterCursorMcp();
                        killCursorMcpProcesses();
                        registerCursorMcp(context.extensionPath);
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

export function deactivate() {
    unregisterCursorMcp();
    killCursorMcpProcesses();
    console.log('Browser DevTools MCP extension deactivated');
}
