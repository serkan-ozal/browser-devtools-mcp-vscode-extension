import type PhaserNamespace from 'phaser';
import { eventQueue } from './eventQueue';
import { QA_REPORT_DEMO } from './demoReports';

const VIS_WS_PORT = (typeof (window as unknown as { VIS_WS_PORT?: number }).VIS_WS_PORT === 'number')
  ? (window as unknown as { VIS_WS_PORT: number }).VIS_WS_PORT
  : 3020;

const WS_URL = `ws://localhost:${VIS_WS_PORT}`;

/**
 * How long to wait after the last tool_finished before we assume the run is
 * done and inject a synthetic run_done event. Cursor keeps the MCP session
 * open indefinitely, so run_done from the server only arrives on disconnect.
 */
const IDLE_RUN_DONE_MS = 60_000;

/** How often to retry WS connection while waiting for next run. */
const RECONNECT_INTERVAL_MS = 3_000;

let ws: WebSocket | null = null;
let gameInstance: PhaserNamespace.Game | null = null;
let closedByUser = false;

let idleTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

/** Per-run tracking for the summary notebook. */
let activeRunId: string | null = null;
let runStartedAt = 0;
let toolsRun: string[] = [];
let lastToolOutput: unknown = null;
let toolErrorCount = 0;

/** Module-level callbacks reused on reconnect. */
let _onMessage: ((data: string) => void) | null = null;
let _onStatus: ((connected: boolean) => void) | null = null;

function clearIdleTimer(): void {
  if (idleTimer !== null) { clearTimeout(idleTimer); idleTimer = null; }
}

function clearReconnectTimer(): void {
  if (reconnectTimer !== null) { clearTimeout(reconnectTimer); reconnectTimer = null; }
}

function scheduleReconnect(): void {
  if (closedByUser || !_onMessage || !_onStatus) return;
  clearReconnectTimer();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!closedByUser && _onMessage && _onStatus) {
      connectWebSocket(_onMessage, _onStatus);
    }
  }, RECONNECT_INTERVAL_MS);
}

function getDemoMode(): string | null {
  return new URLSearchParams(window.location.search).get('demo');
}

function pushDemoEvents(mode: string): void {
  const runId = `demo-${mode}`;
  const now = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const push = (ev: Record<string, unknown>) => eventQueue.push({ raw: '', event: ev as any });

  if (mode === 'chars') {
    // Fire each character-triggering tool with a real setTimeout gap so every
    // character has enough time to walk in and animate before being stopped.
    push({ type: 'run_started', runId, agentId: 'agent-1', ts: now });

    // All tools start immediately (overlapping, like real parallel agent tools).
    const tools = [
      'browser_navigate',
      'browser_snapshot',
      'browser_click',
      'browser_take_screenshot',
      'debug_trace',
      'content_summarize',
      'browser_fill',
    ];
    tools.forEach(toolName => push({ type: 'tool_started', runId, agentId: 'agent-1', ts: Date.now(), toolName }));

    // Finish events fire 4.5 s later → every character animates for ~4-5 s.
    window.setTimeout(() => {
      tools.forEach(toolName => push({ type: 'tool_finished', runId, agentId: 'agent-1', ts: Date.now(), toolName, success: true }));
    }, 4500);
    return;
  }

  const payload = mode === 'qa-report' ? QA_REPORT_DEMO : 'Demo completed successfully.';
  eventQueue.push({ raw: '', event: { type: 'run_started', runId, agentId: 'agent-1', ts: now } });
  eventQueue.push({ raw: '', event: { type: 'run_done', runId, agentId: 'agent-1', ts: now + 300, result: payload, payload: { status: 'ok' } } });
}

function markVisualizerClosed(): void {
  document.body.classList.add('visualizer-closed');
}

