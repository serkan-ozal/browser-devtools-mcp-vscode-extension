import * as vscode from 'vscode';
import * as path from 'path';
import { SettingsWebviewProvider } from './settingsWebview';

// Configuration key prefix
const CONFIG_PREFIX = 'browserDevtoolsMcp';

// Map VS Code settings to environment variables
const SETTINGS_TO_ENV: Record<string, string> = {
    'browser.headless': 'BROWSER_HEADLESS_ENABLE',
    'browser.persistent': 'BROWSER_PERSISTENT_ENABLE',
    'browser.userDataDir': 'BROWSER_PERSISTENT_USER_DATA_DIR',
    'browser.useSystemBrowser': 'BROWSER_USE_INSTALLED_ON_SYSTEM',
    'browser.executablePath': 'BROWSER_EXECUTABLE_PATH',
    'browser.locale': 'BROWSER_LOCALE',
    platform: 'PLATFORM',
    'node.inspectorHost': 'NODE_INSPECTOR_HOST',
    'opentelemetry.enable': 'OTEL_ENABLE',
    'opentelemetry.serviceName': 'OTEL_SERVICE_NAME',
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
 * Get environment variables from VS Code settings
 */
function getEnvironmentFromSettings(): Record<string, string> {
    const config = vscode.workspace.getConfiguration(CONFIG_PREFIX);
    const env: Record<string, string> = {};

    for (const [settingKey, envVar] of Object.entries(SETTINGS_TO_ENV)) {
        const value = config.get(settingKey);

        if (value !== undefined && value !== null && value !== '') {
            // Convert boolean to string
            if (typeof value === 'boolean') {
                env[envVar] = value.toString();
            } else {
                env[envVar] = String(value);
            }
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
