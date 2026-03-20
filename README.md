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
- 🌐 **Playwright Browsers** - On first install/upgrade, the extension downloads the browsers selected in settings (default: Chromium + headless shell + ffmpeg) into Playwright’s normal cache using `playwright-core`’s installer—no `npx` required. VSIX builds set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` so binaries are not bundled. Run **Browser DevTools MCP: Install Playwright Browsers...** anytime to pick Chromium (default), Firefox, and/or WebKit: it updates `install.chromium` / `install.firefox` / `install.webkit` to match and downloads those engines.
- 📦 **MCP Server** - Shipped **inside one universal VSIX** (same artifact for all platforms). The package includes `sharp` + `@img/sharp-wasm32`; native sharp/libvips prebuild variants are excluded from VSIX contents. No npm required at runtime; the extension runs the bundled `browser-devtools-mcp` with `node`.

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

## Telemetry

The extension can send **anonymous** usage events (install/uninstall, browser install step, etc.) to help improve the product. The same opt-in/opt-out rules apply as for the bundled [browser-devtools-mcp](https://www.npmjs.com/package/browser-devtools-mcp) server. No PII is collected; only an anonymous ID in `~/.browser-devtools-mcp/config.json`, plus event name and environment properties (e.g. extension version, OS, Node version).

- **Events:** `cursor_ext_activated` / `cursor_ext_deactivated` (extension lifecycle), `cursor_ext_installed` (only when first-install/upgrade path ran and bundled MCP path resolved), `cursor_ext_install_failed`, `cursor_ext_browser_installed` / `cursor_ext_browser_install_failed`, and `cursor_ext_uninstalled` (when the extension is uninstalled and deactivate runs with the extension listed in `.obsolete`). MCP registration state is included where relevant (`mcp_server_registered` / `mcp_server_unregistered`). If telemetry is disabled (setting, env, or config), no events are sent.
- **Timing:** Clients may batch or delay sending—events might not appear in analytics immediately. **`TELEMETRY_ENABLE=false`** and **`~/.browser-devtools-mcp/config.json`** apply to both the extension and the **bundled** MCP process (the extension forwards the parent environment to the server).

**How to disable telemetry**

1. **Setting (recommended):** Set `browserDevtoolsMcp.telemetry.enable` to `false` in VS Code/Cursor settings. The extension syncs this to `~/.browser-devtools-mcp/config.json` on activate and when the setting changes, so no telemetry events (including uninstall) are sent.
2. **Environment variable:** Set `TELEMETRY_ENABLE=false` before starting VS Code/Cursor.
3. **Config file:** Edit `~/.browser-devtools-mcp/config.json` and set `"telemetryEnabled": false`.

## MCP Server (bundled)

The `browser-devtools-mcp` package is a **dependency of this extension** and is included in the published VSIX with production `node_modules`. We publish a **single universal VSIX** where native sharp/libvips prebuild variants are excluded from the bundle and `@img/sharp-wasm32` is included. **`@img/sharp-wasm32`** is a direct extension dependency (aligned with the bundled `sharp`), and **`.npmrc`** sets `force=true` so npm installs it on normal hosts.

- **Activate:** The extension resolves `node_modules/browser-devtools-mcp/dist/index.js` inside the extension folder. No npm and no network required for the server binary itself.
- **New server versions:** Publish/build workflows are lockfile-driven (`npm ci --omit=optional`). Bump `browser-devtools-mcp` in `package.json` and refresh lockfile when you want to roll forward.
- **Dependencies:** `browser-devtools-mcp` and `@img/sharp-wasm32` are regular dependencies in `package.json` for maintainers; end users do not run npm for MCP.

### Maintainer: universal VSIX

- **PR / CI:** [.github/workflows/build.yml](.github/workflows/build.yml) — `workflow_dispatch`, `pull_request` (`master`), and `push` (`main`) triggers; on `ubuntu-latest` it runs `npm ci --omit=optional`, lint, build, and `npx vsce package`.
- **Release / Open VSX:** [.github/workflows/publish-vscode-extension.yml](.github/workflows/publish-vscode-extension.yml) — single **`release`** job runs `npm ci --omit=optional`, lint, build, version bump/tag/release, then publishes to Open VSX via [HaaLeo/publish-vscode-extension@v2](https://github.com/HaaLeo/publish-vscode-extension) (`skipDuplicate: true`) and uploads the produced VSIX as artifact.
- **Packaging filter:** `.vscodeignore` excludes `@img/sharp-darwin-*`, `@img/sharp-win32-*`, `@img/sharp-linux-*`, `@img/sharp-libvips-*` and keeps `sharp` + `@img/sharp-wasm32`. `vsce` collects production dependencies via `npm list --production`, so devDependencies are not bundled.

Local packaging check:

```bash
npm ci --omit=optional
npx vsce package
```

## Playwright Browsers

The extension uses Playwright’s browser binaries (Chromium, Firefox, WebKit), stored in the default cache (e.g. `~/.cache/ms-playwright` on Linux, `~/Library/Caches/ms-playwright` on macOS).

- **Which browsers to install:** In Settings, use `browserDevtoolsMcp.install.chromium`, `install.firefox`, and `install.webkit` (default: Chromium group). On **first install/upgrade**, the extension calls Playwright’s `installBrowsersForNpmInstall` with that selection (unless **Use system-installed browser** is on or platform is Node). Playwright skips work when the chosen builds are already present in the cache (`INSTALLATION_COMPLETE`). Changing these settings triggers another install pass; restart the MCP session if it was already running. **Install Playwright Browsers...** in the Command Palette does the same selection UI and **writes those three settings** to match your choice, then runs the installer (so the sidebar/settings panel stay in sync).
- **VSIX / CI:** `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` is set when packaging so browser ZIPs are not part of the extension.

To skip browser download (e.g. you use a system browser or custom path), set the environment variable `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` before starting VS Code/Cursor.

## Configuration

### Quick Settings

Open the **Browser DevTools MCP** panel in the Explorer sidebar to configure common settings.

### Full Settings

Open VS Code Settings (`Ctrl+,` / `Cmd+,`) and search for "Browser DevTools MCP" or use the command:

```
Browser DevTools MCP: Open Settings
```

To (re)download Playwright binaries immediately:

```
Browser DevTools MCP: Install Playwright Browsers...
```

### Available Settings

Settings below are passed to the MCP server as environment variables. Change them in Settings or in the **Browser DevTools MCP** sidebar panel (subset); restart the MCP session to apply.

#### General

| Setting | Default | Description |
|---------|---------|-------------|
| `browserDevtoolsMcp.enable` | `true` | Enable or disable the extension (and MCP server) |
| `browserDevtoolsMcp.telemetry.enable` | `true` | Allow anonymous install/uninstall telemetry (see [Telemetry](#telemetry)) |
| `browserDevtoolsMcp.platform` | `"browser"` | MCP platform: `browser` (web automation) or `node` (Node.js debugging) |

#### Install (Playwright browsers to download on activate)

| Setting | Default | Description |
|---------|---------|-------------|
| `browserDevtoolsMcp.install.chromium` | `true` | Browser group selection used on first install/upgrade; changing it triggers Playwright install pass. |
| `browserDevtoolsMcp.install.firefox` | `false` | Browser group selection used on first install/upgrade; changing it triggers Playwright install pass. |
| `browserDevtoolsMcp.install.webkit` | `false` | Browser group selection used on first install/upgrade; changing it triggers Playwright install pass. |

#### Browser

| Setting | Default | Description |
|---------|---------|-------------|
| `browserDevtoolsMcp.browser.headless` | `true` | Run browser in headless mode |
| `browserDevtoolsMcp.browser.persistent` | `false` | Enable persistent browser context |
| `browserDevtoolsMcp.browser.userDataDir` | `""` | Directory for persistent user data |
| `browserDevtoolsMcp.browser.useSystemBrowser` | `false` | Use system browser instead of bundled |
| `browserDevtoolsMcp.browser.executablePath` | `""` | Custom browser executable path |
| `browserDevtoolsMcp.browser.locale` | `""` | Browser locale (e.g., en-US, tr-TR) |
| `browserDevtoolsMcp.browser.cdp.enable` | `false` | Enable CDP attach mode (Chromium only). |
| `browserDevtoolsMcp.browser.cdp.endpointUrl` | `""` | Optional CDP endpoint (`http://host:port` or `ws://...`). |
| `browserDevtoolsMcp.browser.cdp.openInspect` | `true` | On loopback CDP failure, open `chrome://inspect/#remote-debugging` when Chrome is running. |
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

1. Reinstall the extension or install a fresh VSIX—the MCP server is bundled; a missing `dist/index.js` usually means a broken or partial install.
2. Check that Node.js 22+ is available to the IDE (extension host) and the extension is enabled.
3. Check Output panel for "Browser DevTools MCP" logs.

### Browser Not Launching

1. Run **Browser DevTools MCP: Install Playwright Browsers...** and ensure **Chromium** (or your engine) is selected, or rely on `install.*` settings on first install/upgrade. Skip download if you use a system browser only.
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