function requestShutdown(): void {
  closedByUser = true;
  clearIdleTimer();
  clearReconnectTimer();
  if (ws?.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify({ type: 'control', action: 'shutdown' })); } catch { /* ignore */ }
  }
  try { ws?.close(); } catch { /* ignore */ }
  ws = null;
  if (gameInstance != null) { gameInstance.destroy(true); gameInstance = null; }
  markVisualizerClosed();
}

let vscodeApi: { postMessage(msg: unknown): void } | null = null;
function getVscodeApi(): { postMessage(msg: unknown): void } | null {
  if (vscodeApi) return vscodeApi;
  try {
    const acquire = (window as unknown as Record<string, unknown>)['acquireVsCodeApi'];
    if (typeof acquire === 'function') {
      vscodeApi = (acquire as () => typeof vscodeApi)();
    }
  } catch { /* not in VS Code webview */ }
  return vscodeApi;
}

function sendCharToExtension(char: string): void {
  // VS Code webview: postMessage to extension host to persist via globalState
  const api = getVscodeApi();
  if (api) {
    try { api.postMessage({ type: 'save_char', char }); return; } catch { /* ignore */ }
  }
  // Fallback: send via WS (e.g. in demo/test mode)
  if (ws?.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify({ type: 'control', action: 'save_char', char })); } catch { /* ignore */ }
  }
}

(window as unknown as Record<string, unknown>)['sendCharToServer'] = sendCharToExtension;

/**
 * Build a clean human-readable summary for the notebook.
 * Shows tool list, duration, error count and a short snippet of last output.
 */
function buildRunSummary(): string {
  const durationSec = runStartedAt > 0 ? ((Date.now() - runStartedAt) / 1000).toFixed(1) : '?';
  const uniqueTools = [...new Set(toolsRun)];

  const lines: string[] = [
    `Run: ${activeRunId ?? 'unknown'}`,
    `Duration: ${durationSec}s`,
    `Tools called: ${toolsRun.length} (${uniqueTools.length} unique)`,
    toolErrorCount > 0 ? `Errors: ${toolErrorCount}` : 'Status: OK',
    '',
    'Tools used:',
    ...uniqueTools.map((t, i) => `  ${i + 1}. ${t}`),
  ];

  const outputSnippet = extractOutputSnippet(lastToolOutput);
  if (outputSnippet) {
    lines.push('', 'Last output:', outputSnippet);
  }

  return lines.join('\n');
}

/** Extract a short readable snippet from a tool output (handles MCP content arrays). */
function extractOutputSnippet(output: unknown): string {
  if (output == null) return '';

  // MCP tool output: { content: [{ type: 'text', text: '...' }] }
  if (typeof output === 'object' && !Array.isArray(output)) {
    const o = output as { content?: Array<{ type?: string; text?: string }> };
    if (Array.isArray(o.content)) {
      const text = o.content
        .filter((c) => c?.type === 'text' && c.text)
        .map((c) => c.text!)
        .join('\n')
        .trim();
      return truncate(text, 300);
    }
  }
  if (typeof output === 'string') return truncate(output.trim(), 300);
  return truncate(JSON.stringify(output), 300);
}

function truncate(s: string, max: number): string {
  if (!s) return '';
  const clean = s.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}


function closeWsAndReconnect(): void {
  clearIdleTimer();
  try { ws?.close(); } catch { /* ignore */ }
  scheduleReconnect();
}

function injectRunDone(): void {
  const summary = buildRunSummary();
  const syntheticDone = {
    type: 'run_done',
    runId: activeRunId ?? 'unknown',
    agentId: 'agent-1',
    ts: Date.now(),
    result: summary,
    payload: { status: (toolErrorCount > 0 ? 'error' : 'ok') as 'ok' | 'error' },
  };
  eventQueue.push({ raw: JSON.stringify(syntheticDone), event: syntheticDone });
  setTimeout(() => closeWsAndReconnect(), 150);
}

