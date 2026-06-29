import "dotenv/config";
import http from "node:http";
import { AppConfig, loadConfig } from "./config.js";
import { RemoteNodeRegistry, type RemoteNodeConfig, type RemoteCommandRequest } from "./cross-machine/nodes.js";
import { JobStore } from "./cross-machine/jobs.js";
import { MeshStatusChecker } from "./cross-machine/mesh.js";
import { InboundGatewayHandler, HQ_CAPABILITIES, type GatewayServices } from "./cross-machine/gateway.js";

export interface ServerOptions {
  /** Inject memory retrieval for the inbound gateway (optional; heavy dep). */
  memoryRetrieve?: GatewayServices["memoryRetrieve"];
  /** Inject model-call for the inbound gateway (optional; heavy dep). */
  modelCall?: GatewayServices["modelCall"];
}

export function createServer(
  registry: RemoteNodeRegistry,
  config: AppConfig,
  jobs?: JobStore,
  opts: ServerOptions = {},
): http.Server {
  const jobStore = jobs ?? new JobStore();
  const meshChecker = new MeshStatusChecker(registry, config.memoryServiceUrl);
  const gatewayHandler = new InboundGatewayHandler({
    registry,
    jobStore,
    nodeCount: () => registry.list().then((n) => n.length),
    memoryServiceUrl: config.memoryServiceUrl,
    gatewayAuthRequired: !!config.gatewayInboundKey,
    memoryRetrieve: opts.memoryRetrieve,
    modelCall: opts.modelCall,
  });

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const path = url.pathname;
      const method = req.method ?? "GET";

      if (method === "GET" && path === "/health") {
        return sendJson(res, 200, {
          ok: true,
          service: "open-agent-os",
          gateway: true,
          capabilities: HQ_CAPABILITIES,
          gatewayAuthRequired: !!config.gatewayInboundKey,
        });
      }

      // Inbound command from a remote mesh node.
      if (method === "POST" && path === "/command") {
        if (config.gatewayInboundKey && req.headers.authorization !== `Bearer ${config.gatewayInboundKey}`) {
          return sendJson(res, 401, { ok: false, error: "invalid or missing gateway key" });
        }
        const body = await parseJsonBody(req, res);
        if (!body) return;
        const { command, args, requestId } = body as { command?: string; args?: unknown; requestId?: string };
        if (!command) {
          return sendJson(res, 400, { ok: false, error: "command is required" });
        }
        const result = await gatewayHandler.handle({ command, args, requestId });
        return sendJson(res, result.ok ? 200 : 400, result);
      }

      if (method === "GET" && path === "/status") {
        const nodes = await registry.list();
        return sendJson(res, 200, {
          ok: true,
          nodes,
          jobs: { total: jobStore.list().length },
          crossMachine: {
            memoryServiceUrl: config.memoryServiceUrl,
            remoteCommandGatewayUrl: config.remoteCommandGatewayUrl,
          },
        });
      }

      if (method === "GET" && path === "/mesh/status") {
        const status = await meshChecker.check();
        return sendJson(res, 200, { ok: true, ...status });
      }

      if (method === "GET" && path === "/dashboard") {
        return sendHtml(res, 200, buildDashboardHtml());
      }

      if (method === "GET" && path === "/nodes") {
        const nodes = await registry.list();
        return sendJson(res, 200, { ok: true, nodes });
      }

      if (path.startsWith("/nodes/") && path.endsWith("/health") && method === "GET") {
        const name = decodeURIComponent(path.slice(7, -7));
        const node = await registry.get(name);
        if (!node) return sendJson(res, 404, { ok: false, error: "node not found" });
        const health = await registry.ping(node);
        if (health.ok) {
          await registry.set({ ...node, lastSeen: new Date().toISOString() });
        }
        return sendJson(res, health.ok ? 200 : 502, { ok: health.ok, health });
      }

      if (path.startsWith("/nodes/") && method === "GET") {
        const name = decodeURIComponent(path.slice(7));
        const node = await registry.get(name);
        if (!node) return sendJson(res, 404, { ok: false, error: "node not found" });
        return sendJson(res, 200, { ok: true, node });
      }

      if (path.startsWith("/nodes/") && method === "DELETE") {
        const name = decodeURIComponent(path.slice(7));
        const removed = await registry.remove(name);
        return sendJson(res, removed ? 200 : 404, { ok: removed, name });
      }

      if (method === "POST" && path === "/remote/register") {
        const body = await parseJsonBody(req, res);
        if (!body) return;
        if (config.remoteNodeRegistrationKey && req.headers.authorization !== `Bearer ${config.remoteNodeRegistrationKey}`) {
          return sendJson(res, 401, { ok: false, error: "invalid registration key" });
        }

        const node = body as RemoteNodeConfig;
        if (!node?.name || !node?.url || !node?.type) {
          return sendJson(res, 400, { ok: false, error: "name, url, and type are required" });
        }

        await registry.set({ ...node, lastSeen: new Date().toISOString() });
        return sendJson(res, 200, { ok: true, node });
      }

      if (method === "POST" && path === "/gateway/command") {
        const body = await parseJsonBody(req, res);
        if (!body) return;
        const { nodeName, command, args, payload } = body as { nodeName?: string; command?: string; args?: unknown; payload?: unknown };
        if (!nodeName || !command) {
          return sendJson(res, 400, { ok: false, error: "nodeName and command are required" });
        }

        const result = await registry.forwardCommand(nodeName, { command, args, payload });
        return sendJson(res, result.ok ? 200 : 502, result);
      }

      // Async dispatch — returns a job ID immediately; executes in background.
      if (method === "POST" && path === "/gateway/dispatch") {
        const body = await parseJsonBody(req, res);
        if (!body) return;
        const { nodeName, command, args, payload } = body as { nodeName?: string; command?: string; args?: unknown; payload?: unknown };
        if (!nodeName || !command) {
          return sendJson(res, 400, { ok: false, error: "nodeName and command are required" });
        }

        const job = jobStore.create(nodeName, command);
        sendJson(res, 202, { ok: true, jobId: job.id, status: job.status });

        (async () => {
          jobStore.update(job.id, { status: "running" });
          const result = await registry.forwardCommand(nodeName, { command, args, payload });
          if (result.ok) {
            jobStore.update(job.id, { status: "success", result: result.result });
          } else {
            jobStore.update(job.id, { status: "error", error: result.error ?? result.status });
          }
        })();

        return;
      }

      if (method === "GET" && path === "/jobs") {
        return sendJson(res, 200, { ok: true, jobs: jobStore.list() });
      }

      if (path.startsWith("/jobs/") && path.endsWith("/progress") && method === "POST") {
        const id = decodeURIComponent(path.slice(6, -9));
        const body = await parseJsonBody(req, res);
        if (!body) return;
        const { progress, message } = body as { progress?: unknown; message?: string };
        if (typeof progress !== "number") {
          return sendJson(res, 400, { ok: false, error: "progress must be a number" });
        }
        const job = jobStore.get(id);
        if (!job) return sendJson(res, 404, { ok: false, error: "job not found" });
        jobStore.updateProgress(id, progress, message);
        return sendJson(res, 200, { ok: true, job: jobStore.get(id) });
      }

      if (path.startsWith("/jobs/") && method === "GET") {
        const id = decodeURIComponent(path.slice(6));
        const job = jobStore.get(id);
        if (!job) return sendJson(res, 404, { ok: false, error: "job not found" });
        return sendJson(res, 200, { ok: true, job });
      }

      return sendJson(res, 404, { ok: false, error: "not found" });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: String(err) });
    }
  });

  return server;
}

