import * as fs from 'node:fs';
import * as https from 'node:https';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { startVisualizerWs, closeVisualizer } from './visualizer/ws';
import { getVisualizerAppHtml } from './visualizer/mcp-app-inline';
import {
    ensurePlaywrightBrowsersInstalled,
    installPlaywrightBrowsersByGroups,
    type PlaywrightBrowserInstallGroup,
} from './playwrightBrowsersInstall';
import { SettingsWebviewProvider } from './settingsWebview';
import {
    trackCursorExtActivated,
    trackCursorExtDeactivated,
    trackCursorExtInstallFailed,
    trackCursorExtInstalled,
    trackCursorExtUninstallFailed,
    trackCursorExtUninstalled,
    writeTelemetryEnabledToConfig,
} from './telemetry';

// Configuration key prefix
const CONFIG_PREFIX = 'browserDevtoolsMcp';

// GitHub repo for issue reporting when install fails
const GITHUB_ISSUES_BASE = 'https://github.com/serkan-ozal/browser-devtools-mcp-vscode-extension/issues/new';

/** File under globalStorage to track extension version for first-run / upgrade; only one activate runs onInstall. */
const EXTENSION_VERSION_FILE = '.extension-version';

/** Cursor rule file copied to ~/.cursor/rules/ on install and removed on uninstall. */
const CURSOR_RULE_FILE_NAME = 'browser-devtools-use.mdc';
/** How long to show "Cursor rule installed" in the status bar after onInstall. */
const CURSOR_RULE_STATUS_DURATION_MS = 5000;

/** MCP server name used for Cursor register/unregister and VS Code provider definition. */
const MCP_SERVER_NAME = 'browser-devtools';
const EXTENSION_ID = 'serkan-ozal.browser-devtools-mcp-vscode';
/** CLI arg added when we start the MCP server so we can identify our processes for kill (avoids killing extension host). */
const CURSOR_MCP_SERVER_ARG = '--cursor-mcp-server';
const OPEN_VSX_EXTENSION_API_URL = 'https://open-vsx.org/api/serkan-ozal/browser-devtools-mcp-vscode';
const LAST_UPDATE_PROMPTED_AT_KEY = 'last-update-prompted-at';
const UPDATE_PROMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

let cachedMcpServerPath: string | null = null;

/** Set in activate; deactivate receives no context so we keep these for .obsolete check and runUninstallIfNeeded. */
let extensionPathForDeactivate: string | null = null;
let globalStoragePathForDeactivate: string | null = null;
let extensionVersionForDeactivate: string = '';
let uninstallInProgress: boolean = false;

/**
 * While true, install.* configuration changes from "Install Playwright Browsers" skip the
 * onDidChangeConfiguration auto-install (that command updates settings and runs install once).
 */
let suppressConfigDrivenBrowserReinstall: boolean = false;

// Map VS Code settings to environment variables
const SETTINGS_TO_ENV: Record<string, string> = {
    'browser.headless': 'BROWSER_HEADLESS_ENABLE',
    'browser.persistent': 'BROWSER_PERSISTENT_ENABLE',
    'browser.userDataDir': 'BROWSER_PERSISTENT_USER_DATA_DIR',
    'browser.useSystemBrowser': 'BROWSER_USE_INSTALLED_ON_SYSTEM',
    'browser.executablePath': 'BROWSER_EXECUTABLE_PATH',
    'browser.locale': 'BROWSER_LOCALE',
    'browser.cdp.enable': 'BROWSER_CDP_ENABLE',
    'browser.cdp.endpointUrl': 'BROWSER_CDP_ENDPOINT_URL',
    'browser.cdp.openInspect': 'BROWSER_CDP_OPEN_INSPECT',
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
    'visualizer.enable': 'VISUALIZER_ENABLE',
    'visualizer.wsPort': 'VIS_WS_PORT',
};

// Status bar item
let statusBarItem: vscode.StatusBarItem;

