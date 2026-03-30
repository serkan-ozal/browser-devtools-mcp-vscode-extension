# Visualizer UI

Phaser-based UI for MCP agent events. Single canvas, WebSocket to the visualizer WS server, HUD with connection status, run id, and last event type.

## Run

From repo root:

```bash
npm run visualizer:ui
```

Or from this folder:

```bash
npm install
npm run dev
```

Opens at `http://localhost:3000` (or `VIS_UI_PORT`). Connect the MCP server with streamable-http and run tools to see events.

Demo preview:

```bash
http://localhost:3000/?demo=qa-report
```
