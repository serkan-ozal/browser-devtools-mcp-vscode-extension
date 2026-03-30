#!/usr/bin/env node
/**
 * Cursor Hooks → Browser DevTools Visualizer bridge.
 *
 * Reads a Cursor hook event from stdin (JSON), maps it to a SharedEvent,
 * and sends it to the visualizer WebSocket server (ws://localhost:3020).
 *
 * Exit codes:
 *   0 = allow (Cursor proceeds normally — this script never blocks)
 *   2 = block (abort operation) — never used here
 *
 * Installation: .cursor/hooks.json already references this script.
 * The visualizer WS server must be running on VIS_WS_PORT (default 3020).
 */

// No external imports — uses Node.js 21+ built-in WebSocket (globalThis.WebSocket).

const WS_PORT = parseInt(process.env.VIS_WS_PORT ?? '3020', 10);
const TIMEOUT_MS = 2500;

// ── Read stdin ────────────────────────────────────────────────────────────────
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const raw = Buffer.concat(chunks).toString('utf8').trim();

let hookEvent;
try {
  hookEvent = JSON.parse(raw);
} catch {
  process.exit(0); // Not valid JSON — silently ignore
}

// ── Debug: log raw hook payload so you can see what Cursor actually sends ────
// Remove these two lines once the routing is confirmed working.
process.stderr.write('[browser-devtools-hook] raw: ' + JSON.stringify(hookEvent) + '\n');

// ── Map Cursor hook event → SharedEvent ──────────────────────────────────────
const sharedEvent = mapToSharedEvent(hookEvent);
process.stderr.write('[browser-devtools-hook] mapped: ' + JSON.stringify(sharedEvent) + '\n');
if (!sharedEvent) process.exit(0);

// ── Send to visualizer WS ─────────────────────────────────────────────────────
await sendEvent(sharedEvent).catch(() => {
  // Visualizer not running — silently ignore so Cursor isn't affected
});
process.exit(0);

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps a Cursor hook event to a SharedEvent understood by the visualizer.
 *
 * Cursor provides `conversation_id` (stable per chat session) as the run ID.
 * Hook stdin base fields: conversation_id, hook_event_name, tool_name,
 * tool_input, tool_output, duration, status, loop_count, etc.
 *
 * @param {Record<string, unknown>} hook
 * @returns {Record<string, unknown> | null}
 */
function mapToSharedEvent(hook) {
  // conversation_id is stable across the whole chat session → use as runId
  const runId   = typeof hook.conversation_id === 'string' && hook.conversation_id
    ? hook.conversation_id
    : 'cursor-session';
  const agentId = 'cursor';
  const ts      = Date.now();

  const eventName = typeof hook.hook_event_name === 'string'
    ? hook.hook_event_name
    : String(hook.type ?? '');

  switch (eventName) {
    case 'sessionStart':
      return { type: 'run_started', runId, agentId, ts };

    // Cursor native tools (edit_file, read_file, run_terminal_cmd, …)
    // MCP toolları preToolUse'da "MCP:tool_name" olarak gelir → beforeMCPExecution ile çakışır,
    // orada zaten yakalanıyor, burada atlıyoruz.
    case 'preToolUse': {
      const tName = String(hook.tool_name ?? '');
      if (tName.startsWith('MCP:')) return null;
      return {
        type: 'tool_started',
        runId,
        agentId,
        ts,
        toolName: tName || 'unknown',
        input: hook.tool_input ?? undefined,
      };
    }

    case 'postToolUse': {
      const tName = String(hook.tool_name ?? '');
      if (tName.startsWith('MCP:')) return null;
      return {
        type: 'tool_finished',
        runId,
        agentId,
        ts,
        toolName: tName || 'unknown',
        success: true,
        output: truncate(hook.tool_output),
        durationMs: typeof hook.duration === 'number' ? hook.duration : undefined,
      };
    }

    // MCP tool calls (navigation_navigate, interaction_click, …)
    case 'beforeMCPExecution':
      return {
        type: 'tool_started',
        runId,
        agentId,
        ts,
        toolName: String(hook.tool_name ?? hook.name ?? 'unknown'),
        input: hook.tool_input ?? hook.params ?? hook.input ?? undefined,
      };

    case 'afterMCPExecution':
      return {
        type: 'tool_finished',
        runId,
        agentId,
        ts,
        toolName: String(hook.tool_name ?? hook.name ?? 'unknown'),
        success: hook.error == null,
        output: truncate(hook.result_json ?? hook.tool_output ?? hook.result ?? hook.output),
        durationMs: typeof hook.duration === 'number' ? hook.duration : undefined,
      };

    case 'afterAgentResponse': {
      // Cursor agent cevabı tamamlandı → parşömen scroll'da göster.
      // Cursor, response metnini farklı field'larda gönderebilir.
      const responseText =
        hook.response ??
        hook.message  ??
        hook.text     ??
        hook.output   ??
        null;
      if (!responseText) return null; // boş cevap, overlay açma
      return {
        type: 'agent_response',
        runId,
        agentId,
        ts,
        responseText: truncate(String(responseText), 4000),
      };
    }

    case 'stop':
      // afterAgentResponse zaten parşömen açıyor; stop üstüne yazmasın.
      return null;

    default:
      return null;
  }
}

/**
 * Truncate any value to a short string so we don't send huge payloads.
 * @param {unknown} value
 * @param {number} maxLen
 * @returns {string | undefined}
 */
function truncate(value, maxLen = 500) {
  if (value === null || value === undefined) return undefined;
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
}

/**
 * Open a WebSocket connection to the visualizer server, send one JSON
 * message, then close. Times out after TIMEOUT_MS to avoid blocking Cursor.
 *
 * @param {Record<string, unknown>} event
 * @returns {Promise<void>}
 */
function sendEvent(event) {
  return new Promise((resolve, reject) => {
    let ws;
    const timer = setTimeout(() => {
      try { ws?.close(); } catch { /* ignore */ }
      reject(new Error('WS send timeout'));
    }, TIMEOUT_MS);

    try {
      ws = new WebSocket(`ws://localhost:${WS_PORT}`);
    } catch (err) {
      clearTimeout(timer);
      reject(err);
      return;
    }

    ws.addEventListener('open', () => {
      try {
        ws.send(JSON.stringify(event));
        clearTimeout(timer);
        ws.close();
        resolve();
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });

    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('WS connection error'));
    });
  });
}