// Visualizer panel (singleton)
let visualizerPanel: vscode.WebviewPanel | undefined;

const SELECTED_CHAR_KEY = 'visualizer.selectedChar';

function showVisualizerPanel(context: vscode.ExtensionContext, wsPort: number): void {
    if (visualizerPanel) {
        visualizerPanel.reveal(vscode.ViewColumn.Two);
        return;
    }
    visualizerPanel = vscode.window.createWebviewPanel(
        'mcpVisualizer',
        'MCP Visualizer',
        vscode.ViewColumn.Two,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
        }
    );
    const savedChar = context.globalState.get<string>(SELECTED_CHAR_KEY);
    visualizerPanel.webview.html = getVisualizerAppHtml(wsPort, context.extensionPath, savedChar);

    // Persist character selection when the webview sends a save_char message
    visualizerPanel.webview.onDidReceiveMessage(
        (msg: unknown) => {
            if (msg && typeof msg === 'object' && (msg as Record<string, unknown>).type === 'save_char') {
                const char = (msg as Record<string, unknown>).char;
                if (typeof char === 'string') {
                    void context.globalState.update(SELECTED_CHAR_KEY, char);
                }
            }
        },
        undefined,
        context.subscriptions,
    );

    visualizerPanel.onDidDispose(() => { visualizerPanel = undefined; }, null, context.subscriptions);
}

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

function getExtensionVersion(context: vscode.ExtensionContext): string {
    const v = context.extension?.packageJSON?.version;
    return typeof v === 'string' ? v : '';
}

function compareSemver(a: string, b: string): number {
    const pa: number[] = a.split('.').map((x) => Number.parseInt(x, 10) || 0);
    const pb: number[] = b.split('.').map((x) => Number.parseInt(x, 10) || 0);
    const len: number = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i += 1) {
        const av: number = pa[i] ?? 0;
        const bv: number = pb[i] ?? 0;
        if (av > bv) {
            return 1;
        }
        if (av < bv) {
            return -1;
        }
    }
    return 0;
}

