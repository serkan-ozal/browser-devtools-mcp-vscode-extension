import * as vscode from 'vscode';

export class SettingsWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'browserDevtoolsMcp.settingsView';

    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'updateSetting': {
                    const config = vscode.workspace.getConfiguration('browserDevtoolsMcp');
                    await config.update(data.key, data.value, vscode.ConfigurationTarget.Global);
                    break;
                }
                case 'openSettings': {
                    vscode.commands.executeCommand(
                        'workbench.action.openSettings',
                        '@ext:serkan-ozal.browser-devtools-mcp'
                    );
                    break;
                }
                case 'getSettings': {
                    this._sendSettings();
                    break;
                }
            }
        });

        // Send initial settings
        this._sendSettings();

        // Watch for config changes
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('browserDevtoolsMcp')) {
                this._sendSettings();
            }
        });
    }

    private _sendSettings() {
        if (this._view) {
            const config = vscode.workspace.getConfiguration('browserDevtoolsMcp');
            this._view.webview.postMessage({
                type: 'settings',
                settings: {
                    browser: {
                        headless: config.get('browser.headless'),
                        persistent: config.get('browser.persistent'),
                        userDataDir: config.get('browser.userDataDir'),
                        useSystemBrowser: config.get('browser.useSystemBrowser'),
                        executablePath: config.get('browser.executablePath'),
                    },
                    opentelemetry: {
                        enable: config.get('opentelemetry.enable'),
                        serviceName: config.get('opentelemetry.serviceName'),
                        exporterType: config.get('opentelemetry.exporterType'),
                        exporterUrl: config.get('opentelemetry.exporterUrl'),
                        exporterHeaders: config.get('opentelemetry.exporterHeaders'),
                    },
                    aws: {
                        region: config.get('aws.region'),
                        profile: config.get('aws.profile'),
                    },
                    bedrock: {
                        enable: config.get('bedrock.enable'),
                        imageModelId: config.get('bedrock.imageModelId'),
                        textModelId: config.get('bedrock.textModelId'),
                        visionModelId: config.get('bedrock.visionModelId'),
                    },
                    figma: {
                        accessToken: config.get('figma.accessToken'),
                    },
                },
            });
        }
    }

    private _getHtmlForWebview(_webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Browser DevTools MCP Settings</title>
    <style>
        :root {
            --vscode-font-family: var(--vscode-editor-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
        }
        
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        
        body {
            font-family: var(--vscode-font-family);
            font-size: 13px;
            padding: 12px;
            color: var(--vscode-foreground);
            background: var(--vscode-sideBar-background);
        }
        
        .header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--vscode-widget-border);
        }
        
        .header-icon {
            font-size: 24px;
        }
        
        .header h1 {
            font-size: 14px;
            font-weight: 600;
        }
        
        .section {
            margin-bottom: 20px;
        }
        
        .section-title {
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .section-title::before {
            content: '';
            display: inline-block;
            width: 3px;
            height: 12px;
            background: var(--vscode-activityBarBadge-background);
            border-radius: 2px;
        }
        
        .setting-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 0;
            gap: 12px;
        }
        
        .setting-row:not(:last-child) {
            border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
        }
        
        .setting-info {
            flex: 1;
            min-width: 0;
        }
        
        .setting-label {
            font-weight: 500;
            margin-bottom: 2px;
        }
        
        .setting-description {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.4;
        }
        
        .setting-control {
            flex-shrink: 0;
        }
        
        input[type="checkbox"] {
            width: 18px;
            height: 18px;
            cursor: pointer;
            accent-color: var(--vscode-activityBarBadge-background);
        }
        
        input[type="text"],
        select {
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, transparent);
            padding: 6px 8px;
            border-radius: 4px;
            font-size: 12px;
            width: 180px;
        }
        
        input[type="text"]:focus,
        select:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        
        input[type="text"]::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }
        
        select {
            cursor: pointer;
        }
        
        .btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            width: 100%;
            margin-top: 8px;
        }
        
        .btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 10px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }
        
        .status-badge.active {
            background: var(--vscode-testing-iconPassed);
            color: white;
        }
        
        .collapsible {
            cursor: pointer;
            user-select: none;
        }
        
        .collapsible-content {
            overflow: hidden;
            transition: max-height 0.2s ease-out;
        }
        
        .hidden {
            display: none;
        }
    </style>
