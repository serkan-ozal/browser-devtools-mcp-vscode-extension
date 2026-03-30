/**
 * MCP stdio bridge — wraps the real browser-devtools-mcp server and forwards
 * JSON-RPC tool-call events to the visualizer WebSocket server.
 *
 * Usage: node mcp-bridge.js <real-mcp-path> [extra-args...]
 *
 * The bridge is transparent: stdin/stdout/stderr are piped straight through.
 * It additionally monitors for tools/call requests and their responses and
 * pushes run_started / tool_started / tool_finished events to the local WS.
 */

import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const [,, realMcpPath, ...extraArgs] = process.argv;
if (!realMcpPath) {
    process.stderr.write('[mcp-bridge] No real MCP path provided\n');
    process.exit(1);
}

const WS_PORT = Number(process.env['VIS_WS_PORT'] ?? 3020);
const WS_URL = `ws://localhost:${WS_PORT}`;

// ── WebSocket connection to the visualizer ───────────────────────────────────
let ws: WebSocket | null = null;
let wsReady = false;
const wsQueue: string[] = [];

function connectWs(): void {
    try {
        ws = new WebSocket(WS_URL);
        ws.on('open', () => {
            wsReady = true;
            for (const msg of wsQueue) ws!.send(msg);
            wsQueue.length = 0;
        });
        ws.on('close', () => { wsReady = false; ws = null; setTimeout(connectWs, 3000); });
        ws.on('error', () => { /* onclose follows */ });
    } catch {
        setTimeout(connectWs, 3000);
    }
}
connectWs();

function send(payload: object): void {
    const msg = JSON.stringify(payload);
    if (wsReady && ws) {
        ws.send(msg);
    } else {
        wsQueue.push(msg);
    }
}

// ── Run / agent state ────────────────────────────────────────────────────────
const RUN_ID = `run-${Date.now()}`;
const AGENT_ID = 'bridge-agent';
let runStarted = false;
const pendingCalls = new Map<number | string, string>(); // id → toolName

function ensureRunStarted(): void {
    if (runStarted) return;
    runStarted = true;
    send({ type: 'run_started', runId: RUN_ID, agentId: AGENT_ID, ts: Date.now() });
}

// ── JSON-RPC line parser ─────────────────────────────────────────────────────
function tryParseRpc(line: string): Record<string, unknown> | null {
    try {
        const v = JSON.parse(line.trim()) as unknown;
        if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch { /* not JSON */ }
    return null;
}

function onStdinLine(line: string): void {
    const rpc = tryParseRpc(line);
    if (!rpc) return;
    if (rpc['method'] === 'tools/call') {
        const params = rpc['params'] as Record<string, unknown> | undefined;
        const toolName = (params?.['name'] as string | undefined) ?? 'unknown';
        const id = rpc['id'] as number | string | undefined;
        ensureRunStarted();
        if (id !== undefined) pendingCalls.set(id, toolName);
        send({ type: 'tool_started', runId: RUN_ID, agentId: AGENT_ID, ts: Date.now(), toolName });
    }
}

function onStdoutLine(line: string): void {
    const rpc = tryParseRpc(line);
    if (!rpc) return;
    const id = rpc['id'] as number | string | undefined;
    if (id !== undefined && pendingCalls.has(id)) {
        const toolName = pendingCalls.get(id)!;
        pendingCalls.delete(id);
        const isError = rpc['error'] !== undefined;
        send({
            type: 'tool_finished',
            runId: RUN_ID,
            agentId: AGENT_ID,
            ts: Date.now(),
            toolName,
            success: !isError,
        });
    }
}

// ── Spawn the real MCP server ────────────────────────────────────────────────
const child = spawn('node', [realMcpPath, ...extraArgs], {
    env: process.env,
    stdio: ['pipe', 'pipe', 'inherit'],
});

child.on('error', (err) => {
    process.stderr.write(`[mcp-bridge] Failed to start MCP server: ${err.message}\n`);
    process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 0));

// stdin → child stdin (with line tap)
let stdinBuf = '';
process.stdin.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    child.stdin.write(chunk);
    stdinBuf += text;
    const lines = stdinBuf.split('\n');
    stdinBuf = lines.pop() ?? '';
    for (const l of lines) if (l.trim()) onStdinLine(l);
});
process.stdin.on('end', () => child.stdin.end());

// child stdout → process stdout (with line tap)
let stdoutBuf = '';
child.stdout.on('data', (chunk: Buffer) => {
    process.stdout.write(chunk);
    stdoutBuf += chunk.toString('utf8');
    const lines = stdoutBuf.split('\n');
    stdoutBuf = lines.pop() ?? '';
    for (const l of lines) if (l.trim()) onStdoutLine(l);
});
