import assert from "node:assert";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { RemoteNodeRegistry } from "../src/cross-machine/nodes.js";
import { MeshStatusChecker } from "../src/cross-machine/mesh.js";
import { JobStore } from "../src/cross-machine/jobs.js";
import { createServer } from "../src/server.js";

function trackSockets(server: http.Server): Set<import("node:net").Socket> {
  const sockets = new Set<import("node:net").Socket>();
  server.on("connection", (s) => { sockets.add(s); s.on("close", () => sockets.delete(s)); s.setKeepAlive(false); });
  server.keepAliveTimeout = 0;
  return sockets;
}

async function startMock(handler: http.RequestListener): Promise<{ port: number; server: http.Server; sockets: Set<import("node:net").Socket> }> {
  const server = http.createServer(handler);
  const sockets = trackSockets(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as import("node:net").AddressInfo).port;
  return { port, server, sockets };
}

async function stopMock(server: http.Server, sockets: Set<import("node:net").Socket>) {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const s of sockets) s.destroy();
}

export async function runMeshStatusTests(): Promise<void> {
  const tmp = join(tmpdir(), "open-agent-os-test", "mesh");
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });

  // --- MeshStatusChecker: no nodes ---
  const emptyRegistry = new RemoteNodeRegistry(join(tmp, "empty.json"));
  const emptyChecker = new MeshStatusChecker(emptyRegistry);
  const emptyStatus = await emptyChecker.check();
  assert.equal(emptyStatus.summary.total, 0);
  assert.equal(emptyStatus.summary.reachable, 0);
  assert.ok(emptyStatus.checkedAt);
  assert.equal(emptyStatus.memoryServiceReachable, false);

  // --- MeshStatusChecker: reachable node ---
  const { port: upPort, server: upServer, sockets: upSockets } = await startMock((_req, res) => {
    res.writeHead(200, { "content-type": "application/json", connection: "close" });
    res.end(JSON.stringify({ ok: true }));
  });

  const { port: downPort, server: downServer, sockets: downSockets } = await startMock((_req, res) => {
    res.destroy();
  });

  const registry = new RemoteNodeRegistry(join(tmp, "nodes.json"));
  await registry.set({ name: "up-node", url: `http://127.0.0.1:${upPort}`, type: "runner" });
  await registry.set({ name: "down-node", url: `http://127.0.0.1:${downPort}`, type: "memory" });

  const checker = new MeshStatusChecker(registry, `http://127.0.0.1:${upPort}`);
  const status = await checker.check();

  assert.equal(status.summary.total, 2);
  assert.equal(status.summary.reachable, 1);
  assert.equal(status.summary.unreachable, 1);
  assert.equal(status.memoryServiceReachable, true);

  const upNode = status.nodes.find((n) => n.name === "up-node");
  const downNode = status.nodes.find((n) => n.name === "down-node");
  assert.ok(upNode?.reachable);
  assert.ok(typeof upNode?.latencyMs === "number");
  assert.ok(!downNode?.reachable);
  assert.equal(downNode?.type, "memory");

  await stopMock(upServer, upSockets);
  await stopMock(downServer, downSockets);

  // --- GET /mesh/status endpoint ---
  const config = {
    port: 0,
    vaultPath: "/tmp/vault",
    dbPath: "/tmp/db",
    builtinSkillsDir: "/tmp/builtin",
    userSkillsDir: "/tmp/user",
    ollamaUrl: "http://localhost:11434",
    embedModel: "nomic-embed-text",
    memoryServiceUrl: undefined,
    remoteNodesPath: join(tmp, "srv-nodes.json"),
    remoteNodeRegistrationKey: undefined,
    remoteCommandGatewayUrl: undefined,
    router: { models: {}, openrouterKey: undefined, anthropicKey: undefined, ollamaUrl: "http://localhost:11434" },
  } as any;

  const srvRegistry = new RemoteNodeRegistry(config.remoteNodesPath);
  const jobs = new JobStore();
  const agentServer = createServer(srvRegistry, config, jobs);
  const agentSockets = trackSockets(agentServer);
  await new Promise<void>((resolve) => agentServer.listen(0, resolve));
  const agentBase = `http://127.0.0.1:${(agentServer.address() as import("node:net").AddressInfo).port}`;

  const meshRes = await fetch(`${agentBase}/mesh/status`, { headers: { connection: "close" } });
  assert.equal(meshRes.status, 200);
  const meshBody = await meshRes.json();
  assert.equal(meshBody.ok, true);
  assert.ok("checkedAt" in meshBody);
  assert.ok("summary" in meshBody);
  assert.equal(meshBody.summary.total, 0);

  // --- GET /dashboard returns HTML ---
  const dashRes = await fetch(`${agentBase}/dashboard`, { headers: { connection: "close" } });
  assert.equal(dashRes.status, 200);
  const dashContentType = dashRes.headers.get("content-type") ?? "";
  assert.ok(dashContentType.includes("text/html"), `expected text/html, got ${dashContentType}`);
  const dashHtml = await dashRes.text();
  assert.ok(dashHtml.includes("Agent OS"), "dashboard missing title");
  assert.ok(dashHtml.includes("/mesh/status"), "dashboard missing API reference");

  // --- POST /jobs/:id/progress ---
  const dispatchRes = await fetch(`${agentBase}/gateway/dispatch`, {
    method: "POST",
    headers: { "content-type": "application/json", connection: "close" },
    body: JSON.stringify({ nodeName: "non-existent-node", command: "ingest" }),
  });
  assert.equal(dispatchRes.status, 202);
  const { jobId } = await dispatchRes.json();

  // Update progress
  const progRes = await fetch(`${agentBase}/jobs/${jobId}/progress`, {
    method: "POST",
    headers: { "content-type": "application/json", connection: "close" },
    body: JSON.stringify({ progress: 42, message: "Indexing proposals..." }),
  });
  assert.equal(progRes.status, 200);
  const progBody = await progRes.json();
  assert.equal(progBody.ok, true);
  assert.equal(progBody.job.progress, 42);
  assert.equal(progBody.job.progressMessage, "Indexing proposals...");

  // Progress clamped to 0–100
  await fetch(`${agentBase}/jobs/${jobId}/progress`, {
    method: "POST",
    headers: { "content-type": "application/json", connection: "close" },
    body: JSON.stringify({ progress: 150 }),
  });
  const clampedJob = jobs.get(jobId);
  assert.equal(clampedJob?.progress, 100);

  // Progress on missing job → 404
  const missingProgRes = await fetch(`${agentBase}/jobs/00000000-0000-0000-0000-000000000000/progress`, {
    method: "POST",
    headers: { "content-type": "application/json", connection: "close" },
    body: JSON.stringify({ progress: 50 }),
  });
  assert.equal(missingProgRes.status, 404);

  // Progress with non-number → 400
  const badProgRes = await fetch(`${agentBase}/jobs/${jobId}/progress`, {
    method: "POST",
    headers: { "content-type": "application/json", connection: "close" },
    body: JSON.stringify({ progress: "fifty" }),
  });
  assert.equal(badProgRes.status, 400);

  await new Promise<void>((resolve) => agentServer.close(() => resolve()));
  for (const s of agentSockets) s.destroy();
}
