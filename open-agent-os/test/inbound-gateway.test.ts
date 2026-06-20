import assert from "node:assert";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { RemoteNodeRegistry } from "../src/cross-machine/nodes.js";
import { JobStore } from "../src/cross-machine/jobs.js";
import { InboundGatewayHandler, HQ_CAPABILITIES } from "../src/cross-machine/gateway.js";
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

export async function runInboundGatewayTests(): Promise<void> {
  const tmp = join(tmpdir(), "open-agent-os-test", "gateway");
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });

  // --- InboundGatewayHandler unit tests (no HTTP) ---
  const registry = new RemoteNodeRegistry(join(tmp, "nodes.json"));
  const jobStore = new JobStore();

  const memoryResults = [
    { notePath: "notes/a.md", text: "chunk", type: "note", tags: "", source: "vault", updated: "2026-01-01", score: 0.9 },
  ];
  const modelOutput = { text: "Hello from model", modelUsed: "local-fast", backend: "ollama" };

  const handler = new InboundGatewayHandler({
    registry,
    jobStore,
    nodeCount: () => registry.list().then((n) => n.length),
    memoryServiceUrl: "http://mem-service:4000",
    memoryRetrieve: async (q, k) => memoryResults.slice(0, k),
    modelCall: async (model, _msgs, _opts) => ({ ...modelOutput, modelUsed: model }),
  });

  // status command
  const statusResult = await handler.handle({ command: "status", requestId: "r1" });
  assert.equal(statusResult.ok, true);
  assert.equal(statusResult.requestId, "r1");
  const statusData = statusResult.result as any;
  assert.equal(statusData.service, "open-agent-os");
  assert.ok(Array.isArray(statusData.capabilities));
  assert.ok(statusData.capabilities.includes("memory.retrieve"));
  assert.equal(statusData.memoryRetrieveAvailable, true);
  assert.equal(statusData.modelCallAvailable, true);
  assert.equal(statusData.nodeCount, 0);

  // node.list — empty
  const listResult = await handler.handle({ command: "node.list" });
  assert.equal(listResult.ok, true);
  assert.deepEqual(listResult.result, []);

  // node.list — with nodes
  await registry.set({ name: "worker", url: "http://127.0.0.1:0", type: "runner" });
  const listResult2 = await handler.handle({ command: "node.list" });
  assert.equal((listResult2.result as any[]).length, 1);

  // node.health — unknown node → error
  const healthErr = await handler.handle({ command: "node.health", args: { name: "no-such-node" } });
  assert.equal(healthErr.ok, false);
  assert.ok(healthErr.error?.includes("not found"));

  // node.health — missing args.name → error
  const healthNoName = await handler.handle({ command: "node.health", args: {} });
  assert.equal(healthNoName.ok, false);
  assert.ok(healthNoName.error?.includes("args.name is required"));

  // node.health — reachable node
  const { port: hp, server: hs, sockets: hss } = await startMock((_req, res) => {
    res.writeHead(200, { "content-type": "application/json", connection: "close" });
    res.end(JSON.stringify({ ok: true }));
  });
  await registry.set({ name: "worker", url: `http://127.0.0.1:${hp}`, type: "runner" });
  const healthOk = await handler.handle({ command: "node.health", args: { name: "worker" } });
  assert.equal(healthOk.ok, true);
  assert.equal((healthOk.result as any).reachable ?? (healthOk.result as any).ok, true);
  await stopMock(hs, hss);

  // memory.retrieve
  const memResult = await handler.handle({ command: "memory.retrieve", args: { query: "proposals", topK: 1 } });
  assert.equal(memResult.ok, true);
  assert.equal((memResult.result as any[]).length, 1);
  assert.equal((memResult.result as any[])[0].notePath, "notes/a.md");

  // memory.retrieve — missing query → error
  const memNoQ = await handler.handle({ command: "memory.retrieve", args: {} });
  assert.equal(memNoQ.ok, false);
  assert.ok(memNoQ.error?.includes("args.query is required"));

  // model.call
  const modelResult = await handler.handle({ command: "model.call", args: { model: "local-fast", messages: [{ role: "user", content: "hi" }] } });
  assert.equal(modelResult.ok, true);
  assert.equal((modelResult.result as any).modelUsed, "local-fast");

  // model.call — missing model → error
  const modelNoM = await handler.handle({ command: "model.call", args: { messages: [] } });
  assert.equal(modelNoM.ok, false);

  // model.call — messages not array → error
  const modelBadM = await handler.handle({ command: "model.call", args: { model: "x", messages: "not-array" } });
  assert.equal(modelBadM.ok, false);

  // dispatch
  const { port: dp, server: ds, sockets: dss } = await startMock(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    res.writeHead(200, { "content-type": "application/json", connection: "close" });
    res.end(JSON.stringify({ echoed: body.command }));
  });
  await registry.set({ name: "remote", url: `http://127.0.0.1:${dp}`, type: "runner" });
  const dispatchResult = await handler.handle({ command: "dispatch", args: { nodeName: "remote", command: "shell", args: { cmd: "whoami" } } });
  assert.equal(dispatchResult.ok, true);
  assert.equal((dispatchResult.result as any).result?.echoed, "shell");
  await stopMock(ds, dss);

  // dispatch — missing nodeName → error
  const dispatchNoNode = await handler.handle({ command: "dispatch", args: { command: "shell" } });
  assert.equal(dispatchNoNode.ok, false);

  // unknown command → error with suggestion
  const unknown = await handler.handle({ command: "not-a-command" });
  assert.equal(unknown.ok, false);
  assert.ok(unknown.error?.includes("Unknown command"));
  assert.ok(unknown.error?.includes("node.list"));

  // HQ_CAPABILITIES constant exported correctly
  assert.ok(HQ_CAPABILITIES.includes("status"));
  assert.ok(HQ_CAPABILITIES.includes("dispatch"));

  // --- memory.retrieve unavailable when not injected ---
  const handlerNoMem = new InboundGatewayHandler({
    registry,
    jobStore,
    nodeCount: () => Promise.resolve(0),
  });
  const noMemResult = await handlerNoMem.handle({ command: "memory.retrieve", args: { query: "test" } });
  assert.equal(noMemResult.ok, false);
  assert.ok(noMemResult.error?.includes("not available"));

  // model.call unavailable when not injected
  const noModelResult = await handlerNoMem.handle({ command: "model.call", args: { model: "x", messages: [] } });
  assert.equal(noModelResult.ok, false);
  assert.ok(noModelResult.error?.includes("not available"));

  // --- HTTP endpoint tests ---
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
    gatewayInboundKey: "hq-secret",
    router: { models: {}, openrouterKey: undefined, anthropicKey: undefined, ollamaUrl: "http://localhost:11434" },
  } as any;

  const srvRegistry = new RemoteNodeRegistry(config.remoteNodesPath);
  const srvJobs = new JobStore();
  const agentServer = createServer(srvRegistry, config, srvJobs, {
    memoryRetrieve: async (_q, _k) => memoryResults,
  });
  const agentSockets = trackSockets(agentServer);
  await new Promise<void>((resolve) => agentServer.listen(0, resolve));
  const base = `http://127.0.0.1:${(agentServer.address() as import("node:net").AddressInfo).port}`;

  // GET /health advertises gateway capabilities
  const healthRes = await fetch(`${base}/health`, { headers: { connection: "close" } });
  assert.equal(healthRes.status, 200);
  const healthBody = await healthRes.json();
  assert.equal(healthBody.gateway, true);
  assert.ok(Array.isArray(healthBody.capabilities));
  assert.ok(healthBody.capabilities.includes("status"));
  assert.equal(healthBody.gatewayAuthRequired, true);

  // POST /command — no auth → 401
  const noAuthRes = await fetch(`${base}/command`, {
    method: "POST",
    headers: { "content-type": "application/json", connection: "close" },
    body: JSON.stringify({ command: "status" }),
  });
  assert.equal(noAuthRes.status, 401);
  const noAuthBody = await noAuthRes.json();
  assert.equal(noAuthBody.ok, false);

  // POST /command — wrong key → 401
  const wrongKeyRes = await fetch(`${base}/command`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer wrong", connection: "close" },
    body: JSON.stringify({ command: "status" }),
  });
  assert.equal(wrongKeyRes.status, 401);

  // POST /command — correct key, status command
  const cmdRes = await fetch(`${base}/command`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer hq-secret", connection: "close" },
    body: JSON.stringify({ command: "status", requestId: "req-1" }),
  });
  assert.equal(cmdRes.status, 200);
  const cmdBody = await cmdRes.json();
  assert.equal(cmdBody.ok, true);
  assert.equal(cmdBody.requestId, "req-1");
  assert.equal(cmdBody.result.service, "open-agent-os");

  // POST /command — memory.retrieve (injected)
  const memHttpRes = await fetch(`${base}/command`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer hq-secret", connection: "close" },
    body: JSON.stringify({ command: "memory.retrieve", args: { query: "test" } }),
  });
  assert.equal(memHttpRes.status, 200);
  const memHttpBody = await memHttpRes.json();
  assert.equal(memHttpBody.ok, true);
  assert.ok(Array.isArray(memHttpBody.result));

  // POST /command — missing command field → 400
  const noCmd = await fetch(`${base}/command`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer hq-secret", connection: "close" },
    body: JSON.stringify({ args: {} }),
  });
  assert.equal(noCmd.status, 400);

  // POST /command — unknown command → 400 (ok: false)
  const unknownCmd = await fetch(`${base}/command`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer hq-secret", connection: "close" },
    body: JSON.stringify({ command: "not-real" }),
  });
  assert.equal(unknownCmd.status, 400);
  const unknownBody = await unknownCmd.json();
  assert.equal(unknownBody.ok, false);

  // POST /command — node.list
  const nodeListRes = await fetch(`${base}/command`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer hq-secret", connection: "close" },
    body: JSON.stringify({ command: "node.list" }),
  });
  assert.equal(nodeListRes.status, 200);
  const nodeListBody = await nodeListRes.json();
  assert.ok(Array.isArray(nodeListBody.result));

  await new Promise<void>((resolve) => agentServer.close(() => resolve()));
  for (const s of agentSockets) s.destroy();

  // --- No-key server: POST /command accepted without auth ---
  const openConfig = { ...config, gatewayInboundKey: undefined, remoteNodesPath: join(tmp, "open-nodes.json") };
  const openRegistry = new RemoteNodeRegistry(openConfig.remoteNodesPath);
  const openServer = createServer(openRegistry, openConfig, new JobStore());
  const openSockets = trackSockets(openServer);
  await new Promise<void>((resolve) => openServer.listen(0, resolve));
  const openBase = `http://127.0.0.1:${(openServer.address() as import("node:net").AddressInfo).port}`;

  const openRes = await fetch(`${openBase}/command`, {
    method: "POST",
    headers: { "content-type": "application/json", connection: "close" },
    body: JSON.stringify({ command: "status" }),
  });
  assert.equal(openRes.status, 200);
  const openBody = await openRes.json();
  assert.equal(openBody.ok, true);
  assert.equal(openBody.result.gatewayAuthRequired, false);

  const openHealthRes = await fetch(`${openBase}/health`, { headers: { connection: "close" } });
  const openHealthBody = await openHealthRes.json();
  assert.equal(openHealthBody.gatewayAuthRequired, false);

  await new Promise<void>((resolve) => openServer.close(() => resolve()));
  for (const s of openSockets) s.destroy();
}
