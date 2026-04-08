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

// Uses globalThis.WebSocket (Node 21+) with fallback to 'ws' package for older versions.
import { createRequire } from 'node:module';
let _WsClient = null;
try {
  const req = createRequire(import.meta.url);
  _WsClient = req('ws');
} catch { /* ws not available */ }

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

// ── Map Cursor hook event → SharedEvent(s) ───────────────────────────────────
const mapped = mapToSharedEvent(hookEvent);
process.stderr.write('[browser-devtools-hook] mapped: ' + JSON.stringify(mapped) + '\n');
if (!mapped) process.exit(0);

// mapToSharedEvent may return a single event or an array of events
const sharedEvents = Array.isArray(mapped) ? mapped : [mapped];

// ── Send to visualizer WS ─────────────────────────────────────────────────────
for (const ev of sharedEvents) {
  await sendEvent(ev).catch((err) => {
    // Keep Cursor flow non-blocking, but surface transport failures for debugging.
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write('[browser-devtools-hook] send failed: ' + message + '\n');
  });
}
process.exit(0);

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strip server-name prefix from an MCP tool name.
 * Cursor may send "server-id__tool_name" or "server-id/tool_name".
 * We only want the local tool name part.
 * @param {string} name
 * @returns {string}
 */
function normalizeToolName(name) {
  if (!name) return name;
  // Handle double-underscore separator (most common in Cursor MCP hooks)
  const dblIdx = name.lastIndexOf('__');
  if (dblIdx !== -1) return name.slice(dblIdx + 2);
  // Handle slash separator
  const slashIdx = name.lastIndexOf('/');
  if (slashIdx !== -1) return name.slice(slashIdx + 1);
  return name;
}

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
    case 'preToolUse': {
      const outputs = Array.isArray(hook.toolOutputs) ? hook.toolOutputs : [];
      const tName = normalizeToolName(String(
        hook.tool_name ??
        outputs[0]?.name ??
        outputs[1]?.name ??
        ''
      ));
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
      const outputs = Array.isArray(hook.toolOutputs) ? hook.toolOutputs : [];
      const tName = normalizeToolName(String(
        hook.tool_name ??
        outputs[0]?.name ??
        outputs[1]?.name ??
        ''
      ));
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
    // Cursor may send the tool name as tool_name, name, or toolOutputs[0|1].name
    case 'beforeMCPExecution': {
      const outputs = Array.isArray(hook.toolOutputs) ? hook.toolOutputs : [];
      const mcpName = normalizeToolName(String(
        hook.tool_name ??
        hook.name ??
        outputs[0]?.name ??
        outputs[1]?.name ??
        'unknown'
      ));
      return {
        type: 'tool_started',
        source: 'mcp',
        runId,
        agentId,
        ts,
        toolName: mcpName,
        input: hook.tool_input ?? hook.params ?? hook.input ?? undefined,
      };
    }

    case 'afterMCPExecution': {
      const outputs = Array.isArray(hook.toolOutputs) ? hook.toolOutputs : [];
      const mcpName = normalizeToolName(String(
        hook.tool_name ??
        hook.name ??
        outputs[0]?.name ??
        outputs[1]?.name ??
        'unknown'
      ));
      return {
        type: 'tool_finished',
        source: 'mcp',
        runId,
        agentId,
        ts,
        toolName: mcpName,
        success: hook.error == null,
        output: truncate(hook.result_json ?? hook.tool_output ?? hook.result ?? hook.output),
        durationMs: typeof hook.duration === 'number' ? hook.duration : undefined,
      };
    }

    case 'afterAgentResponse': {
      // Cursor agent response is complete → show it in the parchment scroll.
      // Cursor may send the response text in different fields.
      const responseText =
        hook.response ??
        hook.message  ??
        hook.text     ??
        hook.output   ??
        null;
      if (!responseText) return null; // empty response, do not open overlay
      return {
        type: 'agent_response',
        runId,
        agentId,
        ts,
        responseText: truncate(String(responseText), 4000),
      };
    }

    case 'stop':
      // afterAgentResponse already opens the parchment; do not overwrite on stop.
      return null;

    default: {
      // Unknown event type — try to extract tool name from toolOutputs format.
      // If toolOutputs[n].name exists, synthesize tool_started + tool_finished.
      const outputs = Array.isArray(hook.toolOutputs) ? hook.toolOutputs : [];
      const fallbackName = normalizeToolName(String(
        hook.tool_name ??
        hook.name ??
        outputs[0]?.name ??
        outputs[1]?.name ??
        ''
      ));
      if (!fallbackName || fallbackName === 'unknown') return null;

      const hasOutput = outputs.some(o => o?.output !== undefined);
      if (hasOutput) {
        // Completion-only event → synthesize both start and finish
        const firstOutput = outputs.find(o => o?.output !== undefined);
        return [
          { type: 'tool_started',  runId, agentId, ts: ts - 1, toolName: fallbackName },
          { type: 'tool_finished', runId, agentId, ts,
            toolName: fallbackName,
            success: hook.error == null,
            output: truncate(firstOutput?.output) },
        ];
      }
      // Start-only event
      return { type: 'tool_started', runId, agentId, ts, toolName: fallbackName,
               input: hook.tool_input ?? hook.params ?? hook.input ?? undefined };
    }
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
 * Uses globalThis.WebSocket when available (Node 21+), otherwise falls back
 * to a minimal raw HTTP-upgrade + WS frame implementation (Node 20 compat).
 *
 * @param {Record<string, unknown>} event
 * @returns {Promise<void>}
 */
function sendEvent(event) {
  if (typeof globalThis.WebSocket === 'function') {
    // Node 21+ native WebSocket
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try { ws?.close(); } catch { /* ignore */ }
        reject(new Error('WS send timeout'));
      }, TIMEOUT_MS);

      let ws;
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
  // Fallback: 'ws' npm package (Node <21)
  return sendEventWsPackage(event);
}

/**
 * Send using the 'ws' npm package (works on all Node versions).
 */
function sendEventWsPackage(event) {
  if (!_WsClient) return Promise.reject(new Error('ws package not available'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try { ws?.close(); } catch { /* ignore */ }
      reject(new Error('WS send timeout'));
    }, TIMEOUT_MS);

    let ws;
    try {
      ws = new _WsClient(`ws://localhost:${WS_PORT}`);
    } catch (err) {
      clearTimeout(timer);
      reject(err);
      return;
    }

    ws.on('open', () => {
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

    ws.on('error', () => {
      clearTimeout(timer);
      reject(new Error('WS connection error'));
    });
  });
}
