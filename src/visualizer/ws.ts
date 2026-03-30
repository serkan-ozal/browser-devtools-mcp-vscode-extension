import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocketServer } from 'ws';

const SHUTDOWN_ACTION = 'shutdown';

// ── Tool usage stats (persisted to disk) ────────────────────────────────────
const STATS_DIR  = path.join(os.homedir(), '.browser-devtools-mcp');
const STATS_FILE = path.join(STATS_DIR, 'stats.json');

function readStats(): { totalToolsUsed: number } {
    try {
        const raw = fs.readFileSync(STATS_FILE, 'utf8');
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object' && 'totalToolsUsed' in parsed) {
            return { totalToolsUsed: Number((parsed as Record<string, unknown>).totalToolsUsed) || 0 };
        }
    } catch { /* file not yet created */ }
    return { totalToolsUsed: 0 };
}

function incrementToolCount(): number {
    const stats = readStats();
    stats.totalToolsUsed += 1;
    try {
        fs.mkdirSync(STATS_DIR, { recursive: true });
        fs.writeFileSync(STATS_FILE, JSON.stringify(stats), 'utf8');
    } catch { /* ignore write errors */ }
    return stats.totalToolsUsed;
}

function buildHelloMessage(): string {
    return JSON.stringify({ type: 'hello', version: 1, totalToolsUsed: readStats().totalToolsUsed });
}

/**
 * Validate that a parsed object looks like a SharedEvent that can be injected
 * by an external client (e.g. the Cursor Hooks bridge script).
 * Required: type (string, not 'control'), runId (string), agentId (string), ts (number).
 */
function isInjectableEvent(msg: Record<string, unknown>): boolean {
    return (
        typeof msg.type === 'string' &&
        msg.type !== 'control' &&
        typeof msg.runId === 'string' &&
        typeof msg.agentId === 'string' &&
        typeof msg.ts === 'number'
    );
}

/** Ring buffer of the last N events sent to WS clients. Replayed to new connections. */
const EVENT_BUFFER_MAX = 50;
const eventBuffer: string[] = [];

function bufferEvent(payload: string): void {
    eventBuffer.push(payload);
    if (eventBuffer.length > EVENT_BUFFER_MAX) eventBuffer.shift();
}

let wssInstance: WebSocketServer | null = null;
let idleCloseTimer: NodeJS.Timeout | null = null;
let portRetrying = false;

/** Idle close timeout in ms (0 = disabled). Set via startVisualizerWs options. */
let configuredIdleCloseMs = 0;

/** Called once when the first run_started event is received. */
let onRunStartedCallback: (() => void) | null = null;

function freePortAndRetry(port: number, delayMs = 1000): void {
    if (portRetrying) return;
    portRetrying = true;

    const doRetry = (): void => {
        setTimeout(() => {
            portRetrying = false;
            if (wssInstance === null) startVisualizerWs({ port });
        }, delayMs);
    };

    if (process.platform === 'win32') {
        doRetry();
        return;
    }

    execFile('lsof', ['-ti', `:${port}`], (err, stdout) => {
        if (!err && stdout.trim()) {
            const pids = stdout
                .trim()
                .split('\n')
                .map((s) => parseInt(s.trim(), 10))
                .filter((pid) => !isNaN(pid) && pid > 0 && pid !== process.pid);
            for (const pid of pids) {
                try {
                    process.kill(pid, 'SIGTERM');
                } catch { /* ignore */ }
            }
        }
        doRetry();
    });
}

function syncClose(): void {
    if (idleCloseTimer !== null) {
        clearTimeout(idleCloseTimer);
        idleCloseTimer = null;
    }
    if (wssInstance !== null) {
        try {
            wssInstance.close();
        } catch { /* ignore */ }
        wssInstance = null;
    }
}

function clearIdleCloseTimer(): void {
    if (idleCloseTimer !== null) {
        clearTimeout(idleCloseTimer);
        idleCloseTimer = null;
    }
}

function scheduleIdleClose(): void {
    if (configuredIdleCloseMs <= 0) return;
    clearIdleCloseTimer();
    idleCloseTimer = setTimeout(() => {
        idleCloseTimer = null;
        void closeVisualizer();
    }, configuredIdleCloseMs);
}

process.on('exit', syncClose);

/**
 * Start the visualizer WebSocket server (idempotent).
 */
export function startVisualizerWs(opts: {
    port?: number;
    idleCloseMs?: number;
    onRunStarted?: () => void;
} = {}): WebSocketServer | null {
    const wsPort = opts.port ?? 3020;
    if (opts.idleCloseMs !== undefined) configuredIdleCloseMs = opts.idleCloseMs;
    if (opts.onRunStarted !== undefined) onRunStartedCallback = opts.onRunStarted;
    if (wssInstance !== null) return wssInstance;

    try {
        const wss = new WebSocketServer({ port: wsPort });
        wssInstance = wss;

        wss.on('error', (err: unknown) => {
            const code = (err as NodeJS.ErrnoException)?.code;
            if (code === 'EADDRINUSE') {
                wssInstance = null;
                console.error(`[visualizer] Port ${wsPort} is already in use — auto-retrying after port cleanup…`);
                freePortAndRetry(wsPort);
            } else {
                wssInstance = null;
            }
        });

        wss.on('connection', (ws) => {
            ws.send(buildHelloMessage());
            for (const payload of eventBuffer) {
                if (ws.readyState === 1) ws.send(payload);
            }

            ws.on('message', (raw) => {
                if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) return;
                const rawStr = raw.toString();
                try {
                    const message = JSON.parse(rawStr) as Record<string, unknown>;

                    if (message.type === 'control' && message.action === SHUTDOWN_ACTION) {
                        void closeVisualizer();
                    } else if (isInjectableEvent(message)) {
                        if (message.type === 'run_started') {
                            eventBuffer.length = 0;
                            if (onRunStartedCallback) onRunStartedCallback();
                        }
                        if (message.type === 'tool_finished') incrementToolCount();
                        bufferEvent(rawStr);
                        for (const other of wss.clients) {
                            if (other !== ws && other.readyState === 1) other.send(rawStr);
                        }
                        const evType = message.type as string;
                        if (evType === 'tool_started' || evType === 'run_started') {
                            clearIdleCloseTimer();
                        } else if (evType === 'tool_finished' || evType === 'error') {
                            clearIdleCloseTimer();
                            idleCloseTimer = setTimeout(() => { idleCloseTimer = null; void closeVisualizer(); }, 120_000);
                        } else if (evType === 'run_done') {
                            scheduleIdleClose();
                        } else if (evType === 'agent_response') {
                            clearIdleCloseTimer();
                            if (configuredIdleCloseMs > 0) {
                                idleCloseTimer = setTimeout(() => { idleCloseTimer = null; void closeVisualizer(); }, 300_000);
                            }
                        }
                    }
                } catch { /* ignore malformed */ }
            });
        });

        wss.on('close', () => { clearIdleCloseTimer(); wssInstance = null; });
        console.log(`[Browser DevTools MCP] Visualizer WebSocket server listening on port ${wsPort}`);
        return wss;
    } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code === 'EADDRINUSE') {
            wssInstance = null;
            freePortAndRetry(wsPort);
        } else {
            wssInstance = null;
        }
        return null;
    }
}

export function closeVisualizer(): Promise<void> {
    clearIdleCloseTimer();
    if (wssInstance === null) return Promise.resolve();
    const wss = wssInstance;
    wssInstance = null;
    return new Promise((resolve) => wss.close(() => resolve()));
}
