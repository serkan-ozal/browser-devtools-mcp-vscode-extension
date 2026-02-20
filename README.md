# Browser DevTools MCP for VS Code & Cursor

[![Open VSX Registry](https://img.shields.io/open-vsx/v/serkan-ozal/browser-devtools-mcp-vscode)](https://open-vsx.org/extension/serkan-ozal/browser-devtools-mcp-vscode)
[![GitHub](https://img.shields.io/github/stars/serkan-ozal/browser-devtools-mcp-vscode-extension?style=social)](https://github.com/serkan-ozal/browser-devtools-mcp-vscode-extension)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Playwright-powered browser automation and debugging for VS Code and Cursor via the Model Context Protocol (MCP).

This extension integrates [browser-devtools-mcp](https://github.com/serkan-ozal/browser-devtools-mcp) into your IDE, enabling AI assistants like GitHub Copilot and Cursor AI to interact with real web browsers for testing, debugging, and automation tasks.

## Features

- 🌐 **Browser Automation** - Navigate, click, fill forms, and interact with web pages
- 📸 **Screenshots** - Capture full-page or element screenshots
- ♿ **Accessibility** - Run accessibility audits and get ARIA/AX tree snapshots
- 📊 **Web Vitals** - Measure Core Web Vitals (LCP, INP, CLS, TTFB, FCP)
- 🔍 **Network Inspection** - Monitor HTTP requests and responses
- 🎭 **Request Mocking** - Stub and mock API responses
- ⚛️ **React DevTools** - Inspect React components and elements
- 🔭 **OpenTelemetry** - Distributed tracing integration with trace context propagation
- 🎨 **Figma Comparison** - Compare pages with Figma designs
- 🐛 **Non-Blocking Debugging** - Tracepoints, logpoints, exceptionpoints, DOM and network monitoring
- ⚡ **JavaScript Execution** - Run JS in browser context or server-side sandbox

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

#### General

| Setting | Default | Description |
|---------|---------|-------------|
| `browserDevtoolsMcp.platform` | `"browser"` | MCP platform: `browser` (web automation) or `node` (Node.js debugging) |

#### Browser

| Setting | Default | Description |
|---------|---------|-------------|
| `browserDevtoolsMcp.browser.headless` | `true` | Run browser in headless mode |
| `browserDevtoolsMcp.browser.persistent` | `false` | Enable persistent browser context |
| `browserDevtoolsMcp.browser.userDataDir` | `""` | Directory for persistent user data |
| `browserDevtoolsMcp.browser.useSystemBrowser` | `false` | Use system browser instead of bundled |
| `browserDevtoolsMcp.browser.executablePath` | `""` | Custom browser executable path |
| `browserDevtoolsMcp.browser.locale` | `""` | Browser locale (e.g., en-US, tr-TR) |

#### Node (when platform is `node`)

| Setting | Default | Description |
|---------|---------|-------------|
| `browserDevtoolsMcp.node.inspectorHost` | `""` | Inspector host for Docker (e.g., host.docker.internal) |

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
| `browserDevtoolsMcp.figma.apiBaseUrl` | `""` | Figma API base URL (default: https://api.figma.com/v1) |

## Usage

Once installed, the MCP server is automatically available to AI assistants. Try prompts like:

**Navigation & Screenshots:**
```
Navigate to https://example.com and take a screenshot
Take a full-page screenshot of the current page
Wait for network to be idle and then take a screenshot
```

**Accessibility Testing:**
```
Check the accessibility of the current page
Get the ARIA snapshot for the navigation menu
Get the AX tree snapshot with occlusion checking enabled
```

**Performance:**
```
Get the Web Vitals for https://google.com
What is the LCP score of this page?
Measure Core Web Vitals and give me recommendations
```

**Interaction:**
```
Fill the login form with test@example.com and click submit
Click the "Sign Up" button and wait for the page to load
Scroll to the bottom of the page
```

**Debugging:**
```
Show me the console errors on this page
What network requests failed on this page?
Set a tracepoint at line 50 in main.js and capture the call stack
Monitor DOM mutations on the #content element
```

**API Mocking:**
```
Mock the /api/users endpoint to return an empty array
Intercept all API requests and add an auth header
List all active stubs and clear them
```

**JavaScript Execution:**
```
Run JavaScript to get the current user from localStorage
Execute a script to scroll all lazy-loaded images into view
```

## Available MCP Tools

### Navigation Tools
| Tool | Description |
|------|-------------|
| `navigation_go-to` | Navigate to a URL |
| `navigation_reload` | Reload the page |
| `navigation_go-back` | Go back in history |
| `navigation_go-forward` | Go forward in history |

### Content Tools
| Tool | Description |
|------|-------------|
| `content_take-screenshot` | Take a screenshot (full page or element) |
| `content_get-as-html` | Get page HTML with filtering options |
| `content_get-as-text` | Get visible text content |
| `content_save-as-pdf` | Save page as PDF |

### Interaction Tools
| Tool | Description |
|------|-------------|
| `interaction_click` | Click an element |
| `interaction_fill` | Fill an input field |
| `interaction_hover` | Hover over an element |
| `interaction_scroll` | Scroll page or element |
| `interaction_press-key` | Press a keyboard key |
| `interaction_drag` | Drag and drop |
| `interaction_select` | Select dropdown option |
| `interaction_resize-viewport` | Resize viewport (Playwright emulation) |
| `interaction_resize-window` | Resize browser window (OS-level) |

### Accessibility Tools
| Tool | Description |
|------|-------------|
| `a11y_take-aria-snapshot` | Get ARIA snapshot (YAML format) |
| `a11y_take-ax-tree-snapshot` | Get AX tree with visual diagnostics |

### Observability Tools
| Tool | Description |
|------|-------------|
| `o11y_get-web-vitals` | Get Web Vitals (LCP, INP, CLS, TTFB, FCP) |
| `o11y_get-console-messages` | Get console logs with filtering |
| `o11y_get-http-requests` | Get network requests with filtering |
| `o11y_get-trace-id` | Get current OpenTelemetry trace ID |
| `o11y_new-trace-id` | Generate new trace ID |
| `o11y_set-trace-id` | Set trace ID for distributed tracing |

### Synchronization Tools
| Tool | Description |
|------|-------------|
| `sync_wait-for-network-idle` | Wait for network to become idle |

### Stub Tools
| Tool | Description |
|------|-------------|
| `stub_mock-http-response` | Mock HTTP response |
| `stub_intercept-http-request` | Intercept and modify requests |
| `stub_list` | List installed stubs |
| `stub_clear` | Clear stubs |

### React Tools
| Tool | Description |
|------|-------------|
| `react_get-component-for-element` | Get React component for DOM element |
| `react_get-element-for-component` | Get DOM element for React component |

### Run Tools
| Tool | Description |
|------|-------------|
| `run_js-in-browser` | Execute JavaScript in browser page context |
| `run_js-in-sandbox` | Execute JavaScript in Node.js VM sandbox |

### Figma Tools
| Tool | Description |
|------|-------------|
| `figma_compare-page-with-design` | Compare page with Figma design |

### Debug Tools (Non-Blocking)
| Tool | Description |
|------|-------------|
| `debug_put-tracepoint` | Set a tracepoint (captures call stack) |
| `debug_remove-tracepoint` | Remove a tracepoint |
| `debug_list-tracepoints` | List all tracepoints |
| `debug_clear-tracepoints` | Clear all tracepoints |
| `debug_get-tracepoint-snapshots` | Get tracepoint snapshots |
| `debug_clear-tracepoint-snapshots` | Clear tracepoint snapshots |
| `debug_put-logpoint` | Set a logpoint (evaluates expression) |
| `debug_remove-logpoint` | Remove a logpoint |
| `debug_list-logpoints` | List all logpoints |
| `debug_clear-logpoints` | Clear all logpoints |
| `debug_get-logpoint-snapshots` | Get logpoint snapshots |
| `debug_clear-logpoint-snapshots` | Clear logpoint snapshots |
| `debug_put-exceptionpoint` | Enable exception catching |
| `debug_get-exceptionpoint-snapshots` | Get exception snapshots |
| `debug_clear-exceptionpoint-snapshots` | Clear exception snapshots |
| `debug_put-dompoint` | Set DOM mutation breakpoint |
| `debug_remove-dompoint` | Remove DOM breakpoint |
| `debug_list-dompoints` | List all DOM breakpoints |
| `debug_clear-dompoints` | Clear all DOM breakpoints |
| `debug_get-dompoint-snapshots` | Get DOM mutation snapshots |
| `debug_clear-dompoint-snapshots` | Clear DOM snapshots |
| `debug_put-netpoint` | Set network request breakpoint |
| `debug_remove-netpoint` | Remove network breakpoint |
| `debug_list-netpoints` | List all network breakpoints |
| `debug_clear-netpoints` | Clear all network breakpoints |
| `debug_get-netpoint-snapshots` | Get network snapshots |
| `debug_clear-netpoint-snapshots` | Clear network snapshots |
| `debug_add-watch` | Add watch expression |
| `debug_remove-watch` | Remove watch expression |
| `debug_list-watches` | List all watch expressions |
| `debug_clear-watches` | Clear all watch expressions |
| `debug_status` | Get debugging status |
| `debug_resolve-source-location` | Resolve bundle location to original source via source maps |

When using **Node platform** (`browserDevtoolsMcp.platform`: `node`), additional tools are available: `debug_connect`, `debug_disconnect`, `debug_get-logs`, `run_js-in-node`.

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