export async function startServer(port = 3737): Promise<http.Server> {
  const config = loadConfig();
  const registry = new RemoteNodeRegistry(config.remoteNodesPath);
  const server = createServer(registry, config);
  await new Promise<void>((resolve) => server.listen(port, resolve));
  return server;
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "connection": "close" });
  res.end(body);
}

function sendHtml(res: http.ServerResponse, status: number, html: string): void {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "connection": "close" });
  res.end(html);
}

async function parseJsonBody(req: http.IncomingMessage, res: http.ServerResponse): Promise<unknown | null> {
  return new Promise((resolve) => {
    const chunks: Uint8Array[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        sendJson(res, 400, { ok: false, error: "invalid JSON body" });
        resolve(null);
      }
    });
    req.on("error", () => {
      sendJson(res, 400, { ok: false, error: "request body error" });
      resolve(null);
    });
  });
}

function buildDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Agent OS — Mesh Status</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#0f1117;color:#e2e8f0;min-height:100vh;padding:24px}
  h1{font-size:1.4rem;font-weight:700;letter-spacing:.04em;color:#f8fafc;margin-bottom:4px}
  .subtitle{font-size:.8rem;color:#64748b;margin-bottom:24px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-bottom:16px}
  .card{background:#1e2130;border:1px solid #2d3148;border-radius:10px;padding:18px}
  .card-title{font-size:.75rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;margin-bottom:14px}
  table{width:100%;border-collapse:collapse;font-size:.82rem}
  th{text-align:left;color:#64748b;font-weight:500;padding:0 8px 8px 0;border-bottom:1px solid #2d3148}
  td{padding:7px 8px 7px 0;border-bottom:1px solid #1a1f2e;vertical-align:middle}
  tr:last-child td{border-bottom:none}
  .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.7rem;font-weight:600;letter-spacing:.04em}
  .up{background:#14532d;color:#4ade80}
  .down{background:#450a0a;color:#f87171}
  .pending{background:#1c1917;color:#a8a29e}
  .running{background:#172554;color:#60a5fa}
  .success{background:#14532d;color:#4ade80}
  .error{background:#450a0a;color:#f87171}
  .mem-status{font-size:2rem;margin-bottom:4px}
  .mem-label{font-size:.85rem;color:#94a3b8}
  .progress-bar{background:#2d3148;border-radius:4px;height:6px;width:100%;margin-top:4px}
  .progress-fill{height:6px;border-radius:4px;background:#3b82f6;transition:width .4s}
  .summary-row{display:flex;gap:20px;margin-bottom:20px;flex-wrap:wrap}
  .stat{background:#1e2130;border:1px solid #2d3148;border-radius:8px;padding:12px 20px;min-width:120px}
  .stat-num{font-size:1.8rem;font-weight:700;line-height:1}
  .stat-label{font-size:.72rem;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:.06em}
  .green{color:#4ade80} .red{color:#f87171} .blue{color:#60a5fa}
  .refresh{font-size:.72rem;color:#475569;margin-top:16px}
  #last-checked{color:#94a3b8}
  .no-nodes{color:#475569;font-size:.85rem;padding:8px 0}
</style>
</head>
<body>
<h1>Agent OS</h1>
<p class="subtitle">Mesh Status Panel &mdash; auto-refreshes every 5 s</p>

<div class="summary-row" id="summary"></div>

<div class="grid">
  <div class="card">
    <div class="card-title">Mesh Connectivity</div>
    <div id="nodes-panel"><span class="no-nodes">Loading&hellip;</span></div>
  </div>
  <div class="card">
    <div class="card-title">Memory Service</div>
    <div id="memory-panel"><span class="no-nodes">Loading&hellip;</span></div>
  </div>
  <div class="card">
    <div class="card-title">Connector &amp; Ingestion Jobs</div>
    <div id="ingestion-panel"><span class="no-nodes">Loading&hellip;</span></div>
  </div>
  <div class="card">
    <div class="card-title">Recent Jobs</div>
    <div id="jobs-panel"><span class="no-nodes">Loading&hellip;</span></div>
  </div>
</div>

<div class="refresh">Last checked: <span id="last-checked">&mdash;</span></div>

<script>
function badge(cls, text) {
  return '<span class="badge ' + cls + '">' + text + '</span>';
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function timeSince(iso) {
  if (!iso) return '—';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return secs + 's ago';
  if (secs < 3600) return Math.floor(secs/60) + 'm ago';
  return Math.floor(secs/3600) + 'h ago';
}

async function refresh() {
  const [meshRes, jobsRes] = await Promise.all([
    fetch('/mesh/status').then(r => r.json()).catch(() => null),
    fetch('/jobs').then(r => r.json()).catch(() => ({ jobs: [] })),
  ]);

  if (!meshRes) return;
  document.getElementById('last-checked').textContent = new Date(meshRes.checkedAt).toLocaleTimeString();

  // Summary row
  const s = meshRes.summary;
  document.getElementById('summary').innerHTML =
    '<div class="stat"><div class="stat-num green">' + s.reachable + '</div><div class="stat-label">Reachable</div></div>' +
    '<div class="stat"><div class="stat-num red">' + s.unreachable + '</div><div class="stat-label">Unreachable</div></div>' +
    '<div class="stat"><div class="stat-num blue">' + s.total + '</div><div class="stat-label">Total Nodes</div></div>';

  // Nodes table
  const nodes = meshRes.nodes ?? [];
  if (!nodes.length) {
    document.getElementById('nodes-panel').innerHTML = '<span class="no-nodes">No remote nodes registered.</span>';
  } else {
    let rows = nodes.map(n =>
      '<tr><td>' + esc(n.name) + '</td><td>' + badge(n.reachable ? 'up' : 'down', n.reachable ? 'UP' : 'DOWN') +
      '</td><td>' + esc(n.type) + '</td><td>' + (n.latencyMs != null ? n.latencyMs + ' ms' : '—') +
      '</td><td>' + timeSince(n.lastSeen) + '</td></tr>'
    ).join('');
    document.getElementById('nodes-panel').innerHTML =
      '<table><thead><tr><th>Name</th><th>Status</th><th>Type</th><th>Latency</th><th>Last seen</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  // Memory service
  const memUrl = meshRes.memoryServiceUrl;
  const memOk = meshRes.memoryServiceReachable;
  const memNodes = nodes.filter(n => n.type === 'memory');
  let memHtml = '<div class="mem-status">' + (memOk ? '🟢' : (memUrl ? '🔴' : '⚪')) + '</div>' +
    '<div class="mem-label">' + (memUrl ? esc(memUrl) : 'No memory service configured') + '</div>';
  if (memNodes.length) {
    memHtml += '<br><table><thead><tr><th>Node</th><th>Status</th><th>Latency</th></tr></thead><tbody>' +
      memNodes.map(n => '<tr><td>' + esc(n.name) + '</td><td>' + badge(n.reachable ? 'up' : 'down', n.reachable ? 'UP' : 'DOWN') +
        '</td><td>' + (n.latencyMs != null ? n.latencyMs + ' ms' : '—') + '</td></tr>').join('') +
      '</tbody></table>';
  }
  document.getElementById('memory-panel').innerHTML = memHtml;

  // Ingestion jobs (connector nodes + jobs with command=ingest)
  const allJobs = jobsRes.jobs ?? [];
  const ingestJobs = allJobs.filter(j => j.command === 'ingest' || j.command === 'ingest-onedrive');
  const connectorNodes = nodes.filter(n => n.type === 'connector');
  let ingestHtml = '';
  if (connectorNodes.length) {
    ingestHtml += '<table><thead><tr><th>Connector</th><th>Status</th></tr></thead><tbody>' +
      connectorNodes.map(n => '<tr><td>' + esc(n.name) + '</td><td>' + badge(n.reachable ? 'up' : 'down', n.reachable ? 'UP' : 'DOWN') + '</td></tr>').join('') +
      '</tbody></table>';
  }
  if (ingestJobs.length) {
    ingestHtml += (connectorNodes.length ? '<br>' : '') + '<table><thead><tr><th>Job</th><th>Node</th><th>Status</th><th>Progress</th></tr></thead><tbody>' +
      ingestJobs.slice(-10).reverse().map(j =>
        '<tr><td>' + esc(j.command) + '</td><td>' + esc(j.nodeName) + '</td><td>' + badge(j.status, j.status) + '</td><td>' +
        (j.progress != null
          ? '<div class="progress-bar"><div class="progress-fill" style="width:' + j.progress + '%"></div></div><span style="font-size:.7rem;color:#64748b">' + j.progress + '%</span>'
          : '—') +
        '</td></tr>'
      ).join('') + '</tbody></table>';
  }
  if (!connectorNodes.length && !ingestJobs.length) {
    ingestHtml = '<span class="no-nodes">No connector nodes or ingestion jobs.</span>';
  }
  document.getElementById('ingestion-panel').innerHTML = ingestHtml;

  // Recent jobs
  const recent = allJobs.slice(-10).reverse();
  if (!recent.length) {
    document.getElementById('jobs-panel').innerHTML = '<span class="no-nodes">No jobs yet.</span>';
  } else {
    document.getElementById('jobs-panel').innerHTML =
      '<table><thead><tr><th>Command</th><th>Node</th><th>Status</th><th>Started</th></tr></thead><tbody>' +
      recent.map(j =>
        '<tr><td>' + esc(j.command) + '</td><td>' + esc(j.nodeName) + '</td><td>' + badge(j.status, j.status) +
        '</td><td>' + timeSince(j.createdAt) + '</td></tr>'
      ).join('') + '</tbody></table>';
  }
}

refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>`;
}

if (process.argv[1]?.endsWith("/server.ts") || process.argv[1]?.endsWith("\\server.ts")) {
  startServer().then((server) => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 3737;
    console.log(`open-agent-os server running on http://localhost:${port}`);
    console.log(`Dashboard: http://localhost:${port}/dashboard`);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
