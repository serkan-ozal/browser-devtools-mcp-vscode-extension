import fs from 'node:fs';
import path from 'node:path';

/**
 * Reads the Vite-built Phaser bundle from visualizer-ui/dist at runtime and
 * returns it as an inline <script type="module"> tag.
 * Returns null if the dist is not built yet.
 */
function loadVisualizerBundle(wsPort: number, extensionPath: string, savedChar?: string): string | null {
    try {
        const distDir = path.join(extensionPath, 'visualizer-ui', 'dist');
        const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
        const match = indexHtml.match(/src="([^"]+index[^"]*\.js)"/);
        if (!match) return null;
        const jsRel = match[1].replace(/^\//, '');
        const jsCode = fs.readFileSync(path.join(distDir, jsRel), 'utf8');
        // Set globals before the module executes
        const charJson = savedChar ? JSON.stringify(savedChar) : 'undefined';
        return [
            `<script>window.VIS_WS_PORT = ${wsPort}; window.__savedChar = ${charJson};</script>`,
            `<script type="module">`,
            jsCode,
            `</script>`,
        ].join('\n');
    } catch {
        return null;
    }
}

export function getVisualizerAppHtml(wsPort: number, extensionPath: string, savedChar?: string): string {
    const wsUrl = `ws://localhost:${wsPort}`;
    const phaserBundle = loadVisualizerBundle(wsPort, extensionPath, savedChar);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src ws://localhost:${wsPort}; img-src data: blob:;">
  <title>MCP Visualizer</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;background:#0f1117;color:#c9d1d9}

    /* HUD bar */
    .hud{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:8px 10px;font-size:12px;color:#8b949e;border-bottom:1px solid #21262d}
    .hud strong{color:#e6edf3;margin-right:3px}
    .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#e74c3c;margin-right:5px;vertical-align:middle;transition:background .3s}
    .dot.on{background:#2ecc71}
    .hud-spacer{flex:1}
    .close-btn{border:1px solid #30363d;background:#161b22;color:#e6edf3;border-radius:999px;padding:6px 10px;font-size:11px;cursor:pointer}
    .close-btn:hover{background:#21262d}
    body.closed #app-shell{display:none}
    .closed-state{display:none;padding:22px 10px;text-align:center;color:#8b949e;font-size:12px}
    body.closed .closed-state{display:block}

    /* Phaser canvas wrapper */
    #game-container{width:800px;max-width:100%;margin:0 auto;background:#1a1a1a}
    #game-container canvas{display:block;width:100%!important;height:auto!important}

    /* No-build fallback */
    .no-build{padding:16px 10px;font-size:12px;color:#8b949e;text-align:center}
    .no-build code{background:#161b22;padding:2px 6px;border-radius:4px;font-size:11px;color:#79c0ff}
  </style>
</head>
<body>
  <div id="app-shell">

  <!-- HUD bar -->
  <div class="hud">
    <div><span class="dot" id="dot"></span><strong>Browser DevTools MCP</strong><span id="status">Connecting…</span></div>
    <div><strong>Run</strong><span id="run">—</span></div>
    <div><strong>Last event:</strong><span id="last-event" style="color:#79c0ff">—</span></div>
    <div class="hud-spacer"></div>
    <button id="close-btn" class="close-btn" type="button">Close</button>
  </div>

  <!-- Phaser canvas or fallback -->
  ${phaserBundle
        ? `<div id="game-container"></div>`
        : `<div class="no-build">Phaser bundle not found. Run <code>npm run build</code> inside visualizer-ui first.</div>`}

  </div>
  <div class="closed-state">Visualizer closed.</div>

  <script>
(function(){
  var dotEl      = document.getElementById('dot');
  var statEl     = document.getElementById('status');
  var runEl      = document.getElementById('run');
  var lastEvEl   = document.getElementById('last-event');
  var closeEl    = document.getElementById('close-btn');
  var WS_URL = ${JSON.stringify(wsUrl)};
  var closed = false;

  function setConn(ok){
    dotEl.className='dot'+(ok?' on':'');
    statEl.textContent=ok?'Connected':'Disconnected';
  }

  function closeUi(){
    closed = true;
    document.body.classList.add('closed');
  }

  var ws=null;
  function connect(){
    if(ws){try{ws.close();}catch(_){} ws=null;}
    setConn(false);
    try{
      ws=new WebSocket(WS_URL);
      ws.onopen=function(){setConn(true);};
      ws.onclose=function(){setConn(false);if(!closed){setTimeout(connect,3000);}};
      ws.onerror=function(){setConn(false);};
      ws.onmessage=function(e){
        var data;
        try{data=JSON.parse(e.data);}catch(_){return;}
        if(!data||!data.type) return;
        if(data.runId) runEl.textContent=data.runId.slice(0,8)+'…';
        // Debug: show last event type + toolName in HUD
        var label = data.type + (data.toolName ? ':'+data.toolName : '');
        lastEvEl.textContent = label;
      };
    }catch(_){setConn(false);if(!closed){setTimeout(connect,3000);}}
  }
  connect();

  if(closeEl){
    closeEl.addEventListener('click', function(){
      try{
        if(ws && ws.readyState===WebSocket.OPEN){
          ws.send(JSON.stringify({type:'control', action:'shutdown'}));
        }
      }catch(_){}
      try{ if(ws){ ws.close(); } }catch(_){}
      closeUi();
    });
  }
})();
  </script>

  ${phaserBundle ?? ''}
</body>
</html>`;
}
