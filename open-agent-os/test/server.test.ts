import assert from "node:assert";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { createServer } from "../src/server.js";
import { RemoteNodeRegistry } from "../src/cross-machine/nodes.js";
import { JobStore } from "../src/cross-machine/jobs.js";

const config = {
  port: 0,
  vaultPath: "/tmp/vault",
  dbPath: "/tmp/db",
  builtinSkillsDir: "/tmp/builtin",
  userSkillsDir: "/tmp/user",
  ollamaUrl: "http://localhost:11434",
  embedModel: "nomic-embed-text",
  memoryServiceUrl: "http://localhost:4000",
  remoteNodesPath: join(tmpdir(), "open-agent-os-test", "server", "nodes.json"),
  remoteNodeRegistrationKey: "test-key",
  remoteCommandGatewayUrl: undefined,
  router: { models: {}, openrouterKey: undefined, anthropicKey: undefined, ollamaUrl: "http://localhost:11434" },
} as any;

function trackSockets(server: http.Server): Set<import("node:net").Socket> {
  const sockets = new Set<import("node:net").Socket>();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.setKeepAlive(false);
  });
  server.keepAliveTimeout = 0;
  return sockets;
}

async function startTestServer(registry: RemoteNodeRegistry, jobs?: JobStore): Promise<{ base: string; server: http.Server; sockets: Set<import("node:net").Socket> }> {
  const server = createServer(registry, config, jobs);
  const sockets = trackSockets(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("unexpected address");
  const base = `http://127.0.0.1:${address.port}`;
  return { base, server, sockets };
}

async function stopServer(server: http.Server, sockets: Set<import("node:net").Socket>): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const socket of sockets) socket.destroy();
}

