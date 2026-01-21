# Browser DevTools MCP for VS Code & Cursor

[![Open VSX Registry](https://img.shields.io/open-vsx/v/serkan-ozal/browser-devtools-mcp-vscode)](https://open-vsx.org/extension/serkan-ozal/browser-devtools-mcp-vscode)
[![GitHub](https://img.shields.io/github/stars/serkan-ozal/browser-devtools-mcp-vscode-extension?style=social)](https://github.com/serkan-ozal/browser-devtools-mcp-vscode-extension)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Playwright-powered browser automation and debugging for VS Code and Cursor via the Model Context Protocol (MCP).

This extension integrates [browser-devtools-mcp](https://github.com/serkan-ozal/browser-devtools-mcp) into your IDE, enabling AI assistants like GitHub Copilot and Cursor AI to interact with real web browsers for testing, debugging, and automation tasks.

## Features

- 🌐 **Browser Automation** - Navigate, click, fill forms, and interact with web pages
- 📸 **Screenshots** - Capture full-page or element screenshots
- ♿ **Accessibility** - Run accessibility audits and get ARIA snapshots
- 📊 **Web Vitals** - Measure Core Web Vitals (LCP, FID, CLS)
- 🔍 **Network Inspection** - Monitor HTTP requests and responses
- 🎭 **Request Mocking** - Stub and mock API responses
- ⚛️ **React DevTools** - Inspect React components
- 🔭 **OpenTelemetry** - Distributed tracing integration
- 🎨 **Figma Comparison** - Compare pages with Figma designs

## Installation

### From Open VSX Registry

1. Open VS Code or Cursor
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for "Browser DevTools MCP"
4. Click Install

Or install via command line:

```bash
# VS Code
code --install-extension serkan-ozal.browser-devtools-mcp-vscode

# Cursor
cursor --install-extension serkan-ozal.browser-devtools-mcp-vscode
```

### From VSIX

```bash
# VS Code
code --install-extension browser-devtools-mcp-vscode-x.x.x.vsix

# Cursor
cursor --install-extension browser-devtools-mcp-vscode-x.x.x.vsix
```

## Configuration

### Quick Settings

Open the **Browser DevTools MCP** panel in the Explorer sidebar to configure common settings.

### Full Settings

Open VS Code Settings (`Ctrl+,` / `Cmd+,`) and search for "Browser DevTools MCP" or use the command:

```
Browser DevTools MCP: Open Settings
```

### Available Settings

#### Browser

| Setting | Default | Description |
|---------|---------|-------------|
| `browserDevtoolsMcp.browser.headless` | `true` | Run browser in headless mode |
| `browserDevtoolsMcp.browser.persistent` | `false` | Enable persistent browser context |
| `browserDevtoolsMcp.browser.userDataDir` | `""` | Directory for persistent user data |
| `browserDevtoolsMcp.browser.useSystemBrowser` | `false` | Use system browser instead of bundled |
| `browserDevtoolsMcp.browser.executablePath` | `""` | Custom browser executable path |

#### OpenTelemetry

| Setting | Default | Description |
|---------|---------|-------------|
| `browserDevtoolsMcp.opentelemetry.enable` | `false` | Enable OpenTelemetry instrumentation |
| `browserDevtoolsMcp.opentelemetry.serviceName` | `"frontend"` | Service name for traces |
| `browserDevtoolsMcp.opentelemetry.exporterType` | `"none"` | Exporter: `none`, `console`, `otlp/http` |
| `browserDevtoolsMcp.opentelemetry.exporterUrl` | `""` | OTLP collector URL |
| `browserDevtoolsMcp.opentelemetry.exporterHeaders` | `""` | HTTP headers for collector |

#### AWS / Amazon Bedrock

| Setting | Default | Description |
|---------|---------|-------------|
| `browserDevtoolsMcp.aws.region` | `""` | AWS region for Bedrock |
| `browserDevtoolsMcp.aws.profile` | `""` | AWS profile name |
| `browserDevtoolsMcp.bedrock.enable` | `false` | Enable Bedrock for AI features |
| `browserDevtoolsMcp.bedrock.imageModelId` | `""` | Image embedding model ID |
| `browserDevtoolsMcp.bedrock.textModelId` | `""` | Text embedding model ID |
| `browserDevtoolsMcp.bedrock.visionModelId` | `""` | Vision model ID |

#### Figma

| Setting | Default | Description |
|---------|---------|-------------|
| `browserDevtoolsMcp.figma.accessToken` | `""` | Figma API access token |

## Usage

Once installed, the MCP server is automatically available to AI assistants. Try prompts like:

**Navigation & Screenshots:**
```
Navigate to https://example.com and take a screenshot
Take a full-page screenshot of the current page
```

**Accessibility Testing:**
```
Check the accessibility of the current page
Get the ARIA snapshot for the navigation menu
```

**Performance:**
```
Get the Web Vitals for https://google.com
What is the LCP score of this page?
```

**Interaction:**
```
Fill the login form with test@example.com and click submit
Click the "Sign Up" button and wait for the page to load
```

**Debugging:**
```
Show me the console errors on this page
What network requests failed on this page?
```

## Available MCP Tools

| Tool | Description |
|------|-------------|
| `navigation_go-to` | Navigate to a URL |
| `navigation_reload` | Reload the page |
| `navigation_go-back` | Go back in history |
| `navigation_go-forward` | Go forward in history |
| `content_take-screenshot` | Take a screenshot |
| `content_get-as-html` | Get page HTML |
| `content_get-as-text` | Get page text |
| `content_save-as-pdf` | Save page as PDF |
| `interaction_click` | Click an element |
| `interaction_fill` | Fill an input |
| `interaction_hover` | Hover an element |
| `interaction_scroll` | Scroll the page |
| `interaction_press-key` | Press a key |
| `interaction_drag` | Drag and drop |
| `interaction_select` | Select dropdown option |
| `interaction_resize-viewport` | Resize viewport |
| `a11y_take-aria-snapshot` | Get ARIA snapshot |
| `accessibility_take-ax-tree-snapshot` | Get accessibility tree |
| `o11y_get-web-vitals` | Get Web Vitals |
| `o11y_get-console-messages` | Get console logs |
| `o11y_get-http-requests` | Get network requests |
| `o11y_get-trace-id` | Get trace ID |
| `stub_mock-http-response` | Mock HTTP response |
| `stub_intercept-http-request` | Intercept requests |
| `react_get-component-for-element` | Get React component |
| `run_js-in-browser` | Execute JavaScript |
| `figma_compare-page-with-design` | Compare with Figma |

## Development

### Prerequisites

- Node.js 22+
- VS Code 1.96+ or Cursor

### Build

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch

# Package extension
npm run package
```

### Testing

1. Press `F5` in VS Code/Cursor to launch Extension Development Host
2. The extension will be loaded in the new window
3. Open AI Chat (Copilot or Cursor AI) and test MCP tools

## Troubleshooting

### MCP Server Not Starting

1. Check that Node.js 22+ is installed
2. Verify the extension is enabled
3. Check Output panel for "Browser DevTools MCP" logs

### Browser Not Launching

1. Try disabling headless mode in settings
2. Check if a custom executable path is needed
3. Ensure Playwright browsers are installed

### Settings Not Applying

After changing settings, restart the MCP session:
1. Run command: `Browser DevTools MCP: Restart Server`
2. Or reload the VS Code/Cursor window (`Cmd+Shift+P` → "Developer: Reload Window")

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on [GitHub](https://github.com/serkan-ozal/browser-devtools-mcp-vscode-extension).

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- [GitHub Repository](https://github.com/serkan-ozal/browser-devtools-mcp-vscode-extension) - Extension source code
- [Open VSX Registry](https://open-vsx.org/extension/serkan-ozal/browser-devtools-mcp-vscode) - Extension page
- [browser-devtools-mcp](https://github.com/serkan-ozal/browser-devtools-mcp) - Main MCP server
- [VS Code MCP Documentation](https://code.visualstudio.com/docs/copilot/copilot-extensibility-overview)
- [Model Context Protocol](https://modelcontextprotocol.io/)