async function fetchLatestPublishedVersion(): Promise<string | null> {
    return await new Promise((resolve) => {
        const req = https.get(OPEN_VSX_EXTENSION_API_URL, (res) => {
            if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
                resolve(null);
                return;
            }
            const chunks: Buffer[] = [];
            res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            res.on('end', () => {
                try {
                    const json = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { version?: string };
                    resolve(typeof json.version === 'string' ? json.version : null);
                } catch {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(3000, () => {
            req.destroy();
            resolve(null);
        });
    });
}

async function maybePromptExtensionUpdate(context: vscode.ExtensionContext): Promise<void> {
    if (!isCursor()) {
        return;
    }
    const currentVersion: string = getExtensionVersion(context);
    if (!currentVersion) {
        return;
    }

    const latestVersion: string | null = await fetchLatestPublishedVersion();
    if (!latestVersion || compareSemver(latestVersion, currentVersion) <= 0) {
        return;
    }

    const now: number = Date.now();
    const lastPromptedAt: number = context.globalState.get<number>(LAST_UPDATE_PROMPTED_AT_KEY, 0);
    if (now - lastPromptedAt < UPDATE_PROMPT_COOLDOWN_MS) {
        return;
    }

    await context.globalState.update(LAST_UPDATE_PROMPTED_AT_KEY, now);
    const choice: 'Install Update' | 'Later' | undefined = await vscode.window.showInformationMessage(
        `Browser DevTools MCP update available (${currentVersion} -> ${latestVersion}).`,
        'Install Update',
        'Later'
    );
    if (choice !== 'Install Update') {
        return;
    }
    try {
        await vscode.commands.executeCommand('workbench.extensions.installExtension', EXTENSION_ID);
        void vscode.window.showInformationMessage(
            'Browser DevTools MCP update installed. Reload the window if needed.'
        );
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[Browser DevTools MCP] Failed to install extension update:', msg);
        void vscode.window.showWarningMessage(
            `Browser DevTools MCP: Failed to install update automatically. Please update from Extensions. ${msg}`
        );
    }
}

// ── Cursor Hooks bridge ──────────────────────────────────────────────────────

/** Hook events the visualizer listens for. */
const HOOK_EVENTS = [
    'sessionStart',
    'beforeMCPExecution',
    'afterMCPExecution',
    'preToolUse',
    'postToolUse',
    'afterAgentResponse',
    'stop',
] as const;

/** Marker used to identify hook entries installed by this extension. */
const HOOK_SCRIPT_NAME = 'browser-devtools-hook.mjs';

interface HookEntry {
    type: string;
    command: string;
    timeout: number;
    failClosed: boolean;
}

interface HooksConfig {
    version: number;
    hooks: Record<string, HookEntry[]>;
}

/**
 * Copy cursor-hook.mjs to <workspace>/.cursor/scripts/ and merge hook entries
 * into <workspace>/.cursor/hooks.json. Existing third-party entries are preserved.
 */
function installCursorHooks(workspaceFolder: string, hookScriptSrc: string): void {
    try {
        const cursorDir = path.join(workspaceFolder, '.cursor');
        const scriptsDir = path.join(cursorDir, 'scripts');
        const hookDest = path.join(scriptsDir, HOOK_SCRIPT_NAME);
        const hooksFile = path.join(cursorDir, 'hooks.json');

        fs.mkdirSync(scriptsDir, { recursive: true });
        fs.copyFileSync(hookScriptSrc, hookDest);

        let config: HooksConfig = { version: 1, hooks: {} };
        if (fs.existsSync(hooksFile)) {
            try {
                config = JSON.parse(fs.readFileSync(hooksFile, 'utf8')) as HooksConfig;
            } catch { /* use default */ }
        }
        if (!config.hooks) config.hooks = {};

        const command = `node ./.cursor/scripts/${HOOK_SCRIPT_NAME}`;
        const entry: HookEntry = { type: 'command', command, timeout: 5, failClosed: false };

        for (const event of HOOK_EVENTS) {
            if (!config.hooks[event]) config.hooks[event] = [];
            // Remove stale entries from a previous install, then append fresh one
            config.hooks[event] = config.hooks[event].filter((h) => !h.command.includes(HOOK_SCRIPT_NAME));
            config.hooks[event].push(entry);
        }

        fs.writeFileSync(hooksFile, JSON.stringify(config, null, 2) + '\n', 'utf8');
        console.log('[Browser DevTools MCP] Cursor hooks installed in', workspaceFolder);
    } catch (err) {
        console.warn('[Browser DevTools MCP] Failed to install Cursor hooks:', err);
    }
}

/**
 * Remove hook entries and the copied script from <workspace>/.cursor/.
 * hooks.json is deleted only if it becomes empty after removal.
 */
function removeCursorHooks(workspaceFolder: string): void {
    try {
        const cursorDir = path.join(workspaceFolder, '.cursor');
        const hookDest = path.join(cursorDir, 'scripts', HOOK_SCRIPT_NAME);
        const hooksFile = path.join(cursorDir, 'hooks.json');

        if (fs.existsSync(hookDest)) fs.unlinkSync(hookDest);

        if (fs.existsSync(hooksFile)) {
            let config: HooksConfig;
            try {
                config = JSON.parse(fs.readFileSync(hooksFile, 'utf8')) as HooksConfig;
            } catch {
                return;
            }
            for (const event of Object.keys(config.hooks ?? {})) {
                config.hooks[event] = (config.hooks[event] ?? []).filter((h) => !h.command.includes(HOOK_SCRIPT_NAME));
                if (config.hooks[event].length === 0) delete config.hooks[event];
            }
            if (Object.keys(config.hooks ?? {}).length === 0) {
                fs.unlinkSync(hooksFile);
            } else {
                fs.writeFileSync(hooksFile, JSON.stringify(config, null, 2) + '\n', 'utf8');
            }
        }
        console.log('[Browser DevTools MCP] Cursor hooks removed from', workspaceFolder);
    } catch (err) {
        console.warn('[Browser DevTools MCP] Failed to remove Cursor hooks:', err);
    }
}

/**
 * Install or remove Cursor hooks in every open workspace folder.
 */
function syncCursorHooks(extensionPath: string, enable: boolean): void {
    const hookSrc = path.join(extensionPath, 'scripts', 'cursor-hook.mjs');
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
        if (enable) {
            installCursorHooks(folder.uri.fsPath, hookSrc);
        } else {
            removeCursorHooks(folder.uri.fsPath);
        }
    }
}

// ────────────────────────────────────────────────────────────────────────────

/**
 * Called once on first install or when extension version changes.
 * Copies Cursor rule to ~/.cursor/rules/ and installs Playwright browsers into the default cache.
 */
async function onInstall(context: vscode.ExtensionContext): Promise<void> {
    try {
        const source = path.join(context.extensionPath, 'rules', CURSOR_RULE_FILE_NAME);
        if (fs.existsSync(source)) {
            const destDir = path.join(os.homedir(), '.cursor', 'rules');
            const dest = path.join(destDir, CURSOR_RULE_FILE_NAME);
            fs.mkdirSync(destDir, { recursive: true });
            fs.copyFileSync(source, dest);
            if (statusBarItem) {
                statusBarItem.text = '$(globe) Browser DevTools · Cursor rule installed';
                statusBarItem.tooltip = 'Browser DevTools MCP: Cursor rule added to ~/.cursor/rules';
                setTimeout(() => updateStatusBar(), CURSOR_RULE_STATUS_DURATION_MS);
            }
        }

        await ensurePlaywrightBrowsersInstalled(context.extensionPath, CONFIG_PREFIX, {
            extensionVersion: getExtensionVersion(context),
            trigger: 'install',
        });
    } catch (err) {
        console.error('[Browser DevTools MCP] onInstall failed:', err);
        const msg = err instanceof Error ? err.message : String(err);
        void trackCursorExtInstallFailed(
            (context.extension.packageJSON as { version?: string }).version ?? '0.0.0',
            msg
        );
    }
}

/**
 * If globalStorage .extension-version is missing or differs from current version, write it and call onInstall().
 * Returns true when first install or upgrade path ran (onInstall executed). cursor_ext_installed is sent only after bundled MCP path resolves.
 * TODO: If multiple windows (separate extension host processes) can activate at once and only one must run onInstall(),
 * use a file lock: create a .extension-version.lock file with fs.writeFileSync(..., { flag: 'wx' }); only one process succeeds;
 * others poll until the lock is removed, then re-read .extension-version and skip if already current.
 */
async function runInstallIfNeeded(context: vscode.ExtensionContext): Promise<boolean> {
    const versionFilePath = path.join(context.globalStoragePath, EXTENSION_VERSION_FILE);
    const currentVersion = getExtensionVersion(context);
    const stored = fs.existsSync(versionFilePath) ? fs.readFileSync(versionFilePath, 'utf8').trim() : '';
    if (stored === currentVersion) {
        return false;
    }
    try {
        fs.mkdirSync(context.globalStoragePath, { recursive: true });
        fs.writeFileSync(versionFilePath, currentVersion, 'utf8');
        await onInstall(context);
        return true;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        void trackCursorExtInstallFailed(currentVersion, msg);
        throw err;
    }
}

/**
 * Resolve path to browser-devtools-mcp dist/index.js from the VSIX-bundled copy.
 * Published builds ship platform-specific native deps (sharp) via per-target VSIX packaging in CI.
 */
async function ensureMcpServerInstalled(context: vscode.ExtensionContext): Promise<string> {
    if (cachedMcpServerPath !== null) {
        return cachedMcpServerPath;
    }
    const bundledPath = path.join(context.extensionPath, 'node_modules', 'browser-devtools-mcp', 'dist', 'index.js');

    if (fs.existsSync(bundledPath)) {
        cachedMcpServerPath = bundledPath;
        console.log('[Browser DevTools MCP] Using bundled MCP server:', bundledPath);
        return bundledPath;
    }

    const currentVersion = getExtensionVersion(context);
    const msg =
        'Bundled MCP server not found (browser-devtools-mcp). Reinstall the extension or install a fresh VSIX from the marketplace.';
    void trackCursorExtInstallFailed(currentVersion, `MCP: ${msg}`);
    const err = new Error(msg);
    showErrorWithIssueLink(`Browser DevTools MCP: ${msg}`, false, err);
    throw err;
}

/**
 * Command palette: pick Playwright browser groups to download (Chromium pre-selected = Chrome automation stack).
 */
async function installBrowsersCommand(context: vscode.ExtensionContext): Promise<void> {
    const items: vscode.QuickPickItem[] = [
        {
            label: 'Chromium',
            description: 'Chromium, headless shell, ffmpeg (default)',
            picked: true,
        },
        { label: 'Firefox', description: 'Mozilla Firefox' },
        { label: 'WebKit', description: 'WebKit (Safari engine)' },
    ];

    const selected: vscode.QuickPickItem[] | undefined = await vscode.window.showQuickPick(items, {
        title: 'Browser DevTools MCP: Install Playwright browsers',
        placeHolder: 'Space to toggle, Enter to download',
        canPickMany: true,
    });

    if (selected === undefined) {
        return;
    }
    if (selected.length === 0) {
        void vscode.window.showWarningMessage('Browser DevTools MCP: Select at least one browser.');
        return;
    }

    const groups: PlaywrightBrowserInstallGroup[] = [];
    for (const item of selected) {
        if (item.label === 'Chromium') {
            groups.push('chromium');
        } else if (item.label === 'Firefox') {
            groups.push('firefox');
        } else if (item.label === 'WebKit') {
            groups.push('webkit');
        }
    }

    const wantChromium: boolean = groups.includes('chromium');
    const wantFirefox: boolean = groups.includes('firefox');
    const wantWebkit: boolean = groups.includes('webkit');

    const config = vscode.workspace.getConfiguration(CONFIG_PREFIX);
    suppressConfigDrivenBrowserReinstall = true;
    try {
        await config.update('install.chromium', wantChromium, vscode.ConfigurationTarget.Global);
        await config.update('install.firefox', wantFirefox, vscode.ConfigurationTarget.Global);
        await config.update('install.webkit', wantWebkit, vscode.ConfigurationTarget.Global);

        const ok: boolean = await installPlaywrightBrowsersByGroups(context.extensionPath, groups, {
            extensionVersion: getExtensionVersion(context),
            trigger: 'command',
            configPrefix: CONFIG_PREFIX,
        });
        if (ok) {
            void vscode.window.showInformationMessage(
                'Browser DevTools MCP: Updated install.* settings and finished Playwright browser download. Restart the MCP session if the server was already running.'
            );
        } else {
            void vscode.window.showWarningMessage(
                'Browser DevTools MCP: install.* settings were updated, but the browser download failed. Check the Output panel or try again.'
            );
        }
    } finally {
        suppressConfigDrivenBrowserReinstall = false;
    }
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
async function registerCursorMcp(): Promise<boolean> {
    const cursorMcp = getCursorMcp();
    if (!cursorMcp) {
        return false;
    }
    const config = getMcpServerConfig();
    if (!config) {
        return false;
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
        return true;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[Browser DevTools MCP] Cursor MCP register failed:', msg);
        showErrorWithIssueLink(
            `Browser DevTools MCP: Failed to register MCP server with Cursor. ${msg} Please report the issue if it persists.`,
            true,
            err
        );
        return false;
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
async function unregisterCursorMcp(): Promise<boolean> {
    const cursorMcp = getCursorMcp();
    if (!cursorMcp) {
        return false;
    }
    try {
        cursorMcp.unregisterServer(MCP_SERVER_NAME);
        console.log('[Browser DevTools MCP] Unregistered MCP server from Cursor.');
        await sleep(REGISTER_UNREGISTER_SLEEP_MS);
        return true;
    } catch (err) {
        console.warn('[Browser DevTools MCP] Cursor MCP unregister failed:', err);
        return false;
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
        if (uninstallInProgress) {
            return [];
        }
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
    const didRunExtensionInstall: boolean = await runInstallIfNeeded(context);

    // before status bar uses it
    context.subscriptions.push(vscode.commands.registerCommand('browserDevtoolsMcp.toggleExtension', toggleExtension));

    // after command is registered
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'browserDevtoolsMcp.toggleExtension';
    updateStatusBar();
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Resolve bundled (VSIX) browser-devtools-mcp entrypoint
    await ensureMcpServerInstalled(context);

    // Register MCP: Cursor uses cursor.mcp.registerServer; VS Code uses lm.registerMcpServerDefinitionProvider (VS Code 1.96+).
    let mcpServerRegistered: boolean = false;
    if (isCursor()) {
        mcpServerRegistered = await registerCursorMcp();
    } else if (vscode.lm?.registerMcpServerDefinitionProvider) {
        const mcpProvider = new BrowserDevToolsMcpProvider(context.extensionPath);
        const mcpDisposable = vscode.lm.registerMcpServerDefinitionProvider('browser-devtools-mcp', mcpProvider);
        context.subscriptions.push(mcpDisposable);
        console.log('[Browser DevTools MCP] Registered MCP server with VS Code.');
        mcpServerRegistered = true;
    } else {
        const msg = 'No MCP API available. Use VS Code 1.96+ or a recent Cursor version.';
        console.warn('[Browser DevTools MCP]', msg);
        void vscode.window.showWarningMessage(`Browser DevTools MCP: ${msg}`);
    }

    // Full extension install success = MCP path ready (bundled per platform in published VSIX).
    // Include MCP registration result as a telemetry property.
    if (didRunExtensionInstall) {
        void trackCursorExtInstalled(getExtensionVersion(context), mcpServerRegistered);
    }
    void trackCursorExtActivated(getExtensionVersion(context), mcpServerRegistered);

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

    // Register Install Playwright Browsers (user picks Chromium / Firefox / WebKit; Chromium pre-selected)
    context.subscriptions.push(
        vscode.commands.registerCommand('browserDevtoolsMcp.installBrowsers', () => installBrowsersCommand(context))
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

    void maybePromptExtensionUpdate(context);

    // Register Show Visualizer command — only works when visualizer.enable is true
    context.subscriptions.push(
        vscode.commands.registerCommand('browserDevtoolsMcp.showVisualizer', () => {
            const cfg = vscode.workspace.getConfiguration(CONFIG_PREFIX);
            if (!cfg.get<boolean>('visualizer.enable', false)) {
                void vscode.window.showInformationMessage(
                    'MCP Visualizer is disabled. Enable it in settings (browserDevtoolsMcp.visualizer.enable) first.',
                );
                return;
            }
            const wsPort = cfg.get<number>('visualizer.wsPort', 3020);
            startVisualizerWs({ port: wsPort, getSelectedChar: () => context.globalState.get<string>(SELECTED_CHAR_KEY) });
            showVisualizerPanel(context, wsPort);
        })
    );

    // Start visualizer WebSocket server + install Cursor hooks if enabled
    // Panel auto-opens on first run_started event from the hooks bridge
    const config = vscode.workspace.getConfiguration(CONFIG_PREFIX);
    if (config.get<boolean>('visualizer.enable', false)) {
        const wsPort = config.get<number>('visualizer.wsPort', 3020);
        startVisualizerWs({
            port: wsPort,
            onRunStarted: () => showVisualizerPanel(context, wsPort),
            getSelectedChar: () => context.globalState.get<string>(SELECTED_CHAR_KEY),
        });
        syncCursorHooks(context.extensionPath, true);
    }

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
                    if (suppressConfigDrivenBrowserReinstall) {
                        return;
                    }
                    void ensurePlaywrightBrowsersInstalled(extensionPathForDeactivate ?? '', CONFIG_PREFIX, {
                        extensionVersion: extensionVersionForDeactivate || '0.0.0',
                        trigger: 'settings_change',
                    });
                    vscode.window.showInformationMessage(
                        'Browser DevTools MCP: Browser install settings changed. Browsers are being updated; restart the MCP session if it was already running.'
                    );
                } else if (e.affectsConfiguration(`${CONFIG_PREFIX}.visualizer.enable`)) {
                    const vizEnabled = vscode.workspace.getConfiguration(CONFIG_PREFIX).get<boolean>('visualizer.enable', false);
                    if (vizEnabled) {
                        const wsPort = vscode.workspace.getConfiguration(CONFIG_PREFIX).get<number>('visualizer.wsPort', 3020);
                        startVisualizerWs({
                            port: wsPort,
                            onRunStarted: () => showVisualizerPanel(context, wsPort),
                            getSelectedChar: () => context.globalState.get<string>(SELECTED_CHAR_KEY),
                        });
                        syncCursorHooks(context.extensionPath, true);
                    } else {
                        void closeVisualizer();
                        syncCursorHooks(context.extensionPath, false);
                    }
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
async function onUninstall(mcpServerUnregistered: boolean): Promise<void> {
    // Remove Cursor hooks from all open workspace folders
    if (extensionPathForDeactivate) {
        syncCursorHooks(extensionPathForDeactivate, false);
    }

    try {
        const rulePath = path.join(os.homedir(), '.cursor', 'rules', CURSOR_RULE_FILE_NAME);
        if (fs.existsSync(rulePath)) {
            fs.unlinkSync(rulePath);
            if (statusBarItem) {
                statusBarItem.text = '$(globe) Browser DevTools · Cursor rule removed';
                statusBarItem.tooltip = 'Browser DevTools MCP: Cursor rule removed from ~/.cursor/rules';
            }
        }
    } catch (err) {
        console.error('[Browser DevTools MCP] Failed to remove Cursor rule from ~/.cursor/rules:', err);
        const msg = err instanceof Error ? err.message : String(err);
        void trackCursorExtUninstallFailed(extensionVersionForDeactivate, msg);
    }

    try {
        await trackCursorExtUninstalled(extensionVersionForDeactivate || '0.0.0', mcpServerUnregistered);
    } catch (err) {
        console.error('[Browser DevTools MCP] Failed to track cursor extension uninstalled:', err);
        const msg = err instanceof Error ? err.message : String(err);
        void trackCursorExtUninstallFailed(extensionVersionForDeactivate, msg);
    }
}

/**
 * Try to delete globalStorage .extension-version; only the process that succeeds calls onUninstall(), so concurrent deactivates (e.g. multiple windows) result in a single onUninstall().
 */
async function runUninstallIfNeeded(mcpServerUnregistered: boolean): Promise<void> {
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
    await onUninstall(mcpServerUnregistered);
}

export async function deactivate(): Promise<void> {
    await closeVisualizer();
    let mcpServerUnregistered: boolean = false;
    if (isCursor()) {
        mcpServerUnregistered = await unregisterCursorMcp();
    }
    await trackCursorExtDeactivated(extensionVersionForDeactivate || '0.0.0', mcpServerUnregistered);
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
                    if (!isCursor()) {
                        // VS Code unregisters MCP provider via deactivate; while uninstalling,
                        // provider returns [] so host does not assume server is still available.
                        uninstallInProgress = true;
                        mcpServerUnregistered = true;
                    }
                    await runUninstallIfNeeded(mcpServerUnregistered);
                }
            }
        } catch {
            /* non-fatal */
        }
    }
}
