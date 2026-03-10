# Browser DevTools MCP for VS Code & Cursor

[![Open VSX Registry](https://img.shields.io/open-vsx/v/serkan-ozal/browser-devtools-mcp-vscode)](https://open-vsx.org/extension/serkan-ozal/browser-devtools-mcp-vscode)
[![GitHub](https://img.shields.io/github/stars/serkan-ozal/browser-devtools-mcp-vscode-extension?style=social)](https://github.com/serkan-ozal/browser-devtools-mcp-vscode-extension)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Playwright-powered browser automation and debugging for VS Code and Cursor via the Model Context Protocol (MCP).

This extension integrates [browser-devtools-mcp](https://www.npmjs.com/package/browser-devtools-mcp) into your IDE, enabling AI assistants like GitHub Copilot and Cursor AI to interact with real web browsers for testing, debugging, and automation tasks.

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
- 🐛 **Non-Blocking Debugging** - Tracepoints, logpoints, exceptionpoints, watch expressions, probe snapshots
- ⚡ **Execute** - Batch multiple tool calls in one request via JavaScript and `callTool()`; on browser platform `page` (Playwright Page) is available for `page.evaluate()`, `page.locator()`, etc.
- 🌐 **Playwright Browsers** - On first activation, Chromium (and headless shell + ffmpeg) is installed automatically into the default Playwright cache. Use the **Browser DevTools MCP: Install Browsers...** command to manually install Chromium, Firefox, and/or WebKit on demand.

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

**Registration:** In Cursor the extension registers the MCP server via Cursor’s native MCP API (no `mcp.json` needed). In VS Code 1.96+ it uses `vscode.lm.registerMcpServerDefinitionProvider`. The server is started automatically when the extension is enabled.

## Playwright Browsers

The extension uses Playwright’s browser binaries (Chromium, Firefox, WebKit), stored in the default cache (e.g. `~/.cache/ms-playwright` on Linux, `~/Library/Caches/ms-playwright` on macOS).

- **First run:** After you install the extension, it will automatically install the default Chromium set (chromium, chromium-headless-shell, ffmpeg) in the background on first activation. This runs once per machine (tracked in extension global state).
- **Manual install:** Run **Browser DevTools MCP: Install Browsers...** from the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) to choose which browsers to install: Chromium, Firefox, and/or WebKit. You can select one or more; Chromium includes the headless shell and ffmpeg.

To skip automatic browser download (e.g. you use a system browser or custom path), set the environment variable `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` before starting VS Code/Cursor.

## Configuration

### Quick Settings

Open the **Browser DevTools MCP** panel in the Explorer sidebar to configure common settings.

### Full Settings

Open VS Code Settings (`Ctrl+,` / `Cmd+,`) and search for "Browser DevTools MCP" or use the command:

```
Browser DevTools MCP: Open Settings
```

### Available Settings

Settings below are passed to the MCP server as environment variables. Change them in Settings or in the **Browser DevTools MCP** sidebar panel (subset); restart the MCP session to apply.

#### General

| Setting | Default | Description |
|---------|---------|-------------|
| `browserDevtoolsMcp.enable` | `true` | Enable or disable the extension (and MCP server) |
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
| `browserDevtoolsMcp.browser.consoleMessagesBufferSize` | `1000` | Max console messages to buffer |
| `browserDevtoolsMcp.browser.httpRequestsBufferSize` | `1000` | Max HTTP requests to buffer |

#### Node (when platform is `node`)

| Setting | Default | Description |
|---------|---------|-------------|
| `browserDevtoolsMcp.node.inspectorHost` | `""` | Inspector host for Docker (e.g., host.docker.internal) |
| `browserDevtoolsMcp.node.consoleMessagesBufferSize` | `1000` | Max console messages to buffer in Node process |

#### OpenTelemetry

| Setting | Default | Description |
|---------|---------|-------------|
| `browserDevtoolsMcp.opentelemetry.enable` | `false` | Enable OpenTelemetry instrumentation |
| `browserDevtoolsMcp.opentelemetry.serviceName` | `"frontend"` | Service name for traces |
| `browserDevtoolsMcp.opentelemetry.serviceVersion` | `""` | Service version for traces |
| `browserDevtoolsMcp.opentelemetry.assetsDir` | `""` | OpenTelemetry assets directory |
| `browserDevtoolsMcp.opentelemetry.instrumentationUserInteractionEvents` | `""` | Comma-separated events to instrument (default: click) |
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

#### Advanced (MCP)

| Setting | Default | Description |
|---------|---------|-------------|
| `browserDevtoolsMcp.toolOutputSchemaDisable` | `false` | Omit tool output schema from MCP registration (can reduce token usage) |
| `browserDevtoolsMcp.availableToolDomains` | `""` | Comma-separated domains to enable (e.g. navigation,interaction,a11y). Empty = all. Browser: a11y, content, debug, figma, interaction, navigation, o11y, react, run, stub, sync. Node: debug, run. |

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
Get probe snapshots after triggering the code path
```

**API Mocking:**
```
Mock the /api/users endpoint to return an empty array
Intercept all API requests and add an auth header
List all active stubs and clear them
```

**Execute (batch tool calls + optional page script):**
```
Use execute to fill the login form and click submit in one call
Run a script that calls callTool('navigation_go-to', { url: '...' }) then callTool('a11y_take-aria-snapshot', {}, true)
```

## Available MCP Tools

### Navigation Tools
| Tool | Description |
|------|-------------|
| `navigation_go-to` | Navigate to a URL |
| `navigation_reload` | Reload the page |
| `navigation_go-back-or-forward` | Go back or forward in history (direction: back \| forward) |

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

### Execute
| Tool | Description |
|------|-------------|
| `execute` | Batch-execute multiple tool calls in one request via JavaScript; use `callTool(name, input, returnOutput?)` to invoke tools. On browser platform the script has `page` (Playwright Page) for `page.evaluate()`, `page.locator()`, etc. Reduces round-trips and token usage. |

### Figma Tools
| Tool | Description |
|------|-------------|
| `figma_compare-page-with-design` | Compare page with Figma design |

### Debug Tools (Non-Blocking)
| Tool | Description |
|------|-------------|
| `debug_put-tracepoint` | Set a tracepoint (captures call stack) |
| `debug_put-logpoint` | Set a logpoint (evaluates expression) |
| `debug_put-exceptionpoint` | Configure exception breakpoints (none, uncaught, all) |
| `debug_add-watch` | Add watch expression (evaluated at every tracepoint hit) |
| `debug_remove-probe` | Remove a tracepoint, logpoint, or watch by type and id |
| `debug_list-probes` | List tracepoints, logpoints, and/or watches |
| `debug_clear-probes` | Clear tracepoints, logpoints, and/or watch expressions |
| `debug_get-probe-snapshots` | Get tracepoint, logpoint, and/or exceptionpoint snapshots |
| `debug_clear-probe-snapshots` | Clear probe snapshots (optional types, probeId) |
| `debug_status` | Get debugging status (probe counts, exceptionpoint state) |
| `debug_resolve-source-location` | Resolve bundle location to original source via source maps |

When using **Node platform** (`browserDevtoolsMcp.platform`: `node`), additional tools: `debug_connect`, `debug_disconnect`, `debug_get-logs`.

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

### Restart the MCP server

If you run into problems—for example the MCP server fails to start, the browser that was opened has closed, MCP processes have leaked, or you see other odd behavior—try restarting the MCP server first:

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run **Browser DevTools MCP: Restart Server**

This unregisters the server, stops any running MCP processes (e.g. Cursor-started ones), and registers it again so a fresh process is started.

### MCP Server Not Starting

1. Check that Node.js 22+ is installed
2. Verify the extension is enabled
3. Check Output panel for "Browser DevTools MCP" logs

### Browser Not Launching

1. Ensure Playwright browsers are installed: run **Browser DevTools MCP: Install Browsers...** from the Command Palette and install at least Chromium (or Firefox/WebKit if you use them).
2. Try disabling headless mode in settings
3. Check if a custom executable path is needed (e.g. system browser or custom build)

### Settings Not Applying

After changing settings, restart the MCP session:
1. Run the command **Browser DevTools MCP: Restart Server**
2. Or reload the VS Code/Cursor window (`Cmd+Shift+P` → "Developer: Reload Window")

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on [GitHub](https://github.com/serkan-ozal/browser-devtools-mcp-vscode-extension).

## License

MIT License - see [LICENSE](LICENSE) for details.

## Links

- [GitHub Repository](https://github.com/serkan-ozal/browser-devtools-mcp-vscode-extension) - Extension source code
- [Open VSX Registry](https://open-vsx.org/extension/serkan-ozal/browser-devtools-mcp-vscode) - Extension page
- [browser-devtools-mcp](https://www.npmjs.com/package/browser-devtools-mcp) - Main MCP server (npm)
- [VS Code MCP Documentation](https://code.visualstudio.com/docs/copilot/copilot-extensibility-overview)
- [Model Context Protocol](https://modelcontextprotocol.io/)
