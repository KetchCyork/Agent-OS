import http from "node:http";
import { AppConfig, loadConfig } from "./config.js";
import { RemoteNodeRegistry, type RemoteNodeConfig, type RemoteCommandRequest } from "./cross-machine/nodes.js";
import { JobStore } from "./cross-machine/jobs.js";

export function createServer(registry: RemoteNodeRegistry, config: AppConfig, jobs?: JobStore): http.Server {
  const jobStore = jobs ?? new JobStore();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const path = url.pathname;
      const method = req.method ?? "GET";

      if (method === "GET" && path === "/health") {
        return sendJson(res, 200, { ok: true, service: "open-agent-os" });
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

        // Execute in background — do not await before responding.
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
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "connection": "close",
  });
  res.end(body);
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
      } catch (err) {
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

if (process.argv[1]?.endsWith("/server.ts") || process.argv[1]?.endsWith("\\server.ts")) {
  startServer().then((server) => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 3737;
    console.log(`open-agent-os server running on http://localhost:${port}`);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