export async function runServerTests(): Promise<void> {
  const tmp = join(tmpdir(), "open-agent-os-test", "server");
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const registry = new RemoteNodeRegistry(config.remoteNodesPath);
  const { base, server, sockets } = await startTestServer(registry);

  // /health
  const health = await fetch(`${base}/health`, { headers: { connection: "close" } });
  assert.equal(health.status, 200);
  const healthBody = await health.json();
  assert.equal(healthBody.ok, true);

  // /status
  const status = await fetch(`${base}/status`, { headers: { connection: "close" } });
  assert.equal(status.status, 200);
  const statusBody = await status.json();
  assert.equal(statusBody.ok, true);
  assert.ok("nodes" in statusBody);
  assert.ok("jobs" in statusBody);

  // POST /remote/register — valid
  const registerRes = await fetch(`${base}/remote/register`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test-key", connection: "close" },
    body: JSON.stringify({ name: "test-node", url: "http://127.0.0.1:0", type: "runner" }),
  });
  assert.equal(registerRes.status, 200);
  const registerBody = await registerRes.json();
  assert.equal(registerBody.ok, true);
  assert.equal(registerBody.node.name, "test-node");

  // POST /remote/register — wrong key (auth rejection)
  const badAuthRes = await fetch(`${base}/remote/register`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer wrong-key", connection: "close" },
    body: JSON.stringify({ name: "x", url: "http://127.0.0.1:0", type: "runner" }),
  });
  assert.equal(badAuthRes.status, 401);
  const badAuthBody = await badAuthRes.json();
  assert.equal(badAuthBody.ok, false);

  // POST /remote/register — missing key header
  const noAuthRes = await fetch(`${base}/remote/register`, {
    method: "POST",
    headers: { "content-type": "application/json", connection: "close" },
    body: JSON.stringify({ name: "x", url: "http://127.0.0.1:0", type: "runner" }),
  });
  assert.equal(noAuthRes.status, 401);

  // GET /nodes
  const nodesRes = await fetch(`${base}/nodes`, { headers: { connection: "close" } });
  const nodesBody = await nodesRes.json();
  assert.equal(nodesBody.ok, true);
  assert.equal(nodesBody.nodes.length, 1);

  // GET /nodes/:name — found
  const nodeRes = await fetch(`${base}/nodes/test-node`, { headers: { connection: "close" } });
  assert.equal(nodeRes.status, 200);
  const nodeBody = await nodeRes.json();
  assert.equal(nodeBody.node.name, "test-node");

  // GET /nodes/:name — not found
  const missingRes = await fetch(`${base}/nodes/no-such-node`, { headers: { connection: "close" } });
  assert.equal(missingRes.status, 404);

  // DELETE /nodes/:name — removes node
  const deleteRes = await fetch(`${base}/nodes/test-node`, { method: "DELETE", headers: { connection: "close" } });
  assert.equal(deleteRes.status, 200);
  const deleteBody = await deleteRes.json();
  assert.equal(deleteBody.ok, true);
  assert.equal((await registry.list()).length, 0);

  // DELETE /nodes/:name — already gone
  const deleteMissingRes = await fetch(`${base}/nodes/test-node`, { method: "DELETE", headers: { connection: "close" } });
  assert.equal(deleteMissingRes.status, 404);

  await stopServer(server, sockets);

  // --- Node health endpoint test (with mock node) ---
  const registry2 = new RemoteNodeRegistry(join(tmp, "nodes2.json"));
  const { base: base2, server: server2, sockets: sockets2 } = await startTestServer(registry2);

  // Spin up a minimal mock node
  const mockSockets = new Set<import("node:net").Socket>();
  const mockNode = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json", connection: "close" });
    res.end(JSON.stringify({ ok: true }));
  });
  mockNode.on("connection", (s) => { mockSockets.add(s); s.on("close", () => mockSockets.delete(s)); s.setKeepAlive(false); });
  mockNode.keepAliveTimeout = 0;
  await new Promise<void>((resolve) => mockNode.listen(0, resolve));
  const mockAddr = mockNode.address() as import("node:net").AddressInfo;

  await registry2.set({ name: "live-node", url: `http://127.0.0.1:${mockAddr.port}`, type: "runner" });

  const healthRes = await fetch(`${base2}/nodes/live-node/health`, { headers: { connection: "close" } });
  assert.equal(healthRes.status, 200);
  const nodeHealthBody = await healthRes.json();
  assert.equal(nodeHealthBody.ok, true);

  // Health check for unknown node
  const healthMissingRes = await fetch(`${base2}/nodes/no-node/health`, { headers: { connection: "close" } });
  assert.equal(healthMissingRes.status, 404);

  await new Promise<void>((resolve) => mockNode.close(() => resolve()));
  for (const s of mockSockets) s.destroy();

  // --- Gateway command forwarding test ---
  const cmdSockets = new Set<import("node:net").Socket>();
  const cmdServer = http.createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/command") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      res.writeHead(200, { "content-type": "application/json", connection: "close" });
      res.end(JSON.stringify({ echoed: body }));
      return;
    }
    res.writeHead(404, { connection: "close" });
    res.end();
  });
  cmdServer.on("connection", (s) => { cmdSockets.add(s); s.on("close", () => cmdSockets.delete(s)); s.setKeepAlive(false); });
  cmdServer.keepAliveTimeout = 0;
  await new Promise<void>((resolve) => cmdServer.listen(0, resolve));
  const cmdAddr = cmdServer.address() as import("node:net").AddressInfo;

  await registry2.set({ name: "cmd-node", url: `http://127.0.0.1:${cmdAddr.port}`, type: "runner" });

  const gwRes = await fetch(`${base2}/gateway/command`, {
    method: "POST",
    headers: { "content-type": "application/json", connection: "close" },
    body: JSON.stringify({ nodeName: "cmd-node", command: "echo", args: { msg: "hello" } }),
  });
  assert.equal(gwRes.status, 200);
  const gwBody = await gwRes.json();
  assert.equal(gwBody.ok, true);
  assert.equal((gwBody.result as any).echoed.command, "echo");

  // Gateway — missing nodeName/command
  const gwBadRes = await fetch(`${base2}/gateway/command`, {
    method: "POST",
    headers: { "content-type": "application/json", connection: "close" },
    body: JSON.stringify({ nodeName: "cmd-node" }),
  });
  assert.equal(gwBadRes.status, 400);

  // --- Async dispatch test ---
  const jobs = new JobStore();
  const registry3 = new RemoteNodeRegistry(join(tmp, "nodes3.json"));
  const { base: base3, server: server3, sockets: sockets3 } = await startTestServer(registry3, jobs);

  await registry3.set({ name: "cmd-node", url: `http://127.0.0.1:${cmdAddr.port}`, type: "runner" });

  const dispatchRes = await fetch(`${base3}/gateway/dispatch`, {
    method: "POST",
    headers: { "content-type": "application/json", connection: "close" },
    body: JSON.stringify({ nodeName: "cmd-node", command: "echo", args: { msg: "async" } }),
  });
  assert.equal(dispatchRes.status, 202);
  const dispatchBody = await dispatchRes.json();
  assert.ok(dispatchBody.jobId);
  assert.equal(dispatchBody.status, "pending");

  // Poll until job completes (max ~500ms)
  let job;
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 50));
    const jobRes = await fetch(`${base3}/jobs/${dispatchBody.jobId}`, { headers: { connection: "close" } });
    const jobBody = await jobRes.json();
    if (jobBody.job.status === "success" || jobBody.job.status === "error") {
      job = jobBody.job;
      break;
    }
  }
  assert.ok(job, "job did not complete in time");
  assert.equal(job.status, "success");

  // GET /jobs lists all
  const jobsRes = await fetch(`${base3}/jobs`, { headers: { connection: "close" } });
  const jobsBody = await jobsRes.json();
  assert.equal(jobsBody.ok, true);
  assert.ok(jobsBody.jobs.length >= 1);

  // GET /jobs/:id — not found
  const missingJobRes = await fetch(`${base3}/jobs/00000000-0000-0000-0000-000000000000`, { headers: { connection: "close" } });
  assert.equal(missingJobRes.status, 404);

  await stopServer(server3, sockets3);
  await new Promise<void>((resolve) => cmdServer.close(() => resolve()));
  for (const s of cmdSockets) s.destroy();
  await stopServer(server2, sockets2);
}