</head>
<body>
    <div class="header">
        <span class="header-icon">🌐</span>
        <div>
            <h1>Browser DevTools MCP</h1>
        </div>
    </div>

    <!-- Browser Settings -->
    <div class="section">
        <div class="section-title">Browser</div>
        
        <div class="setting-row">
            <div class="setting-info">
                <div class="setting-label">Headless Mode</div>
                <div class="setting-description">Run browser without visible window</div>
            </div>
            <div class="setting-control">
                <input type="checkbox" id="browser.headless" checked>
            </div>
        </div>
        
        <div class="setting-row">
            <div class="setting-info">
                <div class="setting-label">Persistent Context</div>
                <div class="setting-description">Keep cookies, localStorage between sessions</div>
            </div>
            <div class="setting-control">
                <input type="checkbox" id="browser.persistent">
            </div>
        </div>
        
        <div class="setting-row">
            <div class="setting-info">
                <div class="setting-label">Use System Browser</div>
                <div class="setting-description">Use installed browser instead of bundled</div>
            </div>
            <div class="setting-control">
                <input type="checkbox" id="browser.useSystemBrowser">
            </div>
        </div>
        
        <div class="setting-row">
            <div class="setting-info">
                <div class="setting-label">User Data Directory</div>
                <div class="setting-description">Path for persistent browser data</div>
            </div>
            <div class="setting-control">
                <input type="text" id="browser.userDataDir" placeholder="~/.browser-data">
            </div>
        </div>
        
        <div class="setting-row">
            <div class="setting-info">
                <div class="setting-label">Browser Executable</div>
                <div class="setting-description">Custom browser path</div>
            </div>
            <div class="setting-control">
                <input type="text" id="browser.executablePath" placeholder="/path/to/chrome">
            </div>
        </div>
    </div>

    <!-- OpenTelemetry Settings -->
    <div class="section">
        <div class="section-title">OpenTelemetry</div>
        
        <div class="setting-row">
            <div class="setting-info">
                <div class="setting-label">Enable Tracing</div>
                <div class="setting-description">Enable OpenTelemetry instrumentation</div>
            </div>
            <div class="setting-control">
                <input type="checkbox" id="opentelemetry.enable">
            </div>
        </div>
        
        <div class="setting-row">
            <div class="setting-info">
                <div class="setting-label">Service Name</div>
                <div class="setting-description">Name for trace attribution</div>
            </div>
            <div class="setting-control">
                <input type="text" id="opentelemetry.serviceName" placeholder="frontend">
            </div>
        </div>
        
        <div class="setting-row">
            <div class="setting-info">
                <div class="setting-label">Exporter Type</div>
                <div class="setting-description">Where to send traces</div>
            </div>
            <div class="setting-control">
                <select id="opentelemetry.exporterType">
                    <option value="none">None</option>
                    <option value="console">Console</option>
                    <option value="otlp/http">OTLP/HTTP</option>
                </select>
            </div>
        </div>
        
        <div class="setting-row">
            <div class="setting-info">
                <div class="setting-label">Collector URL</div>
                <div class="setting-description">OTLP endpoint URL</div>
            </div>
            <div class="setting-control">
                <input type="text" id="opentelemetry.exporterUrl" placeholder="http://localhost:4318">
            </div>
        </div>
    </div>

    <!-- AWS / Bedrock Settings -->
    <div class="section">
        <div class="section-title">AWS / Bedrock</div>
        
        <div class="setting-row">
            <div class="setting-info">
                <div class="setting-label">Enable Bedrock</div>
                <div class="setting-description">Use Bedrock for AI features</div>
            </div>
            <div class="setting-control">
                <input type="checkbox" id="bedrock.enable">
            </div>
        </div>
        
        <div class="setting-row">
            <div class="setting-info">
                <div class="setting-label">AWS Region</div>
                <div class="setting-description">Region for Bedrock services</div>
            </div>
            <div class="setting-control">
                <input type="text" id="aws.region" placeholder="us-east-1">
            </div>
        </div>
        
        <div class="setting-row">
            <div class="setting-info">
                <div class="setting-label">AWS Profile</div>
                <div class="setting-description">Named profile for credentials</div>
            </div>
            <div class="setting-control">
                <input type="text" id="aws.profile" placeholder="default">
            </div>
        </div>
    </div>

    <!-- Figma Settings -->
    <div class="section">
        <div class="section-title">Figma</div>
        
        <div class="setting-row">
            <div class="setting-info">
                <div class="setting-label">Access Token</div>
                <div class="setting-description">Figma API token for design comparison</div>
            </div>
            <div class="setting-control">
                <input type="text" id="figma.accessToken" placeholder="figd_xxx">
            </div>
        </div>
    </div>

    <button class="btn" id="openAllSettings">Open All Settings</button>

    <script>
        const vscode = acquireVsCodeApi();

        // Request initial settings
        vscode.postMessage({ type: 'getSettings' });

        // Handle settings updates from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'settings') {
                updateUI(message.settings);
            }
        });

        function updateUI(settings) {
            // Browser settings
            setCheckbox('browser.headless', settings.browser?.headless);
            setCheckbox('browser.persistent', settings.browser?.persistent);
            setCheckbox('browser.useSystemBrowser', settings.browser?.useSystemBrowser);
            setInput('browser.userDataDir', settings.browser?.userDataDir);
            setInput('browser.executablePath', settings.browser?.executablePath);

            // OpenTelemetry settings
            setCheckbox('opentelemetry.enable', settings.opentelemetry?.enable);
            setInput('opentelemetry.serviceName', settings.opentelemetry?.serviceName);
            setSelect('opentelemetry.exporterType', settings.opentelemetry?.exporterType);
            setInput('opentelemetry.exporterUrl', settings.opentelemetry?.exporterUrl);

            // AWS / Bedrock settings
            setCheckbox('bedrock.enable', settings.bedrock?.enable);
            setInput('aws.region', settings.aws?.region);
            setInput('aws.profile', settings.aws?.profile);

            // Figma settings
            setInput('figma.accessToken', settings.figma?.accessToken);
        }

        function setCheckbox(id, value) {
            const el = document.getElementById(id);
            if (el) el.checked = !!value;
        }

        function setInput(id, value) {
            const el = document.getElementById(id);
            if (el) el.value = value || '';
        }

        function setSelect(id, value) {
            const el = document.getElementById(id);
            if (el) el.value = value || 'none';
        }

        // Add event listeners to all inputs
        document.querySelectorAll('input[type="checkbox"]').forEach(el => {
            el.addEventListener('change', () => {
                vscode.postMessage({
                    type: 'updateSetting',
                    key: el.id,
                    value: el.checked
                });
            });
        });

        document.querySelectorAll('input[type="text"]').forEach(el => {
            el.addEventListener('change', () => {
                vscode.postMessage({
                    type: 'updateSetting',
                    key: el.id,
                    value: el.value
                });
            });
        });

        document.querySelectorAll('select').forEach(el => {
            el.addEventListener('change', () => {
                vscode.postMessage({
                    type: 'updateSetting',
                    key: el.id,
                    value: el.value
                });
            });
        });

        // Open all settings button
        document.getElementById('openAllSettings').addEventListener('click', () => {
            vscode.postMessage({ type: 'openSettings' });
        });
    </script>
</body>
</html>`;
    }
}