function connectWebSocket(onMessage: (data: string) => void, onStatus: (connected: boolean) => void): void {
  _onMessage = onMessage;
  _onStatus = onStatus;

  if (ws != null) { try { ws.close(); } catch { /* ignore */ } ws = null; }
  onStatus(false);

  let socket: WebSocket;
  try { socket = new WebSocket(WS_URL); } catch { scheduleReconnect(); return; }
  ws = socket;

  socket.onopen = () => { clearReconnectTimer(); onStatus(true); };
  socket.onclose = () => {
    ws = null;
    onStatus(false);
    clearIdleTimer();
    if (closedByUser) { markVisualizerClosed(); return; }
    scheduleReconnect();
  };
  socket.onerror = () => { /* onclose follows */ };
  socket.onmessage = (ev: MessageEvent) => {
    if (typeof ev.data === 'string') onMessage(ev.data);
  };
}

async function start(): Promise<void> {
  if (gameInstance != null) return;

  document.getElementById('close-visualizer')?.addEventListener('click', () => requestShutdown(), { once: true });

  const [{ default: Phaser }, { HudScene }] = await Promise.all([
    import('phaser') as Promise<{ default: typeof PhaserNamespace }>,
    import('./HudScene'),
  ]);

  const config: PhaserNamespace.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game-container',
    backgroundColor: '#1a1a2e',
    pixelArt: true,
    roundPixels: true,
    scene: [HudScene],
    callbacks: {
      postBoot: (game: PhaserNamespace.Game) => {
        const scene = game.scene.getScene('HudScene') as InstanceType<typeof HudScene>;
        const demoMode = getDemoMode();
        if (demoMode != null) {
          scene.setConnected(true);
          window.setTimeout(() => {
            // Unlock all hero tiers so panels + hero selection are visible in demos
            if (demoMode === 'chars') scene.setTotalToolsUsed(600, false);
          pushDemoEvents(demoMode);
          }, 180);
          return;
        }
        connectWebSocket(
          (data: string) => {
            try {
              const event = JSON.parse(data) as unknown;
              if (event == null || typeof event !== 'object' || !('type' in event)) return;

              const type = (event as { type: string }).type;

              // hello is meta — not a game event, handle separately and don't push to eventQueue
              if (type === 'hello') {
                const count = (event as { totalToolsUsed?: number }).totalToolsUsed ?? 0;
                // Prefer injected HTML var (from globalState via extension), fallback to WS hello
                const injected = (window as unknown as Record<string, unknown>)['__savedChar'];
                const fromHello = (event as { selectedChar?: string }).selectedChar;
                const savedChar = (typeof injected === 'string' ? injected : fromHello);
                scene.setTotalToolsUsed(count, true, savedChar);
                return;
              }

              eventQueue.push({ raw: data, event });

              if (type === 'run_started') {
                activeRunId = (event as { runId?: string }).runId ?? null;
                runStartedAt = Date.now();
                toolsRun = [];
                lastToolOutput = null;
                toolErrorCount = 0;
                clearIdleTimer();
              } else if (type === 'tool_started') {
                const toolName = (event as { toolName?: string }).toolName;
                if (toolName) toolsRun.push(toolName);
                clearIdleTimer();
              } else if (type === 'tool_finished') {
                const ev = event as { output?: unknown; success?: boolean };
                lastToolOutput = ev.output ?? null;
                if (ev.success === false) toolErrorCount++;
                clearIdleTimer();
                idleTimer = setTimeout(() => { idleTimer = null; injectRunDone(); }, IDLE_RUN_DONE_MS);
              } else if (type === 'agent_response') {
                // Agent yanıtladı → run_done enjeksiyonu gerekmez; idle timer iptal.
                clearIdleTimer();
              } else if (type === 'run_done') {
                clearIdleTimer();
                setTimeout(() => closeWsAndReconnect(), 150);
              }
            } catch { /* ignore */ }
          },
          (connected: boolean) => scene.setConnected(connected)
        );
      },
    },
  };

  gameInstance = new Phaser.Game(config);
}

void start();
