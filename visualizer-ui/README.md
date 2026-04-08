# Visualizer UI

Phaser-based UI for MCP agent events. Single canvas, WebSocket to the visualizer WS server, HUD with connection status, run id, and last event type.

## Run

From repo root:

```bash
cd visualizer-ui
npm install
npm run dev
```

Or from this folder:

```bash
npm install
npm run dev
```

Opens at `http://localhost:3000` (or `VIS_UI_PORT`). Enable **Show Visualizer** in the extension and run MCP tools; Cursor/extension will send tool events to the Visualizer WebSocket.

Demo preview:

```bash
http://localhost:3000/?demo=preview
```

(`?demo=chars` runs the animated character demo; other `demo` values produce a short sample run flow.)
