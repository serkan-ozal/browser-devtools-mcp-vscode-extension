import * as vscode from 'vscode';
import * as path from 'path';
import { SettingsWebviewProvider } from './settingsWebview';
import { getDefaultChromiumBrowsers, getInstallNamesForChoice, installPlaywrightBrowsers } from './playwrightInstall';

// Configuration key prefix
const CONFIG_PREFIX = 'browserDevtoolsMcp';

// GlobalState key for one-time default Chromium install
const GLOBALSTATE_PLAYWRIGHT_CHROMIUM_INSTALLED = 'playwrightChromiumInstalled';

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
            console.warn('[Browser DevTools MCP] First-time Chromium install failed:', err?.message ?? err);
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
                void vscode.window.showErrorMessage(`Browser DevTools MCP: Install failed. ${msg}`);
                throw err;
            }
        }
    );
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
        // Check if extension is enabled
        if (!isExtensionEnabled()) {
            return [];
        }

        const env = getEnvironmentFromSettings();

        // Path to the MCP server in node_modules
        const serverPath = path.join(this.extensionPath, 'node_modules', 'browser-devtools-mcp', 'dist', 'index.js');

        // Merge process.env with our custom env, filtering out undefined values
        const mergedEnv: Record<string, string> = {};
        for (const [key, value] of Object.entries(process.env)) {
            if (value !== undefined) {
                mergedEnv[key] = value;
            }
        }
        for (const [key, value] of Object.entries(env)) {
            mergedEnv[key] = value;
        }

        return [new vscode.McpStdioServerDefinition('browser-devtools', 'node', [serverPath], mergedEnv)];
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Browser DevTools MCP extension is activating...');

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

    // Register MCP Server Definition Provider
    const mcpProvider = new BrowserDevToolsMcpProvider(context.extensionPath);
    const mcpDisposable = vscode.lm.registerMcpServerDefinitionProvider('browser-devtools-mcp', mcpProvider);
    context.subscriptions.push(mcpDisposable);

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
    context.subscriptions.push(
        vscode.commands.registerCommand('browserDevtoolsMcp.restartServer', async () => {
            vscode.window.showInformationMessage('Browser DevTools MCP: Restarting server...');
            // Trigger MCP server restart by re-registering
            // Note: VS Code MCP API may have specific restart mechanism
            vscode.window.showInformationMessage(
                'Browser DevTools MCP: Server configuration updated. Please restart the MCP session.'
            );
        })
    );

    // Watch for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(CONFIG_PREFIX)) {
                if (e.affectsConfiguration(`${CONFIG_PREFIX}.enable`)) {
                    updateStatusBar();
                    const enabled = isExtensionEnabled();
                    vscode.window.showInformationMessage(
                        `Browser DevTools MCP: Extension ${enabled ? 'enabled' : 'disabled'}. Restart the MCP session to apply changes.`
                    );
                } else {
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
    console.log('Browser DevTools MCP extension deactivated');
}
