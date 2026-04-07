import net from 'node:net';
import { WebSocketServer } from 'ws';

const SHUTDOWN_ACTION = 'shutdown';
function buildHelloMessage(totalToolsUsed: number, selectedChar?: string): string {
    return JSON.stringify({ type: 'hello', version: 1, totalToolsUsed, selectedChar });
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
    if (eventBuffer.length > EVENT_BUFFER_MAX) {
        eventBuffer.shift();
    }
}

let wssInstance: WebSocketServer | null = null;
let idleCloseTimer: NodeJS.Timeout | null = null;
let currentWsPort: number | null = null;

/** Called when the first MCP tool usage or run_started event is received. */
let onRunStartedCallback: (() => void) | null = null;
let panelOpened = false;
let getTotalToolsUsedCallback: (() => number) | undefined;
let onToolFinishedCallback: (() => void) | undefined;

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
        currentWsPort = null;
    }
}

function clearIdleCloseTimer(): void {
    if (idleCloseTimer !== null) {
        clearTimeout(idleCloseTimer);
        idleCloseTimer = null;
    }
}


process.on('exit', syncClose);

let getSelectedCharCallback: (() => string | undefined) | undefined;

/**
 * Start the visualizer WebSocket server (idempotent).
 */
export function startVisualizerWs(opts: {
    port?: number;
    onRunStarted?: () => void;
    getSelectedChar?: () => string | undefined;
    getTotalToolsUsed?: () => number;
    onToolFinished?: () => void;
    onListening?: (actualPort: number) => void;
    maxPortAttempts?: number;
} = {}): Promise<{ server: WebSocketServer; port: number } | null> {
    const basePort = opts.port ?? 3020;
    const maxPortAttempts = Math.max(1, opts.maxPortAttempts ?? 100);
    if (opts.onRunStarted  !== undefined) {onRunStartedCallback    = opts.onRunStarted;}
    if (opts.getSelectedChar !== undefined) {getSelectedCharCallback = opts.getSelectedChar;}
    if (opts.getTotalToolsUsed !== undefined) {getTotalToolsUsedCallback = opts.getTotalToolsUsed;}
    if (opts.onToolFinished !== undefined) {onToolFinishedCallback = opts.onToolFinished;}
    if (wssInstance !== null && currentWsPort !== null) {
        if (opts.onListening) {opts.onListening(currentWsPort);}
        return Promise.resolve({ server: wssInstance, port: currentWsPort });
    }

    const isPortAvailable = (port: number): Promise<boolean> => {
        return new Promise((resolve) => {
            const tester = net.createServer();
            tester.once('error', () => resolve(false));
            tester.once('listening', () => {
                tester.close(() => resolve(true));
            });
            tester.listen(port, '127.0.0.1');
        });
    };

    const resolveAvailablePort = async (): Promise<number | null> => {
        for (let i = 0; i < maxPortAttempts; i += 1) {
            const port = basePort + i;
            if (await isPortAvailable(port)) {
                return port;
            }
        }
        return null;
    };

    return resolveAvailablePort().then((resolvedPort) => {
        if (resolvedPort === null) {
            return null;
        }
        const wss = new WebSocketServer({ port: resolvedPort });
        wssInstance = wss;
        currentWsPort = resolvedPort;
        if (opts.onListening) {opts.onListening(resolvedPort);}

        wss.on('error', (err: unknown) => {
            console.error('[visualizer] WebSocket server error:', err);
            wssInstance = null;
            currentWsPort = null;
        });

        wss.on('connection', (ws) => {
            const totalToolsUsed = getTotalToolsUsedCallback ? getTotalToolsUsedCallback() : 0;
            ws.send(buildHelloMessage(totalToolsUsed, getSelectedCharCallback?.()));
            for (const payload of eventBuffer) {
                if (ws.readyState === 1) {ws.send(payload);}
            }

            ws.on('message', (raw) => {
                if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) {return;}
                const rawStr = raw.toString();
                try {
                    const message = JSON.parse(rawStr) as Record<string, unknown>;

                    if (message.type === 'control' && message.action === SHUTDOWN_ACTION) {
                        void closeVisualizer();
                    } else if (isInjectableEvent(message)) {
                        if (message.type === 'run_started') {
                            eventBuffer.length = 0;
                            if (onRunStartedCallback) {onRunStartedCallback();}
                        }
                        if (message.type === 'tool_finished' && onToolFinishedCallback) {onToolFinishedCallback();}
                        bufferEvent(rawStr);
                        for (const other of wss.clients) {
                            if (other !== ws && other.readyState === 1) {other.send(rawStr);}
                        }
                        // The WS server closes only via the "Close" button
                        // or when the extension host shuts down — no idle timer.
                    }
                } catch { /* ignore malformed */ }
            });
        });

        wss.on('close', () => {
            clearIdleCloseTimer();
            wssInstance = null;
            currentWsPort = null;
        });
        console.log(`[Browser DevTools MCP] Visualizer WebSocket server listening on port ${resolvedPort}`);
        return { server: wss, port: resolvedPort };
    });
}

export function closeVisualizer(): Promise<void> {
    clearIdleCloseTimer();
    if (wssInstance === null) {return Promise.resolve();}
    const wss = wssInstance;
    wssInstance = null;
    // Force-terminate all connected clients (Phaser UI, hook scripts) so the
    // server closes immediately without waiting for graceful handshakes.
    for (const client of wss.clients) {
        try { client.terminate(); } catch { /* ignore */ }
    }
    return new Promise((resolve) => wss.close(() => resolve()));
}
